import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImagePlus } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { api, type ApiError } from "../../../api/client";
import type { OwnerStore, OwnerStoreResponse } from "../../../api/types";
import { PageHeader } from "../../../components/PageHeader";
import { button, Field, input, textarea } from "../../../components/ui";
import { useDirtyForm } from "../../../hooks/useDirtyForm";
import { errorText, useLanguage, useT } from "../../../i18n";
import { uploadImage } from "../../../lib/upload";
import { usePanel } from "../PanelLayout";
import { ownerStoreKey } from "../useOwnerStore";

const copy = {
  "pt-BR": {
    identity: "Identidade da loja", contact: "Contato", name: "Nome", descriptionLabel: "Descrição curta", about: "Sobre a loja", notice: "Aviso no cardápio",
    logo: "Logo", cover: "Foto de capa", upload: "Escolher imagem", remove: "Remover imagem", imageHint: "JPG, PNG ou WebP, até 5 MB.", imageError: "Escolha uma imagem JPG, PNG ou WebP de até 5 MB.",
    primary: "Cor principal", secondary: "Cor secundária", address: "Endereço",
    google: "Link de avaliações do Google (opcional)", googleHint: "No seu Perfil da Empresa no Google, toque em \u201cPedir avaliações\u201d e copie o link. Depois de avaliar aqui, o cliente vê um botão para avaliar também no Google.",
    translations: "Textos do cardápio em espanhol", translationHint: "Opcional. Quando vazio, será mostrado o texto em português.",
    save: "Salvar alterações", saving: "Salvando…", saved: "Configuração salva.", preview: "Ver cardápio", reset: "Descartar alterações", discard: "Descartar as alterações não salvas?", changed: "Há alterações não salvas.",
  },
  es: {
    identity: "Identidad del comercio", contact: "Contacto", name: "Nombre", descriptionLabel: "Descripción corta", about: "Sobre el comercio", notice: "Aviso en el menú",
    logo: "Logo", cover: "Foto de portada", upload: "Elegir imagen", remove: "Quitar imagen", imageHint: "JPG, PNG o WebP, hasta 5 MB.", imageError: "Elegí una imagen JPG, PNG o WebP de hasta 5 MB.",
    primary: "Color principal", secondary: "Color secundario", address: "Dirección",
    google: "Link de reseñas de Google (opcional)", googleHint: "En tu Perfil de Empresa de Google, tocá \u201cPedir reseñas\u201d y copiá el link. Después de opinar acá, el cliente ve un botón para dejar su reseña también en Google.",
    translations: "Textos del menú en español", translationHint: "Opcional. Si quedan vacíos, se muestra el texto en portugués.",
    save: "Guardar cambios", saving: "Guardando…", saved: "Configuración guardada.", preview: "Ver menú", reset: "Descartar cambios", discard: "¿Descartar los cambios sin guardar?", changed: "Hay cambios sin guardar.",
  },
};

const fields = (store: OwnerStore) => ({
  name: store.name, description: store.description, about: store.about, notice: store.notice,
  logoUrl: store.logoUrl, coverUrl: store.coverUrl, primaryColor: store.primaryColor, secondaryColor: store.secondaryColor,
  whatsapp: store.whatsapp, address: store.address, instagram: store.instagram, googleReviewUrl: store.googleReviewUrl,
  translations: { es: { description: store.translations?.es?.description ?? "", about: store.translations?.es?.about ?? "", notice: store.translations?.es?.notice ?? "" } },
});

// En la PC, el título a la izquierda y los campos a la derecha: una fila menos por sección y
// campos de un ancho que se lee bien. En el celular, el título arriba.
export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4 sm:p-6 lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-6 lg:p-5">
      <h2 className="mb-4 text-lg font-bold lg:mb-0 lg:text-base">{title}</h2>
      <div className="min-w-0 space-y-4">{children}</div>
    </section>
  );
}

