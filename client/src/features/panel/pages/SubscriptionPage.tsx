import { PageHeader } from "../../../components/PageHeader";
import { useT } from "../../../i18n";
import { SubscriptionView } from "../../platform/SubscriptionView";

// La assinatura del local en la plataforma, vista por el dueño.
export function SubscriptionPage() {
  const t = useT();
  return (
    <>
      <PageHeader title={t.pages.subscription.title} description={t.pages.subscription.description} />
      <SubscriptionView />
    </>
  );
}
