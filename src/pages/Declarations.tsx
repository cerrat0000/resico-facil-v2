import React, { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  FileText,
  CheckCircle2,
  Loader2,
  Sparkles,
  Download,
  ArrowLeft,
  Calculator,
  Wallet,
  TrendingDown,
  Receipt,
  Pencil,
  Save,
  CreditCard,
  ScrollText,
} from "lucide-react";
import { toast } from "sonner";
import {
  useCalculateTaxPeriod,
  useDeclarationDrafts,
  useTaxCalculations,
  useGenerateDeclarationPdf,
  useRefreshPdfSignedUrl,
  type TaxCalculation,
} from "@/hooks/useTaxEngine";
import { useTaxpayerProfile } from "@/hooks/useTaxpayerProfile";
import { useGenerateCfdiDemo, useRefreshCfdiSignedUrl } from "@/hooks/useDeclarationPayments";
import { DeclarationCheckout } from "@/components/DeclarationCheckout";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";

const fmt = (n: number) =>
  `$${Number(n ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const downloadPdf = async (url: string, fileName: string) => {
  if (!url) return;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("No se pudo obtener el archivo del servidor");

    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
    }, 100);
  } catch (error) {
    console.error("Error en descarga segura:", error);
    window.open(url, "_blank");
  }
};

type Mode = "home" | "flow";

const Declarations = () => {
  const now = new Date();
  const [mode, setMode] = useState<Mode>("home");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [currentCalc, setCurrentCalc] = useState<TaxCalculation | null>(null);
  const [editIncome, setEditIncome] = useState("");
  const [editExpenses, setEditExpenses] = useState("");
  const [dirty, setDirty] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [payingDraftId, setPayingDraftId] = useState<string | null>(null);
  const [cfdiBusyId, setCfdiBusyId] = useState<string | null>(null);

  const { data: profile } = useTaxpayerProfile();
  const { data: calculations, isLoading } = useTaxCalculations({ onlyCurrent: true });
  const { data: drafts } = useDeclarationDrafts();
  const calculate = useCalculateTaxPeriod();
  const generatePdf = useGenerateDeclarationPdf();
  const refreshSigned = useRefreshPdfSignedUrl();
  const generateCfdi = useGenerateCfdiDemo();
  const refreshCfdi = useRefreshCfdiSignedUrl();

  const years = Array.from({ length: 5 }).map((_, i) => now.getFullYear() - i);

  const draftByCalc = useMemo(() => {
    const map = new Map<string, any>();
    (drafts ?? []).forEach((d) => {
      if (d.calculation_id) map.set(d.calculation_id, d);
    });
    return map;
  }, [drafts]);

  useEffect(() => {
    if (currentCalc) {
      setEditIncome(String(currentCalc.total_income ?? 0));
      setEditExpenses(String(currentCalc.total_expenses ?? 0));
      setDirty(false);
    }
  }, [currentCalc?.id]);

  const currentDraft = currentCalc ? draftByCalc.get(currentCalc.id) : null;

  const livePreview = useMemo(() => {
    if (!currentCalc) return null;
    const i = Number(editIncome) || 0;
    const e = Number(editExpenses) || 0;
    const base = Math.max(0, i - e);
    const rate = Number(currentCalc.applied_rate) || 0;
    return { base, isr: base * rate, rate };
  }, [editIncome, editExpenses, currentCalc]);

  const startNewFlow = () => {
    setMode("flow");
    setCurrentCalc(null);
  };

  const startEditFlow = (c: TaxCalculation) => {
    setYear(c.period_year);
    setMonth(c.period_month);
    setCurrentCalc(c);
    setMode("flow");
  };

  const handleCalculate = async () => {
    try {
      const calc = await calculate.mutateAsync({
        year,
        month,
        taxpayer_profile_id: profile?.id ?? null,
      });
      setCurrentCalc(calc);
      toast.success("Listo, revisa tus números");
    } catch (e: any) {
      toast.error(e.message ?? "Error al calcular");
    }
  };

  const handleSaveChanges = async () => {
    if (!currentCalc) return;
    const i = Number(editIncome),
      e = Number(editExpenses);
    if (![i, e].every((n) => Number.isFinite(n) && n >= 0)) {
      toast.error("Los montos no pueden ser negativos");
      return;
    }
    try {
      setSavingAll(true);
      let calc = currentCalc;
      if (dirty) {
        const base = Math.max(0, +(i - e).toFixed(2));
        calc = await calculate.mutateAsync({
          year: currentCalc.period_year,
          month: currentCalc.period_month,
          taxpayer_profile_id: profile?.id ?? null,
          overrides: {
            total_income: +i.toFixed(2),
            total_expenses: +e.toFixed(2),
            taxable_base: base,
          },
        });
        setCurrentCalc(calc);
        toast.success("Impuesto recalculado");
      }
      await generatePdf.mutateAsync({ calculation_id: calc.id });
      toast.success("Declaración actualizada");
      setMode("home");
      setCurrentCalc(null);
    } catch (e: any) {
      toast.error(e.message ?? "No se pudo guardar");
    } finally {
      setSavingAll(false);
    }
  };

  const handleDownloadExisting = async (draft: any, fileName: string) => {
    try {
      setDownloadingId(draft.id);
      let url = draft.pdf_url as string | undefined;
      if (draft.pdf_storage_path) {
        try {
          url = await refreshSigned.mutateAsync(draft.pdf_storage_path);
        } catch {}
      }
      if (!url) throw new Error("PDF no disponible");
      await downloadPdf(url, fileName);
    } catch (e: any) {
      toast.error(e.message ?? "No se pudo abrir el PDF");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleQuickPdf = async (calcId: string, fileName: string) => {
    try {
      setDownloadingId(calcId);
      const res = await generatePdf.mutateAsync({ calculation_id: calcId });
      toast.success("PDF listo");
      await downloadPdf(res.pdf_url, fileName);
    } catch (e: any) {
      toast.error(e.message ?? "No se pudo generar el PDF");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDownloadCfdi = async (draft: any) => {
    try {
      setCfdiBusyId(draft.id);
      let url: string | undefined;
      if (draft.cfdi_demo_path) {
        try {
          url = await refreshCfdi.mutateAsync(draft.cfdi_demo_path);
        } catch {}
      }
      if (!url) {
        const res = await generateCfdi.mutateAsync(draft.id);
        url = res.url;
      }
      const fileName = `cfdi-demo-${draft.cfdi_demo_folio ?? draft.id.slice(0, 8)}.pdf`;
      await downloadPdf(url!, fileName);
      toast.success("Comprobante demo listo");
    } catch (e: any) {
      toast.error(e.message ?? "No se pudo generar el comprobante");
    } finally {
      setCfdiBusyId(null);
    }
  };

  const PaymentBadge = ({ status }: { status?: string | null }) => {
    const map: Record<string, { label: string; cls: string }> = {
      paid: { label: "Pagada", cls: "bg-green-100 text-green-700 hover:bg-green-100" },
      ready_to_pay: { label: "Lista para pagar", cls: "bg-amber-100 text-amber-800 hover:bg-amber-100" },
      under_review: { label: "En revisión", cls: "bg-blue-100 text-blue-700 hover:bg-blue-100" },
      pending: { label: "Pendiente", cls: "bg-muted text-muted-foreground hover:bg-muted" },
    };
    const cfg = map[status ?? "pending"] ?? map.pending;
    return <Badge className={`text-[10px] h-5 ${cfg.cls}`}>{cfg.label}</Badge>;
  };

  const renderHome = () => (
    <div className="space-y-5 pb-24 md:pb-6">
      <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-accent/30 overflow-hidden">
        <CardContent className="p-5 sm:p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="p-3 rounded-xl bg-primary/10 text-primary shrink-0">
              <Receipt size={24} />
            </div>
            <div className="min-w-0">
              <h2 className="font-display font-bold text-lg sm:text-xl">Tu declaración mensual</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Elige el mes, revisa tus números y descarga tu PDF para pagar.
              </p>
            </div>
          </div>
          <Button size="lg" className="w-full sm:w-auto h-12 text-base" onClick={startNewFlow}>
            <FileText size={18} /> Nueva declaración
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-base">Tus declaraciones</h3>
          <span className="text-xs text-muted-foreground">{calculations?.length ?? 0} en total</span>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : (calculations ?? []).length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center space-y-2">
              <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <FileText size={20} className="text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">Aún no tienes declaraciones</p>
              <p className="text-xs text-muted-foreground">Pulsa "Nueva declaración" para empezar.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {calculations!.map((c) => {
              const draft = draftByCalc.get(c.id);
              const hasPdf = draft?.status === "exported_pdf";
              const fileName = `declaracion-${c.period_year}-${String(c.period_month).padStart(2, "0")}.pdf`;
              const isBusy = downloadingId === c.id || downloadingId === draft?.id;
              return (
                <Card key={c.id} className="hover:border-primary/30 transition-colors">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm sm:text-base">
                            {MONTHS[c.period_month - 1]} {c.period_year}
                          </p>
                          {hasPdf ? (
                            <Badge className="text-[10px] h-5 bg-primary/15 text-primary hover:bg-primary/15">
                              <CheckCircle2 size={11} className="mr-1" /> Lista
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px] h-5">
                              Borrador
                            </Badge>
                          )}
                          <PaymentBadge status={draft?.payment_status} />
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Impuesto</p>
                        <p className="font-bold text-base sm:text-lg text-primary">{fmt(c.estimated_tax)}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Ingresos {fmt(c.total_income)}</span>
                      <span>Gastos {fmt(c.total_expenses)}</span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        className="flex-1 min-w-[120px] h-10"
                        onClick={() =>
                          hasPdf ? handleDownloadExisting(draft, fileName) : handleQuickPdf(c.id, fileName)
                        }
                        disabled={isBusy || generatePdf.isPending}
                      >
                        {isBusy ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <>
                            <Download size={14} /> {hasPdf ? "Descargar" : "Generar PDF"}
                          </>
                        )}
                      </Button>
                      <Button size="sm" variant="outline" className="h-10" onClick={() => startEditFlow(c)}>
                        <Pencil size={14} /> Editar
                      </Button>
                      {draft && draft.payment_status !== "paid" && Number(c.estimated_tax) >= 1 && (
                        <Button
                          size="sm"
                          className="h-10 bg-amber-500 hover:bg-amber-600 text-white"
                          onClick={() => setPayingDraftId(draft.id)}
                        >
                          <CreditCard size={14} /> Pagar Impuesto
                        </Button>
                      )}
                      {draft?.payment_status === "paid" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-10"
                          onClick={() => handleDownloadCfdi(draft)}
                          disabled={cfdiBusyId === draft.id}
                        >
                          {cfdiBusyId === draft.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <>
                              <ScrollText size={14} /> Comprobante
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  const renderFlow = () => (
    <div className="space-y-5 pb-36 md:pb-6">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setMode("home");
            setCurrentCalc(null);
          }}
        >
          <ArrowLeft size={16} /> Volver
        </Button>
      </div>

      <Card>
        <CardContent className="p-5 space-y-4">
          <h3 className="font-display font-semibold">¿Qué mes vas a declarar?</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Mes</Label>
              <Select
                value={String(month)}
                onValueChange={(v) => {
                  setMonth(Number(v));
                  setCurrentCalc(null);
                }}
                disabled={!!currentCalc}
              >
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Año</Label>
              <Select
                value={String(year)}
                onValueChange={(v) => {
                  setYear(Number(v));
                  setCurrentCalc(null);
                }}
                disabled={!!currentCalc}
              >
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {!currentCalc && (
            <Button type="button" size="lg" className="w-full h-12" onClick={handleCalculate} disabled={calculate.isPending}>
              {calculate.isPending ? (
                <>
                  <Loader2 size={18} className="animate-spin" /> Calculando…
                </>
              ) : (
                <>
                  <Calculator size={18} /> Calcular
                </>
              )}
            </Button>
          )}
        </CardContent>
      </Card>

      {currentCalc && (
        <Card>
          <CardContent className="p-5 space-y-4">
            <h3 className="font-display font-semibold">Revisa tus números</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl border bg-card p-4 space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Wallet size={14} />
                  <span className="text-xs font-medium uppercase tracking-wide">Ingresos</span>
                </div>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={editIncome}
                  onChange={(e) => {
                    setEditIncome(e.target.value);
                    setDirty(true);
                  }}
                  className="h-12 text-lg font-bold border-0 px-0 focus-visible:ring-0 shadow-none bg-transparent outline-none"
                />
              </div>
              <div className="rounded-xl border bg-card p-4 space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <TrendingDown size={14} />
                  <span className="text-xs font-medium uppercase tracking-wide">Gastos</span>
                </div>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={editExpenses}
                  onChange={(e) => {
                    setEditExpenses(e.target.value);
                    setDirty(true);
                  }}
                  className="h-12 text-lg font-bold border-0 px-0 focus-visible:ring-0 shadow-none bg-transparent outline-none"
                />
              </div>
              <div className="rounded-xl border-2 border-primary/40 bg-primary/5 p-4 space-y-2 sm:col-span-2">
                <div className="flex items-center gap-2 text-primary">
                  <Sparkles size={14} />
                  <span className="text-xs font-medium uppercase tracking-wide">Pagarías de impuesto</span>
                </div>
                <p className="text-3xl font-bold text-primary">
                  {fmt(dirty ? (livePreview?.isr ?? 0) : currentCalc.estimated_tax)}
                </p>
                {dirty && (
                  <p className="text-[11px] text-muted-foreground">
                    Estimación en vivo. Pulsa "Guardar cambios" para confirmarla.
                  </p>
                )}
              </div>
            </div>

            <Button
              size="lg"
              className="w-full h-14 text-base"
              onClick={handleSaveChanges}
              disabled={savingAll || calculate.isPending || generatePdf.isPending}
            >
              {savingAll ? (
                <>
                  <Loader2 size={18} className="animate-spin" /> Guardando…
                </>
              ) : (
                <>
                  <Save size={18} /> Guardar cambios
                </>
              )}
            </Button>

            {currentDraft?.status === "exported_pdf" && !dirty && (
              <Button
                variant="outline"
                size="lg"
                className="w-full h-12"
                onClick={() =>
                  handleDownloadExisting(
                    currentDraft,
                    `declaracion-${currentCalc.period_year}-${String(currentCalc.period_month).padStart(2, "0")}.pdf`,
                  )
                }
                disabled={downloadingId === currentDraft.id}
              >
                {downloadingId === currentDraft.id ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <>
                    <Download size={16} /> Descargar PDF actual
                  </>
                )}
              </Button>
            )}

            <p className="text-[11px] text-muted-foreground text-center">
              Documento informativo — valida en el SAT antes de presentar.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );

  return (
    <AppLayout>
      <PaymentTestModeBanner />
      <div className="max-w-3xl mx-auto px-1 sm:px-0">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold font-display">Declaraciones</h1>
        </div>
        {mode === "home" ? renderHome() : renderFlow()}
      </div>

      <Dialog open={!!payingDraftId} onOpenChange={(o) => !o && setPayingDraftId(null)}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-0">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle>Pagar Impuesto</DialogTitle>
          </DialogHeader>
          {payingDraftId && <DeclarationCheckout declarationId={payingDraftId} />}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default Declarations;
