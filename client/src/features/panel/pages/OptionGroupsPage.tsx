import { Plus, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import type { ApiError } from "../../../api/client";
import type { OptionGroup, OptionGroupInput } from "../../../api/types";
import { can } from "../../../auth/permissions";
import { Spinner } from "../../../components/FullScreenMessage";
import { PageHeader } from "../../../components/PageHeader";
import { Sheet } from "../../../components/Sheet";
import { Field, Switch, button, input } from "../../../components/ui";
import { useParamSheet } from "../../../hooks/useParamSheet";
import { errorText, useT } from "../../../i18n";
import { formatMoney } from "../../../lib/format";
import { centsToInput, parseMoney } from "../../../lib/money";
import { useMenuChange, useOptionGroups, useProducts } from "../menu/useMenuAdmin";
import { usePanel } from "../PanelLayout";

type Pricing = OptionGroup["pricing"];
type OptionRow = { key: string; _id?: string; name: string; price: string; maxQuantity: number; available: boolean; translations: Record<string, unknown> };

let rowKey = 0;
const newRow = (): OptionRow => ({ key: `nova-${rowKey++}`, name: "", price: "", maxQuantity: 1, available: true, translations: {} });

function GroupEditor({ group, usedIn, onClose }: { group: OptionGroup | null; usedIn: number; onClose: () => void }) {
  const t = useT();
  const f = t.menuAdmin.fields;
  const save = useMenuChange();
  const remove = useMenuChange();
  const [name, setName] = useState(group?.name ?? "");
  const [minSelect, setMin] = useState(group?.minSelect ?? 0);
  const [maxSelect, setMax] = useState(group?.maxSelect ?? 1);
  const [pricing, setPricing] = useState<Pricing>(group?.pricing ?? "sum");
  const [nameEs, setNameEs] = useState(group?.translations?.es?.name ?? "");
  const [options, setOptions] = useState<OptionRow[]>(
    group?.options.map((option) => ({
      key: option._id,
      _id: option._id,
      name: option.name,
      price: centsToInput(option.priceCents),
      maxQuantity: option.maxQuantity,
      available: option.available,
      translations: option.translations ?? {},
    })) ?? [newRow()]
  );
  const [error, setError] = useState("");
  const update = (key: string, changes: Partial<OptionRow>) => setOptions((rows) => rows.map((row) => (row.key === key ? { ...row, ...changes } : row)));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const filled = options.filter((row) => row.name.trim());
    if (!name.trim() || filled.length === 0) return setError(t.menuAdmin.required);
    if (filled.some((row) => row.price.trim() && parseMoney(row.price) == null)) return setError(t.menuAdmin.invalidPrice);
    setError("");
    const body = {
      name: name.trim(),
      minSelect,
      maxSelect,
      pricing,
      translations: { es: { name: nameEs.trim() } },
      // Con el _id, una opción que ya existía se conserva (y sus traducciones también).
      options: filled.map((row) => ({
        ...(row._id && { _id: row._id }),
        name: row.name.trim(),
        priceCents: parseMoney(row.price) ?? 0,
        maxQuantity: row.maxQuantity,
        available: row.available,
        translations: row.translations,
      })),
    } as OptionGroupInput;
    save.mutate(group ? { path: `/owner/option-groups/${group._id}`, method: "PATCH", body } : { path: "/owner/option-groups", method: "POST", body }, {
      onSuccess: onClose,
    });
  };
  const failure = save.error ?? remove.error;

  return (
    <Sheet
      open
      title={group ? group.name : t.menuAdmin.newGroup}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          {(error || failure) && (
            <p role="alert" className="text-sm font-bold text-error">
              {error || errorText(failure as ApiError, t)}
            </p>
          )}
          <div className="flex gap-2">
            {group && (
              <button
                type="button"
                disabled={remove.isPending}
                onClick={() =>
                  window.confirm(`${t.menuAdmin.confirmDelete(group.name)} ${t.menuAdmin.usedIn(usedIn)}.`) &&
                  remove.mutate({ path: `/owner/option-groups/${group._id}`, method: "DELETE" }, { onSuccess: onClose })
                }
                className={button.danger}
              >
                {t.menuAdmin.delete}
              </button>
            )}
            <button type="submit" form="form-grupo" disabled={save.isPending} className={`${button.primary} flex-1`}>
              {save.isPending ? t.menuAdmin.saving : t.menuAdmin.save}
            </button>
          </div>
        </div>
      }
    >
      <form id="form-grupo" onSubmit={submit} noValidate className="space-y-4 p-4">
        <Field id="grupo-nome" label={f.name}>
          <input id="grupo-nome" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={input} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="grupo-min" label={f.minSelect}>
            <input id="grupo-min" type="number" min={0} max={50} value={minSelect} onChange={(e) => setMin(Math.max(0, Number(e.target.value) || 0))} className={input} />
          </Field>
          <Field id="grupo-max" label={f.maxSelect}>
            <input id="grupo-max" type="number" min={1} max={50} value={maxSelect} onChange={(e) => setMax(Math.max(1, Number(e.target.value) || 1))} className={input} />
          </Field>
        </div>
        <p className="-mt-2 text-sm text-ink-muted">{t.menuAdmin.rule(minSelect, maxSelect)}</p>
        <fieldset>
          <legend className="mb-1 font-bold">{f.pricing}</legend>
          {(["sum", "max", "average"] as const).map((rule) => (
            <label key={rule} className="flex min-h-11 items-center gap-2">
              <input type="radio" name="regra" checked={pricing === rule} onChange={() => setPricing(rule)} className="size-5 accent-(--brand)" />
              {f.pricingRules[rule]}
            </label>
          ))}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="mb-1 font-bold">{f.options}</legend>
          <p className="text-sm text-ink-muted">{f.optionMaxHint}</p>
          {options.map((row, index) => (
            <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_6rem_4.5rem_auto] items-end gap-2 rounded-lg border border-line p-2">
              <Field id={`opcao-${row.key}`} label={index === 0 ? f.optionName : ""}>
                <input id={`opcao-${row.key}`} aria-label={f.optionName} value={row.name} onChange={(e) => update(row.key, { name: e.target.value })} maxLength={60} className={input} />
              </Field>
              <Field id={`opcao-preco-${row.key}`} label={index === 0 ? f.optionPrice : ""}>
                <input
                  id={`opcao-preco-${row.key}`}
                  aria-label={f.optionPrice}
                  inputMode="decimal"
                  placeholder="0,00"
                  value={row.price}
                  onChange={(e) => update(row.key, { price: e.target.value })}
                  className={input}
                />
              </Field>
              <Field id={`opcao-vezes-${row.key}`} label={index === 0 ? f.optionMax : ""}>
                <input
                  id={`opcao-vezes-${row.key}`}
                  aria-label={f.optionMax}
                  type="number"
                  min={1}
                  max={10}
                  value={row.maxQuantity}
                  onChange={(e) => update(row.key, { maxQuantity: Math.min(10, Math.max(1, Number(e.target.value) || 1)) })}
                  className={input}
                />
              </Field>
              <button
                type="button"
                aria-label={`${f.removeOption}: ${row.name}`}
                title={f.removeOption}
                disabled={options.length === 1}
                onClick={() => setOptions((rows) => rows.filter((r) => r.key !== row.key))}
                className="grid size-11 place-items-center rounded-lg text-ink-muted hover:bg-paper disabled:opacity-30"
              >
                <Trash2 aria-hidden className="size-4" />
              </button>
              <div className="col-span-4">
                <Switch checked={row.available} onChange={(available) => update(row.key, { available })} label={t.menuAdmin.available} />
              </div>
            </div>
          ))}
          <button type="button" onClick={() => setOptions((rows) => [...rows, newRow()])} className={button.secondary}>
            <Plus aria-hidden className="size-4" />
            {f.addOption}
          </button>
        </fieldset>

        <Field id="grupo-nome-es" label={f.spanishName}>
          <input id="grupo-nome-es" lang="es" value={nameEs} onChange={(e) => setNameEs(e.target.value)} maxLength={60} className={input} />
        </Field>
      </form>
    </Sheet>
  );
}

