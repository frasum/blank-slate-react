// R2 — Rezept-Editor für den Bestellung-Bereich.
//
// Präsentations- + Query-Schicht. Persistenz + Rechte-Check laufen in
// den R1-Server-Fns (recipes.functions.ts). Live-Kosten berechnet der
// Client mit dem SELBEN reinen Rechenkern wie der Server
// (`recipe-costing.ts`) — keine Formel-Duplikate in dieser Datei.

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtCents } from "@/lib/format";
import {
  listRecipes,
  getRecipe,
  upsertRecipe,
  deleteRecipe,
  setRecipeItems,
  setArticleContent,
  listRecipeArticleCandidates,
  linkSalesArticleRecipe,
  unlinkSalesArticleRecipe,
  type RecipeArticleCandidate,
  type RecipeCandidateBundle,
  type RecipeDetail,
  type RecipeKind,
  type RecipeListItem,
} from "@/lib/bestellung/recipes.functions";
import { costItemsCents, costRecipeCents, type RecipeUnit } from "@/lib/bestellung/recipe-costing";
import { listSalesArticles, type SalesArticle } from "@/lib/bestellung/sales-articles.functions";
import { wareneinsatzQuote, WE_GRUEN_BIS, WE_GELB_BIS } from "@/lib/bestellung/ek-linking";
import {
  buildCostingCtxFromBundle,
  costingErrorMessage,
  toCostingItems,
  type EditorItem,
} from "@/components/verkaufsartikel/recipe-editor-helpers";

// ---------------------------------------------------------------------------
// Haupt-Komponente
// ---------------------------------------------------------------------------

export function RezepteTab({
  locationId,
  initialCreateForSalesArticleId,
  onConsumedInitialCreate,
}: {
  locationId: string;
  initialCreateForSalesArticleId?: string | null;
  onConsumedInitialCreate?: () => void;
}) {
  const qc = useQueryClient();
  const callList = useServerFn(listRecipes);
  const callDelete = useServerFn(deleteRecipe);
  const callGet = useServerFn(getRecipe);
  const callUpsert = useServerFn(upsertRecipe);
  const callSetItems = useServerFn(setRecipeItems);
  const callCandidates = useServerFn(listRecipeArticleCandidates);
  const callSalesList = useServerFn(listSalesArticles);

  const recipesQ = useQuery({
    queryKey: ["recipes"],
    queryFn: () => callList({ data: {} }),
  });
  const candidatesQ = useQuery({
    queryKey: ["recipe-candidates"],
    queryFn: () => callCandidates(),
  });
  const salesQ = useQuery({
    queryKey: ["sales-articles", locationId],
    queryFn: () => callSalesList({ data: { locationId } }),
    enabled: !!locationId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["recipes"] });
    qc.invalidateQueries({ queryKey: ["recipe-candidates"] });
    qc.invalidateQueries({ queryKey: ["sales-articles"] });
  };

  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState<{
    kind: RecipeKind;
    preselectedSalesArticleId?: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // R2b — Einstieg von anderen Tabs: Vorauswahl eines Verkaufsartikels
  // öffnet den zweistufigen „+ Gericht"-Fluss direkt in Schritt 2.
  useEffect(() => {
    if (initialCreateForSalesArticleId) {
      setCreating({
        kind: "dish",
        preselectedSalesArticleId: initialCreateForSalesArticleId,
      });
      onConsumedInitialCreate?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCreateForSalesArticleId]);

  const rows = recipesQ.data ?? [];
  const dishes = rows.filter((r) => r.kind === "dish");
  const subs = rows.filter((r) => r.kind === "sub");

  // R2b — Verknüpfte Verkaufsartikel je Rezept, für die Untertitel in der Liste.
  const salesNamesByRecipe = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const s of salesQ.data ?? []) {
      if (!s.recipeId) continue;
      const list = m.get(s.recipeId) ?? [];
      list.push(s.name);
      m.set(s.recipeId, list);
    }
    return m;
  }, [salesQ.data]);

  const filterFn = (r: RecipeListItem) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return r.name.toLowerCase().includes(q);
  };

  const deleteMut = useMutation({
    mutationFn: (recipeId: string) => callDelete({ data: { recipeId } }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => setError(e.message),
  });

  async function duplicate(item: RecipeListItem) {
    setError(null);
    try {
      const detail = await callGet({ data: { recipeId: item.id } });
      const created = await callUpsert({
        data: {
          name: `${detail.name} (Kopie)`,
          kind: detail.kind,
          yieldQuantity: detail.yieldQuantity,
          yieldUnit: detail.yieldUnit,
          notes: detail.notes,
        },
      });
      if (detail.items.length > 0) {
        await callSetItems({
          data: {
            recipeId: created.id,
            items: detail.items.map((it) => ({
              articleId: it.articleId,
              subRecipeId: it.subRecipeId,
              quantity: it.quantity,
              unit: it.unit,
              lossPercent: it.lossPercent,
            })),
          },
        });
      }
      toast.success(`„${detail.name} (Kopie)" angelegt.`);
      invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Duplizieren fehlgeschlagen.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Rezepturen</h2>
          <p className="text-sm text-muted-foreground">
            Gerichte und Zwischenrezepte anlegen; EK wird beim „EKs neu berechnen" aus den Zutaten
            materialisiert.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setCreating({ kind: "dish" })}>+ Gericht</Button>
          <Button variant="outline" onClick={() => setCreating({ kind: "sub" })}>
            + Zwischenrezept
          </Button>
        </div>
      </div>

      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Suche nach Name …"
        className="w-64"
      />

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Fehler</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <RecipeListSection
        title="Gerichte"
        emptyLabel="Noch keine Gerichte angelegt."
        rows={dishes.filter(filterFn)}
        usageLabelFn={(n) => `${n} Verkaufsartikel`}
        subtitleFn={(r) => salesNamesByRecipe.get(r.id) ?? []}
        onOpen={setOpenId}
        onDuplicate={duplicate}
        onDelete={(id) => deleteMut.mutate(id)}
      />

      <RecipeListSection
        title="Zwischenrezepte"
        emptyLabel="Noch keine Zwischenrezepte."
        rows={subs.filter(filterFn)}
        usageLabelFn={(n) => `verwendet in ${n} Rezepten`}
        subtitleFn={() => []}
        onOpen={setOpenId}
        onDuplicate={duplicate}
        onDelete={(id) => deleteMut.mutate(id)}
      />

      {creating && (
        <NewRecipeDialog
          kind={creating.kind}
          preselectedSalesArticleId={creating.preselectedSalesArticleId ?? null}
          salesArticles={salesQ.data ?? []}
          onClose={() => setCreating(null)}
          onCreated={(id) => {
            setCreating(null);
            invalidate();
            setOpenId(id);
          }}
        />
      )}

      {openId && candidatesQ.data && (
        <RecipeEditorDialog
          recipeId={openId}
          bundle={candidatesQ.data}
          salesArticles={salesQ.data ?? []}
          onClose={() => setOpenId(null)}
          onSaved={() => invalidate()}
        />
      )}
    </div>
  );
}

