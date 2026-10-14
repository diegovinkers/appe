import { type KeyboardEvent, type PointerEvent, type ReactNode, useCallback, useRef, useState } from "react";

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
  // Lo de adentro de cada mesa (número, estado, total…) y su color.
  content: (table: T) => ReactNode;
  tone?: (table: T) => string;
  describe: (table: T) => string;
  cell?: number;
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

export function FloorPlan<T extends PlanTable>({ tables, label, selectedId, onSelect, onMove, content, tone, describe, cell: fixedCell }: Props<T>) {
  // Lo justo para las mesas que hay, con una celda de aire (y un mínimo para que el plano se lea).
  const columns = Math.min(GRID_COLUMNS, Math.max(10, ...tables.map((table) => table.x + 2)));
  // El plano entra en el ancho que haya; en pantallas chicas, con un mínimo y desplazamiento de costado.
  const [width, setWidth] = useState(0);
  const frame = useRef<ResizeObserver | null>(null);
  const measure = useCallback((element: HTMLDivElement | null) => {
    frame.current?.disconnect();
    if (!element) return;
    frame.current = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    frame.current.observe(element);
  }, []);
  // Mínimo 62 px: la mesa (72% de la celda) queda en 44 px, cómoda para el dedo.
  const cell = fixedCell ?? Math.max(62, Math.min(92, Math.floor(width / columns) || 76));
  const rows = Math.min(GRID_ROWS, Math.max(5, ...tables.map((table) => table.y + 2)));
  const drag = useRef<{ id: string; startX: number; startY: number; moved: boolean } | null>(null);
  const [offset, setOffset] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const size = Math.round(cell * 0.72);
  const margin = Math.round((cell - size) / 2);
  // Aire alrededor del plano: las sillas de las mesas del borde no quedan cortadas.
  const pad = 14;
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
    <div ref={measure} className="overflow-auto rounded-xl border border-line bg-paper">
      <div
        role="group"
        aria-label={label}
        className="relative"
        style={{
          width: columns * cell + pad * 2,
          height: rows * cell + pad * 2,
          // Puntos en las esquinas de cada celda: la planta del local.
          backgroundImage: "radial-gradient(var(--color-line) 1.5px, transparent 1.5px)",
          backgroundSize: `${cell}px ${cell}px`,
          backgroundPosition: `${pad + cell / 2}px ${pad + cell / 2}px`,
        }}
      >
        {tables.map((table) => {
          const dragging = offset?.id === table._id;
          const selected = selectedId === table._id;
          return (
            <button
              key={table._id}
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
                // Con teclado (Enter/espacio) no hay puntero: se elige acá.
                if (event.detail === 0) onSelect?.(table);
              }}
              className={`absolute flex flex-col items-center justify-center rounded-xl border-2 text-center leading-tight shadow-sm transition-[box-shadow] ${
                onMove ? "cursor-grab touch-none active:cursor-grabbing" : ""
              } ${tone?.(table) ?? "border-ink/70 bg-surface text-ink"} ${selected ? "ring-4 ring-[#2f7de1]/50" : ""} ${dragging ? "z-10 shadow-lg" : ""}`}
              style={{
                width: size,
                height: size,
                left: pad + table.x * cell + margin,
                top: pad + table.y * cell + margin,
                transform: dragging ? `translate(${offset.dx}px, ${offset.dy}px)` : undefined,
              }}
            >
              <Chairs seats={table.seats} size={size} />
              {content(table)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
