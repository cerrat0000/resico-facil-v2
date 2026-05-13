// Calcula score financiero del usuario a partir de su actividad fiscal.
// No promete préstamos reales: produce indicadores de capacidad estimada.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const token = authHeader.replace("Bearer ", "");
    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supaUrl, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: claims, error: cErr } = await userClient.auth.getClaims(token);
    if (cErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = claims.claims.sub as string;
    const admin = createClient(supaUrl, service);

    // Pull activity
    const [incomeRes, expenseRes, declRes, profileRes, accountRes] = await Promise.all([
      admin.from("income_records").select("amount, period_year, period_month, date").eq("user_id", userId).eq("status", "active"),
      admin.from("expense_records").select("amount, period_year, period_month, date").eq("user_id", userId).eq("status", "active"),
      admin.from("declaration_drafts").select("id, status, created_at").eq("user_id", userId),
      admin.from("taxpayer_profiles").select("rfc, fiscal_address, economic_activity, onboarding_completed, created_at").eq("user_id", userId).maybeSingle(),
      admin.from("profiles").select("created_at, full_name").eq("user_id", userId).maybeSingle(),
    ]);

    const incomes = incomeRes.data ?? [];
    const expenses = expenseRes.data ?? [];
    const declarations = declRes.data ?? [];
    const profile = profileRes.data;
    const account = accountRes.data;

    // group by month
    const byMonth = new Map<string, { inc: number; exp: number }>();
    for (const r of incomes) {
      const k = `${r.period_year}-${r.period_month}`;
      const v = byMonth.get(k) ?? { inc: 0, exp: 0 };
      v.inc += Number(r.amount); byMonth.set(k, v);
    }
    for (const r of expenses) {
      const k = `${r.period_year}-${r.period_month}`;
      const v = byMonth.get(k) ?? { inc: 0, exp: 0 };
      v.exp += Number(r.amount); byMonth.set(k, v);
    }

    const months = Array.from(byMonth.values());
    const activeMonths = months.filter((m) => m.inc > 0).length;
    const monthlyAvgIncome = activeMonths ? months.reduce((s, m) => s + m.inc, 0) / activeMonths : 0;
    const monthlyAvgExpense = activeMonths ? months.reduce((s, m) => s + m.exp, 0) / activeMonths : 0;

    // Stability: stddev / mean
    const incomeValues = months.map((m) => m.inc).filter((v) => v > 0);
    const mean = incomeValues.length ? incomeValues.reduce((a, b) => a + b, 0) / incomeValues.length : 0;
    const variance = incomeValues.length ? incomeValues.reduce((s, v) => s + (v - mean) ** 2, 0) / incomeValues.length : 0;
    const stddev = Math.sqrt(variance);
    const stability = mean > 0 ? Math.max(0, 1 - stddev / mean) : 0;

    // Account age (months)
    const accountCreated = account?.created_at ? new Date(account.created_at) : new Date();
    const ageMonths = Math.max(0, (Date.now() - accountCreated.getTime()) / (1000 * 60 * 60 * 24 * 30));

    // Profile completion
    const profileFields = ["rfc", "fiscal_address", "economic_activity"] as const;
    const profileCompleted = profile ? profileFields.filter((f) => !!(profile as any)[f]).length / profileFields.length : 0;

    // Declarations count
    const declarationsCount = declarations.length;
    const finalizedDecls = declarations.filter((d) => ["finalized","exported_pdf","submitted","paid"].includes(d.status as string)).length;

    // Score 300-850
    let score = 350;
    score += Math.min(150, monthlyAvgIncome / 200); // up to +150 by income
    score += Math.min(120, activeMonths * 12); // consistency
    score += Math.min(80, stability * 80);
    score += Math.min(60, ageMonths * 5);
    score += Math.min(60, profileCompleted * 60);
    score += Math.min(40, finalizedDecls * 10);
    score = Math.round(Math.max(300, Math.min(850, score)));

    let riskLevel: string;
    if (score >= 720) riskLevel = "low";
    else if (score >= 600) riskLevel = "medium";
    else riskLevel = "high";

    // Capacity: 35% disposable * 18 months
    const disposable = Math.max(0, monthlyAvgIncome - monthlyAvgExpense);
    const baseCapacity = disposable * 0.35 * 18;
    const riskFactor = riskLevel === "low" ? 1 : riskLevel === "medium" ? 0.7 : 0.4;
    const estimatedCapacity = Math.round(baseCapacity * riskFactor / 1000) * 1000;

    const breakdown = {
      monthlyAvgIncome, monthlyAvgExpense, stability, activeMonths, ageMonths,
      profileCompleted, declarationsCount, finalizedDecls, disposable,
    };

    const { data: inserted, error: insErr } = await admin.from("financial_scores").insert({
      user_id: userId,
      score,
      risk_level: riskLevel,
      estimated_capacity: estimatedCapacity,
      monthly_avg_income: monthlyAvgIncome,
      monthly_avg_expense: monthlyAvgExpense,
      active_months: activeMonths,
      declarations_count: declarationsCount,
      breakdown,
    }).select().single();
    if (insErr) throw insErr;

    return new Response(JSON.stringify({ ok: true, score: inserted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
