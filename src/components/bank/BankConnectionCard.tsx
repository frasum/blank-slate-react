// BK2 — Verbindungs-Card fürs Bank-Konto (Consent starten, Status anzeigen, syncen).
// Bewusst schlank: Konto wird via Prop übergeben; kein globaler Kontext.
// Callback-Handling erfolgt in bankkonto.tsx (URL-Parameter ?bk2Return=<accountId>).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getBankAccountConnectionState,
  startBankConnect,
  syncBankTransactions,
} from "@/lib/bank/bank.functions";

export function BankConnectionCard({
  accountId,
  accountName,
}: {
  accountId: string;
  accountName: string;
}) {
  const qc = useQueryClient();
  const getState = useServerFn(getBankAccountConnectionState);
  const start = useServerFn(startBankConnect);
  const sync = useServerFn(syncBankTransactions);

  const stateQ = useQuery({
    queryKey: ["bk2", "state", accountId],
    queryFn: () => getState({ data: { accountId } }),
  });

  const startM = useMutation({
    mutationFn: async () => {
      const redirectUrl = `${window.location.origin}/admin/bankkonto?bk2Return=${accountId}`;
      return start({ data: { accountId, redirectUrl } });
    },
    onSuccess: (r) => {
      window.location.href = r.redirectUrl;
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const syncM = useMutation({
    mutationFn: () => sync({ data: { accountId } }),
    onSuccess: (r) => {
      toast.success(`Sync ok: ${r.inserted} neu, ${r.skipped} verworfen (ab ${r.dateFromUsed}).`);
      void qc.invalidateQueries({ queryKey: ["bk"] });
      void qc.invalidateQueries({ queryKey: ["bk2", "state", accountId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const s = stateQ.data;
  const connected = !!s?.hasConnection;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Bank-Anbindung — {accountName}</CardTitle>
        {connected ? (
          <Badge variant="secondary">verbunden</Badge>
        ) : (
          <Badge variant="outline">nicht verbunden</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {stateQ.isLoading ? (
          <div className="text-muted-foreground">lädt …</div>
        ) : connected ? (
          <>
            <div>Letzter API-Buchungstag: {s?.lastSyncBookingDate ?? "—"}</div>
            <div>Consent gültig bis: {s?.agreementExpiresAt?.slice(0, 10) ?? "—"}</div>
            <div className="flex gap-2">
              <Button onClick={() => syncM.mutate()} disabled={syncM.isPending} size="sm">
                {syncM.isPending ? "Sync läuft…" : "Jetzt syncen"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={startM.isPending}
                onClick={() => startM.mutate()}
              >
                {startM.isPending ? "Weiter zur Bank…" : "Consent erneuern"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="text-muted-foreground">
              Verbinde das Konto direkt mit der Deutschen Bank (GoCardless PSD2, 90 Tage Consent).
              Nach Rückkehr wird die Zuordnung strikt per IBAN geprüft.
            </div>
            <Button onClick={() => startM.mutate()} disabled={startM.isPending} size="sm">
              {startM.isPending ? "Weiter zur Bank…" : "Bank verbinden"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
