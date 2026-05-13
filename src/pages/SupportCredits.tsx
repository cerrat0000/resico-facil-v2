import React, { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Sparkles,
  ShieldCheck,
  TrendingUp,
  Wallet,
  FileText,
  Download,
  CheckCircle2,
  Clock,
  RefreshCw,
  ArrowRight,
  Activity,
  ChevronLeft,
  DollarSign,
  Briefcase,
  PieChart,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  useLatestScore,
  useFinancialApplications,
  useRecomputeScore,
  useCreateApplication,
  useApproveApplication,
  useGenerateApprovalPdf,
  computePayment,
  downloadApprovalPdf,
  type FinancialApplication,
} from "@/hooks/useFinancialModule";

// Utilidad segura para formato moneda
const fmt = (n: number | null | undefined) => `$${Math.round(Number(n ?? 0)).toLocaleString("es-MX")} MXN`;

interface BankOptionType {
  id: string;
  name: string;
  color: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
  monthlyRate: number;
  limitMultiplier: number;
  description: string;
  btnClass: string;
  minScoreReq?: number;
  minMonthsReq?: number;
  minIncomeReq?: number;
}

const BANK_OPTIONS: BankOptionType[] = [
  {
    id: "banorte",
    name: "Banorte",
    color: "emerald",
    bgClass: "bg-emerald-50",
    textClass: "text-emerald-700",
    borderClass: "border-emerald-200",
    monthlyRate: 0.031,
    limitMultiplier: 20,
    description: "Financiamiento directo.",
    btnClass: "bg-emerald-600 hover:bg-emerald-700 text-white w-full font-medium",
    minScoreReq: 650,
    minMonthsReq: 6,
  },
  {
    id: "bbva",
    name: "BBVA",
    color: "blue",
    bgClass: "bg-sky-50",
    textClass: "text-sky-700",
    borderClass: "border-sky-200",
    monthlyRate: 0.035,
    limitMultiplier: 15,
    description: "Línea de Crédito Personal.",
    btnClass: "bg-[#004494] hover:bg-[#003377] text-white w-full font-medium",
    minScoreReq: 600,
    minMonthsReq: 3,
  },
  {
    id: "santander",
    name: "Santander",
    color: "red",
    bgClass: "bg-rose-50",
    textClass: "text-rose-700",
    borderClass: "border-rose-200",
    monthlyRate: 0.038,
    limitMultiplier: 12,
    description: "Crédito Nómina / Consumos.",
    btnClass: "bg-[#EC0000] hover:bg-[#cc0000] text-white w-full font-medium",
    minScoreReq: 550,
  },
  {
    id: "azteca",
    name: "Banco Azteca",
    color: "orange",
    bgClass: "bg-orange-50",
    textClass: "text-orange-700",
    borderClass: "border-orange-200",
    monthlyRate: 0.048,
    limitMultiplier: 8,
    description: "Opciones rápidas.",
    btnClass: "bg-orange-600 hover:bg-orange-700 text-white w-full font-bold shadow-sm border-orange-500",
    minScoreReq: 0,
  },
];

const statusMeta = (s: string) => {
  switch (s) {
    case "in_review":
      return { label: "En revisión", cls: "bg-sky-100 text-sky-800" };
    case "analyzing":
      return { label: "En análisis", cls: "bg-indigo-100 text-indigo-800" };
    case "preapproved":
      return { label: "Preaprobado", cls: "bg-emerald-100 text-emerald-800" };
    case "approved":
      return { label: "Aprobado", cls: "bg-emerald-100 text-emerald-800" };
    case "pending_release":
      return { label: "Pendiente de liberación", cls: "bg-amber-100 text-amber-900" };
    case "rejected":
      return { label: "No aprobado", cls: "bg-rose-100 text-rose-800" };
    default:
      return { label: s || "Desconocido", cls: "bg-muted text-muted-foreground" };
  }
};

const ANALYSIS_STEPS = [
  "Validando RFC",
  "Analizando ingresos",
  "Revisando actividad fiscal",
  "Calculando capacidad de pago",
  "Evaluando perfil financiero",
];

const TimelineRow: React.FC<{ done: boolean; label: string; pending?: boolean }> = ({ done, label, pending }) => (
  <div className="flex items-center gap-3">
    <div
      className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
        done
          ? "bg-emerald-100 text-emerald-700"
          : pending
            ? "bg-amber-100 text-amber-700"
            : "bg-muted text-muted-foreground"
      }`}
    >
      {done ? <CheckCircle2 size={16} /> : <Clock size={14} />}
    </div>
    <span className={`text-sm ${done ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
  </div>
);

