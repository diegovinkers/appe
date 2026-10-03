import { ImagePlus, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import type { ApiError } from "../../../api/client";
import type { Category, OptionGroup, Product, ProductInput, ProductTag } from "../../../api/types";
import { Sheet } from "../../../components/Sheet";
import { Field, Switch, button, input, textarea } from "../../../components/ui";
import { errorText, useT } from "../../../i18n";
import { fromBrazilInput, toBrazilInput } from "../../../lib/format";
import { cloudinaryImage } from "../../../lib/images";
import { centsToInput, parseMoney } from "../../../lib/money";
import { uploadImage } from "../../../lib/upload";
import { useMenuChange } from "./useMenuAdmin";

const TAGS: ProductTag[] = ["vegetarian", "vegan", "gluten_free", "spicy", "new"];
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

type Props = {
  product: Product | null; // null = nuevo
  categories: Category[];
  groups: OptionGroup[];
  defaultCategory?: string;
  onClose: () => void;
};

export function ProductEditor({ product, categories, groups, defaultCategory, onClose }: Props) {
  const t = useT();
  const f = t.menuAdmin.fields;
  const save = useMenuChange<{ product: Product }>();
  const remove = useMenuChange();
  const duplicate = useMenuChange();

  const [form, setForm] = useState({
    name: product?.name ?? "",
    category: product?.category ?? defaultCategory ?? categories[0]?._id ?? "",
    description: product?.description ?? "",
    price: centsToInput(product?.priceCents),
    promoPrice: centsToInput(product?.promoPriceCents),
    promoFrom: toBrazilInput(product?.promoStartsAt),
    promoUntil: toBrazilInput(product?.promoEndsAt),
    imageUrl: product?.imageUrl ?? "",
    tags: product?.tags ?? [],
    featured: product?.featured ?? false,
    available: product?.available ?? true,
    trackStock: product?.trackStock ?? false,
    stock: String(product?.stock ?? 0),
    optionGroups: product?.optionGroups ?? [],
    nameEs: product?.translations?.es?.name ?? "",
    descriptionEs: product?.translations?.es?.description ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }));

  const choosePhoto = async (file: File | undefined) => {
    if (!file) return;
    setUploadError("");
    if (file.size > MAX_PHOTO_BYTES) return setUploadError(t.menuAdmin.photoTooBig);
    setUploading(true);
    try {
      set("imageUrl", await uploadImage(file, "product"));
    } catch (error) {
      setUploadError(errorText(error, t));
    } finally {
      setUploading(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const price = parseMoney(form.price);
    const promo = parseMoney(form.promoPrice);
    const found: Record<string, string> = {};
    if (!form.name.trim()) found.name = t.menuAdmin.required;
    if (!form.category) found.category = t.menuAdmin.required;
    if (price == null) found.price = t.menuAdmin.invalidPrice;
    if (form.promoPrice.trim() && promo == null) found.promoPrice = t.menuAdmin.invalidPrice;
    setErrors(found);
    if (Object.keys(found).length || price == null) return;

    const body: ProductInput = {
      category: form.category,
      name: form.name.trim(),
      description: form.description.trim(),
      priceCents: price,
      promoPriceCents: promo,
      promoStartsAt: promo == null ? null : fromBrazilInput(form.promoFrom),
      promoEndsAt: promo == null ? null : fromBrazilInput(form.promoUntil),
      imageUrl: form.imageUrl,
      tags: form.tags,
      featured: form.featured,
      available: form.available,
      trackStock: form.trackStock,
      stock: Math.max(0, Math.floor(Number(form.stock) || 0)),
      optionGroups: form.optionGroups,
      translations: { es: { name: form.nameEs.trim(), description: form.descriptionEs.trim() } },
    };
    save.mutate(
      product ? { path: `/owner/products/${product._id}`, method: "PATCH", body } : { path: "/owner/products", method: "POST", body },
      { onSuccess: onClose }
    );
  };

  const toggleGroup = (id: string) =>
    set("optionGroups", form.optionGroups.includes(id) ? form.optionGroups.filter((g) => g !== id) : [...form.optionGroups, id]);
  // Los elegidos primero (en su orden), después el resto.
  const orderedGroups = [
    ...form.optionGroups.map((id) => groups.find((g) => g._id === id)).filter((g): g is OptionGroup => !!g),
    ...groups.filter((g) => !form.optionGroups.includes(g._id)),
  ];
  const error = save.error ?? remove.error ?? duplicate.error;
  const busy = save.isPending || remove.isPending || duplicate.isPending || uploading;

  const footer = (
    <div className="space-y-2">
      {error && (
        <p role="alert" className="text-sm font-bold text-error">
          {errorText(error as ApiError, t)}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {product && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => window.confirm(t.menuAdmin.confirmDelete(product.name)) && remove.mutate({ path: `/owner/products/${product._id}`, method: "DELETE" }, { onSuccess: onClose })}
              className={button.danger}
            >
              {t.menuAdmin.delete}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => duplicate.mutate({ path: `/owner/products/${product._id}/duplicate`, method: "POST" }, { onSuccess: onClose })}
              className={button.secondary}
            >
              {t.menuAdmin.duplicate}
            </button>
          </>
        )}
        <button type="submit" form="form-produto" disabled={busy} className={`${button.primary} flex-1`}>
          {save.isPending ? t.menuAdmin.saving : t.menuAdmin.save}
        </button>
      </div>
    </div>
  );

  return (
    <Sheet open title={product ? product.name : t.menuAdmin.newProduct} onClose={onClose} footer={footer}>
      <form id="form-produto" onSubmit={submit} noValidate className="space-y-4 p-4">
        <Field id="produto-nome" label={f.name} error={errors.name}>
          <input id="produto-nome" value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={80} className={input} aria-invalid={!!errors.name} />
        </Field>
        <Field id="produto-categoria" label={f.category} error={errors.category}>
          <select id="produto-categoria" value={form.category} onChange={(e) => set("category", e.target.value)} className={input} aria-invalid={!!errors.category}>
            {categories.map((category) => (
              <option key={category._id} value={category._id}>
                {category.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id="produto-descricao" label={f.description}>
          <textarea id="produto-descricao" rows={3} maxLength={300} value={form.description} onChange={(e) => set("description", e.target.value)} className={textarea} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="produto-preco" label={f.price} error={errors.price}>
            <input id="produto-preco" inputMode="decimal" placeholder="R$" value={form.price} onChange={(e) => set("price", e.target.value)} className={input} aria-invalid={!!errors.price} />
          </Field>
          <Field id="produto-promo" label={f.promoPrice} error={errors.promoPrice} hint={f.promoHint}>
            <input id="produto-promo" inputMode="decimal" placeholder="R$" value={form.promoPrice} onChange={(e) => set("promoPrice", e.target.value)} className={input} aria-invalid={!!errors.promoPrice} />
          </Field>
        </div>
        {form.promoPrice.trim() && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="produto-promo-de" label={f.promoFrom}>
              <input id="produto-promo-de" type="datetime-local" value={form.promoFrom} onChange={(e) => set("promoFrom", e.target.value)} className={input} />
            </Field>
            <Field id="produto-promo-ate" label={f.promoUntil}>
              <input id="produto-promo-ate" type="datetime-local" value={form.promoUntil} onChange={(e) => set("promoUntil", e.target.value)} className={input} />
            </Field>
          </div>
        )}

        <div>
          <p className="mb-1.5 font-bold">{f.photo}</p>
          <div className="flex flex-wrap items-center gap-3">
            {form.imageUrl && <img src={cloudinaryImage(form.imageUrl, 192, 192)} alt="" className="size-24 rounded-lg object-cover ring-1 ring-line" />}
            <label className={`${button.secondary} cursor-pointer`}>
              <ImagePlus aria-hidden className="size-4" />
              {uploading ? f.uploading : form.imageUrl ? f.changePhoto : f.choosePhoto}
              <input type="file" accept="image/*" disabled={uploading} className="sr-only" onChange={(e) => choosePhoto(e.target.files?.[0])} />
            </label>
            {form.imageUrl && !uploading && (
              <button type="button" onClick={() => set("imageUrl", "")} className={button.quiet}>
                <Trash2 aria-hidden className="size-4" />
                {f.removePhoto}
              </button>
            )}
          </div>
          {uploadError && <p className="mt-1 text-sm font-bold text-error">{uploadError}</p>}
        </div>

        <div className="space-y-1">
          <Switch checked={form.available} onChange={(value) => set("available", value)} label={t.menuAdmin.available} />
          <Switch checked={form.featured} onChange={(value) => set("featured", value)} label={f.featured} />
          <Switch checked={form.trackStock} onChange={(value) => set("trackStock", value)} label={f.trackStock} />
          {form.trackStock && (
            <Field id="produto-estoque" label={f.stock} hint={f.stockHint}>
              <input id="produto-estoque" type="number" min={0} max={100000} value={form.stock} onChange={(e) => set("stock", e.target.value)} className={`${input} max-w-40`} />
            </Field>
          )}
        </div>

        <fieldset>
          <legend className="mb-1.5 font-bold">{f.tags}</legend>
          <div className="flex flex-wrap gap-x-4">
            {TAGS.map((tag) => (
              <label key={tag} className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.tags.includes(tag)}
                  onChange={(e) => set("tags", e.target.checked ? [...form.tags, tag] : form.tags.filter((x) => x !== tag))}
                  className="size-5 accent-(--brand)"
                />
                {t.menu.tags[tag]}
              </label>
            ))}
          </div>
        </fieldset>

        {groups.length > 0 && (
          <fieldset>
            <legend className="font-bold">{f.optionGroups}</legend>
            <p className="mb-1 text-sm text-ink-muted">{f.optionGroupsHint}</p>
            {orderedGroups.map((group) => (
              <label key={group._id} className="flex min-h-11 items-center gap-2">
                <input type="checkbox" checked={form.optionGroups.includes(group._id)} onChange={() => toggleGroup(group._id)} className="size-5 accent-(--brand)" />
                <span>
                  {group.name} <span className="text-sm text-ink-muted">({t.menuAdmin.rule(group.minSelect, group.maxSelect)})</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}

        <details className="rounded-lg border border-line p-3">
          <summary className="cursor-pointer font-bold">{f.spanish}</summary>
          <div className="mt-3 space-y-3">
            <Field id="produto-nome-es" label={f.spanishName}>
              <input id="produto-nome-es" lang="es" value={form.nameEs} onChange={(e) => set("nameEs", e.target.value)} maxLength={80} className={input} />
            </Field>
            <Field id="produto-descricao-es" label={f.spanishDescription}>
              <textarea id="produto-descricao-es" lang="es" rows={2} maxLength={300} value={form.descriptionEs} onChange={(e) => set("descriptionEs", e.target.value)} className={textarea} />
            </Field>
          </div>
        </details>
      </form>
    </Sheet>
  );
}
