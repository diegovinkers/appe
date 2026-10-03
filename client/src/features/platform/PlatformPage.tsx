import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../api/client";
import { useSession } from "../../auth/session";
import { Spinner } from "../../components/FullScreenMessage";
import { button, input } from "../../components/ui";
import { useLanguage, useT, errorText } from "../../i18n";
import { UserMenu } from "../panel/UserMenu";
import { BusinessForm, type BusinessField } from "./BusinessForm";
import { SubscriptionView } from "./SubscriptionView";
import type { AdminCommerce, CommercesResponse } from "./businessTypes";

export function PlatformPage() {
  const es = useLanguage() === "es"; const t = useT(); const { data: user } = useSession(); const cache = useQueryClient();
  const tx = (pt: string, spanish: string) => es ? spanish : pt;
  const query = useQuery({ queryKey: ["commerces"], queryFn: () => api<CommercesResponse>("/admin/commerces") });
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<{ mode: "edit" | "billing" | "password"; commerce: AdminCommerce | null; ownerId?: string } | null>(null);
  const close = () => setSelection(null);
  const saved = () => { cache.invalidateQueries({ queryKey: ["commerces"] }); close(); };
  const commerce = selection?.commerce;
  const fields: BusinessField[] = [
    { key: "name", label: tx("Nome da loja", "Nombre del comercio"), required: true, maxLength: 80 },
    { key: "slug", label: tx("Endereço do cardápio (slug)", "Dirección del menú (slug)"), required: true, maxLength: 40 },
    { key: "whatsapp", label: "WhatsApp", required: true },
  ];
  if (commerce) fields.push({ key: "status", label: tx("Acesso da loja", "Acceso del comercio"), options: [{ value: "active", label: tx("Ativo", "Activo") }, { value: "suspended", label: tx("Suspenso", "Suspendido") }] });
  else fields.push({ key: "ownerName", label: tx("Nome do dono", "Nombre del dueño"), required: true, maxLength: 80 }, { key: "email", label: "E-mail", type: "email", required: true }, { key: "password", label: tx("Senha inicial", "Contraseña inicial"), type: "password", minLength: 10, required: true });
  const visible = query.data?.commerces.filter((c) => `${c.name} ${c.slug}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())) ?? [];
  return <div className="min-h-dvh bg-paper"><header className="flex items-center justify-between gap-3 border-b border-line bg-surface p-4"><h1 className="text-xl font-bold">{tx("Administração Serice", "Administración de Serice")}</h1>{user && <UserMenu user={user} />}</header>
    <main className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      {selection?.mode === "edit" ? <BusinessForm key={commerce?._id ?? "new"} title={commerce ? tx("Editar loja", "Editar comercio") : tx("Nova loja", "Nuevo comercio")} initial={{ name: commerce?.name ?? "", slug: commerce?.slug ?? "", whatsapp: commerce?.whatsapp ?? "", status: commerce?.status ?? "active", ownerName: "", email: "", password: "" }} fields={fields} path={`/admin/commerces${commerce ? `/${commerce._id}` : ""}`} method={commerce ? "PATCH" : "POST"} body={(d) => {
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(d.slug)) throw new Error(tx("Use letras minúsculas, números e hífens no endereço.", "Usá minúsculas, números y guiones en la dirección."));
        return commerce ? { name: d.name, slug: d.slug, whatsapp: d.whatsapp, status: d.status } : { commerce: { name: d.name, slug: d.slug, whatsapp: d.whatsapp }, owner: { name: d.ownerName, email: d.email, password: d.password } };
      }} confirm={commerce ? tx("Salvar alterações? Suspender a loja oculta seu cardápio e bloqueia o painel. Alterar o endereço muda o link público.", "¿Guardar cambios? Suspender el comercio oculta su menú y bloquea el panel. Cambiar la dirección modifica el enlace público.") : undefined} onSaved={saved} onBack={close} />
        : selection?.mode === "billing" && commerce ? <><h2 className="text-xl font-bold">{commerce.name}</h2><SubscriptionView commerceId={commerce._id} onBack={close} /></>
        : selection?.mode === "password" ? <BusinessForm title={tx("Redefinir acesso do dono", "Restablecer acceso del dueño")} initial={{ password: "" }} fields={[{ key: "password", label: tx("Nova senha", "Nueva contraseña"), type: "password", required: true, minLength: 10 }]} path={`/admin/users/${selection.ownerId}/password`} method="PATCH" body={(d) => d} confirm={tx("Redefinir a senha e encerrar as sessões deste dono?", "¿Restablecer la contraseña y cerrar las sesiones del dueño?")} onSaved={saved} onBack={close} /> : <>
          <div className="flex flex-wrap gap-3"><input className={`${input} sm:max-w-md`} aria-label={tx("Buscar loja", "Buscar comercio")} placeholder={tx("Buscar por nome ou endereço", "Buscar por nombre o dirección")} value={search} onChange={(e) => setSearch(e.target.value)} /><button className={button.primary} onClick={() => setSelection({ mode: "edit", commerce: null })}>{tx("Nova loja", "Nuevo comercio")}</button></div>
          {query.isPending && <Spinner />}{query.isError && <div role="alert">{errorText(query.error, t)} <button className={button.secondary} onClick={() => void query.refetch()}>{t.errors.retry}</button></div>}
          {query.data && !visible.length && <p className="text-ink-muted">{tx("Nenhuma loja encontrada.", "No se encontraron comercios.")}</p>}
          <ul className="space-y-3">{visible.map((c) => <li key={c._id} className="space-y-3 rounded-xl border border-line bg-surface p-4"><div className="flex flex-wrap items-center gap-3"><div className="min-w-0 flex-1"><h2 className="font-bold">{c.name}</h2><a href={`/${c.slug}`} target="_blank" rel="noreferrer" className="text-sm underline">/{c.slug} ↗</a><p className="text-sm text-ink-muted">{c.status === "active" ? tx("Ativo", "Activo") : tx("Suspenso", "Suspendido")}</p></div><button className={button.secondary} onClick={() => setSelection({ mode: "edit", commerce: c })}>Editar</button><button className={button.secondary} onClick={() => setSelection({ mode: "billing", commerce: c })}>{tx("Assinatura e pagamentos", "Suscripción y pagos")}</button></div>{c.owners.map((owner) => <div key={owner._id} className="flex flex-wrap items-center gap-3 border-t border-line pt-3"><p className="min-w-0 flex-1 break-words text-sm">{owner.name} · {owner.email}</p><button className={button.quiet} onClick={() => setSelection({ mode: "password", commerce: c, ownerId: owner._id })}>{tx("Redefinir acesso", "Restablecer acceso")}</button></div>)}</li>)}</ul>
        </>}
    </main></div>;
}
