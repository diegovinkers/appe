import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../api/client";
import { Spinner } from "../../components/FullScreenMessage";
import { button } from "../../components/ui";
import { useLanguage, useT, errorText } from "../../i18n";
import { formatDate, formatMoney } from "../../lib/format";
import { centsToInput } from "../../lib/money";
import { newUuid } from "../../lib/id";
import { deliveryCents } from "../panel/settings/delivery";
import { BusinessForm } from "./BusinessForm";
import type { SubscriptionResponse } from "./businessTypes";

export function SubscriptionView({ commerceId, onBack }: { commerceId?: string; onBack?: () => void }) {
  const es = useLanguage() === "es"; const t = useT(); const cache = useQueryClient();
  const tx = (pt: string, spanish: string) => es ? spanish : pt;
  const [mode, setMode] = useState<"view" | "edit" | "payment">("view"); const [reference, setReference] = useState(newUuid);
  const path = commerceId ? `/admin/commerces/${commerceId}/subscription` : "/owner/subscription";
  const key = ["subscription", commerceId ?? "owner"];
  const query = useQuery({ queryKey: key, queryFn: () => api<SubscriptionResponse>(path) });
  if (query.isPending) return <Spinner />;
  if (query.isError) return <div role="alert">{errorText(query.error, t)} <button className={button.secondary} onClick={() => void query.refetch()}>{t.errors.retry}</button></div>;
  const s = query.data.subscription;
  function amount(value: string, positive = false) { const cents = deliveryCents(value); if (cents == null || (positive && cents === 0)) throw new Error(tx("Valor inválido.", "Importe inválido.")); return cents; }
  const saved = (data: unknown) => { cache.setQueryData(key, data); setMode("view"); setReference(newUuid()); };
  if (mode === "edit" && commerceId) return <BusinessForm title={tx("Configurar assinatura", "Configurar suscripción")} path={path} method="PUT" initial={{ plan: s.plan, price: centsToInput(s.priceCents), dueDate: s.dueDate ?? "", status: s.status }} fields={[
    { key: "plan", label: tx("Plano", "Plan"), required: true, maxLength: 60 }, { key: "price", label: tx("Mensalidade (R$)", "Mensualidad (R$)"), required: true }, { key: "dueDate", label: tx("Vencimento", "Vencimiento"), type: "date" }, { key: "status", label: "Estado", options: [{ value: "trial", label: tx("Teste", "Prueba") }, { value: "active", label: tx("Ativa", "Activa") }, { value: "cancelled", label: "Cancelada" }] },
  ]} body={(d) => ({ plan: d.plan, priceCents: amount(d.price), dueDate: d.dueDate || null, status: d.status })} onSaved={saved} onBack={() => setMode("view")} />;
  if (mode === "payment" && commerceId) return <BusinessForm title={tx("Registrar pagamento recebido", "Registrar pago recibido")} path={`${path}/payments`} method="POST" initial={{ amount: centsToInput(s.priceCents), period: "", paidAt: "", note: "" }} fields={[
    { key: "amount", label: tx("Valor (R$)", "Importe (R$)"), required: true }, { key: "period", label: tx("Competência", "Mes abonado"), required: true, type: "month" }, { key: "paidAt", label: tx("Data do pagamento", "Fecha de pago"), required: true, type: "date" }, { key: "note", label: tx("Observação", "Observación"), maxLength: 200 },
  ]} body={(d) => ({ reference, amountCents: amount(d.amount, true), paidAt: `${d.paidAt}T00:00:00-03:00`, period: d.period, note: d.note })} confirm={tx("Confirma o recebimento? O vencimento não será alterado automaticamente.", "¿Confirmás la recepción del pago? El vencimiento no cambiará automáticamente.")} onSaved={saved} onBack={() => setMode("view")} />;
  return <div className="space-y-5">
    {onBack && <button className={button.secondary} onClick={onBack}>{tx("Voltar", "Volver")}</button>}
    <div className="rounded-xl border border-line bg-surface p-5"><h2 className="text-xl font-bold">{s.plan} · {formatMoney(s.priceCents)}/{tx("mês", "mes")}</h2><p>{s.status === "trial" ? tx("Teste", "Prueba") : s.status === "active" ? tx("Ativa", "Activa") : "Cancelada"} · {s.dueDate ?? tx("Sem vencimento definido", "Sin vencimiento definido")}</p>{s.overdue && <p className="text-warning">{tx("Vencimento passado: confira os pagamentos registrados.", "Vencimiento pasado: revisá los pagos registrados.")}</p>}<p className="mt-2 text-sm text-ink-muted">{tx("Assinatura da plataforma, separada dos pagamentos dos seus clientes. Não suspende a loja automaticamente.", "Suscripción a la plataforma, separada de los pagos de tus clientes. No suspende el comercio automáticamente.")}</p></div>
    {commerceId && <div className="flex flex-wrap gap-3"><button className={button.secondary} onClick={() => setMode("edit")}>{tx("Configurar assinatura", "Configurar suscripción")}</button><button className={button.primary} onClick={() => setMode("payment")}>{tx("Registrar pagamento", "Registrar pago")}</button></div>}
    <section className="rounded-xl border border-line bg-surface p-4"><h2 className="mb-3 font-bold">{tx("Histórico de pagamentos", "Historial de pagos")}</h2>{!s.payments.length ? <p className="text-ink-muted">{tx("Nenhum pagamento registrado.", "Todavía no hay pagos registrados.")}</p> : <ul className="divide-y divide-line">{[...s.payments].reverse().map((p) => <li key={p.reference} className="py-3"><p className="font-bold">{p.period} · {formatMoney(p.amountCents)}</p><p className="text-sm text-ink-muted">{formatDate(p.paidAt)}</p>{p.note && <p>{p.note}</p>}</li>)}</ul>}</section>
  </div>;
}
