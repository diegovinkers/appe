import { type CSSProperties, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { ApiError } from "../../api/client";
import type { OrderReceipt, PublicCategory, PublicProduct, PublicStoreResponse } from "../../api/types";
import { FullScreenMessage, Spinner } from "../../components/FullScreenMessage";
import { Sheet } from "../../components/Sheet";
import { useLanguage, useT } from "../../i18n";
import { api } from "../../api/client";
import { button } from "../../components/ui";
import { previousOrder, rememberOrder } from "./reorder";
import { rememberDeviceOrder } from "../account/account";
import { readableTextOn } from "../../lib/color";
import { matchesSearch } from "../../lib/text";
import { CartSheet } from "./CartSheet";
import { useCart } from "./cart";
import { CategoryNav, scrollToCategory } from "./CategoryNav";
import { CheckoutSheet } from "./CheckoutSheet";
import { indexMenu, resolveLines } from "./lines";
import { BottomNav, SearchBox, TopBar } from "./MenuChrome";
import { CategorySection, MenuSection } from "./ProductList";
import { ProductSheet } from "./ProductSheet";
import { ReviewsList } from "./ReviewsList";
import { StoreHero, StoreInfo } from "./StoreHero";
import { usePublicStore } from "./usePublicStore";

// /:slug — el perfil del local con su menú, como lo ve el comprador.
export function MenuPage() {
  const t = useT();
  const { slug = "" } = useParams();
  const query = usePublicStore(slug);

  if (query.isPending) {
    return (
      <FullScreenMessage>
        <Spinner />
      </FullScreenMessage>
    );
  }
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return <FullScreenMessage title={t.menu.notFound.title}>{t.menu.notFound.text}</FullScreenMessage>;
    }
    return (
      <FullScreenMessage
        title={t.errors.generic}
        action={
          <button type="button" onClick={() => query.refetch()} className="h-11 rounded-lg bg-action px-4 font-bold text-white">
            {t.errors.retry}
          </button>
        }
      />
    );
  }
  return <StoreMenu key={slug} slug={slug} data={query.data} />;
}

// Qué hoja está abierta sale de la dirección (?produto=<id> o ?ver=sacola|finalizar|info|categorias),
// así el botón "atrás" del celular la cierra en vez de salir del menú.
function useSheets() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const depth = (location.state as { sheets?: number } | null)?.sheets ?? 0;
  return {
    productId: params.get("produto"),
    view: params.get("ver"),
    open: (next: Record<string, string>) => setParams({ ...(params.get("origem") === "directory" ? { origem: "directory" } : {}), ...next }, { state: { sheets: depth + 1 } }),
    // Cierra todas las hojas abiertas; si se entró con el link de una hoja, la saca de la dirección.
    closeAll: () => (depth > 0 ? navigate(-depth) : setParams(params.get("origem") === "directory" ? { origem: "directory" } : {}, { replace: true })),
  };
}

function filterMenu(categories: PublicCategory[], search: string) {
  const matches = (product: PublicProduct) => matchesSearch(`${product.name} ${product.description}`, search);
  return categories
    .map((category) => ({ category, products: search.trim() ? category.products.filter(matches) : category.products }))
    .filter((entry) => entry.products.length > 0);
}

