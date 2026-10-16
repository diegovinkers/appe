import { useQuery } from "@tanstack/react-query";
import { Armchair, ChevronRight, CircleAlert, CircleSlash, MessageCircle, QrCode, Share2 } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { api } from "../../../api/client";
import type { AvailabilityResponse } from "../../../api/types";
import { can } from "../../../auth/permissions";
import { CopyButton } from "../../../components/CopyButton";
import { PageHeader } from "../../../components/PageHeader";
import { button } from "../../../components/ui";
import { useT } from "../../../i18n";
import { formatMinutes, formatMoney, operatingDayISO } from "../../../lib/format";
import { useNow } from "../../../hooks/useNow";
import type { ReportResponse } from "../../platform/businessTypes";
import { needsPerson, useConversations } from "../assistant/assistant";
import { settingsFor } from "../nav";
import { isActive, orderTiming } from "../orders/orderFlow";
import { useOrders } from "../orders/useOrders";
import { usePanel } from "../PanelLayout";
import { useSalonTables } from "../salon/useSalon";
import { settingsReadiness } from "../settings/readiness";
import { statusView } from "../storeStatus";

// Una fila de "Agora": qué pasa y adónde ir para resolverlo.
function NowRow({ to, icon, title, detail, urgent = false }: { to: string; icon: ReactNode; title: string; detail?: string; urgent?: boolean }) {
  return (
    <li>
      <Link to={to} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-paper">
        <span aria-hidden className={`grid size-10 shrink-0 place-items-center rounded-lg ${urgent ? "bg-error-soft text-error" : "bg-paper text-ink-muted"}`}>
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">{title}</span>
          {detail && <span className="block truncate text-sm text-ink-muted">{detail}</span>}
        </span>
        <ChevronRight aria-hidden className="size-5 shrink-0 text-ink-muted" />
      </Link>
    </li>
  );
}

