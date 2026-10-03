import { type FormEvent, useState } from "react";
import { Field, button, input } from "../../components/ui";
import { errorText, useLanguage, useT } from "../../i18n";
import { loadCustomer } from "../menu/customer";
import { useLogin, useSignup } from "./account";

const digits = (phone: string) => phone.replace(/\D/g, "").length;

// Crear la cuenta con lo mínimo: nombre y WhatsApp vienen de la última compra en este
// aparato (se pueden corregir); solo falta la contraseña.
export function SignupForm({ onDone, idPrefix = "cadastro" }: { onDone?: () => void; idPrefix?: string }) {
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
          <Field id={`${idPrefix}-fone`} label={t.account.phone} error={errors.phone}>
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
        <input
          id={`${idPrefix}-senha`}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          maxLength={72}
          className={input}
          aria-invalid={!!errors.password}
        />
      </Field>
      {signup.isError && (
        <p role="alert" className="text-sm font-bold text-error">
          {errorText(signup.error, t)}
        </p>
      )}
      <button type="submit" disabled={signup.isPending} className={`${button.primary} h-12 w-full`}>
        {signup.isPending ? t.account.submitting : t.account.signupSubmit}
      </button>
    </form>
  );
}

export function LoginForm({ onDone, idPrefix = "entrar" }: { onDone?: () => void; idPrefix?: string }) {
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
      <Field id={`${idPrefix}-fone`} label={t.account.phone}>
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
        <input
          id={`${idPrefix}-senha`}
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          maxLength={72}
          className={input}
        />
      </Field>
      {login.isError && (
        <p role="alert" className="text-sm font-bold text-error">
          {errorText(login.error, t)}
        </p>
      )}
      <button type="submit" disabled={login.isPending} className={`${button.primary} h-12 w-full`}>
        {login.isPending ? t.account.submitting : t.account.loginSubmit}
      </button>
    </form>
  );
}
