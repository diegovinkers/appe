import { ArrowRightLeft, Plus, Printer } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link } from "react-router";
import type { Order, PaymentMethod, TableTabResponse } from "../../../api/types";
import { can } from "../../../auth/permissions";
import { Spinner } from "../../../components/FullScreenMessage";
import { Notice } from "../../../components/Notice";
import { Sheet } from "../../../components/Sheet";
import { Field, button, input } from "../../../components/ui";
import { errorText, useT } from "../../../i18n";
import { formatMinutes, formatMoney, formatTime } from "../../../lib/format";
import { parseMoney } from "../../../lib/money";
import { StatusChip } from "../orders/OrderDetail";
import { useDeviceSettings } from "../orders/deviceSettings";
import { printBill } from "../orders/printTicket";
import { nextLabel, nextStatus } from "../orders/orderFlow";
import { useChangeStatus } from "../orders/useOrders";
import { Stepper } from "../../menu/ProductSheet";
import { splitEqually } from "./split";
import { usePanel } from "../PanelLayout";
import { STATE_TONE, tabRequest, useSalonTables, useTabAction, useTableTab } from "./useSalon";

type Tab = NonNullable<TableTabResponse["tab"]>;
type Closed = { tab: Tab };

const chip = (active: boolean) =>
  `inline-flex min-h-11 items-center rounded-lg px-4 font-bold ${active ? "bg-action text-white" : "bg-surface ring-1 ring-line hover:bg-paper"}`;

