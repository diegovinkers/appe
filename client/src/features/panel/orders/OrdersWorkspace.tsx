import { Armchair, ClipboardList, GripVertical, MessageCircle, PanelLeftClose, PanelTopClose, ReceiptText, RotateCcw } from "lucide-react";
import { Fragment, type DragEvent, type KeyboardEvent, type ReactNode, useState } from "react";
import { Link } from "react-router";
import { Group, Panel, Separator, useDefaultLayout, usePanelRef } from "react-resizable-panels";
import { can } from "../../../auth/permissions";
import { button } from "../../../components/ui";
import { useT } from "../../../i18n";
import { formatDay } from "../../../lib/format";
import { needsPerson, useAssistantSettings, useConversations } from "../assistant/assistant";
import { Conversations } from "../assistant/Conversations";
import { usePanel } from "../PanelLayout";
import { DayPicker, NewOrderButton, OpenOrder, OrdersList, useOrdersView } from "../pages/OrdersPage";
import { SalonBoard } from "../salon/SalonBoard";
import { TableTab } from "../salon/TableTab";
import { useSalonTables } from "../salon/useSalon";
import { isActive } from "./orderFlow";

type ColumnId = "whatsapp" | "orders" | "detail";
// El salón es una fila a todo el ancho, arriba o abajo de las columnas.
type PanelId = ColumnId | "salon";
type SalonAt = "top" | "bottom";
const DEFAULT_ORDER: ColumnId[] = ["whatsapp", "orders", "detail"];
const DEFAULT_SIZE: Record<PanelId, string> = { whatsapp: "27%", orders: "41%", detail: "32%", salon: "33%" };
const ICONS = { whatsapp: MessageCircle, orders: ClipboardList, detail: ReceiptText, salon: Armchair };
const ORDER_KEY = "painel.pedidos.paineis";
const SALON_KEY = "painel.pedidos.salao";
const LAYOUT_PREFIX = "painel-pedidos-";
const DRAG_TYPE = "application/x-painel";
// Recogido, un panel queda como una pestaña finita (como el panel lateral de VS Code).
const COLLAPSED = "52px";

// La disposición es de cada aparato (la PC de la caja y la tablet de la cocina, cada una la suya).
// Sin almacenamiento (navegación privada), vale hasta recargar.
const storage = {
  getItem: (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Sin almacenamiento: no se guarda.
    }
  },
};

function readOrder(): ColumnId[] {
  try {
    const saved: unknown = JSON.parse(storage.getItem(ORDER_KEY) ?? "null");
    if (Array.isArray(saved) && saved.length === DEFAULT_ORDER.length && DEFAULT_ORDER.every((id) => saved.includes(id))) return saved as ColumnId[];
  } catch {
    // Guardado roto: la disposición original.
  }
  return DEFAULT_ORDER;
}

const readSalonAt = (): SalonAt => (storage.getItem(SALON_KEY) === "bottom" ? "bottom" : "top");

function forgetLayouts() {
  try {
    for (const key of Object.keys(localStorage)) if (key.includes(LAYOUT_PREFIX) || key === ORDER_KEY || key === SALON_KEY) localStorage.removeItem(key);
  } catch {
    // Sin almacenamiento: no había nada guardado.
  }
}

