import { NavLink } from "react-router";

export type TabItem = { to: string; label: string };

// Pestañas que son links (cada una es una página): se ven como los filtros de la lista de pedidos.
export function Tabs({ items, label }: { items: TabItem[]; label: string }) {
  if (items.length < 2) return null;
  return (
    <nav aria-label={label} className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex w-max gap-2">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              className={({ isActive }) =>
                `inline-flex h-11 items-center rounded-full px-4 text-sm ${isActive ? "bg-action font-bold text-white" : "bg-surface ring-1 ring-line hover:bg-paper"}`
              }
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
