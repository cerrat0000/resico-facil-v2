import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";

export default function CheckoutReturn() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const { refetch } = useSubscription();

  useEffect(() => {
    // Trigger a refetch shortly after landing — webhook usually arrives within a few seconds
    const t = setTimeout(() => refetch(), 1500);
    return () => clearTimeout(t);
  }, [refetch]);

  return (
    <AppLayout>
      <div className="max-w-md mx-auto mt-8">
        <Card>
          <CardContent className="p-6 text-center space-y-4">
            <CheckCircle2 className="mx-auto text-success" size={56} />
            <h1 className="text-xl font-bold font-display">¡Pago recibido!</h1>
            <p className="text-sm text-muted-foreground">
              Tu suscripción se está activando. Esto puede tomar unos segundos.
            </p>
            {sessionId && (
              <p className="text-xs text-muted-foreground break-all">Sesión: {sessionId}</p>
            )}
            <div className="flex flex-col gap-2 pt-2">
              <Button asChild>
                <Link to="/payments">Ver mi suscripción</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/dashboard">Ir al panel</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
