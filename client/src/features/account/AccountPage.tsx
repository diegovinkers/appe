import { ArrowLeft, LogOut, MapPin } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import type { CustomerAccount, CustomerOrder } from "../../api/types";
import { FullScreenMessage, Spinner } from "../../components/FullScreenMessage";
import { LanguageSwitch } from "../../components/LanguageSwitch";
import { StoreMark } from "../../components/StoreMark";
import { Field, button, input } from "../../components/ui";
import { type Dictionary, errorText, useT } from "../../i18n";
import { formatDate, formatMoney, formatTime } from "../../lib/format";
import { formatPhone } from "../../lib/phone";
import { LoginForm, SignupForm } from "./AccountForms";
import { addressLine, safeReturn, useCustomer, useCustomerOrders, useDeleteAccount, useLogout, useUpdateAccount } from "./account";

type Mode = "entrar" | "criar";

// /conta — la cuenta del que compra. ?volta= es a dónde lleva "Voltar"; con ?modo= se
// vino a entrar o crear la cuenta desde otra página, y al terminar se vuelve ahí.
export function AccountPage() {
  const t = useT();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const back = safeReturn(params.get("volta"));
  const mode = params.get("modo");
  const account = useCustomer();
  const [created, setCreated] = useState(false);

  const done = (wasSignup: boolean) => {
    if (mode) navigate(back, { replace: true });
    else setCreated(wasSignup);
  };

  if (account.isPending) {
    return (
      <FullScreenMessage>
        <Spinner />
      </FullScreenMessage>
    );
  }

  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-15 max-w-xl items-center gap-2 px-4">
          <Link to={back} className="-ml-2 inline-flex h-11 items-center gap-1.5 rounded-lg px-2 font-bold hover:bg-paper">
            <ArrowLeft aria-hidden className="size-5" />
            {t.account.back}
          </Link>
          <div className="flex-1" />
          <LanguageSwitch />
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-4 px-4 py-6">
        {account.data ? (
          <SignedIn account={account.data} created={created} />
        ) : (
          <SignedOut initial={mode === "entrar" ? "entrar" : "criar"} onDone={done} />
        )}
      </main>
    </div>
  );
}

function SignedOut({ initial, onDone }: { initial: Mode; onDone: (wasSignup: boolean) => void }) {
  const t = useT();
  const [tab, setTab] = useState<Mode>(initial);
  const tabClass = (active: boolean) =>
    `h-11 flex-1 rounded-lg font-bold ${active ? "bg-surface text-ink shadow-sm ring-1 ring-line" : "text-ink-muted hover:text-ink"}`;

  return (
    <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
      <h1 className="text-2xl font-bold tracking-tight">{t.account.title}</h1>
      <p className="mt-1 text-ink-muted">{t.account.saveText}</p>
      <div className="mt-4 flex gap-1 rounded-xl bg-paper p-1">
        <button type="button" aria-pressed={tab === "criar"} onClick={() => setTab("criar")} className={tabClass(tab === "criar")}>
          {t.account.signup}
        </button>
        <button type="button" aria-pressed={tab === "entrar"} onClick={() => setTab("entrar")} className={tabClass(tab === "entrar")}>
          {t.account.login}
        </button>
      </div>
      <div className="mt-4">
        {tab === "criar" ? <SignupForm onDone={() => onDone(true)} /> : <LoginForm onDone={() => onDone(false)} />}
      </div>
    </section>
  );
}

function SignedIn({ account, created }: { account: CustomerAccount; created: boolean }) {
  const t = useT();
  const logout = useLogout();

  return (
    <>
      <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
        {created && (
          <p role="status" className="mb-2 font-bold text-success">
            {t.account.created}
          </p>
        )}
        <h1 className="text-2xl font-bold tracking-tight">{t.account.hello(account.name)}</h1>
        <p className="mt-1 text-ink-muted tabular-nums">{formatPhone(account.phone)}</p>
      </section>

      <Orders />
      <Addresses account={account} />
      <Details account={account} />

      <button type="button" onClick={() => logout.mutate()} disabled={logout.isPending} className={`${button.secondary} h-12 w-full gap-2`}>
        <LogOut aria-hidden className="size-5" />
        {t.account.logout}
      </button>
      <DeleteAccount />
    </>
  );
}

// El estado como lo ve el que compra (los mismos textos del seguimiento).
function buyerStatus(order: CustomerOrder, t: Dictionary) {
  const steps = t.tracking.steps;
  if (order.fulfillment === "pickup" && order.status === "ready") return steps.readyPickup;
  if (order.fulfillment === "pickup" && order.status === "delivered") return steps.deliveredPickup;
  return steps[order.status];
}

