import { type FormEvent, useState } from "react";
import { Notice } from "../../components/Notice";
import { PasswordInput } from "../../components/PasswordInput";
import { Field, button, input } from "../../components/ui";
import { supportContact } from "../../lib/support";
import { errorText, useLanguage, useT } from "../../i18n";
import { loadCustomer } from "../menu/customer";
import { useLogin, useSignup } from "./account";

const digits = (phone: string) => phone.replace(/\D/g, "").length;

// Con el color del local cuando la página lo define (--brand); si no, el botón de siempre.
const submitClass = (brand: boolean) =>
  brand ? "inline-flex h-12 w-full items-center justify-center rounded-lg bg-(--brand) font-bold text-(--on-brand) hover:brightness-110 disabled:opacity-60" : `${button.primary} h-12 w-full`;

// Por ahora la contraseña del cliente no se recupera sola (llega con Auth0): se explica y se
// ofrece el contacto de soporte, si está configurado.
function ForgotPassword() {
  const t = useT();
  const contact = supportContact();
  return (
    <details className="text-sm">
      <summary className="inline-flex min-h-11 cursor-pointer items-center font-bold underline underline-offset-4">{t.account.forgot}</summary>
      <p className="mt-1 text-ink-muted">{t.account.forgotText}</p>
      {contact && (
        <a href={contact} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-11 items-center font-bold underline underline-offset-4">
          {t.account.support}
        </a>
      )}
    </details>
  );
}

// Crear la cuenta con lo mínimo: nombre y WhatsApp vienen de la última compra en este
// aparato (se pueden corregir); solo falta la contraseña.
export function SignupForm({ onDone, idPrefix = "cadastro", brand = false }: { onDone?: () => void; idPrefix?: string; brand?: boolean }) {
  const t = useT();
  const language = useLanguage();
  const signup = useSignup();
  const [saved] = useState(loadCustomer);
  const [name, setName] = useState(saved.name);
  const [phone, setPhone] = useState(saved.phone);
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const prefilled = !!(saved.name && saved.phone);
  // Con nombre y WhatsApp de la compra, solo se ve la contraseña (y "Alterar" por si acaso).
  const [editing, setEditing] = useState(!prefilled);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found: Record<string, string> = {};
    if (!name.trim()) found.name = t.checkout.required;
    if (digits(phone) < 8) found.phone = t.checkout.invalidPhone;
    if (password.length < 8) found.password = t.account.passwordHint;
    setErrors(found);
    if (found.name || found.phone) setEditing(true);
    if (Object.keys(found).length) return;
    // La dirección de la última entrega en este aparato también queda guardada.
    const { street, number, neighborhood, reference } = saved;
    const address =
      street.trim() && number.trim() && neighborhood.trim() ? { label: "", street, number, neighborhood, reference } : undefined;
    signup.mutate(
      {
        name: name.trim(),
        phone: phone.trim(),
        password,
        locale: language,
        address,
      },
      { onSuccess: () => onDone?.() },
    );
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      {!editing ? (
        <>
          <p className="text-sm text-ink-muted">{t.account.prefilled}</p>
          <div className="flex items-center gap-3 rounded-lg bg-paper py-2 pr-1 pl-3">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold">{name}</span>
              <span className="block text-sm text-ink-muted tabular-nums">{phone}</span>
            </span>
            <button type="button" onClick={() => setEditing(true)} className={button.quiet}>
              {t.account.change}
            </button>
          </div>
        </>
      ) : (
        <>
          <Field id={`${idPrefix}-nome`} label={t.account.name} error={errors.name}>
            <input
              id={`${idPrefix}-nome`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              maxLength={60}
              className={input}
              aria-invalid={!!errors.name}
            />
          </Field>
          <Field id={`${idPrefix}-fone`} label={t.account.phone} error={errors.phone} hint={t.account.phoneHint}>
            <input
              id={`${idPrefix}-fone`}
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              maxLength={30}
              className={input}
              aria-invalid={!!errors.phone}
            />
          </Field>
        </>
      )}
      <Field id={`${idPrefix}-senha`} label={t.account.password} error={errors.password} hint={t.account.passwordHint}>
        <PasswordInput
          id={`${idPrefix}-senha`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          maxLength={72}
          className={input}
          aria-invalid={!!errors.password}
        />
      </Field>
      {signup.isError && <Notice tone="error">{errorText(signup.error, t)}</Notice>}
      <button type="submit" disabled={signup.isPending} className={submitClass(brand)}>
        {signup.isPending ? t.account.submitting : t.account.signupSubmit}
      </button>
    </form>
  );
}

export function LoginForm({ onDone, idPrefix = "entrar", brand = false }: { onDone?: () => void; idPrefix?: string; brand?: boolean }) {
  const t = useT();
  const login = useLogin();
  const [phone, setPhone] = useState(() => loadCustomer().phone);
  const [password, setPassword] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!phone.trim() || !password) return;
    login.mutate({ phone: phone.trim(), password }, { onSuccess: () => onDone?.() });
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field id={`${idPrefix}-fone`} label={t.account.phone} hint={t.account.phoneHint}>
        <input
          id={`${idPrefix}-fone`}
          type="tel"
          inputMode="tel"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoComplete="tel"
          maxLength={30}
          className={input}
        />
      </Field>
      <Field id={`${idPrefix}-senha`} label={t.account.password}>
        <PasswordInput
          id={`${idPrefix}-senha`}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          maxLength={72}
          className={input}
        />
      </Field>
      {login.isError && <Notice tone="error">{errorText(login.error, t)}</Notice>}
      <button type="submit" disabled={login.isPending} className={submitClass(brand)}>
        {login.isPending ? t.account.submitting : t.account.loginSubmit}
      </button>
      <ForgotPassword />
    </form>
  );
}
