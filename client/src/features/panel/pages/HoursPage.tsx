import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api, type ApiError } from "../../../api/client";
import type { OwnerStoreResponse } from "../../../api/types";
import { PageHeader } from "../../../components/PageHeader";
import { Field, Switch, button, input } from "../../../components/ui";
import { useDirtyForm } from "../../../hooks/useDirtyForm";
import { errorText, useT } from "../../../i18n";
import { usePanel } from "../PanelLayout";
import { ownerStoreKey } from "../useOwnerStore";
import { statusView } from "../storeStatus";
import { useHoursCopy } from "../settings/hoursCopy";
import { HOUR_DAYS, hoursDraft, validateHours, todayForHours, type HourDay, type HourInterval, type StoreHours, type HoursErrors } from "../settings/hoursForm";
import { SettingsSection } from "./StorePage";

export function HoursPage() {
  const { store, opening } = usePanel(); const c = useHoursCopy(); const t = useT(); const cache = useQueryClient();
  const [baseline, setBaseline] = useState(() => hoursDraft(store.hours));
  const [draft, setDraft] = useState(baseline); const [errors, setErrors] = useState<HoursErrors>({});
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline); useDirtyForm(dirty);
  const save = useMutation<OwnerStoreResponse, ApiError, StoreHours>({
    mutationFn: (body) => api("/owner/store/hours", { method: "PUT", body }),
    onSuccess: (data) => { const next = hoursDraft(data.store.hours); setBaseline(next); setDraft(next); cache.setQueryData(ownerStoreKey, data); cache.invalidateQueries({ queryKey: ["public-store"] }); cache.invalidateQueries({ queryKey: ["public-stores"] }); },
  });
  const change = (value: StoreHours) => { setDraft(value); setErrors({}); save.reset(); };
  const setDay = (day: HourDay, intervals: HourInterval[]) => change({ ...draft, weekly: { ...draft.weekly, [day]: intervals } });
  const errorFor = (path: string) => errors[path] ? c[errors[path]] : undefined;
  function intervals(items: HourInterval[], path: string, onChange: (next: HourInterval[]) => void) {
    return <div className="space-y-3">
      {items.map((item, index) => <div key={index} className="flex flex-wrap items-end gap-3">
        {(["open", "close"] as const).map((key) => { const id = `${path}.${index}.${key}`; return <div key={key} className="min-w-28 flex-1"><Field id={id} label={c[key]} error={errorFor(id)}><input id={id} className={input} value={item[key]} placeholder="HH:MM" maxLength={5} inputMode="text" pattern={key === "close" ? "([01][0-9]|2[0-3]):[0-5][0-9]|24:00" : "([01][0-9]|2[0-3]):[0-5][0-9]"} required aria-invalid={!!errors[id]} aria-describedby={errors[id] ? `${id}-erro` : undefined} onChange={(e) => onChange(items.map((v, i) => i === index ? { ...v, [key]: e.target.value } : v))} /></Field></div>; })}
        <button type="button" className={button.danger} aria-label={`${c.removeInterval} ${index + 1}`} onClick={() => onChange(items.filter((_, i) => i !== index))}>{c.removeInterval}</button>
        {item.close < item.open && <p className="w-full text-sm text-ink-muted">{c.overnight}</p>}
      </div>)}
      {errorFor(path) && <p role="alert" className="text-error">{errorFor(path)}</p>}
      <button type="button" className={button.secondary} disabled={items.length >= 4} onClick={() => onChange([...items, { open: "18:00", close: "23:00" }])}>{c.addInterval}</button>
    </div>;
  }
  function submit(event: FormEvent) { event.preventDefault(); if (save.isPending) return; const issues = validateHours(draft); setErrors(issues); if (Object.keys(issues).length) document.getElementById(Object.keys(issues)[0])?.focus(); else save.mutate(draft); }
  const status = statusView(opening);
  return <><PageHeader title={c.title} description={c.description} />
    <div className="mb-5 rounded-xl border border-line bg-surface p-4"><h2 className="font-bold">{c.statusTitle}: {status.label}</h2><p className="mt-1 text-sm text-ink-muted">{store.override ? c.manual : c.automatic}</p>{status.detail && <p className="mt-1 text-sm">{status.detail}</p>}</div>
    <form onSubmit={submit} className="space-y-5">
      <fieldset disabled={save.isPending} className="space-y-5 disabled:opacity-70">
        <SettingsSection title={c.weekly}>
          <p className="text-sm text-ink-muted">{c.weeklyHelp} {c.timeHelp}</p>
          {HOUR_DAYS.map((day) => <div key={day} className="space-y-3 border-t border-line pt-4">
            <h3 className="font-bold">{c.days[day]}</h3>
            <Switch label={c.activeDay} checked={draft.weekly[day].length > 0} onChange={(enabled) => setDay(day, enabled ? [{ open: "18:00", close: "23:00" }] : [])} />
            {draft.weekly[day].length ? intervals(draft.weekly[day], `weekly.${day}`, (next) => setDay(day, next)) : <p className="text-sm text-ink-muted">{c.closed}</p>}
            <Field id={`copy-${day}`} label={c.copyFrom}><select id={`copy-${day}`} className={input} value="" onChange={(e) => { const source = e.target.value as HourDay; if (source && window.confirm(c.copyConfirm)) setDay(day, draft.weekly[source].map((v) => ({ ...v }))); }}><option value="">{c.copyPlaceholder}</option>{HOUR_DAYS.filter((v) => v !== day).map((v) => <option key={v} value={v}>{c.days[v]}</option>)}</select></Field>
          </div>)}
          {!HOUR_DAYS.some((day) => draft.weekly[day].length) && <p className="text-warning">{c.noWeekly}</p>}
        </SettingsSection>
        <SettingsSection title={c.exceptions}>
          <p className="text-sm text-ink-muted">{c.exceptionsHelp}</p>
          {!draft.exceptions.length && <p className="text-ink-muted">{c.noExceptions}</p>}
          {draft.exceptions.map((exception, index) => {
            const path = `exceptions.${index}`;
            const update = (patch: Partial<typeof exception>) => change({ ...draft, exceptions: draft.exceptions.map((v, i) => i === index ? { ...v, ...patch } : v) });
            return <div key={index} className="space-y-3 rounded-xl border border-line p-4">
              <Field id={`${path}.date`} label={c.date} error={errorFor(`${path}.date`)}><input id={`${path}.date`} type="date" min={todayForHours()} required className={input} value={exception.date} onChange={(e) => update({ date: e.target.value })} /></Field>
              <Field id={`${path}.note`} label={c.note}><input id={`${path}.note`} maxLength={60} className={input} value={exception.note} onChange={(e) => update({ note: e.target.value })} /></Field>
              <Switch label={c.closedDate} checked={exception.closed} onChange={(closed) => update({ closed, intervals: closed ? [] : exception.intervals.length ? exception.intervals : [{ open: "18:00", close: "23:00" }] })} />
              {!exception.closed && intervals(exception.intervals, `${path}.intervals`, (next) => update({ intervals: next }))}
              <button type="button" className={button.danger} onClick={() => { if (window.confirm(c.removeExceptionConfirm)) change({ ...draft, exceptions: draft.exceptions.filter((_, i) => i !== index) }); }}>{c.removeException}</button>
            </div>;
          })}
          <button type="button" className={button.secondary} disabled={draft.exceptions.length >= 60} onClick={() => change({ ...draft, exceptions: [...draft.exceptions, { date: todayForHours(), closed: true, note: "", intervals: [] }] })}>{c.addException}</button>
        </SettingsSection>
      </fieldset>
      {!!Object.keys(errors).length && <p role="alert" className="text-error">{c.correctErrors}</p>}
      {save.isError && <p role="alert" className="text-error">{errorText(save.error, t)}</p>}
      {save.isSuccess && <p role="status" className="text-success">{c.saved}</p>}
      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-line bg-paper py-4"><button className={button.primary} disabled={save.isPending || !dirty}>{save.isPending ? c.saving : c.save}</button><button type="button" className={button.secondary} disabled={save.isPending || !dirty} onClick={() => { if (window.confirm(c.discardConfirm)) { setDraft(baseline); setErrors({}); save.reset(); } }}>{c.discard}</button>{dirty && <span className="text-sm text-ink-muted">{c.unsaved}</span>}</div>
    </form>
  </>;
}
