import { ClipboardList, House, Search, UserRound } from "lucide-react";
import { Link, useLocation } from "react-router";
import { LanguageSwitch } from "../../components/LanguageSwitch";
import { useT } from "../../i18n";
import { formatMoney } from "../../lib/format";

// Lo que rodea al menú: el buscador, la barra de arriba (PC) y la de abajo (celular).

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  const t = useT();
  const label = placeholder ?? t.menu.search;
  return (
    <label className="relative block">
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-ink-muted" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={label}
        aria-label={label}
        enterKeyHint="search"
        className="h-11 w-full rounded-lg bg-paper pr-3 pl-10 placeholder:text-ink-muted"
      />
    </label>
  );
}

function OrderBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="absolute -top-1.5 -right-2 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-(--brand) px-1 text-[11px] leading-none font-bold text-(--on-brand)">
      {count}
    </span>
  );
}

type NavProps = { count: number; subtotalCents: number; onHome: () => void; onOrder: () => void };

// "Conta" vuelve al menú en el que estaba.
const useAccountHref = () => `/conta?volta=${encodeURIComponent(useLocation().pathname)}`;

// PC: buscador a la izquierda; idioma, Início, Conta y Pedido a la derecha. Queda fija arriba.
export function TopBar({ search, onSearch, count, onHome, onOrder }: NavProps & { search: string; onSearch: (value: string) => void }) {
  const t = useT();
  const accountHref = useAccountHref();
  const link = "inline-flex h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-bold hover:bg-paper";
  return (
    <div className="sticky top-0 z-30 hidden border-b border-line bg-surface sm:block">
      <div className="mx-auto flex h-15 max-w-[70rem] items-center gap-4 px-4">
        <div className="w-80">
          <SearchBox value={search} onChange={onSearch} />
        </div>
        <div className="flex-1" />
        <LanguageSwitch />
        <button type="button" onClick={onHome} className={link}>
          <House aria-hidden className="size-5" />
          {t.menu.home}
        </button>
        <Link to={accountHref} className={link}>
          <UserRound aria-hidden className="size-5" />
          {t.account.menu}
        </Link>
        <button type="button" onClick={onOrder} className={`${link} gap-3`}>
          <span className="relative">
            <ClipboardList aria-hidden className="size-5" />
            <OrderBadge count={count} />
          </span>
          {t.menu.order}
          {count > 0 && <span className="sr-only">, {t.cart.items(count)}</span>}
        </button>
      </div>
    </div>
  );
}

// Celular: Início, Conta y Pedido fijos abajo. Con algo en el pedido, muestra el total.
export function BottomNav({ count, subtotalCents, onHome, onOrder }: NavProps) {
  const t = useT();
  const accountHref = useAccountHref();
  const tab = "flex h-16 flex-col items-center justify-center gap-1 text-sm";
  return (
    <nav
      aria-label={t.menu.bottomNav}
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-[1fr_1fr_1.4fr] border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      <button type="button" onClick={onHome} className={`${tab} font-bold`}>
        <House aria-hidden className="size-6" />
        {t.menu.home}
      </button>
      <Link to={accountHref} className={`${tab} text-ink-muted`}>
        <UserRound aria-hidden className="size-6" />
        {t.account.menu}
      </Link>
      <button type="button" onClick={onOrder} className={`${tab} ${count ? "font-bold text-ink" : "text-ink-muted"}`}>
        <span className="relative">
          <ClipboardList aria-hidden className="size-6" />
          <OrderBadge count={count} />
        </span>
        {count > 0 ? (
          <span className="tabular-nums">
            {t.menu.order} · {formatMoney(subtotalCents)}
            <span className="sr-only">, {t.cart.items(count)}</span>
          </span>
        ) : (
          t.menu.order
        )}
      </button>
    </nav>
  );
}
