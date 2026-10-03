import { Trash2 } from "lucide-react";
import { Sheet } from "../../components/Sheet";
import { useT } from "../../i18n";
import { formatMoney } from "../../lib/format";
import type { ResolvedLine } from "./lines";
import { Stepper } from "./ProductSheet";

type Props = {
  lines: ResolvedLine[];
  canOrder: boolean;
  onQuantity: (key: string, quantity: number) => void;
  onContinue: () => void;
  onClose: () => void;
};

export function CartSheet({ lines, canOrder, onQuantity, onContinue, onClose }: Props) {
  const t = useT();
  const subtotal = lines.reduce((sum, line) => sum + (line.available ? line.totalCents : 0), 0);
  const blocked = !canOrder || lines.length === 0 || lines.some((line) => !line.available);

  return (
    <Sheet
      open
      title={t.cart.title}
      onClose={onClose}
      footer={
        lines.length > 0 && (
          <div className="space-y-3">
            <p className="flex justify-between text-lg">
              <span>{t.cart.subtotal}</span>
              <span className="font-bold tabular-nums">{formatMoney(subtotal)}</span>
            </p>
            {!canOrder && <p className="text-sm text-error">{t.checkout.closed}</p>}
            <button
              type="button"
              disabled={blocked}
              onClick={onContinue}
              className="h-12 w-full rounded-xl bg-(--brand) font-bold text-(--on-brand) disabled:bg-line disabled:text-ink-muted"
            >
              {t.cart.continue}
            </button>
          </div>
        )
      }
    >
      {lines.length === 0 ? (
        <p className="p-6 text-center text-ink-muted">{t.cart.empty}</p>
      ) : (
        <ul className="divide-y divide-line px-4">
          {lines.map(({ line, product, optionsText, totalCents, available }) => (
            <li key={line.key} className="py-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className={`font-bold ${available ? "" : "text-ink-muted line-through"}`}>{product?.name ?? "—"}</p>
                {available && <p className="shrink-0 font-bold tabular-nums">{formatMoney(totalCents)}</p>}
              </div>
              {optionsText && <p className="text-sm text-ink-muted">{optionsText}</p>}
              {line.notes && <p className="text-sm text-ink-muted">“{line.notes}”</p>}
              {!available && <p className="mt-1 text-sm font-bold text-error">{t.cart.unavailable}</p>}
              <div className="mt-2 flex items-center gap-2">
                {available && (
                  <Stepper label={t.product.quantity} value={line.quantity} min={1} max={50} onChange={(value) => onQuantity(line.key, value)} />
                )}
                <button
                  type="button"
                  onClick={() => onQuantity(line.key, 0)}
                  className="inline-flex h-11 items-center gap-1.5 rounded-lg px-3 text-ink-muted hover:bg-paper hover:text-ink"
                >
                  <Trash2 aria-hidden className="size-4" />
                  {t.cart.remove}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="px-4 pb-4">
        <button type="button" onClick={onClose} className="h-11 font-bold underline underline-offset-4">
          {t.cart.keepShopping}
        </button>
      </div>
    </Sheet>
  );
}
