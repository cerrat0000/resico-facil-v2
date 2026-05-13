import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePendingInvitations } from "@/hooks/useAccountantClients";
import { Check, X, UserCheck, Calculator, Shield, Clock } from "lucide-react";
import { toast } from "sonner";

const AccountantInvitations: React.FC = () => {
  const { data, isLoading, respond } = usePendingInvitations();
  const [responding, setResponding] = useState<Record<string, "accepting" | "rejecting">>({});

  if (isLoading) return null;

  const pending = (data ?? []).filter((i) => i.status === "pending");
  const accepted = (data ?? []).filter((i) => i.status === "active");
  const rejected = (data ?? []).filter((i) => i.status === "rejected");

  // Nothing to show at all
  if (data == null || data.length === 0) return null;

  const handleRespond = async (id: string, accept: boolean) => {
    setResponding((prev) => ({ ...prev, [id]: accept ? "accepting" : "rejecting" }));
    try {
      await respond.mutateAsync({ id, accept });
      toast.success(accept ? "¡Vínculo aceptado! El contador ya puede ver tu información." : "Invitación rechazada.");
    } catch {
      toast.error("Ocurrió un error. Intenta de nuevo.");
    } finally {
      setResponding((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  // Avatar initials helper
  const initials = (name: string) =>
    name
      .split(" ")
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase();

  return (
    <div className="space-y-3">
      {/* ── Pending invitations ── */}
      {pending.length > 0 && (
        <Card className="border-primary/40 shadow-sm">
          <CardHeader className="pb-3 pt-4 px-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <UserCheck size={16} className="text-primary" />
              </div>
              <CardTitle className="text-base">Solicitudes de contador</CardTitle>
              <Badge variant="default" className="ml-auto text-xs">
                {pending.length} nueva{pending.length !== 1 ? "s" : ""}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <p className="text-xs text-muted-foreground -mt-1">
              Un contador solicita acceso de <strong>solo lectura</strong> a tu información fiscal. Tú decides si
              aceptas o no.
            </p>

            {pending.map((inv: any) => (
              <div key={inv.id} className="rounded-xl border border-border bg-card p-4 space-y-3 transition-all">
                {/* Accountant info */}
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                    {initials(inv.accountant_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm leading-tight">{inv.accountant_name}</p>
                    {inv.specialization && (
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <Calculator size={11} />
                        {inv.specialization}
                      </p>
                    )}
                    {inv.license_number && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Shield size={11} />
                        Cédula: {inv.license_number}
                      </p>
                    )}
                    <p className="text-[11px] text-muted-foreground/60 mt-1 flex items-center gap-1">
                      <Clock size={10} />
                      {new Date(inv.created_at).toLocaleDateString("es-MX", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                </div>

                {/* What they can access */}
                <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground space-y-0.5">
                  <p className="font-medium text-foreground mb-1">Podrá ver:</p>
                  <p>✓ Tus datos del RFC y régimen fiscal</p>
                  <p>✓ Tus cálculos de ISR y declaraciones</p>
                  <p>✓ Tus ingresos y gastos registrados</p>
                  <p className="text-destructive/70 mt-1">✗ No podrá hacer cambios en tu cuenta</p>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-0.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
                    disabled={!!responding[inv.id]}
                    onClick={() => handleRespond(inv.id, false)}
                  >
                    {responding[inv.id] === "rejecting" ? (
                      <span className="flex items-center gap-1.5">
                        <span className="animate-spin">⟳</span> Rechazando…
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <X size={14} /> Rechazar
                      </span>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1"
                    disabled={!!responding[inv.id]}
                    onClick={() => handleRespond(inv.id, true)}
                  >
                    {responding[inv.id] === "accepting" ? (
                      <span className="flex items-center gap-1.5">
                        <span className="animate-spin">⟳</span> Aceptando…
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <Check size={14} /> Aceptar
                      </span>
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Active accountants ── */}
      {accepted.length > 0 && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="px-4 py-3 space-y-2">
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
              <UserCheck size={13} /> Contadores con acceso activo
            </p>
            {accepted.map((inv: any) => (
              <div key={inv.id} className="flex items-center gap-2.5 text-sm">
                <div className="shrink-0 w-7 h-7 rounded-full bg-emerald-500/15 text-emerald-600 flex items-center justify-center font-bold text-xs">
                  {initials(inv.accountant_name)}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm leading-tight">{inv.accountant_name}</p>
                  {inv.specialization && <p className="text-xs text-muted-foreground">{inv.specialization}</p>}
                </div>
                <Badge
                  variant="outline"
                  className="ml-auto text-[10px] border-emerald-500/30 text-emerald-600 shrink-0"
                >
                  Activo
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Rejected (collapsed, just count) ── */}
      {rejected.length > 0 && pending.length === 0 && accepted.length === 0 && (
        <div className="text-xs text-muted-foreground text-center py-1">
          {rejected.length} solicitud{rejected.length !== 1 ? "es" : ""} rechazada{rejected.length !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
};

export default AccountantInvitations;
