import React, { useState, useEffect } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const RESICO_LIMIT = 3_500_000;

const incomeCategories = ["Ventas", "Servicios", "Comisiones", "Otros ingresos"];
const expenseCategories = ["Materia prima", "Renta", "Servicios", "Transporte", "Comida", "Papelería", "Otros gastos"];

interface Transaction {
  id: string;
  type: "income" | "expense";
  amount: number;
  category: string;
  description: string;
  date: string;
}

// ── Gráfica de barras verticales de fondo (solo visual) ─────────────────────
const INCOME_BARS = [88, 72, 50, 28];
const EXPENSE_BARS = [95, 78, 60, 44, 32, 20, 14];

const BgBarChart: React.FC<{ type: "income" | "expense" }> = ({ type }) => {
  const bars = type === "income" ? INCOME_BARS : EXPENSE_BARS;
  const color = type === "income" ? "#22c55e" : "#f87171";
  return (
    <div className="absolute inset-0 flex items-end gap-[4px] px-3 pointer-events-none" aria-hidden>
      {bars.map((pct, i) => (
        <div key={i} className="flex-1 rounded-t-md" style={{ height: `${pct}%`, background: color, opacity: 0.22 }} />
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

const IncomeExpenses = () => {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newType, setNewType] = useState<"income" | "expense">("income");
  const [newAmount, setNewAmount] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newDate, setNewDate] = useState(new Date().toISOString().split("T")[0]);

  // ── Load ──────────────────────────────────────────────────────────────────
  const loadTransactions = async () => {
    if (!user) return;
    setLoadingData(true);

    const [incomeRes, expenseRes] = await Promise.all([
      supabase
        .from("income_records")
        .select("id, amount, category_name, description, date")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("date", { ascending: false }),
      supabase
        .from("expense_records")
        .select("id, amount, category_name, description, date")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("date", { ascending: false }),
    ]);

    const income: Transaction[] = (incomeRes.data ?? []).map((r) => ({
      id: r.id,
      type: "income",
      amount: Number(r.amount),
      category: r.category_name ?? "",
      description: r.description ?? "",
      date: r.date,
    }));
    const expense: Transaction[] = (expenseRes.data ?? []).map((r) => ({
      id: r.id,
      type: "expense",
      amount: Number(r.amount),
      category: r.category_name ?? "",
      description: r.description ?? "",
      date: r.date,
    }));

    setTransactions([...income, ...expense].sort((a, b) => b.date.localeCompare(a.date)));
    setLoadingData(false);
  };

  useEffect(() => {
    loadTransactions();
  }, [user]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!newAmount || !newCategory) {
      toast.error("Completa monto y categoría");
      return;
    }
    if (!user) return;
    setSaving(true);

    const dateObj = new Date(newDate + "T00:00:00");
    const payload = {
      user_id: user.id,
      amount: parseFloat(newAmount),
      category_name: newCategory,
      description: newDescription || null,
      date: newDate,
      period_year: dateObj.getFullYear(),
      period_month: dateObj.getMonth() + 1,
      status: "active",
    };

    const { error } = await supabase.from(newType === "income" ? "income_records" : "expense_records").insert(payload);

    if (error) {
      toast.error(`Error al guardar: ${error.message}`);
    } else {
      toast.success(newType === "income" ? "Ingreso registrado" : "Gasto registrado");
      setDialogOpen(false);
      setNewAmount("");
      setNewCategory("");
      setNewDescription("");
      setNewDate(new Date().toISOString().split("T")[0]);
      await loadTransactions();
    }
    setSaving(false);
  };

  const totalIncome = transactions.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const totalExpenses = transactions.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const fmt = (n: number) => `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;

  const currentYear = new Date().getFullYear();
  const annualIncome = transactions
    .filter((t) => t.type === "income" && new Date(t.date + "T00:00:00").getFullYear() === currentYear)
    .reduce((s, t) => s + t.amount, 0);
  const resicoPercent = Math.min((annualIncome / RESICO_LIMIT) * 100, 100);
  const resicoWarning = resicoPercent >= 80 && resicoPercent < 100;
  const resicoExceeded = annualIncome >= RESICO_LIMIT;

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold font-display">Ingresos y Gastos</h1>

          <Dialog
            open={dialogOpen}
            onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) {
                setNewAmount("");
                setNewCategory("");
                setNewDescription("");
              }
            }}
          >
            <DialogTrigger asChild>
              <Button size="lg">
                <Plus size={18} /> Registrar
              </Button>
            </DialogTrigger>

            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-display">Nuevo registro</DialogTitle>
              </DialogHeader>

              {/* Wrapper with chart as absolute background */}
              <div className="relative rounded-xl overflow-hidden bg-white p-4">
                <BgBarChart type={newType} />

                <div className="relative z-10 space-y-4">
                  {/* Colored tabs */}
                  <Tabs
                    value={newType}
                    onValueChange={(v) => {
                      setNewType(v as "income" | "expense");
                      setNewCategory("");
                    }}
                  >
                    <TabsList className="grid w-full grid-cols-2 bg-muted/50 p-1 h-auto">
                      <TabsTrigger
                        value="income"
                        className="h-11 rounded-lg font-semibold bg-green-100 text-black border-2 border-green-200 data-[state=active]:bg-green-200 data-[state=active]:border-green-500 data-[state=active]:shadow-none data-[state=active]:text-black"
                      >
                        Ingreso
                      </TabsTrigger>
                      <TabsTrigger
                        value="expense"
                        className="h-11 rounded-lg font-semibold bg-red-100 text-black border-2 border-red-200 data-[state=active]:bg-red-200 data-[state=active]:border-red-500 data-[state=active]:shadow-none data-[state=active]:text-black"
                      >
                        Gasto
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>

                  {/* Form */}
                  <div className="space-y-2">
                    <Label>Monto</Label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={newAmount}
                      onChange={(e) => setNewAmount(e.target.value)}
                      className="h-12 text-lg"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Categoría</Label>
                    <Select value={newCategory} onValueChange={setNewCategory}>
                      <SelectTrigger className="h-12">
                        <SelectValue placeholder="Selecciona" />
                      </SelectTrigger>
                      <SelectContent>
                        {(newType === "income" ? incomeCategories : expenseCategories).map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Descripción (opcional)</Label>
                    <Input
                      placeholder="Ej: Venta de mercancía"
                      value={newDescription}
                      onChange={(e) => setNewDescription(e.target.value)}
                      className="h-12"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Fecha</Label>
                    <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="h-12" />
                  </div>
                  <Button size="lg" className="w-full" onClick={handleAdd} disabled={saving}>
                    {saving ? "Guardando..." : "Guardar"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* RESICO annual income limit */}
        <Card
          className={`border ${
            resicoExceeded ? "border-red-300" : resicoWarning ? "border-yellow-300" : "border-green-200"
          }`}
        >
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {(resicoWarning || resicoExceeded) && (
                  <AlertTriangle size={15} className={resicoExceeded ? "text-red-500" : "text-yellow-500"} />
                )}
                <div>
                  <p className="text-sm font-semibold">Límite de ingresos RESICO — {currentYear}</p>
                  <p className="text-xs text-muted-foreground">
                    Para permanecer en RESICO tus ingresos anuales no deben superar $3,500,000
                  </p>
                </div>
              </div>
              <span
                className={`text-sm font-bold shrink-0 ml-4 ${
                  resicoExceeded ? "text-red-600" : resicoWarning ? "text-yellow-600" : "text-green-700"
                }`}
              >
                {resicoPercent.toFixed(1)}%
              </span>
            </div>
            <Progress value={resicoPercent} className="h-2.5" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{loadingData ? "Calculando..." : `${fmt(annualIncome)} acumulado este año`}</span>
              <span className={resicoExceeded ? "text-red-600 font-semibold" : ""}>
                {resicoExceeded
                  ? "¡Límite superado!"
                  : loadingData
                    ? ""
                    : `Disponible: ${fmt(RESICO_LIMIT - annualIncome)}`}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Totals */}
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 text-green-700">
                <TrendingUp size={18} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Ingresos</p>
                <p className="text-lg font-bold font-display">{loadingData ? "..." : fmt(totalIncome)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-100 text-red-700">
                <TrendingDown size={18} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Gastos</p>
                <p className="text-lg font-bold font-display">{loadingData ? "..." : fmt(totalExpenses)}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* List */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-display">Movimientos recientes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loadingData ? (
              <p className="text-sm text-muted-foreground text-center py-8">Cargando...</p>
            ) : transactions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sin movimientos registrados</p>
            ) : (
              transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-lg ${tx.type === "income" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                    >
                      {tx.type === "income" ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{tx.description || tx.category}</p>
                      <p className="text-xs text-muted-foreground">
                        {tx.category} · {new Date(tx.date + "T00:00:00").toLocaleDateString("es-MX")}
                      </p>
                    </div>
                  </div>
                  <span className={`font-bold text-sm ${tx.type === "income" ? "text-green-700" : "text-red-600"}`}>
                    {tx.type === "income" ? "+" : "-"}
                    {fmt(tx.amount)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default IncomeExpenses;
