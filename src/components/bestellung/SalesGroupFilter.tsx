// PV1-Refactor — geteilter kaskadierender Gruppen-Filter für VA1 und PV1.
// Reine Options-Ableitung + Match-Logik leben in
// src/lib/bestellung/sales-group-filter.ts (mit Tests). Diese Komponente
// bindet nur Select-UI + Reset-Effekte.

import { useEffect, useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ALL,
  deriveHauptOptions,
  deriveUnterOptions,
  deriveWgOptions,
  matchesHaupt,
  matchesUnter,
  type GroupedRow,
  type GroupOption,
} from "@/lib/bestellung/sales-group-filter";

type Props = {
  rows: readonly GroupedRow[];
  haupt: string;
  setHaupt: (v: string) => void;
  unter: string;
  setUnter: (v: string) => void;
  wg: string;
  setWg: (v: string) => void;
  /** Optionale Zusatz-Option auf Hauptgruppen-Ebene (z. B. „Ohne Zuordnung"). */
  extraHauptOption?: GroupOption;
};

export function SalesGroupFilter({
  rows,
  haupt,
  setHaupt,
  unter,
  setUnter,
  wg,
  setWg,
  extraHauptOption,
}: Props) {
  const hauptOptions = useMemo(() => deriveHauptOptions(rows), [rows]);

  const rowsAfterHaupt = useMemo(() => {
    if (haupt === ALL) return rows;
    if (extraHauptOption && haupt === extraHauptOption.value) return rows;
    return rows.filter((r) => matchesHaupt(r, haupt));
  }, [rows, haupt, extraHauptOption]);

  const unterOptions = useMemo(() => deriveUnterOptions(rowsAfterHaupt), [rowsAfterHaupt]);

  const rowsAfterUnter = useMemo(() => {
    if (unter === ALL) return rowsAfterHaupt;
    return rowsAfterHaupt.filter((r) => matchesUnter(r, unter));
  }, [rowsAfterHaupt, unter]);

  const wgOptions = useMemo(() => deriveWgOptions(rowsAfterUnter), [rowsAfterUnter]);

  useEffect(() => {
    if (unter !== ALL && !unterOptions.some((o) => o.value === unter)) setUnter(ALL);
  }, [unter, unterOptions, setUnter]);
  useEffect(() => {
    if (wg !== ALL && !wgOptions.some((o) => o.value === wg)) setWg(ALL);
  }, [wg, wgOptions, setWg]);

  return (
    <>
      <Select value={haupt} onValueChange={setHaupt}>
        <SelectTrigger className="w-44">
          <SelectValue placeholder="Hauptgruppe" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Alle Hauptgruppen</SelectItem>
          {extraHauptOption && (
            <SelectItem value={extraHauptOption.value}>{extraHauptOption.label}</SelectItem>
          )}
          {hauptOptions.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={unter} onValueChange={setUnter}>
        <SelectTrigger className="w-44">
          <SelectValue placeholder="Untergruppe" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Alle Untergruppen</SelectItem>
          {unterOptions.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={wg} onValueChange={setWg}>
        <SelectTrigger className="w-44">
          <SelectValue placeholder="Warengruppe" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Alle Warengruppen</SelectItem>
          {wgOptions.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
