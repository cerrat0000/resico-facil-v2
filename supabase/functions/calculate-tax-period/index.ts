// Edge Function: calculate-tax-period
// Calcula ISR estimado RESICO para un periodo (mes/año) y persiste un snapshot.
//
// RESICO PF (Régimen Simplificado de Confianza) - Tasa configurable v1
// Tabla simplificada por ingresos mensuales (artículo 113-E LISR, valores aproximados).
// Esta es una versión inicial documentada y fácil de modificar.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

// Tasas RESICO (mensual) — fácilmente ajustables
const RESICO_BRACKETS: { upTo: number; rate: number }[] = [
  { upTo: 25_000, rate: 0.01 },
  { upTo: 50_000, rate: 0.011 },
  { upTo: 83_333.33, rate: 0.015 },
  { upTo: 208_333.33, rate: 0.02 },
  { upTo: Infinity, rate: 0.025 },
];

const CALC_VERSION = 'resico-v1';

function pickRate(monthlyIncome: number): number {
  for (const b of RESICO_BRACKETS) {
    if (monthlyIncome <= b.upTo) return b.rate;
  }
  return 0.025;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = claimsData.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const year = Number(body?.year);
    const month = Number(body?.month);
    const taxpayerProfileId: string | null = body?.taxpayer_profile_id ?? null;
    const overrides = body?.overrides ?? null;
    const notes: string | null = typeof body?.notes === 'string' ? body.notes : null;

    const validOverride = (v: any) => v !== undefined && v !== null && Number.isFinite(Number(v)) && Number(v) >= 0;
    if (overrides) {
      for (const k of ['total_income', 'total_expenses', 'taxable_base']) {
        if (overrides[k] !== undefined && overrides[k] !== null && !validOverride(overrides[k])) {
          return new Response(
            JSON.stringify({ error: `Override inválido para ${k}: debe ser número >= 0` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }
      }
    }

    if (
      !Number.isInteger(year) || year < 2020 || year > 2100 ||
      !Number.isInteger(month) || month < 1 || month > 12
    ) {
      return new Response(
        JSON.stringify({ error: 'Parámetros inválidos: year (2020-2100) y month (1-12) requeridos' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Validar ownership del taxpayer_profile si se provee
    if (taxpayerProfileId) {
      const { data: tp } = await supabase
        .from('taxpayer_profiles')
        .select('id, user_id')
        .eq('id', taxpayerProfileId)
        .maybeSingle();
      if (!tp || tp.user_id !== userId) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Consultar ingresos y gastos del periodo (RLS asegura ownership)
    const [incomeRes, expenseRes] = await Promise.all([
      supabase
        .from('income_records')
        .select('amount')
        .eq('user_id', userId)
        .eq('status', 'active')
        .eq('period_year', year)
        .eq('period_month', month),
      supabase
        .from('expense_records')
        .select('amount, is_deductible')
        .eq('user_id', userId)
        .eq('status', 'active')
        .eq('period_year', year)
        .eq('period_month', month),
    ]);

    if (incomeRes.error || expenseRes.error) {
      throw new Error(incomeRes.error?.message ?? expenseRes.error?.message);
    }

    const totalIncome = (incomeRes.data ?? []).reduce(
      (s, r) => s + Number(r.amount),
      0,
    );
    const totalExpenses = (expenseRes.data ?? []).reduce(
      (s, r) => s + Number(r.amount),
      0,
    );
    const deductibleExpenses = (expenseRes.data ?? [])
      .filter((r: any) => r.is_deductible)
      .reduce((s: number, r: any) => s + Number(r.amount), 0);

    // RESICO PF: el ISR se calcula sobre los ingresos efectivamente cobrados,
    // sin deducciones. Aun así reportamos la base gravable como ingresos.
    const calculatedIncome = totalIncome;
    const calculatedExpenses = totalExpenses;
    const calculatedTaxableBase = totalIncome;
    const calculatedRate = pickRate(totalIncome);
    const calculatedTax = +(calculatedTaxableBase * calculatedRate).toFixed(2);

    // Aplicar ajustes manuales si vienen
    const finalIncome = overrides && validOverride(overrides.total_income) ? Number(overrides.total_income) : calculatedIncome;
    const finalExpenses = overrides && validOverride(overrides.total_expenses) ? Number(overrides.total_expenses) : calculatedExpenses;
    const finalTaxableBase = overrides && validOverride(overrides.taxable_base) ? Number(overrides.taxable_base) : finalIncome;
    const finalRate = pickRate(finalIncome);
    const finalTax = +(finalTaxableBase * finalRate).toFixed(2);

    const isAdjusted = !!overrides && (
      finalIncome !== calculatedIncome ||
      finalExpenses !== calculatedExpenses ||
      finalTaxableBase !== calculatedTaxableBase
    );

    const breakdown = {
      bracket_table: RESICO_BRACKETS.map((b) => ({
        up_to: b.upTo === Infinity ? null : b.upTo,
        rate: b.rate,
      })),
      calculated_income: calculatedIncome,
      calculated_expenses: calculatedExpenses,
      calculated_taxable_base: calculatedTaxableBase,
      calculated_rate: calculatedRate,
      calculated_tax: calculatedTax,
      deductible_expenses: deductibleExpenses,
      adjusted: isAdjusted,
      adjustment_notes: notes,
      formula: 'estimated_tax = taxable_base * applied_rate',
      notes:
        'Cálculo RESICO PF v1. ISR sobre ingresos cobrados; gastos informativos. Ajustes manuales soportados.',
    };

    // Versionado: cada cálculo crea una nueva fila inmutable.
    // El trigger SQL marca versiones anteriores como is_current=false.
    const { data: previous } = await supabase
      .from('tax_calculations')
      .select('id, version_number, total_income, total_expenses, taxable_base, estimated_tax')
      .eq('user_id', userId)
      .eq('period_year', year)
      .eq('period_month', month)
      .eq('is_current', true)
      .maybeSingle();

    const payload = {
      user_id: userId,
      taxpayer_profile_id: taxpayerProfileId,
      period_year: year,
      period_month: month,
      total_income: finalIncome,
      total_expenses: finalExpenses,
      taxable_base: finalTaxableBase,
      estimated_tax: finalTax,
      applied_rate: finalRate,
      calculation_version: CALC_VERSION,
      breakdown,
      notes,
    };

    const { data: inserted, error: insErr } = await supabase
      .from('tax_calculations')
      .insert(payload)
      .select('id, version_number, supersedes_id, is_current')
      .single();
    if (insErr) throw insErr;
    const calcId = inserted.id;

    await supabase.from('audit_logs').insert({
      user_id: userId,
      action: previous
        ? (isAdjusted ? 'tax_calculation.adjust' : 'tax_calculation.recalculate')
        : 'tax_calculation.create',
      table_name: 'tax_calculations',
      record_id: calcId,
      old_data: previous ?? null,
      new_data: { ...payload, version_number: inserted.version_number, overrides, adjustment_notes: notes },
    });

    return new Response(
      JSON.stringify({
        id: calcId,
        version_number: inserted.version_number,
        supersedes_id: inserted.supersedes_id,
        is_current: inserted.is_current,
        period_year: year,
        period_month: month,
        total_income: finalIncome,
        total_expenses: finalExpenses,
        taxable_base: finalTaxableBase,
        estimated_tax: finalTax,
        applied_rate: finalRate,
        calculation_version: CALC_VERSION,
        breakdown,
        notes,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('calculate-tax-period error', err);
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      await supabase.from('audit_logs').insert({
        action: 'tax_calculation.error',
        new_data: { message: (err as Error).message },
      });
    } catch (_) { /* swallow */ }
    return new Response(
      JSON.stringify({ error: (err as Error).message ?? 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
