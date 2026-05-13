import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DollarSign,
  FolderOpen,
  FileText,
  Users,
  Shield,
  Smartphone,
  ArrowRight,
  CheckCircle2,
  GraduationCap,
  HandCoins,
} from "lucide-react";

const features = [
  {
    icon: DollarSign,
    title: "Registra ingresos y gastos",
    description: "Lleva el control de tu negocio de forma simple y rápida",
  },
  {
    icon: FolderOpen,
    title: "Expediente digital",
    description: "Organiza todos tus documentos fiscales en un solo lugar",
  },
  { icon: FileText, title: "Declaración asistida", description: "Genera formularios listos para presentar al SAT" },
  {
    icon: Users,
    title: "Trabaja con tu contador",
    description: "Colabora fácilmente y comparte información de forma segura",
  },
  {
    icon: HandCoins,
    title: "Accede a créditos y apoyos",
    description: "Tu historial fiscal te abre puertas a financiamiento",
  },
  {
    icon: GraduationCap,
    title: "Aprende sobre tus finanzas",
    description: "Mini tutoriales para mejorar tus hábitos fiscales",
  },
];

const Index = () => (
  <div className="min-h-screen bg-background">
    {/* Header */}
    <header className="flex items-center justify-between px-4 md:px-8 py-4 max-w-6xl mx-auto">
      <h1 className="text-xl font-bold font-display text-primary">Resico Fácil</h1>
      <div className="flex gap-2">
        <Link to="/login">
          <Button variant="ghost" size="sm">
            Entrar
          </Button>
        </Link>
        <Link to="/register">
          <Button size="sm">Crear cuenta</Button>
        </Link>
      </div>
    </header>

    {/* Hero */}
    <section className="px-4 md:px-8 py-12 md:py-20 max-w-6xl mx-auto text-center">
      <div className="max-w-2xl mx-auto animate-fade-in">
        <h2 className="text-3xl md:text-5xl font-bold font-display leading-tight">
          Tus impuestos en RESICO, <span className="text-primary">sin complicaciones</span>
        </h2>
        <p className="text-muted-foreground mt-4 text-lg max-w-lg mx-auto">
          La plataforma más sencilla para que comerciantes y pequeños contribuyentes lleven su contabilidad y cumplan
          con el SAT.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">
          <Link to="/register">
            <Button variant="hero" size="xl">
              Comienza gratis <ArrowRight size={18} />
            </Button>
          </Link>
          <Link to="/login">
            <Button variant="outline-primary" size="xl">
              Ya tengo cuenta
            </Button>
          </Link>
        </div>
        <div className="flex items-center justify-center gap-4 mt-6 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <CheckCircle2 size={14} className="text-primary" /> Gratis el primer año
          </span>
          <span className="flex items-center gap-1">
            <Shield size={14} className="text-primary" /> Datos seguros
          </span>
          <span className="flex items-center gap-1">
            <Smartphone size={14} className="text-primary" /> Desde tu celular
          </span>
        </div>
      </div>
    </section>

    {/* Features */}
    <section className="px-4 md:px-8 py-12 max-w-6xl mx-auto">
      <h3 className="text-2xl font-bold font-display text-center mb-8">Todo lo que necesitas</h3>
      <div className="grid md:grid-cols-3 gap-4">
        {features.map((f, i) => (
          <Card key={i} className="hover:shadow-md transition-shadow">
            <CardContent className="p-5">
              <div className="p-2 rounded-lg bg-accent text-accent-foreground w-fit mb-3">
                <f.icon size={22} />
              </div>
              <h4 className="font-semibold font-display">{f.title}</h4>
              <p className="text-sm text-muted-foreground mt-1">{f.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>

    {/* CTA */}
    <section className="px-4 md:px-8 py-12 max-w-6xl mx-auto">
      <Card className="bg-primary text-primary-foreground">
        <CardContent className="p-8 text-center">
          <h3 className="text-2xl font-bold font-display">¿Listo para simplificar tus impuestos?</h3>
          <p className="mt-2 opacity-90">Crea tu cuenta en menos de 2 minutos y empieza a organizar tu negocio.</p>
          <Link to="/register">
            <Button variant="secondary" size="xl" className="mt-6">
              Crear cuenta gratis <ArrowRight size={18} />
            </Button>
          </Link>
        </CardContent>
      </Card>
    </section>

    {/* Footer */}
    <footer className="px-4 md:px-8 py-8 max-w-6xl mx-auto border-t border-border text-center text-sm text-muted-foreground">
      <p>© 2024 Resico Fácil. Todos los derechos reservados.</p>
    </footer>
  </div>
);

export default Index;
