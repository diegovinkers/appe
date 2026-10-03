import type { PublicCategory, PublicProduct } from "../../api/types";
import { useT } from "../../i18n";
import { formatMoney } from "../../lib/format";
import { cloudinaryImage } from "../../lib/images";
import { sectionId } from "./CategoryNav";
import { currentPrice } from "./pricing";

// El precio: "a partir de" si las opciones obligatorias suman, y el anterior tachado si hay promoción.
export function Price({ product }: { product: PublicProduct }) {
  const t = useT();
  const price = currentPrice(product);
  const from = product.fromPriceCents != null && product.fromPriceCents > price ? product.fromPriceCents : null;
  return (
    <span className="tabular-nums">
      {product.promoPriceCents != null && (
        <>
          <span className="sr-only">{t.menu.was(formatMoney(product.priceCents))}</span>
          <s aria-hidden className="mr-1.5 text-sm text-ink-muted">
            {formatMoney(product.priceCents)}
          </s>
        </>
      )}
      <span className="font-bold">{from ? t.menu.from(formatMoney(from)) : formatMoney(price)}</span>
    </span>
  );
}

// Una tarjeta: nombre, descripción, precio y la foto a la derecha. En el celular es una
// fila de la lista; en la PC, una tarjeta de la grilla de dos columnas.
function ProductCard({ product, orderable, onOpen }: { product: PublicProduct; orderable: boolean; onOpen: () => void }) {
  const t = useT();
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        disabled={!orderable}
        className="flex h-full w-full gap-3 border-b border-line py-4 text-left disabled:cursor-default sm:rounded-xl sm:border-0 sm:bg-surface sm:p-4 sm:shadow-[0_1px_6px_rgba(0,0,0,0.06)] sm:enabled:hover:shadow-[0_2px_10px_rgba(0,0,0,0.12)]"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={`leading-snug font-bold ${orderable ? "" : "text-ink-muted"}`}>{product.name}</span>
          {product.description && <span className="mt-1 line-clamp-2 text-sm leading-relaxed text-ink-muted">{product.description}</span>}
          {(!product.available || product.tags.length > 0) && (
            <span className="mt-1 flex flex-wrap gap-x-3 text-sm">
              {!product.available && <span className="font-bold text-error">{t.menu.soldOut}</span>}
              {product.tags.map((tag) => (
                <span key={tag} className="text-ink-muted">
                  {t.menu.tags[tag]}
                </span>
              ))}
            </span>
          )}
          <span className="mt-auto pt-3">
            <Price product={product} />
          </span>
        </span>
        {product.imageUrl && (
          <img
            src={cloudinaryImage(product.imageUrl, 208, 176)}
            alt=""
            loading="lazy"
            width={104}
            height={88}
            className={`h-22 w-26 shrink-0 self-center rounded-lg object-cover ${orderable ? "" : "opacity-50 grayscale"}`}
          />
        )}
      </button>
    </li>
  );
}

type SectionProps = {
  id: string;
  title: string;
  note?: string;
  products: PublicProduct[];
  orderable: (product: PublicProduct) => boolean;
  onOpen: (product: PublicProduct) => void;
};

export function MenuSection({ id, title, note, products, orderable, onOpen }: SectionProps) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className="scroll-mt-16 pt-7 sm:scroll-mt-32">
      <h2 id={`${id}-titulo`} className="text-xl leading-tight font-bold">
        {title}
      </h2>
      {note && <p className="mt-1 text-sm font-bold text-warning">{note}</p>}
      <ul className="mt-2 grid sm:mt-4 sm:grid-cols-2 sm:gap-3">
        {products.map((product) => (
          <ProductCard key={product._id} product={product} orderable={orderable(product)} onOpen={() => onOpen(product)} />
        ))}
      </ul>
    </section>
  );
}

// Una categoría del menú (con los productos que pasan la búsqueda). Fuera de su horario se
// ve, pero no se puede pedir.
export function CategorySection({
  category,
  products,
  onOpen,
}: {
  category: PublicCategory;
  products: PublicProduct[];
  onOpen: (product: PublicProduct) => void;
}) {
  const t = useT();
  const note =
    !category.availableNow && category.schedule ? t.menu.availableBetween(category.schedule.from, category.schedule.to) : undefined;
  return (
    <MenuSection
      id={sectionId(category._id)}
      title={category.name}
      note={note}
      products={products}
      orderable={(product) => product.available && category.availableNow}
      onOpen={onOpen}
    />
  );
}
