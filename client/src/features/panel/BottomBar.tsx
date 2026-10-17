import { Link, useLocation } from "react-router";
import type { Role } from "../../api/types";
import { useT } from "../../i18n";
import { operatingDayISO } from "../../lib/format";
import { MORE_ICON, bottomBarFor } from "./nav";
import { useOrders } from "./orders/useOrders";
import { useHasTables } from "./salon/useSalon";

const item = "relative flex min-h-16 flex-1 flex-col items-center justify-center gap-0.5 text-xs";

// Barra de abajo en el celular: lo de todos los días a un toque. "Mais" abre el menú completo.
export function BottomBar({ role, dayStart, onMore }: { role: Role; dayStart: string; onMore: () => void }) {
  const t = useT();
  const orders = useOrders(operatingDayISO(new Date(), dayStart), true);
  const pending = orders.data?.orders.filter((order) => order.status === "new").length ?? 0;
  const hasTables = useHasTables();
  const { pathname, search } = useLocation();
  const salon = pathname === "/painel/pedidos" && new URLSearchParams(search).get("ver") === "salao";
  // "Pedidos" y "Mesas" son la misma página: la pestaña elegida dice cuál está activa.
  const active = (to: string) =>
    to === "/painel/pedidos?ver=salao" ? salon : to === "/painel/pedidos" ? pathname === "/painel/pedidos" && !salon : pathname.startsWith(to);

  return (
    <nav
      aria-label={t.nav.label}
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden print:hidden"
    >
      {bottomBarFor(role, hasTables).map((entry) => {
        const isActive = active(entry.to);
        return (
          <Link key={entry.to} to={entry.to} aria-current={isActive ? "page" : undefined} className={`${item} ${isActive ? "font-bold text-ink" : "text-ink-muted"}`}>
            <span aria-hidden className={`absolute inset-x-6 top-0 h-1 rounded-b ${isActive ? "bg-(--brand)" : ""}`} />
            <entry.icon aria-hidden className="size-6" />
            {entry.label}
            {entry.to === "/painel/pedidos" && pending > 0 && (
              <span className="absolute right-[calc(50%-1.75rem)] top-1.5 grid min-w-5 place-items-center rounded-full bg-closed px-1 text-xs font-bold text-white">
                {pending}
              </span>
            )}
          </Link>
        );
      })}
      <button type="button" onClick={onMore} className={`${item} text-ink-muted`}>
        <MORE_ICON aria-hidden className="size-6" />
        {t.nav.more}
      </button>
    </nav>
  );
}
