import { useSearchParams } from "react-router";
import type { Order } from "../../../api/types";
import { can } from "../../../auth/permissions";
import { Spinner } from "../../../components/FullScreenMessage";
import { PageHeader } from "../../../components/PageHeader";
import { errorText, useT } from "../../../i18n";
import { formatDay, formatMoney, formatTime, formatWhen, todayISO } from "../../../lib/format";
import { useParamSheet } from "../../../hooks/useParamSheet";
import { OrderDetail, StatusChip } from "../orders/OrderDetail";
import { ORDER_FILTERS, type OrderFilter, matchesFilter, nextLabel, nextStatus } from "../orders/orderFlow";
import { useChangeStatus, useOrder, useOrders } from "../orders/useOrders";
import { usePanel } from "../PanelLayout";

function OrderRow({ order, onOpen }: { order: Order; onOpen: () => void }) {
  const t = useT();
  const { user } = usePanel();
  const change = useChangeStatus();
  const next = nextStatus(order);
  const label = nextLabel(order, t);

  return (
    <li className="px-4 py-3 sm:flex sm:items-center sm:gap-4">
      <button type="button" onClick={onOpen} className="flex w-full min-w-0 flex-1 items-center gap-3 text-left">
        <span className="w-12 shrink-0 text-lg font-bold tabular-nums">#{order.number}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{order.customer.name}</span>
          <span className="block text-sm text-ink-muted">
            {formatTime(order.createdAt)} · {order.fulfillment === "delivery" ? t.orders.delivery : t.orders.pickup} ·{" "}
            {order.conversation ? t.orders.byAssistant : t.orders.channels[order.channel]}
            {order.scheduledFor && <strong className="text-warning"> · {t.orders.scheduled(formatWhen(order.scheduledFor))}</strong>}
          </span>
        </span>
        <span className="shrink-0 font-bold tabular-nums">{formatMoney(order.totalCents)}</span>
      </button>
      <div className="mt-2 flex items-center justify-end gap-2 sm:mt-0">
        <StatusChip order={order} />
        {next && label && can(user.role, "orders:write") && (
          <button
            type="button"
            disabled={change.isPending}
            onClick={() => change.mutate({ id: order._id, status: next })}
            className="h-10 min-w-32 rounded-lg bg-action px-3 text-sm font-bold text-white hover:bg-action-hover disabled:opacity-60"
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
function OpenOrder({ id, fromList, onClose }: { id: string; fromList: Order | undefined; onClose: () => void }) {
  const single = useOrder(id, !fromList);
  const order = fromList ?? single.data;
  if (!order) return null;
  return <OrderDetail key={order._id} order={order} onClose={onClose} />;
}

// Los pedidos del día: filtros, el botón para avanzar cada uno y el detalle.
export function OrdersPage() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const today = todayISO();
  const day = params.get("dia") ?? today;
  const filter = (ORDER_FILTERS as string[]).includes(params.get("filtro") ?? "") ? (params.get("filtro") as OrderFilter) : "active";
  const detail = useParamSheet("pedido");
  const orders = useOrders(day, day === today);

  const setParam = (name: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    setParams(next, { replace: true });
  };

  const list = orders.data?.orders ?? [];
  const visible = list.filter((order) => matchesFilter(order.status, filter));
  const count = (value: OrderFilter) => list.filter((order) => matchesFilter(order.status, value)).length;

  return (
    <>
      <PageHeader
        title={day === today ? t.pages.orders.title : t.orders.titleForDay(formatDay(day))}
        description={t.pages.orders.description}
        actions={
          <label className="flex items-center gap-2 text-sm font-bold">
            {t.orders.day}
            <input
              type="date"
              value={day}
              max={today}
              onChange={(event) => setParam("dia", event.target.value && event.target.value !== today ? event.target.value : null)}
              className="h-11 rounded-lg border border-line bg-surface px-3 font-normal"
            />
          </label>
        }
      />

      <div role="group" aria-label={t.pages.orders.title} className="mb-4 flex flex-wrap gap-2">
        {ORDER_FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setParam("filtro", value === "active" ? null : value)}
            className={`h-10 rounded-full px-4 text-sm ${filter === value ? "bg-action font-bold text-white" : "bg-surface ring-1 ring-line hover:bg-paper"}`}
          >
            {t.orders.filters[value]} <span className="tabular-nums opacity-75">{count(value)}</span>
          </button>
        ))}
      </div>

      {orders.isPending && <Spinner />}
      {orders.isError && <p className="text-error">{t.errors.generic}</p>}
      {orders.data &&
        (visible.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line bg-surface p-6 text-ink-muted">
            {list.length === 0 && day === today ? t.orders.empty : t.orders.emptyFilter}
          </p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {visible.map((order) => (
              <OrderRow key={order._id} order={order} onOpen={() => detail.open(order._id)} />
            ))}
          </ul>
        ))}

      {detail.value && (
        <OpenOrder id={detail.value} fromList={list.find((order) => order._id === detail.value)} onClose={detail.close} />
      )}
    </>
  );
}
