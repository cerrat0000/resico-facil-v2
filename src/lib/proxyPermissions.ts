/**
 * Rutas permitidas para el contador cuando está en Modo Proxy (operando como cliente).
 * Solo se permiten funciones estrictamente fiscales de RESICO.
 */
export const ALLOWED_PROXY_ROUTES = [
  "/dashboard",
  "/income-expenses",
  "/declarations",
  "/documents",
  "/actividad-fiscal",
];

/**
 * Rutas que están explícitamente prohibidas para el contador en modo proxy.
 */
export const FORBIDDEN_PROXY_ROUTES = [
  "/settings",
  "/payments",
  "/support-credits",
  "/tutorials",
  "/profile",
  "/security",
  "/checkout-return",
];

/**
 * Verifica si una ruta está permitida en modo proxy.
 */
export const isRouteAllowedInProxy = (path: string): boolean => {
  const cleanPath = path.split('?')[0];
  
  // Permitir la raíz si redirige a dashboard
  if (cleanPath === "/" || cleanPath === "/dashboard") return true;
  
  // Si está en la lista de prohibidas, rechazar inmediatamente
  if (FORBIDDEN_PROXY_ROUTES.some(route => cleanPath === route || cleanPath.startsWith(route + "/"))) {
    return false;
  }

  // Verificar si la ruta actual está en la lista de permitidas
  return ALLOWED_PROXY_ROUTES.some(route => cleanPath === route || cleanPath.startsWith(route + "/"));
};

/**
 * Helpers para permisos específicos en la UI
 */
export const proxyPermissions = {
  canAccessSettings: (isProxyMode: boolean) => !isProxyMode,
  canAccessPayments: (isProxyMode: boolean) => !isProxyMode,
  canAccessSupport: (isProxyMode: boolean) => !isProxyMode,
  canAccessTutorials: (isProxyMode: boolean) => !isProxyMode,
  // El contador SI puede editar datos fiscales si el proxy está activo
  canEditFiscalData: (isProxyMode: boolean) => isProxyMode,
  // El contador NO puede editar perfiles personales del cliente
  canEditClientProfile: (isProxyMode: boolean) => !isProxyMode,
};
