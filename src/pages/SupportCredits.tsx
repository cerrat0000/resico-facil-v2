import React, { useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Download,
  CheckCircle2,
  RefreshCw,
  ArrowRight,
  ShieldCheck,
  Landmark,
  AlertCircle,
  Clock,
  ChevronLeft,
  History,
} from "lucide-react";
import { toast } from "sonner";
import {
  useLatestScore,
  useFinancialApplications,
  useCreateApplication,
  useApproveApplication,
  useGenerateApprovalPdf,
  downloadApprovalPdf, // Este hook ya debe manejar el blob interno
  computePayment,
  type FinancialApplication,
} from "@/hooks/useFinancialModule";
import { cn } from "@/lib/utils";

const BANKS = [
  {
    id: "bbva",
    name: "BBVA México",
    color: "#004481",
    monthlyRate: 0.025,
    check: (income: number, expenses: number) => income - expenses > 25000,
  },
  {
    id: "citibanamex",
    name: "Citibanamex",
    color: "#004691",
    monthlyRate: 0.029,
    check: (income: number, expenses: number) => income > expenses * 1.5,
  },
  { id: "azteca", name: "Banco Azteca", color: "#1a472a", monthlyRate: 0.038, check: (income: number) => income > 0 },
];

const ANALYSIS_STEPS = [
  "Validando cumplimiento fiscal",
  "Analizando promedio de ingresos RESICO",
  "Calculando capacidad de pago inmediato",
  "Generando contrato de apertura",
  "Transfiriendo fondos vía SPEI",
];

