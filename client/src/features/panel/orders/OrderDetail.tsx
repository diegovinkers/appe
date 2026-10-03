import { MessageCircle, Phone, Printer, Star } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link } from "react-router";
import type { Order } from "../../../api/types";
import { can } from "../../../auth/permissions";
import { Sheet } from "../../../components/Sheet";
import { button, textarea } from "../../../components/ui";
import { errorText, useT } from "../../../i18n";
import { es } from "../../../i18n/es";
import { ptBR } from "../../../i18n/pt-BR";
import { formatMoney, formatTime, formatWhen } from "../../../lib/format";
import { whatsappLink } from "../../../lib/whatsapp";
import { usePanel } from "../PanelLayout";
import { STATUS_TONE, isActive, nextLabel, nextStatus } from "./orderFlow";
import { printTicket, readPaperWidth, savePaperWidth } from "./printTicket";
import { useChangeStatus, useSaveNotes } from "./useOrders";

// Pedido entregado: WhatsApp del cliente con el link del seguimiento, donde deja su reseña.
// El mensaje va en el idioma en que el cliente hizo el pedido, no en el del panel.
export function reviewRequestLink(order: Pick<Order, "status" | "customer" | "trackingToken" | "locale">, storeName: string, storeUrl: string) {
  if (order.status !== "delivered" || !order.customer.phone || !order.trackingToken) return null;
  const url = `${new URL(storeUrl).origin}/pedido/${order.trackingToken}`;
  const texts = order.locale === "es" ? es : ptBR;
  return `${whatsappLink(order.customer.phone)}?text=${encodeURIComponent(texts.reviews.askMessage(storeName, url))}`;
}

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="border-t border-line px-4 py-4 first:border-t-0">
    <h3 className="mb-2 text-sm font-bold text-ink-muted">{title}</h3>
    {children}
  </section>
);

