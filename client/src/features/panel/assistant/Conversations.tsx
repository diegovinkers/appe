import { ArrowLeft, MoreHorizontal, SendHorizontal } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link } from "react-router";
import type { Conversation } from "../../../api/types";
import { can } from "../../../auth/permissions";
import { Spinner } from "../../../components/FullScreenMessage";
import { button, textarea } from "../../../components/ui";
import { errorText, useT } from "../../../i18n";
import { formatWhen } from "../../../lib/format";
import { formatPhone } from "../../../lib/phone";
import { usePanel } from "../PanelLayout";
import {
  type ChannelFilter,
  formatUsd,
  needsPerson,
  useConversation,
  useConversationAction,
  useConversationAutomationBlock,
  useConversations,
  useStaffMessage,
} from "./assistant";
import { Thread } from "./Thread";

const FILTERS: ChannelFilter[] = ["all", "whatsapp", "simulator"];

function StatusLabel({ conversation }: { conversation: Conversation }) {
  const c = useT().assistant.conversations;
  if (conversation.automationBlocked) return <span className="rounded-full bg-error-soft px-2 py-0.5 text-xs font-bold text-error">{c.numberBlocked}</span>;
  if (needsPerson(conversation))
    return <span className="rounded-full bg-error-soft px-2 py-0.5 text-xs font-bold text-error">{c.needsPerson}</span>;
  const label = conversation.status === "bot" ? c.withAssistant : conversation.status === "human" ? c.withPerson : c.closed;
  return <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-bold text-ink-muted">{label}</span>;
}

// Botón de ícono de la cabecera: chico en una conversación angosta, del tamaño de siempre en una ancha.
const headerIcon = "grid size-8 shrink-0 place-items-center rounded-lg text-ink-muted hover:bg-paper hover:text-ink @md:size-11";

const who = (conversation: Conversation) => conversation.customer.name || formatPhone(conversation.customer.phone);

