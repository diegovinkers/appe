import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { type ApiError, api } from "../../../api/client";
import type { OwnerReview, OwnerReviewsResponse } from "../../../api/types";
import { can } from "../../../auth/permissions";
import { Spinner } from "../../../components/FullScreenMessage";
import { PageHeader } from "../../../components/PageHeader";
import { Stars } from "../../../components/Stars";
import { Switch } from "../../../components/ui";
import { errorText, useT } from "../../../i18n";
import { formatDate, formatRating } from "../../../lib/format";
import { usePanel } from "../PanelLayout";

const KEY = ["owner-reviews"];

// Lo que opinaron los clientes. El dueño puede ocultar una reseña del menú (no borrarla).
export function ReviewsPage() {
  const t = useT();
  const { user } = usePanel();
  const queryClient = useQueryClient();
  const canHide = can(user.role, "store:write");
  const query = useQuery({ queryKey: KEY, queryFn: () => api<OwnerReviewsResponse>("/owner/reviews") });

  const toggle = useMutation<{ review: OwnerReview }, ApiError, { id: string; hidden: boolean }>({
    mutationFn: ({ id, hidden }) => api(`/owner/reviews/${id}`, { method: "PATCH", body: { hidden } }),
    onSuccess: () => {
      // El promedio cambia: también el del menú público.
      queryClient.invalidateQueries({ queryKey: KEY });
      queryClient.invalidateQueries({ queryKey: ["public-store"] });
    },
  });

  return (
    <>
      <PageHeader title={t.pages.reviews.title} description={t.pages.reviews.description} />
      {!canHide && <p className="mb-4 rounded-xl bg-surface p-4 text-ink-muted ring-1 ring-line">{t.reviews.staffHint}</p>}
      {query.isPending && <Spinner />}
      {query.isError && <p className="text-error">{t.errors.generic}</p>}
      {toggle.isError && (
        <p role="alert" className="mb-3 font-bold text-error">
          {errorText(toggle.error, t)}
        </p>
      )}
      {query.data && (
        <>
          {query.data.rating.average != null && (
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-line bg-surface p-4">
              <span className="text-4xl font-bold tabular-nums">{formatRating(query.data.rating.average)}</span>
              <span>
                <Stars value={query.data.rating.average} size="size-5" />
                <span className="block text-sm text-ink-muted">{t.reviews.count(query.data.rating.count)}</span>
              </span>
            </div>
          )}
          {query.data.reviews.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line bg-surface p-6 text-ink-muted">{t.reviews.empty}</p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
              {query.data.reviews.map((review) => (
                <li key={review._id} className={`flex flex-wrap items-start gap-3 px-4 py-3 ${review.hidden ? "opacity-60" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2">
                      <Stars value={review.rating} />
                      <span className="sr-only">{t.reviews.stars(review.rating)}</span>
                      <span className="font-bold">{review.customerName}</span>
                      <Link to={`/painel/pedidos?pedido=${review.order}`} className="text-sm underline underline-offset-4">
                        {t.reviews.order(review.orderNumber)}
                      </Link>
                      <span className="text-sm text-ink-muted">{formatDate(review.createdAt)}</span>
                    </p>
                    <p className={`mt-1 whitespace-pre-line ${review.comment ? "" : "text-ink-muted"}`}>{review.comment || t.reviews.noComment}</p>
                  </div>
                  {canHide ? (
                    <Switch
                      checked={!review.hidden}
                      disabled={toggle.isPending}
                      label={t.reviews.visible}
                      onChange={(visible) => toggle.mutate({ id: review._id, hidden: !visible })}
                    />
                  ) : (
                    review.hidden && <span className="text-sm text-ink-muted">{t.reviews.hidden}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
