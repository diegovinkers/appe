import { Mic, Volume2 } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import type { ConversationMessage } from "../../../api/types";
import { useT } from "../../../i18n";
import { formatTime } from "../../../lib/format";
import { fetchSpeech, formatUsd, whatsappPieces } from "./assistant";

// Texto de un mensaje con el formato de WhatsApp (*negrita*, links y saltos de línea).
export function MessageText({ text }: { text: string }) {
  return text.split("\n").map((line, index) => (
    <Fragment key={index}>
      {index > 0 && <br />}
      {whatsappPieces(line).map((piece, at) =>
        piece.kind === "bold" ? (
          <strong key={at}>{piece.text}</strong>
        ) : piece.kind === "link" ? (
          <a key={at} href={piece.text} target="_blank" rel="noreferrer" className="break-all underline underline-offset-2">
            {piece.text}
          </a>
        ) : (
          <Fragment key={at}>{piece.text}</Fragment>
        ),
      )}
    </Fragment>
  ));
}

// Lo que hizo el asistente para contestar: las herramientas que usó y cuánto costó.
function WhatHappened({ message }: { message: ConversationMessage }) {
  const t = useT();
  if (!message.usage && !message.toolCalls.length) return null;
  return (
    <details className="mt-1 max-w-full text-sm text-ink-muted">
      <summary className="cursor-pointer select-none py-1">{t.assistant.whatHappened(formatUsd(message.usage?.costMicros ?? 0))}</summary>
      <ul className="mt-1 space-y-2">
        {message.toolCalls.map((call, index) => {
          const output = call.output as { ok?: boolean; erros?: string[]; resumo?: string } | null;
          return (
            <li key={index} className="rounded-lg border border-line bg-surface p-2">
              <p className="font-bold text-ink">
                {t.assistant.tools[call.name] ?? call.name}
                {output?.ok === false && <span className="font-normal text-error"> · {t.assistant.toolFailed}</span>}
              </p>
              {output?.erros?.map((error) => (
                <p key={error} className="text-error">
                  {error}
                </p>
              ))}
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs">
                {JSON.stringify(call.input, null, 1)}
              </pre>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

// Escuchar la respuesta como nota de voz (la genera el servidor la primera vez).
function Listen({ text, locale }: { text: string; locale: string }) {
  const t = useT();
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const url = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (url.current) URL.revokeObjectURL(url.current);
    },
    [],
  );

  async function play() {
    if (!url.current) {
      setState("loading");
      try {
        url.current = URL.createObjectURL(await fetchSpeech(text, locale));
      } catch {
        return setState("error");
      }
    }
    setState("idle");
    void new Audio(url.current).play();
  }

  return (
    <button
      type="button"
      onClick={play}
      disabled={state === "loading"}
      className="mt-1 flex items-center gap-1.5 text-sm font-bold text-ink-muted hover:text-ink"
    >
      <Volume2 aria-hidden className="size-4" />
      {state === "loading" ? t.assistant.listening : state === "error" ? t.assistant.listenFailed : t.assistant.listen}
    </button>
  );
}

// Un mensaje. `storeSide`: del lado derecho van los del local (vista del panel) o los
// del cliente (simulador, donde el que escribe hace de cliente).
type Voice = { locale: string } | null;

function Bubble({ message, storeSide, voice }: { message: ConversationMessage; storeSide: boolean; voice: Voice }) {
  const t = useT();
  const fromStore = message.role !== "customer";
  const right = fromStore === storeSide;
  return (
    <li className={`flex flex-col ${right ? "items-end" : "items-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2 sm:max-w-[75%] ${right ? "rounded-br-sm bg-action text-white" : "rounded-bl-sm border border-line bg-surface"}`}
      >
        <p className={`mb-0.5 flex items-center gap-1.5 text-xs font-bold ${right ? "text-white/80" : "text-ink-muted"}`}>
          {message.kind === "audio" && <Mic aria-label={t.assistant.audio} className="size-3.5" />}
          {t.assistant.roles[message.role]} · {formatTime(message.createdAt)}
        </p>
        <p className="break-words">
          <MessageText text={message.text} />
        </p>
      </div>
      {message.delivery === "failed" && <p className="mt-1 text-sm font-bold text-error">{t.assistant.notDelivered}</p>}
      {voice && message.role === "assistant" && <Listen text={message.text} locale={voice.locale} />}
      {message.role === "assistant" && <WhatHappened message={message} />}
    </li>
  );
}

// La conversación, con el último mensaje a la vista.
// voice: si el servidor tiene voz, cada respuesta del asistente se puede escuchar.
export function Thread({
  messages,
  storeSide,
  pending,
  voice = null,
}: {
  messages: ConversationMessage[];
  storeSide: boolean;
  pending?: string;
  voice?: Voice;
}) {
  const t = useT();
  const end = useRef<HTMLLIElement>(null);
  // Baja solo la caja del chat (la que tiene data-chat-scroll), no toda la página.
  useEffect(() => {
    const box = end.current?.closest("[data-chat-scroll]");
    if (box) box.scrollTop = box.scrollHeight;
  }, [messages.length, pending]);
  return (
    <ol aria-live="polite" className="flex flex-col gap-3">
      {messages.map((message) => (
        <Bubble key={message._id} message={message} storeSide={storeSide} voice={voice} />
      ))}
      {pending && (
        <>
          <li className={`flex flex-col ${storeSide ? "items-start" : "items-end"}`}>
            <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-action px-3.5 py-2 break-words text-white opacity-70 sm:max-w-[75%]">
              {pending}
            </p>
          </li>
          <li role="status" className="text-sm text-ink-muted">
            {t.assistant.typing}
          </li>
        </>
      )}
      <li ref={end} aria-hidden />
    </ol>
  );
}