function Detail({ id, onBack, canListen, compact, orderHref }: { id: string; onBack: () => void; canListen: boolean; compact: boolean; orderHref: (orderId: string) => string }) {
  const t = useT();
  const c = t.assistant.conversations;
  const { user } = usePanel();
  const query = useConversation(id);
  const action = useConversationAction();
  const automationBlock = useConversationAutomationBlock();
  const reply = useStaffMessage();
  const [text, setText] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const canAnswer = can(user.role, "orders:write");

  if (query.isPending) return <Spinner />;
  if (query.isError) return <p className="text-error">{errorText(query.error, t)}</p>;
  const { conversation, messages } = query.data;

  const info = (
    <>
      {c.channels[conversation.channel]}
      {conversation.customer.name && ` · ${formatPhone(conversation.customer.phone)}`} · {formatUsd(conversation.usage.costMicros)}
    </>
  );
  const actions = (
    <>
      {conversation.channel === "whatsapp" && canAnswer && (
        <button
          type="button"
          className={button.secondary}
          disabled={automationBlock.isPending}
          onClick={() => {
            const blocked = !conversation.automationBlocked;
            if (blocked && !window.confirm(c.blockConfirm)) return;
            automationBlock.mutate({ id, blocked });
          }}
        >
          {conversation.automationBlocked ? c.unblockNumber : c.blockNumber}
        </button>
      )}
      {canAnswer &&
        (conversation.status === "bot" ? (
          <button type="button" className={button.secondary} disabled={action.isPending} onClick={() => action.mutate({ id, action: "takeover" })}>
            {t.assistant.takeover}
          </button>
        ) : !conversation.automationBlocked ? (
          <button type="button" className={button.secondary} disabled={action.isPending} onClick={() => action.mutate({ id, action: "release" })}>
            {t.assistant.release}
          </button>
        ) : null)}
    </>
  );
  const handoffText = conversation.status === "human" && conversation.handoff ? t.assistant.handedOff(conversation.handoff.reason) : null;
  const orderLinks = conversation.orders.length > 0 && (
    <p className="flex flex-wrap gap-3 text-sm">
      {conversation.orders.map((orderId, index) => (
        <Link key={orderId} to={orderHref(orderId)} className="font-bold underline underline-offset-4">
          {c.order(index + 1)}
        </Link>
      ))}
    </p>
  );

  function send(event: FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    reply.mutate({ id, text: text.trim() }, { onSuccess: () => setText("") });
  }

  return (
    // `@container`: la conversación se acomoda a su propio ancho (en Pedidos puede ser una columna
    // angosta). Angosta: una línea con el nombre y "⋯"; lo demás se despliega debajo.
    // En Pedidos (compact) llena la columna: la cabecera y la respuesta quedan fijas y solo se
    // mueven los mensajes.
    <section
      aria-label={who(conversation)}
      className={`@container flex flex-col overflow-hidden rounded-xl border border-line bg-paper ${compact ? "min-h-0 flex-1" : "min-h-[28rem]"}`}
    >
      <header className="flex items-center gap-1 border-b border-line bg-surface px-1 py-0.5 @md:flex-wrap @md:gap-x-3 @md:gap-y-2 @md:px-3 @md:py-2">
        <button type="button" onClick={onBack} className={`${headerIcon} ${compact ? "" : "lg:hidden"}`} aria-label={c.back}>
          <ArrowLeft aria-hidden className="size-5" />
        </button>
        <div className="min-w-0 flex-1 @md:min-w-48">
          <p className="truncate text-sm font-bold @md:text-base">{who(conversation)}</p>
          <p className="hidden text-sm text-ink-muted @md:block">{info}</p>
        </div>
        <div className="hidden @md:contents">
          <StatusLabel conversation={conversation} />
          {actions}
        </div>
        <button
          type="button"
          aria-expanded={moreOpen}
          aria-controls="conversa-opcoes"
          aria-label={c.moreOptions}
          title={c.moreOptions}
          onClick={() => setMoreOpen((open) => !open)}
          className={`${headerIcon} @md:hidden ${moreOpen ? "bg-paper text-ink" : ""}`}
        >
          <MoreHorizontal aria-hidden className="size-5" />
        </button>
      </header>
      {moreOpen && (
        <div id="conversa-opcoes" className="space-y-2 border-b border-line bg-surface px-3 py-3 @md:hidden">
          <p className="text-sm text-ink-muted">{info}</p>
          <StatusLabel conversation={conversation} />
          {handoffText && <p className="text-sm">{handoffText}</p>}
          <div className="flex flex-col gap-2 *:h-auto *:min-h-11 *:w-full *:py-2">{actions}</div>
          {orderLinks}
        </div>
      )}
      {/* Angosta: el motivo va en "⋯", para que la conversación tenga todo el lugar. */}
      {handoffText && <p className="hidden border-b border-line bg-surface px-4 py-2 text-sm @md:block">{handoffText}</p>}
      {orderLinks && <div className="hidden border-b border-line bg-surface px-4 py-2 @md:block">{orderLinks}</div>}

      <div data-chat-scroll className={`flex-1 overflow-y-auto p-2 @md:p-4 ${compact ? "min-h-0" : "max-h-[60dvh]"}`}>
        <Thread messages={messages} storeSide voice={canListen ? { locale: conversation.locale } : null} />
      </div>

      {canAnswer && (
        <form onSubmit={send} className="border-t border-line bg-surface p-1.5 @md:p-3">
          <label htmlFor="resposta-loja" className="sr-only mb-1 block text-sm font-bold @md:not-sr-only">
            {c.reply}
          </label>
          {conversation.channel === "simulator" && <p className="mb-1 text-sm text-ink-muted">{c.simulatorReply}</p>}
          <div className="flex items-end gap-2">
            <textarea
              id="resposta-loja"
              rows={2}
              maxLength={1000}
              className={`${textarea} h-10 min-h-10 resize-none py-2 @md:h-auto @md:min-h-11`}
              placeholder={c.replyPlaceholder}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            <button
              type="submit"
              className="inline-flex size-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-action font-bold text-white hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-50 @md:h-11 @md:w-auto @md:px-4"
              disabled={!text.trim() || reply.isPending}
              aria-label={c.replySend}
              title={c.replySend}
            >
              <SendHorizontal aria-hidden className="size-5 @md:hidden" />
              <span className="hidden @md:inline">{c.replySend}</span>
            </button>
          </div>
          {reply.isError && (
            <p role="alert" className="mt-1 font-bold text-error">
              {errorText(reply.error, t)}
            </p>
          )}
        </form>
      )}
    </section>
  );
}

