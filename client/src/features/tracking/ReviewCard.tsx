import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { type ApiError, api } from "../../api/client";
import type { CreateReviewResponse, TrackingResponse } from "../../api/types";
import { StarInput, Stars } from "../../components/Stars";
import { errorText, useT } from "../../i18n";

type Props = { token: string; review: TrackingResponse["review"]; canReview: boolean };

// Después de entregado: "Como foi seu pedido?". Si ya opinó, muestra su reseña.
export function ReviewCard({ token, review, canReview }: Props) {
  const t = useT();
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [justSent, setJustSent] = useState(false);

  const send = useMutation<CreateReviewResponse, ApiError, { rating: number; comment: string }>({
    mutationFn: (body) => api<CreateReviewResponse>(`/public/orders/${encodeURIComponent(token)}/review`, { method: "POST", body }),
    onSuccess: ({ review: saved }) => {
      setJustSent(true);
      queryClient.setQueryData<TrackingResponse>(["tracking", token], (data) => data && { ...data, review: saved, canReview: false });
    },
  });

  if (review) {
    return (
      <section aria-labelledby="sua-avaliacao" className="rounded-2xl bg-surface p-4 ring-1 ring-line">
        {justSent && (
          <p role="status" className="mb-2 text-lg font-bold">
            {t.reviews.thanks}
          </p>
        )}
        <h2 id="sua-avaliacao" className="font-bold">
          {t.reviews.yours}
        </h2>
        <p className="mt-1 flex items-center gap-2">
          <Stars value={review.rating} size="size-5" />
          <span className="text-sm text-ink-muted">
            {t.reviews.stars(review.rating)}: {t.reviews.meaning[review.rating - 1]}
          </span>
        </p>
        {review.comment && <p className="mt-2 whitespace-pre-line">{review.comment}</p>}
      </section>
    );
  }
  if (!canReview) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (rating) send.mutate({ rating, comment: comment.trim() });
  };

  return (
    <form onSubmit={submit} aria-labelledby="avaliar" className="space-y-3 rounded-2xl bg-surface p-4 ring-2 ring-(--brand)">
      <div>
        <h2 id="avaliar" className="text-lg font-bold">
          {t.reviews.ask}
        </h2>
        <p className="text-sm text-ink-muted">{t.reviews.askHint}</p>
      </div>
      <StarInput value={rating} onChange={setRating} />
      <div>
        <label htmlFor="avaliacao-comentario" className="mb-1.5 block font-bold">
          {t.reviews.comment}
        </label>
        <textarea
          id="avaliacao-comentario"
          rows={3}
          maxLength={500}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder={t.reviews.commentHint}
          className="block w-full rounded-lg border border-line bg-surface px-3 py-2"
        />
      </div>
      {send.isError && (
        <p role="alert" className="text-sm font-bold text-error">
          {errorText(send.error, t)}
        </p>
      )}
      <button
        type="submit"
        disabled={!rating || send.isPending}
        className="h-12 w-full rounded-xl bg-(--brand) font-bold text-(--on-brand) disabled:bg-line disabled:text-ink-muted"
      >
        {send.isPending ? t.reviews.sending : t.reviews.send}
      </button>
    </form>
  );
}
