// Server-Functions für das Kanban-Modul "Aufgaben" (Phase 1, manager-facing).
//
// Schreibvorgänge laufen ausschließlich über die geprüften RPCs in der DB
// (create_task / set_task_status / reassign_task / update_task / archive_task);
// hier wird nach `loadAdminCaller([manager,admin])` der RPC via service_role-
// Client aufgerufen und danach ein audit_log-Eintrag geschrieben (Pattern aus
// `src/lib/admin/skills.functions.ts`). KEIN direkter UPDATE/INSERT auf tasks.
//
// Lesen passiert NICHT hier — Komponenten lesen mit dem User-Client (RLS).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "@/lib/admin/admin-context";
import { runGuarded } from "@/lib/admin/admin-call";
import { writeAuditLog } from "@/lib/admin/audit";
import { TASK_CATEGORIES, TASK_STATUSES, type Task } from "./types";

const ALLOWED: readonly ("admin" | "manager")[] = ["admin", "manager"] as const;

const taskCategoryEnum = z.enum(
  TASK_CATEGORIES as unknown as [string, ...string[]],
) as unknown as z.ZodType<(typeof TASK_CATEGORIES)[number]>;

const taskStatusEnum = z.enum(
  TASK_STATUSES as unknown as [string, ...string[]],
) as unknown as z.ZodType<(typeof TASK_STATUSES)[number]>;

async function audit(
  caller: { organizationId: string; userId: string; staffId: string | null },
  action: string,
  entityId: string,
  meta: Record<string, unknown>,
) {
  await writeAuditLog({
    organizationId: caller.organizationId,
    actorUserId: caller.userId,
    actorStaffId: caller.staffId,
    action,
    entity: "task",
    entityId,
    meta,
  });
}

export const createTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        locationId: z.string().uuid(),
        title: z.string().trim().min(1).max(200),
        description: z.string().trim().max(4000).nullable().optional(),
        category: taskCategoryEnum,
        priority: z.number().int().min(0).max(3).default(0),
        dueAt: z.string().datetime().nullable().optional(),
        assigneeStaffId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ALLOWED);
    return runGuarded(
      caller.role,
      "manager",
      (entry) => audit(caller, entry.action, entry.entityId ?? "", entry.meta ?? {}),
      async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row, error } = await supabaseAdmin.rpc("create_task", {
          p_location_id: data.locationId,
          p_title: data.title,
          p_description: data.description ?? "",
          p_category: data.category,
          p_priority: data.priority,
          p_due_at: data.dueAt ?? undefined,
          p_assignee_staff_id: data.assigneeStaffId ?? undefined,
        });
        if (error) throw error;
        const task = row as unknown as Task;
        return {
          result: task,
          audit: {
            action: "task.created",
            entity: "task",
            entityId: task.id,
            meta: {
              locationId: task.location_id,
              category: task.category,
              priority: task.priority,
              assigneeStaffId: task.assignee_staff_id,
              dueAt: task.due_at,
            },
          },
        };
      },
    );
  });

export const setTaskStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        taskId: z.string().uuid(),
        status: taskStatusEnum,
        sortOrder: z.number().finite().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ALLOWED);
    return runGuarded(
      caller.role,
      "manager",
      (entry) => audit(caller, entry.action, entry.entityId ?? "", entry.meta ?? {}),
      async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row, error } = await supabaseAdmin.rpc("set_task_status", {
          p_task_id: data.taskId,
          p_new_status: data.status,
          p_sort_order: data.sortOrder ?? undefined,
        });
        if (error) throw error;
        const task = row as unknown as Task;
        return {
          result: task,
          audit: {
            action: "task.status_changed",
            entity: "task",
            entityId: task.id,
            meta: { status: task.status, sortOrder: task.sort_order },
          },
        };
      },
    );
  });

export const reassignTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        taskId: z.string().uuid(),
        newAssigneeStaffId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ALLOWED);
    return runGuarded(
      caller.role,
      "manager",
      (entry) => audit(caller, entry.action, entry.entityId ?? "", entry.meta ?? {}),
      async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row, error } = await supabaseAdmin.rpc("reassign_task", {
          p_task_id: data.taskId,
          p_new_assignee_staff_id: data.newAssigneeStaffId,
        });
        if (error) throw error;
        const task = row as unknown as Task;
        return {
          result: task,
          audit: {
            action: "task.reassigned",
            entity: "task",
            entityId: task.id,
            meta: { assigneeStaffId: task.assignee_staff_id },
          },
        };
      },
    );
  });

export const updateTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        taskId: z.string().uuid(),
        title: z.string().trim().min(1).max(200),
        description: z.string().trim().max(4000).nullable().optional(),
        priority: z.number().int().min(0).max(3),
        dueAt: z.string().datetime().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ALLOWED);
    return runGuarded(
      caller.role,
      "manager",
      (entry) => audit(caller, entry.action, entry.entityId ?? "", entry.meta ?? {}),
      async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row, error } = await supabaseAdmin.rpc("update_task", {
          p_task_id: data.taskId,
          p_title: data.title,
          p_description: data.description ?? "",
          p_priority: data.priority,
          // p_due_at ist im PG-Funktionssignatur kein DEFAULT-Parameter,
          // akzeptiert aber NULL → generierter Typ ist `string`, Runtime nullable.
          p_due_at: (data.dueAt ?? null) as unknown as string,
        });
        if (error) throw error;
        const task = row as unknown as Task;
        return {
          result: task,
          audit: {
            action: "task.updated",
            entity: "task",
            entityId: task.id,
            meta: { priority: task.priority, dueAt: task.due_at },
          },
        };
      },
    );
  });

export const archiveTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ taskId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // Archivieren ist Admin-Default; loadAdminCaller akzeptiert manager+ — die
    // eigentliche Permission-Prüfung (`tasks.delete`) übernimmt die RPC.
    const caller = await loadAdminCaller(context.supabase, context.userId, ALLOWED);
    return runGuarded(
      caller.role,
      "manager",
      (entry) => audit(caller, entry.action, entry.entityId ?? "", entry.meta ?? {}),
      async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row, error } = await supabaseAdmin.rpc("archive_task", {
          p_task_id: data.taskId,
        });
        if (error) throw error;
        const task = row as unknown as Task;
        return {
          result: task,
          audit: {
            action: "task.archived",
            entity: "task",
            entityId: task.id,
            meta: { archivedAt: task.archived_at },
          },
        };
      },
    );
  });