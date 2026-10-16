import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api, type ApiError } from "../../../api/client";
import type { OwnerStoreResponse } from "../../../api/types";
import { PageHeader } from "../../../components/PageHeader";
import { Field, Switch, button, input } from "../../../components/ui";
import { useDirtyForm } from "../../../hooks/useDirtyForm";
import { errorText, useT } from "../../../i18n";
import { formatMinutes } from "../../../lib/format";
import { usePanel } from "../PanelLayout";
import { ownerStoreKey } from "../useOwnerStore";
import { statusView } from "../storeStatus";
import { useHoursCopy } from "../settings/hoursCopy";
import { DAYS_AHEAD_OPTIONS, DAY_START_OPTIONS, HOUR_DAYS, LEAD_OPTIONS, schedulingDraft, withCurrent, type Scheduling, hoursDraft, validateHours, todayForHours, type HourDay, type HourInterval, type StoreHours, type HoursErrors } from "../settings/hoursForm";
import { SettingsSection } from "./StorePage";

export function HoursPage() {
  const { store, opening } = usePanel(); const c = useHoursCopy(); const t = useT(); const cache = useQueryClient();
  const [baseline, setBaseline] = useState(() => hoursDraft(store.hours));
  const [draft, setDraft] = useState(baseline); const [errors, setErrors] = useState<HoursErrors>({});
  // Los pedidos programados se guardan con el mismo botón, pero van en los datos del local.
  const [schedulingBase, setSchedulingBase] = useState(() => schedulingDraft(store.scheduling));
  const [scheduling, setScheduling] = useState(schedulingBase);
  const hoursDirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const schedulingDirty = JSON.stringify(scheduling) !== JSON.stringify(schedulingBase);
  const dirty = hoursDirty || schedulingDirty; useDirtyForm(dirty);
  const save = useMutation<OwnerStoreResponse, ApiError, { hours?: StoreHours; scheduling?: Scheduling }>({
    mutationFn: async (body) => {
      let data: OwnerStoreResponse | undefined;
      if (body.hours) data = await api<OwnerStoreResponse>("/owner/store/hours", { method: "PUT", body: body.hours });
      if (body.scheduling) data = await api<OwnerStoreResponse>("/owner/store", { method: "PATCH", body: { scheduling: body.scheduling } });
      return data!;
    },
    onSuccess: (data) => {
      const next = hoursDraft(data.store.hours); setBaseline(next); setDraft(next);
      const nextScheduling = schedulingDraft(data.store.scheduling); setSchedulingBase(nextScheduling); setScheduling(nextScheduling);
      cache.setQueryData(ownerStoreKey, data); cache.invalidateQueries({ queryKey: ["public-store"] }); cache.invalidateQueries({ queryKey: ["public-stores"] }); cache.invalidateQueries({ queryKey: ["public-slots"] });
    },
  });
  const change = (value: StoreHours) => { setDraft(value); setErrors({}); save.reset(); };
  const changeScheduling = (value: Partial<Scheduling>) => { setScheduling({ ...scheduling, ...value }); save.reset(); };
  const setDay = (day: HourDay, intervals: HourInterval[]) => change({ ...draft, weekly: { ...draft.weekly, [day]: intervals } });
  const errorFor = (path: string) => errors[path] ? c[errors[path]] : undefined;
  // Turnos de un día, compactos: "18:00 – 23:00 ✕" por línea y "+ Agregar turno".
  function intervals(items: HourInterval[], path: string, onChange: (next: HourInterval[]) => void, dayName: string) {
    const time = "h-11 w-21 rounded-lg border border-line bg-surface px-2 text-center tabular-nums aria-invalid:border-closed";
    return <div className="space-y-2">
      {items.map((item, index) => {
        const ids = { open: `${path}.${index}.open`, close: `${path}.${index}.close` };
        const problem = errorFor(ids.open) ?? errorFor(ids.close);
        return <div key={index}>
          <div className="flex items-center gap-2">
            {(["open", "close"] as const).map((key, position) => <span key={key} className="contents">
              {position === 1 && <span aria-hidden className="text-ink-muted">–</span>}
              <input id={ids[key]} aria-label={`${c[key]} (${dayName})`} className={time} value={item[key]} placeholder="HH:MM" maxLength={5} inputMode="text" pattern={key === "close" ? "([01][0-9]|2[0-3]):[0-5][0-9]|24:00" : "([01][0-9]|2[0-3]):[0-5][0-9]"} required aria-invalid={!!errors[ids[key]]} onChange={(e) => onChange(items.map((v, i) => i === index ? { ...v, [key]: e.target.value } : v))} />
            </span>)}
            <button type="button" className="grid size-11 shrink-0 place-items-center rounded-lg text-ink-muted hover:bg-error-soft hover:text-error" aria-label={c.removeIntervalOf(dayName, index + 1)} title={c.removeInterval} onClick={() => onChange(items.filter((_, i) => i !== index))}><X aria-hidden className="size-5" /></button>
            {/* Otro turno: al final del último, sin ocupar una línea más. */}
            {index === items.length - 1 && items.length < 4 && <button type="button" className="grid size-11 shrink-0 place-items-center rounded-lg border border-line text-ink-muted hover:bg-paper hover:text-ink" aria-label={`${c.addInterval} (${dayName})`} title={c.addInterval} onClick={() => onChange([...items, { open: "18:00", close: "23:00" }])}><Plus aria-hidden className="size-5" /></button>}
          </div>
          {item.close < item.open && item.close !== "" && <p className="mt-1 text-sm text-ink-muted">{c.overnight}</p>}
          {problem && <p role="alert" className="mt-1 text-sm font-bold text-error">{problem}</p>}
        </div>;
      })}
      {errorFor(path) && <p role="alert" className="text-sm font-bold text-error">{errorFor(path)}</p>}
    </div>;
  }
  const [copySource, setCopySource] = useState<HourDay>("mon");
  const copyToAll = () => { if (window.confirm(c.copyAllConfirm)) change({ ...draft, weekly: Object.fromEntries(HOUR_DAYS.map((day) => [day, draft.weekly[copySource].map((v) => ({ ...v }))])) as StoreHours["weekly"] }); };
  function submit(event: FormEvent) { event.preventDefault(); if (save.isPending) return; const issues = validateHours(draft); setErrors(issues); if (Object.keys(issues).length) document.getElementById(Object.keys(issues)[0])?.focus(); else save.mutate({ hours: hoursDirty ? draft : undefined, scheduling: schedulingDirty ? scheduling : undefined }); }
  const status = statusView(opening);
  return <><PageHeader title={c.title} description={c.description} />
    <div className="mb-5 rounded-xl border border-line bg-surface p-4 lg:flex lg:flex-wrap lg:items-baseline lg:gap-x-3 lg:px-5 lg:py-3"><h2 className="font-bold">{c.statusTitle}: {status.label}{status.detail && <span className="font-normal"> · {status.detail}</span>}</h2><p className="mt-1 text-sm text-ink-muted lg:mt-0">{store.override ? c.manual : c.automatic}</p></div>
    {/* Sin los globitos del navegador: los errores se muestran al lado de cada horario. */}
    <form onSubmit={submit} className="space-y-5" noValidate>
      <fieldset disabled={save.isPending} className="space-y-5 disabled:opacity-70">
        <SettingsSection title={c.weekly}>
          <p className="text-sm text-ink-muted">{c.weeklyHelp} {c.timeHelp}</p>
          {/* Lo más común: el mismo horario toda la semana. */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-paper p-2 text-sm">
            <label htmlFor="copy-source">{c.copyAllFrom}</label>
            <select id="copy-source" className="h-11 rounded-lg border border-line bg-surface px-2" value={copySource} onChange={(e) => setCopySource(e.target.value as HourDay)}>{HOUR_DAYS.map((v) => <option key={v} value={v}>{c.days[v]}</option>)}</select>
            <button type="button" className={button.secondary} onClick={copyToAll}>{c.copyAll}</button>
          </div>
          <ul className="divide-y divide-line">
            {HOUR_DAYS.map((day) => {
              const open = draft.weekly[day].length > 0;
              return <li key={day} className="flex flex-wrap items-start gap-x-4 gap-y-2 py-3 lg:py-2">
                <div className="flex w-full items-center justify-between gap-3 sm:w-44">
                  <h3 className={`font-bold ${open ? "" : "text-ink-muted"}`}>{c.days[day]}</h3>
                  <Switch label={c.openOn(c.days[day])} showLabel={false} checked={open} onChange={(enabled) => setDay(day, enabled ? [{ open: "18:00", close: "23:00" }] : [])} />
                </div>
                <div className="min-w-0 flex-1">
                  {open ? intervals(draft.weekly[day], `weekly.${day}`, (next) => setDay(day, next), c.days[day]) : <p className="flex min-h-11 items-center text-sm text-ink-muted">{c.closed}</p>}
                </div>
              </li>;
            })}
          </ul>
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
              {!exception.closed && intervals(exception.intervals, `${path}.intervals`, (next) => update({ intervals: next }), exception.date)}
              <button type="button" className={button.danger} onClick={() => { if (window.confirm(c.removeExceptionConfirm)) change({ ...draft, exceptions: draft.exceptions.filter((_, i) => i !== index) }); }}>{c.removeException}</button>
            </div>;
          })}
          <button type="button" className={button.secondary} disabled={draft.exceptions.length >= 60} onClick={() => change({ ...draft, exceptions: [...draft.exceptions, { date: todayForHours(), closed: true, note: "", intervals: [] }] })}>{c.addException}</button>
        </SettingsSection>
        <SettingsSection title={c.schedulingTitle}>
          <Switch label={c.schedulingSwitch} checked={scheduling.enabled} onChange={(enabled) => changeScheduling({ enabled })} />
          <p className="text-sm text-ink-muted">{c.schedulingHelp}</p>
          {scheduling.enabled && <div className="grid gap-4 sm:grid-cols-3">
            <Field id="scheduling-lead" label={c.minLead}><select id="scheduling-lead" className={input} value={scheduling.minLeadMinutes} onChange={(e) => changeScheduling({ minLeadMinutes: Number(e.target.value) })}>{withCurrent(LEAD_OPTIONS, scheduling.minLeadMinutes).map((minutes) => <option key={minutes} value={minutes}>{formatMinutes(minutes)}</option>)}</select></Field>
            <Field id="scheduling-days" label={c.daysAhead}><select id="scheduling-days" className={input} value={scheduling.maxDaysAhead} onChange={(e) => changeScheduling({ maxDaysAhead: Number(e.target.value) })}>{withCurrent(DAYS_AHEAD_OPTIONS, scheduling.maxDaysAhead).map((days) => <option key={days} value={days}>{c.daysAheadOption(days)}</option>)}</select></Field>
            <Field id="scheduling-slot" label={c.slotSize}><select id="scheduling-slot" className={input} value={scheduling.slotMinutes} onChange={(e) => changeScheduling({ slotMinutes: Number(e.target.value) as Scheduling["slotMinutes"] })}>{([15, 30, 60] as const).map((minutes) => <option key={minutes} value={minutes}>{c.slotOption(minutes)}</option>)}</select></Field>
          </div>}
        </SettingsSection>
        <SettingsSection title={c.dayStartTitle}>
          <Field id="day-start" label={c.dayStartLabel}>
            <select id="day-start" className="h-11 w-32 rounded-lg border border-line bg-surface px-3 tabular-nums" value={draft.dayStart} onChange={(e) => change({ ...draft, dayStart: e.target.value })}>
              {/* Una hora guardada fuera de la lista (puesta por la API) también se puede ver. */}
              {[...new Set([...DAY_START_OPTIONS, draft.dayStart])].sort().map((time) => <option key={time} value={time}>{time}</option>)}
            </select>
          </Field>
          <p className="text-sm text-ink-muted">{draft.dayStart === "00:00" ? c.dayStartMidnight : c.dayStartHelp(draft.dayStart)}</p>
          {draft.dayStart !== baseline.dayStart && <p className="text-sm text-warning">{c.dayStartReports}</p>}
        </SettingsSection>
      </fieldset>
      {!!Object.keys(errors).length && <p role="alert" className="text-error">{c.correctErrors}</p>}
      {save.isError && <p role="alert" className="text-error">{errorText(save.error, t)}</p>}
      {save.isSuccess && <p role="status" className="text-success">{c.saved}</p>}
      <div className="sticky bottom-16 lg:bottom-0 flex flex-wrap items-center gap-3 border-t border-line bg-paper py-4"><button className={button.primary} disabled={save.isPending || !dirty}>{save.isPending ? c.saving : c.save}</button><button type="button" className={button.secondary} disabled={save.isPending || !dirty} onClick={() => { if (window.confirm(c.discardConfirm)) { setDraft(baseline); setScheduling(schedulingBase); setErrors({}); save.reset(); } }}>{c.discard}</button>{dirty && <span className="text-sm text-ink-muted">{c.unsaved}</span>}</div>
    </form>
  </>;
}
