import type { paths } from "../../../api/schema";
import { toBrazilInput } from "../../../lib/format";
import { centsToInput } from "../../../lib/money";

export type OwnerCoupon = paths["/api/owner/coupons"]["get"]["responses"][200]["content"]["application/json"]["coupons"][number];
export type CouponInput = paths["/api/owner/coupons"]["post"]["requestBody"]["content"]["application/json"];
export type CouponState = "active" | "inactive" | "scheduled" | "expired" | "exhausted";
export type CouponDraft = {
  code: string;
  type: OwnerCoupon["type"];
  value: string;
  minOrderCents: string;
  startsAt: string;
  endsAt: string;
  maxUses: string;
  maxUsesPerCustomer: string;
  description: string;
  active: boolean;
};
export type CouponIssue = "code" | "percent" | "money" | "positiveMoney" | "limit" | "date" | "dateOrder" | "description";
export type CouponErrors = Partial<Record<keyof CouponDraft, CouponIssue>>;

export function couponDraft(coupon: OwnerCoupon | null): CouponDraft {
  return {
    code: coupon?.code ?? "",
    type: coupon?.type ?? "percent",
    value: coupon?.type === "fixed" ? centsToInput(coupon.value) : String(coupon?.value ?? 10),
    minOrderCents: centsToInput(coupon?.minOrderCents ?? 0),
    startsAt: toBrazilInput(coupon?.startsAt),
    endsAt: toBrazilInput(coupon?.endsAt),
    maxUses: coupon?.maxUses == null ? "" : String(coupon.maxUses),
    maxUsesPerCustomer: coupon?.maxUsesPerCustomer == null ? "" : String(coupon.maxUsesPerCustomer),
    description: coupon?.description ?? "",
    active: coupon?.active ?? true,
  };
}

// These fields accept decimal BRL amounts, never silently strip a minus sign or
// round a third decimal. API values remain bounded integer cents.
function money(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) && cents <= 10_000_000 ? cents : null;
}

function date(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const iso = `${value}:00-03:00`;
  const parsed = new Date(iso);
  if (!Number.isFinite(parsed.getTime()) || toBrazilInput(iso) !== value) return null;
  return iso;
}

export function validateCouponDraft(draft: CouponDraft): { errors: CouponErrors; body?: CouponInput } {
  const errors: CouponErrors = {};
  const code = draft.code.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,20}$/.test(code)) errors.code = "code";

  let value = 0;
  if (draft.type === "percent") {
    value = Number(draft.value);
    if (!/^\d+$/.test(draft.value.trim()) || !Number.isInteger(value) || value < 1 || value > 100) errors.value = "percent";
  } else if (draft.type === "fixed") {
    const cents = money(draft.value);
    if (cents == null || cents < 1) errors.value = "positiveMoney";
    else value = cents;
  }
  const minOrderCents = money(draft.minOrderCents);
  if (minOrderCents == null) errors.minOrderCents = "money";

  const limits: { maxUses: number | null; maxUsesPerCustomer: number | null } = { maxUses: null, maxUsesPerCustomer: null };
  for (const key of ["maxUses", "maxUsesPerCustomer"] as const) {
    if (!draft[key].trim()) continue;
    const count = Number(draft[key]);
    if (!/^\d+$/.test(draft[key].trim()) || !Number.isInteger(count) || count < 1 || count > 1_000_000) errors[key] = "limit";
    else limits[key] = count;
  }

  const startsAt = draft.startsAt ? date(draft.startsAt) : null;
  const endsAt = draft.endsAt ? date(draft.endsAt) : null;
  if (draft.startsAt && !startsAt) errors.startsAt = "date";
  if (draft.endsAt && !endsAt) errors.endsAt = "date";
  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) errors.endsAt = "dateOrder";
  if (draft.description.trim().length > 140) errors.description = "description";
  if (Object.keys(errors).length) return { errors };

  return {
    errors,
    body: { code, type: draft.type, value, minOrderCents: minOrderCents!, startsAt, endsAt, ...limits, active: draft.active, description: draft.description.trim() },
  };
}

export function couponState(coupon: OwnerCoupon, now = Date.now()): CouponState {
  if (!coupon.active) return "inactive";
  if (coupon.startsAt && new Date(coupon.startsAt).getTime() > now) return "scheduled";
  if (coupon.endsAt && new Date(coupon.endsAt).getTime() <= now) return "expired";
  if (coupon.maxUses != null && coupon.uses >= coupon.maxUses) return "exhausted";
  return "active";
}

