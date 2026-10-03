import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { type ApiError, api } from "../../api/client";
import type { SessionResponse } from "../../api/types";
import { homeFor, sessionKey, useSession } from "../../auth/session";
import { LanguageSwitch } from "../../components/LanguageSwitch";
import { errorText, useT } from "../../i18n";

type Credentials = { email: string; password: string };

export function LoginPage() {
  const t = useT();
  const { data: user } = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState<Credentials>({ email: "", password: "" });

  const login = useMutation<SessionResponse, ApiError, Credentials>({
    mutationFn: (credentials) => api<SessionResponse>("/auth/login", { method: "POST", body: credentials }),
    onSuccess: ({ user: logged }) => {
      queryClient.setQueryData(sessionKey, logged);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? homeFor(logged), { replace: true });
    },
  });

  if (user) return <Navigate to={homeFor(user)} replace />;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate(form);
  };
  const field = "h-12 w-full rounded-lg border border-line bg-surface px-3 text-base";

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="hidden flex-col justify-between bg-board p-12 text-chalk lg:flex">
        {/* El cartel de la puerta, el mismo que el dueño usa en el panel. */}
        <span aria-hidden className="inline-flex h-11 w-fit items-center gap-2 rounded-lg bg-open px-3 font-bold text-white ring-1 ring-inset ring-white/20">
          <span className="size-2.5 rounded-full bg-white shadow-[0_0_0_3px_rgba(255,255,255,0.25)]" />
          {t.status.open}
        </span>
        <p className="max-w-md text-3xl leading-snug font-bold text-balance text-white">{t.login.aside}</p>
      </aside>
      <main className="relative flex items-center justify-center px-4 pt-20 pb-10">
        <div className="absolute top-4 right-4">
          <LanguageSwitch />
        </div>
        <form onSubmit={submit} className="w-full max-w-sm space-y-5" noValidate>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t.login.title}</h1>
            <p className="mt-1 text-ink-muted">{t.login.subtitle}</p>
          </div>
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
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              className={field}
            />
          </div>
          {login.isError && (
            <p role="alert" className="rounded-lg bg-error-soft px-3 py-2 text-error">
              {errorText(login.error, t)}
            </p>
          )}
          <button
            type="submit"
            disabled={login.isPending}
            className="h-12 w-full rounded-lg bg-action font-bold text-white hover:bg-action-hover disabled:opacity-60"
          >
            {login.isPending ? t.login.submitting : t.login.submit}
          </button>
        </form>
      </main>
    </div>
  );
}
