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
//   * `finalize-confirm-button` — Bestätigen im Dialog (im Warn-Zustand
//     zusätzlich `data-state="warning"`)
//   * `finalize-cancel-button`  — Abbrechen im Dialog
//   * `session-status-badge`    — Statusanzeige (Attribut `data-status`)
//
// P2h: Die Pool-Warnung läuft inline im Bestätigungs-Dialog — kein
// `window.confirm` mehr. E2E-Interaktionen ausschließlich über testids.

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
    await page.addInitScript(() => {
      window.print = () => {};
    });

    await loginAsAdmin(page, seed);
    await openKasseForSeed(page);

    await expect(page.getByTestId("session-status-badge")).toHaveAttribute("data-status", "open");

    await page.getByTestId("finalize-print-button").click();
    await page.getByTestId("finalize-confirm-button").click();

    await expect(page.getByTestId("session-status-badge")).toHaveAttribute(
      "data-status",
      /finalized|locked/,
      { timeout: 20_000 },
    );

    // Zweiter Klick: im Status finalized/locked öffnet der Button keinen
    // Dialog mehr, sondern druckt nur. Badge bleibt stabil.
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

    // Runde 1: Dialog öffnen → Bestätigen → Server wirft Pool-Warnung →
    // Dialog wechselt in Warn-Zustand → Abbrechen. Session bleibt offen.
    await page.getByTestId("finalize-print-button").click();
    await page.getByTestId("finalize-confirm-button").click();
    const confirmBtn = page.getByTestId("finalize-confirm-button");
    await expect(confirmBtn).toHaveAttribute("data-state", "warning", { timeout: 10_000 });
    await expect(page.getByTestId("finalize-warn-message")).toContainText(/anrechenbare Stunden/);
    await page.getByTestId("finalize-cancel-button").click();
    await expect(page.getByTestId("session-status-badge")).toHaveAttribute("data-status", "open");

    // Runde 2: Dialog erneut öffnen → Bestätigen → Warn-Zustand →
    // „Trotzdem finalisieren" sendet `confirmPoolWarning: true`.
    await page.getByTestId("finalize-print-button").click();
    await page.getByTestId("finalize-confirm-button").click();
    await expect(page.getByTestId("finalize-confirm-button")).toHaveAttribute(
      "data-state",
      "warning",
      { timeout: 10_000 },
    );
    await page.getByTestId("finalize-confirm-button").click();

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
    await page.getByTestId("finalize-confirm-button").click();
    await expect(page.getByTestId("session-status-badge")).toHaveAttribute(
      "data-status",
      /finalized|locked/,
      { timeout: 20_000 },
    );
  });
});
