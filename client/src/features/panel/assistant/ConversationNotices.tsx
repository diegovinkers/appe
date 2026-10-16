import { BellRing, Bot, MessageCircleWarning, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import type { Conversation } from "../../../api/types";
import { useT } from "../../../i18n";
import { formatPhone } from "../../../lib/phone";
import { playAlert, playChime } from "../orders/alertSound";
import { getDeviceSettings } from "../orders/deviceSettings";
import { useConversations } from "./assistant";

type Kind = "message" | "unattended" | "handoff";
type Notice = { key: string; kind: Kind; conversationId: string; name: string };

const SHOW_MS = 12_000;
const MAX_NOTICES = 4;
const ICON = { message: Bot, unattended: MessageCircleWarning, handoff: UserRound } as const;
const TONE = {
  message: "border-line",
  unattended: "border-error/40 ring-1 ring-error/20",
  handoff: "border-error/40 ring-1 ring-error/20",
} as const;

type Snapshot = { lastCustomerMessageAt: string | null; status: Conversation["status"]; handoffAt: string | null };

// Qué pasó en una conversación de WhatsApp desde la vez anterior: el asistente la pasó a una
// persona, o el cliente escribió (al asistente, o a un chat que nadie automatiza).
export function noticeFor(conversation: Conversation, before: Snapshot | undefined): Kind | null {
  const handoffAt = conversation.handoff?.at ?? null;
  if (before?.status === "bot" && conversation.status === "human" && handoffAt && handoffAt !== before.handoffAt && conversation.lastRole !== "staff") {
    return "handoff";
  }
  const last = conversation.lastCustomerMessageAt;
  if (!last || last === before?.lastCustomerMessageAt || conversation.lastRole !== "customer") return null;
  return conversation.status === "bot" && !conversation.automationBlocked ? "message" : "unattended";
}

// Avisos de WhatsApp en todo el panel, abajo a la derecha: suenan (si el aparato tiene el
// sonido prendido) y se van solos. La primera lectura es la base: no avisa lo que ya estaba.
export function ConversationNotices() {
  const t = useT();
  const n = t.assistant.notices;
  const { pathname, search } = useLocation();
  const query = useConversations("whatsapp");
  const seen = useRef<Map<string, Snapshot> | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const openId = new URLSearchParams(search).get("conversa");

  useEffect(() => {
    const list = query.data?.conversations;
    if (!list) return;
    const before = seen.current;
    const next = new Map<string, Snapshot>();
    const fresh: Notice[] = [];
    for (const conversation of list) {
      next.set(conversation._id, {
        lastCustomerMessageAt: conversation.lastCustomerMessageAt,
        status: conversation.status,
        handoffAt: conversation.handoff?.at ?? null,
      });
      if (!before) continue;
      const kind = noticeFor(conversation, before.get(conversation._id));
      // Un mensaje al asistente en el chat que ya está abierto no hace falta avisarlo.
      if (!kind || (kind === "message" && conversation._id === openId)) continue;
      const name = conversation.customer.name || formatPhone(conversation.customer.phone);
      fresh.push({ key: `${conversation._id}-${kind}-${Date.now()}`, kind, conversationId: conversation._id, name });
    }
    seen.current = next;
    if (!fresh.length) return;
    setNotices((current) => [...fresh, ...current].slice(0, MAX_NOTICES));
    if (getDeviceSettings().sound) void (fresh.some((notice) => notice.kind !== "message") ? playAlert() : playChime());
  }, [query.data, openId]);

  // Cada aviso se va solo después de un rato.
  useEffect(() => {
    if (!notices.length) return;
    const timer = setTimeout(() => setNotices((current) => current.slice(0, -1)), SHOW_MS);
    return () => clearTimeout(timer);
  }, [notices]);

  if (!notices.length) return null;
  const href = (id: string) => (pathname.startsWith("/painel/pedidos") ? `/painel/pedidos?conversa=${id}` : `/painel/assistente?conversa=${id}`);
  const dismiss = (key: string) => setNotices((current) => current.filter((notice) => notice.key !== key));

  return (
    <div aria-live="polite" className="fixed right-4 bottom-20 z-50 w-80 max-w-[calc(100vw-2rem)] space-y-2 lg:bottom-4">
      {notices.map((notice) => {
        const Icon = ICON[notice.kind];
        return (
          <div key={notice.key} role="status" className={`flex items-start gap-3 rounded-xl border bg-surface p-3 shadow-lg ${TONE[notice.kind]}`}>
            <Icon aria-hidden className={`mt-0.5 size-5 shrink-0 ${notice.kind === "message" ? "text-ink-muted" : "text-error"}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{n[notice.kind](notice.name)}</p>
              <Link to={href(notice.conversationId)} onClick={() => dismiss(notice.key)} className="mt-1 inline-flex items-center gap-1 text-sm font-bold underline underline-offset-4">
                <BellRing aria-hidden className="size-4" />
                {n.open}
              </Link>
            </div>
            <button type="button" onClick={() => dismiss(notice.key)} aria-label={n.close} className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-muted hover:bg-paper hover:text-ink">
              <X aria-hidden className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
