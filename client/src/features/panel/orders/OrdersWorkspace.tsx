import { Armchair, ClipboardList, Columns2, GripVertical, MessageCircle, PanelLeftClose, PanelTopClose, X } from "lucide-react";
import { Fragment, type DragEvent, type KeyboardEvent, type ReactNode, useEffect, useState } from "react";
import { Group, Panel, Separator, useDefaultLayout, usePanelRef } from "react-resizable-panels";
import { can } from "../../../auth/permissions";
import { Switch } from "../../../components/ui";
import { errorText, useT } from "../../../i18n";
import { formatDay } from "../../../lib/format";
import { needsPerson, useAssistantSettings, useConversations, useUpdateAssistant } from "../assistant/assistant";
import { Conversations } from "../assistant/Conversations";
import { usePanel } from "../PanelLayout";
import { DayPicker, FilterMenu, NewOrderButton, OpenOrder, OrderStages, OrdersSearch, useOrdersView } from "../pages/OrdersPage";
import { SalonBoard } from "../salon/SalonBoard";
import { TableTab } from "../salon/TableTab";
import { useSalonTables } from "../salon/useSalon";
import { type OrderFilter, isActive, isOrderFilter } from "./orderFlow";

// El detalle no es un panel: se abre al tocar un pedido o una mesa, en una hoja al costado.
type ColumnId = "whatsapp" | "orders";
// El salón es una fila a todo el ancho, arriba o abajo de las columnas.
type PanelId = ColumnId | "salon";
type SalonAt = "top" | "bottom";
const DEFAULT_ORDER: ColumnId[] = ["whatsapp", "orders"];
const DEFAULT_SIZE: Record<PanelId, string> = { whatsapp: "34%", orders: "66%", salon: "33%" };
const ICONS = { whatsapp: MessageCircle, orders: ClipboardList, salon: Armchair };
const ORDER_KEY = "painel.pedidos.paineis";
const SALON_KEY = "painel.pedidos.salao";
// Las listas del panel Pedidos (el filtro de cada una), hasta tres lado a lado.
const LISTS_KEY = "painel.pedidos.listas";
const MAX_LISTS = 3;
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

function readLists(): OrderFilter[] {
  try {
    const saved: unknown = JSON.parse(storage.getItem(LISTS_KEY) ?? "null");
    if (Array.isArray(saved) && saved.length >= 1 && saved.length <= MAX_LISTS && saved.every(isOrderFilter)) return saved;
  } catch {
    // Guardado roto: una sola lista.
  }
  return ["active"];
}

