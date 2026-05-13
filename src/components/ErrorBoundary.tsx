import React, { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCcw, Home } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  private handleReset = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = "/dashboard";
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4 text-center">
          <div className="max-w-md w-full space-y-6 animate-in fade-in zoom-in duration-300">
            <div className="mx-auto w-20 h-20 bg-destructive/10 text-destructive rounded-full flex items-center justify-center">
              <AlertTriangle size={40} />
            </div>
            
            <div className="space-y-2">
              <h1 className="text-2xl font-bold font-display">¡Ups! Algo salió mal</h1>
              <p className="text-muted-foreground">
                Se detectó un error inesperado al renderizar esta sección.
              </p>
            </div>

            {process.env.NODE_ENV === "development" && (
              <div className="bg-muted p-3 rounded-lg text-left overflow-auto max-h-40">
                <p className="text-xs font-mono text-destructive">{this.state.error?.toString()}</p>
              </div>
            )}

            <div className="flex flex-col gap-2 pt-4">
              <Button onClick={this.handleReset} className="w-full gap-2">
                <RefreshCcw size={16} /> Recargar aplicación
              </Button>
              <Button onClick={this.handleGoHome} variant="outline" className="w-full gap-2">
                <Home size={16} /> Ir al inicio
              </Button>
            </div>
            
            <p className="text-[10px] text-muted-foreground opacity-50">
              Si el problema persiste, contacta a soporte técnico.
            </p>
          </div>
        </div>
      );
    }

    return this.children;
  }
}

export default ErrorBoundary;
