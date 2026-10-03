import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api, type ApiError } from "../../api/client";
import { button, Field, input } from "../../components/ui";
import { useDirtyForm } from "../../hooks/useDirtyForm";
import { errorText, useLanguage, useT } from "../../i18n";

export type BusinessField = { key: string; label: string; type?: string; required?: boolean; minLength?: number; maxLength?: number; options?: { value: string; label: string }[] };
// Small controlled form for platform operations. The caller maps strings to a typed API body.
export function BusinessForm({ title, fields, initial, path, method, body, onSaved, confirm, onBack }: {
  title: string; fields: BusinessField[]; initial: Record<string, string>; path: string; method: "POST" | "PUT" | "PATCH";
  body: (draft: Record<string, string>) => unknown; onSaved: (data: unknown) => void; confirm?: string; onBack?: () => void;
}) {
  const es = useLanguage() === "es"; const t = useT();
  const [baseline, setBaseline] = useState(initial); const [draft, setDraft] = useState(initial); const [error, setError] = useState("");
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const mutation = useMutation<unknown, ApiError, unknown>({ mutationFn: (data) => api(path, { method, body: data }), onSuccess: (data) => { setBaseline(draft); onSaved(data); } });
  useDirtyForm(dirty || mutation.isPending);
  function submit(event: FormEvent) {
    event.preventDefault(); if (mutation.isPending) return;
    let data: unknown;
    try { data = body(draft); } catch (failure) { setError(failure instanceof Error ? failure.message : t.errors.generic); return; }
    if (confirm && !window.confirm(confirm)) return;
    setError(""); mutation.mutate(data);
  }
  return <form onSubmit={submit} className="space-y-3 rounded-xl border border-line bg-surface p-4 sm:p-6">
    <h2 className="text-lg font-bold">{title}</h2>
    <fieldset disabled={mutation.isPending} className="space-y-3">
      {fields.map((field) => <Field key={field.key} id={`business-${field.key}`} label={field.label}>{field.options ? <select id={`business-${field.key}`} className={input} value={draft[field.key]} onChange={(e) => setDraft({ ...draft, [field.key]: e.target.value })}>{field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <input id={`business-${field.key}`} className={input} type={field.type ?? "text"} required={field.required} minLength={field.minLength} maxLength={field.maxLength} autoComplete={field.type === "password" ? "new-password" : "off"} value={draft[field.key]} onChange={(e) => setDraft({ ...draft, [field.key]: e.target.value })} />}</Field>)}
      <div className="flex flex-wrap gap-3"><button className={button.primary} disabled={mutation.isPending}>{mutation.isPending ? es ? "Guardando…" : "Salvando…" : es ? "Guardar" : "Salvar"}</button>{onBack && <button type="button" className={button.secondary} onClick={() => { if (!dirty || window.confirm(es ? "¿Descartar cambios?" : "Descartar alterações?")) onBack(); }}>{es ? "Volver" : "Voltar"}</button>}</div>
    </fieldset>
    {(error || mutation.isError) && <p role="alert" className="text-error">{error || errorText(mutation.error, t)}</p>}
    {mutation.isSuccess && <p role="status" className="text-success">{es ? "Guardado." : "Salvo."}</p>}
  </form>;
}
