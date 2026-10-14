import { Outlet } from "react-router";
import { Tabs } from "../../../components/Tabs";
import { useT } from "../../../i18n";
import { menuTabsFor } from "../nav";
import { usePanel } from "../PanelLayout";

// Cardápio: una sola entrada en el menú y sus páginas como pestañas.
export function MenuLayout() {
  const t = useT();
  const panel = usePanel();
  return (
    <>
      <Tabs items={menuTabsFor(panel.user.role)} label={t.nav.menuTabs} />
      <Outlet context={panel} />
    </>
  );
}