export const couponTexts = {
  "pt-BR": {
    title: "Cupons", description: "Crie descontos e acompanhe o uso nos pedidos da sua loja.",
    create: "Novo cupom", edit: "Editar cupom", save: "Salvar cupom", saving: "Salvando…", cancel: "Voltar", remove: "Excluir cupom", removing: "Excluindo…",
    search: "Buscar por código ou descrição", empty: "Você ainda não tem cupons. Crie o primeiro para compartilhar com seus clientes.", noResults: "Nenhum cupom encontrado.", retry: "Tentar novamente",
    saved: "Cupom salvo.", removed: "Cupom excluído.", updated: "Disponibilidade do cupom atualizada.",
    code: "Código do cupom", codeHint: "De 3 a 20 letras, números, hífens ou sublinhados. Ex.: BEMVINDO10.",
    type: "Tipo de desconto", percent: "Porcentagem", fixed: "Valor fixo", free_delivery: "Entrega grátis", valuePercent: "Desconto (%)", valueFixed: "Desconto (R$)",
    subtotalHint: "O desconto é aplicado ao subtotal dos produtos. Não inclui a taxa de entrega.", freeHint: "Este cupom remove a taxa de entrega. Válido apenas para pedidos com entrega.",
    minimum: "Subtotal mínimo dos produtos (R$)", minimumHint: "Use 0,00 para permitir qualquer valor. A taxa de entrega não entra no mínimo.",
    limits: "Limites de uso", maxUses: "Total de usos permitido", perCustomer: "Usos por cliente", unlimited: "Sem limite", limitHint: "Deixe em branco para não limitar.", customerHint: "O cliente é identificado pelo telefone informado no pedido.",
    dates: "Validade", startsAt: "Começa em", endsAt: "Termina em", dateHint: "Horário de Brasília (UTC−3). Deixe em branco para não definir esse limite.",
    descriptionLabel: "Descrição interna", descriptionHint: "Só aparece no painel. Até 140 caracteres.", active: "Cupom habilitado", activeHint: "A validade e os limites de uso também precisam ser atendidos.",
    uses: "Usos", usesHint: "Pedidos não cancelados que usaram este cupom. Cancelar um pedido libera seu uso.",
    status: { active: "Disponível", inactive: "Desativado", scheduled: "Agendado", expired: "Expirado", exhausted: "Esgotado" },
    minimumSummary: "Mínimo", from: "Início", until: "Fim", noDates: "Sem limite de datas", perCustomerSummary: "por cliente", enable: "Habilitar cupom", disable: "Desativar cupom",
    discard: "Há alterações não salvas. Descartar e voltar?", deleteConfirm: "Excluir este cupom? Ele deixará de aceitar novos usos. Os pedidos anteriores manterão o desconto registrado.",
    duplicate: "Já existe um cupom com esse código.", invalid: "Confira os valores e a validade do cupom.", validation: "Revise os campos destacados antes de salvar.",
    errors: { code: "Use de 3 a 20 letras, números, hífens ou sublinhados.", percent: "Informe uma porcentagem inteira de 1 a 100.", money: "Informe de 0,00 a 100000,00, com até duas casas decimais.", positiveMoney: "Informe de 0,01 a 100000,00, com até duas casas decimais.", limit: "Informe um número inteiro de 1 a 1.000.000 ou deixe em branco.", date: "Informe uma data e hora válidas.", dateOrder: "O término deve ser depois do início.", description: "Use até 140 caracteres." },
  },
  es: {
    title: "Cupones", description: "Creá descuentos y consultá su uso en los pedidos de tu comercio.",
    create: "Nuevo cupón", edit: "Editar cupón", save: "Guardar cupón", saving: "Guardando…", cancel: "Volver", remove: "Eliminar cupón", removing: "Eliminando…",
    search: "Buscar por código o descripción", empty: "Todavía no tenés cupones. Creá el primero para compartir con tus clientes.", noResults: "No se encontraron cupones.", retry: "Reintentar",
    saved: "Cupón guardado.", removed: "Cupón eliminado.", updated: "Disponibilidad del cupón actualizada.",
    code: "Código del cupón", codeHint: "De 3 a 20 letras, números, guiones o guiones bajos. Ej.: BIENVENIDO10.",
    type: "Tipo de descuento", percent: "Porcentaje", fixed: "Importe fijo", free_delivery: "Envío gratis", valuePercent: "Descuento (%)", valueFixed: "Descuento (R$)",
    subtotalHint: "El descuento se aplica al subtotal de los productos. No incluye el costo de envío.", freeHint: "Este cupón elimina el costo de envío. Válido únicamente para pedidos con entrega.",
    minimum: "Subtotal mínimo de productos (R$)", minimumHint: "Usá 0,00 para permitir cualquier importe. El envío no cuenta para el mínimo.",
    limits: "Límites de uso", maxUses: "Total de usos permitido", perCustomer: "Usos por cliente", unlimited: "Sin límite", limitHint: "Dejá en blanco para no limitar.", customerHint: "El cliente se identifica por el teléfono indicado en el pedido.",
    dates: "Vigencia", startsAt: "Comienza el", endsAt: "Finaliza el", dateHint: "Hora de Brasilia (UTC−3). Dejá en blanco para no definir ese límite.",
    descriptionLabel: "Descripción interna", descriptionHint: "Solo aparece en el panel. Hasta 140 caracteres.", active: "Cupón habilitado", activeHint: "También deben cumplirse la vigencia y los límites de uso.",
    uses: "Usos", usesHint: "Pedidos no cancelados que usaron este cupón. Cancelar un pedido libera su uso.",
    status: { active: "Disponible", inactive: "Desactivado", scheduled: "Programado", expired: "Vencido", exhausted: "Agotado" },
    minimumSummary: "Mínimo", from: "Inicio", until: "Fin", noDates: "Sin límite de fechas", perCustomerSummary: "por cliente", enable: "Habilitar cupón", disable: "Desactivar cupón",
    discard: "Hay cambios sin guardar. ¿Descartarlos y volver?", deleteConfirm: "¿Eliminar este cupón? No aceptará nuevos usos. Los pedidos anteriores conservarán el descuento registrado.",
    duplicate: "Ya existe un cupón con ese código.", invalid: "Revisá los valores y la vigencia del cupón.", validation: "Revisá los campos marcados antes de guardar.",
    errors: { code: "Usá de 3 a 20 letras, números, guiones o guiones bajos.", percent: "Ingresá un porcentaje entero de 1 a 100.", money: "Ingresá de 0,00 a 100000,00, con hasta dos decimales.", positiveMoney: "Ingresá de 0,01 a 100000,00, con hasta dos decimales.", limit: "Ingresá un entero de 1 a 1.000.000 o dejá en blanco.", date: "Ingresá una fecha y hora válidas.", dateOrder: "El fin debe ser posterior al inicio.", description: "Usá hasta 140 caracteres." },
  },
};