const SupportCredits: React.FC = () => {
  const { data: score, isLoading: scoreLoading } = useLatestScore();
  const { data: apps = [], isLoading: appsLoading } = useFinancialApplications();
  const createApp = useCreateApplication();
  const approveApp = useApproveApplication();
  const genPdf = useGenerateApprovalPdf();

  const [view, setView] = useState<"home" | "application">("home");
  const [amount, setAmount] = useState<number>(47000);
  const [term, setTerm] = useState<number>(24);
  const [selectedBank, setSelectedBank] = useState<any>(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [analysisStep, setAnalysisStep] = useState(0);

  const availableBanks = useMemo(() => {
    if (!score) return [];
    const income = score.monthly_avg_income || 0;
    const expenses = Math.max(0, income - score.estimated_capacity / 5);
    return BANKS.filter((bank) => bank.check(income, expenses));
  }, [score]);

  const fmt = (n: number) => `$${Math.round(Number(n)).toLocaleString("es-MX")} MXN`;

  // --- DESCARGA LOCAL SEGURA (EVITA BLOQUEO DE CHROME) ---
  const handleDownloadPdf = async (app: FinancialApplication) => {
    const toastId = toast.loading("Preparando descarga local...");
    try {
      let path = app.pdf_path;

      // Si no existe el path, el backend lo genera
      if (!path) {
        const res = await genPdf.mutateAsync(app.id);
        path = res.path;
      }

      // downloadApprovalPdf usa window.URL.createObjectURL internamente
      // Esto dispara la descarga directa sin abrir tabs
      await downloadApprovalPdf(path!, `Contrato_${app.folio}.pdf`);

      toast.success("Archivo guardado en descargas", { id: toastId });
    } catch (e) {
      toast.error("Error al generar el flujo de datos", { id: toastId });
    }
  };

  const startAnalysis = async (bank: any) => {
    if (!score) return;
    setSelectedBank(bank);
    setAnalysisStep(0);
    setAnalysisOpen(true);

    try {
      for (let i = 1; i <= ANALYSIS_STEPS.length; i++) {
        await new Promise((r) => setTimeout(r, 700));
        setAnalysisStep(i);
      }

      const monthlyRate = bank.monthlyRate;
      const cat = Math.pow(1 + monthlyRate, 12) - 1;

      const created = await createApp.mutateAsync({
        requested_amount: amount,
        term_months: term,
        monthly_rate: monthlyRate,
        cat_estimate: cat,
        score_snapshot: score.score,
        risk_snapshot: score.risk_level,
      });

      const { monthly } = computePayment(amount, term, monthlyRate);
      await approveApp.mutateAsync({
        id: created.id,
        approved_amount: amount,
        approved_term_months: term,
        approved_monthly_payment: monthly,
      });

      setAnalysisOpen(false);
      setView("home");
      toast.success("Crédito aprobado y registrado.");
    } catch (e) {
      toast.error("Error en la validación");
      setAnalysisOpen(false);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold font-display text-primary">Apoyo Financiero</h1>
          {view === "application" && (
            <Button variant="ghost" onClick={() => setView("home")} className="text-muted-foreground">
              <ChevronLeft size={18} className="mr-1" /> Volver al historial
            </Button>
          )}
        </div>

        {view === "home" ? (
          <div className="space-y-6 animate-in fade-in">
            {/* Banner de Solicitud */}
            <Card className="border-none bg-gradient-to-br from-emerald-600 to-emerald-900 text-white shadow-xl rounded-3xl p-10">
              <div className="flex flex-col md:flex-row justify-between items-center gap-8">
                <div className="space-y-2">
                  <h2 className="text-3xl font-black tracking-tight">Nueva Línea de Crédito</h2>
                  <p className="opacity-80">Capital disponible basado en tu comportamiento tributario.</p>
                </div>
                <Button
                  size="lg"
                  className="bg-white text-emerald-800 hover:bg-emerald-50 h-16 px-12 text-xl font-black rounded-2xl shadow-2xl transition-transform hover:scale-105"
                  onClick={() => setView("application")}
                >
                  Solicitar Crédito <ArrowRight size={22} className="ml-2" />
                </Button>
              </div>
            </Card>

            {/* Historial (Para descargar contratos) */}
            <div className="space-y-4">
              <h3 className="font-bold text-lg flex items-center gap-2 text-slate-700">
                <History size={20} className="text-emerald-600" /> Historial de Solicitudes
              </h3>

              {appsLoading ? (
                <Skeleton className="h-24 w-full rounded-2xl" />
              ) : apps.length > 0 ? (
                <div className="grid gap-3">
                  {apps.map((app) => (
                    <Card
                      key={app.id}
                      className="hover:border-emerald-200 transition-all border-2 border-transparent shadow-sm"
                    >
                      <CardContent className="p-5 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-emerald-50 text-emerald-700 rounded-2xl flex items-center justify-center">
                            <Landmark size={24} />
                          </div>
                          <div>
                            <p className="font-bold text-lg">
                              Crédito Directo - {fmt(app.approved_amount || app.requested_amount)}
                            </p>
                            <p className="text-xs text-muted-foreground font-mono uppercase">
                              Folio: {app.folio} • {new Date(app.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="icon"
                          className="rounded-xl hover:bg-emerald-50 hover:text-emerald-700"
                          onClick={() => handleDownloadPdf(app)}
                        >
                          <Download size={20} />
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="py-20 text-center border-2 border-dashed rounded-[2rem] bg-slate-50 text-slate-400">
                  No hay créditos solicitados aún.
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Vista de Sliders (Igual a tu imagen) */
          <div className="space-y-8 animate-in slide-in-from-bottom-4">
            <Card className="p-12 shadow-2xl bg-white rounded-[2.5rem] border-none">
              <div className="grid md:grid-cols-2 gap-20">
                <div className="space-y-6">
                  <div className="flex justify-between items-end">
                    <label className="text-[11px] font-black text-emerald-900 tracking-[0.25em] uppercase">Monto</label>
                    <span className="text-4xl font-black text-emerald-600 tracking-tighter">{fmt(amount)}</span>
                  </div>
                  <Slider
                    value={[amount]}
                    min={5000}
                    max={100000}
                    step={1000}
                    onValueChange={(v) => setAmount(v[0])}
                    className="py-4"
                  />
                </div>
                <div className="space-y-6">
                  <div className="flex justify-between items-end">
                    <label className="text-[11px] font-black text-emerald-900 tracking-[0.25em] uppercase">Plazo</label>
                    <span className="text-4xl font-black text-emerald-600 tracking-tighter">{term} meses</span>
                  </div>
                  <Slider
                    value={[term]}
                    min={6}
                    max={48}
                    step={6}
                    onValueChange={(v) => setTerm(v[0])}
                    className="py-4"
                  />
                </div>
              </div>
            </Card>

            <div className="grid md:grid-cols-3 gap-6">
              {availableBanks.map((bank) => (
                <Card
                  key={bank.id}
                  className="overflow-hidden border-2 hover:border-emerald-500 transition-all rounded-[2rem] shadow-lg group"
                >
                  <div className="h-3 w-full" style={{ backgroundColor: bank.color }} />
                  <CardContent className="p-8 space-y-6">
                    <div className="flex justify-between items-center">
                      <h3 className="font-black text-2xl text-slate-800 tracking-tight">{bank.name}</h3>
                      <ShieldCheck className="text-emerald-500" size={24} />
                    </div>
                    <div className="bg-slate-50 p-5 rounded-2xl space-y-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      <div className="flex justify-between">
                        <span>Tasa mensual</span>
                        <span className="text-slate-900">{(bank.monthlyRate * 100).toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Anual CAT</span>
                        <span className="text-slate-900">
                          {((Math.pow(1 + bank.monthlyRate, 12) - 1) * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <Button
                      className="w-full text-white font-black h-14 rounded-2xl shadow-lg"
                      style={{ backgroundColor: bank.color }}
                      onClick={() => startAnalysis(bank)}
                    >
                      Seleccionar Banco
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>

      <Dialog open={analysisOpen} onOpenChange={setAnalysisOpen}>
        <DialogContent className="max-w-md p-12 text-center border-none shadow-2xl rounded-[3rem]">
          <DialogHeader>
            <DialogTitle className="text-center text-2xl font-black text-slate-800">Evaluando Perfil</DialogTitle>
          </DialogHeader>
          <div className="py-8">
            <RefreshCw size={64} className="text-emerald-500 animate-spin mx-auto" />
          </div>
          <div className="text-left space-y-4 bg-slate-50 p-8 rounded-[2rem]">
            {ANALYSIS_STEPS.map((s, i) => (
              <div
                key={s}
                className={cn(
                  "text-sm flex items-center gap-4",
                  i <= analysisStep ? "text-emerald-900 font-bold" : "text-slate-300",
                )}
              >
                <div
                  className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all",
                    i < analysisStep ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-200",
                  )}
                >
                  {i < analysisStep ? (
                    <CheckCircle2 size={14} />
                  ) : (
                    <div className="w-1.5 h-1.5 bg-slate-200 rounded-full" />
                  )}
                </div>
                {s}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default SupportCredits;
