import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getStripe } from "@/lib/stripe";
import { useCreateDeclarationPayment } from "@/hooks/useDeclarationPayments";

interface Props {
  declarationId: string;
  returnUrl?: string;
}

export function DeclarationCheckout({ declarationId, returnUrl }: Props) {
  const create = useCreateDeclarationPayment();
  const finalReturn = returnUrl
    ?? `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}&kind=declaration`;

  const fetchClientSecret = async (): Promise<string> => {
    const res = await create.mutateAsync({ declarationId, returnUrl: finalReturn });
    return res.clientSecret;
  };

  return (
    <div id="declaration-checkout">
      <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
