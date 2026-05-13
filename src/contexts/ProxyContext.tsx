import React, { createContext, useContext, useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface ProxyContextType {
  effectiveUserId: string | null;
  isProxyMode: boolean;
  proxyClientId: string | null;
  proxyClientName: string | null;
  startProxy: (clientId: string, clientName: string) => void;
  stopProxy: () => void;
}

const ProxyContext = createContext<ProxyContextType | undefined>(undefined);

export const ProxyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [proxyClientId, setProxyClientId] = useState<string | null>(() => {
    const saved = localStorage.getItem("proxyClientId");
    if (saved) console.log("ProxyContext: Hidratando clientId desde localStorage:", saved);
    return saved;
  });
  const [proxyClientName, setProxyClientName] = useState<string | null>(() => {
    return localStorage.getItem("proxyClientName");
  });

  // El modo proxy solo es válido si hay un cliente seleccionado Y el usuario está logueado
  // PERO permitimos que isProxyMode sea verdadero durante la carga de auth si ya tenemos el ID persistido
  // para evitar flickering y null renders innecesarios.
  const isProxyMode = !!proxyClientId && (authLoading || !!user);
  
  // Si estamos en modo proxy, usamos el ID del cliente. Si no, el del usuario logueado.
  const effectiveUserId = isProxyMode ? proxyClientId : (user?.id ?? null);

  const startProxy = (clientId: string, clientName: string) => {
    console.log(`ProxyContext: Iniciando sesión proxy para ${clientName} (${clientId})`);
    setProxyClientId(clientId);
    setProxyClientName(clientName);
    localStorage.setItem("proxyClientId", clientId);
    localStorage.setItem("proxyClientName", clientName);
    navigate("/dashboard");
  };

  const stopProxy = () => {
    console.log("ProxyContext: Finalizando sesión proxy");
    setProxyClientId(null);
    setProxyClientName(null);
    localStorage.removeItem("proxyClientId");
    localStorage.removeItem("proxyClientName");
    
    queryClient.clear();
    
    toast.success("Has salido del modo cliente", {
      description: "Has regresado a tu panel de contador.",
    });
    
    navigate("/contador");
  };

  // Limpieza defensiva: Si el usuario cierra sesión explícitamente (user=null y auth ya no está cargando)
  useEffect(() => {
    if (!authLoading && !user && proxyClientId) {
      console.warn("ProxyContext: Usuario deslogueado detectado. Limpiando contexto proxy.");
      stopProxy();
    }
  }, [user, authLoading]);

  return (
    <ProxyContext.Provider
      value={{
        effectiveUserId,
        isProxyMode,
        proxyClientId,
        proxyClientName,
        startProxy,
        stopProxy,
      }}
    >
      {children}
    </ProxyContext.Provider>
  );
};

export const useProxy = () => {
  const ctx = useContext(ProxyContext);
  if (!ctx) throw new Error("useProxy must be used within ProxyProvider");
  return ctx;
};
