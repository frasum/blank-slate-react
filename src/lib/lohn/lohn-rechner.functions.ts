// 2c — Verdrahtung: Periodenaggregation + Stammdaten -> Lohn-Kern.
//
// Zustandslose, admin-gated Serverfunktion: liest nur, schreibt nichts,
// kein audit_log. Gibt Zeilen, Person und das volle Ergebnis zurück,
// damit eine spätere UI Zeile für Zeile gegen edlohn vergleichen kann.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "@/lib/admin/admin-context";
import { assertPermission } from "@/lib/admin/admin-call";
import { aggregateSfnPeriod } from "./lohn-period.functions";
import { staffDetailsToPerson } from "./person-mapping";
import { berechneLohn } from "./lohn-core";
import type { Entgeltzeile } from "./types";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const berechneLohnFuerMitarbeiter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        staffId: z.string().uuid(),
        fromDate: z.string().regex(dateRegex),
        toDate: z.string().regex(dateRegex),
        mode: z.enum(["simple", "extended"]).default("simple"),
        zusatzZeilen: z
          .array(
            z.object({
              kategorie: z.enum([
                "sachbezug_frei",
                "mahlzeiten_paust",
                "abzug",
                "einmalbezug",
                "zeitlohn",
                "zuschlag_frei",
              ]),
              bezeichnung: z.string().optional(),
              betragCent: z.number().int(),
            }),
          )
          .default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, "payroll.calc.run");
    const caller = await loadAdminCaller(context.supabase, context.userId, ["admin", "payroll"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: staff, error: staffErr } = await supabaseAdmin
      .from("staff")
      .select("id")
      .eq("id", data.staffId)
      .eq("organization_id", caller.organizationId)
      .maybeSingle();
    if (staffErr) throw staffErr;
    if (!staff) throw new Error("Mitarbeiter nicht in dieser Organisation.");

    const sfn = await aggregateSfnPeriod(supabaseAdmin, data.staffId, data.fromDate, data.toDate);
    const chosen = data.mode === "extended" ? sfn.extended : sfn.simple;

    const { data: details, error: detErr } = await supabaseAdmin
      .from("staff_personal_details")
      .select(
        "tax_class, child_tax_allowances, kk_zusatzbeitrag, church_tax_liable, children_count, has_parent_status, is_minijob, date_of_birth",
      )
      .eq("staff_id", data.staffId)
      .maybeSingle();
    if (detErr) throw detErr;
    if (!details) throw new Error("Keine Personaldaten für diesen Mitarbeiter.");

    const person = staffDetailsToPerson(details, data.toDate);

    const zeitlohnCent = Math.round(sfn.totalHours * sfn.hourlyRateCents);
    const zeilen: Entgeltzeile[] = [
      {
        kategorie: "zeitlohn",
        bezeichnung: "Zeitlohn (Stunden × Satz)",
        betragCent: zeitlohnCent,
        stunden: sfn.totalHours,
        satzCent: sfn.hourlyRateCents,
      },
      {
        kategorie: "zuschlag_frei",
        bezeichnung: `SFN-Zuschläge (${data.mode})`,
        betragCent: chosen.zuschlagCents,
      },
      ...data.zusatzZeilen,
    ];

    const ergebnis = berechneLohn({ person, zeilen });

    return {
      mode: data.mode,
      totalHours: sfn.totalHours,
      hourlyRateCents: sfn.hourlyRateCents,
      entryCount: sfn.entryCount,
      zuschlagCents: chosen.zuschlagCents,
      buckets: chosen,
      zeilen,
      person,
      ergebnis,
    };
  });