export function StorePage() {
  const { store, storeUrl } = usePanel();
  const c = copy[useLanguage()];
  const t = useT();
  const cache = useQueryClient();
  const [baseline, setBaseline] = useState(() => fields(store));
  const [draft, setDraft] = useState(baseline);
  const [localError, setLocalError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  useDirtyForm(dirty || uploading);
  const save = useMutation<OwnerStoreResponse, ApiError, typeof draft>({
    mutationFn: (body) => api("/owner/store", { method: "PATCH", body }),
    onSuccess: (response) => {
      cache.setQueryData(ownerStoreKey, response);
      cache.invalidateQueries({ queryKey: ["public-store"] });
      cache.invalidateQueries({ queryKey: ["public-stores"] });
      const next = fields(response.store);
      setBaseline(next); setDraft(next); setSaved(true);
    },
  });
  const busy = uploading || save.isPending;
  const change = <K extends keyof typeof draft>(key: K, value: typeof draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value })); setSaved(false); setLocalError(""); save.reset();
  };
  async function upload(file: File | undefined, kind: "logo" | "cover") {
    if (!file) return;
    setSaved(false); setLocalError("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) { setLocalError(c.imageError); return; }
    setUploading(true);
    try { change(kind === "logo" ? "logoUrl" : "coverUrl", await uploadImage(file, kind)); }
    catch (error) { setLocalError(errorText(error, t)); }
    finally { setUploading(false); }
  }
  function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setLocalError(""); save.mutate(draft);
  }
  function textField(key: "name" | "whatsapp" | "address" | "instagram", label: string, max: number, required = false) {
    return <Field id={`store-${key}`} label={label}><input id={`store-${key}`} className={input} value={draft[key]} onChange={(e) => change(key, e.target.value)} maxLength={max} required={required} type={key === "whatsapp" ? "tel" : "text"} /></Field>;
  }
  return <>
    <PageHeader title={t.pages.storeInfo.title} description={t.pages.storeInfo.description} />
    <a href={storeUrl} target="_blank" rel="noreferrer" className={`${button.secondary} mb-4`}>{c.preview} ↗</a>
    <form onSubmit={submit} className="space-y-5">
      <fieldset disabled={busy} className="space-y-5 disabled:opacity-70">
        <SettingsSection title={c.identity}>
          {textField("name", c.name, 80, true)}
          {([ ["description", c.descriptionLabel, 300], ["about", c.about, 500], ["notice", c.notice, 140] ] as const).map(([key, label, max]) => <Field key={key} id={`store-${key}`} label={label}><textarea id={`store-${key}`} className={textarea} rows={2} maxLength={max} value={draft[key]} onChange={(e) => change(key, e.target.value)} /></Field>)}
          <div className="grid gap-5 sm:grid-cols-2">
            {(["logo", "cover"] as const).map((kind) => {
              const key = kind === "logo" ? "logoUrl" : "coverUrl";
              return <div key={kind} className="space-y-2">
                <label htmlFor={`store-${kind}`} className="block font-bold">{c[kind]}</label>
                {draft[key] && <img src={draft[key]} alt={c[kind]} className="h-28 max-w-full rounded-lg border border-line object-contain" />}
                <label className={`${button.secondary} cursor-pointer focus-within:outline-3 focus-within:outline-[#2f7de1]`}>
                  <ImagePlus aria-hidden className="size-5" />
                  {c.upload}
                  <input id={`store-${kind}`} type="file" accept="image/jpeg,image/png,image/webp" aria-describedby={`store-${kind}-hint`} className="sr-only" onChange={(event) => { void upload(event.target.files?.[0], kind); event.target.value = ""; }} />
                </label>
                <p id={`store-${kind}-hint`} className="text-sm text-ink-muted">{c.imageHint}</p>
                {draft[key] && <button type="button" className={button.danger} onClick={() => change(key, "")}>{c.remove}</button>}
              </div>;
            })}
            {([ ["primaryColor", c.primary], ["secondaryColor", c.secondary] ] as const).map(([key, label]) => <Field key={key} id={`store-${key}`} label={label}><div className="flex items-center gap-3"><input id={`store-${key}`} type="color" value={draft[key]} onChange={(e) => change(key, e.target.value)} className="h-11 w-16 cursor-pointer rounded border border-line" /><span className="font-mono text-sm">{draft[key]}</span></div></Field>)}
          </div>
        </SettingsSection>
        <SettingsSection title={c.contact}>
          <div className="grid gap-4 sm:grid-cols-2">
            {textField("whatsapp", "WhatsApp", 30, true)}
            {textField("instagram", "Instagram", 31)}
          </div>
          {textField("address", c.address, 200)}
          <Field id="store-googleReviewUrl" label={c.google} hint={c.googleHint}>
            <input id="store-googleReviewUrl" type="url" inputMode="url" className={input} placeholder="https://g.page/r/…/review" value={draft.googleReviewUrl} onChange={(e) => change("googleReviewUrl", e.target.value.trim())} maxLength={500} />
          </Field>
        </SettingsSection>
        <SettingsSection title={c.translations}>
          <p className="text-sm text-ink-muted">{c.translationHint}</p>
          {([ ["description", c.descriptionLabel, 300], ["about", c.about, 500], ["notice", c.notice, 140] ] as const).map(([key, label, max]) => <Field key={key} id={`store-es-${key}`} label={`${label} (ES)`}><textarea id={`store-es-${key}`} lang="es" className={textarea} rows={2} maxLength={max} value={draft.translations.es[key]} onChange={(e) => change("translations", { es: { ...draft.translations.es, [key]: e.target.value } })} /></Field>)}
        </SettingsSection>
      </fieldset>
      {(localError || save.isError) && <p role="alert" className="text-error">{localError || errorText(save.error, t)}</p>}
      {saved && <p role="status" className="text-success">{c.saved}</p>}
      <div className="sticky bottom-16 lg:bottom-0 flex flex-wrap items-center gap-3 border-t border-line bg-paper py-4">
        <button className={button.primary} disabled={busy || !dirty}>{busy ? c.saving : c.save}</button>
        <button type="button" className={button.secondary} disabled={busy || !dirty} onClick={() => { if (window.confirm(c.discard)) { setDraft(baseline); setLocalError(""); save.reset(); } }}>{c.reset}</button>
        {dirty && <p className="text-sm text-ink-muted">{c.changed}</p>}
      </div>
    </form>
  </>;
}