function Orders() {
  const t = useT();
  const orders = useCustomerOrders(true);

  return (
    <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
      <h2 className="text-lg font-bold">{t.account.orders}</h2>
      {orders.isPending ? (
        <div className="py-3">
          <Spinner />
        </div>
      ) : orders.isError ? (
        <p className="mt-2 text-error">{errorText(orders.error, t)}</p>
      ) : orders.data.length === 0 ? (
        <p className="mt-2 text-ink-muted">{t.account.noOrders}</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {orders.data.map((order) => {
            const body = (
              <>
                <StoreMark store={order.store} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{t.account.order(order.store.name, order.number)}</span>
                  <span className="block text-sm text-ink-muted">
                    {formatDate(order.createdAt)} {formatTime(order.createdAt)} · {t.account.items(order.itemsCount)} ·{" "}
                    {buyerStatus(order, t)}
                  </span>
                </span>
                <span className="font-bold tabular-nums">{formatMoney(order.totalCents)}</span>
              </>
            );
            return (
              <li key={order._id}>
                {order.trackingToken ? (
                  <Link to={`/pedido/${order.trackingToken}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 hover:bg-paper">
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 py-3">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Addresses({ account }: { account: CustomerAccount }) {
  const t = useT();
  const update = useUpdateAccount();

  return (
    <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
      <h2 className="text-lg font-bold">{t.account.addresses}</h2>
      {account.addresses.length === 0 ? (
        <p className="mt-2 text-ink-muted">{t.account.noAddresses}</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {account.addresses.map((address) => (
            <li key={address._id} className="flex items-center gap-3 py-2">
              <MapPin aria-hidden className="size-5 shrink-0 text-ink-muted" />
              <span className="min-w-0 flex-1">
                {address.label && <span className="block font-bold">{address.label}</span>}
                <span className="block">{addressLine(address)}</span>
                {address.reference && <span className="block text-sm text-ink-muted">{address.reference}</span>}
              </span>
              <button
                type="button"
                disabled={update.isPending}
                onClick={() =>
                  update.mutate({
                    addresses: account.addresses.filter((saved) => saved._id !== address._id),
                  })
                }
                className={button.quiet}
              >
                {t.account.removeAddress}
                <span className="sr-only">: {addressLine(address)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {update.isError && <p className="mt-2 text-sm font-bold text-error">{errorText(update.error, t)}</p>}
    </section>
  );
}

function Details({ account }: { account: CustomerAccount }) {
  const t = useT();
  const update = useUpdateAccount();
  const [name, setName] = useState(account.name);
  const [saved, setSaved] = useState(false);
  const changed = name.trim() !== account.name;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !changed) return;
    setSaved(false);
    update.mutate({ name: name.trim() }, { onSuccess: () => setSaved(true) });
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl bg-surface p-4 ring-1 ring-line">
      <h2 className="text-lg font-bold">{t.account.details}</h2>
      <Field id="conta-nome" label={t.account.name}>
        <input
          id="conta-nome"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
          autoComplete="name"
          maxLength={60}
          required
          className={input}
        />
      </Field>
      <Field id="conta-fone" label={t.account.phone} hint={t.account.phoneLocked}>
        <input id="conta-fone" value={formatPhone(account.phone)} readOnly disabled className={input} />
      </Field>
      {update.isError && (
        <p role="alert" className="text-sm font-bold text-error">
          {errorText(update.error, t)}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={!changed || update.isPending} className={`${button.primary} h-11`}>
          {t.account.save}
        </button>
        {saved && (
          <span role="status" className="font-bold text-success">
            {t.account.saved}
          </span>
        )}
      </div>
    </form>
  );
}

function DeleteAccount() {
  const t = useT();
  const remove = useDeleteAccount();
  const [password, setPassword] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (password) remove.mutate({ password });
  };

  return (
    <details className="rounded-2xl bg-surface p-4 ring-1 ring-line">
      <summary className="cursor-pointer font-bold text-error">{t.account.delete}</summary>
      <form onSubmit={submit} className="mt-3 space-y-3">
        <p className="text-ink-muted">{t.account.deleteText}</p>
        <Field id="conta-excluir" label={t.account.deleteConfirm}>
          <input
            id="conta-excluir"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            maxLength={72}
            required
            className={input}
          />
        </Field>
        {remove.isError && (
          <p role="alert" className="text-sm font-bold text-error">
            {errorText(remove.error, t)}
          </p>
        )}
        <button type="submit" disabled={remove.isPending} className={`${button.danger} h-11`}>
          {t.account.deleteSubmit}
        </button>
      </form>
    </details>
  );
}
