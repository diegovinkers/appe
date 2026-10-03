import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { useState } from "react";
import type { Product } from "../../../api/types";
import { can } from "../../../auth/permissions";
import { Spinner } from "../../../components/FullScreenMessage";
import { PageHeader } from "../../../components/PageHeader";
import { Switch, button } from "../../../components/ui";
import { useParamSheet } from "../../../hooks/useParamSheet";
import { errorText, useT } from "../../../i18n";
import { formatMoney } from "../../../lib/format";
import { cloudinaryThumb } from "../../../lib/images";
import { matchesSearch } from "../../../lib/text";
import { SearchBox } from "../../menu/MenuChrome";
import { ProductEditor } from "../menu/ProductEditor";
import { moved, useCategories, useMenuChange, useOptionGroups, useProducts } from "../menu/useMenuAdmin";
import { usePanel } from "../PanelLayout";

const iconButton = "grid size-10 place-items-center rounded-lg text-ink-muted hover:bg-paper hover:text-ink disabled:opacity-30";

function PriceText({ product }: { product: Product }) {
  return (
    <span className="tabular-nums">
      {product.promoPriceCents != null && <s className="mr-1.5 text-sm text-ink-muted">{formatMoney(product.priceCents)}</s>}
      <span className="font-bold">{formatMoney(product.promoPriceCents ?? product.priceCents)}</span>
    </span>
  );
}

