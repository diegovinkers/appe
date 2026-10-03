import { useMutation } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router";
import { type ApiError, api } from "../../api/client";
import type { Coupon, CouponCheck, CustomerAddress, OrderReceipt, PaymentMethod, PublicOrderInput, PublicStore } from "../../api/types";
import { Sheet } from "../../components/Sheet";
import { errorText, useLanguage, useT } from "../../i18n";
import { formatMoney } from "../../lib/format";
import { parseMoney } from "../../lib/money";
import { formatPhone } from "../../lib/phone";
import { newId } from "../../lib/id";
import { normalize } from "../../lib/text";
import { addressLine, useCustomer, useRefreshAccount } from "../account/account";
import { type CustomerDetails, loadCustomer, saveCustomer } from "./customer";
import type { ResolvedLine } from "./lines";
import { orderTotals } from "./pricing";

type Props = {
  store: PublicStore;
  slug: string;
  lines: ResolvedLine[];
  onClose: () => void;
  onPlaced: (receipt: OrderReceipt) => void;
};

type FieldName = "fulfillment" | "zone" | "street" | "number" | "name" | "phone" | "payment" | "changeFor";
const FORM_ID = "form-pedido";
// Qué aviso de error corresponde a cada dato del comprador.
const FIELD_OF: Partial<Record<keyof CustomerDetails, FieldName>> = {
  fulfillment: "fulfillment",
  zoneId: "zone",
  neighborhood: "zone",
  street: "street",
  number: "number",
  name: "name",
  phone: "phone",
  paymentMethod: "payment",
};
const fieldId = (name: FieldName) => `campo-${name}`;
// La opción "Outro endereço" entre las direcciones guardadas de la cuenta.
const OTHER = "outro";

// Los errores de validación del backend, en el campo que corresponde.
const SERVER_FIELDS: Record<string, FieldName> = {
  "customer.name": "name",
  "customer.phone": "phone",
  "address.street": "street",
  "address.number": "number",
  "address.neighborhood": "zone",
  "address.zoneId": "zone",
  changeForCents: "changeFor",
};

const inputClass = "h-12 w-full rounded-lg border border-line bg-surface px-3 aria-invalid:border-closed";

function Field({ name, label, error, hint, children }: { name: FieldName | "reference" | "notes" | "coupon"; label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={`campo-${name}`} className="mb-1.5 block font-bold">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`campo-${name}-erro`} className="mt-1 text-sm font-bold text-error">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1 text-sm text-ink-muted">{hint}</p>
      )}
    </div>
  );
}

