import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquarePlus, Trash2 } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { type ApiError, api } from "../../../api/client";
import type { TopProductsResponse,
  ManualOrderInput,
  ManualOrderResponse,
  OrderChannel,
  PaymentMethod,
  PublicProduct,
  PublicStoreResponse,
  TableTabResponse,
} from "../../../api/types";
import { Spinner } from "../../../components/FullScreenMessage";
import { PageHeader } from "../../../components/PageHeader";
import { Field, button, input, textarea } from "../../../components/ui";
import { errorText, useT } from "../../../i18n";
import { formatMoney, operatingDayISO } from "../../../lib/format";
import { paymentMethodsFor } from "../../../lib/payments";
import { newId } from "../../../lib/id";
import { parseMoney } from "../../../lib/money";
import { matchesSearch } from "../../../lib/text";
import { useCart } from "../../menu/cart";
import { indexMenu, resolveLines } from "../../menu/lines";
import { SearchBox } from "../../menu/MenuChrome";
import { Price } from "../../menu/ProductList";
import { ProductSheet, QuickNotes, Stepper } from "../../menu/ProductSheet";
import { orderTotals } from "../../menu/pricing";
import { usePublicStore } from "../../menu/usePublicStore";
import { ordersKey, printIfConfirmed } from "../orders/useOrders";
import { tableTabKey, tablesKey } from "../salon/useSalon";
import { usePanel } from "../PanelLayout";

type Channel = Exclude<OrderChannel, "online">;
const CHANNELS: Channel[] = ["phone", "whatsapp", "counter"];

const chip = (active: boolean) =>
  `inline-flex min-h-11 items-center rounded-lg px-4 font-bold ${active ? "bg-action text-white" : "bg-surface ring-1 ring-line hover:bg-paper"}`;

// Pedido que llegó por teléfono, WhatsApp o en el mostrador. Los productos se eligen con
// la misma ficha que el menú público (opciones y precios iguales).
// Con ?mesa=<id>, el pedido es para una mesa: solo productos y observaciones; entra en su cuenta.
export function NewOrderPage() {
  const t = useT();
  const { store } = usePanel();
  const menu = usePublicStore(store.slug);
  const tableId = useSearchParams()[0].get("mesa");
  const tab = useQuery({
    queryKey: tableTabKey(tableId ?? ""),
    queryFn: () => api<TableTabResponse>(`/owner/tables/${tableId}/tab`),
    enabled: Boolean(tableId),
  });
  const table = tableId ? tab.data?.table : undefined;
  const loading = menu.isPending || (tableId != null && tab.isPending);
  const failed = menu.isError || (tableId != null && tab.isError);

  return (
    <>
      <PageHeader
        title={table ? t.tables.newOrderTitle(table.number) : t.pages.newOrder.title}
        description={table ? t.tables.newOrderDescription : t.pages.newOrder.description}
      />
      {loading && <Spinner />}
      {failed && <p className="text-error">{t.errors.generic}</p>}
      {menu.data && !loading && !failed && <NewOrderForm data={menu.data} table={table} />}
    </>
  );
}

