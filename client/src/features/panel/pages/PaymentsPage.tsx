import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { type ApiError, api } from "../../../api/client";
import type { OwnerStore, OwnerStoreResponse, PaymentMethod } from "../../../api/types";
import { PageHeader } from "../../../components/PageHeader";
import { Field, Switch, button, input } from "../../../components/ui";
import { useDirtyForm } from "../../../hooks/useDirtyForm";
import { errorText, useT } from "../../../i18n";
import { usePanel } from "../PanelLayout";
import { ownerStoreKey } from "../useOwnerStore";
import { SettingsSection } from "./StorePage";

const METHODS: PaymentMethod[] = ["cash", "pix", "card"];
const fields = (store: OwnerStore) => ({ paymentMethods: [...store.paymentMethods], pixKey: store.pixKey });

// Cómo pagan los clientes: dinero, Pix (con su clave) y tarjeta.
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

  const save = useMutation<OwnerStoreResponse, ApiError, typeof draft>({
    mutationFn: (body) => api("/owner/store", { method: "PATCH", body }),
    onSuccess: (response) => {
      cache.setQueryData(ownerStoreKey, response);
      cache.invalidateQueries({ queryKey: ["public-store"] });
      const next = fields(response.store);
      setBaseline(next);
      setDraft(next);
    },
  });

  const change = (next: Partial<typeof draft>) => {
    setDraft((current) => ({ ...current, ...next }));
    setLocalError("");
    save.reset();
  };

  function submit(event: FormEvent) {
    event.preventDefault();
    if (save.isPending) return;
    if (!draft.paymentMethods.length) return setLocalError(c.methodsRequired);
    if (draft.paymentMethods.includes("pix") && !draft.pixKey.trim()) {
      setLocalError(c.pixRequired);
      document.getElementById("payments-pixKey")?.focus();
      return;
    }
    save.mutate({ ...draft, pixKey: draft.pixKey.trim() });
  }

  return (
    <>
      <PageHeader title={t.pages.payments.title} description={t.pages.payments.description} />
      <form onSubmit={submit} className="space-y-5">
        <fieldset disabled={save.isPending} className="space-y-5 disabled:opacity-70">
          <SettingsSection title={c.methods}>
            <p className="text-sm text-ink-muted">{c.methodsHint}</p>
            {METHODS.map((method) => (
              <Switch
                key={method}
                label={c[method]}
                checked={draft.paymentMethods.includes(method)}
                onChange={(on) =>
                  change({ paymentMethods: on ? [...draft.paymentMethods, method] : draft.paymentMethods.filter((value) => value !== method) })
                }
              />
            ))}
            {draft.paymentMethods.includes("pix") && (
              <Field id="payments-pixKey" label={c.pixKey} hint={c.pixHint}>
                <input id="payments-pixKey" className={input} value={draft.pixKey} maxLength={140} onChange={(event) => change({ pixKey: event.target.value })} />
              </Field>
            )}
          </SettingsSection>
        </fieldset>
        {(localError || save.isError) && (
          <p role="alert" className="text-error">
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
