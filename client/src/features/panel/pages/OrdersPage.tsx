import {
  Armchair,
  Bike,
  Bot,
  CalendarClock,
  Check,
  ChevronDown,
  Globe,
  type LucideIcon,
  MessageCircle,
  Phone,
  Plus,
  Printer,
  Search,
  ShoppingBag,
  StickyNote,
  Store,
  Wallet,
} from "lucide-react";
import { useRef, useState } from "react";
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
import { useDismiss } from "../../../hooks/useDismiss";
import { Conversations } from "../assistant/Conversations";
import { OrderDetail } from "../orders/OrderDetail";
import {
  BASIC_FILTERS,
  ORDER_FILTERS,
  type OrderFilter,
  type OrderSource,
  STATUS_MARK,
  STATUS_ORDER,
  byUrgency,
  isOrderFilter,
  matchesFilter,
  nextLabel,
  nextStatus,
  orderSource,
  orderTiming,
  takenBy,
} from "../orders/orderFlow";
import { useDeviceSettings } from "../orders/deviceSettings";
import { OrdersWorkspace } from "../orders/OrdersWorkspace";
import { printTicket } from "../orders/printTicket";
import { useChangeStatus, useOrder, useOrders } from "../orders/useOrders";
import { usePanel } from "../PanelLayout";
import { SalonBoard } from "../salon/SalonBoard";
import { TableTab } from "../salon/TableTab";
import { useSalonTables } from "../salon/useSalon";

// Cuánto lleva, a la derecha de la fila: en rojo si espera que alguien lo acepte o pasó la
// hora prometida; si no, tranquilo ("há 12 min", "Pronto há 5 min"). Los terminados, nada.
function Elapsed({ order, now }: { order: Order; now: number }) {
  const t = useT();
  const timing = orderTiming(order, now);
  if (timing.kind === "done") return null;
  const elapsed = formatMinutes(timing.minutes);
  if (timing.late) {
    const text = timing.kind === "waiting" ? t.orders.waiting(elapsed) : t.orders.late(elapsed);
    return <span className="inline-flex shrink-0 rounded-full bg-error-soft px-2.5 py-0.5 text-sm font-bold whitespace-nowrap text-error ring-1 ring-inset ring-error/30">{text}</span>;
  }
  if (timing.kind === "ready") return <span className="text-sm text-ink-muted">{t.orders.readySince(elapsed)}</span>;
  return <span className="text-sm text-ink-muted">{timing.minutes < 1 ? t.orders.justNow : t.orders.ago(elapsed)}</span>;
}

const SOURCE_ICON: Record<OrderSource, LucideIcon> = { online: Globe, assistant: Bot, phone: Phone, whatsapp: MessageCircle, counter: Store, table: Armchair };
const FULFILLMENT_ICON: Record<Order["fulfillment"], LucideIcon> = { delivery: Bike, pickup: ShoppingBag, table: Armchair };

