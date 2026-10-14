import { useQuery } from "@tanstack/react-query";
import { CircleAlert, Printer } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { Link } from "react-router";
import { api } from "../../../api/client";
import { Spinner } from "../../../components/FullScreenMessage";
import { PageHeader } from "../../../components/PageHeader";
import { Field, button, input } from "../../../components/ui";
import { errorText, useT } from "../../../i18n";
import { formatDay, formatMoney, operatingDayISO } from "../../../lib/format";
import type { ReportResponse } from "../../platform/businessTypes";

type Range = { from: string; to: string };
type Preset = "today" | "yesterday" | "week" | "month";

// "2026-10-14" + n días, sin depender de la zona de la PC.
const shift = (day: string, days: number) => new Date(Date.parse(`${day}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

function presetRange(preset: Preset, today: string): Range {
  if (preset === "yesterday") return { from: shift(today, -1), to: shift(today, -1) };
  if (preset === "week") return { from: shift(today, -6), to: today };
  if (preset === "month") return { from: `${today.slice(0, 8)}01`, to: today };
  return { from: today, to: today };
}

function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4 sm:p-5 print:break-inside-avoid print:border-black">
      <h2 className="font-bold">{title}</h2>
      {hint && <p className="mt-0.5 text-sm text-ink-muted">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

// Filas de una tabla de dos o tres columnas (nombre · pedidos · valor), con el total abajo.
function Rows({ rows, total }: { rows: { label: string; count?: number; cents: number; sign?: "-" }[]; total?: { label: string; cents: number } }) {
  return (
    <table className="w-full text-left tabular-nums">
      <tbody className="divide-y divide-line">
        {rows.map((row) => (
          <tr key={row.label}>
            <th scope="row" className="py-2.5 pr-3 font-normal">
              {row.label}
            </th>
            <td className="py-2.5 pr-3 text-right text-ink-muted">{row.count ?? ""}</td>
            <td className="py-2.5 text-right font-bold">
              {row.cents > 0 && row.sign}
              {formatMoney(row.cents)}
            </td>
          </tr>
        ))}
      </tbody>
      {total && (
        <tfoot>
          <tr className="border-t-2 border-ink">
            <th scope="row" className="pt-3 text-lg font-bold">
              {total.label}
            </th>
            <td />
            <td className="pt-3 text-right text-lg font-bold">{formatMoney(total.cents)}</td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}

// Relatórios: el cierre de caja del día (por forma de pago) y las ventas de un período.
export function ReportsPage() {
  const t = useT();
  const c = t.reports;
  const today = operatingDayISO();
  const [preset, setPreset] = useState<Preset | null>("today");
  const [range, setRange] = useState<Range>(() => presetRange("today", today));
  const [form, setForm] = useState<Range>(range);
  const query = useQuery({ queryKey: ["reports", range], queryFn: () => api<ReportResponse>(`/owner/reports?${new URLSearchParams(range)}`) });
  // Con el backend anterior (unos minutos durante un despliegue) faltan los campos del cierre.
  const raw = query.data;
  const data = raw && {
    ...raw,
    open: raw.open ?? { count: 0, salesCents: 0 },
    payments: raw.payments ?? [],
    fulfillment: raw.fulfillment ?? [],
    days: raw.days ?? [],
    subtotalCents: raw.subtotalCents ?? 0,
    deliveryFeeCents: raw.deliveryFeeCents ?? 0,
    discountCents: raw.discountCents ?? 0,
  };

  const choose = (value: Preset) => {
    const next = presetRange(value, today);
    setPreset(value);
    setRange(next);
    setForm(next);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setPreset(null);
    setRange(form);
  };
  const methodOrder = ["cash", "pix", "card"] as const;

  return (
    <>
      <PageHeader
        title={t.pages.reports.title}
        description={t.pages.reports.description}
        actions={
          <button type="button" className={`${button.secondary} print:hidden`} onClick={() => window.print()} disabled={!data}>
            <Printer aria-hidden className="size-5" />
            {c.print}
          </button>
        }
      />

      <div className="mb-5 space-y-3 print:hidden">
        <div role="group" aria-label={c.period(formatDay(range.from), formatDay(range.to))} className="flex flex-wrap gap-2">
          {(["today", "yesterday", "week", "month"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={preset === value}
              onClick={() => choose(value)}
              className={`h-11 rounded-full px-4 text-sm ${preset === value ? "bg-action font-bold text-white" : "bg-surface ring-1 ring-line hover:bg-paper"}`}
            >
              {c[value]}
            </button>
          ))}
        </div>
        <form className="flex flex-wrap items-end gap-3" onSubmit={submit}>
          <Field id="report-from" label={c.from}>
            <input id="report-from" type="date" className={input} required value={form.from} max={form.to} onChange={(e) => setForm({ ...form, from: e.target.value })} />
          </Field>
          <Field id="report-to" label={c.to}>
            <input id="report-to" type="date" className={input} required value={form.to} min={form.from} max={today} onChange={(e) => setForm({ ...form, to: e.target.value })} />
          </Field>
          <button className={button.secondary}>{c.apply}</button>
        </form>
      </div>

      <p className="mb-4 font-bold">{c.period(formatDay(range.from), formatDay(range.to))}</p>
      {query.isPending && <Spinner />}
      {query.isError && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-error">
          {errorText(query.error, t)}
          <button type="button" className={button.secondary} onClick={() => void query.refetch()}>
            {t.errors.retry}
          </button>
        </div>
      )}

      {data && (
        <div className="space-y-5">
          {data.open.count > 0 && (
            <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl bg-[#fff4d6] p-4 text-[#7a4e00] ring-1 ring-[#f0d48a]">
              <CircleAlert aria-hidden className="size-5 shrink-0" />
              <p className="min-w-48 flex-1 font-bold">{c.open(data.open.count, formatMoney(data.open.salesCents))}</p>
              <Link to="/painel/pedidos" className={`${button.secondary} print:hidden`}>
                {c.closeThem}
              </Link>
            </div>
          )}

          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              [c.sales, formatMoney(data.salesCents)],
              [c.orders, data.completed],
              [c.average, formatMoney(data.averageCents)],
              [c.cancelled, data.cancelled],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-line bg-surface p-4">
                <dt className="text-sm text-ink-muted">{label}</dt>
                <dd className="mt-1 text-2xl font-bold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>

          {!data.completed ? (
            <p className="rounded-xl border border-dashed border-line bg-surface p-6 text-ink-muted">{c.empty}</p>
          ) : (
            <>
              <Card title={c.cashTitle} hint={c.cashHint}>
                <Rows
                  rows={methodOrder.map((method) => {
                    const entry = data.payments.find((item) => item.method === method);
                    return { label: c.methods[method], count: entry?.count ?? 0, cents: entry?.salesCents ?? 0 };
                  })}
                  total={{ label: c.total, cents: data.salesCents }}
                />
                <div className="mt-5 border-t border-line pt-2">
                  <Rows
                    rows={[
                      { label: c.products, cents: data.subtotalCents },
                      { label: c.deliveryFees, cents: data.deliveryFeeCents },
                      { label: c.discounts, cents: data.discountCents, sign: "-" },
                    ]}
                  />
                </div>
              </Card>

              <div className="grid gap-5 lg:grid-cols-2">
                <Card title={c.fulfillmentTitle}>
                  <Rows
                    rows={data.fulfillment.map((item) => ({ label: c.fulfillment[item.type], count: item.count, cents: item.salesCents }))}
                  />
                </Card>
                {data.days.length > 1 && (
                  <Card title={c.daysTitle}>
                    <Rows rows={data.days.map((item) => ({ label: formatDay(item.day), count: item.count, cents: item.salesCents }))} />
                  </Card>
                )}
              </div>

              <Card title={c.topTitle} hint={c.topHint}>
                <Rows rows={data.products.map((item) => ({ label: `${item.name} · ${c.units(item.quantity)}`, cents: item.totalCents }))} />
              </Card>
              <Card title={c.sourcesTitle}>
                <Rows rows={data.sources.map((item) => ({ label: c.sources[item.source], count: item.count, cents: item.salesCents }))} />
              </Card>
            </>
          )}
        </div>
      )}
    </>
  );
}
