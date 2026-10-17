import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { type ApiError, api } from "../../../api/client";
import type { OwnerStoreResponse } from "../../../api/types";
import { Notice } from "../../../components/Notice";
import { Switch, button } from "../../../components/ui";
import { errorText, useT } from "../../../i18n";
import { usePanel } from "../PanelLayout";
import { ownerStoreKey } from "../useOwnerStore";

const PERCENTS = [5, 8, 10, 12, 15, 20];

// Configurações → Salão: la tasa de servicio de las mesas (apagada por defecto). Se suma en la
// precuenta y al cobrar; el mozo la puede sacar en cada cuenta.
export function ServiceFeeSettings() {
  const t = useT();
  const c = t.salon;
  const { store } = usePanel();
  const cache = useQueryClient();
  const saved = store.serviceFeePercent ?? 0;
  const [on, setOn] = useState(saved > 0);
  const [percent, setPercent] = useState(saved > 0 ? saved : 10);
  const value = on ? percent : 0;
  const save = useMutation<OwnerStoreResponse, ApiError, number>({
    mutationFn: (serviceFeePercent) => api<OwnerStoreResponse>("/owner/store", { method: "PATCH", body: { serviceFeePercent } }),
    onSuccess: (data) => cache.setQueryData(ownerStoreKey, data),
  });
  const options = [...new Set([...PERCENTS, percent])].sort((a, b) => a - b);

  return (
    <section aria-labelledby="taxa-servico" className="mb-5 space-y-3 rounded-xl border border-line bg-surface p-4">
      <h2 id="taxa-servico" className="font-bold">
        {c.serviceFee}
      </h2>
      <p className="text-sm text-ink-muted">{c.serviceFeeHint}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Switch label={c.serviceFeeSwitch} checked={on} onChange={(next) => (setOn(next), save.reset())} />
        {on && (
          <label className="flex items-center gap-2">
            <span className="sr-only">{c.serviceFeePercent}</span>
            <select value={percent} onChange={(event) => (setPercent(Number(event.target.value)), save.reset())} className="h-11 rounded-lg border border-line bg-surface px-3 tabular-nums">
              {options.map((option) => (
                <option key={option} value={option}>
                  {option}%
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="button" className={button.primary} disabled={value === saved || save.isPending} onClick={() => save.mutate(value)}>
          {c.serviceFeeSave}
        </button>
        {save.isSuccess && value === saved && <span role="status" className="text-sm font-bold text-success">{c.serviceFeeSaved}</span>}
      </div>
      {save.isError && <Notice tone="error">{errorText(save.error, t)}</Notice>}
    </section>
  );
}
