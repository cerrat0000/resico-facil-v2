import React, { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CreditCard, Check, Star, Crown, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/hooks/useSubscription';
import { getStripeEnvironment } from '@/lib/stripe';
import { StripeEmbeddedCheckout } from '@/components/StripeEmbeddedCheckout';
import { PaymentTestModeBanner } from '@/components/PaymentTestModeBanner';
import { toast } from 'sonner';

interface Plan {
  id: string;
  name: string;
  price: number;
  interval: string;
  features: any;
  stripe_price_id: string | null;
}

const planIcons: Record<string, React.ElementType> = {
  Gratuito: Star, Básico: CreditCard, Profesional: Crown,
};

const Payments = () => {
  const { user } = useAuth();
  const { subscription, isActive, loading: subLoading } = useSubscription();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutPriceId, setCheckoutPriceId] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('is_active', true)
        .order('price');
      setPlans((data ?? []) as Plan[]);
      setLoading(false);
    })();
  }, []);

  const currentPlan = plans.find((p) => p.stripe_price_id && p.stripe_price_id === subscription?.price_id);
  const freePlan = plans.find((p) => Number(p.price) === 0);
  const effectivePlan = isActive ? currentPlan : freePlan;

  const openCheckout = (priceId: string | null) => {
    if (!priceId) return;
    setCheckoutPriceId(priceId);
  };

  const openPortal = async () => {
    setPortalLoading(true);
    const { data, error } = await supabase.functions.invoke('create-portal-session', {
      body: {
        environment: getStripeEnvironment(),
        returnUrl: `${window.location.origin}/payments`,
      },
    });
    setPortalLoading(false);
    if (error || !data?.url) {
      toast.error('No se pudo abrir el portal de pagos');
      return;
    }
    window.open(data.url, '_blank');
  };

  return (
    <AppLayout>
      <PaymentTestModeBanner />
      <div className="max-w-4xl mx-auto space-y-6 p-4">
        <h1 className="text-2xl font-bold font-display">Pagos y Suscripción</h1>

        <Card>
          <CardContent className="p-4 flex items-center gap-3 flex-wrap">
            <div className="p-2 rounded-lg bg-accent text-accent-foreground"><Star size={18} /></div>
            <div className="flex-1 min-w-[180px]">
              <p className="font-medium text-sm">
                Plan actual: {subLoading || loading ? '...' : effectivePlan?.name ?? 'Sin plan activo'}
              </p>
              <p className="text-xs text-muted-foreground">
                {subscription?.cancel_at_period_end
                  ? `Se cancela al final del periodo (${new Date(subscription.current_period_end!).toLocaleDateString('es-MX')})`
                  : subscription?.status === 'past_due'
                    ? 'Pago pendiente — Stripe está reintentando'
                    : isActive ? 'Suscripción activa' : 'Plan gratuito'}
              </p>
            </div>
            {isActive && <Badge className="bg-success text-success-foreground">Activo</Badge>}
            {isActive && subscription && (
              <Button size="sm" variant="outline" onClick={openPortal} disabled={portalLoading}>
                <ExternalLink size={14} className="mr-1" />
                {portalLoading ? 'Abriendo...' : 'Gestionar suscripción'}
              </Button>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          {loading ? (
            [1, 2, 3].map((i) => <Skeleton key={i} className="h-72 w-full" />)
          ) : (
            plans.map((plan) => {
              const Icon = planIcons[plan.name] ?? CreditCard;
              const isCurrent = isActive && plan.stripe_price_id === subscription?.price_id;
              const isFree = Number(plan.price) === 0;
              const features: string[] = Array.isArray(plan.features)
                ? plan.features
                : (plan.features?.items ?? []);
              return (
                <Card key={plan.id} className={isCurrent ? 'border-2 border-primary' : ''}>
                  <CardHeader className="pb-3 text-center">
                    <Icon size={28} className="mx-auto text-primary mb-2" />
                    <CardTitle className="font-display text-lg">{plan.name}</CardTitle>
                    <div>
                      <span className="text-3xl font-bold font-display">
                        ${Number(plan.price).toLocaleString('es-MX')}
                      </span>
                      <span className="text-muted-foreground text-sm">
                        /{plan.interval === 'monthly' ? 'mes' : plan.interval}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {features.map((f) => (
                      <div key={f} className="flex items-center gap-2 text-sm">
                        <Check size={14} className="text-primary shrink-0" /> {f}
                      </div>
                    ))}
                    <Button
                      variant={isCurrent ? 'outline' : 'default'}
                      className="w-full mt-4"
                      disabled={isCurrent || isFree || !plan.stripe_price_id}
                      onClick={() => openCheckout(plan.stripe_price_id)}
                    >
                      {isCurrent
                        ? 'Plan actual'
                        : isFree
                          ? 'Plan gratuito'
                          : isActive
                            ? 'Cambiar a este plan'
                            : 'Suscribirme'}
                    </Button>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        <Dialog open={!!checkoutPriceId} onOpenChange={(open) => !open && setCheckoutPriceId(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
            <DialogHeader className="p-4 pb-0">
              <DialogTitle>Completa tu pago</DialogTitle>
            </DialogHeader>
            {checkoutPriceId && user && (
              <StripeEmbeddedCheckout
                priceId={checkoutPriceId}
                customerEmail={user.email}
                userId={user.id}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
};

export default Payments;
