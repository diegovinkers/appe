import { type FormEvent, useState } from "react";
import type { AssistantSettings } from "../../../api/types";
import { Field, Switch, button, input } from "../../../components/ui";
import { errorText, useT } from "../../../i18n";
import { average, formatUsd, useUpdateAssistant } from "./assistant";

// Encender el asistente en WhatsApp, el número conectado y el tope de gasto.
export function Settings({ settings }: { settings: AssistantSettings }) {
  const t = useT();
  const s = t.assistant.settings;
  const update = useUpdateAssistant();
  const [enabled, setEnabled] = useState(settings.enabled);
  const [phoneNumberId, setPhoneNumberId] = useState(settings.phoneNumberId ?? "");
  const [budget, setBudget] = useState(String(settings.monthlyBudgetUsdCents / 100));
  const [voiceReplies, setVoiceReplies] = useState(settings.voiceReplies);

  const { month } = settings;
  const perConversation = average(month.costMicros, month.conversations);
  const perOrder = average(month.costMicros, month.orders);
  const budgetCents = Math.round(Number(budget.replace(",", ".")) * 100);
  const validBudget = budget.trim() !== "" && Number.isFinite(budgetCents) && budgetCents >= 0;

  function save(event: FormEvent) {
    event.preventDefault();
    if (!validBudget) return;
    update.mutate({ enabled, phoneNumberId: phoneNumberId.trim(), monthlyBudgetUsdCents: budgetCents, voiceReplies });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
      <form onSubmit={save} className="space-y-5 rounded-xl border border-line bg-surface p-4 sm:p-5">
        <div>
          <Switch checked={enabled} onChange={setEnabled} label={s.enabled} disabled={!settings.available.whatsapp && !enabled} />
          <p className="text-sm text-ink-muted">{settings.available.whatsapp ? s.enabledHint : s.noWhatsapp}</p>
        </div>
        <Field id="assistente-numero" label={s.phoneNumberId} hint={s.phoneNumberIdHint}>
          <input
            id="assistente-numero"
            className={input}
            inputMode="numeric"
            value={phoneNumberId}
            onChange={(event) => setPhoneNumberId(event.target.value.replace(/\D/g, ""))}
          />
        </Field>
        <Field id="assistente-limite" label={s.budget} hint={s.budgetHint}>
          <input
            id="assistente-limite"
            className={`${input} max-w-40`}
            inputMode="decimal"
            aria-invalid={!validBudget}
            value={budget}
            onChange={(event) => setBudget(event.target.value)}
          />
        </Field>
        <div>
          <Switch
            checked={voiceReplies}
            onChange={setVoiceReplies}
            label={s.voiceReplies}
            disabled={!settings.available.voice && !voiceReplies}
          />
          <p className="text-sm text-ink-muted">{settings.available.voice ? s.voiceHint : s.noVoice}</p>
        </div>
        {update.isError && (
          <p role="alert" className="font-bold text-error">
            {errorText(update.error, t)}
          </p>
        )}
        <div className="flex items-center gap-3">
          <button type="submit" className={button.primary} disabled={update.isPending || !validBudget}>
            {s.save}
          </button>
          {update.isSuccess && (
            <p role="status" className="font-bold text-success">
              {s.saved}
            </p>
          )}
        </div>
      </form>

      <aside className="space-y-2 rounded-xl border border-line bg-surface p-4 text-sm">
        <p>
          {s.averages(
            perConversation === null ? s.noAverage : formatUsd(perConversation),
            perOrder === null ? s.noAverage : formatUsd(perOrder),
          )}
        </p>
        <p className="text-ink-muted">{s.model(settings.model)}</p>
      </aside>
    </div>
  );
}