export function StatusChip({ order }: { order: Pick<Order, "status"> }) {
  const t = useT();
  return (
    <span className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-sm ring-1 ring-inset ${STATUS_TONE[order.status]}`}>
      {t.orders.statuses[order.status]}
    </span>
  );
}

// Cancelar pide un motivo: los de siempre con un toque, u otro escrito.
function CancelForm({ onConfirm, onKeep, pending }: { onConfirm: (reason: string) => void; onKeep: () => void; pending: boolean }) {
  const t = useT();
  const [choice, setChoice] = useState<string>("");
  const [other, setOther] = useState("");
  const reason = choice === "other" ? other.trim() : choice;
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 font-bold">{t.orders.detail.cancelTitle}</legend>
      {[...t.orders.detail.reasons, "other"].map((value) => (
        <label key={value} className="flex min-h-11 cursor-pointer items-center gap-3">
          <input type="radio" name="motivo" checked={choice === value} onChange={() => setChoice(value)} className="size-5 accent-(--brand)" />
          {value === "other" ? t.orders.detail.otherReason : value}
        </label>
      ))}
      {choice === "other" && (
        <input
          autoFocus
          value={other}
          onChange={(event) => setOther(event.target.value)}
          maxLength={200}
          aria-label={t.orders.detail.otherReason}
          className="h-11 w-full rounded-lg border border-line px-3"
        />
      )}
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onKeep} className={`${button.secondary} flex-1`}>
          {t.orders.detail.keep}
        </button>
        <button type="button" disabled={!reason || pending} onClick={() => onConfirm(reason)} className={`${button.danger} flex-1`}>
          {t.orders.detail.confirmCancel}
        </button>
      </div>
    </fieldset>
  );
}

export function OrderDetail({ order, onClose }: { order: Order; onClose: () => void }) {
  const t = useT();
  const { user, store, storeUrl } = usePanel();
  const askReview = reviewRequestLink(order, store.name, storeUrl);
  const change = useChangeStatus();
  const notes = useSaveNotes();
  const [draft, setDraft] = useState(order.internalNotes);
  const [cancelling, setCancelling] = useState(false);
  const [paper, setPaper] = useState(readPaperWidth);
  const canWrite = can(user.role, "orders:write");
  const next = nextStatus(order);
  const label = nextLabel(order, t);
  const cancelEntry = order.statusHistory.find((entry) => entry.status === "cancelled");

  const footer = canWrite && (
    <div className="space-y-2">
      {change.isError && (
        <p role="alert" className="text-sm font-bold text-error">
          {errorText(change.error, t)}
        </p>
      )}
      {cancelling ? (
        <CancelForm
          pending={change.isPending}
          onKeep={() => setCancelling(false)}
          onConfirm={(reason) => change.mutate({ id: order._id, status: "cancelled", reason }, { onSuccess: () => setCancelling(false) })}
        />
      ) : (
        <>
          {next && label && (
            <button
              type="button"
              disabled={change.isPending}
              onClick={() => change.mutate({ id: order._id, status: next })}
              className="h-12 w-full rounded-xl bg-(--brand) font-bold text-(--on-brand) disabled:opacity-60"
            >
              {label}
            </button>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => printTicket(order._id, paper)} className={`${button.secondary} flex-1 whitespace-nowrap`}>
              <Printer aria-hidden className="size-4" />
              {t.orders.detail.print}
            </button>
            <select
              aria-label={t.orders.detail.paper}
              value={paper}
              onChange={(event) => {
                const width = Number(event.target.value) === 58 ? 58 : 80;
                setPaper(width);
                savePaperWidth(width);
              }}
              className="h-11 rounded-lg border border-line bg-surface px-2"
            >
              <option value={80}>80 mm</option>
              <option value={58}>58 mm</option>
            </select>
          </div>
        </>
      )}
    </div>
  );

  return (
    <Sheet open title={t.orders.detail.title(order.number, order.customer.name)} onClose={onClose} footer={footer}>
      <div className="flex flex-wrap items-center gap-2 px-4 pt-4">
        <StatusChip order={order} />
        <span className="text-sm text-ink-muted">
          {formatTime(order.createdAt)} · {t.orders.detail.arrivedBy(order.conversation ? t.orders.byAssistant : t.orders.channels[order.channel])}
        </span>
        {order.conversation && (
          <Link to={`/painel/assistente?conversa=${order.conversation}`} className="text-sm font-bold underline underline-offset-4">
            {t.orders.detail.viewConversation}
          </Link>
        )}
        {order.scheduledFor && (
          <span className="rounded-full bg-[#fff4d6] px-2.5 py-0.5 text-sm font-bold text-[#7a4e00]">
            {t.orders.scheduled(formatWhen(order.scheduledFor))}
          </span>
        )}
      </div>
      {cancelEntry?.reason && <p className="px-4 pt-2 font-bold text-error">{t.orders.detail.cancelledBecause(cancelEntry.reason)}</p>}

      <Section title={order.fulfillment === "delivery" ? t.orders.delivery : t.orders.pickup}>
        <p className="font-bold">{order.customer.name}</p>
        {order.customer.phone && (
          <div className="mt-1 flex flex-wrap gap-2">
            <a href={whatsappLink(order.customer.phone)} target="_blank" rel="noreferrer" className={button.secondary}>
              <MessageCircle aria-hidden className="size-4" />
              {t.orders.detail.whatsapp}
            </a>
            <a href={`tel:${order.customer.phone}`} className={button.secondary}>
              <Phone aria-hidden className="size-4" />
              {t.orders.detail.call}
            </a>
            {askReview && (
              <a href={askReview} target="_blank" rel="noreferrer" className={button.secondary}>
                <Star aria-hidden className="size-4" />
                {t.reviews.askOnWhatsapp}
              </a>
            )}
          </div>
        )}
        {order.address && (
          <p className="mt-3">
            {order.address.street}, {order.address.number} — {order.address.neighborhood}
            {order.address.reference && <span className="block text-sm text-ink-muted">{t.orders.detail.reference(order.address.reference)}</span>}
          </p>
        )}
      </Section>

      <Section title={t.orders.detail.items}>
        <ul className="space-y-2">
          {order.items.map((item, index) => (
            <li key={index} className="flex justify-between gap-3">
              <span>
                <span className="font-bold">
                  {item.quantity}x {item.name}
                </span>
                {item.options.map((option) => (
                  <span key={option.optionId} className="block text-sm text-ink-muted">
                    {option.group}: {option.quantity > 1 ? `${option.quantity}x ` : ""}
                    {option.name}
                  </span>
                ))}
                {item.notes && <span className="block text-sm font-bold text-warning">“{item.notes}”</span>}
              </span>
              <span className="shrink-0 tabular-nums">{formatMoney(item.totalCents)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-3 space-y-1 border-t border-line pt-3">
          <div className="flex justify-between">
            <dt>{t.checkout.subtotal}</dt>
            <dd className="tabular-nums">{formatMoney(order.subtotalCents)}</dd>
          </div>
          {order.discountCents > 0 && (
            <div className="flex justify-between">
              <dt>{order.coupon ? t.orders.detail.coupon(order.coupon.code) : t.checkout.discount}</dt>
              <dd className="tabular-nums">− {formatMoney(order.discountCents)}</dd>
            </div>
          )}
          {order.fulfillment === "delivery" && (
            <div className="flex justify-between">
              <dt>{t.checkout.deliveryFee}</dt>
              <dd className="tabular-nums">{order.deliveryFeeCents > 0 ? formatMoney(order.deliveryFeeCents) : t.checkout.free}</dd>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold">
            <dt>{t.checkout.total}</dt>
            <dd className="tabular-nums">{formatMoney(order.totalCents)}</dd>
          </div>
        </dl>
        <p className="mt-1 text-sm">
          {t.tracking.payment(t.checkout.methods[order.paymentMethod])}
          {order.changeForCents != null && <strong> — {t.orders.detail.changeFor(formatMoney(order.changeForCents))}</strong>}
        </p>
      </Section>

      {order.notes && (
        <Section title={t.orders.detail.customerNotes}>
          <p className="font-bold text-warning">“{order.notes}”</p>
        </Section>
      )}

      <Section title={t.orders.detail.history}>
        <ol className="space-y-1">
          {order.statusHistory.map((entry, index) => (
            <li key={index} className="flex justify-between gap-3 text-sm">
              <span>
                {t.orders.statuses[entry.status]}
                {entry.reason && <span className="text-ink-muted"> — {entry.reason}</span>}
              </span>
              <span className="tabular-nums text-ink-muted">{formatTime(entry.at)}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section title={t.orders.detail.internalNotes}>
        <textarea
          aria-label={t.orders.detail.internalNotes}
          rows={2}
          maxLength={500}
          value={draft}
          disabled={!canWrite}
          onChange={(event) => setDraft(event.target.value)}
          className={textarea}
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-sm text-ink-muted" aria-live="polite">
            {notes.isSuccess && draft === order.internalNotes ? t.orders.detail.notesSaved : t.orders.detail.internalHint}
          </span>
          {canWrite && (
            <button
              type="button"
              disabled={draft === order.internalNotes || notes.isPending}
              onClick={() => notes.mutate({ id: order._id, internalNotes: draft })}
              className={button.secondary}
            >
              {t.orders.detail.saveNotes}
            </button>
          )}
        </div>
        {notes.isError && <p className="mt-1 text-sm font-bold text-error">{errorText(notes.error, t)}</p>}
      </Section>

      {/* Cancelar se usa poco: queda al final; el motivo se elige abajo, donde estaban los botones. */}
      {canWrite && isActive(order.status) && !cancelling && (
        <div className="border-t border-line p-4">
          <button type="button" onClick={() => setCancelling(true)} className={`${button.danger} w-full`}>
            {t.orders.detail.cancel}
          </button>
        </div>
      )}
    </Sheet>
  );
}
