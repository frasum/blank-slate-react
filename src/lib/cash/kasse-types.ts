import { getCashOverview } from "@/lib/cash/cash.functions";

export type Overview = Awaited<ReturnType<typeof getCashOverview>>;

export type SettlementRow = Overview["settlements"][number];