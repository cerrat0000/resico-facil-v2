import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useClientAccountant } from "@/hooks/useClientAccountant";
import { 
  ShieldCheck, 
  UserX, 
  Lock, 
  Unlock, 
  ShieldAlert,
  Loader2,
  Calendar,
  Briefcase
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export const ClientAccountantManager: React.FC = () => {
  const { accountant, isLoading, updatePermissions, revokeAccess } = useClientAccountant();

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <CardContent className="p-6">
          <div className="h-20 bg-muted rounded-lg"></div>
        </CardContent>
      </Card>
    );
  }

  if (!accountant) {
    return (
      <Card className="border-dashed bg-muted/20">
        <CardContent className="p-8 text-center">
          <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
            <ShieldAlert size={24} className="text-muted-foreground" />
          </div>
          <CardTitle className="text-base">Sin contador vinculado</CardTitle>
          <CardDescription className="mt-1">
            Actualmente no tienes un contador administrando tu perfil fiscal.
          </CardDescription>
        </CardContent>
      </Card>
    );
  }

  const isPending = accountant.status === 'pending';
  const isReadOnly = accountant.status === 'read_only' || !accountant.permissions.edit;
  const isRevoked = accountant.status === 'revoked';

  if (isRevoked) return null;

  return (
    <Card className="overflow-hidden border-primary/20">
      <CardHeader className="bg-primary/5 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck size={20} className="text-primary" />
            <CardTitle className="text-lg font-display">Mi Contador</CardTitle>
          </div>
          <Badge variant={isPending ? "secondary" : isReadOnly ? "outline" : "default"}>
            {isPending ? "Invitación Pendiente" : isReadOnly ? "Solo Lectura" : "Acceso Total"}
          </Badge>
        </div>
        <CardDescription>
          Gestiona los permisos de acceso de tu despacho contable.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-muted/30 rounded-xl border">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center font-bold text-lg">
              {accountant.accountant_name?.[0] || "C"}
            </div>
            <div>
              <p className="font-bold text-sm">{accountant.accountant_name}</p>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Briefcase size={12} /> {accountant.specialization || "Contador General"}
                </span>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar size={12} /> {format(new Date(accountant.created_at), "MMM yyyy", { locale: es })}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={updatePermissions.isPending || isPending}
              onClick={() => updatePermissions.mutate({ linkId: accountant.id, edit: isReadOnly })}
            >
              {updatePermissions.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : isReadOnly ? (
                <Unlock size={14} />
              ) : (
                <Lock size={14} />
              )}
              {isReadOnly ? "Permitir Edición" : "Cambiar a Solo Lectura"}
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="gap-2" disabled={revokeAccess.isPending}>
                  <UserX size={14} /> Revocar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Revocar acceso al contador?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta acción expulsará inmediatamente al contador de tu cuenta. No podrá ver tus ingresos, gastos ni declaraciones hasta que vuelvas a vincularlo.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => revokeAccess.mutate(accountant.id)}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Confirmar Revocación
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Permisos Actuales</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="flex items-center gap-2 text-sm p-2 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100">
              <ShieldCheck size={14} /> Ver ingresos y gastos
            </div>
            <div className="flex items-center gap-2 text-sm p-2 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100">
              <ShieldCheck size={14} /> Ver declaraciones y PDFs
            </div>
            <div className={`flex items-center gap-2 text-sm p-2 rounded-lg border ${!isReadOnly ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-muted text-muted-foreground border-muted-foreground/20'}`}>
              {!isReadOnly ? <Unlock size={14} /> : <Lock size={14} />} 
              {isReadOnly ? "No puede editar registros" : "Puede crear y editar registros"}
            </div>
            <div className="flex items-center gap-2 text-sm p-2 rounded-lg bg-muted text-muted-foreground border border-muted-foreground/20">
              <Lock size={14} /> No puede ver datos bancarios
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
