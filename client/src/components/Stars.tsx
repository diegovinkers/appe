import { Star } from "lucide-react";
import { type KeyboardEvent, useRef } from "react";
import type { Rating } from "../api/types";
import { useT } from "../i18n";
import { formatRating } from "../lib/format";

const NOTES = [1, 2, 3, 4, 5];

// Estrellas de solo lectura. Van siempre con la nota escrita al lado (para quien no ve el color).
export function Stars({ value, size = "size-4" }: { value: number; size?: string }) {
  return (
    <span aria-hidden className="inline-flex shrink-0">
      {NOTES.map((note) => (
        <Star key={note} className={`${size} ${note <= Math.round(value) ? "fill-star text-star" : "text-line"}`} />
      ))}
    </span>
  );
}

// "★ 4,8 (23 avaliações)": la nota de un local. Sin reseñas no muestra nada.
export function RatingSummary({ rating, compact = false }: { rating: Rating; compact?: boolean }) {
  const t = useT();
  if (!rating.count || rating.average == null) return null;
  const value = formatRating(rating.average);
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <Star aria-hidden className="size-4 fill-star text-star" />
      <span className="sr-only">
        {t.reviews.average(value)}, {t.reviews.count(rating.count)}
      </span>
      <span aria-hidden className="font-bold">
        {value}
      </span>
      <span aria-hidden className="text-ink-muted">
        ({compact ? rating.count : t.reviews.count(rating.count)})
      </span>
    </span>
  );
}

// Elegir de 1 a 5 estrellas: con el dedo, el mouse o las flechas del teclado (grupo de radio).
export function StarInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const t = useT();
  const group = useRef<HTMLDivElement>(null);
  const move = (event: KeyboardEvent) => {
    const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const next = Math.min(5, Math.max(1, (value || 0) + step));
    onChange(next);
    group.current?.querySelector<HTMLButtonElement>(`[data-note="${next}"]`)?.focus();
  };

  return (
    <div>
      <div ref={group} role="radiogroup" aria-label={t.reviews.starsLabel} onKeyDown={move} className="flex gap-1">
        {NOTES.map((note) => (
          <button
            key={note}
            type="button"
            role="radio"
            data-note={note}
            aria-checked={value === note}
            aria-label={`${t.reviews.stars(note)}: ${t.reviews.meaning[note - 1]}`}
            // Una sola parada de Tab en el grupo: la elegida, o la primera si no hay.
            tabIndex={value === note || (!value && note === 1) ? 0 : -1}
            onClick={() => onChange(note)}
            className="grid size-12 place-items-center rounded-lg hover:bg-paper"
          >
            <Star aria-hidden className={`size-9 ${note <= value ? "fill-star text-star" : "text-ink-muted"}`} />
          </button>
        ))}
      </div>
      <p aria-hidden className="mt-1 h-5 text-sm font-bold text-ink-muted">
        {value ? t.reviews.meaning[value - 1] : ""}
      </p>
    </div>
  );
}