// Un panel: barra con el nombre (se arrastra para cambiarlo de lugar), recoger y su contenido.
// `row`: una fila a todo el ancho (el salón): se mueve con ↑ ↓ y se recoge hacia arriba.
function WorkspacePanel({
  id,
  row = false,
  badge,
  extra,
  onSwap,
  onMove,
  children,
}: {
  id: PanelId;
  row?: boolean;
  badge?: number;
  extra?: ReactNode;
  onSwap: (from: PanelId, to: PanelId) => void;
  onMove: (id: PanelId, step: -1 | 1) => void;
  children: ReactNode;
}) {
  const t = useT();
  const name = t.workspace.panels[id];
  const Icon = ICONS[id];
  const ref = usePanelRef();
  const [collapsed, setCollapsed] = useState(false);
  const [over, setOver] = useState(false);
  const moveLabel = row ? t.workspace.moveRow(name) : t.workspace.move(name);

  const dragOver = (event: DragEvent) => {
    if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
    event.preventDefault();
    setOver(true);
  };
  const drop = (event: DragEvent) => {
    setOver(false);
    const from = event.dataTransfer.getData(DRAG_TYPE) as PanelId;
    if (from && from !== id) onSwap(from, id);
  };
  const keys = (event: KeyboardEvent) => {
    if (event.key === (row ? "ArrowUp" : "ArrowLeft")) onMove(id, -1);
    if (event.key === (row ? "ArrowDown" : "ArrowRight")) onMove(id, 1);
  };
  const count = badge ? <span className="grid min-w-6 place-items-center rounded-full bg-closed px-1.5 text-xs font-bold text-white">{badge}</span> : null;

  return (
    <Panel
      id={id}
      panelRef={ref}
      defaultSize={DEFAULT_SIZE[id]}
      minSize={row ? "15%" : "18%"}
      collapsible
      collapsedSize={COLLAPSED}
      onResize={(size) => setCollapsed(size.inPixels <= 60)}
      className="h-full"
    >
      {collapsed ? (
        <button
          type="button"
          onClick={() => ref.current?.expand()}
          aria-label={t.workspace.expand(name)}
          title={t.workspace.expand(name)}
          className={`flex h-full w-full items-center gap-3 rounded-xl border border-line bg-surface text-ink-muted hover:bg-paper hover:text-ink ${row ? "px-4" : "flex-col py-3"}`}
        >
          <Icon aria-hidden className="size-5" />
          {count}
          <span className={`font-bold ${row ? "" : "[writing-mode:vertical-rl]"}`}>{name}</span>
        </button>
      ) : (
        <section
          aria-label={name}
          onDragOver={dragOver}
          onDragLeave={() => setOver(false)}
          onDrop={drop}
          className={`flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-surface ${over ? "border-[#2f7de1] ring-2 ring-[#2f7de1]/40" : "border-line"}`}
        >
          <header className="flex shrink-0 items-center gap-1 border-b border-line py-1 pr-1 pl-1">
            <button
              type="button"
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData(DRAG_TYPE, id);
                event.dataTransfer.effectAllowed = "move";
              }}
              onKeyDown={keys}
              aria-label={moveLabel}
              title={moveLabel}
              className="grid size-11 shrink-0 cursor-grab place-items-center rounded-lg text-ink-muted hover:bg-paper hover:text-ink active:cursor-grabbing"
            >
              <GripVertical aria-hidden className="size-5" />
            </button>
            <Icon aria-hidden className="size-5 shrink-0 text-ink-muted" />
            <h2 className="min-w-0 truncate font-bold">{name}</h2>
            {count}
            <div className="min-w-0 flex-1" />
            {extra}
            <button
              type="button"
              onClick={() => ref.current?.collapse()}
              aria-label={t.workspace.collapse(name)}
              title={t.workspace.collapse(name)}
              className="grid size-11 shrink-0 place-items-center rounded-lg text-ink-muted hover:bg-paper hover:text-ink"
            >
              {row ? <PanelTopClose aria-hidden className="size-5" /> : <PanelLeftClose aria-hidden className="size-5" />}
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </section>
      )}
    </Panel>
  );
}

// El borde entre dos paneles: se arrastra (o se usa con el teclado) para cambiar el tamaño.
// `row`: el borde entre la fila del salón y las columnas.
function Edge({ row = false }: { row?: boolean }) {
  const mark = "absolute rounded-full bg-transparent transition-colors group-hover:bg-line group-focus-visible:bg-[#2f7de1] group-data-[separator=active]:bg-ink-muted";
  return (
    <Separator className={`group relative shrink-0 outline-none ${row ? "h-3" : "w-3"}`}>
      <span aria-hidden className={`${mark} ${row ? "inset-x-6 top-1/2 h-1 -translate-y-1/2" : "inset-y-6 left-1/2 w-1 -translate-x-1/2"}`} />
    </Separator>
  );
}

