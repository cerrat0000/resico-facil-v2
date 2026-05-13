import React, { useState } from "react";
import { useLocation } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { User, Shield, Loader2, Sparkles } from "lucide-react";
import { useTaxpayerProfile } from "@/hooks/useTaxpayerProfile";
import { useProfile } from "@/hooks/useProfile";
import { z } from "zod";

const fiscalSchema = z.object({
  rfc: z
    .string()
    .trim()
    .regex(/^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/i, { message: "RFC inválido" })
    .or(z.literal("")),
  curp: z.string().trim().length(18, { message: "CURP debe tener 18 caracteres" }).or(z.literal("")),
  fiscal_address: z.string().max(500).optional(),
  economic_activity: z.string().max(200).optional(),
});

const SettingsPage = () => {
  const location = useLocation();
  const isNewUser = (location.state as any)?.fromRegister === true;
  const { user } = useAuth();
  const { data: profile, isLoading: profileLoading, update: updateProfile } = useProfile();
  const { data: taxpayer, isLoading: taxLoading, upsert: upsertTaxpayer } = useTaxpayerProfile();

  const [phone, setPhone] = useState("");
  const [rfc, setRfc] = useState("");
  const [curp, setCurp] = useState("");
  const [address, setAddress] = useState("");
  const [activity, setActivity] = useState("");
  const [hydrated, setHydrated] = useState(false);

  React.useEffect(() => {
    if (!hydrated && (profile || taxpayer)) {
      setPhone(profile?.phone ?? "");
      setRfc(taxpayer?.rfc ?? "");
      setCurp(taxpayer?.curp ?? "");
      setAddress(taxpayer?.fiscal_address ?? "");
      setActivity(taxpayer?.economic_activity ?? "");
      setHydrated(true);
    }
  }, [profile, taxpayer, hydrated]);

  const isLoading = profileLoading || taxLoading;
  const isSaving = updateProfile.isPending || upsertTaxpayer.isPending;

  const handleSave = async () => {
    const parsed = fiscalSchema.safeParse({ rfc, curp, fiscal_address: address, economic_activity: activity });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    try {
      await Promise.all([
        updateProfile.mutateAsync({ phone: phone || undefined }),
        upsertTaxpayer.mutateAsync({
          rfc: rfc.toUpperCase() || null,
          curp: curp.toUpperCase() || null,
          fiscal_address: address || null,
          economic_activity: activity || null,
          onboarding_completed: !!(rfc && curp && address && activity),
        }),
      ]);
      toast.success("Datos guardados correctamente");
    } catch (e: any) {
      toast.error(`Error al guardar: ${e.message}`);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Welcome banner – only shown right after registration */}
        {isNewUser && (
          <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-accent/30">
            <CardContent className="p-4 flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                <Sparkles size={20} />
              </div>
              <div>
                <p className="font-semibold text-sm">¡Bienvenido a Resico Fácil!</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Para sacarle el máximo provecho a la plataforma, completa tu perfil fiscal. Solo te toma un minuto.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <h1 className="text-2xl font-bold font-display">Ajustes</h1>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <User size={18} className="text-primary" />
              <CardTitle className="text-base font-display">Datos personales</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Correo electrónico</Label>
              <Input value={user?.email || ""} disabled className="h-12 bg-muted" />
            </div>
            <div className="space-y-2">
              <Label>Nombre completo</Label>
              <Input
                value={profile?.full_name || user?.user_metadata?.full_name || ""}
                disabled
                className="h-12 bg-muted"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Teléfono</Label>
              {isLoading ? (
                <Skeleton className="h-12 w-full" />
              ) : (
                <Input
                  id="phone"
                  placeholder="10 dígitos"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="h-12"
                  maxLength={15}
                />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Shield size={18} className="text-primary" />
              <CardTitle className="text-base font-display">Perfil fiscal</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rfc">RFC</Label>
              {isLoading ? (
                <Skeleton className="h-12 w-full" />
              ) : (
                <Input
                  id="rfc"
                  placeholder="XAXX010101000"
                  value={rfc}
                  onChange={(e) => setRfc(e.target.value.toUpperCase())}
                  className="h-12 uppercase"
                  maxLength={13}
                />
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="curp">CURP</Label>
              {isLoading ? (
                <Skeleton className="h-12 w-full" />
              ) : (
                <Input
                  id="curp"
                  placeholder="18 caracteres"
                  value={curp}
                  onChange={(e) => setCurp(e.target.value.toUpperCase())}
                  className="h-12 uppercase"
                  maxLength={18}
                />
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Domicilio fiscal</Label>
              {isLoading ? (
                <Skeleton className="h-12 w-full" />
              ) : (
                <Input
                  id="address"
                  placeholder="Calle, número, colonia, CP"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="h-12"
                  maxLength={500}
                />
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="activity">Actividad económica principal</Label>
              {isLoading ? (
                <Skeleton className="h-12 w-full" />
              ) : (
                <Input
                  id="activity"
                  placeholder="Ej: Venta de alimentos"
                  value={activity}
                  onChange={(e) => setActivity(e.target.value)}
                  className="h-12"
                  maxLength={200}
                />
              )}
            </div>
            <Button size="lg" className="w-full" onClick={handleSave} disabled={isSaving || isLoading}>
              {isSaving ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" /> Guardando...
                </>
              ) : (
                "Guardar cambios"
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default SettingsPage;
