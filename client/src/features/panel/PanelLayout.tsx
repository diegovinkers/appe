import { Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { LoadError } from "../../components/LoadError";
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
import { AlertSettingsControl } from "./orders/AlertSettingsControl";
import { useDensity } from "./orders/deviceSettings";
import { AssistantAlert } from "./assistant/AssistantAlert";
import { BottomBar } from "./BottomBar";

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
  const isWide = useMediaQuery("(min-width: 1280px)");
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { pathname } = useLocation();
  const workspace = isWide && pathname.replace(/\/$/, "") === "/painel/pedidos";
  useDensity();

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

  // Sesión vencida: main.tsx ya lleva a /entrar; mientras tanto, solo la espera.
  const expired = storeQuery.isError && storeQuery.error instanceof ApiError && storeQuery.error.status === 401;
  if (storeQuery.isPending || !user || expired) {
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
    return <LoadError error={storeQuery.error} onRetry={() => void storeQuery.refetch()} />;
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
      <header className="sticky top-0 z-30 flex h-16 print:hidden items-center gap-1.5 border-b border-line bg-surface px-2 sm:gap-3 sm:px-4">
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

        {can(user.role, "orders:read") && <OrderAlerts dayStart={store.hours.dayStart} />}
        <StoreStatusControl store={store} opening={opening} canChange={can(user.role, "store:open")} />
        {can(user.role, "orders:read") && <AlertSettingsControl />}
        <UserMenu user={user} />
      </header>

      <div className="flex">
        {isDesktop ? (
          <aside
            id="menu-do-painel"
            className={`sticky top-16 h-[calc(100dvh-4rem)] shrink-0 print:hidden transition-[width] duration-200 ${collapsed ? "w-18" : "w-64"}`}
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

        {/* Pedidos en la PC ancha: el espacio de trabajo usa todo el ancho y el alto. */}
        <main className={workspace ? "flex h-[calc(100dvh-4rem)] min-w-0 flex-1 flex-col px-4 py-3" : "min-w-0 flex-1 px-4 pt-6 pb-24 sm:px-6 lg:px-8 lg:py-6"}>
          <div className={workspace ? "flex min-h-0 flex-1 flex-col" : "mx-auto max-w-5xl xl:max-w-6xl"}>
            {/* En el espacio de trabajo (el panel de WhatsApp) y en Início ya se ven las que esperan a una persona. */}
            {can(user.role, "orders:read") && !workspace && pathname !== "/painel/inicio" && <AssistantAlert />}
            <Outlet context={context} />
          </div>
        </main>
      </div>
      {!isDesktop && <BottomBar role={user.role} dayStart={store.hours.dayStart} onMore={() => setDrawerOpen(true)} />}
    </div>
  );
}