// Productos por categoría: marcar agotado (también el empleado), ordenar y editar (el dueño).
export function ProductsPage() {
  const t = useT();
  const { user } = usePanel();
  const categories = useCategories();
  const products = useProducts();
  const groups = useOptionGroups();
  const change = useMenuChange();
  const editor = useParamSheet("produto");
  const [search, setSearch] = useState("");
  const [only, setOnly] = useState<string | null>(null);
  const canWrite = can(user.role, "menu:write");
  const canToggle = can(user.role, "menu:availability");

  const loading = categories.isPending || products.isPending || groups.isPending;
  const failed = categories.isError || products.isError || groups.isError;
  const all = products.data ?? [];
  const sections = (categories.data ?? [])
    .filter((category) => !only || category._id === only)
    .map((category) => ({
      category,
      inCategory: all.filter((product) => product.category === category._id),
      products: all.filter((product) => product.category === category._id && matchesSearch(`${product.name} ${product.description}`, search)),
    }))
    .filter((section) => !search.trim() || section.products.length > 0);

  const editing = editor.value && editor.value !== "novo" ? all.find((product) => product._id === editor.value) : null;

  return (
    <>
      <PageHeader
        title={t.pages.products.title}
        description={t.pages.products.description}
        actions={
          canWrite &&
          (categories.data?.length ?? 0) > 0 && (
            <button type="button" onClick={() => editor.open("novo")} className={button.primary}>
              <Plus aria-hidden className="size-5" />
              {t.menuAdmin.newProduct}
            </button>
          )
        }
      />
      {!canWrite && <p className="mb-4 rounded-xl bg-surface p-4 text-ink-muted ring-1 ring-line">{t.menuAdmin.staffHint}</p>}

      {loading && <Spinner />}
      {failed && <p className="text-error">{t.errors.generic}</p>}
      {!loading && !failed && (categories.data?.length ?? 0) === 0 && (
        <p className="rounded-xl border border-dashed border-line bg-surface p-6 text-ink-muted">{t.menuAdmin.noCategories}</p>
      )}

      {!loading && !failed && (categories.data?.length ?? 0) > 0 && (
        <>
          <div className="mb-3 max-w-md">
            <SearchBox value={search} onChange={setSearch} placeholder={t.menuAdmin.search} />
          </div>
          <div role="group" aria-label={t.menuAdmin.fields.category} className="mb-4 flex flex-wrap gap-2">
            {[{ _id: null, name: t.menuAdmin.all }, ...(categories.data ?? [])].map((category) => (
              <button
                key={category._id ?? "todas"}
                type="button"
                aria-pressed={only === category._id}
                onClick={() => setOnly(category._id)}
                className={`h-10 rounded-full px-4 text-sm ${only === category._id ? "bg-action font-bold text-white" : "bg-surface ring-1 ring-line hover:bg-paper"}`}
              >
                {category.name}
              </button>
            ))}
          </div>
          {change.isError && (
            <p role="alert" className="mb-3 font-bold text-error">
              {errorText(change.error, t)}
            </p>
          )}
          {sections.length === 0 && <p className="py-6 text-ink-muted">{t.menuAdmin.noProducts}</p>}

          <div className="space-y-6">
            {sections.map(({ category, inCategory, products: list }) => (
              <section key={category._id} aria-labelledby={`cat-${category._id}`}>
                <h2 id={`cat-${category._id}`} className="mb-2 flex items-baseline gap-2 text-lg font-bold">
                  {category.name}
                  {!category.active && <span className="text-sm font-normal text-ink-muted">({t.menuAdmin.hidden})</span>}
                </h2>
                {list.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-line bg-surface p-4 text-ink-muted">{t.menuAdmin.emptyCategory}</p>
                ) : (
                  <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
                    {list.map((product) => {
                      const order = (step: -1 | 1) => {
                        const ids = moved(inCategory, product._id, step);
                        if (ids) change.mutate({ path: "/owner/products/reorder", method: "PATCH", body: { category: category._id, ids } });
                      };
                      const index = inCategory.findIndex((p) => p._id === product._id);
                      return (
                        <li key={product._id} className="flex flex-wrap items-center gap-3 px-3 py-2 sm:flex-nowrap">
                          {product.imageUrl ? (
                            <img src={cloudinaryThumb(product.imageUrl, 96)} alt="" className="size-12 shrink-0 rounded-lg object-cover" />
                          ) : (
                            <span aria-hidden className="size-12 shrink-0 rounded-lg bg-paper" />
                          )}
                          <button
                            type="button"
                            disabled={!canWrite}
                            onClick={() => editor.open(product._id)}
                            className="min-w-0 flex-1 text-left disabled:cursor-default"
                          >
                            <span className={`block truncate font-bold ${product.available ? "" : "text-ink-muted"}`}>{product.name}</span>
                            <span className="flex flex-wrap items-center gap-x-3 text-sm">
                              <PriceText product={product} />
                              {!product.available && <span className="font-bold text-error">{t.menu.soldOut}</span>}
                              {product.trackStock && <span className="text-ink-muted">{t.menuAdmin.fields.stock}: {product.stock}</span>}
                              {product.featured && <span className="text-ink-muted">★ {t.menu.featured}</span>}
                            </span>
                          </button>
                          <Switch
                            checked={product.available}
                            disabled={!canToggle || change.isPending}
                            label={`${t.menuAdmin.available}: ${product.name}`}
                            showLabel={false}
                            onChange={(available) =>
                              change.mutate({ path: `/owner/products/${product._id}/availability`, method: "PATCH", body: { available } })
                            }
                          />
                          {canWrite && !search.trim() && (
                            <span className="flex">
                              <button type="button" aria-label={`${t.menuAdmin.moveUp}: ${product.name}`} title={t.menuAdmin.moveUp} disabled={index === 0 || change.isPending} onClick={() => order(-1)} className={iconButton}>
                                <ArrowUp aria-hidden className="size-4" />
                              </button>
                              <button
                                type="button"
                                aria-label={`${t.menuAdmin.moveDown}: ${product.name}`}
                                title={t.menuAdmin.moveDown}
                                disabled={index === inCategory.length - 1 || change.isPending}
                                onClick={() => order(1)}
                                className={iconButton}
                              >
                                <ArrowDown aria-hidden className="size-4" />
                              </button>
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </>
      )}

      {canWrite && editor.value && (editor.value === "novo" || editing) && (
        <ProductEditor
          key={editor.value}
          product={editing ?? null}
          categories={categories.data ?? []}
          groups={groups.data ?? []}
          defaultCategory={only ?? undefined}
          onClose={editor.close}
        />
      )}
    </>
  );
}
