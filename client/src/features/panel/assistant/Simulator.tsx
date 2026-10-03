import { Mic, Send, Upload, X } from "lucide-react";
import { type ChangeEvent, type FormEvent, type KeyboardEvent, useState } from "react";
import type { Conversation, ConversationMessage } from "../../../api/types";
import { Field, Switch, button, input, textarea } from "../../../components/ui";
import { type Language, LANGUAGES, errorText, useT } from "../../../i18n";
import { MAX_AUDIO_BYTES, SIMULATED_CUSTOMER, blobToBase64, useConversationAction, useSimulator, useSimulatorAudio } from "./assistant";
import { Thread } from "./Thread";
import { useRecorder } from "./useRecorder";

const duration = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

// El dueño le escribe al asistente como si fuera un cliente, antes de ponerlo en WhatsApp.
export function Simulator({ canTranscribe, canListen }: { canTranscribe: boolean; canListen: boolean }) {
  const t = useT();
  const s = t.assistant.simulator;
  const simulator = useSimulator();
  const voice = useSimulatorAudio();
  const recorder = useRecorder();
  const [audioError, setAudioError] = useState<string | null>(null);
  const action = useConversationAction();
  const [customer, setCustomer] = useState(SIMULATED_CUSTOMER);
  const [locale, setLocale] = useState<Language>("pt-BR");
  const [realOrders, setRealOrders] = useState(false);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [text, setText] = useState("");

  const started = conversation !== null;
  const busy = simulator.isPending || voice.isPending;
  const withAudio = canTranscribe && recorder.supported;

  const received = (data: { conversation: Conversation; messages: ConversationMessage[] }) => {
    setConversation(data.conversation);
    setMessages((previous) => [...previous, ...data.messages]);
  };

  async function sendAudio(blob: Blob | null) {
    setAudioError(null);
    if (!blob || !blob.size) return;
    if (blob.size > MAX_AUDIO_BYTES) return setAudioError(s.audioTooLong);
    const audio = await blobToBase64(blob);
    voice.mutate(
      { audio, customer, locale, realOrders, ...(conversation && { conversationId: conversation._id }) },
      { onSuccess: received },
    );
  }

  async function startRecording() {
    setAudioError(null);
    try {
      await recorder.start();
    } catch {
      setAudioError(s.noMic);
    }
  }

  function uploadAudio(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void sendAudio(file);
  }

  function send(event?: FormEvent) {
    event?.preventDefault();
    const message = text.trim();
    if (!message || busy) return;
    simulator.mutate(
      { text: message, customer, locale, realOrders, ...(conversation && { conversationId: conversation._id }) },
      {
        onSuccess: (data) => {
          received(data);
          setText("");
        },
      },
    );
  }

  // Enter manda; Shift+Enter hace un salto de línea (como en WhatsApp Web).
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) send(event);
  }

  function restart() {
    setConversation(null);
    setMessages([]);
    simulator.reset();
    voice.reset();
    setAudioError(null);
  }

  function release() {
    if (!conversation) return;
    action.mutate({ id: conversation._id, action: "release" }, { onSuccess: (data) => setConversation(data.conversation) });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[18rem_1fr]">
      <aside className="space-y-4 max-lg:order-last">
        <p className="text-ink-muted">{s.intro}</p>
        <Field id="sim-nome" label={s.name}>
          <input
            id="sim-nome"
            className={input}
            value={customer.name}
            disabled={started}
            onChange={(event) => setCustomer({ ...customer, name: event.target.value })}
          />
        </Field>
        <Field id="sim-fone" label={s.phone} hint={s.phoneHint}>
          <input
            id="sim-fone"
            className={input}
            inputMode="tel"
            value={customer.phone}
            disabled={started}
            onChange={(event) => setCustomer({ ...customer, phone: event.target.value })}
          />
        </Field>
        <Field id="sim-idioma" label={s.language}>
          <select
            id="sim-idioma"
            className={input}
            value={locale}
            disabled={started}
            onChange={(event) => setLocale(event.target.value as Language)}
          >
            {LANGUAGES.map((language) => (
              <option key={language.code} value={language.code}>
                {language.name}
              </option>
            ))}
          </select>
        </Field>
        <div>
          <Switch checked={realOrders} onChange={setRealOrders} label={s.realOrders} />
          <p className="text-sm text-ink-muted">{s.realOrdersHint}</p>
        </div>
        <button type="button" className={button.secondary} onClick={restart} disabled={!started && !messages.length}>
          {s.newChat}
        </button>
        {!canTranscribe && <p className="text-sm text-ink-muted">{s.noTranscription}</p>}
      </aside>

      <section
        aria-label={t.assistant.tabs.test}
        className="flex min-h-[28rem] flex-col overflow-hidden rounded-xl border border-line bg-paper"
      >
        <p
          className={`px-4 py-2 text-sm font-bold ${realOrders ? "bg-[#fff4d6] text-[#7a4e00]" : "bg-surface text-ink-muted"} border-b border-line`}
        >
          {realOrders ? s.realMode : s.testMode}
        </p>
        <div data-chat-scroll className="max-h-[60dvh] flex-1 overflow-y-auto p-4">
          {!messages.length && !busy && <p className="text-ink-muted">{s.empty}</p>}
          <Thread
            messages={messages}
            storeSide={false}
            voice={canListen ? { locale: conversation?.locale ?? locale } : null}
            pending={simulator.isPending ? simulator.variables?.text : voice.isPending ? s.audioPending : undefined}
          />
        </div>

        {conversation?.status === "human" && (
          <div className="flex flex-wrap items-center gap-3 border-t border-line bg-surface px-4 py-3">
            <p className="min-w-0 flex-1 text-sm">{t.assistant.handedOff(conversation.handoff?.reason ?? "")}</p>
            <button type="button" className={button.secondary} onClick={release} disabled={action.isPending}>
              {t.assistant.release}
            </button>
          </div>
        )}
        {(simulator.isError || voice.isError || audioError) && (
          <p role="alert" className="border-t border-line bg-surface px-4 py-2 font-bold text-error">
            {audioError ?? errorText(simulator.error ?? voice.error, t)}
          </p>
        )}

        {recorder.recording ? (
          <div className="flex items-center gap-2 border-t border-line bg-surface p-3">
            <p role="status" className="min-w-0 flex-1 font-bold text-error">
              <Mic aria-hidden className="mr-2 inline size-5 animate-pulse" />
              {s.recording(duration(recorder.seconds))}
            </p>
            <button type="button" className={button.quiet} onClick={() => void recorder.stop(false)}>
              <X aria-hidden className="size-5" />
              {s.cancelAudio}
            </button>
            <button type="button" className={button.primary} onClick={async () => sendAudio(await recorder.stop(true))}>
              <Send aria-hidden className="size-5" />
              {s.sendAudio}
            </button>
          </div>
        ) : (
          <form onSubmit={send} className="flex items-end gap-2 border-t border-line bg-surface p-3">
            <label htmlFor="sim-texto" className="sr-only">
              {s.placeholder}
            </label>
            <textarea
              id="sim-texto"
              rows={2}
              className={`${textarea} min-h-11 resize-none`}
              placeholder={s.placeholder}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={onKeyDown}
              maxLength={1000}
            />
            {withAudio && (
              <button
                type="button"
                className={button.secondary}
                onClick={startRecording}
                disabled={busy}
                aria-label={s.record}
                title={s.record}
              >
                <Mic aria-hidden className="size-5" />
              </button>
            )}
            <button type="submit" className={button.primary} disabled={!text.trim() || busy} aria-label={s.send}>
              <Send aria-hidden className="size-5" />
              <span className="hidden sm:inline">{s.send}</span>
            </button>
          </form>
        )}
        {canTranscribe && !recorder.recording && (
          <label className="flex cursor-pointer items-center gap-2 border-t border-line bg-surface px-4 py-2 text-sm font-bold text-ink-muted hover:text-ink">
            <Upload aria-hidden className="size-4" />
            {s.uploadAudio}
            <input type="file" accept="audio/*" className="sr-only" onChange={uploadAudio} disabled={busy} />
          </label>
        )}
      </section>
    </div>
  );
}
