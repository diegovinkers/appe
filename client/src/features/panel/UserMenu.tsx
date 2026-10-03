import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, LogOut } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { api } from "../../api/client";
import type { SessionUser } from "../../api/types";
import { useDismiss } from "../../hooks/useDismiss";
import { LANGUAGES, setLanguage, useLanguage, useT } from "../../i18n";
import { initials } from "../../lib/color";
import { ThemeSwitch } from "../../components/ThemeSwitch";

export function UserMenu({ user }: { user: SessionUser }) {
  const t = useT();
  const language = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const logout = useMutation({
    mutationFn: () => api("/auth/logout", { method: "POST" }),
    // Aunque falle la red, en este dispositivo se sale igual.
    onSettled: () => {
      queryClient.clear();
      navigate("/entrar", { replace: true });
    },
  });

  return (
    <div className="flex shrink-0 items-center gap-2">
      <ThemeSwitch />
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t.user.menu}: ${user.name}`}
        onClick={() => setOpen((value) => !value)}
        className="flex h-11 items-center gap-2 rounded-lg px-1 hover:bg-paper lg:px-2"
      >
        <span aria-hidden className="grid size-9 place-items-center rounded-full bg-action text-sm font-bold text-white">
          {initials(user.name)}
        </span>
        <span className="hidden max-w-40 text-left leading-tight lg:block">
          <span className="block truncate text-sm font-bold">{user.name}</span>
          <span className="block text-xs text-ink-muted">{t.user.roles[user.role]}</span>
        </span>
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-line bg-surface p-1.5 shadow-lg">
          <div className="px-3 py-2">
            <p className="font-bold">{user.name}</p>
            <p className="break-all text-sm text-ink-muted">{user.email}</p>
            <p className="text-sm text-ink-muted">{t.user.roles[user.role]}</p>
          </div>
          <hr className="my-1 border-line" />
          <p className="px-3 pt-1.5 pb-1 text-sm text-ink-muted">{t.language}</p>
          {LANGUAGES.map(({ code, name }) => (
            <button
              key={code}
              type="button"
              role="menuitemradio"
              aria-checked={code === language}
              lang={code}
              onClick={() => setLanguage(code)}
              className="flex h-11 w-full items-center justify-between rounded-lg px-3 text-left hover:bg-paper"
            >
              {name}
              {code === language && <Check aria-hidden className="size-4" />}
            </button>
          ))}
          <hr className="my-1 border-line" />
          <button
            type="button"
            role="menuitem"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            className="flex h-11 w-full items-center gap-2 rounded-lg px-3 text-left hover:bg-paper"
          >
            <LogOut aria-hidden className="size-4" />
            {t.user.logout}
          </button>
        </div>
      )}
    </div>
    </div>
  );
}
