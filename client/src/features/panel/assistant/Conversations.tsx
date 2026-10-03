import { ArrowLeft } from "lucide-react";
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
  useConversations,
  useStaffMessage,
} from "./assistant";
import { Thread } from "./Thread";

const FILTERS: ChannelFilter[] = ["all", "whatsapp", "simulator"];

function StatusLabel({ conversation }: { conversation: Conversation }) {
  const c = useT().assistant.conversations;
  if (needsPerson(conversation))
    return <span className="rounded-full bg-error-soft px-2 py-0.5 text-xs font-bold text-error">{c.needsPerson}</span>;
  const label = conversation.status === "bot" ? c.withAssistant : conversation.status === "human" ? c.withPerson : c.closed;
  return <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-bold text-ink-muted">{label}</span>;
}

const who = (conversation: Conversation) => conversation.customer.name || formatPhone(conversation.customer.phone);

function Detail({ id, onBack, canListen }: { id: string; onBack: () => void; canListen: boolean }) {
  const t = useT();
  const c = t.assistant.conversations;
  const { user } = usePanel();
  const query = useConversation(id);
  const action = useConversationAction();
  const reply = useStaffMessage();
  const [text, setText] = useState("");
  const canAnswer = can(user.role, "orders:write");

  if (query.isPending) return <Spinner />;
  if (query.isError) return <p className="text-error">{errorText(query.error, t)}</p>;
  const { conversation, messages } = query.data;

  function send(event: FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    reply.mutate({ id, text: text.trim() }, { onSuccess: () => setText("") });
  }

  return (
    <section aria-label={who(conversation)} className="flex min-h-[28rem] flex-col overflow-hidden rounded-xl border border-line bg-paper">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-surface px-3 py-2">
        <button type="button" onClick={onBack} className={`${button.quiet} lg:hidden`} aria-label={c.back}>
          <ArrowLeft aria-hidden className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{who(conversation)}</p>
          <p className="text-sm text-ink-muted">
            {c.channels[conversation.channel]}
            {conversation.customer.name && ` · ${formatPhone(conversation.customer.phone)}`} · {formatUsd(conversation.usage.costMicros)}
          </p>
        </div>
        <StatusLabel conversation={conversation} />
        {canAnswer &&
          (conversation.status === "bot" ? (
            <button
              type="button"
              className={button.secondary}
              disabled={action.isPending}
              onClick={() => action.mutate({ id, action: "takeover" })}
            >
              {t.assistant.takeover}
            </button>
          ) : (
            <button
              type="button"
              className={button.secondary}
              disabled={action.isPending}
              onClick={() => action.mutate({ id, action: "release" })}
            >
              {t.assistant.release}
            </button>
          ))}
      </header>
      {conversation.status === "human" && conversation.handoff && (
        <p className="border-b border-line bg-surface px-4 py-2 text-sm">{t.assistant.handedOff(conversation.handoff.reason)}</p>
      )}
      {conversation.orders.length > 0 && (
        <p className="flex flex-wrap gap-3 border-b border-line bg-surface px-4 py-2 text-sm">
          {conversation.orders.map((orderId, index) => (
            <Link key={orderId} to={`/painel/pedidos?pedido=${orderId}`} className="font-bold underline underline-offset-4">
              {c.order(index + 1)}
            </Link>
          ))}
        </p>
      )}

      <div data-chat-scroll className="max-h-[60dvh] flex-1 overflow-y-auto p-4">
        <Thread messages={messages} storeSide voice={canListen ? { locale: conversation.locale } : null} />
      </div>

      {canAnswer && (
        <form onSubmit={send} className="border-t border-line bg-surface p-3">
          <label htmlFor="resposta-loja" className="mb-1 block text-sm font-bold">
            {c.reply}
          </label>
          {conversation.channel === "simulator" && <p className="mb-1 text-sm text-ink-muted">{c.simulatorReply}</p>}
          <div className="flex items-end gap-2">
            <textarea
              id="resposta-loja"
              rows={2}
              maxLength={1000}
              className={`${textarea} min-h-11 resize-none`}
              placeholder={c.replyPlaceholder}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            <button type="submit" className={button.primary} disabled={!text.trim() || reply.isPending}>
              {c.replySend}
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
export function Conversations({
  selected,
  onSelect,
  canListen = false,
}: {
  selected: string | null;
  onSelect: (id: string | null) => void;
  canListen?: boolean;
}) {
  const t = useT();
  const c = t.assistant.conversations;
  const [filter, setFilter] = useState<ChannelFilter>("all");
  const query = useConversations(filter);
  // Primero las que esperan a una persona; después, las más recientes.
  const conversations = [...(query.data?.conversations ?? [])].sort((a, b) => Number(needsPerson(b)) - Number(needsPerson(a)));

  return (
    <div className="grid gap-5 lg:grid-cols-[20rem_1fr]">
      <div className={selected ? "hidden lg:block" : ""}>
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

      <div className={selected ? "" : "hidden lg:block"}>
        {selected ? (
          <Detail key={selected} id={selected} onBack={() => onSelect(null)} canListen={canListen} />
        ) : (
          <p className="rounded-xl border border-dashed border-line bg-surface p-6 text-ink-muted">{c.pick}</p>
        )}
      </div>
    </div>
  );
}