// Una fila de la lista: lo que hay que saber sin abrir el pedido (qué pidió, de dónde vino y
// quién lo tomó, cómo se entrega y cómo paga) y el próximo paso. Se acomoda al ancho de donde
// está (la página o un panel), no al de la pantalla.
function OrderRow({ order, onOpen, now, today, selected }: { order: Order; onOpen: () => void; now: number; today: string; selected: boolean }) {
  const t = useT();
  const o = t.orders;
  const { user } = usePanel();
  const change = useChangeStatus();
  const next = nextStatus(order);
  const label = nextLabel(order, t);
  const late = orderTiming(order, now).late;
  const { paper } = useDeviceSettings();

  const source = orderSource(order);
  const SourceIcon = SOURCE_ICON[source];
  const by = takenBy(order);
  const FulfillmentIcon = FULFILLMENT_ICON[order.fulfillment];
  const when = operatingDayISO(new Date(order.createdAt)) === today ? formatTime(order.createdAt) : formatWhen(order.createdAt, new Date(now));
  // En la mesa el nombre ya es "Mesa 4": no se repite.
  const place = order.fulfillment === "delivery" ? [o.delivery, order.address?.neighborhood].filter(Boolean).join(", ") : order.fulfillment === "pickup" ? o.pickup : null;
  const method = order.paymentMethod ? t.checkout.methods[order.paymentMethod] : null;
  let payment = method;
  if (method && order.changeForCents != null) payment = o.paymentWithChange(method, formatMoney(order.changeForCents));
  if (!method && order.fulfillment === "table") payment = o.payAtTable;
  const total = formatMoney(order.totalCents);

  return (
    <li aria-current={selected || undefined} className={`flex ${selected ? "bg-paper" : ""}`}>
      {/* El color de la etapa; rojo si está atrasado. */}
      <span aria-hidden className={`w-1.5 shrink-0 ${late ? "bg-error" : STATUS_MARK[order.status]}`} />
      <div className="min-w-0 flex-1 py-3 pr-3 pl-3 @xl:flex @xl:items-start @xl:gap-4">
        <button type="button" onClick={onOpen} className="flex w-full min-w-0 flex-1 gap-3 text-left">
          <span className="w-12 shrink-0 @md:w-14">
            <span className="block text-lg leading-tight font-bold tabular-nums">#{order.number}</span>
            <span className="block text-sm text-ink-muted tabular-nums">{when}</span>
          </span>
          <span className="min-w-0 flex-1 space-y-0.5">
            <span className="flex items-baseline justify-between gap-3">
              <span className={`truncate font-bold ${order.status === "cancelled" ? "text-ink-muted line-through" : ""}`}>{order.customer.name}</span>
              <span className="shrink-0 font-bold tabular-nums @xl:hidden">{total}</span>
            </span>
            <span className="flex items-center gap-1.5 text-sm text-ink-muted">
              <SourceIcon aria-hidden className="size-4 shrink-0" />
              <span className="truncate">{by ? o.sourceBy(o.source[source], by) : o.source[source]}</span>
            </span>
            <span className="line-clamp-1 text-sm @md:line-clamp-2">{order.items.map((item) => `${item.quantity}x ${item.name}`).join(", ")}</span>
            <span className="flex flex-wrap gap-x-3 gap-y-0.5 pt-0.5 text-sm text-ink-muted">
              {place && (
                <span className="inline-flex items-center gap-1.5">
                  <FulfillmentIcon aria-hidden className="size-4 shrink-0" />
                  {place}
                </span>
              )}
              {payment && (
                <span className="inline-flex items-center gap-1.5">
                  <Wallet aria-hidden className="size-4 shrink-0" />
                  {payment}
                </span>
              )}
              {order.notes && (
                <strong className="inline-flex items-center gap-1.5 text-warning">
                  <StickyNote aria-hidden className="size-4 shrink-0" />
                  {o.hasNotes}
                </strong>
              )}
              {order.scheduledFor && (
                <strong className="inline-flex items-center gap-1.5 text-warning">
                  <CalendarClock aria-hidden className="size-4 shrink-0" />
                  {o.scheduled(formatWhen(order.scheduledFor))}
                </strong>
              )}
            </span>
          </span>
        </button>
        <div className="mt-2 flex flex-wrap items-center gap-2 @xl:mt-0 @xl:w-56 @xl:shrink-0 @xl:flex-col @xl:items-end">
          <span className="hidden text-lg leading-tight font-bold tabular-nums @xl:block">{total}</span>
          <Elapsed order={order} now={now} />
          <span className="ml-auto flex gap-2 @xl:ml-0">
            <button
              type="button"
              onClick={() => printTicket(order._id, paper)}
              aria-label={t.alerts.print(order.number)}
              title={t.alerts.print(order.number)}
              className="grid size-10 shrink-0 place-items-center rounded-lg border border-line bg-surface text-ink-muted hover:bg-paper hover:text-ink @md:size-11"
            >
              <Printer aria-hidden className="size-5" />
            </button>
            {next && label && can(user.role, "orders:write") && (
              <button
                type="button"
                disabled={change.isPending}
                onClick={() => change.mutate({ id: order._id, status: next })}
                className="h-10 min-w-28 rounded-lg bg-action px-3 text-sm font-bold text-white hover:bg-action-hover disabled:opacity-60 @md:h-11 @md:min-w-32"
              >
                {label}
              </button>
            )}
          </span>
        </div>
        {change.isError && <p className="mt-1 text-right text-sm font-bold text-error">{errorText(change.error, t)}</p>}
      </div>
    </li>
  );
}

// El de la lista (que se actualiza sola) o, si no está en ella, el que se pide aparte.
export function OpenOrder({
  id,
  fromList,
  onClose,
  side = false,
  conversationHref,
}: {
  id: string;
  fromList: Order | undefined;
  onClose: () => void;
  side?: boolean;
  conversationHref?: (conversationId: string) => string;
}) {
  const single = useOrder(id, !fromList);
  const order = fromList ?? single.data;
  if (!order) return null;
  return <OrderDetail key={order._id} order={order} onClose={onClose} side={side} conversationHref={conversationHref} />;
}

