import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { type ApiError, api } from "../../../api/client";
import type { OwnerStore, OwnerStoreResponse, PaymentMethod } from "../../../api/types";
import { PageHeader } from "../../../components/PageHeader";
import { Field, Switch, button, input } from "../../../components/ui";
import { useDirtyForm } from "../../../hooks/useDirtyForm";
import { errorText, useT } from "../../../i18n";
import { paymentMethodsFor } from "../../../lib/payments";
import { isValidPixKey } from "../../../lib/pix";
import { usePanel } from "../PanelLayout";
import { ownerStoreKey } from "../useOwnerStore";
import { SettingsSection } from "./StorePage";

const METHODS: PaymentMethod[] = ["cash", "pix", "card"];
const FULFILLMENTS = ["both", "delivery", "pickup"] as const;

const fields = (store: OwnerStore) => ({
  paymentMethods: [...store.paymentMethods],
  pixKey: store.pixKey,
  paymentOptions: {
    // Pueden faltar unos minutos mientras se despliega el backend.
    cash: {
      fulfillment: store.paymentOptions?.cash?.fulfillment ?? "both",
      note: store.paymentOptions?.cash?.note ?? "",
      askChange: store.paymentOptions?.cash?.askChange ?? true,
    },
    pix: { fulfillment: store.paymentOptions?.pix?.fulfillment ?? "both", note: store.paymentOptions?.pix?.note ?? "" },
    card: { fulfillment: store.paymentOptions?.card?.fulfillment ?? "both", note: store.paymentOptions?.card?.note ?? "" },
  },
});
type Draft = ReturnType<typeof fields>;

// Cómo pagan los clientes: qué formas acepta el local, para entrega, retiro o las dos, con una
// nota para el cliente, la chave Pix y si se pregunta por el troco.
export function PaymentsPage() {
  const t = useT();
  const c = t.paymentSettings;
  const { store } = usePanel();
  const cache = useQueryClient();
  const [baseline, setBaseline] = useState(() => fields(store));
  const [draft, setDraft] = useState(baseline);
  const [localError, setLocalError] = useState("");
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  useDirtyForm(dirty);

  const save = useMutation<OwnerStoreResponse, ApiError, Draft>({
    mutationFn: (body) => api("/owner/store", { method: "PATCH", body }),
    onSuccess: (response) => {
      cache.setQueryData(ownerStoreKey, response);
      cache.invalidateQueries({ queryKey: ["public-store"] });
      const next = fields(response.store);
      setBaseline(next);
      setDraft(next);
    },
  });

  const change = (next: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...next }));
    setLocalError("");
    save.reset();
  };
  const changeOption = <M extends PaymentMethod>(method: M, value: Partial<Draft["paymentOptions"][M]>) =>
    change({ paymentOptions: { ...draft.paymentOptions, [method]: { ...draft.paymentOptions[method], ...value } } });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (save.isPending) return;
    const pixKey = draft.pixKey.trim();
    if (!draft.paymentMethods.length) return setLocalError(c.methodsRequired);
    if (draft.paymentMethods.includes("pix")) {
      if (!pixKey) return setLocalError(c.pixRequired);
      // Una chave nueva tiene que tener formato válido; la que ya estaba no se revisa.
      if (pixKey !== baseline.pixKey && !isValidPixKey(pixKey)) {
        document.getElementById("payments-pixKey")?.focus();
        return setLocalError(c.pixInvalid);
      }
    }
    for (const mode of ["delivery", "pickup"] as const) {
      if (store.fulfillment[mode] && !paymentMethodsFor(draft, mode).length) return setLocalError(c.noneFor(mode));
    }
    save.mutate({ ...draft, pixKey });
  }

  return (
    <>
      <PageHeader title={t.pages.payments.title} description={t.pages.payments.description} />
      <form onSubmit={submit} className="space-y-5">
        <fieldset disabled={save.isPending} className="space-y-5 disabled:opacity-70">
          <p className="text-sm text-ink-muted">{c.methodsHint}</p>
          {METHODS.map((method) => {
            const enabled = draft.paymentMethods.includes(method);
            const option = draft.paymentOptions[method];
            return (
              <SettingsSection key={method} title={c[method]}>
                <Switch
                  label={c[method]}
                  showLabel={false}
                  checked={enabled}
                  onChange={(on) =>
                    change({ paymentMethods: on ? [...draft.paymentMethods, method] : draft.paymentMethods.filter((value) => value !== method) })
                  }
                />
                {enabled && (
                  <>
                    {store.fulfillment.delivery && store.fulfillment.pickup && (
                      <div role="radiogroup" aria-label={`${c.validFor}: ${c[method]}`}>
                        <p className="mb-1.5 font-bold">{c.validFor}</p>
                        <div className="flex flex-wrap gap-2">
                          {FULFILLMENTS.map((value) => (
                            <button
                              key={value}
                              type="button"
                              role="radio"
                              aria-checked={option.fulfillment === value}
                              onClick={() => changeOption(method, { fulfillment: value })}
                              className={`h-11 rounded-full px-4 text-sm ${option.fulfillment === value ? "bg-action font-bold text-white" : "bg-surface ring-1 ring-line hover:bg-paper"}`}
                            >
                              {c.fulfillments[value]}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {method === "pix" && (
                      <Field id="payments-pixKey" label={c.pixKey} hint={c.pixHint}>
                        <input id="payments-pixKey" className={input} value={draft.pixKey} maxLength={140} onChange={(event) => change({ pixKey: event.target.value })} />
                      </Field>
                    )}
                    {method === "cash" && (
                      <Switch label={c.askChange} checked={draft.paymentOptions.cash.askChange} onChange={(askChange) => changeOption("cash", { askChange })} />
                    )}
                    <Field id={`payments-note-${method}`} label={c.note}>
                      <input
                        id={`payments-note-${method}`}
                        className={input}
                        value={option.note}
                        maxLength={80}
                        placeholder={c.notePlaceholders[method]}
                        onChange={(event) => changeOption(method, { note: event.target.value })}
                      />
                    </Field>
                  </>
                )}
              </SettingsSection>
            );
          })}
        </fieldset>
        {(localError || save.isError) && (
          <p role="alert" className="font-bold text-error">
            {localError || errorText(save.error, t)}
          </p>
        )}
        {save.isSuccess && !dirty && (
          <p role="status" className="text-success">
            {c.saved}
          </p>
        )}
        <div className="sticky bottom-16 flex flex-wrap items-center gap-3 border-t border-line bg-paper py-4 lg:bottom-0">
          <button className={button.primary} disabled={save.isPending || !dirty}>
            {save.isPending ? c.saving : c.save}
          </button>
          <button
            type="button"
            className={button.secondary}
            disabled={save.isPending || !dirty}
            onClick={() => {
              if (window.confirm(c.discardConfirm)) {
                setDraft(baseline);
                setLocalError("");
                save.reset();
              }
            }}
          >
            {c.discard}
          </button>
          {dirty && <p className="text-sm text-ink-muted">{c.unsaved}</p>}
        </div>
      </form>
    </>
  );
}
