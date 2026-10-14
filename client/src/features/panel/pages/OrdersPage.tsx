import { Plus, Printer, Search } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import type { Order } from "../../../api/types";
import { can } from "../../../auth/permissions";
import { Spinner } from "../../../components/FullScreenMessage";
import { button } from "../../../components/ui";
import { PageHeader } from "../../../components/PageHeader";
import { errorText, useT } from "../../../i18n";
import { formatDay, formatMinutes, formatMoney, formatTime, formatWhen, operatingDayISO } from "../../../lib/format";
import { matchesSearch } from "../../../lib/text";
import { useMediaQuery } from "../../../hooks/useMediaQuery";
import { useNow } from "../../../hooks/useNow";
import { useParamSheet } from "../../../hooks/useParamSheet";
import { Conversations } from "../assistant/Conversations";
import { OrderDetail, StatusChip } from "../orders/OrderDetail";
import { ORDER_FILTERS, type OrderFilter, byUrgency, matchesFilter, nextLabel, nextStatus, orderTiming } from "../orders/orderFlow";
import { useDeviceSettings } from "../orders/deviceSettings";
import { OrdersWorkspace } from "../orders/OrdersWorkspace";
import { printTicket } from "../orders/printTicket";
import { useChangeStatus, useOrder, useOrders } from "../orders/useOrders";
import { usePanel } from "../PanelLayout";

// Cuándo entró y cuánto lleva: "18:42 · há 12 min"; si es de otro día, "sex 23:50".
function TimeInfo({ order, now, today }: { order: Order; now: number; today: string }) {
  const t = useT();
  const timing = orderTiming(order, now);
  const when = operatingDayISO(new Date(order.createdAt)) === today ? formatTime(order.createdAt) : formatWhen(order.createdAt, new Date(now));
  if (timing.kind === "done") return <>{when}</>;
  const elapsed = formatMinutes(timing.minutes);
  if (timing.kind === "ready") return <>{when} · {t.orders.readySince(elapsed)}</>;
  if (timing.kind === "late") return <>{when}</>;
  return <>{when} · {t.orders.ago(elapsed)}</>;
}

// Aviso al lado del estado: el pedido nuevo que nadie acepta o el que pasó la hora prometida.
function LateChip({ order, now }: { order: Order; now: number }) {
  const t = useT();
  const timing = orderTiming(order, now);
  if (!timing.late) return null;
  const text = timing.kind === "waiting" ? t.orders.waiting(formatMinutes(timing.minutes)) : t.orders.late(formatMinutes(timing.minutes));
  return <span className="inline-flex shrink-0 rounded-full bg-error-soft px-2.5 py-0.5 text-sm font-bold text-error ring-1 ring-inset ring-error/30">{text}</span>;
}

