import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link, Navigate, useLocation } from "react-router";
import { type ApiError, api } from "../../api/client";
import type { SessionResponse } from "../../api/types";
import { clearPanelExpired } from "../../auth/expiry";
import { homeFor, sessionKey, useSession } from "../../auth/session";
import { LanguageSwitch } from "../../components/LanguageSwitch";
import { Notice } from "../../components/Notice";
import { PasswordInput } from "../../components/PasswordInput";
import { errorText, useT } from "../../i18n";
import { supportContact } from "../../lib/support";

type Credentials = { email: string; password: string };

// El cartel de la puerta, el mismo que el dueño usa en el panel: la marca de la entrada.
function OpenSign() {
  const t = useT();
  return (
    <span aria-hidden className="inline-flex h-11 w-fit items-center gap-2 rounded-lg bg-open px-3 font-bold text-white ring-1 ring-inset ring-white/20">
      <span className="size-2.5 rounded-full bg-white shadow-[0_0_0_3px_rgba(255,255,255,0.25)]" />
      {t.status.open}
    </span>
  );
}

// /entrar — la entrada del equipo (dueño, empleado y plataforma). Los clientes tienen la suya en
// el menú de cada local; si alguno llega acá, se lo manda allá.
export function LoginPage() {
  const t = useT();
  const { data: user } = useSession();
  const queryClient = useQueryClient();
  const location = useLocation();
  const [form, setForm] = useState<Credentials>({ email: "", password: "" });
  const contact = supportContact();

  const login = useMutation<SessionResponse, ApiError, Credentials>({
    mutationFn: (credentials) => api<SessionResponse>("/auth/login", { method: "POST", body: credentials }),
    onSuccess: ({ user: logged }) => {
      clearPanelExpired();
      // Lo de la sesión anterior no se mezcla con la nueva.
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== sessionKey[0] });
      queryClient.setQueryData(sessionKey, logged);
    },
  });

  const state = location.state as { from?: string; expired?: boolean } | null;
  const expired = Boolean(state?.expired);
  // Con sesión (la de recién o una que ya había): a donde se quería ir, o al inicio del rol.
  if (user) return <Navigate to={state?.from ?? homeFor(user)} replace />;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate(form);
  };
  const field = "h-12 w-full rounded-lg border border-line bg-surface px-3 text-base";

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* La pizarra: a la izquierda en la PC, arriba en el celular. */}
      <aside className="flex flex-col justify-between gap-6 bg-board px-4 pt-4 pb-6 text-chalk lg:p-12">
        <div className="flex items-center justify-between gap-3">
          <OpenSign />
          <Link to="/" className="-mr-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 font-bold text-chalk hover:bg-board-hover lg:hidden">
            <ArrowLeft aria-hidden className="size-5" />
            {t.login.backHome}
          </Link>
        </div>
        <p className="max-w-md text-xl leading-snug font-bold text-balance text-white lg:text-3xl">{t.login.aside}</p>
      </aside>

      <main className="relative flex flex-col items-center px-4 py-8 lg:justify-center lg:py-10">
        <div className="mb-8 flex w-full max-w-sm items-center justify-between gap-3 lg:absolute lg:top-4 lg:right-4 lg:mb-0 lg:w-auto lg:max-w-none">
          <Link to="/" className="-ml-2 hidden min-h-11 items-center gap-1.5 rounded-lg px-2 font-bold text-ink-muted hover:bg-paper hover:text-ink lg:inline-flex">
            <ArrowLeft aria-hidden className="size-5" />
            {t.login.backHome}
          </Link>
          <span className="lg:hidden" />
          <LanguageSwitch />
        </div>

        <form onSubmit={submit} className="w-full max-w-sm space-y-5" noValidate>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t.login.title}</h1>
            <p className="mt-1 text-ink-muted">{t.login.subtitle}</p>
          </div>
          {expired && !login.isError && <Notice tone="warning">{t.login.expired}</Notice>}
          <div>
            <label htmlFor="email" className="mb-1.5 block font-bold">
              {t.login.email}
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              className={field}
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block font-bold">
              {t.login.password}
            </label>
            <PasswordInput
              id="password"
              autoComplete="current-password"
              required
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              className={field}
            />
          </div>
          {login.isError && <Notice tone="error">{errorText(login.error, t)}</Notice>}
          <button
            type="submit"
            disabled={login.isPending}
            className="h-12 w-full rounded-lg bg-action font-bold text-white hover:bg-action-hover disabled:opacity-60"
          >
            {login.isPending ? t.login.submitting : t.login.submit}
          </button>

          <details className="text-sm">
            <summary className="inline-flex min-h-11 cursor-pointer items-center font-bold underline underline-offset-4">{t.login.forgot}</summary>
            <p className="mt-1 text-ink-muted">{t.login.forgotText}</p>
            {contact && (
              <a href={contact} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-11 items-center font-bold underline underline-offset-4">
                {t.login.support}
              </a>
            )}
          </details>

          <p className="border-t border-line pt-4 text-sm text-ink-muted">
            {t.login.customerHint}{" "}
            <Link to="/conta" className="inline-flex min-h-11 items-center font-bold text-ink underline underline-offset-4">
              {t.login.customerLink}
            </Link>
          </p>
        </form>
      </main>
    </div>
  );
}
