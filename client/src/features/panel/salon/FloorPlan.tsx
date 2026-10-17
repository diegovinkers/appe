import { type KeyboardEvent, type PointerEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useT } from "../../../i18n";

// El plano del salón: una grilla de puntos donde cada mesa ocupa una celda. Se usa para armarlo
// (Configurações → Salão: arrastrar y mover con flechas) y para atender (panel Salão, con el estado).
export const GRID_COLUMNS = 24;
export const GRID_ROWS = 24;

export type PlanTable = { _id: string; number: number; name: string; seats: number; x: number; y: number };

type Props<T extends PlanTable> = {
  tables: T[];
  label: string;
  selectedId?: string | null;
  onSelect?: (table: T) => void;
  // Solo al armar el salón: se arrastran y se mueven con flechas.
  onMove?: (table: T, x: number, y: number) => void;
  // Lo de adentro de cada mesa (número, estado, total…) y su color. `size`: el lado de la mesa en px.
  content: (table: T, size: number) => ReactNode;
  tone?: (table: T) => string;
  describe: (table: T) => string;
  cell?: number;
  // Para atender (panel Salão): el plano entra entero en el lugar que hay (ancho y alto),
  // las mesas son más grandes y sin sillas.
  fill?: boolean;
};

// Las sillas alrededor de la mesa, al centro de cada lado: se ve cuántos lugares tiene sin leer.
// Se reparten de a una por lado (arriba, abajo, izquierda, derecha) y se espacian en cada lado.
function Chairs({ seats, size }: { seats: number; size: number }) {
  const shown = Math.min(seats, 12);
  const order = shown === 2 ? ["left", "right"] : ["top", "bottom", "left", "right"];
  const perSide: Record<string, number> = { top: 0, bottom: 0, left: 0, right: 0 };
  for (let index = 0; index < shown; index++) perSide[order[index % order.length]] += 1;
  const dot = 8;
  const gap = 5;
  const chairs: { left: number; top: number }[] = [];
  for (const side of ["top", "bottom", "left", "right"]) {
    const count = perSide[side];
    for (let k = 0; k < count; k++) {
      const along = ((k + 1) / (count + 1)) * size - dot / 2;
      if (side === "top") chairs.push({ left: along, top: -dot - gap });
      if (side === "bottom") chairs.push({ left: along, top: size + gap - 4 });
      if (side === "left") chairs.push({ left: -dot - gap, top: along });
      if (side === "right") chairs.push({ left: size + gap - 4, top: along });
    }
  }
  return (
    <>
      {chairs.map((position, index) => (
        <span key={index} aria-hidden className="absolute size-2 rounded-full bg-ink-muted/60" style={position} />
      ))}
    </>
  );
}