// Lo que comparten la página y el espacio de trabajo: el día, el filtro, la búsqueda y la lista.
export function useOrdersView() {
  const [params, setParams] = useSearchParams();
  const now = useNow();
  const today = operatingDayISO(new Date(now));
  const day = params.get("dia") ?? today;
  const linked = params.get("filtro");
  const filter: OrderFilter = isOrderFilter(linked) ? linked : "active";
  const [search, setSearch] = useState("");
  const orders = useOrders(day, day === today);

  // Varios a la vez: elegir una mesa abre su cuenta y cierra el pedido que estaba abierto.
  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [name, value] of Object.entries(changes)) {
      if (value) next.set(name, value);
      else next.delete(name);
    }
    setParams(next, { replace: true });
  };
  const setParam = (name: string, value: string | null) => update({ [name]: value });

  const list = orders.data?.orders ?? [];
  const found = search.trim()
    ? list.filter((order) => matchesSearch(`#${order.number} ${order.number} ${order.customer.name} ${order.customer.phone} ${order.customer.phone.replace(/\D/g, "")}`, search))
    : list;
  // Lo más urgente arriba en cada etapa; los terminados, el último primero.
  const ofFilter = (value: OrderFilter) => found.filter((order) => matchesFilter(order.status, value)).sort(byUrgency(now));
  const visible = ofFilter(filter);
  const count = (value: OrderFilter) => found.filter((order) => matchesFilter(order.status, value)).length;

  return { params, setParam, update, now, today, day, filter, search, setSearch, orders, list, visible, ofFilter, count };
}
export type OrdersView = ReturnType<typeof useOrdersView>;

// `compact`: en la barra del panel, sin la palabra "Dia" a la vista; si se está mirando otro
// día, se marca para que nadie lo confunda con hoy.
export function DayPicker({ view, compact = false }: { view: OrdersView; compact?: boolean }) {
  const t = useT();
  const otherDay = view.day !== view.today;
  return (
    <label className="flex items-center gap-2 text-sm font-bold">
      <span className={compact ? "sr-only" : ""}>{t.orders.day}</span>
      <input
        type="date"
        value={view.day}
        max={view.today}
        title={compact ? t.orders.day : undefined}
        onChange={(event) => view.setParam("dia", event.target.value && event.target.value !== view.today ? event.target.value : null)}
        className={`rounded-lg border bg-surface px-3 ${compact ? "h-10 text-sm" : "h-11"} ${
          compact && otherDay ? "border-warning font-bold text-warning ring-2 ring-warning/25" : "border-line font-normal"
        }`}
      />
    </label>
  );
}

