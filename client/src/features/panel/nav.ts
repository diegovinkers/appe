import {
  Bike,
  Bot,
  ChartColumn,
  CirclePlus,
  ClipboardList,
  CircleSlash,
  Clock,
  CreditCard,
  FileSpreadsheet,
  LayoutList,
  ListPlus,
  Menu,
  QrCode,
  ReceiptText,
  Settings,
  Star,
  Store,
  TicketPercent,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "../../api/types";
import { can, type Permission } from "../../auth/permissions";
import { type Dictionary, getT } from "../../i18n";

export type NavItem = { to: string; label: string; icon: LucideIcon; permission: Permission; end?: boolean };
export type NavGroup = { label?: string; items: NavItem[] };

// Los nombres se guardan como clave del diccionario y se traducen al armar el menú.
type NavKey = keyof Dictionary["nav"];
type NavItemDef = Omit<NavItem, "label"> & { label: NavKey };
type NavGroupDef = { label?: NavKey; items: NavItemDef[] };

// Menú lateral: lo de todos los días arriba y lo que se configura una vez en Configurações.
// Máximo dos niveles: Cardápio y Configurações tienen sus páginas adentro (pestañas y tarjetas).
const NAV_GROUPS: NavGroupDef[] = [
  {
    items: [
      { to: "/painel/pedidos", label: "orders", icon: ClipboardList, permission: "orders:read" },
      { to: "/painel/disponibilidade", label: "availability", icon: CircleSlash, permission: "menu:availability" },
      // Editar el cardápio es del dueño; el empleado agota en Disponibilidade.
      { to: "/painel/cardapio", label: "menuGroup", icon: UtensilsCrossed, permission: "menu:write" },
      { to: "/painel/assistente", label: "assistant", icon: Bot, permission: "orders:read" },
    ],
  },
  {
    label: "salesGroup",
    items: [
      { to: "/painel/relatorios", label: "reports", icon: ChartColumn, permission: "store:write" },
      { to: "/painel/cupons", label: "coupons", icon: TicketPercent, permission: "coupons:manage" },
      { to: "/painel/avaliacoes", label: "reviews", icon: Star, permission: "store:write" },
    ],
  },
  {
    items: [{ to: "/painel/configuracoes", label: "settings", icon: Settings, permission: "store:write" }],
  },
];

// Pestañas de Cardápio. El empleado ve solo las que puede usar (marcar agotados).
const MENU_TABS: NavItemDef[] = [
  { to: "/painel/cardapio/produtos", label: "products", icon: UtensilsCrossed, permission: "menu:read" },
  { to: "/painel/cardapio/categorias", label: "categories", icon: LayoutList, permission: "menu:write" },
  { to: "/painel/cardapio/adicionais", label: "optionGroups", icon: ListPlus, permission: "menu:read" },
  { to: "/painel/cardapio/planilha", label: "spreadsheet", icon: FileSpreadsheet, permission: "menu:write" },
];

// Tarjetas de Configurações, en el orden en que se configura un local nuevo.
export type SettingsKey = "storeInfo" | "qr" | "hours" | "delivery" | "payments" | "subscription";
const SETTINGS: (NavItemDef & { key: SettingsKey })[] = [
  { key: "storeInfo", to: "/painel/configuracoes/loja", label: "storeInfo", icon: Store, permission: "store:write" },
  { key: "qr", to: "/painel/configuracoes/link-qr", label: "qr", icon: QrCode, permission: "store:read" },
  { key: "hours", to: "/painel/configuracoes/horarios", label: "hours", icon: Clock, permission: "store:write" },
  { key: "delivery", to: "/painel/configuracoes/entrega", label: "delivery", icon: Bike, permission: "store:write" },
  { key: "payments", to: "/painel/configuracoes/pagamentos", label: "payments", icon: CreditCard, permission: "store:write" },
  { key: "subscription", to: "/painel/configuracoes/assinatura", label: "subscription", icon: ReceiptText, permission: "store:write" },
];

// Barra de abajo en el celular: lo diario a un toque; "Mais" abre el menú completo.
const BOTTOM_BAR: NavItemDef[] = [
  { to: "/painel/pedidos", label: "orders", icon: ClipboardList, permission: "orders:read" },
  { to: "/painel/pedidos/novo", label: "newOrder", icon: CirclePlus, permission: "orders:manual" },
  { to: "/painel/disponibilidade", label: "soldOut", icon: CircleSlash, permission: "menu:availability" },
];
export const MORE_ICON = Menu;

function translate(items: NavItemDef[], role: Role | undefined): NavItem[] {
  const t = getT();
  return items.filter((item) => can(role, item.permission)).map((item) => ({ ...item, label: t.nav[item.label] }));
}

// Las secciones con al menos una página que el rol puede usar, en el idioma elegido.
export function navFor(role: Role | undefined): NavGroup[] {
  const t = getT();
  return NAV_GROUPS.map((group) => ({ label: group.label && t.nav[group.label], items: translate(group.items, role) })).filter(
    (group) => group.items.length > 0
  );
}

export const menuTabsFor = (role: Role | undefined) => translate(MENU_TABS, role);

export const settingsFor = (role: Role | undefined) => {
  const allowed = new Set(translate(SETTINGS, role).map((item) => item.to));
  const t = getT();
  return SETTINGS.filter((item) => allowed.has(item.to)).map((item) => ({ ...item, label: t.nav[item.label] }));
};

export const bottomBarFor = (role: Role | undefined) => translate(BOTTOM_BAR, role);