export function FloorPlan<T extends PlanTable>({ tables, label, selectedId, onSelect, onMove, content, tone, describe, cell: fixedCell, fill = false }: Props<T>) {
  // Para atender, las filas y columnas sin mesas se juntan: cada mesa sigue al lado de las
  // mismas mesas, pero más grande (el salón entra en un tercio de la pantalla).
  const xs = fill ? [...new Set(tables.map((table) => table.x))].sort((a, b) => a - b) : [];
  const ys = fill ? [...new Set(tables.map((table) => table.y))].sort((a, b) => a - b) : [];
  const column = (table: T) => (fill ? xs.indexOf(table.x) : table.x);
  const row = (table: T) => (fill ? ys.indexOf(table.y) : table.y);
  // Para armarlo: lo justo para las mesas que hay, con una celda de aire (y un mínimo para que el plano se lea).
  const columns = fill ? Math.max(1, xs.length) : Math.min(GRID_COLUMNS, Math.max(10, ...tables.map((table) => table.x + 2)));
  const rows = fill ? Math.max(1, ys.length) : Math.min(GRID_ROWS, Math.max(5, ...tables.map((table) => table.y + 2)));
  // El plano entra en el ancho que haya; en pantallas chicas, con un mínimo y desplazamiento de costado.
  const [box, setBox] = useState({ width: 0, height: 0 });
  const frame = useRef<ResizeObserver | null>(null);
  const plan = useRef<HTMLDivElement | null>(null);
  const measure = useCallback((element: HTMLDivElement | null) => {
    plan.current = element;
    frame.current?.disconnect();
    if (!element) return;
    frame.current = new ResizeObserver(([entry]) => setBox({ width: entry.contentRect.width, height: entry.contentRect.height }));
    frame.current.observe(element);
  }, []);
  // Aire alrededor del plano: las sillas de las mesas del borde no quedan cortadas.
  const pad = fill ? 8 : 14;
  // Mínimo 62 px: la mesa (72% de la celda) queda en 44 px, cómoda para el dedo.
  const cell = fixedCell ?? Math.max(62, Math.min(92, Math.floor(box.width / columns) || 76));
  // Para atender, las celdas se estiran a lo ancho y a lo alto que haya (no son cuadradas) y
  // la mesa es el cuadrado que entra en la celda (como mínimo 44 px, cómoda para el dedo).
  const fit = (space: number, count: number, max: number) => Math.max(52, Math.min(max, Math.floor((space - pad * 2) / count) || 80));
  const cellX = fill ? fit(box.width, columns, 240) : cell;
  const cellY = fill ? fit(box.height, rows, 128) : cell;
  const size = fill ? Math.round(Math.min(cellX, cellY, 112) * 0.86) : Math.round(cell * 0.72);
  const marginX = Math.round((cellX - size) / 2);
  const marginY = Math.round((cellY - size) / 2);
  const drag = useRef<{ id: string; startX: number; startY: number; moved: boolean } | null>(null);
  const [offset, setOffset] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const t = useT();
  // Al armarlo en una pantalla angosta el plano es más ancho que la pantalla: la mesa elegida (o
  // la recién agregada) se trae a la vista, y un aviso dice que se puede deslizar.
  const overflows = !fill && box.width > 0 && columns * cellX + pad * 2 > box.width + 1;
  useEffect(() => {
    if (fill || !selectedId) return;
    plan.current?.querySelector(`[data-table="${selectedId}"]`)?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [fill, selectedId, tables.length]);
  const taken = (x: number, y: number, except: string) => tables.some((table) => table._id !== except && table.x === x && table.y === y);

  const down = (event: PointerEvent<HTMLButtonElement>, table: T) => {
    if (!onMove) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: table._id, startX: event.clientX, startY: event.clientY, moved: false };
  };
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current) return;
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
    if (!current.moved && Math.hypot(dx, dy) < 6) return;
    current.moved = true;
    setOffset({ id: current.id, dx, dy });
  };
  const up = (table: T) => {
    const current = drag.current;
    drag.current = null;
    if (!current) return;
    if (!current.moved || !offset) {
      setOffset(null);
      onSelect?.(table);
      return;
    }
    // Imán: cae en la celda más cercana; si está ocupada, vuelve a su lugar.
    const x = Math.max(0, Math.min(GRID_COLUMNS - 1, Math.round(table.x + offset.dx / cell)));
    const y = Math.max(0, Math.min(GRID_ROWS - 1, Math.round(table.y + offset.dy / cell)));
    setOffset(null);
    onSelect?.(table);
    if ((x !== table.x || y !== table.y) && onMove) onMove(table, x, y);
  };
  const keys = (event: KeyboardEvent, table: T) => {
    if (!onMove) return;
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!step) return;
    event.preventDefault();
    const x = table.x + step[0];
    const y = table.y + step[1];
    if (x < 0 || y < 0 || x >= GRID_COLUMNS || y >= GRID_ROWS || taken(x, y, table._id)) return;
    onMove(table, x, y);
  };

  return (
    <>
      {overflows && <p className="mb-1 text-sm font-bold text-ink-muted">{t.salon.scrollHint}</p>}
      <div ref={measure} className={fill ? "h-full min-h-0 overflow-auto" : "overflow-auto rounded-xl border border-line bg-paper"}>
        <div
          role="group"
          aria-label={label}
          className={fill ? "relative mx-auto" : "relative"}
          style={{
            width: columns * cellX + pad * 2,
            height: rows * cellY + pad * 2,
            // Puntos en las esquinas de cada celda: la planta del local (solo para armarlo).
            ...(!fill && {
              backgroundImage: "radial-gradient(var(--color-line) 1.5px, transparent 1.5px)",
              backgroundSize: `${cell}px ${cell}px`,
              backgroundPosition: `${pad + cell / 2}px ${pad + cell / 2}px`,
            }),
          }}
        >
          {tables.map((table) => {
            const dragging = offset?.id === table._id;
            const selected = selectedId === table._id;
            return (
              <button
                key={table._id}
                data-table={table._id}
                type="button"
                aria-label={describe(table)}
                aria-pressed={onSelect ? selected : undefined}
                onPointerDown={(event) => down(event, table)}
                onPointerMove={move}
                onPointerUp={() => up(table)}
                onPointerCancel={() => {
                  drag.current = null;
                  setOffset(null);
                }}
                onKeyDown={(event) => keys(event, table)}
                onClick={(event) => {
                  // Con teclado (Enter/espacio) no hay puntero: se elige acá. Si no se arrastra, siempre acá.
                  if (event.detail === 0 || !onMove) onSelect?.(table);
                }}
                className={`absolute flex flex-col items-center justify-center rounded-xl border-2 text-center leading-tight shadow-sm transition-[box-shadow] ${
                  onMove ? "cursor-grab touch-none active:cursor-grabbing" : ""
                } ${tone?.(table) ?? "border-ink/70 bg-surface text-ink"} ${selected ? "ring-4 ring-[#2f7de1]/50" : ""} ${dragging ? "z-10 shadow-lg" : ""}`}
                style={{
                  width: size,
                  height: size,
                  left: pad + column(table) * cellX + marginX,
                  top: pad + row(table) * cellY + marginY,
                  transform: dragging ? `translate(${offset.dx}px, ${offset.dy}px)` : undefined,
                }}
              >
                {!fill && <Chairs seats={table.seats} size={size} />}
                {content(table, size)}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
