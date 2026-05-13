import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUserRole } from "@/hooks/useUserRole";
import { useAccountantClients } from "@/hooks/useAccountantClients";
import { useProxy } from "@/contexts/ProxyContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import {
  UserPlus,
  Search,
  Users,
  AlertCircle,
  CheckCircle2,
  Clock,
  ChevronRight,
  Send,
  Activity,
  ShieldCheck,
  Filter
} from "lucide-react";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";

// ── StatCard ──────────────────────────────────────────────────────────────────
const StatCard: React.FC<{
  label: string;
  value: number;
  icon: React.ElementType;
  color?: string;
  bg?: string;
}> = ({ label, value, icon: Icon, color = "text-primary", bg = "bg-primary/10" }) => (
  <Card className="shadow-sm hover:shadow transition-shadow overflow-hidden group">
    <CardContent className="p-4 flex flex-col justify-between h-full relative">
      <div className={`absolute right-[-10px] top-[-10px] p-6 rounded-full opacity-5 group-hover:opacity-10 transition-opacity ${bg} ${color}`}>
        <Icon size={48} />
      </div>
      <div className="flex items-center justify-between mb-3">
        <div className={`p-2 rounded-lg ${bg} ${color}`}>
          <Icon size={16} />
        </div>
      </div>
      <div>
        <p className="text-2xl font-bold font-display leading-none">{value}</p>
        <p className="text-xs font-medium text-muted-foreground mt-1.5">{label}</p>
      </div>
    </CardContent>
  </Card>
);

