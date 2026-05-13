import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProxy } from "@/contexts/ProxyContext";
import { getStripeEnvironment } from "@/lib/stripe";

export interface StripeSubscription {
  id: string;
  stripe_subscription_id: string;
  stripe_customer_id: string;
  price_id: string;
  product_id: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  environment: string;
}

export function useSubscription() {
  const { effectiveUserId } = useProxy();
  const [subscription, setSubscription] = useState<StripeSubscription | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!effectiveUserId) {
      setSubscription(null);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", effectiveUserId)
      .eq("environment", getStripeEnvironment())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setSubscription((data as StripeSubscription) ?? null);
    setLoading(false);
  }, [effectiveUserId]);

  useEffect(() => {
    refetch();
    if (!effectiveUserId) return;
    const channel = supabase
      .channel(`sub-${effectiveUserId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "subscriptions", filter: `user_id=eq.${effectiveUserId}` },
        () => refetch(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [effectiveUserId, refetch]);

  const isActive = !!subscription && (
    (["active", "trialing", "past_due"].includes(subscription.status) &&
      (!subscription.current_period_end || new Date(subscription.current_period_end) > new Date())) ||
    (subscription.status === "canceled" && subscription.current_period_end &&
      new Date(subscription.current_period_end) > new Date())
  );

  return { subscription, loading, isActive, refetch };
}
