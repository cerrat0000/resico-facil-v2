import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { useAccountantClients } from "@/hooks/useAccountantClients";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  UserPlus,
  Search,
  Users,
  FileText,
  AlertCircle,
  CheckCircle2,
  Clock,
  ChevronRight,
  Send,
  Pencil,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";

// ── ClientDetail ──────────────────────────────────────────────────────────────
const ClientDetail: React.FC<{
  clientId: string;
  linkId: string;
  canEdit: boolean;
  onBack: () => void;
}> = ({ clientId, linkId, canEdit, onBack }) => {
  const { user } = useAuth();
  const [note, setNote] = useState("");
  const { setEditPermission } = useAccountantClients();

  const {
    data: summary,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["client_summary", clientId],
    queryFn: async () => {
      const [{ data: tp }, { data: lastCalc }, { data: drafts }, { data: notes }] = await Promise.all([
        supabase.from("taxpayer_profiles").select("*").eq("user_id", clientId).maybeSingle(),
        supabase
          .from("tax_calculations")
          .select("*")
          .eq("user_id", clientId)
          .eq("is_current", true)
          .order("period_year", { ascending: false })
          .order("period_month", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("declaration_drafts")
          .select("id, period_year, period_month, status, pdf_url")
          .eq("user_id", clientId)
          .order("period_year", { ascending: false })
          .order("period_month", { ascending: false })
          .limit(6),
        supabase
          .from("accountant_notes")
          .select("id, content, created_at")
          .eq("client_id", clientId)
          .eq("accountant_id", user!.id)
          .order("created_at", { ascending: false }),
      ]);
      return { tp, lastCalc, drafts: drafts ?? [], notes: notes ?? [] };
    },
  });

  const addNote = async () => {
    if (!note.trim() || !user) return;
    const { error } = await supabase.from("accountant_notes").insert({
      client_id: clientId,
      accountant_id: user.id,
      content: note.trim(),
    });
    if (error) {
      toast.error("No se pudo guardar la nota");
      return;
    }
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "accountant.note.create",
      table_name: "accountant_notes",
      record_id: clientId,
    });
    toast.success("Nota guardada");
    setNote("");
    refetch();
  };

  if (isLoading)
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );

  const rfc = summary?.tp?.rfc ?? "—";

  const handleToggleEdit = async (checked: boolean) => {
    try {
      await setEditPermission.mutateAsync({ linkId, canEdit: checked });
      toast.success(checked ? "Permiso de edición activado" : "Permiso de edición desactivado");
    } catch (e: any) {
      toast.error(e.message || "No se pudo cambiar el permiso");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 -ml-1">
          ← Volver
        </Button>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="font-mono text-xs">
            {rfc}
          </Badge>
          <div className="flex items-center gap-2 bg-muted/60 border border-border rounded-lg px-3 py-1.5">
            <Pencil size={13} className={canEdit ? "text-primary" : "text-muted-foreground"} />
            <Label htmlFor={`edit-toggle-${clientId}`} className="text-xs font-medium cursor-pointer select-none">
              Edición
            </Label>
            <Switch
              id={`edit-toggle-${clientId}`}
              checked={canEdit}
              onCheckedChange={handleToggleEdit}
              disabled={setEditPermission.isPending}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Datos fiscales */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Datos fiscales</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2.5">
            {[
              { label: "RFC", value: rfc, mono: true },
              { label: "Régimen", value: summary?.tp?.tax_regime ?? "—" },
              { label: "Actividad", value: summary?.tp?.economic_activity ?? "—" },
            ].map(({ label, value, mono }) => (
              <div key={label} className="flex justify-between items-center">
                <span className="text-muted-foreground">{label}</span>
                <span className={mono ? "font-mono font-medium" : ""}>{value}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Último cálculo */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Último cálculo fiscal</CardTitle>
          </CardHeader>
          <CardContent>
            {summary?.lastCalc ? (
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  {
                    label: "Periodo",
                    value: `${summary.lastCalc.period_month}/${summary.lastCalc.period_year}`,
                    highlight: false,
                  },
                  {
                    label: "ISR estimado",
                    value: `$${Number(summary.lastCalc.estimated_tax).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`,
                    highlight: true,
                  },
                  {
                    label: "Ingresos",
                    value: `$${Number(summary.lastCalc.total_income).toLocaleString("es-MX")}`,
                    highlight: false,
                  },
                  {
                    label: "Gastos",
                    value: `$${Number(summary.lastCalc.total_expenses).toLocaleString("es-MX")}`,
                    highlight: false,
                  },
                ].map(({ label, value, highlight }) => (
                  <div key={label}>
                    <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
                    <p className={`font-semibold ${highlight ? "text-primary" : ""}`}>{value}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Sin cálculos registrados.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Declaraciones */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Declaraciones recientes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {summary?.drafts.length ? (
            summary.drafts.map((d: any) => (
              <div
                key={d.id}
                className="flex items-center justify-between text-sm p-2.5 rounded-lg border border-border bg-muted/30"
              >
                <div className="flex items-center gap-2">
                  <FileText size={14} className="text-muted-foreground" />
                  <span className="font-medium">
                    {d.period_month}/{d.period_year}
                  </span>
                </div>
                <Badge variant={d.status === "submitted" ? "default" : "secondary"} className="capitalize">
                  {d.status}
                </Badge>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Sin declaraciones.</p>
          )}
        </CardContent>
      </Card>

      {/* Notas */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Notas del contador</CardTitle>
          <CardDescription>Solo tú puedes ver estas notas.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Agrega una nota sobre este cliente…"
              onKeyDown={(e) => e.key === "Enter" && addNote()}
            />
            <Button onClick={addNote} disabled={!note.trim()} size="sm" className="shrink-0">
              <Send size={14} className="mr-1" /> Guardar
            </Button>
          </div>
          <div className="space-y-2">
            {summary?.notes.length ? (
              summary.notes.map((n: any) => (
                <div key={n.id} className="text-sm p-3 rounded-lg bg-muted border border-border">
                  <p>{n.content}</p>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {new Date(n.created_at).toLocaleString("es-MX")}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Sin notas aún.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// ── StatCard ──────────────────────────────────────────────────────────────────
const StatCard: React.FC<{
  label: string;
  value: number;
  icon: React.ElementType;
  color?: string;
  bg?: string;
}> = ({ label, value, icon: Icon, color = "text-primary", bg = "bg-primary/10" }) => (
  <Card>
    <CardContent className="p-4 flex items-center gap-3">
      <div className={`p-2.5 rounded-xl ${bg} ${color}`}>
        <Icon size={18} />
      </div>
      <div>
        <p className="text-2xl font-bold font-display leading-none">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </div>
    </CardContent>
  </Card>
);

// ── ClientCard ────────────────────────────────────────────────────────────────
const ClientCard: React.FC<{ client: any; onClick: () => void }> = ({ client, onClick }) => {
  const initials = (client.client_name ?? "C")
    .split(" ")
    .slice(0, 2)
    .map((w: string) => w[0])
    .join("")
    .toUpperCase();

  const isActive = client.status === "active";
  const isPending = client.status === "pending";

  return (
    <Card
      className={`transition-all duration-200 ${
        isActive ? "hover:border-primary hover:shadow-sm cursor-pointer" : "opacity-70 cursor-default"
      }`}
      onClick={() => isActive && onClick()}
    >
      <CardContent className="p-4 flex items-center gap-3">
        <div className="shrink-0 w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{client.client_name || "Cliente"}</p>
          <p className="text-xs text-muted-foreground font-mono">{client.client_rfc || "—"}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant={isActive ? "default" : isPending ? "secondary" : "outline"}>
            {isActive ? "Activo" : isPending ? "Pendiente" : client.status}
          </Badge>
          {isActive && <ChevronRight size={16} className="text-muted-foreground" />}
        </div>
      </CardContent>
    </Card>
  );
};

// ── AccountantPanel ───────────────────────────────────────────────────────────
const AccountantPanel: React.FC = () => {
  const navigate = useNavigate();
  const { data: role, isLoading: roleLoading } = useUserRole();
  const { data: clients, isLoading, inviteByRfc } = useAccountantClients();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "pending">("all");
  const [rfcInvite, setRfcInvite] = useState("");
  const [selectedClient, setSelectedClient] = useState<{
    clientId: string;
    linkId: string;
    canEdit: boolean;
  } | null>(null);

  const handleInvite = async () => {
    if (!rfcInvite.trim()) return;
    try {
      await inviteByRfc.mutateAsync(rfcInvite.trim());
      toast.success("Invitación enviada. El cliente debe aceptarla desde su cuenta.");
      setRfcInvite("");
    } catch (e: any) {
      toast.error(e.message || "No se pudo enviar la invitación");
    }
  };

  if (roleLoading) {
    return (
      <AppLayout>
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      </AppLayout>
    );
  }

  if (role !== "accountant" && role !== "admin") {
    return (
      <AppLayout>
        <Card className="max-w-md mx-auto mt-12">
          <CardContent className="p-8 text-center space-y-4">
            <AlertCircle className="mx-auto text-destructive" size={36} />
            <p className="font-semibold text-lg">Acceso exclusivo para contadores</p>
            <p className="text-sm text-muted-foreground">Esta sección no está disponible para tu rol actual.</p>
            <Button onClick={() => navigate("/dashboard")}>Ir al dashboard</Button>
          </CardContent>
        </Card>
      </AppLayout>
    );
  }

  const allClients = clients ?? [];
  const total = allClients.length;
  const active = allClients.filter((c) => c.status === "active").length;
  const pending = allClients.filter((c) => c.status === "pending").length;

  const filtered = allClients.filter((c) => {
    const matchesFilter = filter === "all" || c.status === filter;
    const q = search.trim().toLowerCase();
    return matchesFilter && (!q || c.client_name?.toLowerCase().includes(q) || c.client_rfc?.toLowerCase().includes(q));
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        {selectedClient ? (
          <ClientDetail
            clientId={selectedClient.clientId}
            linkId={selectedClient.linkId}
            canEdit={selectedClient.canEdit}
            onBack={() => setSelectedClient(null)}
          />
        ) : (
          <>
            {/* Header */}
            <div>
              <h2 className="text-2xl font-bold font-display">Mi cartera</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Gestiona tus clientes contribuyentes RESICO</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="Total clientes" value={total} icon={Users} color="text-primary" bg="bg-primary/10" />
              <StatCard
                label="Activos"
                value={active}
                icon={CheckCircle2}
                color="text-emerald-600"
                bg="bg-emerald-500/10"
              />
              <StatCard label="Pendientes" value={pending} icon={Clock} color="text-amber-600" bg="bg-amber-500/10" />
            </div>

            {/* Tabs */}
            <Tabs defaultValue="clients">
              <TabsList className="w-full sm:w-auto">
                <TabsTrigger value="clients" className="flex-1 sm:flex-none gap-1.5">
                  <Users size={14} /> Clientes
                </TabsTrigger>
                <TabsTrigger value="invite" className="flex-1 sm:flex-none gap-1.5">
                  <UserPlus size={14} /> Invitar
                </TabsTrigger>
              </TabsList>

              {/* Clientes tab */}
              <TabsContent value="clients" className="space-y-3 mt-4">
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar por nombre o RFC…"
                      className="pl-9"
                    />
                  </div>
                  <div className="flex gap-1">
                    {(["all", "active", "pending"] as const).map((f) => (
                      <Button
                        key={f}
                        size="sm"
                        variant={filter === f ? "default" : "outline"}
                        onClick={() => setFilter(f)}
                      >
                        {f === "all" ? "Todos" : f === "active" ? "Activos" : "Pendientes"}
                      </Button>
                    ))}
                  </div>
                </div>

                {isLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : filtered.length === 0 ? (
                  <Card>
                    <CardContent className="py-14 text-center space-y-2">
                      <Users className="mx-auto mb-3 opacity-20" size={44} />
                      <p className="font-semibold">Sin clientes por mostrar</p>
                      <p className="text-sm text-muted-foreground">
                        Usa la pestaña <strong>Invitar</strong> para agregar clientes por RFC.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-2">
                    {filtered.map((c) => (
                      <ClientCard
                        key={c.id}
                        client={c}
                        onClick={() =>
                          setSelectedClient({
                            clientId: c.client_id,
                            linkId: c.id,
                            canEdit: c.canEdit ?? false,
                          })
                        }
                      />
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Invitar tab */}
              <TabsContent value="invite" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Invitar cliente por RFC</CardTitle>
                    <CardDescription>
                      El cliente recibirá una solicitud y debe aceptarla desde su cuenta para que puedas ver su
                      información fiscal.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex gap-2">
                      <Input
                        value={rfcInvite}
                        onChange={(e) => setRfcInvite(e.target.value.toUpperCase())}
                        placeholder="RFC del cliente (ej: ABCD800101XYZ)"
                        maxLength={13}
                        className="uppercase font-mono"
                        onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                      />
                      <Button
                        onClick={handleInvite}
                        disabled={inviteByRfc.isPending || !rfcInvite.trim()}
                        className="shrink-0"
                      >
                        <Send size={14} className="mr-1.5" />
                        Invitar
                      </Button>
                    </div>

                    <div className="rounded-xl bg-muted/60 border border-border p-4 text-sm space-y-1.5">
                      <p className="font-semibold text-foreground mb-2">¿Cómo funciona?</p>
                      <p className="text-muted-foreground">
                        1. Ingresa el RFC del contribuyente registrado en Resico Fácil.
                      </p>
                      <p className="text-muted-foreground">
                        2. Tu cliente verá la solicitud en su dashboard y podrá aceptarla o rechazarla.
                      </p>
                      <p className="text-muted-foreground">
                        3. Al aceptar, aparecerá como <strong className="text-foreground">Activo</strong> en tu cartera.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </AppLayout>
  );
};

export default AccountantPanel;