// Pedidos en la PC: WhatsApp, la lista y el detalle lado a lado, como paneles que el equipo
// acomoda a su gusto (tamaño, lugar y recogidos). Si el local tiene mesas, el salón es una
// fila a todo el ancho arriba (o abajo) de las columnas.
export function OrdersWorkspace() {
  const t = useT();
  const { user } = usePanel();
  const view = useOrdersView();
  const { params, setParam } = view;
  const [order, setOrder] = useState<ColumnId[]>(readOrder);
  const [salonAt, setSalonAt] = useState<SalonAt>(readSalonAt);
  const [version, setVersion] = useState(0);
  // Tamaños y recogidos se guardan por panel (no dependen del orden): sobreviven a moverlos.
  const layout = useDefaultLayout({ id: `${LAYOUT_PREFIX}tamanhos`, storage });
  const rowsLayout = useDefaultLayout({ id: `${LAYOUT_PREFIX}filas`, storage });

  const isOwner = can(user.role, "store:write");
  const assistant = useAssistantSettings(isOwner);
  const conversations = useConversations("all");
  const waiting = (conversations.data?.conversations ?? []).filter(needsPerson).length;
  const activeOrders = view.list.filter((item) => isActive(item.status)).length;
  const salon = useSalonTables();
  const salonTables = salon.data?.tables ?? [];
  const hasSalon = salonTables.some((table) => table.active);
  // Las mesas que esperan a alguien: servir o cobrar.
  const salonAttention = salonTables.filter((table) => table.state === "ready" || table.state === "bill").length;

  const selectedOrder = params.get("pedido");
  const selectedConversation = params.get("conversa");
  const selectedTable = hasSalon ? params.get("mesa") : null;
  // Links que abren algo en otro panel sin cerrar lo que está abierto en los demás.
  const hrefWith = (name: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(name, value);
    return `/painel/pedidos?${next}`;
  };

  const save = (next: ColumnId[]) => {
    storage.setItem(ORDER_KEY, JSON.stringify(next));
    setOrder(next);
  };
  const placeSalon = (at: SalonAt) => {
    storage.setItem(SALON_KEY, at);
    setSalonAt(at);
  };
  const swap = (from: PanelId, to: PanelId) => {
    // El salón soltado sobre las columnas pasa al otro lado (arriba o abajo).
    if (from === "salon") return placeSalon(salonAt === "top" ? "bottom" : "top");
    if (to === "salon") return;
    const next = [...order];
    const a = next.indexOf(from);
    const b = next.indexOf(to);
    [next[a], next[b]] = [next[b], next[a]];
    save(next);
  };
  const move = (id: PanelId, step: -1 | 1) => {
    if (id === "salon") return placeSalon(step < 0 ? "top" : "bottom");
    const index = order.indexOf(id);
    const target = order[index + step];
    if (target) swap(id, target);
  };
  const reset = () => {
    if (!window.confirm(t.workspace.resetConfirm)) return;
    forgetLayouts();
    setOrder(DEFAULT_ORDER);
    setSalonAt("top");
    setVersion((value) => value + 1);
  };

  const assistantData = assistant.data?.assistant;
  const content: Record<PanelId, { badge?: number; extra?: ReactNode; body: ReactNode }> = {
    whatsapp: {
      badge: waiting,
      body: (
        <div className="p-3">
          {isOwner && assistantData && (
            <p className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-bold ${assistantData.enabled ? "bg-[#e3f4ea] text-[#16603b]" : "bg-paper text-ink-muted ring-1 ring-line"}`}>
                <span aria-hidden className={`size-2 rounded-full ${assistantData.enabled ? "bg-open" : "bg-ink-muted"}`} />
                {assistantData.enabled ? t.workspace.assistantOn : t.workspace.assistantOff}
              </span>
              <Link to="/painel/assistente?aba=configurar" className="inline-flex min-h-11 items-center font-bold underline underline-offset-4">
                {t.workspace.configure}
              </Link>
            </p>
          )}
          <Conversations
            compact
            selected={selectedConversation}
            onSelect={(id) => setParam("conversa", id)}
            canListen={assistantData?.available.voice ?? false}
            orderHref={(orderId) => hrefWith("pedido", orderId)}
          />
        </div>
      ),
    },
    orders: {
      badge: activeOrders,
      body: (
        <div className="p-3">
          <OrdersList view={view} selectedId={selectedOrder} onOpen={(id) => setParam("pedido", id)} />
        </div>
      ),
    },
    salon: {
      badge: salonAttention,
      body: <SalonBoard fill tables={salonTables} now={view.now} selectedId={selectedTable} onSelect={(id) => view.update({ mesa: id, pedido: null })} />,
    },
    detail: {
      // Un pedido abierto desde la cuenta de una mesa: al cerrarlo se vuelve a la cuenta.
      body: selectedOrder ? (
        <OpenOrder
          inline
          id={selectedOrder}
          fromList={view.list.find((item) => item._id === selectedOrder)}
          onClose={() => setParam("pedido", null)}
          conversationHref={(conversationId) => hrefWith("conversa", conversationId)}
        />
      ) : selectedTable ? (
        <TableTab
          key={selectedTable}
          inline
          tableId={selectedTable}
          now={view.now}
          onClose={() => setParam("mesa", null)}
          onOpenOrder={(id) => setParam("pedido", id)}
          onMoved={(id) => setParam("mesa", id)}
          newOrderHref={`/painel/pedidos/novo?mesa=${selectedTable}`}
        />
      ) : (
        <p className="m-3 rounded-xl border border-dashed border-line p-6 text-ink-muted">{hasSalon ? t.workspace.pickOrderOrTable : t.workspace.pickOrder}</p>
      ),
    },
  };

  const columns = (
    <Group
      key={`${order.join("-")}-${version}`}
      orientation="horizontal"
      defaultLayout={layout.defaultLayout}
      onLayoutChanged={layout.onLayoutChanged}
      className={hasSalon ? "h-full" : "min-h-0 flex-1"}
    >
      {order.map((id, index) => (
        <Fragment key={id}>
          {index > 0 && <Edge />}
          <WorkspacePanel id={id} badge={content[id].badge} extra={content[id].extra} onSwap={swap} onMove={move}>
            {content[id].body}
          </WorkspacePanel>
        </Fragment>
      ))}
    </Group>
  );
  const salonRow = (
    <WorkspacePanel id="salon" row badge={content.salon.badge} onSwap={swap} onMove={move}>
      {content.salon.body}
    </WorkspacePanel>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-bold tracking-tight">
          {view.day === view.today ? t.pages.orders.title : t.orders.titleForDay(formatDay(view.day))}
        </h1>
        <DayPicker view={view} />
        <NewOrderButton />
        <button type="button" onClick={reset} className={button.quiet} title={t.workspace.reset}>
          <RotateCcw aria-hidden className="size-4" />
          {t.workspace.reset}
        </button>
      </div>

      {hasSalon ? (
        <Group
          key={`filas-${salonAt}-${version}`}
          orientation="vertical"
          defaultLayout={rowsLayout.defaultLayout}
          onLayoutChanged={rowsLayout.onLayoutChanged}
          className="min-h-0 flex-1"
        >
          {salonAt === "top" && salonRow}
          {salonAt === "top" && <Edge row />}
          <Panel id="colunas" minSize="30%" className="h-full">
            {columns}
          </Panel>
          {salonAt === "bottom" && <Edge row />}
          {salonAt === "bottom" && salonRow}
        </Group>
      ) : (
        columns
      )}
    </div>
  );
}