// Un pedido de la cuenta: qué se pidió, en qué está y el paso siguiente (confirmar, "Marcar
// listo" cuando sale de la cocina, "Marcar servido" en la mesa), sin ir a la lista de pedidos.
function TabOrder({ order, canWrite, onOpen }: { order: Order; canWrite: boolean; onOpen: () => void }) {
  const t = useT();
  const change = useChangeStatus();
  const next = nextStatus(order);
  const label = nextLabel(order, t);
  return (
    <li className={`py-3 ${order.status === "cancelled" ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onOpen} className="min-h-11 font-bold underline-offset-4 hover:underline" aria-label={t.tables.openOrder(order.number)}>
          #{order.number}
        </button>
        <span className="text-sm text-ink-muted tabular-nums">{formatTime(order.createdAt)}</span>
        <StatusChip order={order} />
        <span className="ml-auto font-bold tabular-nums">{formatMoney(order.totalCents)}</span>
      </div>
      <ul className="text-sm">
        {order.items.map((item, index) => (
          <li key={index}>
            <span className="font-bold">
              {item.quantity}x {item.name}
            </span>
            {item.options.length > 0 && <span className="text-ink-muted"> ({item.options.map((option) => option.name).join(", ")})</span>}
            {item.notes && <span className="font-bold text-warning"> “{item.notes}”</span>}
          </li>
        ))}
      </ul>
      {next && label && canWrite && (
        <button
          type="button"
          disabled={change.isPending}
          onClick={() => change.mutate({ id: order._id, status: next })}
          className={`mt-2 h-11 rounded-lg px-4 text-sm font-bold text-white disabled:opacity-60 ${
            order.status === "ready" ? "bg-[#16794a] hover:bg-[#126a40]" : "bg-action hover:bg-action-hover"
          }`}
        >
          {label}
        </button>
      )}
      {change.isError && <p className="mt-1 text-sm font-bold text-error">{errorText(change.error, t)}</p>}
    </li>
  );
}

// Cobrar: un pago (forma de pago y, en efectivo, para cuánto el cambio) o la cuenta dividida en
// partes, cada una con su forma de pago. Las partes empiezan iguales y se pueden cambiar; se
// confirma cuando suman justo el total.
type Part = { amount: string; method: PaymentMethod | null; changeFor: string };

const toMoneyText = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
const equalParts = (total: number, count: number, methods: PaymentMethod[]): Part[] =>
  splitEqually(total, count).map((cents) => ({ amount: toMoneyText(cents), method: methods.length === 1 ? methods[0] : null, changeFor: "" }));

function MethodChips({ methods, value, onChange, label }: { methods: PaymentMethod[]; value: PaymentMethod | null; onChange: (method: PaymentMethod) => void; label: string }) {
  const t = useT();
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {methods.map((method) => (
        <button key={method} type="button" aria-pressed={value === method} onClick={() => onChange(method)} className={chip(value === method)}>
          {t.checkout.methods[method]}
        </button>
      ))}
    </div>
  );
}

function CloseForm({ tab, onBack, onClosed }: { tab: Tab; onBack: () => void; onClosed: (closed: Closed) => void }) {
  const t = useT();
  const c = t.tables;
  const { store } = usePanel();
  const methods = store.paymentMethods;
  const [split, setSplit] = useState(false);
  const [method, setMethod] = useState<PaymentMethod | null>(methods.length === 1 ? methods[0] : null);
  const [changeFor, setChangeFor] = useState("");
  const [count, setCount] = useState(2);
  const [parts, setParts] = useState<Part[]>(() => equalParts(tab.totalCents, 2, methods));
  const close = useTabAction((body: object) => tabRequest<Closed>(tab._id, "close", body));
  const total = formatMoney(tab.totalCents);
  const change = parseMoney(changeFor);
  const changeTooLow = method === "cash" && change != null && change < tab.totalCents;

  const amounts = parts.map((part) => parseMoney(part.amount) ?? 0);
  const paid = amounts.reduce((sum, value) => sum + value, 0);
  const diff = tab.totalCents - paid;
  const partProblem = (part: Part, index: number) => {
    const partChange = parseMoney(part.changeFor);
    return !part.method || amounts[index] <= 0 || (part.method === "cash" && partChange != null && partChange < amounts[index]);
  };
  const splitReady = diff === 0 && parts.every((part, index) => !partProblem(part, index));
  const canConfirm = tab.totalCents === 0 || (split ? splitReady : Boolean(method) && !changeTooLow);
  const setPart = (index: number, patch: Partial<Part>) => setParts((current) => current.map((part, i) => (i === index ? { ...part, ...patch } : part)));

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canConfirm) return;
        const body = split
          ? {
              payments: parts.map((part, index) => {
                const partChange = parseMoney(part.changeFor);
                return { paymentMethod: part.method, amountCents: amounts[index], ...(part.method === "cash" && partChange != null && { changeForCents: partChange }) };
              }),
            }
          : { ...(method && { paymentMethod: method }), ...(method === "cash" && change != null && { changeForCents: change }) };
        close.mutate(body, { onSuccess: onClosed });
      }}
    >
      {tab.totalCents > 0 && (
        <div role="group" aria-label={c.closeTitle} className="grid grid-cols-2 gap-2">
          <button type="button" aria-pressed={!split} onClick={() => setSplit(false)} className={chip(!split)}>
            {c.payOnce}
          </button>
          <button type="button" aria-pressed={split} onClick={() => setSplit(true)} className={chip(split)}>
            {c.paySplit}
          </button>
        </div>
      )}

      {tab.totalCents > 0 && !split && (
        <>
          <fieldset>
            <legend className="mb-2 font-bold">{c.closeTitle}</legend>
            <MethodChips methods={methods} value={method} onChange={setMethod} label={c.closeTitle} />
          </fieldset>
          {method === "cash" && (
            <Field id="conta-troco" label={t.checkout.changeFor} hint={t.checkout.changeHint} error={changeTooLow ? t.checkout.changeTooLow : undefined}>
              <input id="conta-troco" inputMode="decimal" value={changeFor} onChange={(event) => setChangeFor(event.target.value)} className={input} />
            </Field>
          )}
        </>
      )}

      {tab.totalCents > 0 && split && (
        <div className="max-h-[45dvh] space-y-3 overflow-y-auto">
          <div className="flex items-center justify-between gap-3">
            <span className="font-bold">{c.parts}</span>
            <Stepper
              label={c.parts}
              value={count}
              min={2}
              max={20}
              onChange={(next) => {
                setCount(next);
                setParts(equalParts(tab.totalCents, next, methods));
              }}
            />
          </div>
          <ol className="space-y-3">
            {parts.map((part, index) => (
              <li key={index} className="space-y-2 rounded-xl border border-line p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-bold">{c.part(index + 1)}</span>
                  <input
                    aria-label={c.partAmount(index + 1)}
                    inputMode="decimal"
                    value={part.amount}
                    onChange={(event) => setPart(index, { amount: event.target.value })}
                    className="h-11 w-28 rounded-lg border border-line bg-surface px-3 text-right tabular-nums"
                  />
                </div>
                <MethodChips methods={methods} value={part.method} onChange={(value) => setPart(index, { method: value })} label={c.part(index + 1)} />
                {part.method === "cash" && (
                  <input
                    aria-label={c.partChange(index + 1)}
                    placeholder={t.checkout.changeFor}
                    inputMode="decimal"
                    value={part.changeFor}
                    onChange={(event) => setPart(index, { changeFor: event.target.value })}
                    className={input}
                  />
                )}
              </li>
            ))}
          </ol>
          <p role="status" className={`font-bold ${diff === 0 ? "text-success" : "text-error"}`}>
            {diff === 0 ? c.exact : diff > 0 ? c.missing(formatMoney(diff)) : c.over(formatMoney(-diff))}
          </p>
        </div>
      )}

      {close.isError && <Notice tone="error">{errorText(close.error, t)}</Notice>}
      <div className="flex gap-2">
        <button type="button" onClick={onBack} className={`${button.secondary} flex-1`}>
          {c.closeBack}
        </button>
        <button disabled={!canConfirm || close.isPending} className={`${button.primary} flex-1`}>
          {c.closeConfirm(total)}
        </button>
      </div>
    </form>
  );
}

// La cuenta de una mesa, en una hoja (al costado en el espacio de trabajo: `side`).
export function TableTab({
  tableId,
  now,
  side = false,
  onClose,
  onOpenOrder,
  onMoved,
  newOrderHref,
}: {
  tableId: string;
  now: number;
  side?: boolean;
  onClose: () => void;
  onOpenOrder: (orderId: string) => void;
  onMoved: (tableId: string) => void;
  newOrderHref: string;
}) {
  const t = useT();
  const c = t.tables;
  const { user } = usePanel();
  const { paper } = useDeviceSettings();
  const query = useTableTab(tableId);
  const salon = useSalonTables();
  const [mode, setMode] = useState<"view" | "moving" | "closing">("view");
  const [closed, setClosed] = useState<Closed | null>(null);
  const requestBill = useTabAction((tabId: string) => tabRequest(tabId, "bill"));
  const move = useTabAction(({ tabId, to }: { tabId: string; to: string }) => tabRequest(tabId, "move", { tableId: to }));
  const canWrite = can(user.role, "orders:write");
  const canOrder = can(user.role, "orders:manual");

  const data = query.data;
  const title = data ? c.title(data.table.number, data.table.name) : t.workspace.panels.salon;
  if (!data) {
    return (
      <Sheet open side={side} title={title} onClose={onClose}>
        {query.isError ? (
          <div className="p-4">
            <Notice tone="error">{errorText(query.error, t)}</Notice>
          </div>
        ) : (
          <Spinner />
        )}
      </Sheet>
    );
  }

  const { table, tab, orders } = data;
  const state = salon.data?.tables.find((item) => item._id === table._id)?.state ?? (tab ? "occupied" : "free");
  const pending = orders.filter((order) => order.status === "new" || order.status === "confirmed");
  const freeTables = (salon.data?.tables ?? []).filter((item) => item.active && item.state === "free" && item._id !== table._id);

  const print = () => {
    if (!tab) return;
    // Imprimir la precuenta es lo que se hace cuando la mesa la pide.
    if (tab.status === "open") requestBill.mutate(tab._id);
    printBill(tab._id, paper);
  };

  let footer: ReactNode = null;
  if (tab && mode === "closing" && canWrite) {
    footer = (
      <CloseForm
        tab={tab}
        onBack={() => setMode("view")}
        onClosed={(result) => {
          setClosed(result);
          setMode("view");
        }}
      />
    );
  } else if (canWrite || canOrder) {
    footer = (
      // Abajo, lo de siempre: pedir más o cobrar. Imprimir y mudar de mesa quedan arriba, con la cuenta.
      <div className="space-y-2">
        {tab && canWrite && pending.length > 0 && <p className="text-sm text-ink-muted">{c.pending(pending.map((order) => `#${order.number}`).join(", "))}</p>}
        <div className="flex flex-wrap gap-2">
          {canOrder && (
            <Link to={newOrderHref} className="flex h-12 grow basis-40 items-center justify-center gap-2 rounded-xl bg-(--brand) px-4 font-bold text-(--on-brand)">
              <Plus aria-hidden className="size-5" />
              {c.newOrder}
            </Link>
          )}
          {tab && canWrite && (
            <button type="button" disabled={pending.length > 0} onClick={() => setMode("closing")} className={`${button.primary} h-12 grow basis-48`}>
              {c.close(formatMoney(tab.totalCents))}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <Sheet open side={side} title={title} onClose={onClose} footer={footer}>
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center rounded-full border-2 px-2.5 py-0.5 text-sm font-bold ${STATE_TONE[state]}`}>{c.states[state]}</span>
          <span className="text-sm text-ink-muted">{c.seats(table.seats)}</span>
        </div>

        {closed && (
          <Notice tone="success">
            {closed.tab.payments.length > 1
              ? c.closedSplit(formatMoney(closed.tab.totalCents), closed.tab.payments.length)
              : closed.tab.paymentMethod
                ? c.closed(formatMoney(closed.tab.totalCents), t.checkout.methods[closed.tab.paymentMethod])
                : c.closedFree}
          </Notice>
        )}

        {tab ? (
          <>
            <div className="flex items-end justify-between gap-3 border-b border-line pb-3">
              <p className="text-sm text-ink-muted">
                {c.openedAt(formatTime(tab.openedAt), formatMinutes(Math.max(0, Math.floor((now - new Date(tab.openedAt).getTime()) / 60_000))))}
              </p>
              <p className="text-right">
                <span className="block text-sm text-ink-muted">{c.total}</span>
                <span className="text-2xl font-bold tabular-nums">{formatMoney(tab.totalCents)}</span>
              </p>
            </div>

            {canWrite && (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={print} className={`${button.secondary} grow`}>
                  <Printer aria-hidden className="size-4" />
                  {c.printBill}
                </button>
                <button type="button" onClick={() => setMode(mode === "moving" ? "view" : "moving")} aria-expanded={mode === "moving"} className={`${button.secondary} grow`}>
                  <ArrowRightLeft aria-hidden className="size-4" />
                  {c.move}
                </button>
              </div>
            )}

            {mode === "moving" && (
              <fieldset className="rounded-xl border border-line p-3">
                <legend className="px-1 font-bold">{c.moveTo}</legend>
                {freeTables.length === 0 ? (
                  <p className="text-ink-muted">{c.noFreeTables}</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {freeTables.map((item) => (
                      <button
                        key={item._id}
                        type="button"
                        disabled={move.isPending}
                        onClick={() => move.mutate({ tabId: tab._id, to: item._id }, { onSuccess: () => onMoved(item._id) })}
                        className="grid size-12 place-items-center rounded-lg border-2 border-dashed border-ink-muted/50 font-bold tabular-nums hover:border-ink hover:bg-paper"
                        aria-label={c.title(item.number, item.name)}
                      >
                        {item.number}
                      </button>
                    ))}
                  </div>
                )}
                <button type="button" onClick={() => setMode("view")} className={`${button.quiet} mt-2`}>
                  {c.moveCancel}
                </button>
                {move.isError && <p className="mt-1 text-sm font-bold text-error">{errorText(move.error, t)}</p>}
              </fieldset>
            )}

            <section aria-label={c.orders}>
              <h3 className="text-sm font-bold text-ink-muted">{c.orders}</h3>
              <ul className="divide-y divide-line">
                {orders.map((order) => (
                  <TabOrder key={order._id} order={order} canWrite={canWrite} onOpen={() => onOpenOrder(order._id)} />
                ))}
              </ul>
            </section>
          </>
        ) : (
          !closed && <p className="rounded-xl border border-dashed border-line p-4 text-ink-muted">{c.free}</p>
        )}
      </div>
    </Sheet>
  );
}
