import { ChevronLeft } from "lucide-react";
import { Link, Outlet, useLocation } from "react-router";
import { useT } from "../../../i18n";
import { usePanel } from "../PanelLayout";

// Configurações: la lista de tarjetas y, en cada página, la vuelta a la lista.
export function SettingsLayout() {
  const t = useT();
  const panel = usePanel();
  const home = useLocation().pathname.replace(/\/$/, "") === "/painel/configuracoes";
  return (
    <>
      {!home && (
        <Link to="/painel/configuracoes" className="-ml-2 mb-3 inline-flex h-11 lg:mb-1 lg:h-9 items-center gap-1 rounded-lg px-2 text-ink-muted hover:bg-paper hover:text-ink">
          <ChevronLeft aria-hidden className="size-5" />
          {t.nav.backToSettings}
        </Link>
      )}
      <Outlet context={panel} />
    </>
  );
}
