import {
  Bike,
  Bot,
  CirclePlus,
  ClipboardList,
  Clock,
  FileSpreadsheet,
  LayoutList,
  ListPlus,
  QrCode,
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

// Cada página del panel, en su sección. El permiso define quién la ve.
const NAV_GROUPS: NavGroupDef[] = [
  {
    items: [
      { to: "/painel/pedidos", label: "orders", icon: ClipboardList, permission: "orders:read", end: true },
      { to: "/painel/pedidos/novo", label: "newOrder", icon: CirclePlus, permission: "orders:manual" },
      { to: "/painel/assistente", label: "assistant", icon: Bot, permission: "orders:read" },
      { to: "/painel/comecar", label: "setup", icon: Store, permission: "store:write" },
      { to: "/painel/relatorios", label: "reports", icon: FileSpreadsheet, permission: "store:write" },
    ],
  },
  {
    label: "menuGroup",
    items: [
      { to: "/painel/cardapio/produtos", label: "products", icon: UtensilsCrossed, permission: "menu:read" },
      { to: "/painel/cardapio/categorias", label: "categories", icon: LayoutList, permission: "menu:write" },
      { to: "/painel/cardapio/adicionais", label: "optionGroups", icon: ListPlus, permission: "menu:read" },
      { to: "/painel/cardapio/planilha", label: "spreadsheet", icon: FileSpreadsheet, permission: "menu:write" },
    ],
  },
  {
    label: "salesGroup",
    items: [
      { to: "/painel/cupons", label: "coupons", icon: TicketPercent, permission: "coupons:manage" },
      { to: "/painel/avaliacoes", label: "reviews", icon: Star, permission: "orders:read" },
    ],
  },
  {
    label: "storeGroup",
    items: [
      { to: "/painel/loja", label: "storeInfo", icon: Store, permission: "store:write", end: true },
      { to: "/painel/loja/horarios", label: "hours", icon: Clock, permission: "store:write" },
      { to: "/painel/loja/entrega", label: "delivery", icon: Bike, permission: "store:write" },
      { to: "/painel/loja/qr", label: "qr", icon: QrCode, permission: "store:read" },
      { to: "/painel/assinatura", label: "subscription", icon: Store, permission: "store:write" },
    ],
  },
];

// Las secciones con al menos una página que el rol puede usar, en el idioma elegido.
export function navFor(role: Role | undefined): NavGroup[] {
  const t = getT();
  return NAV_GROUPS.map((group) => ({
    label: group.label && t.nav[group.label],
    items: group.items
      .filter((item) => can(role, item.permission))
      .map((item) => ({ ...item, label: t.nav[item.label] })),
  })).filter((group) => group.items.length > 0);
}