function NewOrderForm({ data, table }: { data: PublicStoreResponse; table?: TableTabResponse["table"] }) {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { store, categories, optionGroups } = data;
  const { dayStart } = usePanel().store.hours;
  const groups = useMemo(() => new Map(optionGroups.map((group) => [group._id, group])), [optionGroups]);
  const index = useMemo(() => indexMenu(categories), [categories]);
  // Cada mesa tiene su propio borrador: no se mezcla con el pedido del mostrador.
  const cart = useCart(table ? `painel.${store.slug}.mesa.${table._id}` : `painel.${store.slug}`);
  const lines = resolveLines(cart.lines, index, groups);

  const [search, setSearch] = useState("");
  const [picking, setPicking] = useState<PublicProduct | null>(null);
  const [channel, setChannel] = useState<Channel>("phone");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [fulfillment, setFulfillment] = useState<"delivery" | "pickup">(store.fulfillment.pickup ? "pickup" : "delivery");
  const [zoneId, setZoneId] = useState("");
  const [address, setAddress] = useState({ neighborhood: "", street: "", number: "", reference: "" });
  const [chosenPayment, setPayment] = useState<PaymentMethod>(store.paymentMethods[0] ?? "cash");
  const [changeFor, setChangeFor] = useState("");
  const [notes, setNotes] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [clientOrderId, setClientOrderId] = useState(newId);

  const zones = store.deliveryMode === "zones";
  const available = lines.filter((line) => line.available);
  const subtotalCents = available.reduce((sum, line) => sum + line.totalCents, 0);
  const totals = orderTotals({ store, subtotalCents, fulfillment, zoneId });
  // Solo las formas de pago que valen para este modo; si la elegida no vale, la primera que sí.
  const methods = paymentMethodsFor(store, fulfillment);
  const payment = methods.includes(chosenPayment) ? chosenPayment : (methods[0] ?? chosenPayment);

  const forTable = useMutation<ManualOrderResponse, ApiError, object>({
    mutationFn: (body) => api<ManualOrderResponse>(`/owner/tables/${table?._id}/orders`, { method: "POST", body }),
    onSuccess: ({ order }) => {
      cart.clear();
      setClientOrderId(newId());
      queryClient.invalidateQueries({ queryKey: ordersKey(operatingDayISO(new Date(), dayStart)) });
      queryClient.invalidateQueries({ queryKey: tablesKey });
      printIfConfirmed(order);
      navigate(`/painel/pedidos?ver=salao&mesa=${table?._id}`);
    },
  });
  const create = useMutation<ManualOrderResponse, ApiError, ManualOrderInput>({
    mutationFn: (body) => api<ManualOrderResponse>("/owner/orders", { method: "POST", body }),
    onSuccess: ({ order }) => {
      cart.clear();
      setClientOrderId(newId());
      queryClient.invalidateQueries({ queryKey: ordersKey(operatingDayISO(new Date(), dayStart)) });
      // Los cargados en el panel entran confirmados.
      printIfConfirmed(order);
      navigate(`/painel/pedidos?pedido=${order._id}`);
    },
  });

  const sending = table ? forTable : create;
  // En la mesa no hay envío: el total es lo que suman los productos.
  const shownTotal = table ? totals.subtotalCents : totals.totalCents;

  // Lo más pedido, arriba de la carta (sin búsqueda escrita): lo frecuente a un toque.
  const topQuery = useQuery({
    queryKey: ["top-products"],
    queryFn: () => api<TopProductsResponse>("/owner/orders/top-products"),
    staleTime: 5 * 60_000,
  });
  const byId = new Map(categories.flatMap((category) => category.products.map((product) => [product._id, { product, category }] as const)));
  const top = search.trim()
    ? []
    : (topQuery.data?.products ?? []).map(({ productId }) => byId.get(productId)).filter((entry) => entry !== undefined);
  const pick = (product: PublicProduct) => (product.optionGroups.length === 0 ? cart.add(product._id, 1, [], "") : setPicking(product));

  const visibleCategories = categories
    .map((category) => ({ category, products: category.products.filter((p) => matchesSearch(`${p.name} ${p.description}`, search)) }))
    .filter((entry) => entry.products.length > 0);

  const items = () =>
    available.map(({ line }) => ({
      productId: line.productId,
      quantity: line.quantity,
      options: line.options,
      ...(line.notes && { notes: line.notes }),
    }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found: Record<string, string> = {};
    if (!available.length) found.items = t.manualOrder.noItems;
    if (table) {
      setErrors(found);
      if (!Object.keys(found).length) forTable.mutate({ clientOrderId, items: items(), ...(notes.trim() && { notes: notes.trim() }) });
      return;
    }
    if (!name.trim()) found.name = t.checkout.required;
    if (channel !== "counter" && !phone.trim()) found.phone = t.checkout.required;
    if (fulfillment === "delivery") {
      if (zones ? !zoneId : !address.neighborhood.trim()) found.zone = zones ? t.checkout.chooseOne : t.checkout.required;
      if (!address.street.trim()) found.street = t.checkout.required;
      if (!address.number.trim()) found.number = t.checkout.required;
    }
    const change = parseMoney(changeFor);
    if (payment === "cash" && change != null && change < totals.totalCents) found.changeFor = t.checkout.changeTooLow;
    setErrors(found);
    if (Object.keys(found).length) return;

    create.mutate({
      clientOrderId,
      channel,
      customer: { name: name.trim(), ...(phone.trim() && { phone: phone.trim() }) },
      fulfillment,
      ...(fulfillment === "delivery" && {
        address: {
          street: address.street.trim(),
          number: address.number.trim(),
          ...(zones ? { zoneId } : { neighborhood: address.neighborhood.trim() }),
          ...(address.reference.trim() && { reference: address.reference.trim() }),
        },
      }),
      paymentMethod: payment,
      ...(payment === "cash" && change != null && { changeForCents: change }),
      ...(notes.trim() && { notes: notes.trim() }),
      // Hora de Brasil (UTC-3, sin horario de verano).
      ...(scheduledFor && { scheduledFor: `${scheduledFor}:00-03:00` }),
      items: items(),
      locale: "pt-BR",
    });
  };

  const invalid = (key: string) => (errors[key] ? { "aria-invalid": true } : {});
  const quickNotes = usePanel().store.quickNotes ?? [];
  const inCart = (productId: string) => lines.filter(({ line }) => line.productId === productId).reduce((sum, { line }) => sum + line.quantity, 0);
  const count = available.reduce((sum, { line }) => sum + line.quantity, 0);
  // En la mesa se manda desde la barra; en el mostrador faltan los datos del cliente: va al resumen.
  const toSummary = () => document.getElementById("itens")?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start">
      <section aria-labelledby="produtos" className="rounded-xl border border-line bg-surface p-4">
        <h2 id="produtos" className="mb-3 text-lg font-bold">
          {t.manualOrder.products}
        </h2>
        <SearchBox value={search} onChange={setSearch} />
        <p className="mt-2 text-sm text-ink-muted">{t.manualOrder.pickProducts}</p>
        {top.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-bold text-ink-muted">{t.manualOrder.top}</h3>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              {top.map(({ product, category }) => (
                <button
                  key={product._id}
                  type="button"
                  disabled={!product.available || !category.availableNow}
                  onClick={() => pick(product)}
                  className="flex min-h-14 items-center gap-2 rounded-xl border border-line px-3 py-2 text-left hover:bg-paper active:bg-paper disabled:opacity-50"
                >
                  {inCart(product._id) > 0 && (
                    <span className="inline-grid min-w-6 shrink-0 place-items-center rounded-full bg-action px-1.5 text-sm font-bold text-white tabular-nums">{inCart(product._id)}</span>
                  )}
                  <span className="min-w-0 flex-1 text-sm leading-tight font-bold">{product.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {visibleCategories.map(({ category, products }) => (
          <div key={category._id} className="mt-4">
            <h3 className="text-sm font-bold text-ink-muted">{category.name}</h3>
            <ul className="divide-y divide-line">
              {products.map((product) => {
                // Sin opciones para elegir, un toque lo agrega; el botón del costado abre la ficha (nota, cantidad).
                const simple = product.optionGroups.length === 0;
                const off = !product.available || !category.availableNow;
                return (
                  <li key={product._id} className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={off}
                      onClick={() => pick(product)}
                      className="flex min-h-12 min-w-0 flex-1 items-center justify-between gap-3 py-2 text-left hover:bg-paper active:bg-paper disabled:text-ink-muted"
                    >
                      <span className="font-bold">
                        {/* Cuántos ya hay en el pedido: se ve que se agregó sin bajar al resumen. */}
                        {inCart(product._id) > 0 && (
                          <span className="mr-2 inline-grid min-w-6 place-items-center rounded-full bg-action px-1.5 text-sm text-white tabular-nums">{inCart(product._id)}</span>
                        )}
                        {product.name}
                        {!product.available && <span className="ml-2 text-sm text-error">{t.menu.soldOut}</span>}
                      </span>
                      <Price product={product} />
                    </button>
                    {simple && (
                      <button
                        type="button"
                        disabled={off}
                        onClick={() => setPicking(product)}
                        aria-label={t.manualOrder.details(product.name)}
                        title={t.manualOrder.details(product.name)}
                        className="grid size-11 shrink-0 place-items-center rounded-lg text-ink-muted hover:bg-paper hover:text-ink disabled:opacity-40"
                      >
                        <MessageSquarePlus aria-hidden className="size-5" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      <form id="pedido-form" onSubmit={submit} noValidate className="space-y-5 rounded-xl border border-line bg-surface p-4 lg:sticky lg:top-20">
        {!table && (
          <fieldset>
            <legend className="mb-2 font-bold">{t.manualOrder.channel}</legend>
            <div className="flex flex-wrap gap-2">
              {CHANNELS.map((value) => (
                <button key={value} type="button" aria-pressed={channel === value} onClick={() => setChannel(value)} className={chip(channel === value)}>
                  {t.orders.channels[value]}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <section aria-labelledby="itens">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 id="itens" className="font-bold">
              {t.manualOrder.order}
            </h2>
            {lines.length > 0 && (
              <button type="button" onClick={cart.clear} className={button.quiet}>
                {t.manualOrder.clear}
              </button>
            )}
          </div>
          {lines.length === 0 ? (
            <p className={`text-sm ${errors.items ? "font-bold text-error" : "text-ink-muted"}`}>{t.manualOrder.noItems}</p>
          ) : (
            <ul className="divide-y divide-line">
              {lines.map(({ line, product, optionsText, totalCents, available: ok }) => (
                <li key={line.key} className="py-2">
                  <div className="flex justify-between gap-3">
                    <span className={`font-bold ${ok ? "" : "text-ink-muted line-through"}`}>{product?.name ?? "—"}</span>
                    {ok && <span className="tabular-nums">{formatMoney(totalCents)}</span>}
                  </div>
                  {optionsText && <p className="text-sm text-ink-muted">{optionsText}</p>}
                  {line.notes && <p className="text-sm text-ink-muted">“{line.notes}”</p>}
                  {ok && quickNotes.length > 0 && <QuickNotes notes={line.notes} options={quickNotes} onChange={(next) => cart.setNotes(line.key, next)} />}
                  <div className="mt-1 flex items-center gap-2">
                    {ok && (
                      <Stepper label={t.product.quantity} value={line.quantity} min={1} max={50} onChange={(value) => cart.setQuantity(line.key, value)} />
                    )}
                    <button type="button" onClick={() => cart.setQuantity(line.key, 0)} className={button.quiet}>
                      <Trash2 aria-hidden className="size-4" />
                      {t.cart.remove}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* En la mesa no hay cliente, entrega ni pago: se cobra al cerrar la cuenta. */}
        {!table && (
          <>
            <Field id="cliente-nome" label={t.checkout.name} error={errors.name}>
              <input id="cliente-nome" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={input} {...invalid("name")} />
            </Field>
            <Field id="cliente-fone" label={channel === "counter" ? t.manualOrder.phoneOptional : t.checkout.phone} error={errors.phone}>
              <input
                id="cliente-fone"
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={30}
                className={input}
                {...invalid("phone")}
              />
            </Field>

            <fieldset>
              <legend className="mb-2 font-bold">{t.checkout.howToReceive}</legend>
              <div className="flex flex-wrap gap-2">
                {(["delivery", "pickup"] as const)
                  .filter((option) => store.fulfillment[option])
                  .map((option) => (
                    <button key={option} type="button" aria-pressed={fulfillment === option} onClick={() => setFulfillment(option)} className={chip(fulfillment === option)}>
                      {option === "delivery" ? t.checkout.delivery : t.checkout.pickup}
                    </button>
                  ))}
              </div>
            </fieldset>

            {fulfillment === "delivery" && (
              <div className="space-y-3">
                {zones ? (
                  <Field id="pedido-bairro" label={t.checkout.zone} error={errors.zone}>
                    <select id="pedido-bairro" value={zoneId} onChange={(e) => setZoneId(e.target.value)} className={input} {...invalid("zone")}>
                      <option value="">{t.checkout.chooseZone}</option>
                      {store.deliveryZones.map((zone) => (
                        <option key={zone._id} value={zone._id}>
                          {t.checkout.zoneFee(zone.name, zone.feeCents > 0 ? formatMoney(zone.feeCents) : t.checkout.free)}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : (
                  <Field id="pedido-bairro" label={t.checkout.neighborhood} error={errors.zone}>
                    <input
                      id="pedido-bairro"
                      value={address.neighborhood}
                      onChange={(e) => setAddress({ ...address, neighborhood: e.target.value })}
                      maxLength={80}
                      className={input}
                      {...invalid("zone")}
                    />
                  </Field>
                )}
                <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
                  <Field id="pedido-rua" label={t.checkout.street} error={errors.street}>
                    <input
                      id="pedido-rua"
                      value={address.street}
                      onChange={(e) => setAddress({ ...address, street: e.target.value })}
                      maxLength={120}
                      className={input}
                      {...invalid("street")}
                    />
                  </Field>
                  <Field id="pedido-numero" label={t.checkout.number} error={errors.number}>
                    <input
                      id="pedido-numero"
                      value={address.number}
                      onChange={(e) => setAddress({ ...address, number: e.target.value })}
                      maxLength={20}
                      className={input}
                      {...invalid("number")}
                    />
                  </Field>
                </div>
                <Field id="pedido-referencia" label={t.checkout.reference}>
                  <input
                    id="pedido-referencia"
                    value={address.reference}
                    onChange={(e) => setAddress({ ...address, reference: e.target.value })}
                    maxLength={120}
                    className={input}
                  />
                </Field>
              </div>
            )}

            <fieldset>
              <legend className="mb-2 font-bold">{t.checkout.payment}</legend>
              <div className="flex flex-wrap gap-2">
                {methods.map((method) => (
                  <button key={method} type="button" aria-pressed={payment === method} onClick={() => setPayment(method)} className={chip(payment === method)}>
                    {t.checkout.methods[method]}
                  </button>
                ))}
              </div>
            </fieldset>
            {payment === "cash" && (
              <Field id="pedido-troco" label={t.checkout.changeFor} error={errors.changeFor} hint={t.checkout.changeHint}>
                <input id="pedido-troco" inputMode="decimal" value={changeFor} onChange={(e) => setChangeFor(e.target.value)} className={input} {...invalid("changeFor")} />
              </Field>
            )}
          </>
        )}

        <Field id="pedido-obs" label={t.checkout.notes}>
          <textarea id="pedido-obs" rows={2} maxLength={280} value={notes} onChange={(e) => setNotes(e.target.value)} className={textarea} />
        </Field>
        {!table && (
          <Field id="pedido-agendar" label={t.manualOrder.schedule} hint={t.manualOrder.scheduleHint}>
            <input id="pedido-agendar" type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} className={input} />
          </Field>
        )}

        <dl className="space-y-1 border-t border-line pt-3">
          {!table && (
            <div className="flex justify-between">
              <dt>{t.checkout.subtotal}</dt>
              <dd className="tabular-nums">{formatMoney(totals.subtotalCents)}</dd>
            </div>
          )}
          {!table && fulfillment === "delivery" && (
            <div className="flex justify-between">
              <dt>{t.checkout.deliveryFee}</dt>
              <dd className="tabular-nums">
                {totals.feePending ? t.checkout.chooseZone : totals.deliveryFeeCents > 0 ? formatMoney(totals.deliveryFeeCents) : t.checkout.free}
              </dd>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold">
            <dt>{t.checkout.total}</dt>
            <dd className="tabular-nums">{formatMoney(shownTotal)}</dd>
          </div>
        </dl>

        {sending.isError && (
          <p role="alert" className="text-sm font-bold text-error">
            {errorText(sending.error, t)}
          </p>
        )}
        <button type="submit" disabled={sending.isPending} className={`${button.primary} h-12 w-full`}>
          {sending.isPending ? t.manualOrder.submitting : table ? t.tables.submit(formatMoney(shownTotal)) : t.manualOrder.submit(formatMoney(shownTotal))}
        </button>
      </form>

      {/* En el celular el resumen queda abajo de todos los productos: esta barra lo tiene a mano. */}
      {count > 0 && (
        <div className="fixed inset-x-0 bottom-16 z-20 border-t border-line bg-surface px-4 py-2 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] lg:hidden">
          <div className="flex items-center gap-3">
            <button type="button" onClick={toSummary} className="min-w-0 flex-1 text-left">
              <span className="block text-sm text-ink-muted">{t.manualOrder.itemsCount(count)}</span>
              <span className="block font-bold tabular-nums">{formatMoney(shownTotal)}</span>
            </button>
            {table ? (
              <button type="submit" form="pedido-form" disabled={sending.isPending} className={`${button.primary} h-12`}>
                {sending.isPending ? t.manualOrder.submitting : t.tables.sendShort}
              </button>
            ) : (
              <button type="button" onClick={toSummary} className={`${button.primary} h-12`}>
                {t.manualOrder.review}
              </button>
            )}
          </div>
        </div>
      )}

      {picking && (
        <ProductSheet
          key={picking._id}
          product={picking}
          groups={groups}
          quickNotes={quickNotes}
          canOrder
          onAdd={(quantity, options, lineNotes) => {
            cart.add(picking._id, quantity, options, lineNotes);
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      )}
    </div>
  );
}
