// SM1 — Server-Functions für das Sofortmeldung-Cockpit.
//
// Alle admin-gated. Schreibende Funktionen laufen über runGuarded + writeAuditLog.
// Meta enthält absichtlich KEINE Meldedaten (keine SV-Nummern etc. im Audit).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "@/lib/admin/admin-context";
import { runGuarded } from "@/lib/admin/admin-call";
import { makeAuditWriter } from "@/lib/admin/audit";
import {
  buildSvNetDataBlock,
  labelForField,
  sofortmeldungMissingFields,
  sofortmeldungStatus,
  type SofortmeldungStatus,
} from "./sofortmeldung-rules";

export type SofortmeldungOverviewRow = {
  staffId: string;
  firstName: string;
  lastName: string;
  displayName: string;
  status: SofortmeldungStatus;
  missingCount: number;
  required: boolean;
  reportedAt: string | null;
};

export type SofortmeldungDetail = {
  staffId: string;
  firstName: string;
  lastName: string;
  displayName: string;
  required: boolean;
  reportedAt: string | null;
  reportedByName: string | null;
  note: string | null;
  status: SofortmeldungStatus;
  missingFields: { key: string; label: string }[];
  dataBlock: { label: string; value: string }[];
  betriebsnummer: string | null;
};

export const getSofortmeldungOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SofortmeldungOverviewRow[]> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: staffRows, error: sErr } = await supabaseAdmin
      .from("staff")
      .select("id, first_name, last_name, display_name")
      .eq("organization_id", caller.organizationId)
      .eq("is_active", true)
      .order("display_name");
    if (sErr) throw sErr;
    const staffIds = (staffRows ?? []).map((s) => s.id);
    if (staffIds.length === 0) return [];

    const [detailsRes, smRes] = await Promise.all([
      supabaseAdmin
        .from("staff_personal_details")
        .select(
          "staff_id, date_of_birth, employment_start_date, social_security_number, place_of_birth, nationality",
        )
        .in("staff_id", staffIds),
      supabaseAdmin
        .from("sofortmeldung")
        .select("staff_id, required, reported_at")
        .in("staff_id", staffIds),
    ]);
    if (detailsRes.error) throw detailsRes.error;
    if (smRes.error) throw smRes.error;

    const detailsBy = new Map(detailsRes.data?.map((d) => [d.staff_id, d]) ?? []);
    const smBy = new Map(smRes.data?.map((r) => [r.staff_id, r]) ?? []);

    return (staffRows ?? []).map((s) => {
      const d = detailsBy.get(s.id) ?? null;
      const sm = smBy.get(s.id);
      const required = sm?.required ?? true;
      const reportedAt = sm?.reported_at ?? null;
      const missing = sofortmeldungMissingFields(
        { first_name: s.first_name, last_name: s.last_name },
        d,
      );
      const status = sofortmeldungStatus({
        required,
        missingFields: missing,
        reportedAt,
      });
      return {
        staffId: s.id,
        firstName: s.first_name,
        lastName: s.last_name,
        displayName: s.display_name,
        status,
        missingCount: missing.length,
        required,
        reportedAt,
      };
    });
  });

export const getSofortmeldungDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ staffId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<SofortmeldungDetail> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: staff, error: sErr } = await supabaseAdmin
      .from("staff")
      .select("id, first_name, last_name, display_name")
      .eq("id", data.staffId)
      .eq("organization_id", caller.organizationId)
      .maybeSingle();
    if (sErr) throw sErr;
    if (!staff) throw new Error("Mitarbeiter nicht gefunden.");

    const [detailsRes, smRes, settingsRes] = await Promise.all([
      supabaseAdmin
        .from("staff_personal_details")
        .select(
          "date_of_birth, employment_start_date, social_security_number, place_of_birth, nationality, health_insurance",
        )
        .eq("staff_id", data.staffId)
        .maybeSingle(),
      supabaseAdmin
        .from("sofortmeldung")
        .select("required, reported_at, reported_by, note")
        .eq("staff_id", data.staffId)
        .maybeSingle(),
      supabaseAdmin
        .from("organization_settings")
        .select("betriebsnummer")
        .eq("organization_id", caller.organizationId)
        .maybeSingle(),
    ]);
    if (detailsRes.error) throw detailsRes.error;
    if (smRes.error) throw smRes.error;
    if (settingsRes.error) throw settingsRes.error;

    let reportedByName: string | null = null;
    if (smRes.data?.reported_by) {
      const { data: r } = await supabaseAdmin
        .from("staff")
        .select("display_name")
        .eq("id", smRes.data.reported_by)
        .maybeSingle();
      reportedByName = r?.display_name ?? null;
    }

    const staffLite = { first_name: staff.first_name, last_name: staff.last_name };
    const missing = sofortmeldungMissingFields(staffLite, detailsRes.data ?? null);
    const required = smRes.data?.required ?? true;
    const reportedAt = smRes.data?.reported_at ?? null;
    const status = sofortmeldungStatus({
      required,
      missingFields: missing,
      reportedAt,
    });
    const betriebsnummer = settingsRes.data?.betriebsnummer ?? null;

    return {
      staffId: staff.id,
      firstName: staff.first_name,
      lastName: staff.last_name,
      displayName: staff.display_name,
      required,
      reportedAt,
      reportedByName,
      note: smRes.data?.note ?? null,
      status,
      missingFields: missing.map((k) => ({ key: k, label: labelForField(k) })),
      dataBlock: buildSvNetDataBlock(staffLite, detailsRes.data ?? null, betriebsnummer),
      betriebsnummer,
    };
  });

