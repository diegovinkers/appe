import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import type { PublicOptionGroup, PublicProduct } from "../../api/types";
import { type Dictionary, useT } from "../../i18n";
import { formatMoney } from "../../lib/format";
import { Sheet } from "../../components/Sheet";
import { cloudinaryImage } from "../../lib/images";
import { Price } from "./ProductList";
import { type ChosenOption, type Groups, unitPrice, unmetGroups } from "./pricing";

export function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (value: number) => void; label: string }) {
  const t = useT();
  const button = "grid size-11 place-items-center rounded-lg text-ink hover:bg-paper disabled:text-line disabled:hover:bg-transparent";
  return (
    <div role="group" aria-label={label} className="inline-flex items-center rounded-xl border border-line">
      <button type="button" aria-label={t.product.less} disabled={value <= min} onClick={() => onChange(value - 1)} className={button}>
        <Minus aria-hidden className="size-5" />
      </button>
      <span aria-live="polite" className="w-8 text-center font-bold tabular-nums">
        {value}
      </span>
      <button type="button" aria-label={t.product.more} disabled={value >= max} onClick={() => onChange(value + 1)} className={button}>
        <Plus aria-hidden className="size-5" />
      </button>
    </div>
  );
}

function ruleText(group: PublicOptionGroup, t: Dictionary) {
  if (group.minSelect === group.maxSelect) return t.product.chooseExactly(group.maxSelect);
  if (group.minSelect === 0) return t.product.chooseUpTo(group.maxSelect);
  return t.product.chooseBetween(group.minSelect, group.maxSelect);
}

