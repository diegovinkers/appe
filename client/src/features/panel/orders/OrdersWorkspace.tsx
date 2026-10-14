import { ClipboardList, GripVertical, MessageCircle, PanelLeftClose, ReceiptText, RotateCcw } from "lucide-react";
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
import { isActive } from "./orderFlow";

type PanelId = "whatsapp" | "orders" | "detail";
const DEFAULT_ORDER: PanelId[] = ["whatsapp", "orders", "detail"];
const DEFAULT_SIZE: Record<PanelId, string> = { whatsapp: "27%", orders: "41%", detail: "32%" };
const ICONS = { whatsapp: MessageCircle, orders: ClipboardList, detail: ReceiptText };
const ORDER_KEY = "painel.pedidos.paineis";
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

function readOrder(): PanelId[] {
  try {
    const saved: unknown = JSON.parse(storage.getItem(ORDER_KEY) ?? "null");
    if (Array.isArray(saved) && saved.length === DEFAULT_ORDER.length && DEFAULT_ORDER.every((id) => saved.includes(id))) return saved as PanelId[];
  } catch {
    // Guardado roto: la disposición original.
  }
  return DEFAULT_ORDER;
}

function forgetLayouts() {
  try {
    for (const key of Object.keys(localStorage)) if (key.includes(LAYOUT_PREFIX) || key === ORDER_KEY) localStorage.removeItem(key);
  } catch {
    // Sin almacenamiento: no había nada guardado.
  }
}

// Un panel: barra con el nombre (se arrastra para cambiarlo de lugar), recoger y su contenido.
function WorkspacePanel({
  id,
  badge,
  extra,
  onSwap,
  onMove,
  children,
}: {
  id: PanelId;
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
    if (event.key === "ArrowLeft") onMove(id, -1);
    if (event.key === "ArrowRight") onMove(id, 1);
  };
  const count = badge ? <span className="grid min-w-6 place-items-center rounded-full bg-closed px-1.5 text-xs font-bold text-white">{badge}</span> : null;

  return (
    <Panel
      id={id}
      panelRef={ref}
      defaultSize={DEFAULT_SIZE[id]}
      minSize="18%"
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
          className="flex h-full w-full flex-col items-center gap-3 rounded-xl border border-line bg-surface py-3 text-ink-muted hover:bg-paper hover:text-ink"
        >
          <Icon aria-hidden className="size-5" />
          {count}
          <span className="font-bold [writing-mode:vertical-rl]">{name}</span>
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
              aria-label={t.workspace.move(name)}
              title={t.workspace.move(name)}
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
              <PanelLeftClose aria-hidden className="size-5" />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </section>
      )}
    </Panel>
  );
}

// El borde entre dos paneles: se arrastra (o se usa con el teclado) para cambiar el tamaño.
function Edge() {
  return (
    <Separator className="group relative w-3 shrink-0 outline-none">
      <span aria-hidden className="absolute inset-y-6 left-1/2 w-1 -translate-x-1/2 rounded-full bg-transparent transition-colors group-hover:bg-line group-focus-visible:bg-[#2f7de1] group-data-[separator=active]:bg-ink-muted" />
    </Separator>
  );
}

// Pedidos en la PC: WhatsApp, la lista y el detalle lado a lado, como paneles que el equipo
// acomoda a su gusto (tamaño, lugar y recogidos). El salón con las mesas se suma cuando existan.
export function OrdersWorkspace() {
  const t = useT();
  const { user } = usePanel();
  const view = useOrdersView();
  const { params, setParam } = view;
  const [order, setOrder] = useState<PanelId[]>(readOrder);
  const [version, setVersion] = useState(0);
  // Tamaños y recogidos se guardan por panel (no dependen del orden): sobreviven a moverlos.
  const layoutId = `${LAYOUT_PREFIX}tamanhos`;
  const layout = useDefaultLayout({ id: layoutId, storage });

  const isOwner = can(user.role, "store:write");
  const assistant = useAssistantSettings(isOwner);
  const conversations = useConversations("all");
  const waiting = (conversations.data?.conversations ?? []).filter(needsPerson).length;
  const activeOrders = view.list.filter((item) => isActive(item.status)).length;

  const selectedOrder = params.get("pedido");
  const selectedConversation = params.get("conversa");
  // Links que abren algo en otro panel sin cerrar lo que está abierto en los demás.
  const hrefWith = (name: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(name, value);
    return `/painel/pedidos?${next}`;
  };

  const save = (next: PanelId[]) => {
    storage.setItem(ORDER_KEY, JSON.stringify(next));
    setOrder(next);
  };
  const swap = (from: PanelId, to: PanelId) => {
    const next = [...order];
    const a = next.indexOf(from);
    const b = next.indexOf(to);
    [next[a], next[b]] = [next[b], next[a]];
    save(next);
  };
  const move = (id: PanelId, step: -1 | 1) => {
    const index = order.indexOf(id);
    const target = order[index + step];
    if (target) swap(id, target);
  };
  const reset = () => {
    if (!window.confirm(t.workspace.resetConfirm)) return;
    forgetLayouts();
    setOrder(DEFAULT_ORDER);
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
    detail: {
      body: selectedOrder ? (
        <OpenOrder
          inline
          id={selectedOrder}
          fromList={view.list.find((item) => item._id === selectedOrder)}
          onClose={() => setParam("pedido", null)}
          conversationHref={(conversationId) => hrefWith("conversa", conversationId)}
        />
      ) : (
        <p className="m-3 rounded-xl border border-dashed border-line p-6 text-ink-muted">{t.workspace.pickOrder}</p>
      ),
    },
  };

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

      <Group
        key={`${order.join("-")}-${version}`}
        orientation="horizontal"
        defaultLayout={layout.defaultLayout}
        onLayoutChanged={layout.onLayoutChanged}
        className="min-h-0 flex-1"
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
    </div>
  );
}
