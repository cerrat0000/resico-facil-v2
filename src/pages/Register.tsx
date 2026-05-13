import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { UserPlus, User, Calculator, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Role = "taxpayer" | "accountant";

// RFC México: 4 letras (persona física) + 6 dígitos AAMMDD + 3 alfanuméricos homoclave = 13
const RFC_REGEX = /^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$/;
const PHONE_REGEX = /^\d{10}$/;

const baseSchema = {
  fullName: z.string().trim().min(3, "Mínimo 3 caracteres").max(120, "Máximo 120 caracteres"),
  email: z.string().trim().email("Correo inválido").max(255),
  password: z.string().min(8, "Mínimo 8 caracteres").max(72, "Máximo 72 caracteres"),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: "Debes aceptar los términos" }) }),
};

const taxpayerSchema = z.object({
  ...baseSchema,
  role: z.literal("taxpayer"),
  rfc: z.string().trim().toUpperCase().regex(RFC_REGEX, "RFC inválido (ej: ABCD800101XYZ)"),
  phone: z.string().trim().regex(PHONE_REGEX, "Teléfono debe tener 10 dígitos"),
});

const accountantSchema = z.object({
  ...baseSchema,
  role: z.literal("accountant"),
  licenseNumber: z
    .string()
    .trim()
    .min(5, "Cédula mínimo 5 caracteres")
    .max(20)
    .regex(/^[A-Z0-9-]+$/i, "Solo letras, números y guiones"),
  specialization: z.string().trim().min(3, "Mínimo 3 caracteres").max(120),
});

const Register = () => {
  const [role, setRole] = useState<Role>("taxpayer");
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    phone: "",
    rfc: "",
    licenseNumber: "",
    specialization: "",
  });
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const val =
      k === "rfc"
        ? e.target.value.toUpperCase().replace(/\s+/g, "")
        : k === "phone"
          ? e.target.value.replace(/\D/g, "").slice(0, 10)
          : e.target.value;
    setForm((f) => ({ ...f, [k]: val }));
    if (errors[k]) setErrors((er) => ({ ...er, [k]: "" }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const payload = { ...form, role, acceptTerms } as any;
    const schema = role === "taxpayer" ? taxpayerSchema : accountantSchema;
    const parsed = schema.safeParse(payload);

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      parsed.error.issues.forEach((i) => {
        fieldErrors[i.path[0] as string] = i.message;
      });
      setErrors(fieldErrors);
      toast.error("Revisa los campos marcados");
      return;
    }

    setErrors({});
    setLoading(true);

    const meta: Record<string, any> = {
      full_name: form.fullName.trim(),
      role,
    };
    if (role === "taxpayer") {
      meta.rfc = form.rfc.trim().toUpperCase();
      meta.phone = form.phone.trim();
    } else {
      meta.license_number = form.licenseNumber.trim();
      meta.specialization = form.specialization.trim();
    }

    const { data, error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: meta,
      },
    });

    if (error) {
      setLoading(false);
      toast.error(error.message || "Error al registrarte");
      return;
    }

    const userId = data.user?.id;
    if (userId && role === "taxpayer") {
      // Mejor esfuerzo client-side; el handle_new_user trigger crea profile/role
      await supabase.from("taxpayer_profiles").insert({
        user_id: userId,
        rfc: form.rfc.trim().toUpperCase(),
      });
      await supabase.from("profiles").update({ phone: form.phone.trim() }).eq("user_id", userId);
    }

    setLoading(false);
    if (role === "accountant") {
      toast.success("¡Cuenta creada! Bienvenido al panel de contadores.");
      navigate("/contador");
    } else {
      toast.success("¡Cuenta creada! Completa tu perfil fiscal para empezar.");
      navigate("/settings", { state: { fromRegister: true } });
    }
  };

  const FieldError = ({ name }: { name: string }) =>
    errors[name] ? (
      <p className="text-xs text-destructive flex items-center gap-1 mt-1">
        <AlertCircle size={12} /> {errors[name]}
      </p>
    ) : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold font-display text-primary">Resico Fácil</h1>
          <p className="text-muted-foreground mt-2">Crea tu cuenta</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl font-display">Registro</CardTitle>
            <CardDescription>Elige tu tipo de cuenta</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 mb-5">
              {(
                [
                  { value: "taxpayer", label: "Contribuyente", icon: User },
                  { value: "accountant", label: "Contador", icon: Calculator },
                ] as const
              ).map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setRole(value);
                    setErrors({});
                  }}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg border p-3 text-sm font-medium transition-colors",
                    role === value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  <Icon size={20} />
                  {label}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div className="space-y-1">
                <Label htmlFor="name">Nombre completo *</Label>
                <Input
                  id="name"
                  value={form.fullName}
                  onChange={set("fullName")}
                  className="h-11"
                  autoComplete="name"
                />
                <FieldError name="fullName" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="email">Correo *</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={set("email")}
                  className="h-11"
                  autoComplete="email"
                />
                <FieldError name="email" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="password">
                  Contraseña * <span className="text-xs text-muted-foreground">(mín. 8)</span>
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={form.password}
                  onChange={set("password")}
                  className="h-11"
                  autoComplete="new-password"
                />
                <FieldError name="password" />
              </div>

              {role === "taxpayer" ? (
                <>
                  <div className="space-y-1">
                    <Label htmlFor="rfc">RFC *</Label>
                    <Input
                      id="rfc"
                      value={form.rfc}
                      onChange={set("rfc")}
                      maxLength={13}
                      className="h-11 uppercase font-mono"
                      placeholder="ABCD800101XYZ"
                    />
                    <FieldError name="rfc" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="phone">
                      Teléfono * <span className="text-xs text-muted-foreground">(10 dígitos)</span>
                    </Label>
                    <Input
                      id="phone"
                      type="tel"
                      inputMode="numeric"
                      value={form.phone}
                      onChange={set("phone")}
                      className="h-11"
                      placeholder="5512345678"
                    />
                    <FieldError name="phone" />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1">
                    <Label htmlFor="license">Cédula profesional *</Label>
                    <Input
                      id="license"
                      value={form.licenseNumber}
                      onChange={set("licenseNumber")}
                      className="h-11"
                      maxLength={20}
                    />
                    <FieldError name="licenseNumber" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="spec">Despacho / especialidad *</Label>
                    <Input
                      id="spec"
                      value={form.specialization}
                      onChange={set("specialization")}
                      className="h-11"
                      maxLength={120}
                    />
                    <FieldError name="specialization" />
                  </div>
                </>
              )}

              <div className="flex items-start space-x-2">
                <Checkbox id="terms" checked={acceptTerms} onCheckedChange={(c) => setAcceptTerms(c === true)} />
                <label htmlFor="terms" className="text-sm text-muted-foreground leading-tight cursor-pointer">
                  Acepto los <span className="text-primary">términos</span> y el{" "}
                  <span className="text-primary">aviso de privacidad</span>
                </label>
              </div>
              <FieldError name="acceptTerms" />

              <Button type="submit" size="lg" className="w-full" disabled={loading}>
                {loading ? (
                  "Creando cuenta..."
                ) : (
                  <>
                    <UserPlus size={18} /> Crear cuenta
                  </>
                )}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                ¿Ya tienes cuenta?{" "}
                <Link to="/login" className="text-primary hover:underline font-medium">
                  Inicia sesión
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Register;