// Una fila de la lista. Se acomoda al ancho de donde está (la página o un panel), no al de la pantalla.
function OrderRow({ order, onOpen, now, today, selected }: { order: Order; onOpen: () => void; now: number; today: string; selected: boolean }) {
  const t = useT();
  const { user } = usePanel();
  const change = useChangeStatus();
  const next = nextStatus(order);
  const label = nextLabel(order, t);
  const late = orderTiming(order, now).late;
  const { paper } = useDeviceSettings();

  return (
    <li
      aria-current={selected || undefined}
      className={`px-4 py-3 @3xl:flex @3xl:items-center @3xl:gap-4 ${late ? "border-l-4 border-l-error pl-3" : ""} ${selected ? "bg-paper" : ""}`}
    >
      <button type="button" onClick={onOpen} className="flex w-full min-w-0 flex-1 items-center gap-3 text-left">
        <span className="w-12 shrink-0 text-lg font-bold tabular-nums">#{order.number}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{order.customer.name}</span>
          <span className="block text-sm text-ink-muted">
            <TimeInfo order={order} now={now} today={today} /> · {order.fulfillment === "delivery" ? t.orders.delivery : t.orders.pickup} ·{" "}
            {order.conversation ? t.orders.byAssistant : t.orders.channels[order.channel]}
            {order.scheduledFor && <strong className="text-warning"> · {t.orders.scheduled(formatWhen(order.scheduledFor))}</strong>}
          </span>
        </span>
        <span className="shrink-0 font-bold tabular-nums">{formatMoney(order.totalCents)}</span>
      </button>
      <div className="mt-2 flex flex-wrap items-center justify-end gap-2 @3xl:mt-0">
        <LateChip order={order} now={now} />
        <StatusChip order={order} />
        <button
          type="button"
          onClick={() => printTicket(order._id, paper)}
          aria-label={t.alerts.print(order.number)}
          title={t.alerts.print(order.number)}
          className="grid size-11 shrink-0 place-items-center rounded-lg border border-line bg-surface text-ink-muted hover:bg-paper hover:text-ink"
        >
          <Printer aria-hidden className="size-5" />
        </button>
        {next && label && can(user.role, "orders:write") && (
          <button
            type="button"
            disabled={change.isPending}
            onClick={() => change.mutate({ id: order._id, status: next })}
            className="h-11 min-w-32 rounded-lg bg-action px-3 text-sm font-bold text-white hover:bg-action-hover disabled:opacity-60"
          >
            {label}
          </button>
        )}
      </div>
      {change.isError && <p className="mt-1 text-right text-sm font-bold text-error">{errorText(change.error, t)}</p>}
    </li>
  );
}

// El de la lista (que se actualiza sola) o, si no está en ella, el que se pide aparte.
export function OpenOrder({
  id,
  fromList,
  onClose,
  inline = false,
  conversationHref,
}: {
  id: string;
  fromList: Order | undefined;
  onClose: () => void;
  inline?: boolean;
  conversationHref?: (conversationId: string) => string;
}) {
  const single = useOrder(id, !fromList);
  const order = fromList ?? single.data;
  if (!order) return inline ? <Spinner /> : null;
  return <OrderDetail key={order._id} order={order} onClose={onClose} inline={inline} conversationHref={conversationHref} />;
}

// Lo que comparten la página y el espacio de trabajo: el día, el filtro, la búsqueda y la lista.
export function useOrdersView() {
  const [params, setParams] = useSearchParams();
  const now = useNow();
  const today = operatingDayISO(new Date(now));
  const day = params.get("dia") ?? today;
  const filter = (ORDER_FILTERS as string[]).includes(params.get("filtro") ?? "") ? (params.get("filtro") as OrderFilter) : "active";
  const [search, setSearch] = useState("");
  const orders = useOrders(day, day === today);

  const setParam = (name: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    setParams(next, { replace: true });
  };

  const list = orders.data?.orders ?? [];
  const found = search.trim()
    ? list.filter((order) => matchesSearch(`#${order.number} ${order.number} ${order.customer.name} ${order.customer.phone} ${order.customer.phone.replace(/\D/g, "")}`, search))
    : list;
  const visible = found.filter((order) => matchesFilter(order.status, filter));
  if (filter === "active" || filter === "new") visible.sort(byUrgency(now));
  const count = (value: OrderFilter) => found.filter((order) => matchesFilter(order.status, value)).length;

  return { params, setParam, now, today, day, filter, search, setSearch, orders, list, visible, count };
}
export type OrdersView = ReturnType<typeof useOrdersView>;

export function DayPicker({ view }: { view: OrdersView }) {
  const t = useT();
  return (
    <label className="flex items-center gap-2 text-sm font-bold">
      {t.orders.day}
      <input
        type="date"
        value={view.day}
        max={view.today}
        onChange={(event) => view.setParam("dia", event.target.value && event.target.value !== view.today ? event.target.value : null)}
        className="h-11 rounded-lg border border-line bg-surface px-3 font-normal"
      />
    </label>
  );
}

