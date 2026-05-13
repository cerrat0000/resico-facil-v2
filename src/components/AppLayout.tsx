import React, { useEffect } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useProxy } from "@/contexts/ProxyContext";
import { useTaxpayerProfile } from "@/hooks/useTaxpayerProfile";
import { useUserRole } from "@/hooks/useUserRole";
import {
  LayoutDashboard,
  DollarSign,
  FolderOpen,
  FileText,
  GraduationCap,
  CreditCard,
  Settings,
  LogOut,
  Menu,
  X,
  HandCoins,
  ShieldCheck,
  History,
  ShieldAlert
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { isRouteAllowedInProxy } from "@/lib/proxyPermissions";
import { NotificationPopover } from "./NotificationPopover";

const navItems = [
  { to: "/dashboard", label: "Inicio", icon: LayoutDashboard },
  { to: "/income-expenses", label: "Ingresos y Gastos", icon: DollarSign },
  { to: "/documents", label: "Expediente", icon: FolderOpen },
  { to: "/declarations", label: "Declaraciones", icon: FileText },
  { to: "/actividad-fiscal", label: "Actividad", icon: History },
  { to: "/payments", label: "Pagos", icon: CreditCard },
  { to: "/support-credits", label: "Apoyos", icon: HandCoins },
  { to: "/tutorials", label: "Aprende", icon: GraduationCap },
  { to: "/settings", label: "Ajustes", icon: Settings },
];

const adminNavItems = [
  { to: "/admin/auditoria", label: "Auditoría", icon: ShieldAlert },
];

const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { signOut, user } = useAuth();
  const { data: taxpayer, isLoading } = useTaxpayerProfile();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const { isProxyMode, proxyClientName, stopProxy } = useProxy();
  const { data: role } = useUserRole();

  // Determinamos si el perfil está incompleto de forma estricta (Ignorar si somos el contador en proxy)
  const isProfileIncomplete = !isLoading && user && (taxpayer?.onboarding_completed !== true || !taxpayer?.rfc) && !isProxyMode;

  // --- GUARDIA DE SEGURIDAD MODO PROXY ---
  useEffect(() => {
    if (isProxyMode && !isRouteAllowedInProxy(location.pathname)) {
      console.warn(`Acceso restringido: El contador intentó entrar a ${location.pathname}`);
      toast.error("Acceso restringido", {
        description: "No tienes permisos para acceder a esta sección en modo contador.",
      });
      navigate("/dashboard", { replace: true });
    }
  }, [isProxyMode, location.pathname, navigate]);

  // --- EFECTO DE REDIRECCIÓN PERFIL INCOMPLETO ---
  useEffect(() => {
    if (isProfileIncomplete) {
      // Si no está ya en la página de ajustes, lo redirigimos
      // (Esta regla solo aplica a contribuyentes reales, no a contadores en proxy)
      if (location.pathname !== "/settings") {
        console.log("Acceso restringido: Perfil fiscal incompleto.");
        toast.error("Configuración necesaria", {
          description: "Por favor, completa tu RFC y datos fiscales para continuar.",
        });
        navigate("/settings", { replace: true });
      }
    }
  }, [isProfileIncomplete, location.pathname, navigate]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Usuario";

  // Filtrar ítems de navegación según el modo proxy
  const baseNavItems = navItems.filter(item => 
    !isProxyMode || isRouteAllowedInProxy(item.to)
  );

  const filteredNavItems = role === 'admin' 
    ? [...baseNavItems, ...adminNavItems]
    : baseNavItems;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {isProxyMode && (
        <div className="sticky top-0 z-[60] bg-amber-500 text-white shadow-md border-b border-amber-600 animate-in fade-in slide-in-from-top duration-300">
          <div className="max-w-7xl mx-auto px-4 h-10 flex items-center justify-between">
            <div className="flex items-center gap-3 overflow-hidden">
              <ShieldCheck size={16} className="shrink-0" />
              <div className="flex items-center gap-2 text-xs md:text-sm font-medium truncate">
                <span>Modo Contador</span>
                <span className="hidden md:inline-block opacity-50">|</span>
                <span className="font-bold truncate">{proxyClientName || "Cliente"}</span>
                {taxpayer?.rfc && (
                  <>
                    <span className="opacity-50">•</span>
                    <span className="font-mono bg-amber-600/50 px-1.5 py-0.5 rounded text-[10px] md:text-xs">
                      {taxpayer.rfc}
                    </span>
                  </>
                )}
              </div>
            </div>
            <Button 
              variant="secondary" 
              size="sm" 
              onClick={stopProxy} 
              className="h-7 text-[10px] md:text-xs bg-white/20 hover:bg-white/30 text-white border-none shadow-none"
            >
              Salir del Modo
            </Button>
          </div>
        </div>
      )}
      <div className="flex-1 flex min-h-0">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex md:w-64 md:flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <div className="p-5 border-b border-sidebar-border">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold font-display text-sidebar-primary">Resico Fácil</h1>
            <NotificationPopover />
          </div>
          <p className="text-xs text-sidebar-foreground/60 mt-1 truncate">{displayName}</p>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {filteredNavItems.map(({ to, label, icon: Icon }) => {
            // Si el perfil está incompleto, bloqueamos todo excepto Ajustes
            const isDisabled = isProfileIncomplete && to !== "/settings";

            return (
              <NavLink
                key={to}
                to={isDisabled ? location.pathname : to}
                onClick={(e) => {
                  if (isDisabled) {
                    e.preventDefault();
                    toast.warning("Sección bloqueada", {
                      description: "Completa tu perfil fiscal primero.",
                    });
                  }
                }}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    isActive && !isDisabled
                      ? "bg-sidebar-accent text-sidebar-primary"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                    isDisabled && "opacity-30 cursor-not-allowed grayscale",
                  )
                }
              >
                <Icon size={18} />
                {label}
              </NavLink>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border">
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 w-full transition-colors"
          >
            <LogOut size={18} /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Mobile header & content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-card border-b border-border">
          <h1 className="text-lg font-bold font-display text-primary">Resico Fácil</h1>
          <div className="flex items-center gap-2">
            <NotificationPopover />
            <Button variant="ghost" size="icon" onClick={() => setMobileOpen(!mobileOpen)}>
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </Button>
          </div>
        </header>

        {/* Mobile menu overlay */}
        {mobileOpen && (
          <div
            className="md:hidden fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          >
            <div
              className="absolute right-0 top-0 bottom-0 w-72 bg-card shadow-xl p-4 space-y-1"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4">
                <p className="text-sm font-medium truncate">{displayName}</p>
              </div>
              {filteredNavItems.map(({ to, label, icon: Icon }) => {
                const isDisabled = isProfileIncomplete && to !== "/settings";
                return (
                  <NavLink
                    key={to}
                    to={isDisabled ? location.pathname : to}
                    onClick={(e) => {
                      if (isDisabled) e.preventDefault();
                      else setMobileOpen(false);
                    }}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors",
                        isActive && !isDisabled
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:bg-muted",
                        isDisabled && "opacity-30",
                      )
                    }
                  >
                    <Icon size={18} /> {label}
                  </NavLink>
                );
              })}
              <button
                onClick={handleSignOut}
                className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-destructive hover:bg-muted w-full mt-4"
              >
                <LogOut size={18} /> Cerrar sesión
              </button>
            </div>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">{children}</main>

        {/* Mobile Bottom Nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border flex justify-around py-2 z-40">
          {filteredNavItems.slice(0, 5).map(({ to, label, icon: Icon }) => {
            const isDisabled = isProfileIncomplete && to !== "/settings";
            return (
              <NavLink
                key={to}
                to={isDisabled ? location.pathname : to}
                onClick={(e) => {
                  if (isDisabled) e.preventDefault();
                }}
                className={({ isActive }) =>
                  cn(
                    "flex flex-col items-center gap-0.5 text-[10px] font-medium px-2 py-1 rounded-lg transition-colors",
                    isActive && !isDisabled ? "text-primary" : "text-muted-foreground",
                    isDisabled && "opacity-20",
                  )
                }
              >
                <Icon size={20} />
                {label.split(" ")[0]}
              </NavLink>
            );
          })}
        </nav>
      </div>
      </div>
    </div>
  );
};

export default AppLayout;
