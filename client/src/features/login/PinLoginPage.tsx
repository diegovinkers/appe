import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Delete } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { type ApiError, api } from "../../api/client";
import type { SessionResponse } from "../../api/types";
import { useTeamDevice } from "../../auth/device";
import { clearPanelExpired } from "../../auth/expiry";
import { sessionKey } from "../../auth/session";
import { Spinner } from "../../components/FullScreenMessage";
import { LanguageSwitch } from "../../components/LanguageSwitch";
import { Notice } from "../../components/Notice";
import { errorText, useT } from "../../i18n";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

// /entrar/equipe — en un aparato del equipo: cada uno toca su nombre y pone su PIN. Sirve para
// entrar y para cambiar de persona (la sesión anterior se reemplaza).
export function PinLoginPage() {
  const t = useT();
  const c = t.pinLogin;
  const device = useTeamDevice();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [personId, setPersonId] = useState<string | null>(null);
  const [pin, setPin] = useState("");

  const login = useMutation<SessionResponse, ApiError, { userId: string; pin: string }>({
    mutationFn: (body) => api<SessionResponse>("/auth/pin", { method: "POST", body }),
    onSuccess: ({ user }) => {
      clearPanelExpired();
      // Lo de la persona anterior no se mezcla con la nueva.
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== sessionKey[0] && query.queryKey[0] !== "team-device" });
      queryClient.setQueryData(sessionKey, user);
      navigate("/painel/pedidos", { replace: true });
    },
    onError: () => setPin(""),
  });

  const person = device.data?.people.find((item) => item._id === personId) ?? null;
  const press = (key: string) => {
    if (login.isPending || pin.length >= 6) return;
    login.reset();
    setPin(pin + key);
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 py-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <Link to="/entrar" className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 font-bold text-ink-muted hover:bg-paper hover:text-ink">
          <ArrowLeft aria-hidden className="size-5" />
          {c.withEmail}
        </Link>
        <LanguageSwitch />
      </div>

      {device.isPending && <Spinner />}
      {device.isError && <Notice tone="error">{errorText(device.error, t)}</Notice>}
      {device.data === null && (
        <div className="space-y-3">
          <h1 className="text-2xl font-bold">{c.title}</h1>
          <Notice tone="warning">{c.notRegistered}</Notice>
        </div>
      )}

      {device.data && !person && (
        <section aria-labelledby="quem" className="space-y-4">
          <div>
            <p className="font-bold text-ink-muted">{device.data.commerce.name}</p>
            <h1 id="quem" className="text-2xl font-bold">
              {c.who}
            </h1>
          </div>
          {device.data.people.length === 0 ? (
            <Notice tone="warning">{c.nobody}</Notice>
          ) : (
            <ul className="grid grid-cols-2 gap-3">
              {device.data.people.map((item) => (
                <li key={item._id}>
                  <button
                    type="button"
                    onClick={() => {
                      setPersonId(item._id);
                      setPin("");
                      login.reset();
                    }}
                    className="flex min-h-20 w-full items-center justify-center rounded-xl border border-line bg-surface px-3 text-center text-lg font-bold hover:bg-paper"
                  >
                    {item.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {device.data && person && (
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (pin.length >= 4 && !login.isPending) login.mutate({ userId: person._id, pin });
          }}
        >
          <div className="text-center">
            <p className="font-bold text-ink-muted">{device.data.commerce.name}</p>
            <h1 className="text-2xl font-bold">{c.hello(person.name)}</h1>
            <p className="mt-1 text-ink-muted">{c.typePin}</p>
          </div>
          <p aria-label={c.digits(pin.length)} className="flex h-8 items-center justify-center gap-3">
            {Array.from({ length: Math.max(4, pin.length) }, (_, index) => (
              <span key={index} aria-hidden className={`size-4 rounded-full ${index < pin.length ? "bg-ink" : "border-2 border-line"}`} />
            ))}
          </p>
          {login.isError && <Notice tone="error">{errorText(login.error, t)}</Notice>}
          <div className="grid grid-cols-3 gap-3">
            {KEYS.map((key) => (
              <button key={key} type="button" onClick={() => press(key)} className="h-16 rounded-xl border border-line bg-surface text-2xl font-bold tabular-nums hover:bg-paper active:bg-paper">
                {key}
              </button>
            ))}
            <button type="button" onClick={() => setPersonId(null)} className="h-16 rounded-xl text-sm font-bold text-ink-muted hover:bg-paper">
              {c.notMe}
            </button>
            <button type="button" onClick={() => press("0")} className="h-16 rounded-xl border border-line bg-surface text-2xl font-bold hover:bg-paper active:bg-paper">
              0
            </button>
            <button type="button" aria-label={c.erase} onClick={() => setPin(pin.slice(0, -1))} className="grid h-16 place-items-center rounded-xl text-ink-muted hover:bg-paper">
              <Delete aria-hidden className="size-6" />
            </button>
          </div>
          <button type="submit" disabled={pin.length < 4 || login.isPending} className="h-14 w-full rounded-xl bg-action text-lg font-bold text-white hover:bg-action-hover disabled:opacity-50">
            {login.isPending ? t.login.submitting : t.login.submit}
          </button>
        </form>
      )}
    </main>
  );
}
