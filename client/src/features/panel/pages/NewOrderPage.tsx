import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { type ApiError, api } from "../../../api/client";
import type {
  ManualOrderInput,
  ManualOrderResponse,
  OrderChannel,
  PaymentMethod,
  PublicProduct,
  PublicStoreResponse,
} from "../../../api/types";
import { Spinner } from "../../../components/FullScreenMessage";
import { PageHeader } from "../../../components/PageHeader";
import { Field, button, input, textarea } from "../../../components/ui";
import { errorText, useT } from "../../../i18n";
import { formatMoney, todayISO } from "../../../lib/format";
import { newId } from "../../../lib/id";
import { parseMoney } from "../../../lib/money";
import { matchesSearch } from "../../../lib/text";
import { useCart } from "../../menu/cart";
import { indexMenu, resolveLines } from "../../menu/lines";
import { SearchBox } from "../../menu/MenuChrome";
import { Price } from "../../menu/ProductList";
import { ProductSheet, Stepper } from "../../menu/ProductSheet";
import { orderTotals } from "../../menu/pricing";
import { usePublicStore } from "../../menu/usePublicStore";
import { ordersKey } from "../orders/useOrders";
import { usePanel } from "../PanelLayout";

type Channel = Exclude<OrderChannel, "online">;
const CHANNELS: Channel[] = ["phone", "whatsapp", "counter"];

const chip = (active: boolean) =>
  `inline-flex min-h-11 items-center rounded-lg px-4 font-bold ${active ? "bg-action text-white" : "bg-surface ring-1 ring-line hover:bg-paper"}`;

// Pedido que llegó por teléfono, WhatsApp o en el mostrador. Los productos se eligen con
// la misma ficha que el menú público (opciones y precios iguales).
export function NewOrderPage() {
  const t = useT();
  const { store } = usePanel();
  const menu = usePublicStore(store.slug);

  return (
    <>
      <PageHeader title={t.pages.newOrder.title} description={t.pages.newOrder.description} />
      {menu.isPending && <Spinner />}
      {menu.isError && <p className="text-error">{t.errors.generic}</p>}
      {menu.data && <NewOrderForm data={menu.data} />}
    </>
  );
}

function NewOrderForm({ data }: { data: PublicStoreResponse }) {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { store, categories, optionGroups } = data;
  const groups = useMemo(() => new Map(optionGroups.map((group) => [group._id, group])), [optionGroups]);
  const index = useMemo(() => indexMenu(categories), [categories]);
  const cart = useCart(`painel.${store.slug}`);
  const lines = resolveLines(cart.lines, index, groups);

  const [search, setSearch] = useState("");
  const [picking, setPicking] = useState<PublicProduct | null>(null);
  const [channel, setChannel] = useState<Channel>("phone");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [fulfillment, setFulfillment] = useState<"delivery" | "pickup">(store.fulfillment.pickup ? "pickup" : "delivery");
  const [zoneId, setZoneId] = useState("");
  const [address, setAddress] = useState({ neighborhood: "", street: "", number: "", reference: "" });
  const [payment, setPayment] = useState<PaymentMethod>(store.paymentMethods[0] ?? "cash");
  const [changeFor, setChangeFor] = useState("");
  const [notes, setNotes] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [clientOrderId, setClientOrderId] = useState(newId);

  const zones = store.deliveryMode === "zones";
  const available = lines.filter((line) => line.available);
  const subtotalCents = available.reduce((sum, line) => sum + line.totalCents, 0);
  const totals = orderTotals({ store, subtotalCents, fulfillment, zoneId });

  const create = useMutation<ManualOrderResponse, ApiError, ManualOrderInput>({
    mutationFn: (body) => api<ManualOrderResponse>("/owner/orders", { method: "POST", body }),
    onSuccess: ({ order }) => {
      cart.clear();
      setClientOrderId(newId());
      queryClient.invalidateQueries({ queryKey: ordersKey(todayISO()) });
      navigate(`/painel/pedidos?pedido=${order._id}`);
    },
  });

  const visibleCategories = categories
    .map((category) => ({ category, products: category.products.filter((p) => matchesSearch(`${p.name} ${p.description}`, search)) }))
    .filter((entry) => entry.products.length > 0);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found: Record<string, string> = {};
    if (!available.length) found.items = t.manualOrder.noItems;
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
      items: available.map(({ line }) => ({
        productId: line.productId,
        quantity: line.quantity,
        options: line.options,
        ...(line.notes && { notes: line.notes }),
      })),
      locale: "pt-BR",
    });
  };

  const invalid = (key: string) => (errors[key] ? { "aria-invalid": true } : {});

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start">
      <section aria-labelledby="produtos" className="rounded-xl border border-line bg-surface p-4">
        <h2 id="produtos" className="mb-3 text-lg font-bold">
          {t.manualOrder.products}
        </h2>
        <SearchBox value={search} onChange={setSearch} />
        <p className="mt-2 text-sm text-ink-muted">{t.manualOrder.pickProducts}</p>
        {visibleCategories.map(({ category, products }) => (
          <div key={category._id} className="mt-4">
            <h3 className="text-sm font-bold text-ink-muted">{category.name}</h3>
            <ul className="divide-y divide-line">
              {products.map((product) => (
                <li key={product._id}>
                  <button
                    type="button"
                    disabled={!product.available || !category.availableNow}
                    onClick={() => setPicking(product)}
                    className="flex min-h-12 w-full items-center justify-between gap-3 py-2 text-left hover:bg-paper disabled:text-ink-muted"
                  >
                    <span className="font-bold">
                      {product.name}
                      {!product.available && <span className="ml-2 text-sm text-error">{t.menu.soldOut}</span>}
                    </span>
                    <Price product={product} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <form onSubmit={submit} noValidate className="space-y-5 rounded-xl border border-line bg-surface p-4 lg:sticky lg:top-20">
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
            {store.paymentMethods.map((method) => (
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

        <Field id="pedido-obs" label={t.checkout.notes}>
          <textarea id="pedido-obs" rows={2} maxLength={280} value={notes} onChange={(e) => setNotes(e.target.value)} className={textarea} />
        </Field>
        <Field id="pedido-agendar" label={t.manualOrder.schedule} hint={t.manualOrder.scheduleHint}>
          <input id="pedido-agendar" type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} className={input} />
        </Field>

        <dl className="space-y-1 border-t border-line pt-3">
          <div className="flex justify-between">
            <dt>{t.checkout.subtotal}</dt>
            <dd className="tabular-nums">{formatMoney(totals.subtotalCents)}</dd>
          </div>
          {fulfillment === "delivery" && (
            <div className="flex justify-between">
              <dt>{t.checkout.deliveryFee}</dt>
              <dd className="tabular-nums">
                {totals.feePending ? t.checkout.chooseZone : totals.deliveryFeeCents > 0 ? formatMoney(totals.deliveryFeeCents) : t.checkout.free}
              </dd>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold">
            <dt>{t.checkout.total}</dt>
            <dd className="tabular-nums">{formatMoney(totals.totalCents)}</dd>
          </div>
        </dl>

        {create.isError && (
          <p role="alert" className="text-sm font-bold text-error">
            {errorText(create.error, t)}
          </p>
        )}
        <button type="submit" disabled={create.isPending} className={`${button.primary} h-12 w-full`}>
          {create.isPending ? t.manualOrder.submitting : t.manualOrder.submit(formatMoney(totals.totalCents))}
        </button>
      </form>

      {picking && (
        <ProductSheet
          key={picking._id}
          product={picking}
          groups={groups}
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