const ScoreRing: React.FC<{ score: number }> = ({ score }) => {
  const pct = Math.min(1, Math.max(0, (score - 300) / 550));
  const r = 56;
  const c = 2 * Math.PI * r;
  const dash = c * pct;

  return (
    <div className="relative w-36 h-36">
      <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
        <circle cx="70" cy={70} r={r} stroke="hsl(var(--muted))" strokeWidth="10" fill="none" />
        <circle
          cx={70}
          cy={70}
          r={r}
          stroke="hsl(var(--primary))"
          strokeWidth="10"
          fill="none"
          strokeDasharray={`${dash} ${c}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 700ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-3xl font-bold font-display">{score}</p>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Score</p>
      </div>
    </div>
  );
};

const SupportCredits: React.FC = () => {
  const { data: score, isLoading: scoreLoading } = useLatestScore();
  const { data: apps = [], isLoading: appsLoading } = useFinancialApplications();
  const recompute = useRecomputeScore();
  const createApp = useCreateApplication();
  const approveApp = useApproveApplication();
  const genPdf = useGenerateApprovalPdf();

  const [activeView, setActiveView] = useState<"dashboard" | "bank-sim">("dashboard");
  const [selectedBankId, setSelectedBankId] = useState<string>("banorte");

  const currentBank = useMemo(() => {
    return BANK_OPTIONS.find((b) => b.id === selectedBankId) || BANK_OPTIONS[0];
  }, [selectedBankId]);

  const maxAmount = useMemo(() => {
    if (!score) return 50000;
    const monthlyIncome = score.monthly_avg_income ?? 0;
    let limitBase = monthlyIncome * currentBank.limitMultiplier;
    if (limitBase > 50000000) limitBase = 50000000;
    return Math.max(5000, Math.round(limitBase / 1000) * 1000);
  }, [score, currentBank.limitMultiplier]);

  const eligibleBanks = useMemo(() => {
    if (!score) return [];
    const userScore = score.score ?? 0;
    const activeMonths = score.active_months ?? 0;
    const monthlyIncome = score.monthly_avg_income ?? 0;
    return BANK_OPTIONS.filter((bank) => {
      const hasMinScore = userScore >= (bank.minScoreReq ?? 0);
      const hasMinAge = activeMonths >= (bank.minMonthsReq ?? 0);
      const hasMinIncome = monthlyIncome >= (bank.minIncomeReq ?? 0);
      return hasMinScore && hasMinAge && hasMinIncome;
    });
  }, [score]);

  const [amount, setAmount] = useState<number>(Math.min(80000, maxAmount));
  const [term, setTerm] = useState<number>(18);

  useEffect(() => {
    if (amount > maxAmount) {
      setAmount(maxAmount);
    }
  }, [maxAmount]);

  useEffect(() => {
    if (!scoreLoading && !score && !recompute.isPending) {
      recompute.mutate();
    }
  }, [scoreLoading, score]);

  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [resultApp, setResultApp] = useState<FinancialApplication | null>(null);

  const startEvaluation = async () => {
    if (!score) {
      toast.error("Aún estamos calculando tu perfil.");
      return;
    }

    setResultApp(null);
    setAnalysisStep(0);
    setAnalysisOpen(true);

    try {
      for (let i = 1; i <= ANALYSIS_STEPS.length; i++) {
        await new Promise((resolve) => setTimeout(resolve, 700));
        setAnalysisStep(i);
      }

      const created = await createApp.mutateAsync({
        requested_amount: amount,
        term_months: term,
        monthly_rate: currentBank.monthlyRate,
        cat_estimate: (Math.pow(1 + currentBank.monthlyRate, 12) - 1) / 100,
        score_snapshot: score.score,
        risk_snapshot: score.risk_level,
      });

      if (score.score >= 600) {
        const approvedAmount = amount;
        const { monthly } = computePayment(approvedAmount, term, currentBank.monthlyRate);

        await approveApp.mutateAsync({
          id: created.id,
          approved_amount: approvedAmount,
          approved_term_months: term,
          approved_monthly_payment: monthly,
        });
        setResultApp({
          ...created,
          status: "pending_release",
          approved_amount: approvedAmount,
          approved_term_months: term,
          approved_monthly_payment: monthly,
          approved_at: new Date().toISOString(),
        });
      } else {
        setResultApp(created);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al evaluar");
      setAnalysisOpen(false);
    }
  };

  const handleDownloadPdf = async (app: FinancialApplication) => {
    try {
      let path = app.pdf_path;
      if (!path) {
        const res = await genPdf.mutateAsync(app.id);
        path = res?.path;
      }
      if (path) {
        await downloadApprovalPdf(path, app.folio);
      } else {
        toast.error("Ruta PDF no disponible");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo descargar el documento");
    }
  };

  const lastApp = apps[0];

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-6 pb-12">
        {/* HEADER SIMPLIFICADO */}
        <div className="flex items-start justify-between gap-3 flex-wrap pt-4">
          <div>
            <h1 className="text-2xl font-bold font-display">Apoyo Financiero</h1>
            <p className="text-sm text-muted-foreground mt-1">Tu actividad fiscal es la base de tu crédito.</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => recompute.mutate(undefined, { onSuccess: () => toast.success("Perfil actualizado") })}
            disabled={recompute.isPending}
          >
            <RefreshCw size={14} className={recompute.isPending ? "animate-spin" : ""} />
            Actualizar perfil
          </Button>
        </div>

        {/* VISTA 1: DASHBOARD PRINCIPAL CON PERFILES Y ELEGIBILIDAD */}
        {activeView === "dashboard" ? (
          <div className="space-y-8 animate-in fade-in zoom-in duration-300">
            {/* SECCIÓN 1: TUS INGRESOS REALES */}
            {scoreLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-8 w-64" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-32 w-full" />
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="text-emerald-600" />
                  <h2 className="text-xl font-bold font-display">Tus Ingresos y Actividad</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <Card className="shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Ingreso Mensual Promedio
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-emerald-700">{fmt(score.monthly_avg_income)}</div>
                      <p className="text-xs text-muted-foreground mt-1">Basado en tu declaración reciente.</p>
                    </CardContent>
                  </Card>

                  <Card className="shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Meses Activos</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-blue-700">{score.active_months}</div>
                      <p className="text-xs text-muted-foreground mt-1">Constancia de operación.</p>
                    </CardContent>
                  </Card>

                  <Card className="shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Declaraciones Presentadas
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-purple-700">{score.declarations_count}</div>
                      <p className="text-xs text-muted-foreground mt-1">Historial impositivo.</p>
                    </CardContent>
                  </Card>
                </div>
              </>
            )}

            {/* SECCIÓN 2: FINANCIERAS DISPONIBLES PARA TI */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Briefcase className="text-primary" />
                  <h2 className="text-xl font-bold font-display">Financieras a las que calificas</h2>
                </div>
                <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full font-medium">
                  {eligibleBanks.length} opciones activas
                </span>
              </div>

              {eligibleBanks.length === 0 ? (
                <div className="p-8 bg-yellow-50 border border-yellow-200 rounded-xl text-center">
                  <p className="text-yellow-800 font-semibold">
                    No contamos con opciones bancarias activas actualmente.
                  </p>
                  <p className="text-sm text-yellow-700 mt-2">
                    Te recomendamos actualizar tus declaraciones o espera unos meses para recalcular tu riesgo.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {eligibleBanks.map((bank) => (
                    <Card
                      key={bank.id}
                      // CORREGIDO: Usamos inline style para evitar errores de compilación por clases dinámicas complejas
                      className={`hover:shadow-lg transition-all cursor-pointer overflow-hidden group border-t-4`}
                      style={{
                        borderTopColor: bank.btnClass.includes("emerald")
                          ? "#10b981"
                          : bank.btnClass.includes("blue")
                            ? "#0ea5e9"
                            : bank.btnClass.includes("red")
                              ? "#f43f5e"
                              : "#f59e0b",
                      }}
                      onClick={() => setSelectedBankId(bank.id)}
                    >
                      <CardHeader className={`${bank.bgClass} pb-2 pt-4 border-b ${bank.borderClass}`}>
                        <CardTitle className={`font-bold ${bank.textClass} flex items-center justify-between`}>
                          {bank.name}
                          <CheckCircle2 size={16} className="opacity-50" />
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-6">
                        <p className="text-xs text-muted-foreground mb-4">{bank.description}</p>
                        <div className="space-y-2">
                          <Button
                            className={bank.btnClass}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedBankId(bank.id);
                              setActiveView("bank-sim");
                            }}
                          >
                            Solicitar Crédito
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {eligibleBanks.length < BANK_OPTIONS.length && (
                <p className="text-center text-xs text-muted-foreground mt-4">
                  Algunos bancos requieren mejores puntuaciones o mayor antigüedad para liberar créditos. Sigue
                  reportando tus ingresos.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4 animate-in slide-in-from-right duration-300">
            <div className="flex items-center gap-4 mb-2">
              <Button variant="ghost" size="icon" onClick={() => setActiveView("dashboard")}>
                <ChevronLeft size={20} />
              </Button>
              <div>
                <h2 className="text-xl font-bold font-display flex items-center gap-2">
                  <Wallet className="text-primary" size={20} /> Simulador{" "}
                  <span className="text-muted-foreground font-normal">| {currentBank.name}</span>
                </h2>
              </div>
            </div>

            {/* AQUÍ ESTÁ EL CAMBIO DE COLOR SOLICITADO */}
            <Card className="overflow-hidden border-0 shadow-md ring-1 ring-slate-200">
              {/* Se cambió el degradado de slate-900 a emerald-700/500 */}
              <div className="bg-gradient-to-br from-emerald-700 via-emerald-600 to-emerald-500 text-white p-6 relative overflow-hidden">
                <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none"></div>

                <div className="relative z-10 flex flex-col md:flex-row gap-6 items-center md:items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="bg-white/10 p-3 rounded-xl backdrop-blur-sm border border-white/10">
                      <ScoreRing score={score?.score ?? 0} />
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-widest opacity-70 mb-1">Tu estado actual</p>
                      <div className="flex gap-2">
                        <Badge className="bg-white/20 text-white border-transparent">Calificado</Badge>
                        <Badge className="bg-black/20 text-white border-transparent">Riesgo Medio</Badge>
                      </div>
                    </div>
                  </div>

                  <div className="text-center md:text-right">
                    <p className="text-xs uppercase tracking-widest opacity-70 mb-1">Oferta preliminar</p>
                    {/* Ajuste de color de texto para contraste sobre verde */}
                    <p className="text-2xl md:text-4xl font-bold font-display text-emerald-100">
                      Hasta {fmt(maxAmount)}
                    </p>
                    <p className="text-xs text-emerald-100/70 mt-1">Disponible en {currentBank.name}</p>
                  </div>
                </div>
              </div>
            </Card>

            <Card
              className="shadow-lg border-t-4 border-l-4"
              style={{ borderTopColor: "#10b981", borderLeftColor: "#10b981" }}
            >
              <CardHeader className="pb-4 bg-slate-50/50">
                <CardTitle className="text-base font-display flex items-center gap-2">
                  <Sparkles size={18} className="text-amber-500" />
                  Calcula tu plan de pagos
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-8 pt-6">
                <div className="grid md:grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Monto solicitado</span>
                      <span className="font-bold font-display">{fmt(amount)}</span>
                    </div>
                    <Slider
                      value={[amount]}
                      min={5000}
                      max={maxAmount}
                      step={1000}
                      onValueChange={(v) => setAmount(v[0])}
                    />
                    <div className="flex justify-between text-xs text-muted-foreground px-1">
                      <span>{fmt(5000)}</span>
                      <span>{fmt(maxAmount)}</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Plazo</span>
                      <span className="font-bold font-display">{term} meses</span>
                    </div>
                    <Slider value={[term]} min={6} max={36} step={3} onValueChange={(v) => setTerm(v[0])} />
                    <div className="flex justify-between text-xs text-muted-foreground px-1">
                      <span>6 meses</span>
                      <span>36 meses</span>
                    </div>
                  </div>
                </div>

                {(() => {
                  const rate = currentBank.monthlyRate;
                  const sim = computePayment(amount, term, rate);
                  const catTEA = (Math.pow(1 + rate, 12) - 1) * 100;

                  return (
                    <>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                          <p className="text-[10px] uppercase tracking-wider text-slate-500">Pago Mensual</p>
                          <p className="text-xl font-bold font-display text-slate-900">{fmt(sim.monthly)}</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                          <p className="text-[10px] uppercase tracking-wider text-slate-500">Total a pagar</p>
                          <p className="text-xl font-bold font-display text-slate-900">{fmt(sim.total)}</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                          <p className="text-[10px] uppercase tracking-wider text-slate-500">Tasa Nominal</p>
                          <p className="text-xl font-bold font-display text-slate-900">
                            {(rate * 100).toFixed(2)}%{" "}
                            <span className="text-xs font-normal text-slate-400">mensual</span>
                          </p>
                        </div>
                        <div className="rounded-xl bg-blue-50 border border-blue-100 p-3">
                          <p className="text-[10px] uppercase tracking-wider text-blue-600">Cat (TEA)</p>
                          <p className="text-xl font-bold font-display text-blue-800">{catTEA.toFixed(2)}%</p>
                        </div>
                      </div>

                      <div className="pt-2 flex flex-col md:flex-row justify-end gap-3">
                        <Button
                          size="lg"
                          className="w-full md:w-auto shadow-lg"
                          onClick={startEvaluation}
                          disabled={createApp.isPending}
                        >
                          Solicitar evaluación financiera <ArrowRight size={16} />
                        </Button>
                      </div>

                      <p className="text-[10px] text-muted-foreground leading-relaxed italic text-right">
                        * La información mostrada es una simulación basada en tasas estimadas de {currentBank.name}.
                      </p>
                    </>
                  );
                })()}
              </CardContent>
            </Card>

            <Card className="mt-8">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-display flex items-center gap-2">
                  <FileText size={18} /> Historial de solicitudes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {appsLoading ? (
                  [1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)
                ) : apps.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Aún no tienes solicitudes</p>
                ) : (
                  apps.map((app) => {
                    const sm = statusMeta(app.status);
                    const isApproved = ["approved", "pending_release"].includes(app.status);
                    return (
                      <div key={app.id} className="rounded-xl border p-4 space-y-3 hover:shadow-sm transition-shadow">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div>
                            <p className="text-xs text-muted-foreground">Folio {app.folio}</p>
                            <p className="font-semibold font-display">
                              {fmt(
                                isApproved ? Number(app.approved_amount) || app.requested_amount : app.requested_amount,
                              )}
                              <span className="text-sm text-muted-foreground font-normal">
                                {" "}
                                · {app.approved_term_months ?? app.term_months} meses
                              </span>
                            </p>
                          </div>
                          <Badge className={`${sm.cls} border-0`}>{sm.label}</Badge>
                        </div>
                        {isApproved && (
                          <div className="pt-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDownloadPdf(app)}
                              disabled={genPdf.isPending}
                            >
                              <Download size={14} /> Descargar carta oficial
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <Dialog
        open={analysisOpen}
        onOpenChange={(o) => {
          if (!createApp.isPending) setAnalysisOpen(o);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">
              {resultApp ? "Resultado de tu evaluación" : "Analizando tu perfil"}
            </DialogTitle>
          </DialogHeader>

          {!resultApp ? (
            <div className="space-y-4 py-2">
              <Progress value={(analysisStep / ANALYSIS_STEPS.length) * 100} className="h-2" />
              <div className="space-y-2.5">
                {ANALYSIS_STEPS.map((s, i) => (
                  <div key={s} className="flex items-center gap-3 text-sm">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                        i < analysisStep
                          ? "bg-emerald-100 text-emerald-700"
                          : i === analysisStep
                            ? "bg-emerald-200 text-emerald-800 animate-pulse"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {i < analysisStep ? <CheckCircle2 size={14} /> : <Clock size={12} />}
                    </div>
                    <span className={i <= analysisStep ? "text-foreground" : "text-muted-foreground"}>{s}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : ["approved", "pending_release"].includes(resultApp.status) ? (
            <div className="space-y-4 py-2">
              <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 p-4 text-center">
                <CheckCircle2 size={36} className="mx-auto text-emerald-600 mb-2" />
                <p className="text-sm text-emerald-800/80">Solicitud aprobada preliminarmente</p>
                <p className="text-2xl font-bold font-display text-emerald-900 mt-1">
                  {fmt(Number(resultApp.approved_amount) || 0)}
                </p>
                <p className="text-xs text-emerald-800/70 mt-1">
                  {resultApp.approved_term_months} meses · {fmt(Number(resultApp.approved_monthly_payment) || 0)} / mes
                </p>
              </div>
              <div className="text-xs text-muted-foreground text-center">
                Estado: <strong>Pendiente de liberación</strong>. Generando contrato digital.
              </div>
              <Button className="w-full" onClick={() => handleDownloadPdf(resultApp)} disabled={genPdf.isPending}>
                <Download size={16} /> Descargar carta oficial
              </Button>
            </div>
          ) : (
            <div className="space-y-3 py-2 text-center">
              <TrendingUp size={36} className="mx-auto text-muted-foreground" />
              <p className="font-semibold">Tu solicitud quedó en revisión</p>
              <p className="text-sm text-muted-foreground">
                Sigue registrando ingresos y declaraciones para mejorar tu perfil financiero.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default SupportCredits;
