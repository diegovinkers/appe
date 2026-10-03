import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { type FormEvent, useState } from "react";
import type { ApiError } from "../../../api/client";
import type { Category, CategoryInput } from "../../../api/types";
import { Spinner } from "../../../components/FullScreenMessage";
import { PageHeader } from "../../../components/PageHeader";
import { Sheet } from "../../../components/Sheet";
import { Field, Switch, button, input } from "../../../components/ui";
import { useParamSheet } from "../../../hooks/useParamSheet";
import { errorText, useT } from "../../../i18n";
import { moved, useCategories, useMenuChange, useProducts } from "../menu/useMenuAdmin";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const iconButton = "grid size-10 place-items-center rounded-lg text-ink-muted hover:bg-paper hover:text-ink disabled:opacity-30";

function CategoryEditor({ category, count, onClose }: { category: Category | null; count: number; onClose: () => void }) {
  const t = useT();
  const f = t.menuAdmin.fields;
  const save = useMenuChange();
  const remove = useMenuChange();
  const [name, setName] = useState(category?.name ?? "");
  const [active, setActive] = useState(category?.active ?? true);
  const [scheduled, setScheduled] = useState(!!category?.schedule);
  const [days, setDays] = useState<string[]>(category?.schedule?.days ?? []);
  const [from, setFrom] = useState(category?.schedule?.from ?? "18:00");
  const [to, setTo] = useState(category?.schedule?.to ?? "23:00");
  const [nameEs, setNameEs] = useState(category?.translations?.es?.name ?? "");
  const [error, setError] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return setError(t.menuAdmin.required);
    const body = {
      name: name.trim(),
      active,
      schedule: scheduled ? { days, from, to } : null,
      translations: { es: { name: nameEs.trim() } },
    } as CategoryInput;
    save.mutate(
      category ? { path: `/owner/categories/${category._id}`, method: "PATCH", body } : { path: "/owner/categories", method: "POST", body },
      { onSuccess: onClose }
    );
  };
  const failure = save.error ?? remove.error;

  return (
    <Sheet
      open
      title={category ? category.name : t.menuAdmin.newCategory}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          {failure && (
            <p role="alert" className="text-sm font-bold text-error">
              {errorText(failure as ApiError, t)}
            </p>
          )}
          <div className="flex gap-2">
            {category && (
              <button
                type="button"
                disabled={count > 0 || remove.isPending}
                title={count > 0 ? t.apiErrors.CATEGORY_NOT_EMPTY : undefined}
                onClick={() =>
                  window.confirm(t.menuAdmin.confirmDelete(category.name)) &&
                  remove.mutate({ path: `/owner/categories/${category._id}`, method: "DELETE" }, { onSuccess: onClose })
                }
                className={button.danger}
              >
                {t.menuAdmin.delete}
              </button>
            )}
            <button type="submit" form="form-categoria" disabled={save.isPending} className={`${button.primary} flex-1`}>
              {save.isPending ? t.menuAdmin.saving : t.menuAdmin.save}
            </button>
          </div>
        </div>
      }
    >
      <form id="form-categoria" onSubmit={submit} noValidate className="space-y-4 p-4">
        <Field id="categoria-nome" label={f.name} error={error}>
          <input id="categoria-nome" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={input} aria-invalid={!!error} />
        </Field>
        <Switch checked={active} onChange={setActive} label={f.active} />
        <Switch checked={scheduled} onChange={setScheduled} label={f.scheduled} />
        {scheduled && (
          <div className="space-y-3 rounded-lg border border-line p-3">
            <fieldset>
              <legend className="mb-1 font-bold">{f.days}</legend>
              <div className="flex flex-wrap gap-x-3">
                {DAYS.map((day) => (
                  <label key={day} className="flex min-h-11 items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={days.includes(day)}
                      onChange={(e) => setDays(e.target.checked ? [...days, day] : days.filter((d) => d !== day))}
                      className="size-5 accent-(--brand)"
                    />
                    {t.menu.weekdays[day].slice(0, 3)}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid grid-cols-2 gap-3">
              <Field id="categoria-das" label={f.from}>
                <input id="categoria-das" type="time" value={from} onChange={(e) => setFrom(e.target.value)} className={input} />
              </Field>
              <Field id="categoria-ate" label={f.to}>
                <input id="categoria-ate" type="time" value={to} onChange={(e) => setTo(e.target.value)} className={input} />
              </Field>
            </div>
          </div>
        )}
        <Field id="categoria-nome-es" label={f.spanishName}>
          <input id="categoria-nome-es" lang="es" value={nameEs} onChange={(e) => setNameEs(e.target.value)} maxLength={60} className={input} />
        </Field>
      </form>
    </Sheet>
  );
}

// Las secciones del menú: nombre, orden, visibles o no, y horario opcional.
export function CategoriesPage() {
  const t = useT();
  const categories = useCategories();
  const products = useProducts();
  const change = useMenuChange();
  const editor = useParamSheet("categoria");
  const list = categories.data ?? [];
  const count = (id: string) => (products.data ?? []).filter((product) => product.category === id).length;
  const editing = editor.value && editor.value !== "nova" ? list.find((category) => category._id === editor.value) : null;

  return (
    <>
      <PageHeader
        title={t.pages.categories.title}
        description={t.pages.categories.description}
        actions={
          <button type="button" onClick={() => editor.open("nova")} className={button.primary}>
            <Plus aria-hidden className="size-5" />
            {t.menuAdmin.newCategory}
          </button>
        }
      />
      {categories.isPending && <Spinner />}
      {categories.isError && <p className="text-error">{t.errors.generic}</p>}
      {change.isError && (
        <p role="alert" className="mb-3 font-bold text-error">
          {errorText(change.error, t)}
        </p>
      )}
      {categories.data && list.length === 0 && (
        <p className="rounded-xl border border-dashed border-line bg-surface p-6 text-ink-muted">{t.menuAdmin.noCategories}</p>
      )}
      {list.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {list.map((category, index) => (
            <li key={category._id} className="flex items-center gap-3 px-3 py-2">
              <button type="button" onClick={() => editor.open(category._id)} className="min-w-0 flex-1 text-left">
                <span className={`block truncate font-bold ${category.active ? "" : "text-ink-muted"}`}>{category.name}</span>
                <span className="block text-sm text-ink-muted">
                  {t.menuAdmin.products(count(category._id))}
                  {category.schedule && ` · ${t.menu.availableBetween(category.schedule.from, category.schedule.to)}`}
                  {!category.active && ` · ${t.menuAdmin.hidden}`}
                </span>
              </button>
              <Switch
                checked={category.active}
                disabled={change.isPending}
                label={`${t.menuAdmin.fields.active}: ${category.name}`}
                showLabel={false}
                onChange={(active) => change.mutate({ path: `/owner/categories/${category._id}`, method: "PATCH", body: { active } })}
              />
              <span className="flex">
                <button
                  type="button"
                  aria-label={`${t.menuAdmin.moveUp}: ${category.name}`}
                  title={t.menuAdmin.moveUp}
                  disabled={index === 0 || change.isPending}
                  onClick={() => {
                    const ids = moved(list, category._id, -1);
                    if (ids) change.mutate({ path: "/owner/categories/reorder", method: "PATCH", body: { ids } });
                  }}
                  className={iconButton}
                >
                  <ArrowUp aria-hidden className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={`${t.menuAdmin.moveDown}: ${category.name}`}
                  title={t.menuAdmin.moveDown}
                  disabled={index === list.length - 1 || change.isPending}
                  onClick={() => {
                    const ids = moved(list, category._id, 1);
                    if (ids) change.mutate({ path: "/owner/categories/reorder", method: "PATCH", body: { ids } });
                  }}
                  className={iconButton}
                >
                  <ArrowDown aria-hidden className="size-4" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {editor.value && (editor.value === "nova" || editing) && (
        <CategoryEditor key={editor.value} category={editing ?? null} count={editing ? count(editing._id) : 0} onClose={editor.close} />
      )}
    </>
  );
}
