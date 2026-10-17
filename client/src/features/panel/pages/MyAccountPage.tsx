import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { type ApiError, api } from "../../../api/client";
import { PageHeader } from "../../../components/PageHeader";
import { PasswordInput } from "../../../components/PasswordInput";
import { Field, button, input } from "../../../components/ui";
import { errorText, useT } from "../../../i18n";
import { SettingsSection } from "./StorePage";
import { usePanel } from "../PanelLayout";

const empty = { currentPassword: "", newPassword: "", confirm: "" };

// Minha conta: quién está usando el panel y el cambio de contraseña (dueño y empleado).
export function MyAccountPage() {
  const t = useT();
  const c = t.myAccount;
  const { user } = usePanel();
  const [form, setForm] = useState(empty);
  const [mismatch, setMismatch] = useState(false);
  const change = useMutation<unknown, ApiError, { currentPassword: string; newPassword: string }>({
    mutationFn: (body) => api("/auth/password", { method: "PATCH", body }),
    onSuccess: () => setForm(empty),
  });
  const set = (key: keyof typeof empty, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setMismatch(false);
    change.reset();
  };
  function submit(event: FormEvent) {
    event.preventDefault();
    if (change.isPending) return;
    if (form.newPassword !== form.confirm) return setMismatch(true);
    change.mutate({ currentPassword: form.currentPassword, newPassword: form.newPassword });
  }

  return (
    <>
      <PageHeader title={t.pages.myAccount.title} description={t.pages.myAccount.description} />
      <div className="space-y-5">
        <SettingsSection title={c.access}>
          <dl className="grid gap-3 sm:grid-cols-[auto_1fr] sm:gap-x-6">
            <dt className="text-sm text-ink-muted">{t.team.name}</dt>
            <dd className="font-bold">{user.name}</dd>
            {user.email && (
              <>
                <dt className="text-sm text-ink-muted">{t.team.email}</dt>
                <dd className="break-all font-bold">{user.email}</dd>
              </>
            )}
            <dt className="text-sm text-ink-muted">{c.role}</dt>
            <dd className="font-bold">{t.user.roles[user.role]}</dd>
          </dl>
        </SettingsSection>
        {/* Quien entra solo con PIN no tiene contraseña: el PIN se lo cambia el dueño. */}
        {!user.email ? (
          <SettingsSection title={c.changePassword}>
            <p className="text-ink-muted">{c.pinOnly}</p>
          </SettingsSection>
        ) : (
          <form onSubmit={submit}>
            <SettingsSection title={c.changePassword}>
              <Field id="current-password" label={c.currentPassword}>
                <PasswordInput id="current-password" className={input} required autoComplete="current-password" value={form.currentPassword} onChange={(e) => set("currentPassword", e.target.value)} />
              </Field>
              <Field id="new-password" label={c.newPassword} hint={c.newPasswordHint}>
                <PasswordInput id="new-password" className={input} required minLength={8} maxLength={72} autoComplete="new-password" value={form.newPassword} onChange={(e) => set("newPassword", e.target.value)} />
              </Field>
              <Field id="confirm-password" label={c.confirmPassword} error={mismatch ? c.mismatch : undefined}>
                <PasswordInput id="confirm-password" className={input} required aria-invalid={mismatch} autoComplete="new-password" value={form.confirm} onChange={(e) => set("confirm", e.target.value)} />
              </Field>
              {change.isError && (
                <p role="alert" className="font-bold text-error">
                  {errorText(change.error, t)}
                </p>
              )}
              {change.isSuccess && (
                <p role="status" className="text-success">
                  {c.saved}
                </p>
              )}
              <button className={button.primary} disabled={change.isPending}>
                {change.isPending ? c.saving : c.save}
              </button>
            </SettingsSection>
          </form>
        )}
      </div>
    </>
  );
}
