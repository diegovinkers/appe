import { useQuery } from "@tanstack/react-query";
import { Check, MessageCircle } from "lucide-react";
import type { CSSProperties } from "react";
import { Link, useLocation, useParams } from "react-router";
import { ApiError, api } from "../../api/client";
import type { TrackingResponse } from "../../api/types";
import { FullScreenMessage, Spinner } from "../../components/FullScreenMessage";
import { LanguageSwitch } from "../../components/LanguageSwitch";
import { StoreMark } from "../../components/StoreMark";
import { type Dictionary, useT } from "../../i18n";
import { readableTextOn } from "../../lib/color";
import { formatMoney, formatTime } from "../../lib/format";
import { whatsappLink } from "../../lib/whatsapp";
import { SignupCard } from "../account/SignupCard";
import { ReviewCard } from "./ReviewCard";

type TrackedOrder = TrackingResponse["order"];

// Los pasos que ve el comprador, según cómo recibe el pedido.
function stepsFor(order: TrackedOrder, t: Dictionary): { status: TrackedOrder["status"]; label: string }[] {
  const s = t.tracking.steps;
  return order.fulfillment === "delivery"
    ? [
        { status: "new", label: s.new },
        { status: "confirmed", label: s.confirmed },
        { status: "ready", label: s.ready },
        { status: "out_for_delivery", label: s.out_for_delivery },
        { status: "delivered", label: s.delivered },
      ]
    : [
        { status: "new", label: s.new },
        { status: "confirmed", label: s.confirmed },
        { status: "ready", label: s.readyPickup },
        { status: "delivered", label: s.deliveredPickup },
      ];
}

const FINAL = ["delivered", "cancelled"];