// Lista de conversaciones y, al elegir una, sus mensajes. En el celular, una cosa a la vez.
// `compact`: en una columna angosta (el espacio de trabajo de Pedidos), la lista o la conversación.
export function Conversations({
  selected,
  onSelect,
  canListen = false,
  compact = false,
  orderHref = (orderId) => `/painel/pedidos?pedido=${orderId}`,
}: {
  selected: string | null;
  onSelect: (id: string | null) => void;
  canListen?: boolean;
  compact?: boolean;
  orderHref?: (orderId: string) => string;
}) {
  const t = useT();
  const c = t.assistant.conversations;
  const [filter, setFilter] = useState<ChannelFilter>("all");
  const query = useConversations(filter);
  // Primero las que esperan a una persona; después, las más recientes.
  const conversations = [...(query.data?.conversations ?? [])].sort((a, b) => Number(needsPerson(b)) - Number(needsPerson(a)));

  return (
    <div className={compact ? (selected ? "flex min-h-0 flex-1 flex-col" : "") : "grid gap-5 lg:grid-cols-[20rem_1fr]"}>
      <div className={selected ? (compact ? "hidden" : "hidden lg:block") : ""}>
        {/* En Pedidos (compact) van todas las conversaciones juntas, sin filtros. */}
        {!compact && (
          <div role="group" aria-label={c.label} className="mb-3 flex flex-wrap gap-2">
            {FILTERS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={filter === option}
                onClick={() => setFilter(option)}
                className="h-10 rounded-full border border-line px-4 text-sm font-bold aria-pressed:border-action aria-pressed:bg-action aria-pressed:text-white"
              >
                {c.filters[option]}
              </button>
            ))}
          </div>
        )}
        {query.isPending && <Spinner />}
        {query.isError && <p className="text-error">{errorText(query.error, t)}</p>}
        {query.data && conversations.length === 0 && (
          <p className="rounded-xl border border-dashed border-line bg-surface p-6 text-ink-muted">{c.empty}</p>
        )}
        {conversations.length > 0 && (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {conversations.map((conversation) => (
              <li key={conversation._id}>
                <button
                  type="button"
                  aria-current={selected === conversation._id}
                  onClick={() => onSelect(conversation._id)}
                  className="block w-full px-4 py-3 text-left hover:bg-paper aria-[current=true]:bg-paper"
                >
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-bold">{who(conversation)}</span>
                    <span className="shrink-0 text-xs text-ink-muted">{formatWhen(conversation.lastMessageAt)}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-ink-muted">{conversation.preview}</span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                    <StatusLabel conversation={conversation} />
                    {c.channels[conversation.channel]}
                    {conversation.orders.length > 0 && <span>· {c.orders(conversation.orders.length)}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={selected ? (compact ? "flex min-h-0 flex-1 flex-col" : "") : compact ? "hidden" : "hidden lg:block"}>
        {selected ? (
          <Detail key={selected} id={selected} onBack={() => onSelect(null)} canListen={canListen} compact={compact} orderHref={orderHref} />
        ) : (
          <p className="rounded-xl border border-dashed border-line bg-surface p-6 text-ink-muted">{c.pick}</p>
        )}
      </div>
    </div>
  );
}
