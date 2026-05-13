// Edge Function: generate-declaration-pdf
// Congela el snapshot de un borrador y genera un PDF básico de la declaración RESICO.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

const fmt = (n: number) =>
  `$${Number(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function assertCanManageTarget(
  admin: ReturnType<typeof createClient>,
  actorUserId: string,
  targetUserId: string,
) {
  if (actorUserId === targetUserId) return;

  const { data: link, error } = await admin
    .from('accountant_client_links')
    .select('permissions, status')
    .eq('accountant_id', actorUserId)
    .eq('client_id', targetUserId)
    .maybeSingle();

  const canEdit = (link?.permissions as any)?.edit === true;
  if (error || !link || link.status !== 'active' || !canEdit) {
    throw new Error('Forbidden');
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supaUrl = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(
      supaUrl,
      anon,
      { global: { headers: { Authorization: authHeader } } },
    );
    const admin = createClient(supaUrl, service);

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const actorUserId = claimsData.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const draftId: string | undefined = body?.draft_id;
    const calculationId: string | undefined = body?.calculation_id;
    const requestedTargetUserId = typeof body?.target_user_id === 'string' ? body.target_user_id : null;
    if (!draftId && !calculationId) {
      return new Response(JSON.stringify({ error: 'draft_id o calculation_id requerido' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Obtener borrador (creando uno desde calculation si no existe)
    let draft: any = null;
    let targetUserId = requestedTargetUserId || actorUserId;
    if (draftId) {
      const { data, error } = await admin
        .from('declaration_drafts').select('*').eq('id', draftId).maybeSingle();
      if (error) throw error;
      draft = data;
      if (!draft) throw new Error('DeclaraciÃ³n no encontrada');
      targetUserId = draft.user_id;
      if (requestedTargetUserId && requestedTargetUserId !== targetUserId) throw new Error('Forbidden');
      await assertCanManageTarget(admin, actorUserId, targetUserId);
    } else {
      const { data: calc } = await admin
        .from('tax_calculations').select('*').eq('id', calculationId!).maybeSingle();
      if (!calc) throw new Error('CÃ¡lculo asociado no encontrado');
      targetUserId = calc.user_id;
      await assertCanManageTarget(admin, actorUserId, targetUserId);
      if (requestedTargetUserId && requestedTargetUserId !== targetUserId) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: existing } = await admin
        .from('declaration_drafts').select('*')
        .eq('user_id', targetUserId)
        .eq('calculation_id', calc.id)
        .maybeSingle();
      if (existing) draft = existing;
      else {
        const { data: created, error: cErr } = await admin
          .from('declaration_drafts').insert({
            user_id: targetUserId,
            calculation_id: calc.id,
            period_year: calc.period_year,
            period_month: calc.period_month,
            status: 'draft',
            form_data: {
              total_income: calc.total_income,
              total_expenses: calc.total_expenses,
              taxable_base: calc.taxable_base,
              estimated_tax: calc.estimated_tax,
              applied_rate: calc.applied_rate,
              version_number: calc.version_number,
            },
          }).select('*').single();
        if (cErr) throw cErr;
        draft = created;
      }
    }

    if (!draft || draft.user_id !== targetUserId) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Cargar cálculo asociado (snapshot)
    const { data: calc, error: calcErr } = await admin
      .from('tax_calculations').select('*').eq('id', draft.calculation_id).maybeSingle();
    if (calcErr || !calc) throw new Error('Cálculo asociado no encontrado');
    if (calc.user_id !== targetUserId) throw new Error('Forbidden');

    // Cargar perfil para datos fiscales
    const { data: tp } = await admin
      .from('taxpayer_profiles').select('rfc, curp, fiscal_address, economic_activity, tax_regime')
      .eq('user_id', targetUserId).maybeSingle();
    const { data: profile } = await admin
      .from('profiles').select('full_name').eq('user_id', targetUserId).maybeSingle();

    // Generar PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const { height } = page.getSize();

    const { width } = page.getSize();
    const folio = String(calc.id).slice(0, 8).toUpperCase();

    // Encabezado con banda verde
    page.drawRectangle({ x: 0, y: height - 90, width, height: 90, color: rgb(0.13, 0.45, 0.30) });
    page.drawText('Declaración Mensual RESICO', {
      x: 50, y: height - 45, size: 20, font: fontBold, color: rgb(1, 1, 1),
    });
    page.drawText(`${MONTHS[(calc.period_month ?? 1) - 1]} ${calc.period_year}`, {
      x: 50, y: height - 70, size: 12, font, color: rgb(0.95, 0.97, 0.95),
    });
    page.drawText(`Folio ${folio}`, {
      x: width - 140, y: height - 45, size: 11, font: fontBold, color: rgb(1, 1, 1),
    });
    page.drawText(new Date().toLocaleDateString('es-MX'), {
      x: width - 140, y: height - 70, size: 10, font, color: rgb(0.95, 0.97, 0.95),
    });

    let y = height - 120;
    const draw = (text: string, opts: { size?: number; bold?: boolean; x?: number; color?: any } = {}) => {
      page.drawText(text, {
        x: opts.x ?? 50,
        y,
        size: opts.size ?? 11,
        font: opts.bold ? fontBold : font,
        color: opts.color ?? rgb(0.1, 0.1, 0.1),
      });
    };

    draw('Datos del contribuyente', { size: 13, bold: true }); y -= 18;
    draw(`Nombre: ${profile?.full_name ?? '—'}`); y -= 14;
    draw(`RFC: ${tp?.rfc ?? '—'}`); y -= 14;
    draw(`CURP: ${tp?.curp ?? '—'}`); y -= 14;
    draw(`Régimen: ${tp?.tax_regime ?? 'RESICO'}`); y -= 14;
    draw(`Actividad: ${tp?.economic_activity ?? '—'}`); y -= 14;
    draw(`Domicilio: ${(tp?.fiscal_address ?? '—').slice(0, 80)}`); y -= 26;

    draw('Resumen fiscal', { size: 13, bold: true }); y -= 18;
    draw(`Ingresos del periodo: ${fmt(Number(calc.total_income))}`); y -= 14;
    draw(`Gastos del periodo: ${fmt(Number(calc.total_expenses))}`); y -= 14;
    draw(`Base gravable: ${fmt(Number(calc.taxable_base))}`); y -= 14;
    draw(`Tasa aplicada: ${(Number(calc.applied_rate) * 100).toFixed(2)}%`); y -= 14;
    draw(`ISR estimado: ${fmt(Number(calc.estimated_tax))}`, { bold: true, size: 13 }); y -= 26;

    draw('Trazabilidad', { size: 13, bold: true }); y -= 18;
    draw(`Versión de cálculo: v${calc.version_number} (${calc.calculation_version})`); y -= 14;
    draw(`Cálculo ID: ${calc.id}`); y -= 14;
    draw(`Borrador ID: ${draft.id}`); y -= 14;
    draw(`Generado: ${new Date().toISOString()}`); y -= 26;

    const bd: any = calc.breakdown ?? {};
    if (bd.adjusted) {
      draw('Ajuste manual aplicado', { size: 12, bold: true, color: rgb(0.7, 0.3, 0.1) }); y -= 16;
      draw(`Original: ${fmt(Number(bd.calculated_tax ?? 0))}`); y -= 14;
      if (bd.adjustment_notes) {
        draw(`Notas: ${String(bd.adjustment_notes).slice(0, 90)}`); y -= 14;
      }
      y -= 12;
    }

    // Pie de página con disclaimer destacado
    page.drawRectangle({ x: 40, y: 50, width: width - 80, height: 40, color: rgb(0.97, 0.93, 0.85) });
    page.drawText('Documento informativo — valida en el SAT antes de presentar.', {
      x: 50, y: 72, size: 10, font: fontBold, color: rgb(0.55, 0.35, 0.10),
    });
    page.drawText('Generado por Resico Fácil. Conserva este folio para tus registros.', {
      x: 50, y: 58, size: 8, font, color: rgb(0.45, 0.30, 0.10),
    });

    const pdfBytes = await pdfDoc.save();

    // Subir a Storage
    const ts = Date.now();
    const path = `${targetUserId}/${calc.period_year}/${String(calc.period_month).padStart(2, '0')}/v${calc.version_number}-${ts}.pdf`;
    const { error: upErr } = await admin.storage
      .from('declaration-pdfs')
      .upload(path, pdfBytes, { contentType: 'application/pdf', upsert: false });
    if (upErr) throw upErr;

    const { data: signed, error: signErr } = await admin.storage
      .from('declaration-pdfs').createSignedUrl(path, 60 * 60 * 24 * 7);
    if (signErr) throw signErr;

    // Congelar borrador (status, frozen_at, pdf_url, pdf_storage_path)
    const nowIso = new Date().toISOString();
    const updatedForm = {
      ...(draft.form_data ?? {}),
      total_income: calc.total_income,
      total_expenses: calc.total_expenses,
      taxable_base: calc.taxable_base,
      estimated_tax: calc.estimated_tax,
      applied_rate: calc.applied_rate,
      version_number: calc.version_number,
      calculation_id: calc.id,
      frozen_snapshot: true,
    };
    const { data: updated, error: updErr } = await admin
      .from('declaration_drafts')
      .update({
        status: 'exported_pdf',
        frozen_at: draft.frozen_at ?? nowIso,
        pdf_generated_at: nowIso,
        pdf_url: signed.signedUrl,
        pdf_storage_path: path,
        form_data: updatedForm,
      })
      .eq('id', draft.id)
      .select('*').single();
    if (updErr) throw updErr;

    await admin.from('audit_logs').insert({
      user_id: targetUserId,
      action: 'declaration.export_pdf',
      table_name: 'declaration_drafts',
      record_id: draft.id,
      new_data: {
        path,
        calculation_id: calc.id,
        version_number: calc.version_number,
        _metadata: { actor_user_id: actorUserId, target_user_id: targetUserId },
      },
    });

    return new Response(JSON.stringify({
      draft: updated,
      pdf_url: signed.signedUrl,
      pdf_storage_path: path,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('generate-declaration-pdf error', err);
    return new Response(JSON.stringify({ error: (err as Error).message ?? 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
