import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useState } from "react";
import { type ApiError, api } from "../../../api/client";
import type { AvailabilityResponse } from "../../../api/types";
import { Spinner } from "../../../components/FullScreenMessage";
import { PageHeader } from "../../../components/PageHeader";
import { Switch, button } from "../../../components/ui";
import { errorText, useT } from "../../../i18n";
import { matchesSearch } from "../../../lib/text";

const KEY = ["availability"];
type Tab = "products" | "options";
type Row = { id: string; name: string; detail: string; available: boolean; note?: string; toggle: (available: boolean) => void };

// Lo que está en falta, en un solo lugar y a un toque: productos e ingredientes por nombre
// ("Queijo" en tres grupos es un solo interruptor). Lo usan el dueño y el empleado.
export function AvailabilityPage() {
  const t = useT();
  const c = t.availability;
  const cache = useQueryClient();
  const [tab, setTab] = useState<Tab>("products");
  const [search, setSearch] = useState("");
  const query = useQuery({ queryKey: KEY, queryFn: () => api<AvailabilityResponse>("/owner/availability") });

  // Cualquier cambio también cambia el menú y la lista de productos del panel.
  const refresh = (data?: AvailabilityResponse) => {
    if (data) cache.setQueryData(KEY, data);
    else void cache.invalidateQueries({ queryKey: KEY });
    void cache.invalidateQueries({ queryKey: ["owner-products"] });
    void cache.invalidateQueries({ queryKey: ["owner-option-groups"] });
    void cache.invalidateQueries({ queryKey: ["public-store"] });
  };
  const product = useMutation<unknown, ApiError, { id: string; available: boolean }>({
    mutationFn: ({ id, available }) => api(`/owner/products/${id}/availability`, { method: "PATCH", body: { available } }),
    onSuccess: () => refresh(),
  });
  const option = useMutation<AvailabilityResponse, ApiError, { name: string; available: boolean }>({
    mutationFn: (body) => api("/owner/availability/options", { method: "PATCH", body }),
    onSuccess: refresh,
  });
  const restore = useMutation<AvailabilityResponse, ApiError>({
    mutationFn: () => api("/owner/availability/restore", { method: "POST" }),
    onSuccess: refresh,
  });
  const failure = product.error ?? option.error ?? restore.error;
  const busy = product.isPending || option.isPending || restore.isPending;

  const data = query.data;
  const rows: Row[] =
    data && tab === "products"
      ? data.products.map((item) => ({
          id: item._id,
          name: item.name,
          detail: item.category,
          available: item.available,
          note: item.soldOut ? c.noStock : undefined,
          toggle: (available) => product.mutate({ id: item._id, available }),
        }))
      : (data?.options ?? []).map((item) => ({
          id: item.key,
          name: item.name,
          detail: c.inGroups(item.groups.length, item.groups.map((group) => group.group).join(", ")),
          available: item.available,
          note: !item.available && item.unavailable < item.groups.length ? c.partly(item.unavailable) : undefined,
          toggle: (available) => option.mutate({ name: item.name, available }),
        }));
  const visible = rows.filter((row) => matchesSearch(`${row.name} ${row.detail}`, search));
  const out = visible.filter((row) => !row.available);
  const rest = visible.filter((row) => row.available);
  const anyOut = Boolean(data && (data.products.some((item) => !item.available) || data.options.some((item) => !item.available)));

  const list = (items: Row[]) => (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
      {items.map((row) => (
        <li key={row.id} className="flex min-h-16 items-center gap-3 px-4 py-2">
          <div className="min-w-0 flex-1">
            <p className={`font-bold ${row.available ? "" : "text-ink-muted line-through"}`}>{row.name}</p>
            <p className="truncate text-sm text-ink-muted">
              {row.detail}
              {row.note && <strong className="text-error"> · {row.note}</strong>}
            </p>
          </div>
          <Switch label={`${c.available}: ${row.name}`} showLabel={false} checked={row.available} disabled={busy} onChange={row.toggle} />
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <PageHeader
        title={t.pages.availability.title}
        description={t.pages.availability.description}
        actions={
          anyOut && (
            <button type="button" className={button.secondary} disabled={busy} onClick={() => window.confirm(c.restoreConfirm) && restore.mutate()}>
              {c.restoreAll}
            </button>
          )
        }
      />
      <label className="relative mb-4 block">
        <span className="sr-only">{c.search}</span>
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-muted" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={c.search}
          className="h-11 w-full rounded-lg border border-line bg-surface pl-10 pr-3"
        />
      </label>
      <div role="group" aria-label={t.pages.availability.title} className="mb-5 flex flex-wrap gap-2">
        {(["products", "options"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
            className={`h-11 rounded-full px-4 text-sm ${tab === value ? "bg-action font-bold text-white" : "bg-surface ring-1 ring-line hover:bg-paper"}`}
          >
            {c[value]}
          </button>
        ))}
      </div>

      {failure && (
        <p role="alert" className="mb-3 font-bold text-error">
          {errorText(failure, t)}
        </p>
      )}
      {query.isPending && <Spinner />}
      {query.isError && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-error">
          {errorText(query.error, t)}
          <button type="button" className={button.secondary} onClick={() => void query.refetch()}>
            {t.errors.retry}
          </button>
        </div>
      )}
      {data &&
        (rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line bg-surface p-6 text-ink-muted">{c.empty}</p>
        ) : visible.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line bg-surface p-6 text-ink-muted">{c.noResults}</p>
        ) : (
          <div className="space-y-5">
            <section>
              <h2 className="mb-2 font-bold">{c.outNow(out.length)}</h2>
              {out.length ? list(out) : <p className="rounded-xl border border-dashed border-line bg-surface p-4 text-ink-muted">{c.allAvailable}</p>}
            </section>
            {rest.length > 0 && list(rest)}
          </div>
        ))}
    </>
  );
}
