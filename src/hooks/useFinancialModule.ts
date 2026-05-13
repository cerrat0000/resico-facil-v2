import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type FinancialScore = {
  id: string;
  score: number;
  risk_level: "low" | "medium" | "high";
  estimated_capacity: number;
  monthly_avg_income: number;
  monthly_avg_expense: number;
  active_months: number;
  declarations_count: number;
  computed_at: string;
};

export type FinancialApplication = {
  id: string;
  folio: string;
  requested_amount: number;
  term_months: number;
  monthly_rate: number;
  cat_estimate: number;
  estimated_monthly_payment: number;
  estimated_total_payment: number;
  approved_amount: number | null;
  approved_term_months: number | null;
  approved_monthly_payment: number | null;
  status: "in_review" | "analyzing" | "preapproved" | "approved" | "pending_release" | "rejected";
  score_snapshot: number | null;
  risk_snapshot: string | null;
  pdf_path: string | null;
  approved_at: string | null;
  created_at: string;
};

export const useLatestScore = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["financial_score", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("financial_scores")
        .select("*")
        .eq("user_id", user!.id)
        .order("computed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as FinancialScore | null;
    },
  });
};

export const useFinancialApplications = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["financial_applications", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("financial_applications")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      return (data ?? []) as FinancialApplication[];
    },
  });
};

export const useRecomputeScore = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("calculate-financial-score", { body: {} });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["financial_score"] }),
  });
};

export const computePayment = (amount: number, months: number, monthlyRate: number) => {
  if (amount <= 0 || months <= 0) return { monthly: 0, total: 0 };
  const r = monthlyRate;
  const monthly = (amount * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
  return { monthly, total: monthly * months };
};

export const useCreateApplication = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      requested_amount: number;
      term_months: number;
      monthly_rate: number;
      cat_estimate: number;
      score_snapshot: number | null;
      risk_snapshot: string | null;
    }) => {
      const { monthly, total } = computePayment(input.requested_amount, input.term_months, input.monthly_rate);
      const { data, error } = await supabase
        .from("financial_applications")
        .insert({
          user_id: user!.id,
          requested_amount: input.requested_amount,
          term_months: input.term_months,
          monthly_rate: input.monthly_rate,
          cat_estimate: input.cat_estimate,
          estimated_monthly_payment: monthly,
          estimated_total_payment: total,
          score_snapshot: input.score_snapshot,
          risk_snapshot: input.risk_snapshot,
          status: "in_review",
        })
        .select()
        .single();
      if (error) throw error;
      return data as FinancialApplication;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["financial_applications"] }),
  });
};

export const useApproveApplication = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; approved_amount: number; approved_term_months: number; approved_monthly_payment: number }) => {
      const { error } = await supabase
        .from("financial_applications")
        .update({
          status: "pending_release",
          approved_amount: input.approved_amount,
          approved_term_months: input.approved_term_months,
          approved_monthly_payment: input.approved_monthly_payment,
          approved_at: new Date().toISOString(),
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["financial_applications"] }),
  });
};

export const useGenerateApprovalPdf = () => {
  return useMutation({
    mutationFn: async (applicationId: string) => {
      const { data, error } = await supabase.functions.invoke("generate-financial-approval-pdf", {
        body: { applicationId },
      });
      if (error) throw error;
      return data as { url: string; path: string };
    },
  });
};

export const downloadApprovalPdf = async (path: string, folio: string) => {
  const { data, error } = await supabase.storage.from("financial-approvals").createSignedUrl(path, 600);
  if (error || !data?.signedUrl) throw error ?? new Error("No se pudo obtener el archivo");
  const a = document.createElement("a");
  a.href = data.signedUrl;
  a.download = `${folio}.pdf`;
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  a.remove();
};
