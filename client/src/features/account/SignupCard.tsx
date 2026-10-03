import { useState } from "react";
import { Link } from "react-router";
import { useT } from "../../i18n";
import { SignupForm } from "./AccountForms";
import { useCustomer } from "./account";

// En el seguimiento, para el que pidió sin cuenta: guardar sus datos con solo una contraseña.
// Este pedido (y los otros de este aparato) quedan en la cuenta nueva.
export function SignupCard({ token }: { token: string }) {
  const t = useT();
  const customer = useCustomer();
  const [created, setCreated] = useState(false);

  if (created) {
    return (
      <section role="status" className="space-y-2 rounded-2xl bg-surface p-4 ring-1 ring-line">
        <p className="text-lg font-bold text-success">{t.account.created}</p>
        <Link to={`/conta?volta=${encodeURIComponent(`/pedido/${token}`)}`} className="inline-block font-bold underline underline-offset-4">
          {t.account.seeOrders}
        </Link>
      </section>
    );
  }
  if (customer.isPending || customer.data) return null;

  return (
    <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
      <h2 className="text-lg font-bold">{t.account.saveTitle}</h2>
      <p className="mt-1 text-ink-muted">{t.account.saveText}</p>
      <div className="mt-4">
        <SignupForm idPrefix="salvar" onDone={() => setCreated(true)} />
      </div>
      <Link
        to={`/conta?modo=entrar&volta=${encodeURIComponent(`/pedido/${token}`)}`}
        className="mt-3 block py-2 text-center font-bold underline underline-offset-4"
      >
        {t.account.haveAccount}
      </Link>
    </section>
  );
}
