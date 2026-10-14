import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Minus, Plus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { type ApiError, api } from "../../../api/client";
import type { SalonTable, TablesResponse } from "../../../api/types";
import { Spinner } from "../../../components/FullScreenMessage";
import { Notice } from "../../../components/Notice";
import { PageHeader } from "../../../components/PageHeader";
import { Field, Switch, button, input } from "../../../components/ui";
import { errorText, useT } from "../../../i18n";
import { FloorPlan } from "../salon/FloorPlan";

export const tablesKey = ["tables"];

// Configurações → Salão: las mesas en su lugar. Se agregan con un toque (quedan ordenadas solas)
// y después se arrastran a donde están de verdad.
export function SalonPage() {
  const t = useT();
  const c = t.salon;
  const cache = useQueryClient();
  const query = useQuery({ queryKey: tablesKey, queryFn: () => api<TablesResponse>("/owner/tables") });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const refresh = () => void cache.invalidateQueries({ queryKey: tablesKey });

  const create = useMutation<{ table: SalonTable }, ApiError>({
    mutationFn: () => api("/owner/tables", { method: "POST", body: {} }),
    onSuccess: ({ table }) => {
      refresh();
      setSelectedId(table._id);
    },
  });
  // Al soltar una mesa se ve en su lugar nuevo enseguida; si el servidor no la acepta, vuelve.
  const move = useMutation<unknown, ApiError, { id: string; x: number; y: number }, TablesResponse | undefined>({
    mutationFn: ({ id, x, y }) => api("/owner/tables/layout", { method: "PUT", body: { positions: [{ id, x, y }] } }),
    onMutate: ({ id, x, y }) => {
      const previous = cache.getQueryData<TablesResponse>(tablesKey);
      if (previous) cache.setQueryData(tablesKey, { tables: previous.tables.map((table) => (table._id === id ? { ...table, x, y } : table)) });
      return previous;
    },
    onError: (_error, _vars, previous) => previous && cache.setQueryData(tablesKey, previous),
    onSettled: refresh,
  });
  const reactivate = useMutation<unknown, ApiError, string>({
    mutationFn: (id) => api(`/owner/tables/${id}`, { method: "PATCH", body: { active: true } }),
    onSuccess: refresh,
  });

  const tables = query.data?.tables ?? [];
  const active = tables.filter((table) => table.active);
  const inactive = tables.filter((table) => !table.active);
  const selected = tables.find((table) => table._id === selectedId) ?? null;
  const failure = create.error ?? move.error ?? reactivate.error;

  return (
    <>
      <PageHeader
        title={t.pages.salon.title}
        description={t.pages.salon.description}
        actions={
          <button type="button" className={button.primary} disabled={create.isPending} onClick={() => create.mutate()}>
            <Plus aria-hidden className="size-5" />
            {c.add}
          </button>
        }
      />
      {failure && (
        <div className="mb-4">
          <Notice tone="error">{errorText(failure, t)}</Notice>
        </div>
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
      {query.data &&
        (tables.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line bg-surface p-6 text-ink-muted">{c.empty}</p>
        ) : (
          <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="min-w-0 space-y-3">
              <p className="text-sm text-ink-muted">{c.hint}</p>
              <FloorPlan
                tables={active}
                label={c.planLabel}
                selectedId={selectedId}
                onSelect={(table) => setSelectedId(table._id)}
                onMove={(table, x, y) => move.mutate({ id: table._id, x, y })}
                describe={(table) => c.describe(table.number, table.name, table.seats)}
                content={(table) => (
                  <>
                    <span className="text-xl font-bold tabular-nums">{table.number}</span>
                    {table.name && <span className="max-w-full truncate px-1 text-xs text-ink-muted">{table.name}</span>}
                  </>
                )}
              />
              {inactive.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-ink-muted">{c.inactive}:</span>
                  {inactive.map((table) => (
                    <button key={table._id} type="button" className={button.secondary} disabled={reactivate.isPending} onClick={() => reactivate.mutate(table._id)}>
                      {c.reactivate(table.number)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <aside className="rounded-xl border border-line bg-surface p-4 2xl:self-start">
              {selected ? (
                <TableForm key={selected._id} table={selected} onRemoved={() => setSelectedId(null)} onSaved={refresh} />
              ) : (
                <p className="text-ink-muted">{c.pick}</p>
              )}
            </aside>
          </div>
        ))}
    </>
  );
}

function TableForm({ table, onSaved, onRemoved }: { table: SalonTable; onSaved: () => void; onRemoved: () => void }) {
  const t = useT();
  const c = t.salon;
  const [form, setForm] = useState({ number: String(table.number), name: table.name, seats: table.seats, active: table.active });
  const update = useMutation<unknown, ApiError, object>({
    mutationFn: (body) => api(`/owner/tables/${table._id}`, { method: "PATCH", body }),
    onSuccess: onSaved,
  });
  const remove = useMutation<unknown, ApiError>({
    mutationFn: () => api(`/owner/tables/${table._id}`, { method: "DELETE" }),
    onSuccess: () => {
      onSaved();
      onRemoved();
    },
  });
  const change = (next: Partial<typeof form>) => {
    setForm((current) => ({ ...current, ...next }));
    update.reset();
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (update.isPending) return;
    update.mutate({ number: Number(form.number), name: form.name.trim(), seats: form.seats, active: form.active });
  };
  const seats = (value: number) => change({ seats: Math.max(1, Math.min(30, value)) });

  return (
    <form onSubmit={submit} className="space-y-4">
      <h2 className="text-lg font-bold">{c.table(table.number)}</h2>
      <Field id="mesa-numero" label={c.number}>
        <input id="mesa-numero" className={input} inputMode="numeric" required value={form.number} onChange={(e) => change({ number: e.target.value.replace(/\D/g, "").slice(0, 3) })} />
      </Field>
      <Field id="mesa-nome" label={c.name}>
        <input id="mesa-nome" className={input} maxLength={30} placeholder={c.namePlaceholder} value={form.name} onChange={(e) => change({ name: e.target.value })} />
      </Field>
      <div>
        <p className="mb-1.5 font-bold" id="mesa-lugares">
          {c.seatsLabel}
        </p>
        <div className="flex items-center gap-2" role="group" aria-labelledby="mesa-lugares">
          <button type="button" className={button.secondary} aria-label={c.fewer} onClick={() => seats(form.seats - 1)}>
            <Minus aria-hidden className="size-4" />
          </button>
          <span className="min-w-24 text-center font-bold tabular-nums" aria-live="polite">
            {c.seats(form.seats)}
          </span>
          <button type="button" className={button.secondary} aria-label={c.more} onClick={() => seats(form.seats + 1)}>
            <Plus aria-hidden className="size-4" />
          </button>
        </div>
      </div>
      <div>
        <Switch label={c.active} checked={form.active} onChange={(value) => change({ active: value })} />
        <p className="text-sm text-ink-muted">{c.activeHint}</p>
      </div>
      {(update.error ?? remove.error) && <Notice tone="error">{errorText(update.error ?? remove.error, t)}</Notice>}
      {update.isSuccess && (
        <p role="status" className="text-success">
          {c.saved}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button className={button.primary} disabled={update.isPending}>
          {update.isPending ? c.saving : c.save}
        </button>
        <button type="button" className={button.danger} disabled={remove.isPending} onClick={() => window.confirm(c.removeConfirm(table.number)) && remove.mutate()}>
          {c.remove}
        </button>
      </div>
    </form>
  );
}
