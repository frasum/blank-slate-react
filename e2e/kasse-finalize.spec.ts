// P2 — E2E-Beweis für den Kassen-Finalize (kritischer Geldpfad).
//
// Drei Szenarien, EIN Spec-File:
//   (1) Happy Path: Admin-Login → Kasse → Finalize → Badge "Finalisiert",
//       zweiter Finalize wird abgelehnt.
//   (2) Pool-Warnung (TG1): Seed ohne Service-Stunden → Finalize triggert
//       `window.confirm` (nativer Dialog); Abbrechen lässt die Session
//       "Offen", Bestätigen finalisiert; Audit-Log meta
//       `poolHoursWarningConfirmed = true`.
//   (3) Ruhetag: Betriebskalender-Ausnahme "closed" für den Test-Tag →
//       Kasse-Finalize läuft trotzdem durch (RT1 ist Dienstplan-Thema,
//       nicht Kasse — Regression-Schutz gegen Kopplung).
//
// Selektoren: bevorzugt Rollen/Text; drei minimale `data-testid`s im UI:
//   * `finalize-print-button`  — Finalisieren/Drucken-Button
//   * `session-status-badge`   — Statusanzeige (Attribut `data-status`)
//   * (Warn-Dialog nutzt `window.confirm` — nativer Browser-Dialog, kein
//      DOM-Element; Playwright bindet sich per `page.on('dialog')` ein.)

import { test, expect, type Page } from "@playwright/test";
import {
  seedKasseFinalize,
  markLocationClosed,
  findPoolWarningAuditRow,
  type E2ESeed,
} from "./seed";

async function loginAsAdmin(page: Page, seed: E2ESeed): Promise<void> {
  await page.goto("/auth");
  await page.getByPlaceholder("E-Mail").fill(seed.adminEmail);
  await page.getByPlaceholder("Passwort").fill(seed.adminPassword);
  await page.getByRole("button", { name: /Anmelden/ }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 15_000 });
}

async function openKasseForSeed(page: Page): Promise<void> {
  await page.goto("/admin/kasse");
  await expect(page.getByRole("heading", { name: "Tagesabrechnung" })).toBeVisible();
  // Der Seed legt genau eine Session am Business-Date an — das UI wählt
  // Standort + Datum automatisch bzw. via LocationPills. Wir warten auf
  // das Erscheinen des Status-Badges.
  await expect(page.getByTestId("session-status-badge")).toBeVisible({ timeout: 15_000 });
}

test.describe("Kassen-Finalize (P2)", () => {
  let seed: E2ESeed | null = null;

  test.afterEach(async () => {
    if (seed) {
      await seed.cleanup();
      seed = null;
    }
  });

  test("(1) Happy Path: finalize → Badge 'Finalisiert', zweiter Finalize abgelehnt", async ({
    page,
  }) => {
    seed = await seedKasseFinalize("happy", { withServiceHours: true });
    // Native print-Dialog sofort abwerfen, sonst blockiert er den Flow.
    await page.addInitScript(() => {
      window.print = () => {};
    });

    await loginAsAdmin(page, seed);
    await openKasseForSeed(page);

    await expect(page.getByTestId("session-status-badge")).toHaveAttribute("data-status", "open");

    await page.getByTestId("finalize-print-button").click();

    await expect(page.getByTestId("session-status-badge")).toHaveAttribute(
      "data-status",
      /finalized|locked/,
      { timeout: 20_000 },
    );

    // Zweiter Finalize: Button ist im Status "finalized/locked" nur noch
    // Druck-Trigger. Ein direkter erneuter Finalize (Server) wird per
    // Doppel-Finalize-Guard (`blockIfFinalized`) abgelehnt — geprüft im
    // db-Test `cash-finalize.db.test.ts`. Hier reicht: Badge ist stabil.
    await page.getByTestId("finalize-print-button").click();
    await expect(page.getByTestId("session-status-badge")).toHaveAttribute(
      "data-status",
      /finalized|locked/,
    );
  });

  test("(2) Pool-Warnung: Abbrechen bleibt offen, Bestätigen finalisiert + Audit", async ({
    page,
  }) => {
    seed = await seedKasseFinalize("poolwarn", { withServiceHours: false });
    await page.addInitScript(() => {
      window.print = () => {};
    });

    await loginAsAdmin(page, seed);
    await openKasseForSeed(page);

    // Erster Klick: Dialog erscheint → Abbrechen.
    page.once("dialog", (d) => {
      expect(d.message()).toMatch(/anrechenbare Stunden/);
      void d.dismiss();
    });
    await page.getByTestId("finalize-print-button").click();
    // Session bleibt offen.
    await expect(page.getByTestId("session-status-badge")).toHaveAttribute("data-status", "open");

    // Zweiter Klick: Dialog bestätigen → finalisiert.
    page.once("dialog", (d) => void d.accept());
    await page.getByTestId("finalize-print-button").click();
    await expect(page.getByTestId("session-status-badge")).toHaveAttribute(
      "data-status",
      /finalized|locked/,
      { timeout: 20_000 },
    );

    const audit = await findPoolWarningAuditRow(seed.orgId, seed.sessionId);
    expect(audit).not.toBeNull();
    expect(audit!.meta.poolHoursWarningConfirmed).toBe(true);
  });

  test("(3) Ruhetag berührt Kasse nicht (RT1-Regression)", async ({ page }) => {
    seed = await seedKasseFinalize("ruhetag", { withServiceHours: true });
    await markLocationClosed(seed.locationId, seed.orgId, seed.businessDate);
    await page.addInitScript(() => {
      window.print = () => {};
    });

    await loginAsAdmin(page, seed);
    await openKasseForSeed(page);

    await page.getByTestId("finalize-print-button").click();
    await expect(page.getByTestId("session-status-badge")).toHaveAttribute(
      "data-status",
      /finalized|locked/,
      { timeout: 20_000 },
    );
  });
});