export function NewOrderButton() {
  const t = useT();
  const { user } = usePanel();
  if (!can(user.role, "orders:manual")) return null;
  return (
    <Link to="/painel/pedidos/novo" className={button.primary}>
      <Plus aria-hidden className="size-5" />
      {t.nav.newOrder}
    </Link>
  );
}

// Buscador, filtros y la lista. En un panel, la lista tiene su propio scroll.
export function OrdersList({ view, selectedId, onOpen }: { view: OrdersView; selectedId?: string | null; onOpen: (id: string) => void }) {
  const t = useT();
  const { orders, list, visible, filter, today, day, now } = view;

  return (
    <div className="@container">
      <label className="relative mb-3 block">
        <span className="sr-only">{t.workspace.search}</span>
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-muted" />
        <input
          type="search"
          value={view.search}
          onChange={(event) => view.setSearch(event.target.value)}
          placeholder={t.workspace.search}
          className="h-11 w-full rounded-lg border border-line bg-surface pl-10 pr-3"
        />
      </label>
      <div role="group" aria-label={t.pages.orders.title} className="mb-4 flex flex-wrap gap-2">
        {ORDER_FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => view.setParam("filtro", value === "active" ? null : value)}
            className={`h-11 rounded-full px-4 text-sm ${filter === value ? "bg-action font-bold text-white" : "bg-surface ring-1 ring-line hover:bg-paper"}`}
          >
            {t.orders.filters[value]} <span className="tabular-nums opacity-75">{view.count(value)}</span>
          </button>
        ))}
      </div>

      {orders.isPending && <Spinner />}
      {orders.isError && <p className="text-error">{t.errors.generic}</p>}
      {orders.data &&
        (visible.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line bg-surface p-6 text-ink-muted">
            {view.search.trim() ? t.workspace.noResults : list.length === 0 && day === today ? t.orders.empty : t.orders.emptyFilter}
          </p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {visible.map((order) => (
              <OrderRow key={order._id} order={order} now={now} today={today} selected={order._id === selectedId} onOpen={() => onOpen(order._id)} />
            ))}
          </ul>
        ))}
    </div>
  );
}

// En la PC ancha, el espacio de trabajo con paneles; si no, la página con pestañas Pedidos y WhatsApp.
export function OrdersPage() {
  const wide = useMediaQuery("(min-width: 1280px)");
  return wide ? <OrdersWorkspace /> : <OrdersNarrow />;
}

function OrdersNarrow() {
  const t = useT();
  const view = useOrdersView();
  const detail = useParamSheet("pedido");
  const showing = view.params.get("ver") === "whatsapp" ? "whatsapp" : "orders";
  const tabs = [
    ["orders", t.workspace.panels.orders],
    ["whatsapp", t.workspace.panels.whatsapp],
  ] as const;

  return (
    <>
      <PageHeader
        title={view.day === view.today ? t.pages.orders.title : t.orders.titleForDay(formatDay(view.day))}
        description={t.pages.orders.description}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <NewOrderButton />
            <DayPicker view={view} />
          </div>
        }
      />
      <div role="tablist" aria-label={t.workspace.views} className="mb-4 flex gap-1 rounded-xl bg-surface p-1 ring-1 ring-line sm:w-fit">
        {tabs.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={showing === value}
            onClick={() => view.setParam("ver", value === "orders" ? null : value)}
            className={`h-11 flex-1 rounded-lg px-5 font-bold sm:flex-none ${showing === value ? "bg-action text-white" : "text-ink-muted hover:text-ink"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {showing === "orders" ? (
        <OrdersList view={view} selectedId={detail.value} onOpen={(id) => detail.open(id)} />
      ) : (
        <Conversations selected={view.params.get("conversa")} onSelect={(id) => view.setParam("conversa", id)} compact />
      )}

      {detail.value && <OpenOrder id={detail.value} fromList={view.list.find((order) => order._id === detail.value)} onClose={detail.close} />}
    </>
  );
}
