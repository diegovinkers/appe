import { ArrowDown, ArrowUp, Plus, Search, X } from "lucide-react";
import { useState } from "react";
import type { OptionGroup } from "../../../api/types";
import { Notice } from "../../../components/Notice";
import { Field, button, input } from "../../../components/ui";
import { errorText, useT } from "../../../i18n";
import { formatMoney } from "../../../lib/format";
import { parseMoney } from "../../../lib/money";
import { matchesSearch } from "../../../lib/text";
import { similarGroups } from "./groupNames";
import { useMenuChange } from "./useMenuAdmin";

// Las opciones del grupo en una línea: "Mal passado, Ao ponto, Bacon +R$ 4,00".
function optionsLine(group: OptionGroup) {
  return group.options.map((option) => (option.priceCents > 0 ? `${option.name} +${formatMoney(option.priceCents)}` : option.name)).join(", ");
}

const iconButton = "grid size-11 shrink-0 place-items-center rounded-lg text-ink-muted hover:bg-paper hover:text-ink disabled:opacity-30";

// Un grupo nuevo sin salir del producto: nombre, opciones con precio y si es obligatorio.
// Si ya hay uno con nombre parecido, se ofrece usar ese (así no se cargan repetidos).
function NewGroup({ groups, onCreated, onUse, onCancel }: { groups: OptionGroup[]; onCreated: (id: string) => void; onUse: (id: string) => void; onCancel: () => void }) {
  const t = useT();
  const g = t.groups;
  const create = useMenuChange<{ optionGroup: OptionGroup }>();
  const [name, setName] = useState("");
  const [required, setRequired] = useState(false);
  const [options, setOptions] = useState([{ name: "", price: "" }, { name: "", price: "" }]);
  const [error, setError] = useState("");
  // Con mostrar tres alcanza: si hay más iguales, se juntan en Adicionais.
  const similar = similarGroups(name, groups).slice(0, 3);

  const save = () => {
    const filled = options.filter((option) => option.name.trim());
    if (!name.trim() || !filled.length) return setError(g.needsOption);
    if (filled.some((option) => option.price.trim() && parseMoney(option.price) == null)) return setError(t.menuAdmin.invalidPrice);
    setError("");
    create.mutate(
      {
        path: "/owner/option-groups",
        method: "POST",
        body: {
          name: name.trim(),
          // Obligatorio: elige exactamente 1. Si no: elige las que quiera.
          minSelect: required ? 1 : 0,
          maxSelect: required ? 1 : filled.length,
          options: filled.map((option) => ({ name: option.name.trim(), priceCents: parseMoney(option.price) ?? 0 })),
        },
      },
      { onSuccess: ({ optionGroup }) => onCreated(optionGroup._id) }
    );
  };

  return (
    // No es un <form>: está adentro del formulario del producto. Enter crea el grupo (no guarda el producto).
    <div
      className="space-y-3 rounded-xl border border-line bg-paper p-3"
      onKeyDown={(event) => {
        if (event.key !== "Enter" || !(event.target instanceof HTMLInputElement) || event.target.type === "checkbox") return;
        event.preventDefault();
        save();
      }}
    >
      <Field id="grupo-novo-nome" label={g.name}>
        <input id="grupo-novo-nome" autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder={g.namePlaceholder} className={input} />
      </Field>
      {similar.length > 0 && (
        <div role="status" className="rounded-lg bg-[#fff4d6] p-3 text-[#7a4e00] ring-1 ring-inset ring-[#f0d48a]">
          <p className="text-sm font-bold">{g.similar}</p>
          <ul className="mt-2 space-y-2">
            {similar.map((group) => (
              <li key={group._id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{group.name}</span>
                  <span className="block truncate text-sm">{optionsLine(group)}</span>
                </span>
                <button type="button" onClick={() => onUse(group._id)} className={button.secondary}>
                  {g.useExisting}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <fieldset className="min-w-0 space-y-2">
        <legend className="mb-1 font-bold">{t.menuAdmin.fields.options}</legend>
        {options.map((option, index) => (
          <div key={index} className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
            <input
              aria-label={g.optionName(index + 1)}
              placeholder={g.optionName(index + 1)}
              value={option.name}
              maxLength={60}
              onChange={(e) => setOptions((rows) => rows.map((row, i) => (i === index ? { ...row, name: e.target.value } : row)))}
              className={input}
            />
            <input
              aria-label={g.optionPrice(index + 1)}
              placeholder="0,00"
              inputMode="decimal"
              value={option.price}
              onChange={(e) => setOptions((rows) => rows.map((row, i) => (i === index ? { ...row, price: e.target.value } : row)))}
              className={input}
            />
          </div>
        ))}
        <button type="button" onClick={() => setOptions((rows) => [...rows, { name: "", price: "" }])} className={button.quiet}>
          <Plus aria-hidden className="size-4" />
          {t.menuAdmin.fields.addOption}
        </button>
      </fieldset>
      <label className="flex min-h-11 items-center gap-2">
        <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} className="size-5 accent-(--brand)" />
        {g.required}
      </label>
      {(error || create.error) && <Notice tone="error">{error || errorText(create.error, t)}</Notice>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onCancel} className={button.secondary}>
          {g.cancel}
        </button>
        <button type="button" disabled={create.isPending} onClick={save} className={`${button.primary} grow`}>
          {g.createAndAdd}
        </button>
      </div>
    </div>
  );
}

// Los grupos de un producto: los elegidos en su orden (subir, bajar, sacar), un buscador
// para sumar los que ya existen y "Criar grupo" ahí mismo.
export function GroupPicker({ groups, selected, onChange }: { groups: OptionGroup[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const t = useT();
  const g = t.groups;
  const f = t.menuAdmin.fields;
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const chosen = selected.map((id) => groups.find((group) => group._id === id)).filter((group): group is OptionGroup => Boolean(group));
  const rest = groups.filter((group) => !selected.includes(group._id));
  const found = rest.filter((group) => matchesSearch(`${group.name} ${group.options.map((option) => option.name).join(" ")}`, search));

  const move = (index: number, step: -1 | 1) => {
    const next = [...selected];
    [next[index], next[index + step]] = [next[index + step], next[index]];
    onChange(next);
  };
  const add = (id: string) => {
    if (!selected.includes(id)) onChange([...selected, id]);
    setSearch("");
  };

  return (
    <fieldset className="min-w-0 space-y-3">
      <legend className="font-bold">{f.optionGroups}</legend>
      <p className="-mt-2 text-sm text-ink-muted">{f.optionGroupsHint}</p>

      {chosen.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line p-3 text-sm text-ink-muted">{g.none}</p>
      ) : (
        <ol className="divide-y divide-line rounded-xl border border-line">
          {chosen.map((group, index) => (
            <li key={group._id} className="flex items-center gap-1 py-1 pr-1 pl-3">
              <span className="min-w-0 flex-1 py-1">
                <span className="block font-bold">
                  {group.name} <span className="text-sm font-normal text-ink-muted">({t.menuAdmin.rule(group.minSelect, group.maxSelect)})</span>
                </span>
                <span className="block truncate text-sm text-ink-muted">{optionsLine(group)}</span>
              </span>
              <button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={g.moveUp(group.name)} title={g.moveUp(group.name)} className={iconButton}>
                <ArrowUp aria-hidden className="size-4" />
              </button>
              <button
                type="button"
                disabled={index === chosen.length - 1}
                onClick={() => move(index, 1)}
                aria-label={g.moveDown(group.name)}
                title={g.moveDown(group.name)}
                className={iconButton}
              >
                <ArrowDown aria-hidden className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => onChange(selected.filter((id) => id !== group._id))}
                aria-label={g.remove(group.name)}
                title={g.remove(group.name)}
                className={iconButton}
              >
                <X aria-hidden className="size-4" />
              </button>
            </li>
          ))}
        </ol>
      )}

      {creating ? (
        <NewGroup
          groups={groups}
          onCancel={() => setCreating(false)}
          onUse={(id) => {
            add(id);
            setCreating(false);
          }}
          onCreated={(id) => {
            add(id);
            setCreating(false);
          }}
        />
      ) : (
        <div className="space-y-2">
          {rest.length > 0 && (
            <>
              <label className="relative block">
                <span className="sr-only">{g.search}</span>
                <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-ink-muted" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  // Enter suma el primero que aparece (y no guarda el producto).
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    if (search.trim() && found[0]) add(found[0]._id);
                  }}
                  placeholder={g.search}
                  className={`${input} pl-10`}
                />
              </label>
              {found.length === 0 ? (
                <p className="text-sm text-ink-muted">{g.noResults}</p>
              ) : (
                <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-xl border border-line">
                  {found.map((group) => (
                    <li key={group._id}>
                      <button type="button" onClick={() => add(group._id)} aria-label={g.add(group.name)} className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left hover:bg-paper">
                        <Plus aria-hidden className="size-5 shrink-0 text-ink-muted" />
                        <span className="min-w-0 flex-1">
                          <span className="block font-bold">
                            {group.name} <span className="text-sm font-normal text-ink-muted">({t.menuAdmin.rule(group.minSelect, group.maxSelect)})</span>
                          </span>
                          <span className="block truncate text-sm text-ink-muted">{optionsLine(group)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {groups.length > 0 && rest.length === 0 && <p className="text-sm text-ink-muted">{g.allAdded}</p>}
          <button type="button" onClick={() => setCreating(true)} className={button.secondary}>
            <Plus aria-hidden className="size-4" />
            {g.create}
          </button>
        </div>
      )}
    </fieldset>
  );
}