// /pedido/:token — el seguimiento del pedido. Justo después de pedir, muestra primero
// el botón para mandarlo por WhatsApp y, al que no tiene cuenta, guardar sus datos.
export function TrackingPage() {
  const t = useT();
  const { token = "" } = useParams();
  const whatsappUrl = (useLocation().state as { whatsappUrl?: string } | null)?.whatsappUrl;
  const query = useQuery({
    queryKey: ["tracking", token],
    queryFn: () => api<TrackingResponse>(`/public/orders/${encodeURIComponent(token)}`),
    refetchInterval: (current) => (current.state.data && FINAL.includes(current.state.data.order.status) ? false : 15_000),
  });

  if (query.isPending) {
    return (
      <FullScreenMessage>
        <Spinner />
      </FullScreenMessage>
    );
  }
  if (query.isError) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <FullScreenMessage title={notFound ? t.tracking.notFound.title : t.errors.generic}>
        {notFound && t.tracking.notFound.text}
      </FullScreenMessage>
    );
  }

  const { store, order } = query.data;
  const steps = stepsFor(order, t);
  const reached = new Map(order.statusHistory.map((entry) => [entry.status, entry.at]));
  const cancelled = order.status === "cancelled";
  const brand = { "--brand": store.primaryColor, "--on-brand": readableTextOn(store.primaryColor) } as CSSProperties;
  const button = "flex h-13 w-full items-center justify-center gap-2 rounded-xl px-4 font-bold";

  return (
    <div style={brand} className="min-h-dvh bg-paper">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-3">
          <Link to={`/${store.slug}`} className="flex min-w-0 flex-1 items-center gap-3">
            <StoreMark store={store} size={40} />
            <span className="truncate font-bold">{store.name}</span>
          </Link>
          <LanguageSwitch />
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-4 px-4 py-6">
        {whatsappUrl && (
          <section className="space-y-3 rounded-2xl bg-surface p-4 ring-1 ring-line">
            <p className="text-lg font-bold">{t.tracking.placed}</p>
            <a href={whatsappUrl} target="_blank" rel="noreferrer" className={`${button} bg-(--brand) text-(--on-brand)`}>
              <MessageCircle aria-hidden className="size-5" />
              {t.tracking.sendWhatsapp}
            </a>
            <p className="text-sm text-ink-muted">{t.tracking.sendHint}</p>
          </section>
        )}
        {whatsappUrl && <SignupCard token={token} />}

        <ReviewCard token={token} review={query.data.review} canReview={query.data.canReview} />

        <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
          <h1 className="text-2xl font-bold tracking-tight">{t.tracking.title(order.number)}</h1>
          {order.eta && !cancelled && (
            <p className="mt-1 text-ink-muted">{t.tracking.eta(formatTime(order.eta.from), formatTime(order.eta.to))}</p>
          )}

          {cancelled ? (
            <p className="mt-4 font-bold text-error">{t.tracking.steps.cancelled}</p>
          ) : (
            <ol className="mt-4">
              {steps.map((step, index) => {
                const at = reached.get(step.status);
                const current = step.status === order.status;
                return (
                  <li key={step.status} className="relative flex gap-3 pb-4 last:pb-0">
                    {/* La línea que une un paso con el siguiente. */}
                    {index < steps.length - 1 && (
                      <span aria-hidden className={`absolute top-7 bottom-0 left-3 w-0.5 -translate-x-1/2 ${at ? "bg-open" : "bg-line"}`} />
                    )}
                    <span
                      aria-hidden
                      className={`relative grid size-6 shrink-0 place-items-center rounded-full ${at ? "bg-open text-white" : "border-2 border-line bg-surface"}`}
                    >
                      {at && <Check className="size-4" />}
                    </span>
                    <span className={`flex-1 ${current ? "font-bold" : at ? "" : "text-ink-muted"}`}>
                      {step.label}
                      {current && <span className="sr-only"> ✓</span>}
                    </span>
                    {at && <span className="text-sm text-ink-muted tabular-nums">{formatTime(at)}</span>}
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
          <h2 className="font-bold">{t.tracking.items}</h2>
          <ul className="mt-2 divide-y divide-line">
            {order.items.map((item, index) => (
              <li key={index} className="flex justify-between gap-3 py-2">
                <span>
                  {item.quantity}x {item.name}
                  {item.options.length > 0 && (
                    <span className="block text-sm text-ink-muted">
                      {item.options.map((option) => `${option.quantity > 1 ? `${option.quantity}x ` : ""}${option.name}`).join(", ")}
                    </span>
                  )}
                </span>
                <span className="tabular-nums">{formatMoney(item.totalCents)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-2 space-y-1 border-t border-line pt-2">
            {order.deliveryFeeCents > 0 && (
              <div className="flex justify-between">
                <dt>{t.checkout.deliveryFee}</dt>
                <dd className="tabular-nums">{formatMoney(order.deliveryFeeCents)}</dd>
              </div>
            )}
            {order.discountCents > 0 && (
              <div className="flex justify-between">
                <dt>{t.checkout.discount}</dt>
                <dd className="tabular-nums">− {formatMoney(order.discountCents)}</dd>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold">
              <dt>{t.checkout.total}</dt>
              <dd className="tabular-nums">{formatMoney(order.totalCents)}</dd>
            </div>
          </dl>
          <p className="mt-1 text-sm text-ink-muted">{t.tracking.payment(t.checkout.methods[order.paymentMethod])}</p>
        </section>

        {!whatsappUrl && <SignupCard token={token} />}
        {!whatsappUrl && store.whatsapp && (
          <a href={whatsappLink(store.whatsapp)} target="_blank" rel="noreferrer" className={`${button} bg-surface ring-1 ring-line`}>
            <MessageCircle aria-hidden className="size-5" />
            {t.tracking.talkToStore}
          </a>
        )}
        <Link to={`/${store.slug}`} className="block py-2 text-center font-bold underline underline-offset-4">
          {t.tracking.backToMenu}
        </Link>
      </main>
    </div>
  );
}
