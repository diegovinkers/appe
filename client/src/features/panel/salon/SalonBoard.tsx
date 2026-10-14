import type { SalonTable } from "../../../api/types";
import { useT } from "../../../i18n";
import { formatMinutes, formatMoney } from "../../../lib/format";
import { FloorPlan } from "./FloorPlan";
import { STATE_ORDER, STATE_SWATCH, STATE_TONE, type TableState } from "./useSalon";

const minutesSince = (date: string, now: number) => Math.max(0, Math.floor((now - new Date(date).getTime()) / 60_000));
const itemsText = (table: SalonTable) => table.tab?.lastItems.map((item) => `${item.quantity}x ${item.name}`).join(", ") ?? "";

// El salón para atender: la leyenda con cuántas mesas hay en cada estado, el plano y, al lado
// (o abajo si no entra), las mesas ocupadas de la más urgente a la más tranquila.
// `fill`: dentro de un panel, el plano ocupa el alto que haya. Si no (celular), el alto va según
// cuántas filas de mesas hay.
export function SalonBoard({
  tables,
  now,
  selectedId,
  onSelect,
  fill = false,
}: {
  tables: SalonTable[];
  now: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  fill?: boolean;
}) {
  const t = useT();
  const c = t.tables;
  const active = tables.filter((table) => table.active);
  const count = (state: TableState) => active.filter((table) => table.state === state).length;
  const occupied = active.filter((table) => table.tab).sort((a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state) || a.number - b.number);
  const rows = new Set(active.map((table) => table.y)).size;
  const elapsed = (table: SalonTable) => (table.tab ? formatMinutes(minutesSince(table.tab.openedAt, now)) : "");
  const describe = (table: SalonTable) =>
    c.describe(table.number, c.states[table.state], table.tab ? `${t.orders.ago(elapsed(table))}, ${formatMoney(table.tab.totalCents)}` : "");

  return (
    <div className={`@container ${fill ? "flex h-full min-h-0 flex-col" : ""}`}>
      <ul aria-label={c.legend} className="flex shrink-0 flex-wrap gap-x-4 gap-y-1 px-3 pt-2 pb-1 text-sm">
        {(["free", "occupied", "kitchen", "ready", "bill"] as const).map((state) => (
          <li key={state} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={`size-3.5 rounded ${STATE_SWATCH[state]}`} />
            <span className={count(state) ? "font-bold" : "text-ink-muted"}>{c.states[state]}</span>
            <span className="tabular-nums text-ink-muted">{count(state)}</span>
          </li>
        ))}
      </ul>

      <div className={`grid gap-3 p-3 pt-1 @3xl:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)] ${fill ? "min-h-0 flex-1 @3xl:grid-rows-1" : ""}`}>
        <div className={`min-w-0 overflow-hidden rounded-xl bg-paper ${fill ? "min-h-48 @3xl:min-h-0" : ""}`} style={fill ? undefined : { height: Math.min(480, rows * 84 + 16) }}>
          <FloorPlan
            fill
            tables={active}
            label={c.plan}
            selectedId={selectedId}
            onSelect={(table) => onSelect(table._id)}
            tone={(table) => STATE_TONE[table.state]}
            describe={describe}
            content={(table, size) => (
              <>
                <span className={`font-bold tabular-nums ${size >= 64 ? "text-xl" : "text-lg"}`}>{table.number}</span>
                {table.tab && size >= 58 && <span className="text-xs leading-tight tabular-nums">{elapsed(table)}</span>}
                {table.tab && size >= 80 && <span className="text-xs leading-tight font-bold tabular-nums">{formatMoney(table.tab.totalCents)}</span>}
              </>
            )}
          />
        </div>

        <section aria-label={c.occupiedList} className={`min-w-0 ${fill ? "min-h-0 overflow-y-auto" : ""}`}>
          {occupied.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line p-4 text-ink-muted">{c.noneOccupied}</p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
              {occupied.map((table) => (
                <li key={table._id}>
                  <button
                    type="button"
                    aria-current={selectedId === table._id || undefined}
                    onClick={() => onSelect(table._id)}
                    className={`flex min-h-14 w-full items-start gap-3 px-3 py-2 text-left hover:bg-paper ${selectedId === table._id ? "bg-paper" : ""}`}
                  >
                    <span
                      aria-hidden
                      className={`grid size-10 shrink-0 place-items-center rounded-lg border-2 font-bold tabular-nums ${STATE_TONE[table.state]}`}
                    >
                      {table.number}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-bold">
                          <span className="sr-only">{c.title(table.number, table.name)}: </span>
                          {c.states[table.state]}
                        </span>
                        <span className="shrink-0 font-bold tabular-nums">{formatMoney(table.tab?.totalCents ?? 0)}</span>
                      </span>
                      <span className="block truncate text-sm text-ink-muted">
                        {t.orders.ago(elapsed(table))}
                        {itemsText(table) && <>, {itemsText(table)}</>}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