// Un panel: barra con el nombre (se arrastra para cambiarlo de lugar), recoger y su contenido.
// `row`: una fila a todo el ancho (el salón): se mueve con ↑ ↓ y se recoge hacia arriba.
function WorkspacePanel({
  id,
  row = false,
  badge,
  beside,
  extra,
  onSwap,
  onMove,
  children,
}: {
  id: PanelId;
  row?: boolean;
  badge?: number;
  // Pegado al nombre (el interruptor "IA"); `extra` va a la derecha.
  beside?: ReactNode;
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
            {beside}
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

// Pedidos en la PC: WhatsApp y la lista lado a lado, como paneles que el equipo acomoda a su
// gusto (tamaño, lugar y recogidos). Si el local tiene mesas, el salón es una fila a todo el
// ancho arriba (o abajo) de las columnas. Un pedido o una mesa se abren al tocarlos.
export function OrdersWorkspace() {
  const t = useT();
  const { user } = usePanel();
  const view = useOrdersView();
  const { params, setParam } = view;
  const [order, setOrder] = useState<ColumnId[]>(readOrder);
  const [salonAt, setSalonAt] = useState<SalonAt>(readSalonAt);
  const [lists, setLists] = useState<OrderFilter[]>(readLists);
  // Tamaños y recogidos se guardan por panel (no dependen del orden): sobreviven a moverlos.
  const layout = useDefaultLayout({ id: `${LAYOUT_PREFIX}colunas`, storage });
  const rowsLayout = useDefaultLayout({ id: `${LAYOUT_PREFIX}filas`, storage });
  const listsLayout = useDefaultLayout({ id: `${LAYOUT_PREFIX}listas-${lists.length}`, storage });

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

  const saveLists = (next: OrderFilter[]) => {
    storage.setItem(LISTS_KEY, JSON.stringify(next));
    setLists(next);
  };
  const setList = (index: number, value: OrderFilter) => saveLists(lists.map((current, i) => (i === index ? value : current)));
  // Al dividir por primera vez: Nuevos | En preparación (no se repiten). Después, Todos.
  const split = () => saveLists(lists.length === 1 ? ["new", "preparing"] : [...lists, "all"]);
  const removeList = (index: number) => saveLists(lists.filter((_, i) => i !== index));
  // Un link con ?filtro= (el aviso de pedidos nuevos, Início) cae en la primera lista.
  const linked = params.get("filtro");
  useEffect(() => {
    if (!isOrderFilter(linked)) return;
    saveLists([linked, ...readLists().slice(1)]);
    setParam("filtro", null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked]);

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

  const assistantData = assistant.data?.assistant;
  const toggleAssistant = useUpdateAssistant();
  const content: Record<PanelId, { badge?: number; beside?: ReactNode; extra?: ReactNode; body: ReactNode }> = {
    whatsapp: {
      badge: waiting,
      // Prender o apagar el asistente sin salir de Pedidos (solo el dueño).
      beside: isOwner && assistantData && (
        <span className="ml-2" title={t.workspace.aiHint}>
          <Switch
            label={t.workspace.ai}
            checked={assistantData.enabled}
            disabled={toggleAssistant.isPending}
            onChange={(enabled) => toggleAssistant.mutate({ enabled })}
          />
        </span>
      ),
      body: (
        // Con una conversación abierta, ocupa todo el alto: solo se mueven los mensajes.
        <div className={selectedConversation ? "flex h-full min-h-0 flex-col p-2" : "p-3"}>
          {/* Si no se pudo (por ejemplo, el plan no incluye el asistente), el motivo queda acá. */}
          {toggleAssistant.isError && (
            <p role="alert" className="mb-3 rounded-lg bg-error-soft px-3 py-2 text-sm font-bold text-error ring-1 ring-error/30">
              {errorText(toggleAssistant.error, t)}
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
      // Qué pedidos se ven y "Dividir", al lado del nombre; el día y "Novo pedido", a la derecha.
      // Con la lista dividida, cada lista tiene su propio menú.
      beside: (
        <span className="ml-2 flex min-w-0 items-center gap-1">
          {lists.length === 1 && <FilterMenu value={lists[0]} onChange={(value) => setList(0, value)} count={view.count} />}
          {lists.length < MAX_LISTS && (
            <button
              type="button"
              onClick={split}
              aria-label={t.workspace.split}
              title={t.workspace.split}
              className="grid size-9 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-paper hover:text-ink"
            >
              <Columns2 aria-hidden className="size-5" />
            </button>
          )}
        </span>
      ),
      extra: (
        <span className="mr-1 flex items-center gap-2">
          <DayPicker compact view={view} />
          <NewOrderButton compact />
        </span>
      ),
      body: (
        <div className="flex h-full min-h-0 flex-col">
          <div className="shrink-0 p-3 pb-2">
            <OrdersSearch view={view} />
          </div>
          {lists.length === 1 ? (
            <div className="@container min-h-0 flex-1 overflow-y-auto px-3 pb-3">
              <OrderStages view={view} orders={view.ofFilter(lists[0])} selectedId={selectedOrder} onOpen={(id) => setParam("pedido", id)} />
            </div>
          ) : (
            <Group
              key={lists.length}
              orientation="horizontal"
              defaultLayout={listsLayout.defaultLayout}
              onLayoutChanged={listsLayout.onLayoutChanged}
              className="min-h-0 flex-1 px-1 pb-1"
            >
              {lists.map((value, index) => (
                <Fragment key={index}>
                  {index > 0 && <Edge />}
                  <Panel id={`lista-${index}`} defaultSize={`${100 / lists.length}%`} minSize="22%" className="h-full">
                    <section aria-label={t.orders.filters[value]} className="flex h-full min-h-0 flex-col">
                      <div className="flex shrink-0 items-center gap-1 px-2 pb-2">
                        <FilterMenu value={value} onChange={(next) => setList(index, next)} count={view.count} />
                        <div className="flex-1" />
                        {index > 0 && (
                          <button
                            type="button"
                            onClick={() => removeList(index)}
                            aria-label={t.workspace.removeList}
                            title={t.workspace.removeList}
                            className="grid size-9 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-paper hover:text-ink"
                          >
                            <X aria-hidden className="size-4" />
                          </button>
                        )}
                      </div>
                      <div className="@container min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                        <OrderStages
                          dense
                          id={`lista-${index}`}
                          view={view}
                          orders={view.ofFilter(value)}
                          selectedId={selectedOrder}
                          onOpen={(id) => setParam("pedido", id)}
                        />
                      </div>
                    </section>
                  </Panel>
                </Fragment>
              ))}
            </Group>
          )}
        </div>
      ),
    },
    salon: {
      badge: salonAttention,
      body: <SalonBoard fill tables={salonTables} now={view.now} selectedId={selectedTable} onSelect={(id) => view.update({ mesa: id, pedido: null })} />,
    },
  };

  const columns = (
    <Group
      key={order.join("-")}
      orientation="horizontal"
      defaultLayout={layout.defaultLayout}
      onLayoutChanged={layout.onLayoutChanged}
      className={hasSalon ? "h-full" : "min-h-0 flex-1"}
    >
      {order.map((id, index) => (
        <Fragment key={id}>
          {index > 0 && <Edge />}
          <WorkspacePanel id={id} badge={content[id].badge} beside={content[id].beside} extra={content[id].extra} onSwap={swap} onMove={move}>
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
      {/* Sin barra de título: los paneles usan todo el alto. El título queda para el lector de pantalla. */}
      <h1 className="sr-only">{view.day === view.today ? t.pages.orders.title : t.orders.titleForDay(formatDay(view.day))}</h1>

      {hasSalon ? (
        <Group
          key={`filas-${salonAt}`}
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

      {/* Abierto desde la cuenta de una mesa, el pedido queda en su lugar; al cerrarlo, vuelve la mesa. */}
      {selectedOrder ? (
        <OpenOrder
          side
          id={selectedOrder}
          fromList={view.list.find((item) => item._id === selectedOrder)}
          onClose={() => setParam("pedido", null)}
          // "Ver a conversa" cierra la hoja y la abre en el panel de WhatsApp.
          conversationHref={(conversationId) => {
            const next = new URLSearchParams(params);
            next.set("conversa", conversationId);
            next.delete("pedido");
            return `/painel/pedidos?${next}`;
          }}
        />
      ) : (
        selectedTable && (
          <TableTab
            key={selectedTable}
            side
            tableId={selectedTable}
            now={view.now}
            onClose={() => setParam("mesa", null)}
            onOpenOrder={(id) => setParam("pedido", id)}
            onMoved={(id) => setParam("mesa", id)}
            newOrderHref={`/painel/pedidos/novo?mesa=${selectedTable}`}
          />
        )
      )}
    </div>
  );
}
