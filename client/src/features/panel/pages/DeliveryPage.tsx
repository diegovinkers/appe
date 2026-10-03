import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api, type ApiError } from "../../../api/client";
import type { OwnerStoreResponse } from "../../../api/types";
import { PageHeader } from "../../../components/PageHeader";
import { Field, Switch, button, input } from "../../../components/ui";
import { useDirtyForm } from "../../../hooks/useDirtyForm";
import { useLanguage, useT, errorText } from "../../../i18n";
import { newId } from "../../../lib/id";
import { usePanel } from "../PanelLayout";
import { ownerStoreKey } from "../useOwnerStore";
import { deliveryCopy } from "../settings/deliveryCopy";
import { deliveryDraft, validateDelivery, type DeliveryDraft, type DeliveryErrors, type ZoneDraft } from "../settings/delivery";
import { SettingsSection } from "./StorePage";

export function DeliveryPage() {
  const { store } = usePanel();
  const c = deliveryCopy[useLanguage()]; const t = useT(); const cache = useQueryClient();
  const [baseline, setBaseline] = useState(() => deliveryDraft(store));
  const [draft, setDraft] = useState(baseline);
  const [errors, setErrors] = useState<DeliveryErrors>({});
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  useDirtyForm(dirty);
  const save = useMutation<OwnerStoreResponse, ApiError, NonNullable<ReturnType<typeof validateDelivery>["body"]>>({
    mutationFn: (body) => api("/owner/store", { method: "PATCH", body }),
    onSuccess: (data) => {
      const next = deliveryDraft(data.store); setBaseline(next); setDraft(next);
      cache.setQueryData(ownerStoreKey, data);
      cache.invalidateQueries({ queryKey: ["public-store"] }); cache.invalidateQueries({ queryKey: ["public-stores"] });
    },
  });
  function update<K extends keyof DeliveryDraft>(key: K, value: DeliveryDraft[K]) { setDraft((d) => ({ ...d, [key]: value })); setErrors({}); save.reset(); }
  function zoneUpdate(key: string, changes: Partial<ZoneDraft>) { update("zones", draft.zones.map((zone) => zone.key === key ? { ...zone, ...changes } : zone)); }
  function amount(key: "fee" | "minimum" | "freeFrom" | "deliveryMin" | "deliveryMax" | "pickupMin" | "pickupMax", label: string, hint?: string) {
    return <Field id={key} label={label} error={errors[key] && c.errors[errors[key]]} hint={hint}><input id={key} className={input} inputMode={key.endsWith("Min") || key.endsWith("Max") ? "numeric" : "decimal"} value={draft[key]} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `${key}-erro` : undefined} onChange={(e) => update(key, e.target.value)} /></Field>;
  }
  function submit(event: FormEvent) {
    event.preventDefault(); if (save.isPending) return;
    const result = validateDelivery(draft); setErrors(result.errors);
    if (result.body) save.mutate(result.body);
    else document.getElementById(Object.keys(result.errors)[0])?.focus();
  }
  return <><PageHeader title={c.title} description={c.description} />
    <form className="space-y-5" onSubmit={submit}>
      <fieldset disabled={save.isPending} className="space-y-5 disabled:opacity-70">
        <SettingsSection title={c.fulfillment}>
          <Switch label={c.delivery} checked={draft.delivery} onChange={(v) => update("delivery", v)} />
          <Switch label={c.pickup} checked={draft.pickup} onChange={(v) => update("pickup", v)} />
          {errors.fulfillment && <p role="alert" className="text-error">{c.errors.fulfillment}</p>}
        </SettingsSection>
        <SettingsSection title={c.charges}>
          <Field id="delivery-mode" label={c.mode}><select id="delivery-mode" className={input} value={draft.mode} onChange={(e) => update("mode", e.target.value as DeliveryDraft["mode"])}><option value="fixed">{c.fixed}</option><option value="zones">{c.byZone}</option></select></Field>
          {draft.mode === "fixed" && amount("fee", c.fixedFee, c.moneyHint)}
          {amount("minimum", c.minimum, c.minimumHint)}
          <Switch label={c.freeEnabled} checked={draft.freeEnabled} onChange={(v) => update("freeEnabled", v)} />
          {draft.freeEnabled && amount("freeFrom", c.freeFrom, c.freeHint)}
        </SettingsSection>
        <SettingsSection title={c.estimates}>
          <p className="text-sm text-ink-muted">{c.estimatesHint}</p>
          <div className="grid gap-4 sm:grid-cols-2">{amount("deliveryMin", `${c.deliveryTime} — ${c.minMinutes}`)}{amount("deliveryMax", `${c.deliveryTime} — ${c.maxMinutes}`)}{amount("pickupMin", `${c.pickupTime} — ${c.minMinutes}`)}{amount("pickupMax", `${c.pickupTime} — ${c.maxMinutes}`)}</div>
        </SettingsSection>
        <SettingsSection title={c.zones}>
          <p className="text-sm text-ink-muted">{c.zonesHint}</p>
          {errors.zones && <p role="alert" className="text-error">{c.errors[errors.zones]}</p>}
          {!draft.zones.length && <p className="text-ink-muted">{c.noZones}</p>}
          {draft.zones.map((zone, index) => <div key={zone.key} className="space-y-3 rounded-xl border border-line p-4">
            <h3 className="font-bold">{zone.name || `${c.newZone} ${index + 1}`}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {([ ["name", c.name], ["fee", c.fee], ["minimum", c.zoneMinimum], ["estimateMin", c.minMinutes], ["estimateMax", c.maxMinutes] ] as const).map(([key, label]) => {
                const id = `zone-${zone.key}-${key}`;
                return <Field key={key} id={id} label={label} error={errors[id] && c.errors[errors[id]]} hint={key === "minimum" ? c.inherited : undefined}><input id={id} className={input} value={zone[key]} maxLength={key === "name" ? 60 : 12} aria-invalid={!!errors[id]} aria-describedby={errors[id] ? `${id}-erro` : undefined} inputMode={key === "name" ? "text" : key.startsWith("estimate") ? "numeric" : "decimal"} onChange={(e) => zoneUpdate(zone.key, { [key]: e.target.value })} /></Field>;
              })}
            </div>
            <p className="text-sm text-ink-muted">{c.zoneTimes}</p>
            <div className="flex flex-wrap items-center justify-between gap-3"><Switch label={c.active} checked={zone.active} onChange={(active) => zoneUpdate(zone.key, { active })} /><button type="button" className={button.danger} onClick={() => { if (window.confirm(c.removeConfirm)) update("zones", draft.zones.filter((z) => z.key !== zone.key)); }}>{c.remove}</button></div>
          </div>)}
          <button type="button" className={button.secondary} disabled={draft.zones.length >= 100} onClick={() => update("zones", [...draft.zones, { key: newId(), name: "", fee: "0", minimum: "", estimateMin: "", estimateMax: "", active: true }])}>{c.addZone}</button>
        </SettingsSection>
      </fieldset>
      {Object.keys(errors).length > 0 && <p role="alert" className="text-error">{c.fixErrors}</p>}
      {save.isError && <p role="alert" className="text-error">{errorText(save.error, t)}</p>}
      {save.isSuccess && <p role="status" className="text-success">{c.saved}</p>}
      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-line bg-paper py-4"><button className={button.primary} disabled={save.isPending || !dirty}>{save.isPending ? c.saving : c.save}</button><button type="button" className={button.secondary} disabled={save.isPending || !dirty} onClick={() => { if (window.confirm(c.discardConfirm)) { setDraft(baseline); setErrors({}); save.reset(); } }}>{c.discard}</button><span className="text-sm text-ink-muted">{dirty ? c.unsaved : c.upToDate}</span></div>
    </form>
  </>;
}