// Una línea del resumen del día, como en el ticket de cierre: nombre, puntos y valor.
function ReceiptLine({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline gap-2 ${strong ? "text-lg font-bold" : ""}`}>
      <dt className="shrink-0">{label}</dt>
      <span aria-hidden className="min-w-4 flex-1 border-b-2 border-dotted border-line" />
      <dd className="shrink-0 tabular-nums">{value}</dd>
    </div>
  );
}

// Início: lo primero que se ve al entrar. Arriba, en el quadro, lo que necesita a alguien ya
// (pedidos esperando o atrasados); abajo, el resto de lo de ahora, cómo va el día (solo el
// dueño), el link del cardápio y lo que falta configurar.
export function HomePage() {
  const t = useT();
  const h = t.home;
  const { user, store, opening, storeUrl } = usePanel();
  const now = useNow();
  const today = operatingDayISO(new Date(now), store.hours.dayStart);
  const isOwner = can(user.role, "store:write");

  const orders = useOrders(today, true);
  const report = useQuery({
    queryKey: ["reports", { from: today, to: today }],
    queryFn: () => api<ReportResponse>(`/owner/reports?${new URLSearchParams({ from: today, to: today })}`),
    enabled: isOwner,
    refetchInterval: 60_000,
  });
  const availability = useQuery({
    queryKey: ["availability"],
    queryFn: () => api<AvailabilityResponse>("/owner/availability"),
    enabled: can(user.role, "menu:availability"),
  });
  const conversations = useConversations("all");
  const salon = useSalonTables();

  const list = orders.data?.orders ?? [];
  const active = list.filter((order) => isActive(order.status));
  const waiting = active.filter((order) => order.status === "new");
  const oldest = waiting.reduce<number | null>((min, order) => Math.min(min ?? Infinity, Date.parse(order.createdAt)), null);
  const late = active.filter((order) => order.status !== "new" && orderTiming(order, now).late).length;
  const people = (conversations.data?.conversations ?? []).filter(needsPerson).length;
  const soldOut = (availability.data?.products ?? []).filter((product) => !product.available);
  const tables = (salon.data?.tables ?? []).filter((table) => table.active);
  const occupied = tables.filter((table) => table.state !== "free").length;
  const bill = tables.filter((table) => table.state === "bill").length;
  const ready = tables.filter((table) => table.state === "ready").length;

  // El quadro dice una sola cosa: la más urgente.
  let headline = h.quiet;
  let detail = opening.status === "open" ? h.quietOpen : h.quietClosed;
  if (waiting.length) {
    headline = h.waiting(waiting.length);
    detail = [oldest != null && h.oldest(formatMinutes(Math.floor((now - oldest) / 60_000))), late > 0 && h.alsoLate(late)].filter(Boolean).join(" ");
  } else if (late) {
    headline = h.late(late);
    detail = h.lateDetail;
  } else if (active.length) {
    headline = h.active(active.length);
    detail = h.activeDetail;
  }
  const status = statusView(opening, new Date(now));
  const urgent = waiting.length > 0 || late > 0;

  const readiness = settingsReadiness(store);
  const pendingSettings = isOwner ? settingsFor(user.role).filter((item) => readiness[item.key] === false) : [];
  const noProducts = isOwner && availability.data && !availability.data.products.some((product) => product.available);
  const share = typeof navigator !== "undefined" && "share" in navigator;
  const day = report.data;

  return (
    <>
      <PageHeader title={t.pages.home.title} description={t.pages.home.description} />

      {/* En la PC, el texto a la izquierda y el botón a la derecha: la mitad de alto. */}
      <section aria-labelledby="quadro" className="rounded-2xl bg-board p-5 text-chalk sm:p-7 lg:flex lg:items-center lg:justify-between lg:gap-6 lg:px-7 lg:py-5">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm text-chalk-muted">
            <span aria-hidden className={`size-2.5 rounded-full ${status.tone}`} />
            <span className="font-bold text-chalk">{status.label}</span>
            {status.detail && <span>{status.detail}</span>}
          </p>
          <h2 id="quadro" className="mt-3 text-3xl leading-tight font-bold tracking-tight text-white sm:text-4xl lg:mt-2 lg:text-3xl">
            {orders.isPending ? "…" : headline}
          </h2>
          {!orders.isPending && <p className="mt-2 max-w-prose text-chalk">{detail}</p>}
        </div>
        {can(user.role, "orders:read") && (
          <Link
            to={waiting.length ? "/painel/pedidos?filtro=new" : "/painel/pedidos"}
            className={`mt-5 inline-flex h-12 shrink-0 items-center gap-2 rounded-xl px-5 font-bold lg:mt-0 ${urgent ? "bg-(--brand) text-(--on-brand)" : "bg-board-active text-white hover:bg-board-hover"}`}
          >
            {h.seeOrders}
            <ChevronRight aria-hidden className="size-5" />
          </Link>
        )}
      </section>

      <div className={`mt-6 grid gap-6 lg:mt-5 lg:gap-5 ${isOwner ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]" : ""}`}>
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="agora">
            <h2 id="agora" className="mb-2 text-lg font-bold">
              {h.now}
            </h2>
            {tables.length || people || soldOut.length ? (
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
                {tables.length > 0 && (
                  <NowRow
                    to="/painel/pedidos?ver=salao"
                    icon={<Armchair className="size-5" />}
                    urgent={bill + ready > 0}
                    title={h.tables(occupied, tables.length)}
                    detail={bill || ready ? [bill && h.tablesBill(bill), ready && h.tablesReady(ready)].filter(Boolean).join(", ") : h.tablesCalm}
                  />
                )}
                {people > 0 && (
                  <NowRow to="/painel/assistente" icon={<MessageCircle className="size-5" />} urgent title={h.conversations(people)} detail={h.conversationsDetail} />
                )}
                {soldOut.length > 0 && (
                  <NowRow
                    to="/painel/disponibilidade"
                    icon={<CircleSlash className="size-5" />}
                    title={h.soldOut(soldOut.length)}
                    detail={soldOut.map((product) => product.name).join(", ")}
                  />
                )}
              </ul>
            ) : (
              <p className="rounded-xl border border-dashed border-line bg-surface p-4 text-ink-muted">{h.nothingNow}</p>
            )}
          </section>

          {(pendingSettings.length > 0 || noProducts) && (
            <section aria-labelledby="falta" className="rounded-xl bg-error-soft p-4 ring-1 ring-error/30">
              <h2 id="falta" className="flex items-center gap-2 font-bold text-error">
                <CircleAlert aria-hidden className="size-5" />
                {h.setup}
              </h2>
              <p className="mt-1 text-sm text-error">{h.setupHint}</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {noProducts && (
                  <li>
                    <Link to="/painel/cardapio/produtos" className={button.secondary}>
                      {h.noProducts}
                    </Link>
                  </li>
                )}
                {pendingSettings.map((item) => (
                  <li key={item.key}>
                    <Link to={item.to} className={button.secondary}>
                      <item.icon aria-hidden className="size-4" />
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="link" className="rounded-xl border border-line bg-surface p-4">
            <h2 id="link" className="font-bold">
              {h.link}
            </h2>
            <p className="text-sm text-ink-muted">{h.linkHint}</p>
            <p className="mt-3 rounded-lg bg-paper px-3 py-2.5 break-all">{storeUrl}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <CopyButton text={storeUrl} label={h.copy} copiedLabel={h.copied} />
              {share && (
                <button type="button" className={button.secondary} onClick={() => void navigator.share({ title: store.name, url: storeUrl }).catch(() => {})}>
                  <Share2 aria-hidden className="size-4" />
                  {h.share}
                </button>
              )}
              {can(user.role, "store:read") && (
                <Link to="/painel/configuracoes/link-qr" className={button.secondary}>
                  <QrCode aria-hidden className="size-4" />
                  {h.qr}
                </Link>
              )}
            </div>
          </section>
        </div>

        {/* Las ventas son del dueño: el empleado no las ve. */}
        {isOwner && (
          <section aria-labelledby="hoje" className="self-start rounded-xl border border-line bg-surface p-4">
            <h2 id="hoje" className="mb-3 text-lg font-bold">
              {h.today}
            </h2>
            {day ? (
              <dl className="space-y-2">
                <ReceiptLine strong label={h.sold} value={formatMoney(day.salesCents)} />
                <ReceiptLine label={h.delivered} value={String(day.completed)} />
                <ReceiptLine label={h.average} value={formatMoney(day.averageCents)} />
                <ReceiptLine label={h.inProgress(day.open.count)} value={formatMoney(day.open.salesCents)} />
                <ReceiptLine label={h.cancelled} value={String(day.cancelled)} />
              </dl>
            ) : (
              <p className="text-ink-muted">{report.isError ? t.errors.generic : "…"}</p>
            )}
            <Link to="/painel/relatorios" className="mt-4 inline-flex min-h-11 items-center font-bold underline underline-offset-4">
              {h.seeReports}
            </Link>
          </section>
        )}
      </div>
    </>
  );
}
