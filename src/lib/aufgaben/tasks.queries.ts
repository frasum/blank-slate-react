// Lese-Hooks für das Kanban-Board. WICHTIG: liest mit dem User-Client
// (`supabase`), damit RLS greift — nicht `supabaseAdmin`. Manager sehen so
// nur Aufgaben ihrer Standorte (RLS-Policy `tasks_select_admin_or_manager`).

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  archiveTask,
  createTask,
  reassignTask,
  setTaskStatus,
  updateTask,
} from "./tasks.functions";
import type { Task } from "./types";

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
    mutationFn: (input: Parameters<typeof createTask>[0]["data"]) => fn({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: TASKS_QUERY_KEY(locationId) }),
  });
}

export function useSetTaskStatus(locationId: string | null) {
  const qc = useQueryClient();
  const fn = useServerFn(setTaskStatus);
  return useMutation({
    mutationFn: (input: Parameters<typeof setTaskStatus>[0]["data"]) => fn({ data: input }),
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
    mutationFn: (input: Parameters<typeof reassignTask>[0]["data"]) => fn({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: TASKS_QUERY_KEY(locationId) }),
  });
}

export function useUpdateTask(locationId: string | null) {
  const qc = useQueryClient();
  const fn = useServerFn(updateTask);
  return useMutation({
    mutationFn: (input: Parameters<typeof updateTask>[0]["data"]) => fn({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: TASKS_QUERY_KEY(locationId) }),
  });
}

export function useArchiveTask(locationId: string | null) {
  const qc = useQueryClient();
  const fn = useServerFn(archiveTask);
  return useMutation({
    mutationFn: (input: Parameters<typeof archiveTask>[0]["data"]) => fn({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: TASKS_QUERY_KEY(locationId) }),
  });
}