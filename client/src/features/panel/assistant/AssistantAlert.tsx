import { MessageCircleWarning } from "lucide-react";
import { Link, useLocation } from "react-router";
import { useT } from "../../../i18n";
import { needsPerson, useConversations } from "./assistant";

// Aviso en todo el panel: conversaciones de WhatsApp que el asistente pasó a una persona
// y todavía nadie del local contestó.
export function AssistantAlert() {
  const t = useT();
  const { pathname } = useLocation();
  const query = useConversations("whatsapp", { status: "human" });
  const waiting = (query.data?.conversations ?? []).filter(needsPerson);
  // En la página del asistente ya se ven arriba de la lista.
  if (!waiting.length || pathname.startsWith("/painel/assistente")) return null;
  return (
    <p role="status" className="mb-5 flex flex-wrap items-center gap-3 rounded-xl bg-error-soft px-4 py-3 font-bold text-error">
      <MessageCircleWarning aria-hidden className="size-5 shrink-0" />
      <span className="min-w-0 flex-1">{t.assistant.alert(waiting.length)}</span>
      <Link to={`/painel/assistente?conversa=${waiting[0]._id}`} className="underline underline-offset-4">
        {t.assistant.alertOpen}
      </Link>
    </p>
  );
}
