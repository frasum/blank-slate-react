// Welle 4-D — Manager-UI zum Vergeben/Widerrufen von EasyOrder-Zugriff.
// Nutzt ausschliesslich die 4-D Server-Funktionen + bestehende
// listStaff / listLocations / listSuppliers. Alle Berechtigungen werden
// serverseitig (runGuarded("manager")) geprüft; Fehler werden hier in
// einer Alert sichtbar gemacht.

import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listEasyOrderAccess,
  grantEasyOrderAccess,
  revokeEasyOrderAccess,
  setEasyOrderSupplierWhitelist,
  setStaffEasyOrderAutoSend,
} from "@/lib/bestellung/easyorder-admin.functions";
import { listStaff } from "@/lib/admin/staff.functions";
import { listLocations } from "@/lib/admin/locations.functions";
import { listSuppliers } from "@/lib/bestellung/suppliers.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/admin/bestellung/easyorder-verwaltung")({
  head: () => ({ meta: [{ title: "EasyOrder-Verwaltung · Bestellung" }] }),
  component: EasyOrderAdminPage,
});

function EasyOrderAdminPage() {
  const qc = useQueryClient();
  const callGrant = useServerFn(grantEasyOrderAccess);
  const callRevoke = useServerFn(revokeEasyOrderAccess);
  const callSetWhitelist = useServerFn(setEasyOrderSupplierWhitelist);
  const callSetAutoSend = useServerFn(setStaffEasyOrderAutoSend);

  const accessQ = useQuery({
    queryKey: ["easyorder-admin", "access"],
    queryFn: () => listEasyOrderAccess(),
  });
  const staffQ = useQuery({ queryKey: ["staff"], queryFn: () => listStaff() });
  const locationsQ = useQuery({ queryKey: ["locations"], queryFn: () => listLocations() });
  const suppliersQ = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => listSuppliers({ data: {} }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["easyorder-admin", "access"] });

  const grantMut = useMutation({
    mutationFn: (input: Parameters<typeof callGrant>[0]) => callGrant(input),
    onSuccess: invalidate,
  });
  const revokeMut = useMutation({
    mutationFn: (input: Parameters<typeof callRevoke>[0]) => callRevoke(input),
    onSuccess: invalidate,
  });
  const whitelistMut = useMutation({
    mutationFn: (input: Parameters<typeof callSetWhitelist>[0]) => callSetWhitelist(input),
    onSuccess: invalidate,
  });
  const autoSendMut = useMutation({
    mutationFn: (input: Parameters<typeof callSetAutoSend>[0]) => callSetAutoSend(input),
    onSuccess: invalidate,
  });

  const lastError =
    grantMut.error ??
    revokeMut.error ??
    whitelistMut.error ??
    autoSendMut.error ??
    accessQ.error ??
    null;

  const [addOpen, setAddOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<{
    staffId: string;
    staffName: string;
    locationId: string;
    locationName: string;
  } | null>(null);
  const [whitelistTarget, setWhitelistTarget] = useState<{
    staffId: string;
    staffName: string;
    locationId: string;
    locationName: string;
    current: string[];
  } | null>(null);

  const staff = staffQ.data ?? [];
  const locations = locationsQ.data ?? [];
  const suppliers = suppliersQ.data ?? [];
  const access = accessQ.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">EasyOrder-Verwaltung</h2>
          <p className="text-sm text-muted-foreground">
            Wer darf an welchem Standort bestellen — mit oder ohne Freitext und mit optionaler
            Lieferanten-Whitelist.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>Zugriff hinzufügen</Button>
      </div>

      {lastError && (
        <Alert variant="destructive">
          <AlertTitle>Fehler</AlertTitle>
          <AlertDescription>
            {lastError instanceof Error ? lastError.message : "Unbekannter Fehler."}
          </AlertDescription>
        </Alert>
      )}

      {accessQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Lädt …</p>
      ) : access.filter((r) => r.entries.length > 0).length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine EasyOrder-Zugriffe vergeben.</p>
      ) : (
        <>
          <div className="rounded-md border border-border bg-card p-4 space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Auto-Versand pro Mitarbeiter</h3>
              <p className="text-xs text-muted-foreground">
                Mitarbeiter mit Auto-Versand schicken die Bestellung beim Absenden direkt per E-Mail
                an den Lieferanten. Ohne Recht bleibt die Bestellung „offen" und muss in der
                Lieferanten-Übersicht manuell versendet werden.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {access
                .filter((r) => r.entries.length > 0)
                .map((r) => (
                  <label
                    key={r.staffId}
                    className="flex items-center justify-between rounded border border-border px-3 py-2"
                  >
                    <span className="text-sm font-medium">{r.staffName}</span>
                    <Switch
                      checked={r.canEasyorderAutoSend}
                      onCheckedChange={(v) =>
                        autoSendMut.mutate({ data: { staffId: r.staffId, allowed: v } })
                      }
                    />
                  </label>
                ))}
            </div>
          </div>
          <div className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mitarbeiter</TableHead>
                  <TableHead>Standort</TableHead>
                  <TableHead>Aktiv</TableHead>
                  <TableHead>Freitext</TableHead>
                  <TableHead>Lieferanten</TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {access.flatMap((row) =>
                  row.entries.map((e) => (
                    <TableRow key={e.accessId}>
                      <TableCell className="font-medium">{row.staffName}</TableCell>
                      <TableCell>{e.locationName}</TableCell>
                      <TableCell>
                        <Switch
                          checked={e.isActive}
                          onCheckedChange={(v) =>
                            grantMut.mutate({
                              data: {
                                staffId: row.staffId,
                                locationId: e.locationId,
                                canAddFreeItems: e.canAddFreeItems,
                                isActive: v,
                              },
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={e.canAddFreeItems}
                          onCheckedChange={(v) =>
                            grantMut.mutate({
                              data: {
                                staffId: row.staffId,
                                locationId: e.locationId,
                                canAddFreeItems: v,
                                isActive: e.isActive,
                              },
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        {e.supplierIds.length === 0 ? (
                          <Badge variant="secondary">Alle Lieferanten</Badge>
                        ) : (
                          <Badge>{e.supplierIds.length} Lieferanten</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="mr-2"
                          onClick={() =>
                            setWhitelistTarget({
                              staffId: row.staffId,
                              staffName: row.staffName,
                              locationId: e.locationId,
                              locationName: e.locationName,
                              current: e.supplierIds,
                            })
                          }
                        >
                          Whitelist
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() =>
                            setRevokeTarget({
                              staffId: row.staffId,
                              staffName: row.staffName,
                              locationId: e.locationId,
                              locationName: e.locationName,
                            })
                          }
                        >
                          Widerrufen
                        </Button>
                      </TableCell>
                    </TableRow>
                  )),
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {addOpen && (
        <AddAccessDialog
          staff={staff.filter((s) => s.isActive)}
          locations={locations}
          onClose={() => setAddOpen(false)}
          onSubmit={(input) => {
            grantMut.mutate({ data: input }, { onSuccess: () => setAddOpen(false) });
          }}
          submitting={grantMut.isPending}
        />
      )}

      {revokeTarget && (
        <Dialog open onOpenChange={(open) => !open && setRevokeTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Zugriff widerrufen?</DialogTitle>
              <DialogDescription>
                {revokeTarget.staffName} verliert den EasyOrder-Zugriff für{" "}
                {revokeTarget.locationName}. Die Lieferanten-Whitelist für diesen Standort wird
                ebenfalls entfernt.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRevokeTarget(null)}>
                Abbrechen
              </Button>
              <Button
                variant="destructive"
                onClick={() =>
                  revokeMut.mutate(
                    {
                      data: {
                        staffId: revokeTarget.staffId,
                        locationId: revokeTarget.locationId,
                      },
                    },
                    { onSuccess: () => setRevokeTarget(null) },
                  )
                }
              >
                Widerrufen
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {whitelistTarget && (
        <WhitelistDialog
          target={whitelistTarget}
          suppliers={suppliers}
          submitting={whitelistMut.isPending}
          onClose={() => setWhitelistTarget(null)}
          onSubmit={(supplierIds) =>
            whitelistMut.mutate(
              {
                data: {
                  staffId: whitelistTarget.staffId,
                  locationId: whitelistTarget.locationId,
                  supplierIds,
                },
              },
              { onSuccess: () => setWhitelistTarget(null) },
            )
          }
        />
      )}
    </div>
  );
}

function AddAccessDialog(props: {
  staff: { id: string; displayName: string }[];
  locations: { id: string; name: string }[];
  onClose: () => void;
  onSubmit: (input: {
    staffId: string;
    locationId: string;
    canAddFreeItems: boolean;
    isActive: boolean;
  }) => void;
  submitting: boolean;
}) {
  const [staffId, setStaffId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [canAddFreeItems, setCanAddFreeItems] = useState(false);

  const canSubmit = staffId && locationId;

  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>EasyOrder-Zugriff hinzufügen</DialogTitle>
          <DialogDescription>
            Bestehende Zugriffe für dieselbe Kombination werden überschrieben.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Mitarbeiter</label>
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger>
                <SelectValue placeholder="Mitarbeiter wählen" />
              </SelectTrigger>
              <SelectContent>
                {props.staff.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Standort</label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger>
                <SelectValue placeholder="Standort wählen" />
              </SelectTrigger>
              <SelectContent>
                {props.locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={canAddFreeItems} onCheckedChange={setCanAddFreeItems} />
            <span className="text-sm">Freitext-Artikel erlauben</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={props.onClose}>
            Abbrechen
          </Button>
          <Button
            disabled={!canSubmit || props.submitting}
            onClick={() => props.onSubmit({ staffId, locationId, canAddFreeItems, isActive: true })}
          >
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WhitelistDialog(props: {
  target: {
    staffName: string;
    locationName: string;
    current: string[];
  };
  suppliers: { id: string; name: string }[];
  submitting: boolean;
  onClose: () => void;
  onSubmit: (supplierIds: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(props.target.current));

  const ordered = useMemo(
    () => [...props.suppliers].sort((a, b) => a.name.localeCompare(b.name)),
    [props.suppliers],
  );

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lieferanten-Whitelist</DialogTitle>
          <DialogDescription>
            {props.target.staffName} · {props.target.locationName} —{" "}
            <strong>Keine Auswahl = alle Lieferanten erlaubt.</strong>
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-80 space-y-2 overflow-y-auto py-2">
          {ordered.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Lieferanten vorhanden.</p>
          ) : (
            ordered.map((s) => (
              <label
                key={s.id}
                className="flex cursor-pointer items-center gap-3 rounded border border-border px-3 py-2 hover:bg-accent"
              >
                <Checkbox checked={selected.has(s.id)} onCheckedChange={() => toggle(s.id)} />
                <span className="text-sm">{s.name}</span>
              </label>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={props.onClose}>
            Abbrechen
          </Button>
          <Button disabled={props.submitting} onClick={() => props.onSubmit(Array.from(selected))}>
            Speichern ({selected.size === 0 ? "alle" : selected.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
