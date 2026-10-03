import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Pencil, Plus, Ticket } from "lucide-react";
import { type FormEvent, type InputHTMLAttributes, useEffect, useRef, useState } from "react";
import { ApiError, api } from "../../../api/client";
import { Spinner } from "../../../components/FullScreenMessage";
import { PageHeader } from "../../../components/PageHeader";
import { Field, Switch, button, input, textarea } from "../../../components/ui";
import { useDirtyForm } from "../../../hooks/useDirtyForm";
import { errorText, useLanguage, useT } from "../../../i18n";
import { formatMoney } from "../../../lib/format";
import { couponDraft, couponState, couponTexts, validateCouponDraft, type CouponDraft, type CouponErrors, type CouponInput, type OwnerCoupon } from "../settings/coupons";

const couponsKey = ["owner-coupons"] as const;
type Change = { method: "POST" | "PATCH" | "DELETE"; id?: string; body?: CouponInput | { active: boolean } };

function useCouponChange() {
  const cache = useQueryClient();
  return useMutation<unknown, ApiError, Change>({
    mutationFn: ({ method, id, body }) => api(`/owner/coupons${id ? `/${id}` : ""}`, { method, body }),
    onSuccess: () => { void cache.invalidateQueries({ queryKey: couponsKey }); },
  });
}

