import { ExternalLink } from "lucide-react";
import { NavLink } from "react-router";
import { useT } from "../../i18n";
import type { NavGroup } from "./nav";

type Props = { groups: NavGroup[]; collapsed: boolean; storeUrl: string; onNavigate?: () => void };

const itemBase = "relative flex h-11 items-center gap-3 rounded-lg text-[15px] transition-colors";

// Menú lateral. Recogido, muestra solo los íconos (el nombre queda en title y para lectores de pantalla).
export function Sidebar({ groups, collapsed, storeUrl, onNavigate }: Props) {
  const t = useT();
  const spacing = collapsed ? "justify-center px-0" : "px-3";

  return (
    <div className="flex h-full flex-col bg-board text-chalk">
      <nav aria-label={t.nav.label} className="flex-1 overflow-y-auto px-2 py-3">
        {groups.map((group, index) => (
          <div key={group.label ?? `group-${index}`} className={index > 0 ? "mt-4" : undefined}>
            {group.label &&
              (collapsed ? (
                <hr className="mx-3 mb-2 border-board-active" />
              ) : (
                <p className="mb-1 px-3 text-sm text-chalk-muted">{group.label}</p>
              ))}
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      `${itemBase} ${spacing} ${
                        isActive
                          ? "bg-board-active font-bold text-white before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-r before:bg-(--brand)"
                          : "text-chalk hover:bg-board-hover"
                      }`
                    }
                  >
                    <item.icon aria-hidden className="size-5 shrink-0" />
                    <span className={collapsed ? "sr-only" : "truncate"}>{item.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-board-active p-2">
        <a
          href={storeUrl}
          target="_blank"
          rel="noreferrer"
          title={collapsed ? t.nav.viewMenu : undefined}
          className={`${itemBase} ${spacing} text-chalk hover:bg-board-hover`}
        >
          <ExternalLink aria-hidden className="size-5 shrink-0" />
          <span className={collapsed ? "sr-only" : "truncate"}>{t.nav.viewMenu}</span>
        </a>
      </div>
    </div>
  );
}
