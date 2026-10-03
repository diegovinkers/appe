import { Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { type CSSProperties, useEffect, useState } from "react";
import { Outlet, useLocation, useOutletContext } from "react-router";
import { ApiError } from "../../api/client";
import type { Opening, OwnerStore, SessionUser } from "../../api/types";
import { can } from "../../auth/permissions";
import { useSession } from "../../auth/session";
import { FullScreenMessage, Spinner } from "../../components/FullScreenMessage";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { readableTextOn } from "../../lib/color";
import { useT } from "../../i18n";
import { navFor } from "./nav";
import { Sidebar } from "./Sidebar";
import { StoreMark } from "../../components/StoreMark";
import { StoreStatusControl } from "./StoreStatusControl";
import { UserMenu } from "./UserMenu";
import { useOwnerStore } from "./useOwnerStore";
import { OrderAlerts } from "./orders/OrderAlerts";
import { AssistantAlert } from "./assistant/AssistantAlert";

export type PanelContext = { user: SessionUser; store: OwnerStore; opening: Opening; storeUrl: string };
export const usePanel = () => useOutletContext<PanelContext>();

const COLLAPSED_KEY = "painel.menu-recolhido";

// La preferencia de menú recogido queda en el dispositivo (si el navegador lo permite).
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}
function saveCollapsed(value: boolean) {
  try {
    localStorage.setItem(COLLAPSED_KEY, value ? "1" : "0");
  } catch {
    // Sin almacenamiento, el menú vuelve a abrirse la próxima vez.
  }
}

export function PanelLayout() {
  const t = useT();
  const { data: user } = useSession();
  const storeQuery = useOwnerStore();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { pathname } = useLocation();

  // En el celular, el cajón se cierra al cambiar de página, al pasar a pantalla grande y con Esc.
  useEffect(() => setDrawerOpen(false), [pathname, isDesktop]);
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setDrawerOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  if (storeQuery.isPending || !user) {
    return (
      <FullScreenMessage>
        <Spinner />
      </FullScreenMessage>
    );
  }
  if (storeQuery.isError) {
    if (storeQuery.error instanceof ApiError && storeQuery.error.code === "COMMERCE_SUSPENDED") {
      return <FullScreenMessage title={t.suspended.title}>{t.suspended.text}</FullScreenMessage>;
    }
    return (
      <FullScreenMessage
        title={t.errors.generic}
        action={
          <button type="button" onClick={() => storeQuery.refetch()} className="h-11 rounded-lg bg-action px-4 font-bold text-white">
            {t.errors.retry}
          </button>
        }
      />
    );
  }

  const { store, opening, storeUrl } = storeQuery.data;
  const groups = navFor(user.role);
  const context: PanelContext = { user, store, opening, storeUrl };

  const toggleMenu = () => {
    if (!isDesktop) return setDrawerOpen((value) => !value);
    setCollapsed((value) => {
      saveCollapsed(!value);
      return !value;
    });
  };
  const toggleLabel = isDesktop ? (collapsed ? t.nav.expand : t.nav.collapse) : t.nav.open;
  const ToggleIcon = isDesktop ? (collapsed ? PanelLeftOpen : PanelLeftClose) : Menu;

  return (
    <div className="min-h-dvh" style={{ "--brand": store.primaryColor, "--on-brand": readableTextOn(store.primaryColor) } as CSSProperties}>
      <header className="sticky top-0 z-30 flex h-16 items-center gap-1.5 border-b border-line bg-surface px-2 sm:gap-3 sm:px-4">
        <button
          type="button"
          onClick={toggleMenu}
          aria-label={toggleLabel}
          title={toggleLabel}
          aria-controls="menu-do-painel"
          aria-expanded={isDesktop ? !collapsed : drawerOpen}
          className="grid size-11 shrink-0 place-items-center rounded-lg text-ink-muted hover:bg-paper hover:text-ink"
        >
          <ToggleIcon aria-hidden className="size-6" />
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-3">
          <StoreMark store={store} size={36} />
          <div className="min-w-0 leading-tight">
            <p className="truncate font-bold">{store.name}</p>
            <p className="hidden truncate text-sm text-ink-muted sm:block">{t.panel}</p>
          </div>
        </div>

        <StoreStatusControl store={store} opening={opening} canChange={can(user.role, "store:open")} />
        <UserMenu user={user} />
      </header>

      <div className="flex">
        {isDesktop ? (
          <aside
            id="menu-do-painel"
            className={`sticky top-16 h-[calc(100dvh-4rem)] shrink-0 transition-[width] duration-200 ${collapsed ? "w-18" : "w-64"}`}
          >
            <Sidebar groups={groups} collapsed={collapsed} storeUrl={storeUrl} />
          </aside>
        ) : (
          <>
            <div
              aria-hidden
              onClick={() => setDrawerOpen(false)}
              className={`fixed inset-0 z-40 bg-black/45 transition-opacity duration-200 ${drawerOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
            />
            <aside
              id="menu-do-painel"
              inert={!drawerOpen}
              className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col shadow-xl transition-transform duration-200 ${drawerOpen ? "translate-x-0" : "-translate-x-full"}`}
            >
              <div className="flex h-16 shrink-0 items-center gap-3 border-b border-board-active bg-board px-3 text-chalk">
                <StoreMark store={store} size={36} />
                <p className="min-w-0 flex-1 truncate font-bold text-white">{store.name}</p>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  aria-label={t.nav.close}
                  className="grid size-11 place-items-center rounded-lg hover:bg-board-hover"
                >
                  <X aria-hidden className="size-6" />
                </button>
              </div>
              <div className="min-h-0 flex-1">
                <Sidebar groups={groups} collapsed={false} storeUrl={storeUrl} onNavigate={() => setDrawerOpen(false)} />
              </div>
            </aside>
          </>
        )}

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          <div className="mx-auto max-w-5xl">
            <OrderAlerts />
            {can(user.role, "orders:read") && <AssistantAlert />}
            <Outlet context={context} />
          </div>
        </main>
      </div>
    </div>
  );
}
