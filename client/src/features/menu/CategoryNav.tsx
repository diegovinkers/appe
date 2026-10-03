import { Menu } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useT } from "../../i18n";

export const sectionId = (categoryId: string) => `categoria-${categoryId}`;

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Lleva a una categoría (desde la barra o desde la lista completa).
export function scrollToCategory(id: string) {
  document.getElementById(sectionId(id))?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
}

type Props = { categories: { _id: string; name: string }[]; onMenu: () => void };

// Pestañas fijas con las categorías: marca en la que uno está y lleva a cada una.
// El botón ☰ abre la lista completa.
export function CategoryNav({ categories, onMenu }: Props) {
  const t = useT();
  const [active, setActive] = useState(categories[0]?._id);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length) setActive(visible[0].target.id.replace("categoria-", ""));
      },
      // La franja de arriba de la pantalla, justo debajo de las barras fijas.
      { rootMargin: "-130px 0px -65% 0px" }
    );
    for (const category of categories) {
      const section = document.getElementById(sectionId(category._id));
      if (section) observer.observe(section);
    }
    return () => observer.disconnect();
  }, [categories]);

  // La pestaña marcada queda a la vista (se mueve solo la barra, no la página).
  useEffect(() => {
    const scroller = list.current;
    const tab = scroller?.querySelector<HTMLElement>(`[data-id="${active}"]`);
    if (!scroller || !tab) return;
    scroller.scrollTo({ left: tab.offsetLeft - (scroller.clientWidth - tab.offsetWidth) / 2 });
  }, [active]);

  return (
    <nav aria-label={t.menu.categories} className="sticky top-0 z-20 bg-surface sm:top-15 sm:mt-4 sm:bg-paper">
      <div className="flex items-center gap-2 border-b-2 border-line pl-4 sm:pl-0">
        <button
          type="button"
          onClick={onMenu}
          aria-label={t.menu.allCategories}
          title={t.menu.allCategories}
          className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface text-ink shadow-[0_1px_4px_rgba(0,0,0,0.12)]"
        >
          <Menu aria-hidden className="size-5" />
        </button>
        <ul ref={list} className="relative flex min-w-0 flex-1 overflow-x-auto [scrollbar-width:none]">
          {categories.map((category) => (
            <li key={category._id} className="shrink-0">
              <button
                type="button"
                data-id={category._id}
                aria-current={active === category._id ? "true" : undefined}
                onClick={() => {
                  setActive(category._id);
                  scrollToCategory(category._id);
                }}
                className={`relative -mb-0.5 h-13 px-4 whitespace-nowrap sm:px-5 ${
                  active === category._id
                    ? "font-bold text-ink after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:bg-ink"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                {category.name}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