// `compact`: un botón redondo con el color de la marca y solo el + (el nombre, al pasar el mouse).
export function NewOrderButton({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const { user } = usePanel();
  if (!can(user.role, "orders:manual")) return null;
  if (compact) {
    return (
      <Link
        to="/painel/pedidos/novo"
        aria-label={t.nav.newOrder}
        title={t.nav.newOrder}
        className="grid size-9 shrink-0 place-items-center rounded-full bg-(--brand) text-(--on-brand) shadow-sm ring-2 ring-(--brand)/20 transition-transform hover:scale-105 active:scale-95"
      >
        <Plus aria-hidden strokeWidth={2.75} className="size-5" />
      </Link>
    );
  }
  return (
    <Link to="/painel/pedidos/novo" className={button.primary}>
      <Plus aria-hidden className="size-5" />
      {t.nav.newOrder}
    </Link>
  );
}

// El filtro como menú desplegable: muestra el elegido y cuántos hay. Se usa en la barra del
// panel Pedidos y arriba de cada lista cuando la lista está dividida.
export function FilterMenu({ value, onChange, count }: { value: OrderFilter; onChange: (value: OrderFilter) => void; count: (value: OrderFilter) => number }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);
  useDismiss(ref, open, close);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-9 max-w-full items-center gap-1.5 rounded-full bg-paper px-3 text-sm font-bold ring-1 ring-line hover:bg-surface"
      >
        <span className="truncate">{t.orders.filters[value]}</span>
        <span className="font-normal tabular-nums text-ink-muted">{count(value)}</span>
        <ChevronDown aria-hidden className={`size-4 shrink-0 text-ink-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div role="menu" aria-label={t.pages.orders.title} className="absolute top-full left-0 z-30 mt-1 w-56 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lg">
          {ORDER_FILTERS.map((option) => (
            <button
              key={option}
              type="button"
              role="menuitemradio"
              aria-checked={value === option}
              onClick={() => {
                onChange(option);
                close();
              }}
              className={`flex min-h-11 w-full items-center gap-2 px-3 text-left hover:bg-paper ${value === option ? "font-bold" : ""}`}
            >
              <Check aria-hidden className={`size-4 shrink-0 ${value === option ? "" : "invisible"}`} />
              <span className="flex-1">{t.orders.filters[option]}</span>
              <span className="tabular-nums text-ink-muted">{count(option)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// El buscador: uno solo para todas las listas.
export function OrdersSearch({ view }: { view: OrdersView }) {
  const t = useT();
  return (
    <label className="relative block">
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
  );
}

// Los pedidos de una lista, por etapa y en el orden en que pasan: qué hay para aceptar, qué
// está en la cocina… `dense`: títulos más chicos (lista dividida). `id`: para que dos listas
// no repitan los ids de sus títulos.
export function OrderStages({
  view,
  orders: shown,
  selectedId,
  onOpen,
  dense = false,
  id = "etapa",
}: {
  view: OrdersView;
  orders: Order[];
  selectedId?: string | null;
  onOpen: (id: string) => void;
  dense?: boolean;
  id?: string;
}) {
  const t = useT();
  const { orders, list, today, day, now } = view;
  if (orders.isPending) return <Spinner />;
  if (orders.isError) return <p className="text-error">{t.errors.generic}</p>;
  if (shown.length === 0) {
    return (
      <p className={`rounded-xl border border-dashed border-line bg-surface text-ink-muted ${dense ? "p-4 text-sm" : "p-6"}`}>
        {view.search.trim() ? t.workspace.noResults : list.length === 0 && day === today ? t.orders.empty : t.orders.emptyFilter}
      </p>
    );
  }
  return (
    <div className={dense ? "space-y-4" : "space-y-5"}>
      {STATUS_ORDER.map((status) => {
        const inStage = shown.filter((order) => order.status === status);
        if (!inStage.length) return null;
        return (
          <section key={status} aria-labelledby={`${id}-${status}`}>
            <h3 id={`${id}-${status}`} className={`mb-2 flex items-center gap-2 font-bold ${dense ? "text-sm" : ""}`}>
              <span aria-hidden className={`size-2.5 rounded-full ${STATUS_MARK[status]}`} />
              {t.orders.sections[status]}
              <span className="font-normal text-ink-muted tabular-nums">{inStage.length}</span>
            </h3>
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
              {inStage.map((order) => (
                <OrderRow key={order._id} order={order} now={now} today={today} selected={order._id === selectedId} onOpen={() => onOpen(order._id)} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

// Celular y tablet: buscador, los botones de filtro y la lista.
export function OrdersList({ view, selectedId, onOpen }: { view: OrdersView; selectedId?: string | null; onOpen: (id: string) => void }) {
  const t = useT();
  const { filter } = view;

  return (
    <div className="@container">
      <div className="mb-3">
        <OrdersSearch view={view} />
      </div>
      <div role="group" aria-label={t.pages.orders.title} className="mb-4 flex flex-wrap gap-2">
        {BASIC_FILTERS.map((value) => (
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
      <OrderStages view={view} orders={view.visible} selectedId={selectedId} onOpen={onOpen} />
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
  const tableSheet = useParamSheet("mesa");
  const salon = useSalonTables();
  const salonTables = salon.data?.tables ?? [];
  // El salón solo aparece si el local tiene mesas.
  const hasSalon = salonTables.some((table) => table.active);
  const wanted = view.params.get("ver");
  const showing = wanted === "whatsapp" ? "whatsapp" : wanted === "salao" && hasSalon ? "salon" : "orders";
  const tabs = [
    ["orders", t.workspace.panels.orders],
    ...(hasSalon ? ([["salon", t.workspace.panels.salon]] as const) : []),
    ["whatsapp", t.workspace.panels.whatsapp],
  ] as const;
  const param = { orders: null, salon: "salao", whatsapp: "whatsapp" } as const;

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
            onClick={() => view.setParam("ver", param[value])}
            className={`h-11 flex-1 rounded-lg px-5 font-bold sm:flex-none ${showing === value ? "bg-action text-white" : "text-ink-muted hover:text-ink"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {showing === "orders" ? (
        <OrdersList view={view} selectedId={detail.value} onOpen={(id) => detail.open(id)} />
      ) : showing === "salon" ? (
        <div className="rounded-xl border border-line bg-surface">
          <SalonBoard tables={salonTables} now={view.now} selectedId={tableSheet.value} onSelect={(id) => tableSheet.open(id)} />
        </div>
      ) : (
        <Conversations selected={view.params.get("conversa")} onSelect={(id) => view.setParam("conversa", id)} compact />
      )}

      {/* Un pedido abierto desde la cuenta queda en lugar de la hoja de la mesa; al cerrarlo, vuelve. */}
      {tableSheet.value && hasSalon && !detail.value && (
        <TableTab
          key={tableSheet.value}
          tableId={tableSheet.value}
          now={view.now}
          onClose={tableSheet.close}
          onOpenOrder={(id) => detail.open(id)}
          onMoved={(id) => view.setParam("mesa", id)}
          newOrderHref={`/painel/pedidos/novo?mesa=${tableSheet.value}`}
        />
      )}
      {detail.value && <OpenOrder id={detail.value} fromList={view.list.find((order) => order._id === detail.value)} onClose={detail.close} />}
    </>
  );
}