function CouponEditor({ coupon, onClose, onDone }: { coupon: OwnerCoupon | null; onClose: () => void; onDone: (removed: boolean) => void }) {
  const t = useT();
  const copy = couponTexts[useLanguage()];
  const [initial] = useState(() => couponDraft(coupon));
  // Snapshot once per opened editor. Background refetches never overwrite a draft.
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<CouponErrors>({});
  const [codeTaken, setCodeTaken] = useState(false);
  const change = useCouponChange();
  const lock = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const dirty = JSON.stringify(initial) !== JSON.stringify(draft);
  useDirtyForm(dirty || change.isPending);
  useEffect(() => { title.current?.focus(); }, []);

  function update<K extends keyof CouponDraft>(key: K, value: CouponDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    if (key === "code") setCodeTaken(false);
    change.reset();
  }

  function close() {
    if (lock.current) return;
    if (!dirty || window.confirm(copy.discard)) onClose();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    const validated = validateCouponDraft(draft);
    setErrors(validated.errors);
    setCodeTaken(false);
    if (!validated.body) {
      const field = Object.keys(validated.errors)[0];
      form.current?.querySelector<HTMLInputElement>(`#coupon-${field}`)?.focus();
      return;
    }
    lock.current = true;
    try {
      await change.mutateAsync({ method: coupon ? "PATCH" : "POST", id: coupon?._id, body: validated.body });
      onDone(false);
    } catch (error) {
      if (error instanceof ApiError && error.code === "COUPON_CODE_TAKEN") {
        setCodeTaken(true);
        form.current?.querySelector<HTMLInputElement>("#coupon-code")?.focus();
      }
    } finally { lock.current = false; }
  }

  async function remove() {
    if (!coupon || lock.current || !window.confirm(`${coupon.code}: ${copy.deleteConfirm}`)) return;
    lock.current = true;
    try {
      await change.mutateAsync({ method: "DELETE", id: coupon._id });
      onDone(true);
    } catch { /* Error displayed next to the actions; keep the draft for retry. */ }
    finally { lock.current = false; }
  }

  const failure = change.error?.code === "COUPON_CODE_TAKEN" ? copy.duplicate : change.error?.code === "INVALID_COUPON" ? copy.invalid : change.error ? errorText(change.error, t) : "";
  const fieldError = (key: keyof CouponDraft) => key === "code" && codeTaken ? copy.duplicate : errors[key] ? copy.errors[errors[key]!] : undefined;
  function textField(key: Exclude<keyof CouponDraft, "active" | "type">, label: string, props: InputHTMLAttributes<HTMLInputElement> = {}, hint?: string) {
    const error = fieldError(key);
    return (
      <Field id={`coupon-${key}`} label={label} hint={hint} error={error}>
        <input id={`coupon-${key}`} value={draft[key]} onChange={(event) => update(key, event.target.value)} className={input}
          aria-invalid={!!error} aria-describedby={error ? `coupon-${key}-erro` : undefined} {...props} />
      </Field>
    );
  }

  return (
    <section className="mx-auto max-w-3xl">
      <button type="button" className={`${button.quiet} mb-3`} onClick={close} disabled={change.isPending}>
        <ArrowLeft aria-hidden className="size-4" />{copy.cancel}
      </button>
      <h1 ref={title} tabIndex={-1} className="mb-6 text-2xl font-bold tracking-tight">{coupon ? `${copy.edit}: ${coupon.code}` : copy.create}</h1>
      <form ref={form} onSubmit={submit} noValidate className="space-y-5">
        <fieldset disabled={change.isPending} className="min-w-0 space-y-5 disabled:opacity-70">
          <div className="space-y-4 rounded-xl border border-line bg-surface p-4 sm:p-5">
            {textField("code", copy.code, { maxLength: 20, autoComplete: "off", autoCapitalize: "characters", spellCheck: false }, copy.codeHint)}
            <Field id="coupon-type" label={copy.type}>
              <select id="coupon-type" className={input} value={draft.type} onChange={(event) => {
                update("type", event.target.value as CouponDraft["type"]);
                update("value", event.target.value === "percent" ? "10" : event.target.value === "fixed" ? "10,00" : "0");
              }}>
                <option value="percent">{copy.percent}</option>
                <option value="fixed">{copy.fixed}</option>
                <option value="free_delivery">{copy.free_delivery}</option>
              </select>
            </Field>
            {draft.type !== "free_delivery" && textField("value", draft.type === "percent" ? copy.valuePercent : copy.valueFixed, { inputMode: draft.type === "percent" ? "numeric" : "decimal", maxLength: 12 })}
            <p className="text-sm text-ink-muted">{draft.type === "free_delivery" ? copy.freeHint : copy.subtotalHint}</p>
            {textField("minOrderCents", copy.minimum, { inputMode: "decimal", maxLength: 12 }, copy.minimumHint)}
            <Switch checked={draft.active} onChange={(active) => update("active", active)} label={copy.active} disabled={change.isPending} />
            <p className="text-sm text-ink-muted">{copy.activeHint}</p>
          </div>
          <section className="space-y-4 rounded-xl border border-line bg-surface p-4 sm:p-5" aria-labelledby="coupon-validity">
            <h2 id="coupon-validity" className="text-lg font-bold">{copy.dates}</h2>
            <p className="text-sm text-ink-muted">{copy.dateHint}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {textField("startsAt", copy.startsAt, { type: "datetime-local", max: "9999-12-31T23:59" })}
              {textField("endsAt", copy.endsAt, { type: "datetime-local", max: "9999-12-31T23:59" })}
            </div>
          </section>
          <section className="space-y-4 rounded-xl border border-line bg-surface p-4 sm:p-5" aria-labelledby="coupon-limits">
            <h2 id="coupon-limits" className="text-lg font-bold">{copy.limits}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {textField("maxUses", copy.maxUses, { inputMode: "numeric", maxLength: 7, placeholder: copy.unlimited }, copy.limitHint)}
              {textField("maxUsesPerCustomer", copy.perCustomer, { inputMode: "numeric", maxLength: 7, placeholder: copy.unlimited }, copy.customerHint)}
            </div>
            {coupon && <p className="font-bold">{copy.uses}: {coupon.uses}{coupon.maxUses != null ? ` / ${coupon.maxUses}` : ""}</p>}
            <p className="text-sm text-ink-muted">{copy.usesHint}</p>
          </section>
          <div className="rounded-xl border border-line bg-surface p-4 sm:p-5">
            <Field id="coupon-description" label={copy.descriptionLabel} hint={copy.descriptionHint} error={fieldError("description")}>
              <textarea id="coupon-description" value={draft.description} onChange={(event) => update("description", event.target.value)} rows={2} maxLength={140}
                className={textarea} aria-invalid={!!errors.description} aria-describedby={errors.description ? "coupon-description-erro" : undefined} />
            </Field>
          </div>
        </fieldset>
        <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
          {(failure || Object.values(errors).some(Boolean)) && <p role="alert" className="font-bold text-error">{failure || copy.validation}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={`${button.primary} flex-1`} disabled={change.isPending}>
              {change.isPending && change.variables?.method !== "DELETE" ? copy.saving : copy.save}
            </button>
            <button type="button" onClick={close} className={button.secondary} disabled={change.isPending}>{copy.cancel}</button>
            {coupon && <button type="button" className={`${button.danger} w-full sm:w-auto`} disabled={change.isPending} onClick={() => { void remove(); }}>
              {change.isPending && change.variables?.method === "DELETE" ? copy.removing : copy.remove}
            </button>}
          </div>
        </div>
      </form>
    </section>
  );
}

export function CouponsPage() {
  const language = useLanguage();
  const copy = couponTexts[language];
  const t = useT();
  const coupons = useQuery({ queryKey: couponsKey, queryFn: () => api<{ coupons: OwnerCoupon[] }>("/owner/coupons").then((data) => data.coupons) });
  const change = useCouponChange();
  const lock = useRef(false);
  const addButton = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState<OwnerCoupon | "new" | null>(null);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState<"saved" | "removed" | "updated" | null>(null);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const close = () => {
    setEditing(null);
    window.requestAnimationFrame(() => addButton.current?.focus());
  };

  if (editing) return <CouponEditor key={editing === "new" ? "new" : editing._id} coupon={editing === "new" ? null : editing} onClose={close}
    onDone={(removed) => { setNotice(removed ? "removed" : "saved"); close(); }} />;

  const list = coupons.data ?? [];
  const visible = list.filter((coupon) => `${coupon.code} ${coupon.description}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const dateFormat = new Intl.DateTimeFormat(language, { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

  async function toggle(coupon: OwnerCoupon) {
    if (lock.current) return;
    lock.current = true;
    setNotice(null);
    try {
      await change.mutateAsync({ method: "PATCH", id: coupon._id, body: { active: !coupon.active } });
      setNotice("updated");
    } catch { /* Keep the persisted switch value; the error provides a retry path. */ }
    finally { lock.current = false; }
  }

  return (
    <>
      <PageHeader title={copy.title} description={copy.description} actions={
        <button ref={addButton} type="button" className={button.primary} disabled={change.isPending} onClick={() => { setNotice(null); change.reset(); setEditing("new"); }}>
          <Plus aria-hidden className="size-5" />{copy.create}
        </button>
      } />
      {notice && <p role="status" className="mb-4 rounded-lg border border-line bg-surface p-3 font-bold text-open">{copy[notice]}</p>}
      {change.error && <p role="alert" className="mb-4 font-bold text-error">{errorText(change.error, t)}</p>}
      {coupons.isPending && <Spinner />}
      {coupons.isError && <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface p-4">
        <p className="text-error">{errorText(coupons.error, t)}</p>
        <button type="button" className={button.secondary} disabled={coupons.isFetching} onClick={() => { void coupons.refetch(); }}>{copy.retry}</button>
      </div>}
      {list.length > 0 && <div className="mb-4 max-w-md">
        <Field id="coupon-search" label={copy.search}><input id="coupon-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} className={input} /></Field>
      </div>}
      {coupons.data && !list.length && <div className="rounded-xl border border-dashed border-line bg-surface p-6 text-ink-muted">
        <Ticket aria-hidden className="mb-3 size-7" /><p>{copy.empty}</p>
      </div>}
      {list.length > 0 && !visible.length && <p className="py-6 text-ink-muted">{copy.noResults}</p>}
      <ul className="space-y-3">
        {visible.map((coupon) => {
          const state = couponState(coupon, now);
          const discount = coupon.type === "percent" ? `${coupon.value}%` : coupon.type === "fixed" ? formatMoney(coupon.value) : copy.free_delivery;
          return <li key={coupon._id} className="rounded-xl border border-line bg-surface p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="break-all text-lg font-bold">{coupon.code}</h2>
                  <span className={`rounded-full bg-paper px-2.5 py-1 text-xs font-bold ${state === "active" ? "text-open" : "text-ink-muted"}`}>{copy.status[state]}</span>
                </div>
                <p className="mt-1 font-bold">{discount} <span className="font-normal text-ink-muted">· {copy.minimumSummary}: {formatMoney(coupon.minOrderCents)}</span></p>
                {coupon.description && <p className="mt-1 break-words text-sm text-ink-muted">{coupon.description}</p>}
              </div>
              <button type="button" className={button.secondary} disabled={change.isPending} aria-label={`${copy.edit}: ${coupon.code}`} onClick={() => { change.reset(); setNotice(null); setEditing(coupon); }}>
                <Pencil aria-hidden className="size-4" />{copy.edit}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-t border-line pt-3">
              <div className="space-y-1 text-sm text-ink-muted">
                <p>{copy.uses}: <strong className="text-ink">{coupon.uses}{coupon.maxUses != null ? ` / ${coupon.maxUses}` : ` · ${copy.unlimited}`}</strong>
                  {coupon.maxUsesPerCustomer != null && ` · ${coupon.maxUsesPerCustomer} ${copy.perCustomerSummary}`}</p>
                <p>{coupon.startsAt && `${copy.from}: ${dateFormat.format(new Date(coupon.startsAt))}`}
                  {coupon.startsAt && coupon.endsAt && " · "}{coupon.endsAt && `${copy.until}: ${dateFormat.format(new Date(coupon.endsAt))}`}
                  {!coupon.startsAt && !coupon.endsAt && copy.noDates}</p>
              </div>
              <Switch checked={coupon.active} onChange={() => { void toggle(coupon); }} disabled={change.isPending || coupons.isFetching}
                label={`${coupon.active ? copy.disable : copy.enable}: ${coupon.code}`} showLabel={false} />
            </div>
          </li>;
        })}
      </ul>
    </>
  );
}