function RecipeListSection(props: {
  title: string;
  emptyLabel: string;
  rows: RecipeListItem[];
  usageLabelFn: (n: number) => string;
  subtitleFn: (r: RecipeListItem) => string[];
  onOpen: (id: string) => void;
  onDuplicate: (r: RecipeListItem) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">{props.title}</h3>
      {props.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{props.emptyLabel}</p>
      ) : (
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="w-40">Ausbeute</TableHead>
                <TableHead className="w-40">Verwendung</TableHead>
                <TableHead className="w-56 text-right">Aktion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {props.rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    <button
                      type="button"
                      className="text-left hover:underline"
                      onClick={() => props.onOpen(r.id)}
                    >
                      {r.name}
                    </button>
                    {(() => {
                      const names = props.subtitleFn(r);
                      if (names.length === 0) return null;
                      return (
                        <div className="text-xs text-muted-foreground" title={names.join(", ")}>
                          Verkaufsartikel: {names.slice(0, 2).join(", ")}
                          {names.length > 2 ? ` (+${names.length - 2})` : ""}
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.yieldQuantity !== null && r.yieldUnit
                      ? `${r.yieldQuantity} ${r.yieldUnit}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {props.usageLabelFn(r.usageCount)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => props.onOpen(r.id)}>
                        Öffnen
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => props.onDuplicate(r)}>
                        Duplizieren
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => {
                          if (
                            window.confirm(
                              `„${r.name}" wirklich löschen? Wird bei Verwendung abgelehnt.`,
                            )
                          ) {
                            props.onDelete(r.id);
                          }
                        }}
                      >
                        Löschen
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialog: Neues Rezept
// ---------------------------------------------------------------------------

function NewRecipeDialog(props: {
  kind: RecipeKind;
  preselectedSalesArticleId?: string | null;
  salesArticles: SalesArticle[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const callUpsert = useServerFn(upsertRecipe);
  const callLink = useServerFn(linkSalesArticleRecipe);

  // Zweistufig nur für Gerichte. Zwischenrezepte gehen direkt in die Form.
  const preselected = useMemo(() => {
    if (props.kind !== "dish") return null;
    if (!props.preselectedSalesArticleId) return null;
    return props.salesArticles.find((s) => s.id === props.preselectedSalesArticleId) ?? null;
  }, [props.kind, props.preselectedSalesArticleId, props.salesArticles]);

  const [step, setStep] = useState<"pick" | "form">(
    props.kind === "sub" || preselected ? "form" : "pick",
  );
  const [salesArticle, setSalesArticle] = useState<SalesArticle | null>(preselected);
  const [name, setName] = useState(preselected?.name ?? "");
  const [yieldQty, setYieldQty] = useState<string>("");
  const [yieldUnit, setYieldUnit] = useState<RecipeUnit>("ml");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");

  // Auswahl-Listen für Schritt 1
  const { eligible, blocked } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const el: SalesArticle[] = [];
    const bl: SalesArticle[] = [];
    for (const s of props.salesArticles) {
      if (!s.isActive) continue;
      if (s.recipeId !== null) continue; // hat schon ein Rezept
      if (q && !s.name.toLowerCase().includes(q)) continue;
      if (s.ekSourceArticleId !== null) bl.push(s);
      else el.push(s);
    }
    return { eligible: el.slice(0, 30), blocked: bl.slice(0, 10) };
  }, [props.salesArticles, query]);

  function chooseArticle(s: SalesArticle) {
    setSalesArticle(s);
    setName(s.name);
    setStep("form");
  }

  function chooseStandalone() {
    setSalesArticle(null);
    setStep("form");
  }

  async function save() {
    setError(null);
    if (!name.trim()) {
      setError("Name ist Pflicht.");
      return;
    }
    if (props.kind === "sub") {
      const q = Number(yieldQty.replace(",", "."));
      if (!Number.isFinite(q) || q <= 0) {
        setError("Ausbeute-Menge muss > 0 sein.");
        return;
      }
    }
    setSaving(true);
    try {
      const res = await callUpsert({
        data: {
          name: name.trim(),
          kind: props.kind,
          yieldQuantity: props.kind === "sub" ? Number(yieldQty.replace(",", ".")) : null,
          yieldUnit: props.kind === "sub" ? yieldUnit : null,
          notes: null,
        },
      });
      if (props.kind === "dish" && salesArticle) {
        try {
          await callLink({
            data: { salesArticleId: salesArticle.id, recipeId: res.id },
          });
          toast.success(`Rezept angelegt und mit „${salesArticle.name}" verknüpft.`);
        } catch (e) {
          // Rezept ist bereits angelegt — Fehler melden, aber Editor öffnen.
          toast.error(
            e instanceof Error
              ? `Rezept angelegt, Verknüpfung fehlgeschlagen: ${e.message}`
              : "Verknüpfung fehlgeschlagen.",
          );
        }
      }
      props.onCreated(res.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => (o ? undefined : props.onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Neues {props.kind === "dish" ? "Gericht" : "Zwischenrezept"}
            {step === "pick" ? " — Verkaufsartikel wählen" : ""}
          </DialogTitle>
          <DialogDescription>
            {props.kind === "sub"
              ? "Zwischenrezepte (z. B. Currypaste, Fond) brauchen eine Ausbeute — daraus ergibt sich der Preis je Basiseinheit für übergeordnete Rezepte."
              : step === "pick"
                ? "Für welchen Verkaufsartikel? Das Rezept wird sofort verknüpft, damit VK und WE-% ab der ersten Zutat sichtbar sind."
                : "Gerichte werden mit Verkaufsartikeln verknüpft; ihre Kosten ergeben den EK."}
          </DialogDescription>
        </DialogHeader>

        {step === "pick" ? (
          <div className="space-y-3">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Verkaufsartikel suchen …"
              autoFocus
            />
            <div className="max-h-72 overflow-y-auto rounded-md border border-border">
              {eligible.length === 0 && blocked.length === 0 ? (
                <p className="p-2 text-xs text-muted-foreground">Keine Treffer.</p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {eligible.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => chooseArticle(s)}
                        className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-muted"
                      >
                        <span>
                          <span className="font-medium">{s.name}</span>
                          {s.hauptgruppe && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {s.hauptgruppe}
                              {s.untergruppe ? ` · ${s.untergruppe}` : ""}
                            </span>
                          )}
                        </span>
                        <span className="font-mono text-xs">
                          {s.priceCents === null ? "—" : fmtCents(s.priceCents)}
                        </span>
                      </button>
                    </li>
                  ))}
                  {blocked.map((s) => (
                    <li key={s.id}>
                      <div
                        className="flex w-full items-center justify-between px-3 py-2 text-left opacity-50"
                        title="hat 1:1-Zuordnung — erst in der EK-Werkbank lösen"
                      >
                        <span>
                          <span className="font-medium">{s.name}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            hat 1:1-Zuordnung — erst in der EK-Werkbank lösen
                          </span>
                        </span>
                        <span className="font-mono text-xs">
                          {s.priceCents === null ? "—" : fmtCents(s.priceCents)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="text-right">
              <button
                type="button"
                onClick={chooseStandalone}
                className="text-xs text-muted-foreground underline hover:text-foreground"
              >
                Ohne Verkaufsartikel anlegen
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {props.kind === "dish" && salesArticle && (
              <div className="rounded-md border border-border bg-muted/40 p-2 text-xs">
                Wird verknüpft mit{" "}
                <span className="font-medium text-foreground">{salesArticle.name}</span>
                {salesArticle.priceCents !== null && <> · VK {fmtCents(salesArticle.priceCents)}</>}
              </div>
            )}
            {props.kind === "dish" && !salesArticle && (
              <div className="rounded-md border border-dashed border-border p-2 text-xs text-muted-foreground">
                Ohne Verkaufsartikel — später über den Editor verknüpfen.
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            {props.kind === "sub" && (
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Ausbeute-Menge
                  </label>
                  <Input
                    value={yieldQty}
                    onChange={(e) => setYieldQty(e.target.value)}
                    placeholder="z. B. 1000"
                    inputMode="decimal"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Einheit</label>
                  <UnitSelect value={yieldUnit} onChange={setYieldUnit} />
                </div>
              </div>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={props.onClose} disabled={saving}>
            Abbrechen
          </Button>
          {step === "form" && (
            <>
              {props.kind === "dish" && !props.preselectedSalesArticleId && (
                <Button variant="outline" onClick={() => setStep("pick")} disabled={saving}>
                  Zurück
                </Button>
              )}
              <Button onClick={save} disabled={saving}>
                {saving ? "Speichert …" : "Anlegen"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UnitSelect({
  value,
  onChange,
  disabled,
}: {
  value: RecipeUnit;
  onChange: (u: RecipeUnit) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as RecipeUnit)}
      disabled={disabled}
      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
    >
      <option value="g">g</option>
      <option value="ml">ml</option>
      <option value="stk">Stk</option>
    </select>
  );
}

// ---------------------------------------------------------------------------
// Recipe Editor Dialog — Kernstück
// ---------------------------------------------------------------------------

function RecipeEditorDialog(props: {
  recipeId: string;
  bundle: RecipeCandidateBundle;
  salesArticles: SalesArticle[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const callGet = useServerFn(getRecipe);
  const callUpsert = useServerFn(upsertRecipe);
  const callSetItems = useServerFn(setRecipeItems);
  const callSetContent = useServerFn(setArticleContent);
  const callLink = useServerFn(linkSalesArticleRecipe);
  const callUnlink = useServerFn(unlinkSalesArticleRecipe);

  const detailQ = useQuery({
    queryKey: ["recipe", props.recipeId],
    queryFn: () => callGet({ data: { recipeId: props.recipeId } }),
  });

  if (detailQ.isLoading || !detailQ.data) {
    return (
      <Dialog open onOpenChange={(o) => (o ? undefined : props.onClose())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rezept …</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Lädt …</p>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <RecipeEditorInner
      key={detailQ.data.updatedAt}
      initial={detailQ.data}
      bundle={props.bundle}
      salesArticles={props.salesArticles}
      onClose={props.onClose}
      onSaved={() => {
        qc.invalidateQueries({ queryKey: ["recipe", props.recipeId] });
        qc.invalidateQueries({ queryKey: ["recipe-candidates"] });
        props.onSaved();
      }}
      callUpsert={callUpsert}
      callSetItems={callSetItems}
      callSetContent={callSetContent}
      callLink={callLink}
      callUnlink={callUnlink}
    />
  );
}

type CallUpsert = ReturnType<typeof useServerFn<typeof upsertRecipe>>;
type CallSetItems = ReturnType<typeof useServerFn<typeof setRecipeItems>>;
type CallSetContent = ReturnType<typeof useServerFn<typeof setArticleContent>>;
type CallLink = ReturnType<typeof useServerFn<typeof linkSalesArticleRecipe>>;
type CallUnlink = ReturnType<typeof useServerFn<typeof unlinkSalesArticleRecipe>>;

function RecipeEditorInner(props: {
  initial: RecipeDetail;
  bundle: RecipeCandidateBundle;
  salesArticles: SalesArticle[];
  onClose: () => void;
  onSaved: () => void;
  callUpsert: CallUpsert;
  callSetItems: CallSetItems;
  callSetContent: CallSetContent;
  callLink: CallLink;
  callUnlink: CallUnlink;
}) {
  const { initial, bundle } = props;
  const [name, setName] = useState(initial.name);
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [yieldQty, setYieldQty] = useState<string>(
    initial.yieldQuantity !== null ? String(initial.yieldQuantity) : "",
  );
  const [yieldUnit, setYieldUnit] = useState<RecipeUnit>(
    (initial.yieldUnit as RecipeUnit | null) ?? "ml",
  );
  const [items, setItems] = useState<EditorItem[]>(() =>
    initial.items.map((it, idx) => ({
      key: `k${idx}-${it.id}`,
      articleId: it.articleId,
      subRecipeId: it.subRecipeId,
      quantity: it.quantity,
      unit: it.unit,
      lossPercent: it.lossPercent,
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const articleById = useMemo(() => {
    const m = new Map<string, RecipeArticleCandidate>();
    for (const a of bundle.articles) m.set(a.id, a);
    return m;
  }, [bundle]);

  const subById = useMemo(() => {
    const m = new Map<string, (typeof bundle.recipes)[number]>();
    for (const r of bundle.recipes) if (r.kind === "sub") m.set(r.id, r);
    return m;
  }, [bundle]);

  // Live-Kosten via costItemsCents — Kern-Modul wird wiederverwendet.
  const { totalCents, lineCosts, costError } = useMemo(() => {
    const ctx = buildCostingCtxFromBundle(bundle);
    // Wenn der Editor ein bestehendes Rezept öffnet, ersetzen wir dessen
    // Kanten im Kontext durch den aktuellen Editor-Stand — sonst würde die
    // Rekursion die gespeicherte (alte) Fassung zurückspielen.
    ctx.recipes.set(initial.id, {
      id: initial.id,
      items: toCostingItems(items),
    });
    if (initial.kind === "sub") {
      const q = Number(yieldQty.replace(",", "."));
      if (Number.isFinite(q) && q > 0) {
        ctx.subs.set(initial.id, {
          id: initial.id,
          yieldQuantity: q,
          yieldUnit,
        });
      }
    }
    try {
      // Zeilenkosten separat, damit die Breakdown-Tabelle exakt dieselbe
      // Formel benutzt: costItemsCents mit nur EINER Zeile.
      const lines: number[] = items.map((it) => {
        try {
          return costItemsCents(toCostingItems([it]), ctx);
        } catch {
          return NaN;
        }
      });
      const total = costRecipeCents(initial.id, ctx);
      return { totalCents: total, lineCosts: lines, costError: null as string | null };
    } catch (e) {
      return {
        totalCents: null as number | null,
        lineCosts: items.map(() => NaN),
        costError: costingErrorMessage(e),
      };
    }
  }, [bundle, items, initial.id, initial.kind, yieldQty, yieldUnit]);

  async function save() {
    setError(null);
    if (!name.trim()) {
      setError("Name ist Pflicht.");
      return;
    }
    setSaving(true);
    try {
      await props.callUpsert({
        data: {
          recipeId: initial.id,
          name: name.trim(),
          kind: initial.kind,
          yieldQuantity: initial.kind === "sub" ? Number(yieldQty.replace(",", ".")) : null,
          yieldUnit: initial.kind === "sub" ? yieldUnit : null,
          notes: notes.trim() === "" ? null : notes.trim(),
        },
      });
      // Prüfen, dass jede Zeile eine Zutat hat.
      for (const [idx, it] of items.entries()) {
        if (!it.articleId && !it.subRecipeId) {
          throw new Error(`Zeile ${idx + 1}: keine Zutat gewählt.`);
        }
        if (!(it.quantity > 0)) {
          throw new Error(`Zeile ${idx + 1}: Menge muss > 0 sein.`);
        }
      }
      await props.callSetItems({
        data: {
          recipeId: initial.id,
          items: items.map((it) => ({
            articleId: it.articleId,
            subRecipeId: it.subRecipeId,
            quantity: it.quantity,
            unit: it.unit,
            lossPercent: it.lossPercent,
          })),
        },
      });
      toast.success("Rezept gespeichert.");
      props.onSaved();
      props.onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  function addItem() {
    setItems((xs) => [
      ...xs,
      {
        key: `new-${Date.now()}-${xs.length}`,
        articleId: null,
        subRecipeId: null,
        quantity: 0,
        unit: "g",
        lossPercent: 0,
      },
    ]);
  }

  function updateItem(idx: number, patch: Partial<EditorItem>) {
    setItems((xs) => xs.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function removeItem(idx: number) {
    setItems((xs) => xs.filter((_, i) => i !== idx));
  }

  function moveItem(idx: number, delta: -1 | 1) {
    setItems((xs) => {
      const j = idx + delta;
      if (j < 0 || j >= xs.length) return xs;
      const copy = xs.slice();
      const [item] = copy.splice(idx, 1);
      copy.splice(j, 0, item);
      return copy;
    });
  }

  // Breakdown sortiert nach Kosten desc.
  const breakdown = useMemo(() => {
    return items
      .map((it, i) => ({
        idx: i,
        it,
        name: labelFor(it, articleById, subById),
        cents: lineCosts[i],
      }))
      .sort((a, b) => {
        const ac = Number.isFinite(a.cents) ? a.cents : -1;
        const bc = Number.isFinite(b.cents) ? b.cents : -1;
        return bc - ac;
      });
  }, [items, lineCosts, articleById, subById]);

  const linkedSalesArticles = useMemo(
    () => props.salesArticles.filter((s) => s.recipeId === initial.id),
    [props.salesArticles, initial.id],
  );
  const unlinkedSalesArticles = useMemo(
    () =>
      props.salesArticles.filter(
        (s) => s.recipeId === null && s.ekSourceArticleId === null && s.isActive,
      ),
    [props.salesArticles],
  );

  return (
    <Dialog open onOpenChange={(o) => (o ? undefined : props.onClose())}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {initial.kind === "dish" ? "Gericht" : "Zwischenrezept"}: {name || initial.name}
          </DialogTitle>
          <DialogDescription>
            Zutaten und Verluste pflegen — Kosten werden live berechnet.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[240px]">
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Art</label>
              <div className="pt-2">
                <Badge variant="outline">
                  {initial.kind === "dish" ? "Gericht" : "Zwischenrezept"}
                </Badge>
              </div>
            </div>
            {initial.kind === "sub" && (
              <>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Ausbeute</label>
                  <Input
                    value={yieldQty}
                    onChange={(e) => setYieldQty(e.target.value)}
                    inputMode="decimal"
                    className="w-28"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Einheit</label>
                  <div className="pt-1">
                    <UnitSelect value={yieldUnit} onChange={setYieldUnit} />
                  </div>
                </div>
              </>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Notizen</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Zutaten</h3>
              <Button size="sm" variant="outline" onClick={addItem}>
                + Zeile
              </Button>
            </div>
            <div className="mt-2 space-y-2">
              {items.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Noch keine Zutaten — mit „+ Zeile" hinzufügen.
                </p>
              )}
              {items.map((it, idx) => (
                <ItemRow
                  key={it.key}
                  item={it}
                  bundle={bundle}
                  selfRecipeId={initial.id}
                  cents={lineCosts[idx]}
                  onChange={(patch) => updateItem(idx, patch)}
                  onRemove={() => removeItem(idx)}
                  onUp={() => moveItem(idx, -1)}
                  onDown={() => moveItem(idx, 1)}
                  callSetContent={props.callSetContent}
                />
              ))}
            </div>
          </div>

          <div className="rounded-md border border-border bg-muted/30 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Gesamtkosten</span>
              <span className="font-mono text-lg">
                {totalCents !== null ? fmtCents(totalCents) : "—"}
              </span>
            </div>
            {initial.kind === "sub" && totalCents !== null && Number(yieldQty) > 0 && (
              <div className="text-xs text-muted-foreground">
                Preis je {yieldUnit}: {fmtCents(totalCents / Number(yieldQty.replace(",", ".")))}
              </div>
            )}
            {costError && <p className="mt-1 text-xs text-destructive">{costError}</p>}
          </div>

          {totalCents !== null && breakdown.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground">Kosten-Breakdown</h3>
              <div className="mt-1 rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Zutat</TableHead>
                      <TableHead className="w-24 text-right">Menge</TableHead>
                      <TableHead className="w-20 text-right">Verlust</TableHead>
                      <TableHead className="w-24 text-right">Kosten</TableHead>
                      <TableHead className="w-20 text-right">Anteil</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {breakdown.map((b) => (
                      <TableRow key={b.it.key}>
                        <TableCell>{b.name}</TableCell>
                        <TableCell className="text-right font-mono">
                          {b.it.quantity} {b.it.unit}
                        </TableCell>
                        <TableCell className="text-right font-mono">{b.it.lossPercent} %</TableCell>
                        <TableCell className="text-right font-mono">
                          {Number.isFinite(b.cents) ? fmtCents(Math.round(b.cents)) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {Number.isFinite(b.cents) && totalCents > 0
                            ? `${((100 * b.cents) / totalCents).toFixed(1)} %`
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {initial.kind === "dish" && (
            <LinkedSalesSection
              recipeId={initial.id}
              totalCents={totalCents}
              linked={linkedSalesArticles}
              unlinked={unlinkedSalesArticles}
              onLink={async (salesArticleId) => {
                try {
                  await props.callLink({ data: { salesArticleId, recipeId: initial.id } });
                  toast.success("Verkaufsartikel verknüpft.");
                  props.onSaved();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Fehler.");
                }
              }}
              onUnlink={async (salesArticleId) => {
                try {
                  await props.callUnlink({
                    data: { salesArticleId, clearEk: false },
                  });
                  toast.success("Verknüpfung gelöst.");
                  props.onSaved();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Fehler.");
                }
              }}
            />
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={props.onClose} disabled={saving}>
            Abbrechen
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Speichert …" : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function labelFor(
  it: EditorItem,
  articleById: Map<string, RecipeArticleCandidate>,
  subById: Map<string, RecipeCandidateBundle["recipes"][number]>,
): string {
  if (it.articleId) {
    const a = articleById.get(it.articleId);
    return a ? a.name : "unbekannter Artikel";
  }
  if (it.subRecipeId) {
    const s = subById.get(it.subRecipeId);
    return s ? `SUB: ${s.name}` : "unbekanntes Zwischenrezept";
  }
  return "—";
}

// ---------------------------------------------------------------------------
// Zeile im Editor (Typeahead + Menge + Verlust)
// ---------------------------------------------------------------------------

function ItemRow(props: {
  item: EditorItem;
  bundle: RecipeCandidateBundle;
  selfRecipeId: string;
  cents: number;
  onChange: (patch: Partial<EditorItem>) => void;
  onRemove: () => void;
  onUp: () => void;
  onDown: () => void;
  callSetContent: CallSetContent;
}) {
  const { item, bundle } = props;
  const [query, setQuery] = useState("");
  const [showList, setShowList] = useState(false);

  const article = item.articleId
    ? (bundle.articles.find((a) => a.id === item.articleId) ?? null)
    : null;
  const sub =
    item.subRecipeId !== null
      ? (bundle.recipes.find((r) => r.id === item.subRecipeId && r.kind === "sub") ?? null)
      : null;

  const needsContent =
    article !== null && (article.contentQuantity === null || article.contentUnit === null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q)
      return [] as Array<
        | { type: "article"; a: RecipeArticleCandidate }
        | { type: "sub"; r: RecipeCandidateBundle["recipes"][number] }
      >;
    const hits: Array<
      | { type: "article"; a: RecipeArticleCandidate }
      | { type: "sub"; r: RecipeCandidateBundle["recipes"][number] }
    > = [];
    for (const r of bundle.recipes) {
      if (r.kind !== "sub") continue;
      if (r.id === props.selfRecipeId) continue;
      if (r.name.toLowerCase().includes(q)) hits.push({ type: "sub", r });
    }
    for (const a of bundle.articles) {
      if (a.name.toLowerCase().includes(q)) hits.push({ type: "article", a });
    }
    return hits.slice(0, 30);
  }, [query, bundle, props.selfRecipeId]);

  function pickArticle(a: RecipeArticleCandidate) {
    props.onChange({
      articleId: a.id,
      subRecipeId: null,
      unit: a.contentUnit ?? "g",
    });
    setQuery("");
    setShowList(false);
  }

  function pickSub(r: RecipeCandidateBundle["recipes"][number]) {
    props.onChange({
      articleId: null,
      subRecipeId: r.id,
      unit: (r.yieldUnit as RecipeUnit | null) ?? "g",
    });
    setQuery("");
    setShowList(false);
  }

  const label = article ? article.name : sub ? `SUB: ${sub.name}` : null;

  return (
    <div className="rounded-md border border-border p-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[200px]">
          {label ? (
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{label}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  props.onChange({ articleId: null, subRecipeId: null });
                }}
              >
                ändern
              </Button>
            </div>
          ) : (
            <div className="relative">
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShowList(true);
                }}
                onFocus={() => setShowList(true)}
                placeholder="Zutat suchen (Artikel oder SUB: Rezept) …"
              />
              {showList && filtered.length > 0 && (
                <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-md">
                  <ul className="divide-y divide-border text-sm">
                    {filtered.map((f) =>
                      f.type === "article" ? (
                        <li key={"a-" + f.a.id}>
                          <button
                            type="button"
                            onClick={() => pickArticle(f.a)}
                            className="flex w-full items-center justify-between px-2 py-1.5 text-left hover:bg-muted"
                          >
                            <span>
                              {f.a.name}
                              <span className="ml-2 text-xs text-muted-foreground">
                                {f.a.supplierName ?? "—"}
                              </span>
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {f.a.contentUnit ?? "?"}
                            </span>
                          </button>
                        </li>
                      ) : (
                        <li key={"s-" + f.r.id}>
                          <button
                            type="button"
                            onClick={() => pickSub(f.r)}
                            className="flex w-full items-center justify-between px-2 py-1.5 text-left hover:bg-muted"
                          >
                            <span className="font-medium text-primary">SUB: {f.r.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {f.r.yieldUnit ?? "?"}
                            </span>
                          </button>
                        </li>
                      ),
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
        <div>
          <Input
            type="number"
            min={0}
            step="any"
            value={item.quantity || ""}
            onChange={(e) => props.onChange({ quantity: Number(e.target.value) || 0 })}
            className="w-24"
            placeholder="Menge"
          />
        </div>
        <div className="min-w-[3rem] text-sm text-muted-foreground">{item.unit}</div>
        <div className="flex items-center gap-1 text-sm">
          <span className="text-muted-foreground">Verlust</span>
          <Input
            type="number"
            min={0}
            max={90}
            value={item.lossPercent}
            onChange={(e) =>
              props.onChange({
                lossPercent: Math.max(0, Math.min(90, Number(e.target.value) || 0)),
              })
            }
            className="w-16"
          />
          <span className="text-muted-foreground">%</span>
        </div>
        <div className="w-24 text-right font-mono text-sm">
          {Number.isFinite(props.cents) ? fmtCents(Math.round(props.cents)) : "—"}
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={props.onUp} title="Nach oben">
            ↑
          </Button>
          <Button size="sm" variant="ghost" onClick={props.onDown} title="Nach unten">
            ↓
          </Button>
          <Button size="sm" variant="ghost" onClick={props.onRemove} className="text-destructive">
            ✕
          </Button>
        </div>
      </div>
      {needsContent && article && (
        <MissingContentForm
          article={article}
          onSaved={(qty, unit) => {
            // Optimistisch — der übergeordnete Editor lädt beim nächsten
            // Öffnen frisch; für die aktuelle Sitzung reicht das aktualisierte
            // Bundle nach onSaved().
            article.contentQuantity = qty;
            article.contentUnit = unit;
            props.onChange({ unit });
          }}
          callSetContent={props.callSetContent}
        />
      )}
    </div>
  );
}

function MissingContentForm(props: {
  article: RecipeArticleCandidate;
  onSaved: (qty: number, unit: RecipeUnit) => void;
  callSetContent: CallSetContent;
}) {
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState<RecipeUnit>("g");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const n = Number(qty.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) {
      setError("Menge muss > 0 sein.");
      return;
    }
    setSaving(true);
    try {
      await props.callSetContent({
        data: {
          articleId: props.article.id,
          contentQuantity: n,
          contentUnit: unit,
        },
      });
      props.onSaved(n, unit);
      toast.success("Inhalt gespeichert.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm dark:border-amber-800 dark:bg-amber-900/30">
      <p className="text-xs text-amber-800 dark:text-amber-200">
        „{props.article.name}" hat keinen Inhalt je Inventureinheit — bitte kurz pflegen:
      </p>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-xs">1 Inventureinheit =</span>
        <Input
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          inputMode="decimal"
          className="w-20"
          placeholder="z. B. 500"
        />
        <UnitSelect value={unit} onChange={setUnit} />
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? "…" : "Speichern"}
        </Button>
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Verknüpfte Verkaufsartikel
// ---------------------------------------------------------------------------

function LinkedSalesSection(props: {
  recipeId: string;
  totalCents: number | null;
  linked: SalesArticle[];
  unlinked: SalesArticle[];
  onLink: (salesArticleId: string) => void;
  onUnlink: (salesArticleId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [showList, setShowList] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return props.unlinked.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 20);
  }, [query, props.unlinked]);

  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground">Verknüpfte Verkaufsartikel</h3>
      {props.linked.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch nicht verknüpft.</p>
      ) : (
        <div className="mt-2 rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="w-24 text-right">VK</TableHead>
                <TableHead className="w-24 text-right">EK (berechnet)</TableHead>
                <TableHead className="w-20 text-right">WE %</TableHead>
                <TableHead className="w-32 text-right">Aktion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {props.linked.map((s) => {
                const ek = props.totalCents;
                const pct = wareneinsatzQuote(ek, s.priceCents);
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-right font-mono">
                      {s.priceCents === null ? "—" : fmtCents(s.priceCents)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {ek === null ? "—" : fmtCents(ek)}
                    </TableCell>
                    <TableCell className="text-right">
                      <WeMiniBadge pct={pct} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => props.onUnlink(s.id)}>
                        Lösen
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <div className="mt-3 relative">
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowList(true);
          }}
          onFocus={() => setShowList(true)}
          placeholder="Verkaufsartikel suchen zum Verknüpfen …"
        />
        {showList && filtered.length > 0 && (
          <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-md">
            <ul className="divide-y divide-border text-sm">
              {filtered.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => {
                      props.onLink(s.id);
                      setQuery("");
                      setShowList(false);
                    }}
                    className="flex w-full items-center justify-between px-2 py-1.5 text-left hover:bg-muted"
                  >
                    <span>{s.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {s.priceCents !== null ? fmtCents(s.priceCents) : "—"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function WeMiniBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-muted-foreground">—</span>;
  const cls =
    pct <= WE_GRUEN_BIS
      ? "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200"
      : pct <= WE_GELB_BIS
        ? "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-200"
        : "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-200";
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-xs ${cls}`}
    >
      {pct.toFixed(1)} %
    </span>
  );
}