// Las opciones de un grupo: botones de radio si se elige una, casillas si varias, y
// contador si la misma opción puede ir más de una vez ("2x bacon").
function OptionGroup({ group, chosen, onChange }: { group: PublicOptionGroup; chosen: ChosenOption[]; onChange: (picks: ChosenOption[]) => void }) {
  const t = useT();
  const picks = chosen.filter((pick) => pick.groupId === group._id);
  const units = picks.reduce((sum, pick) => sum + pick.quantity, 0);
  const single = group.maxSelect === 1;
  const quantityOf = (optionId: string) => picks.find((pick) => pick.optionId === optionId)?.quantity ?? 0;
  const setQuantity = (optionId: string, quantity: number) =>
    onChange([
      ...picks.filter((pick) => pick.optionId !== optionId),
      ...(quantity > 0 ? [{ groupId: group._id, optionId, quantity }] : []),
    ]);

  return (
    <fieldset className="border-t border-line px-4 py-4">
      <legend className="sr-only">{group.name}</legend>
      <div aria-hidden className="flex items-baseline justify-between gap-3">
        <h3 className="font-bold">{group.name}</h3>
        {group.minSelect > 0 && (
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-sm ${units >= group.minSelect ? "bg-paper text-ink-muted" : "bg-action text-white"}`}>
            {t.product.required}
          </span>
        )}
      </div>
      <p className="text-sm text-ink-muted">{ruleText(group, t)}</p>

      <ul className="mt-2">
        {group.options.map((option) => {
          const quantity = quantityOf(option._id);
          const full = units >= group.maxSelect;
          const price = option.priceCents > 0 ? `+ ${formatMoney(option.priceCents)}` : "";
          const disabled = !option.available;
          const text = (
            <>
              <span className={`flex-1 ${disabled ? "text-ink-muted" : ""}`}>
                {option.name}
                {disabled && <span className="ml-2 text-sm font-bold text-error">{t.menu.soldOut}</span>}
              </span>
              {price && <span className="text-ink-muted tabular-nums">{price}</span>}
            </>
          );

          if ((option.maxQuantity ?? 1) > 1) {
            return (
              <li key={option._id} className="flex min-h-13 items-center gap-3">
                {text}
                <Stepper
                  label={option.name}
                  value={quantity}
                  min={0}
                  max={disabled ? 0 : Math.min(option.maxQuantity ?? 1, quantity + group.maxSelect - units)}
                  onChange={(value) => setQuantity(option._id, value)}
                />
              </li>
            );
          }
          return (
            <li key={option._id}>
              <label className={`flex min-h-13 items-center gap-3 ${disabled ? "" : "cursor-pointer"}`}>
                <input
                  type={single ? "radio" : "checkbox"}
                  name={`grupo-${group._id}`}
                  checked={quantity > 0}
                  disabled={disabled || (!single && full && quantity === 0)}
                  onChange={(event) =>
                    single
                      ? onChange([{ groupId: group._id, optionId: option._id, quantity: 1 }])
                      : setQuantity(option._id, event.target.checked ? 1 : 0)
                  }
                  className="size-5 shrink-0 accent-(--brand)"
                />
                {text}
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

type Props = {
  product: PublicProduct;
  groups: Groups;
  canOrder: boolean;
  onAdd: (quantity: number, options: ChosenOption[], notes: string) => void;
};

function useProductChoice(product: PublicProduct, groups: Groups) {
  const [chosen, setChosen] = useState<ChosenOption[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const missing = unmetGroups(product, groups, chosen);
  const totalCents = unitPrice(product, groups, chosen) * quantity;
  return { chosen, setChosen, quantity, setQuantity, notes, setNotes, missing, totalCents };
}

function ProductSheetBody({ product, groups, choice }: Pick<Props, "product" | "groups"> & { choice: ReturnType<typeof useProductChoice> }) {
  const t = useT();
  const productGroups = product.optionGroups.map((id) => groups.get(id)).filter((group): group is PublicOptionGroup => !!group);
  return (
    <>
      {product.imageUrl && (
        <img src={cloudinaryImage(product.imageUrl, 800, 600)} alt="" className="aspect-[4/3] w-full bg-paper object-cover" />
      )}
      <div className="space-y-2 p-4">
        {product.description && <p className="leading-relaxed text-ink-muted">{product.description}</p>}
        <p className="text-lg">
          <Price product={product} />
        </p>
      </div>
      {productGroups.map((group) => (
        <OptionGroup
          key={group._id}
          group={group}
          chosen={choice.chosen}
          onChange={(picks) => choice.setChosen((all) => [...all.filter((pick) => pick.groupId !== group._id), ...picks])}
        />
      ))}
      <div className="border-t border-line p-4">
        <label htmlFor="observacao" className="font-bold">
          {t.product.notes}
        </label>
        <textarea
          id="observacao"
          rows={2}
          maxLength={140}
          value={choice.notes}
          onChange={(event) => choice.setNotes(event.target.value)}
          placeholder={t.product.notesHint}
          className="mt-2 block w-full rounded-lg border border-line bg-surface px-3 py-2"
        />
      </div>
    </>
  );
}

function ProductSheetFooter({ canOrder, onAdd, choice }: Pick<Props, "canOrder" | "onAdd"> & { choice: ReturnType<typeof useProductChoice> }) {
  const t = useT();
  const blocked = !canOrder || choice.missing.length > 0;
  return (
    <div className="space-y-2">
      {canOrder && choice.missing.length > 0 && (
        <p className="text-sm text-ink-muted">{t.product.missing(choice.missing.map((group) => group.name).join(", "))}</p>
      )}
      <div className="flex items-center gap-3">
        <Stepper label={t.product.quantity} value={choice.quantity} min={1} max={50} onChange={choice.setQuantity} />
        <button
          type="button"
          disabled={blocked}
          onClick={() => onAdd(choice.quantity, choice.chosen, choice.notes)}
          className="h-12 min-w-0 flex-1 rounded-xl bg-(--brand) px-4 font-bold text-(--on-brand) disabled:bg-line disabled:text-ink-muted"
        >
          {canOrder ? t.product.add(formatMoney(choice.totalCents)) : t.product.closed}
        </button>
      </div>
    </div>
  );
}

// La hoja de un producto. La página la monta con key por producto, así cada uno
// empieza sin nada elegido.
export function ProductSheet({ onClose, ...props }: Props & { onClose: () => void }) {
  const choice = useProductChoice(props.product, props.groups);
  return (
    <Sheet open title={props.product.name} onClose={onClose} footer={<ProductSheetFooter {...props} choice={choice} />}>
      <ProductSheetBody {...props} choice={choice} />
    </Sheet>
  );
}