function Choice({ name, checked, onChange, title, detail, id }: { name: string; checked: boolean; onChange: () => void; title: string; detail?: string; id?: string }) {
  return (
    <label
      className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 ${
        checked ? "border-(--brand) ring-1 ring-(--brand)" : "border-line"
      }`}
    >
      <input id={id} type="radio" name={name} checked={checked} onChange={onChange} className="size-5 shrink-0 accent-(--brand)" />
      <span>
        <span className="block font-bold">{title}</span>
        {detail && <span className="block text-sm text-ink-muted">{detail}</span>}
      </span>
    </label>
  );
}

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="space-y-4 border-t border-line px-4 py-5 first:border-t-0">
    <h3 className="text-lg font-bold">{title}</h3>
    {children}
  </section>
);

export function CheckoutSheet({ store, slug, lines, onClose, onPlaced }: Props) {
  const [params] = useSearchParams();
  const location = useLocation();
  const t = useT();
  const language = useLanguage();
  const fulfillments = (["delivery", "pickup"] as const).filter((option) => store.fulfillment[option]);
  const zones = store.deliveryMode === "zones";

  // Lo que el comprador usó la vez pasada, si sigue valiendo en este local.
  const [form, setForm] = useState<CustomerDetails>(() => {
    const saved = loadCustomer();
    return {
      ...saved,
      fulfillment: saved.fulfillment && store.fulfillment[saved.fulfillment] ? saved.fulfillment : fulfillments[0],
      zoneId: store.deliveryZones.some((zone) => zone._id === saved.zoneId) ? saved.zoneId : "",
      paymentMethod: saved.paymentMethod && store.paymentMethods.includes(saved.paymentMethod) ? saved.paymentMethod : undefined,
    };
  });
  // Con la cuenta: nombre, WhatsApp y la última dirección vienen de ahí. Si la cuenta llega
  // después de abrir, se completa en ese momento (una vez).
  const account = useCustomer().data ?? null;
  const refreshAccount = useRefreshAccount();
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null);
  const [addressChoice, setAddressChoice] = useState(OTHER);
  const [editingYou, setEditingYou] = useState(false);
  // La zona de una dirección guardada es la que se llama igual que su barrio.
  const fromSaved = (address: CustomerAddress) => ({
    street: address.street,
    number: address.number,
    neighborhood: address.neighborhood,
    reference: address.reference,
    zoneId: store.deliveryZones.find((z) => normalize(z.name.trim()) === normalize(address.neighborhood.trim()))?._id ?? "",
  });
  if (account && prefilledFor !== account._id) {
    const first = account.addresses[0];
    setPrefilledFor(account._id);
    setForm((current) => ({ ...current, name: account.name, phone: formatPhone(account.phone), ...(first && fromSaved(first)) }));
    setAddressChoice(first?._id ?? OTHER);
  }
  const [changeFor, setChangeFor] = useState("");
  const [notes, setNotes] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  // El mismo id en cada reintento: si el primer envío llegó, el backend no lo duplica.
  const [clientOrderId] = useState(newId);

  // Al corregir un campo, su aviso de error se va.
  const clearError = (name: FieldName) => setErrors((current) => (current[name] ? { ...current, [name]: undefined } : current));
  const chooseAddress = (address: CustomerAddress | null) => {
    setAddressChoice(address?._id ?? OTHER);
    setForm((current) => ({
      ...current,
      ...(address ? fromSaved(address) : { street: "", number: "", neighborhood: "", reference: "", zoneId: "" }),
    }));
    for (const name of ["zone", "street", "number"] as const) clearError(name);
  };
  const update = <K extends keyof CustomerDetails>(field: K, value: CustomerDetails[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    const name = FIELD_OF[field];
    if (name) clearError(name);
  };
  const isDelivery = form.fulfillment === "delivery";
  const savedAddresses = account?.addresses ?? [];
  const usingSaved = savedAddresses.length > 0 && addressChoice !== OTHER;
  const subtotalCents = lines.reduce((sum, line) => sum + line.totalCents, 0);
  const totals = orderTotals({ store, subtotalCents, fulfillment: form.fulfillment ?? "pickup", zoneId: form.zoneId, coupon });
  const zone = store.deliveryZones.find((z) => z._id === form.zoneId);
  const deliveryTime = { min: zone?.estimateMin ?? store.estimates.deliveryMin, max: zone?.estimateMax ?? store.estimates.deliveryMax };

  const checkCoupon = useMutation<CouponCheck, ApiError, string>({
    mutationFn: (code) => api<CouponCheck>(`/public/stores/${encodeURIComponent(slug)}/coupons/validate`, { method: "POST", body: { code } }),
    onSuccess: (data) => setCoupon(data.coupon),
  });

  const place = useMutation<OrderReceipt, ApiError, PublicOrderInput>({
    mutationFn: (body) => api<OrderReceipt>(`/public/stores/${encodeURIComponent(slug)}/orders`, { method: "POST", body }),
    onSuccess: (receipt) => {
      saveCustomer(form);
      if (account) refreshAccount();
      onPlaced(receipt);
    },
    onError: (error) => {
      if (error.code !== "VALIDATION_ERROR" || !Array.isArray(error.details)) return;
      const found: Partial<Record<FieldName, string>> = {};
      for (const detail of error.details as { path?: string }[]) {
        const field = detail.path && SERVER_FIELDS[detail.path];
        if (field) found[field] = field === "phone" ? t.checkout.invalidPhone : t.checkout.checkField;
      }
      setErrors(found);
    },
  });

  function validate() {
    const found: Partial<Record<FieldName, string>> = {};
    if (!form.fulfillment) found.fulfillment = t.checkout.chooseOne;
    if (isDelivery) {
      if (zones ? !form.zoneId : !form.neighborhood.trim()) found.zone = zones ? t.checkout.chooseOne : t.checkout.required;
      if (!form.street.trim()) found.street = t.checkout.required;
      if (!form.number.trim()) found.number = t.checkout.required;
    }
    if (!form.name.trim()) found.name = t.checkout.required;
    if (!form.phone.trim()) found.phone = t.checkout.required;
    else if (form.phone.replace(/\D/g, "").length < 8) found.phone = t.checkout.invalidPhone;
    if (!form.paymentMethod) found.payment = t.checkout.chooseOne;
    const change = parseMoney(changeFor);
    if (form.paymentMethod === "cash" && change != null && change < totals.totalCents) found.changeFor = t.checkout.changeTooLow;
    return found;
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    const first = (Object.keys(found) as FieldName[])[0];
    if (first) {
      document.getElementById(fieldId(first))?.focus();
      return;
    }
    const change = parseMoney(changeFor);
    place.mutate({
      acquisitionSource: params.get("origem") === "directory" ? "directory" : "direct",
      clientOrderId,
      customer: { name: form.name.trim(), phone: form.phone.trim() },
      fulfillment: form.fulfillment!,
      ...(isDelivery && {
        address: {
          street: form.street.trim(),
          number: form.number.trim(),
          ...(zones ? { zoneId: form.zoneId } : { neighborhood: form.neighborhood.trim() }),
          ...(form.reference.trim() && { reference: form.reference.trim() }),
        },
      }),
      paymentMethod: form.paymentMethod!,
      ...(form.paymentMethod === "cash" && change != null && { changeForCents: change }),
      ...(notes.trim() && { notes: notes.trim() }),
      items: lines.map(({ line }) => ({
        productId: line.productId,
        quantity: line.quantity,
        options: line.options,
        ...(line.notes && { notes: line.notes }),
      })),
      ...(coupon && { couponCode: coupon.code }),
      locale: language,
    });
  };

  const invalid = (name: FieldName) => (errors[name] ? { "aria-invalid": true, "aria-describedby": `${fieldId(name)}-erro` } : {});
  const blocked = !store.isOpen || totals.missingForMinimumCents > 0 || place.isPending;

  return (
    <Sheet
      open
      title={t.checkout.title}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          {place.isError && place.error.code !== "VALIDATION_ERROR" && (
            <p role="alert" className="text-sm font-bold text-error">
              {errorText(place.error, t)}
            </p>
          )}
          {!store.isOpen && <p className="text-sm font-bold text-error">{t.checkout.closed}</p>}
          <button
            type="submit"
            form={FORM_ID}
            disabled={blocked}
            className="h-12 w-full rounded-xl bg-(--brand) font-bold text-(--on-brand) disabled:bg-line disabled:text-ink-muted"
          >
            {place.isPending ? t.checkout.submitting : t.checkout.submit(formatMoney(totals.totalCents))}
          </button>
        </div>
      }
    >
      <form id={FORM_ID} onSubmit={submit} noValidate>
        <Section title={t.checkout.howToReceive}>
          <div role="radiogroup" aria-label={t.checkout.howToReceive} className="grid gap-2 sm:grid-cols-2">
            {fulfillments.map((option, index) => (
              <Choice
                key={option}
                id={index === 0 ? fieldId("fulfillment") : undefined}
                name="entrega"
                checked={form.fulfillment === option}
                onChange={() => update("fulfillment", option)}
                title={option === "delivery" ? t.checkout.delivery : t.checkout.pickup}
                detail={
                  option === "delivery"
                    ? t.menu.deliveryTime(deliveryTime.min, deliveryTime.max)
                    : t.menu.pickupTime(store.estimates.pickupMin, store.estimates.pickupMax)
                }
              />
            ))}
          </div>

          {isDelivery ? (
            <>
              {savedAddresses.length > 0 && (
                <div>
                  <p id="rotulo-endereco" className="mb-1.5 font-bold">
                    {t.account.savedAddresses}
                  </p>
                  <div role="radiogroup" aria-labelledby="rotulo-endereco" className="grid gap-2">
                    {savedAddresses.map((address) => (
                      <Choice
                        key={address._id}
                        name="endereco"
                        checked={addressChoice === address._id}
                        onChange={() => chooseAddress(address)}
                        title={address.label || addressLine(address)}
                        detail={address.label ? addressLine(address) : address.reference || undefined}
                      />
                    ))}
                    <Choice
                      name="endereco"
                      checked={addressChoice === OTHER}
                      onChange={() => chooseAddress(null)}
                      title={t.account.otherAddress}
                    />
                  </div>
                </div>
              )}
              {/* Con una dirección guardada, la zona solo se pide si no se reconoce su barrio. */}
              {usingSaved && !(zones && !form.zoneId) ? null : zones ? (
                <Field name="zone" label={t.checkout.zone} error={errors.zone}>
                  <select
                    id={fieldId("zone")}
                    value={form.zoneId}
                    onChange={(event) => update("zoneId", event.target.value)}
                    className={inputClass}
                    {...invalid("zone")}
                  >
                    <option value="">{t.checkout.chooseZone}</option>
                    {store.deliveryZones.map((z) => (
                      <option key={z._id} value={z._id}>
                        {t.checkout.zoneFee(z.name, z.feeCents > 0 ? formatMoney(z.feeCents) : t.checkout.free)}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : (
                <Field name="zone" label={t.checkout.neighborhood} error={errors.zone}>
                  <input
                    id={fieldId("zone")}
                    value={form.neighborhood}
                    onChange={(event) => update("neighborhood", event.target.value)}
                    autoComplete="address-level3"
                    maxLength={80}
                    className={inputClass}
                    {...invalid("zone")}
                  />
                </Field>
              )}
              {!usingSaved && (
                <>
                  <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
                    <Field name="street" label={t.checkout.street} error={errors.street}>
                      <input
                        id={fieldId("street")}
                        value={form.street}
                        onChange={(event) => update("street", event.target.value)}
                        autoComplete="address-line1"
                        maxLength={120}
                        className={inputClass}
                        {...invalid("street")}
                      />
                    </Field>
                    <Field name="number" label={t.checkout.number} error={errors.number}>
                      <input
                        id={fieldId("number")}
                        value={form.number}
                        onChange={(event) => update("number", event.target.value)}
                        inputMode="numeric"
                        maxLength={20}
                        className={inputClass}
                        {...invalid("number")}
                      />
                    </Field>
                  </div>
                  <Field name="reference" label={t.checkout.reference}>
                    <input
                      id="campo-reference"
                      value={form.reference}
                      onChange={(event) => update("reference", event.target.value)}
                      maxLength={120}
                      className={inputClass}
                    />
                  </Field>
                </>
              )}
            </>
          ) : (
            store.address && (
              <p className="rounded-xl bg-paper px-4 py-3">
                <span className="font-bold">{t.menu.address}: </span>
                {store.address}
              </p>
            )
          )}
        </Section>

        <Section title={t.checkout.you}>
          {account && !editingYou && !errors.name && !errors.phone ? (
            <div className="flex items-center gap-3 rounded-xl bg-paper py-2 pr-1 pl-4">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{t.account.usingAccount(form.name)}</span>
                <span className="block text-sm text-ink-muted tabular-nums">{form.phone}</span>
              </span>
              <button
                type="button"
                onClick={() => setEditingYou(true)}
                className="h-11 shrink-0 rounded-lg px-3 font-bold hover:bg-surface"
              >
                {t.account.change}
              </button>
            </div>
          ) : (
            <>
              <Field name="name" label={t.checkout.name} error={errors.name}>
                <input
                  id={fieldId("name")}
                  value={form.name}
                  onChange={(event) => update("name", event.target.value)}
                  autoComplete="name"
                  maxLength={60}
                  className={inputClass}
                  {...invalid("name")}
                />
              </Field>
              <Field name="phone" label={t.checkout.phone} error={errors.phone} hint={t.checkout.phoneHint}>
                <input
                  id={fieldId("phone")}
                  type="tel"
                  value={form.phone}
                  onChange={(event) => update("phone", event.target.value)}
                  autoComplete="tel"
                  inputMode="tel"
                  maxLength={30}
                  className={inputClass}
                  {...invalid("phone")}
                />
              </Field>
              {!account && (
                <Link
                  to={`/conta?modo=entrar&volta=${encodeURIComponent(location.pathname + location.search)}`}
                  className="inline-block py-2 font-bold underline underline-offset-4"
                >
                  {t.account.haveAccount}
                </Link>
              )}
            </>
          )}
        </Section>

        <Section title={t.checkout.payment}>
          <p className="-mt-2 text-sm text-ink-muted">{t.checkout.paymentHint}</p>
          <div role="radiogroup" aria-label={t.checkout.payment} className="grid gap-2 sm:grid-cols-3">
            {store.paymentMethods.map((method: PaymentMethod, index) => (
              <Choice
                key={method}
                id={index === 0 ? fieldId("payment") : undefined}
                name="pagamento"
                checked={form.paymentMethod === method}
                onChange={() => update("paymentMethod", method)}
                title={t.checkout.methods[method]}
              />
            ))}
          </div>
          {errors.payment && <p className="text-sm font-bold text-error">{errors.payment}</p>}
          {form.paymentMethod === "cash" && (
            <Field name="changeFor" label={t.checkout.changeFor} error={errors.changeFor} hint={t.checkout.changeHint}>
              <input
                id={fieldId("changeFor")}
                value={changeFor}
                onChange={(event) => {
                  setChangeFor(event.target.value);
                  clearError("changeFor");
                }}
                inputMode="decimal"
                placeholder="R$"
                maxLength={12}
                className={inputClass}
                {...invalid("changeFor")}
              />
            </Field>
          )}
        </Section>

        <Section title={t.checkout.notes}>
          <textarea
            id="campo-notes"
            aria-label={t.checkout.notes}
            rows={2}
            maxLength={280}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="block w-full rounded-lg border border-line bg-surface px-3 py-2"
          />
          {coupon ? (
            <p className="flex items-center justify-between gap-3 rounded-xl bg-paper px-4 py-3">
              <span className="font-bold">{t.checkout.couponApplied(coupon.code)}</span>
              <button type="button" onClick={() => setCoupon(null)} className="h-11 underline underline-offset-4">
                {t.checkout.removeCoupon}
              </button>
            </p>
          ) : (
            <Field name="coupon" label={t.checkout.coupon} error={checkCoupon.isError ? errorText(checkCoupon.error, t) : undefined}>
              <div className="flex gap-2">
                <input
                  id="campo-coupon"
                  value={couponCode}
                  onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
                  autoCapitalize="characters"
                  maxLength={20}
                  className={inputClass}
                />
                <button
                  type="button"
                  disabled={!couponCode.trim() || checkCoupon.isPending}
                  onClick={() => checkCoupon.mutate(couponCode.trim())}
                  className="h-12 shrink-0 rounded-lg border border-line px-4 font-bold hover:bg-paper disabled:text-ink-muted"
                >
                  {t.checkout.applyCoupon}
                </button>
              </div>
            </Field>
          )}
        </Section>

        <Section title={t.checkout.total}>
          <dl className="space-y-1.5">
            <div className="flex justify-between">
              <dt>{t.checkout.subtotal}</dt>
              <dd className="tabular-nums">{formatMoney(totals.subtotalCents)}</dd>
            </div>
            {isDelivery && (
              <div className="flex justify-between">
                <dt>{t.checkout.deliveryFee}</dt>
                <dd className="tabular-nums">
                  {totals.feePending ? (
                    <span className="text-ink-muted">{t.checkout.chooseZone}</span>
                  ) : totals.deliveryFeeCents > 0 ? (
                    formatMoney(totals.deliveryFeeCents)
                  ) : (
                    t.checkout.free
                  )}
                </dd>
              </div>
            )}
            {totals.discountCents > 0 && (
              <div className="flex justify-between">
                <dt>{t.checkout.discount}</dt>
                <dd className="tabular-nums">− {formatMoney(totals.discountCents)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-line pt-2 text-lg font-bold">
              <dt>{t.checkout.total}</dt>
              <dd className="tabular-nums">{formatMoney(totals.totalCents)}</dd>
            </div>
          </dl>
          {totals.missingForMinimumCents > 0 && (
            <p role="status" className="font-bold text-warning">
              {t.checkout.missingForMinimum(formatMoney(totals.missingForMinimumCents))}
            </p>
          )}
        </Section>
      </form>
    </Sheet>
  );
}
