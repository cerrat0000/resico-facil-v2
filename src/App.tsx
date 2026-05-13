import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ProxyProvider, useProxy } from "@/contexts/ProxyContext";
import { isRouteAllowedInProxy } from "@/lib/proxyPermissions";
import { supabase } from "@/integrations/supabase/client";
import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { toast } from "sonner";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import IncomeExpenses from "./pages/IncomeExpenses";
import Documents from "./pages/Documents";
import Declarations from "./pages/Declarations";
import Payments from "./pages/Payments";
import SupportCredits from "./pages/SupportCredits";
import Tutorials from "./pages/Tutorials";
import SettingsPage from "./pages/SettingsPage";
import AccountantPanel from "./pages/AccountantPanel";
import FiscalActivity from "./pages/FiscalActivity";
import AdminAudit from "./pages/AdminAudit";
import CheckoutReturn from "./pages/CheckoutReturn";
import NotFound from "./pages/NotFound";
import { useUserRole } from "@/hooks/useUserRole";
import ErrorBoundary from "./components/ErrorBoundary";

const queryClient = new QueryClient();

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background"><p className="text-muted-foreground">Cargando...</p></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background"><p className="text-muted-foreground">Cargando...</p></div>;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

const ProxyGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isProxyMode, proxyClientId, stopProxy } = useProxy();
  const { user } = useAuth();
  const location = useLocation();
  const isAllowed = isRouteAllowedInProxy(location.pathname);
  
  useEffect(() => {
    if (isProxyMode && !isAllowed) {
      console.warn(`Acceso restringido en modo proxy: ${location.pathname}`);
      toast.error("Acceso restringido", {
        description: "Esta sección no está disponible en Modo Contador.",
      });
    }
  }, [isProxyMode, isAllowed, location.pathname]);

  // Verificación reactiva de la validez del vínculo
  useEffect(() => {
    if (isProxyMode && user && proxyClientId) {
      const checkStatus = async () => {
        const { data, error } = await supabase
          .from("accountant_client_links")
          .select("status")
          .eq("accountant_id", user.id)
          .eq("client_id", proxyClientId)
          .single();

        if (error || !data || data.status !== 'active') {
          console.error("Vínculo de contador revocado o inválido.");
          stopProxy();
          toast.error("Vínculo revocado", {
            description: "El cliente ha revocado tu acceso.",
          });
        }
      };
      
      checkStatus();
    }
  }, [location.pathname, isProxyMode, user, proxyClientId, stopProxy]);

  if (isProxyMode && !isAllowed) {
    return <Navigate to="/dashboard" replace />;
  }
  
  return <>{children}</>;
};

const AdminGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { data: role, isLoading } = useUserRole();
  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-background"><p className="text-muted-foreground">Verificando permisos...</p></div>;
  if (role !== 'admin') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<PublicRoute><Index /></PublicRoute>} />
    <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
    <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
    <Route path="/forgot-password" element={<ForgotPassword />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
    <Route path="/income-expenses" element={<ProtectedRoute><IncomeExpenses /></ProtectedRoute>} />
    <Route path="/documents" element={<ProtectedRoute><Documents /></ProtectedRoute>} />
    <Route path="/declarations" element={<ProtectedRoute><Declarations /></ProtectedRoute>} />
    <Route path="/payments" element={<ProtectedRoute><ProxyGuard><Payments /></ProxyGuard></ProtectedRoute>} />
    <Route path="/support-credits" element={<ProtectedRoute><ProxyGuard><SupportCredits /></ProxyGuard></ProtectedRoute>} />
    <Route path="/tutorials" element={<ProtectedRoute><ProxyGuard><Tutorials /></ProxyGuard></ProtectedRoute>} />
    <Route path="/settings" element={<ProtectedRoute><ProxyGuard><SettingsPage /></ProxyGuard></ProtectedRoute>} />
    <Route path="/actividad-fiscal" element={<ProtectedRoute><ProxyGuard><FiscalActivity /></ProxyGuard></ProtectedRoute>} />
    <Route path="/admin/auditoria" element={<ProtectedRoute><AdminGuard><AdminAudit /></AdminGuard></ProtectedRoute>} />
    <Route path="/contador" element={<ProtectedRoute><AccountantPanel /></ProtectedRoute>} />
    <Route path="/checkout/return" element={<ProtectedRoute><CheckoutReturn /></ProtectedRoute>} />
    <Route path="*" element={<NotFound />} />
  </Routes>
);

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <ProxyProvider>
              <AppRoutes />
            </ProxyProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
