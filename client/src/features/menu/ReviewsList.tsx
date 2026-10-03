import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { PublicReviewsResponse } from "../../api/types";
import { Spinner } from "../../components/FullScreenMessage";
import { Stars } from "../../components/Stars";
import { useT } from "../../i18n";
import { formatDate, formatRating } from "../../lib/format";

// Las reseñas visibles de un local, más nuevas primero, con la nota promedio arriba.
export function ReviewsList({ slug }: { slug: string }) {
  const t = useT();
  const query = useQuery({
    queryKey: ["public-reviews", slug],
    queryFn: () => api<PublicReviewsResponse>(`/public/stores/${encodeURIComponent(slug)}/reviews`),
  });

  if (query.isPending) {
    return (
      <div className="p-4">
        <Spinner />
      </div>
    );
  }
  if (query.isError) return <p className="p-4 text-error">{t.errors.generic}</p>;

  const { rating, reviews } = query.data;
  return (
    <div className="p-4">
      {rating.average != null && (
        <div className="mb-4 flex items-center gap-3 rounded-xl bg-paper p-4">
          <span className="text-4xl font-bold tabular-nums">{formatRating(rating.average)}</span>
          <span>
            <Stars value={rating.average} size="size-5" />
            <span className="block text-sm text-ink-muted">{t.reviews.count(rating.count)}</span>
          </span>
        </div>
      )}
      {reviews.length === 0 ? (
        <p className="text-ink-muted">{t.reviews.empty}</p>
      ) : (
        <ul className="divide-y divide-line">
          {reviews.map((review, index) => (
            <li key={index} className="py-3">
              <p className="flex flex-wrap items-center gap-x-2">
                <Stars value={review.rating} />
                <span className="sr-only">{t.reviews.stars(review.rating)}</span>
                <span className="font-bold">{review.customerName}</span>
                <span className="text-sm text-ink-muted">{formatDate(review.createdAt)}</span>
              </p>
              {review.comment && <p className="mt-1 whitespace-pre-line">{review.comment}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