// ── ClientCard ────────────────────────────────────────────────────────────────
const ClientCard: React.FC<{ client: any; onClick: () => void }> = ({ client, onClick }) => {
  const name = client.client_name?.trim() || "Cliente";
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w: string) => w[0])
    .join("")
    .toUpperCase() || "C";

  const isActive = client.status === "active";
  const isPending = client.status === "pending";

  return (
    <Card
      className={`transition-all duration-200 shadow-sm ${
        isActive ? "hover:border-primary/50 hover:shadow-md cursor-pointer bg-card" : "bg-muted/20 border-dashed opacity-80 cursor-default"
      }`}
      onClick={() => isActive && onClick()}
    >
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`shrink-0 w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm shadow-inner ${isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="font-semibold text-sm truncate">{name}</p>
          </div>
          <p className="text-xs text-muted-foreground font-mono bg-muted inline-block px-1.5 rounded">{client.client_rfc || "SIN RFC"}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <Badge variant={isActive ? "default" : isPending ? "secondary" : "outline"} className="shadow-sm text-[10px]">
            {isActive ? "Activo" : isPending ? "Pendiente" : client.status}
          </Badge>
          {isActive ? (
             <span className="text-[10px] text-muted-foreground flex items-center gap-1 group-hover:text-primary transition-colors">Entrar al panel <ChevronRight size={10}/></span>
          ) : (
             <span className="text-[10px] text-muted-foreground opacity-60">Esperando</span>
          )}
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
  const { startProxy } = useProxy();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "pending">("all");
  const [rfcInvite, setRfcInvite] = useState("");

  const handleInvite = async () => {
    if (!rfcInvite.trim()) return;
    try {
      await inviteByRfc.mutateAsync(rfcInvite.trim());
      toast.success("Invitación enviada exitosamente.");
      setRfcInvite("");
    } catch (e: any) {
      toast.error(e.message || "No se pudo enviar la invitación");
    }
  };

  const handleClientClick = (client: any) => {
    startProxy(client.client_id, client.client_name || "Cliente");
  };

  if (roleLoading) {
    return (
      <AppLayout>
        <div className="space-y-6 max-w-5xl mx-auto pt-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-[400px] w-full" />
        </div>
      </AppLayout>
    );
  }

  if (role !== "accountant" && role !== "admin") {
    return (
      <AppLayout>
        <div className="min-h-[80vh] flex items-center justify-center">
          <Card className="max-w-md w-full shadow-lg border-destructive/20">
            <CardContent className="p-8 text-center space-y-5">
              <div className="w-16 h-16 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mx-auto mb-2">
                <AlertCircle size={32} />
              </div>
              <div>
                <p className="font-bold text-xl mb-1">Acceso Restringido</p>
                <p className="text-sm text-muted-foreground">Este módulo es de uso exclusivo para Contadores con licencia verificada.</p>
              </div>
              <Button onClick={() => navigate("/dashboard")} className="w-full" variant="outline">Volver al Inicio</Button>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  const allClients = clients ?? [];
  const total = allClients.length;
  const active = allClients.filter((c) => c.status === "active").length;
  const pending = allClients.filter((c) => c.status === "pending").length;

  const filtered = allClients.filter((c) => {
    let matchesFilter = true;
    if (filter === "active") matchesFilter = c.status === "active";
    if (filter === "pending") matchesFilter = c.status === "pending";

    const q = search.trim().toLowerCase();
    const matchesSearch = !q || c.client_name?.toLowerCase().includes(q) || c.client_rfc?.toLowerCase().includes(q);
    
    return matchesFilter && matchesSearch;
  });

  return (
    <AppLayout>
      <div className="space-y-6 max-w-5xl mx-auto pt-2 pb-12">
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
            <div>
              <h2 className="text-3xl font-bold font-display tracking-tight">Mi Cartera</h2>
              <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                <ShieldCheck size={14} className="text-primary"/> Selecciona un cliente para operar en su cuenta
              </p>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
            <StatCard label="Total Clientes" value={total} icon={Users} color="text-primary" bg="bg-primary/10" />
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
          <Tabs defaultValue="clients" className="bg-card rounded-xl shadow-sm border p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <TabsList className="w-full sm:w-auto grid grid-cols-2">
                <TabsTrigger value="clients" className="gap-2">
                  <Users size={14} /> Clientes
                </TabsTrigger>
                <TabsTrigger value="invite" className="gap-2">
                  <UserPlus size={14} /> Nueva Invitación
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Clientes tab */}
            <TabsContent value="clients" className="m-0">
              <div className="flex flex-col md:flex-row gap-3 mb-4">
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar por nombre o RFC..."
                    className="pl-9 h-10 bg-muted/30 focus-visible:bg-background transition-colors"
                  />
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
                  {(["all", "active", "pending"] as const).map((f) => (
                    <Button
                      key={f}
                      size="sm"
                      variant={filter === f ? "default" : "secondary"}
                      onClick={() => setFilter(f)}
                      className={`whitespace-nowrap h-10 px-4 ${filter !== f && 'bg-muted hover:bg-muted/80'}`}
                    >
                      {f === "all" ? "Todos" : f === "active" ? "Activos" : "Pendientes"}
                    </Button>
                  ))}
                </div>
              </div>

              {isLoading ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-[90px] w-full rounded-xl" />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-16 text-center border-2 border-dashed border-border rounded-xl bg-muted/10">
                  <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                    <Filter className="text-muted-foreground" size={24} />
                  </div>
                  <p className="font-semibold text-lg">No se encontraron clientes</p>
                  <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                    Intenta ajustar los filtros o realiza una nueva búsqueda. También puedes enviar una invitación.
                  </p>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {filtered.map((c) => (
                    <ClientCard
                      key={c.id}
                      client={c}
                      onClick={() => handleClientClick(c)}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Invitar tab */}
            <TabsContent value="invite" className="m-0">
              <div className="max-w-2xl mx-auto py-4">
                <div className="text-center mb-8">
                  <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-4">
                    <UserPlus size={32} />
                  </div>
                  <h3 className="text-xl font-semibold">Invitar Contribuyente</h3>
                  <p className="text-sm text-muted-foreground mt-1">Conecta con tus clientes utilizando su RFC registrado en Resico Fácil.</p>
                </div>

                <div className="bg-muted/30 p-6 rounded-xl border border-border/50 shadow-sm space-y-4">
                  <Label htmlFor="rfc-input" className="text-sm font-medium">RFC del Cliente</Label>
                  <div className="flex gap-2">
                    <Input
                      id="rfc-input"
                      value={rfcInvite}
                      onChange={(e) => setRfcInvite(e.target.value.toUpperCase())}
                      placeholder="Ej: ABCD800101XYZ"
                      maxLength={13}
                      className="uppercase font-mono h-11 text-lg"
                      onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                    />
                    <Button
                      onClick={handleInvite}
                      disabled={inviteByRfc.isPending || !rfcInvite.trim()}
                      className="shrink-0 h-11 px-6"
                    >
                      {inviteByRfc.isPending ? <Activity className="animate-spin mr-2" size={16}/> : <Send size={16} className="mr-2" />}
                      Invitar
                    </Button>
                  </div>

                  <div className="pt-4 border-t border-border/50 grid sm:grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className="bg-background w-8 h-8 rounded-full border shadow-sm flex items-center justify-center mx-auto mb-2 text-xs font-bold text-muted-foreground">1</div>
                      <p className="text-xs text-muted-foreground">Ingresas el RFC del cliente en la plataforma.</p>
                    </div>
                    <div className="text-center">
                      <div className="bg-background w-8 h-8 rounded-full border shadow-sm flex items-center justify-center mx-auto mb-2 text-xs font-bold text-muted-foreground">2</div>
                      <p className="text-xs text-muted-foreground">El cliente aprueba la solicitud desde su panel.</p>
                    </div>
                    <div className="text-center">
                      <div className="bg-primary/10 text-primary w-8 h-8 rounded-full border border-primary/20 shadow-sm flex items-center justify-center mx-auto mb-2 text-xs font-bold">3</div>
                      <p className="text-xs font-medium">¡Listo! Comienza a administrar su perfil.</p>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AppLayout>
  );
};

export default AccountantPanel;
