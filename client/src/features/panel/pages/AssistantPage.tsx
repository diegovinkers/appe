import { useSearchParams } from "react-router";
import { can } from "../../../auth/permissions";
import { Spinner } from "../../../components/FullScreenMessage";
import { PageHeader } from "../../../components/PageHeader";
import { useT } from "../../../i18n";
import { formatUsd, useAssistantSettings } from "../assistant/assistant";
import { Conversations } from "../assistant/Conversations";
import { Settings } from "../assistant/Settings";
import { Simulator } from "../assistant/Simulator";
import { usePanel } from "../PanelLayout";

type Tab = "conversas" | "testar" | "configurar";

// Asistente con IA: el equipo atiende las conversaciones; el dueño además lo prueba y lo configura.
export function AssistantPage() {
  const t = useT();
  const { user } = usePanel();
  const isOwner = can(user.role, "store:write");
  const [params, setParams] = useSearchParams();
  const settings = useAssistantSettings(isOwner);

  const selected = params.get("conversa");
  const asked = params.get("aba") as Tab | null;
  const tab: Tab = selected ? "conversas" : isOwner ? (asked ?? "testar") : "conversas";
  const tabs: Tab[] = isOwner ? ["testar", "conversas", "configurar"] : ["conversas"];
  const labels: Record<Tab, string> = {
    conversas: t.assistant.tabs.conversations,
    testar: t.assistant.tabs.test,
    configurar: t.assistant.tabs.settings,
  };

  const go = (next: Tab) => setParams(next === "testar" ? {} : { aba: next });
  const select = (id: string | null) => setParams(id ? { conversa: id } : { aba: "conversas" });

  const data = settings.data?.assistant;

  return (
    <>
      <PageHeader title={t.pages.assistant.title} description={t.pages.assistant.description} />

      {isOwner && data && (
        <>
          {!data.available.ai && (
            <p role="alert" className="mb-4 rounded-xl bg-error-soft p-4 font-bold text-error">
              {t.assistant.noAi}
            </p>
          )}
          <p className="mb-4 text-sm text-ink-muted">
            <strong className="text-ink">
              {t.assistant.month(formatUsd(data.month.costMicros), formatUsd(data.monthlyBudgetUsdCents * 10_000))}
            </strong>
            {" · "}
            {t.assistant.monthCounts(data.month.conversations, data.month.orders)}
          </p>
        </>
      )}

      {tabs.length > 1 && (
        <div
          role="group"
          aria-label={t.pages.assistant.title}
          className="mb-5 flex gap-1 rounded-xl border border-line bg-surface p-1 sm:w-fit"
        >
          {tabs.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={tab === option}
              onClick={() => go(option)}
              className="h-10 flex-1 rounded-lg px-4 font-bold text-ink-muted aria-pressed:bg-action aria-pressed:text-white sm:flex-none"
            >
              {labels[option]}
            </button>
          ))}
        </div>
      )}

      {tab === "testar" && <Simulator canTranscribe={data?.available.transcription ?? false} canListen={data?.available.voice ?? false} />}
      {tab === "conversas" && <Conversations selected={selected} onSelect={select} canListen={data?.available.voice ?? false} />}
      {tab === "configurar" && (settings.isPending ? <Spinner /> : data && <Settings settings={data} />)}
    </>
  );
}
