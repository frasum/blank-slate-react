// BFIX2 — PostgREST-Pagination-Helfer.
//
// Supabase/PostgREST kappt eine Ergebnismenge per Default bei 1000 Zeilen.
// `selectAllPaged` ruft eine gebaute Query mehrfach mit `.range(from, to)`
// auf und sammelt alle Seiten, bis eine Seite weniger als `pageSize`
// Zeilen liefert. `buildQuery` MUSS bei jedem Aufruf eine frische Query
// zurückgeben (Filter/ORDER BY unverändert, ohne `.range()`). Für
// deterministische Paginierung braucht die Query ein stabiles ORDER BY —
// mindestens `id` als Tiebreaker.

export type PagedQuery<T> = {
  range: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
};

export async function selectAllPaged<T>(
  buildQuery: (from: number, to: number) => PagedQuery<T>,
  pageSize = 1000,
): Promise<T[]> {
  if (pageSize <= 0) throw new Error("pageSize muss > 0 sein.");
  const out: T[] = [];
  let from = 0;
  // Sicherheitsnetz gegen Endlos-Schleifen bei fehlerhaftem buildQuery.
  const hardCapPages = 1000;
  for (let page = 0; page < hardCapPages; page += 1) {
    const to = from + pageSize - 1;
    const { data, error } = await buildQuery(from, to).range(from, to);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    if (rows.length > 0) out.push(...rows);
    if (rows.length < pageSize) return out;
    from += pageSize;
  }
  throw new Error(
    `selectAllPaged: Hard-Cap von ${hardCapPages} Seiten erreicht (pageSize=${pageSize}).`,
  );
}
