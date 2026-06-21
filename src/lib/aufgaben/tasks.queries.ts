// Lese-Hooks für das Kanban-Board. WICHTIG: liest mit dem User-Client
// (`supabase`), damit RLS greift — nicht `supabaseAdmin`. Manager sehen so
// nur Aufgaben ihrer Standorte (RLS-Policy `tasks_select_admin_or_manager`).

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  archiveTask,
  claimTask,
  createTask,
  listMyTaskLocations,
  listStaffForLocation,
  reassignTask,
  setTaskStatus,
  updateTask,
} from "./tasks.functions";
import type { Task, TaskStatus, TaskCategory } from "./types";

type CreateInput = {
  locationId: string;
  title: string;
  description?: string | null;
  category: TaskCategory;
  priority?: number;
  dueAt?: string | null;
  assigneeStaffId?: string | null;
};
type StatusInput = { taskId: string; status: TaskStatus; sortOrder?: number | null };
type ReassignInput = { taskId: string; newAssigneeStaffId: string };
type UpdateInput = {
  taskId: string;
  title: string;
  description?: string | null;
  priority: number;
  dueAt?: string | null;
};
type ArchiveInput = { taskId: string };
type ClaimInput = { taskId: string };

export const TASKS_QUERY_KEY = (locationId: string | null) =>
  ["tasks", "board", locationId] as const;

export function useBoardTasks(locationId: string | null) {
  return useQuery({
    queryKey: TASKS_QUERY_KEY(locationId),
    enabled: !!locationId,
    queryFn: async (): Promise<Task[]> => {
      if (!locationId) return [];
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("location_id", locationId)
        .is("archived_at", null)
        .order("status", { ascending: true })
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Task[];
    },
  });
}

export function useCreateTask(locationId: string | null) {
  const qc = useQueryClient();
  const fn = useServerFn(createTask);
  return useMutation({
    mutationFn: (input: CreateInput) => fn({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: TASKS_QUERY_KEY(locationId) }),
  });
}

export function useSetTaskStatus(locationId: string | null) {
  const qc = useQueryClient();
  const fn = useServerFn(setTaskStatus);
  return useMutation({
    mutationFn: (input: StatusInput) => fn({ data: input }),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: TASKS_QUERY_KEY(locationId) });
      const prev = qc.getQueryData<Task[]>(TASKS_QUERY_KEY(locationId));
      if (prev) {
        qc.setQueryData<Task[]>(
          TASKS_QUERY_KEY(locationId),
          prev.map((t) =>
            t.id === input.taskId
              ? { ...t, status: input.status, sort_order: input.sortOrder ?? t.sort_order }
              : t,
          ),
        );
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(TASKS_QUERY_KEY(locationId), ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: TASKS_QUERY_KEY(locationId) }),
  });
}

export function useReassignTask(locationId: string | null) {
  const qc = useQueryClient();
  const fn = useServerFn(reassignTask);
  return useMutation({
    mutationFn: (input: ReassignInput) => fn({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: TASKS_QUERY_KEY(locationId) }),
  });
}

export function useUpdateTask(locationId: string | null) {
  const qc = useQueryClient();
  const fn = useServerFn(updateTask);
  return useMutation({
    mutationFn: (input: UpdateInput) => fn({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: TASKS_QUERY_KEY(locationId) }),
  });
}

export function useArchiveTask(locationId: string | null) {
  const qc = useQueryClient();
  const fn = useServerFn(archiveTask);
  return useMutation({
    mutationFn: (input: ArchiveInput) => fn({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: TASKS_QUERY_KEY(locationId) }),
  });
}

export function useClaimTask(locationId: string | null) {
  const qc = useQueryClient();
  const fn = useServerFn(claimTask);
  return useMutation({
    mutationFn: (input: ClaimInput) => fn({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: TASKS_QUERY_KEY(locationId) }),
  });
}

export function useMyTaskLocations() {
  const fn = useServerFn(listMyTaskLocations);
  return useQuery({
    queryKey: ["tasks", "my-locations"],
    queryFn: () => fn(),
  });
}

export function useStaffForLocation(locationId: string | null) {
  const fn = useServerFn(listStaffForLocation);
  return useQuery({
    queryKey: ["tasks", "staff-for-location", locationId],
    enabled: !!locationId,
    queryFn: () => fn({ data: { locationId: locationId! } }),
  });
}