function StoreMenu({ slug, data }: { slug: string; data: PublicStoreResponse }) {
  const cache = useQueryClient();
  const t = useT();
  const es = useLanguage() === "es";
  const [previous] = useState(() => previousOrder(slug));
  const [reordering, setReordering] = useState(false);
  const [reorderMessage, setReorderMessage] = useState("");
  const navigate = useNavigate();
  const { store, categories, featuredProductIds, optionGroups } = data;
  const groups = useMemo(() => new Map(optionGroups.map((group) => [group._id, group])), [optionGroups]);
  const menu = useMemo(() => indexMenu(categories), [categories]);
  const cart = useCart(slug);
  const lines = resolveLines(cart.lines, menu, groups);
  const sheets = useSheets();
  const [search, setSearch] = useState("");

  const visible = useMemo(() => filterMenu(categories, search), [categories, search]);
  const visibleCategories = useMemo(() => visible.map((entry) => entry.category), [visible]);
  const count = cart.lines.reduce((sum, line) => sum + line.quantity, 0);
  const subtotalCents = lines.reduce((sum, line) => sum + (line.available ? line.totalCents : 0), 0);
  const featured = search.trim() ? [] : featuredProductIds.map((id) => menu.get(id)).filter((entry) => !!entry);
  const selected = sheets.productId ? menu.get(sheets.productId) : undefined;
  const openProduct = (product: PublicProduct) => sheets.open({ produto: product._id });

  const placed = (receipt: OrderReceipt) => {
    rememberOrder(slug, lines.filter((line) => line.available).map((line) => line.line));
    cart.clear();
    const path = receipt.trackingUrl ? new URL(receipt.trackingUrl).pathname : null;
    // Para asociarlo a la cuenta si después la crea (o entra) en este aparato.
    if (path) rememberDeviceOrder(path.split("/").at(-1) ?? "");
    if (path) navigate(path, { replace: true, state: { whatsappUrl: receipt.whatsapp.url } });
    else window.location.assign(receipt.whatsapp.url);
  };
  const nav = {
    count,
    subtotalCents,
    onHome: () => window.scrollTo({ top: 0, behavior: "smooth" }),
    onOrder: () => sheets.open({ ver: "sacola" }),
  };

  const brand = { "--brand": store.primaryColor, "--on-brand": readableTextOn(store.primaryColor) } as CSSProperties;
  async function reorder() {
    if (reordering) return;
    if (cart.lines.length && !window.confirm(es ? "¿Reemplazar la bolsa por el pedido anterior de este dispositivo?" : "Substituir a sacola pelo pedido anterior deste aparelho?")) return;
    setReordering(true); setReorderMessage("");
    try {
      const latest = await api<PublicStoreResponse>(`/public/stores/${encodeURIComponent(slug)}?lang=${es ? "es" : "pt"}`);
      cache.setQueryData(["public-store", slug, es ? "es" : "pt"], latest);
      if (!latest.store.isOpen) { setReorderMessage(t.checkout.closed); return; }
      const checked = resolveLines(previous, indexMenu(latest.categories), new Map(latest.optionGroups.map((group) => [group._id, group])));
      if (!checked.length || checked.some((line) => !line.available)) { setReorderMessage(es ? "Hay productos o adicionales que cambiaron. Armá un nuevo pedido con el menú actual." : "Há produtos ou adicionais que mudaram. Monte um novo pedido com o cardápio atual."); return; }
      cart.clear(); checked.forEach(({ line }) => cart.add(line.productId, line.quantity, line.options, ""));
      setReorderMessage(es ? "Revisá los precios actuales y agregá nuevamente tus observaciones antes de confirmar." : "Confira os preços atuais e adicione novamente suas observações antes de confirmar.");
      sheets.open({ ver: "sacola" });
    } catch { setReorderMessage(t.errors.generic); }
    finally { setReordering(false); }
  }

  return (
    <div style={brand} className="min-h-dvh bg-surface">
      <TopBar {...nav} search={search} onSearch={setSearch} />

      <div className="mx-auto min-h-dvh max-w-[70rem] pb-24 sm:bg-paper sm:px-4 sm:pb-12">
        <StoreHero store={store} onMore={() => sheets.open({ ver: "info" })} onReviews={() => sheets.open({ ver: "avaliacoes" })} />
        {previous.length > 0 && <div className="space-y-2 px-4 py-3 sm:px-0"><button type="button" className={button.secondary} disabled={reordering || !store.isOpen} onClick={() => void reorder()}>{reordering ? t.loading : es ? "Repetir mi último pedido" : "Repetir meu último pedido"}</button><p className="text-xs text-ink-muted">{es ? "De este dispositivo. Se usarán los precios actuales; las observaciones no se guardan." : "Deste aparelho. Serão usados os preços atuais; as observações não são salvas."}</p>{reorderMessage && <p role="status" className="text-sm">{reorderMessage}</p>}</div>}
        <div className="px-4 pt-3 pb-2 sm:hidden">
          <SearchBox value={search} onChange={setSearch} />
        </div>
        {/* Hijo directo de la columna: así queda fija arriba mientras se baja por el menú. */}
        <CategoryNav categories={visibleCategories} onMenu={() => sheets.open({ ver: "categorias" })} />

        <main className="px-4 sm:px-0">
          {visible.length === 0 && <p className="py-10 text-center text-ink-muted">{t.menu.noResults(search.trim())}</p>}
          {featured.length > 0 && (
            <MenuSection
              id="destaques"
              title={t.menu.featured}
              products={featured.map((entry) => entry.product)}
              orderable={(product) => product.available && !!menu.get(product._id)?.category.availableNow}
              onOpen={openProduct}
            />
          )}
          {visible.map(({ category, products }) => (
            <CategorySection key={category._id} category={category} products={products} onOpen={openProduct} />
          ))}
        </main>
      </div>

      <BottomNav {...nav} />

      {selected && (
        <ProductSheet
          key={selected.product._id}
          product={selected.product}
          groups={groups}
          canOrder={store.isOpen && selected.product.available && selected.category.availableNow}
          onAdd={(quantity, options, notes) => {
            cart.add(selected.product._id, quantity, options, notes);
            sheets.closeAll();
          }}
          onClose={sheets.closeAll}
        />
      )}
      {sheets.view === "sacola" && (
        <CartSheet
          lines={lines}
          canOrder={store.isOpen}
          onQuantity={cart.setQuantity}
          onContinue={() => sheets.open({ ver: "finalizar" })}
          onClose={sheets.closeAll}
        />
      )}
      {sheets.view === "finalizar" && lines.length > 0 && (
        <CheckoutSheet store={store} slug={slug} lines={lines.filter((line) => line.available)} onClose={sheets.closeAll} onPlaced={placed} />
      )}
      {sheets.view === "avaliacoes" && (
        <Sheet open title={t.reviews.title} onClose={sheets.closeAll}>
          <ReviewsList slug={slug} />
        </Sheet>
      )}
      {sheets.view === "info" && (
        <Sheet open title={store.name} onClose={sheets.closeAll}>
          <StoreInfo store={store} />
        </Sheet>
      )}
      {sheets.view === "categorias" && (
        <Sheet open title={t.menu.allCategories} onClose={sheets.closeAll}>
          <ul className="divide-y divide-line px-4">
            {visibleCategories.map((category) => (
              <li key={category._id}>
                <button
                  type="button"
                  onClick={() => {
                    sheets.closeAll();
                    // Después de cerrar la hoja (la vuelta atrás del navegador no es instantánea).
                    setTimeout(() => scrollToCategory(category._id), 150);
                  }}
                  className="flex h-13 w-full items-center justify-between text-left font-bold"
                >
                  {category.name}
                  <span className="text-sm font-normal text-ink-muted">{category.products.length}</span>
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </div>
  );
}
