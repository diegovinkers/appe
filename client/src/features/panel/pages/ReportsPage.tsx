import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../../api/client";
import { PageHeader } from "../../../components/PageHeader";
import { Spinner } from "../../../components/FullScreenMessage";
import { button, Field, input } from "../../../components/ui";
import { errorText, useLanguage, useT } from "../../../i18n";
import { todayISO, formatMoney } from "../../../lib/format";
import type { ReportResponse } from "../../platform/businessTypes";

export function ReportsPage() {
  const es = useLanguage() === "es"; const t = useT(); const today = todayISO();
  const [range, setRange] = useState({ from: `${today.slice(0, 7)}-01`, to: today }); const [form, setForm] = useState(range);
  const query = useQuery({ queryKey: ["reports", range], queryFn: () => api<ReportResponse>(`/owner/reports?${new URLSearchParams(range)}`) });
  return <><PageHeader title={es ? "Reportes" : "Relatórios"} description={es ? "Pedidos completados, agrupados por la fecha de creación en el horario de Brasilia." : "Pedidos concluídos, agrupados pela data de criação no horário de Brasília."} />
    <form className="mb-5 flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); setRange(form); }}>
      <Field id="report-from" label={es ? "Desde" : "De"}><input id="report-from" type="date" className={input} required value={form.from} max={form.to} onChange={(e) => setForm({ ...form, from: e.target.value })} /></Field><Field id="report-to" label={es ? "Hasta" : "Até"}><input id="report-to" type="date" className={input} required value={form.to} min={form.from} max={today} onChange={(e) => setForm({ ...form, to: e.target.value })} /></Field><button className={button.primary}>{es ? "Consultar" : "Consultar"}</button>
    </form>
    <p className="mb-4 text-sm text-ink-muted">{es ? "Importes de pedidos, no confirmaciones de dinero cobrado. Las ventas incluyen envío y descuentos; los productos muestran su importe antes de cupones. Los cancelados se excluyen de las ventas." : "Valores dos pedidos, não confirmações de dinheiro recebido. As vendas incluem entrega e descontos; os produtos mostram o valor antes dos cupons. Cancelados não entram nas vendas."}</p>
    {query.isPending && <Spinner />}{query.isError && <div role="alert">{errorText(query.error, t)} <button className={button.secondary} onClick={() => void query.refetch()}>{t.errors.retry}</button></div>}
    {query.data && <><dl className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">{[[es ? "Completados" : "Concluídos", query.data.completed], [es ? "Ventas" : "Vendas", formatMoney(query.data.salesCents)], [es ? "Ticket promedio" : "Ticket médio", formatMoney(query.data.averageCents)], ["Cancelados", query.data.cancelled]].map(([label, value]) => <div key={label} className="rounded-xl border border-line bg-surface p-4"><dt className="text-sm text-ink-muted">{label}</dt><dd className="mt-2 text-xl font-bold">{value}</dd></div>)}</dl>
      <section className="rounded-xl border border-line bg-surface p-4"><h2 className="font-bold">{es ? "Los 20 productos más vendidos" : "Os 20 produtos mais vendidos"}</h2>{!query.data.products.length ? <p className="mt-3 text-ink-muted">{es ? "Sin pedidos completados en este período." : "Sem pedidos concluídos neste período."}</p> : <ul className="mt-3 divide-y divide-line">{query.data.products.map((p) => <li key={p.productId} className="flex justify-between gap-3 py-3"><span>{p.name} · {p.quantity} un.</span><span className="font-bold">{formatMoney(p.totalCents)}</span></li>)}</ul>}</section>
      <section className="mt-5 rounded-xl border border-line bg-surface p-4"><h2 className="font-bold">{es ? "Origen de los pedidos completados" : "Origem dos pedidos concluídos"}</h2><p className="mt-1 text-sm text-ink-muted">{es ? "Origen registrado por el navegador al hacer el pedido. Los pedidos antiguos o manuales figuran sin identificar." : "Origem registrada pelo navegador ao fazer o pedido. Pedidos antigos ou manuais aparecem sem identificação."}</p><ul className="mt-3 divide-y divide-line">{query.data.sources.map((source) => <li key={source.source} className="flex justify-between gap-3 py-3"><span>{source.source === "directory" ? es ? "Directorio" : "Diretório" : source.source === "direct" ? es ? "Enlace directo" : "Link direto" : es ? "Sin identificar" : "Sem identificação"} · {source.count}</span><span>{formatMoney(source.salesCents)}</span></li>)}</ul></section>
    </>}
  </>;
}