// Grupos de opciones (ponto da carne, adicionais, sabores…). El empleado solo marca agotadas.
export function OptionGroupsPage() {
  const t = useT();
  const { user } = usePanel();
  const groups = useOptionGroups();
  const products = useProducts();
  const change = useMenuChange();
  const editor = useParamSheet("grupo");
  const canWrite = can(user.role, "menu:write");
  const canToggle = can(user.role, "menu:availability");
  const list = groups.data ?? [];
  const usedIn = (id: string) => (products.data ?? []).filter((product) => product.optionGroups.includes(id)).length;
  const editing = editor.value && editor.value !== "novo" ? list.find((group) => group._id === editor.value) : null;

  return (
    <>
      <PageHeader
        title={t.pages.optionGroups.title}
        description={t.pages.optionGroups.description}
        actions={
          canWrite && (
            <button type="button" onClick={() => editor.open("novo")} className={button.primary}>
              <Plus aria-hidden className="size-5" />
              {t.menuAdmin.newGroup}
            </button>
          )
        }
      />
      {!canWrite && <p className="mb-4 rounded-xl bg-surface p-4 text-ink-muted ring-1 ring-line">{t.menuAdmin.staffHint}</p>}
      {groups.isPending && <Spinner />}
      {groups.isError && <p className="text-error">{t.errors.generic}</p>}
      {change.isError && (
        <p role="alert" className="mb-3 font-bold text-error">
          {errorText(change.error, t)}
        </p>
      )}
      {groups.data && list.length === 0 && <p className="rounded-xl border border-dashed border-line bg-surface p-6 text-ink-muted">{t.menuAdmin.noGroups}</p>}

      <div className="grid gap-4 md:grid-cols-2">
        {list.map((group) => (
          <section key={group._id} aria-labelledby={`grupo-${group._id}`} className="rounded-xl border border-line bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id={`grupo-${group._id}`} className="font-bold">
                  {group.name}
                </h2>
                <p className="text-sm text-ink-muted">
                  {t.menuAdmin.rule(group.minSelect, group.maxSelect)} · {t.menuAdmin.usedIn(usedIn(group._id))}
                </p>
              </div>
              {canWrite && (
                <button type="button" onClick={() => editor.open(group._id)} className={button.secondary}>
                  {t.menuAdmin.edit}
                </button>
              )}
            </div>
            <ul className="mt-2 divide-y divide-line">
              {group.options.map((option) => (
                <li key={option._id} className="flex items-center justify-between gap-3 py-1">
                  <span className={option.available ? "" : "text-ink-muted line-through"}>
                    {option.name}
                    {option.priceCents > 0 && <span className="ml-2 text-sm text-ink-muted tabular-nums">+ {formatMoney(option.priceCents)}</span>}
                  </span>
                  <Switch
                    checked={option.available}
                    disabled={!canToggle || change.isPending}
                    label={`${t.menuAdmin.available}: ${option.name}`}
                    showLabel={false}
                    onChange={(available) =>
                      change.mutate({ path: `/owner/option-groups/${group._id}/options/${option._id}`, method: "PATCH", body: { available } })
                    }
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {canWrite && editor.value && (editor.value === "novo" || editing) && (
        <GroupEditor key={editor.value} group={editing ?? null} usedIn={editing ? usedIn(editing._id) : 0} onClose={editor.close} />
      )}
    </>
  );
}