export const markSofortmeldungReported = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ staffId: z.string().uuid(), note: z.string().trim().max(500).optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    const write = makeAuditWriter(caller);
    return runGuarded(caller.role, "admin", write, async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const { data: staff, error: sErr } = await supabaseAdmin
        .from("staff")
        .select("id, first_name, last_name")
        .eq("id", data.staffId)
        .eq("organization_id", caller.organizationId)
        .maybeSingle();
      if (sErr) throw sErr;
      if (!staff) throw new Error("Mitarbeiter nicht gefunden.");

      const { data: existing } = await supabaseAdmin
        .from("sofortmeldung")
        .select("required, reported_at")
        .eq("staff_id", data.staffId)
        .maybeSingle();

      if (existing?.reported_at) throw new Error("Bereits als gemeldet markiert.");
      const required = existing?.required ?? true;
      if (!required)
        throw new Error("Für diesen Mitarbeiter ist keine Sofortmeldung erforderlich.");

      const { data: details } = await supabaseAdmin
        .from("staff_personal_details")
        .select(
          "date_of_birth, employment_start_date, social_security_number, place_of_birth, nationality",
        )
        .eq("staff_id", data.staffId)
        .maybeSingle();
      const missing = sofortmeldungMissingFields(
        { first_name: staff.first_name, last_name: staff.last_name },
        details ?? null,
      );
      if (missing.length > 0) {
        throw new Error("Sofortmeldung ist unvollständig — bitte zuerst Daten ergänzen.");
      }

      const reportedAt = new Date().toISOString();
      const { error: uErr } = await supabaseAdmin.from("sofortmeldung").upsert(
        {
          organization_id: caller.organizationId,
          staff_id: data.staffId,
          required: true,
          reported_at: reportedAt,
          reported_by: caller.staffId,
          note: data.note ?? null,
        },
        { onConflict: "staff_id" },
      );
      if (uErr) throw uErr;

      return {
        result: { ok: true as const, reportedAt },
        audit: {
          action: "sofortmeldung.reported",
          entity: "sofortmeldung",
          entityId: data.staffId,
          meta: { staffId: data.staffId },
        },
      };
    });
  });

export const setSofortmeldungRequired = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        staffId: z.string().uuid(),
        required: z.boolean(),
        note: z.string().trim().max(500).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    const write = makeAuditWriter(caller);
    return runGuarded(caller.role, "admin", write, async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: staff } = await supabaseAdmin
        .from("staff")
        .select("id")
        .eq("id", data.staffId)
        .eq("organization_id", caller.organizationId)
        .maybeSingle();
      if (!staff) throw new Error("Mitarbeiter nicht gefunden.");
      const { data: existing } = await supabaseAdmin
        .from("sofortmeldung")
        .select("required")
        .eq("staff_id", data.staffId)
        .maybeSingle();
      const before = existing?.required ?? true;
      const { error } = await supabaseAdmin.from("sofortmeldung").upsert(
        {
          organization_id: caller.organizationId,
          staff_id: data.staffId,
          required: data.required,
          note: data.note ?? null,
        },
        { onConflict: "staff_id" },
      );
      if (error) throw error;
      return {
        result: { ok: true as const },
        audit: {
          action: "sofortmeldung.required_changed",
          entity: "sofortmeldung",
          entityId: data.staffId,
          meta: { staffId: data.staffId, before, after: data.required },
        },
      };
    });
  });

export const setBetriebsnummer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        betriebsnummer: z
          .string()
          .trim()
          .max(32)
          .nullable()
          .or(z.literal("").transform(() => null)),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    const write = makeAuditWriter(caller);
    return runGuarded(caller.role, "admin", write, async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin
        .from("organization_settings")
        .update({ betriebsnummer: data.betriebsnummer })
        .eq("organization_id", caller.organizationId);
      if (error) throw error;
      return {
        result: { ok: true as const },
        audit: {
          action: "settings.betriebsnummer_changed",
          entity: "organization_settings",
          entityId: caller.organizationId,
          meta: { hasValue: !!data.betriebsnummer },
        },
      };
    });
  });
