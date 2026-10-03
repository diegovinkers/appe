import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { type ApiError, api } from "../../api/client";
import type { Opening, OwnerStore, OwnerStoreResponse } from "../../api/types";
import { useDismiss } from "../../hooks/useDismiss";
import { errorText, useT } from "../../i18n";
import { type StatusChange, statusActions, statusView } from "./storeStatus";
import { ownerStoreKey } from "./useOwnerStore";

// El cartel de la puerta: el estado de la loja, siempre visible, y cambiarlo con un toque.
export function StoreStatusControl({ store, opening, canChange }: { store: OwnerStore; opening: Opening; canChange: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  const queryClient = useQueryClient();
  const change = useMutation<OwnerStoreResponse, ApiError, StatusChange>({
    mutationFn: (body) => api<OwnerStoreResponse>("/owner/store/status", { method: "PUT", body }),
    onSuccess: (data) => {
      queryClient.setQueryData(ownerStoreKey, data);
      setOpen(false);
    },
  });

  const view = statusView(opening);
  const sign = (
    <>
      <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-white shadow-[0_0_0_3px_rgba(255,255,255,0.25)]" />
      <span className="font-bold">{view.label}</span>
      {view.detail && <span className="hidden text-sm text-white/85 sm:inline">{view.detail}</span>}
    </>
  );
  const signClass = `inline-flex h-11 items-center gap-2 rounded-lg px-3 text-white ring-1 ring-inset ring-white/20 ${view.tone}`;

  if (!canChange) return <div className={signClass}>{sign}</div>;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${view.label}${view.detail ? `, ${view.detail}` : ""}. ${t.status.change}`}
        onClick={() => setOpen((value) => !value)}
        className={`${signClass} shadow-sm hover:brightness-110`}
      >
        {sign}
        <ChevronDown aria-hidden className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-line bg-surface p-1.5 shadow-lg">
          {store.override && <p className="px-3 pb-1 pt-1.5 text-sm text-ink-muted">{t.status.manual}</p>}
          {statusActions(store, opening).map((action) => (
            <button
              key={action.key}
              type="button"
              role="menuitem"
              disabled={change.isPending}
              onClick={() => change.mutate(action.change)}
              className="flex h-11 w-full items-center rounded-lg px-3 text-left hover:bg-paper disabled:opacity-50"
            >
              {action.label}
            </button>
          ))}
          {change.isError && (
            <p role="alert" className="px-3 py-2 text-sm text-error">
              {errorText(change.error, t)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
