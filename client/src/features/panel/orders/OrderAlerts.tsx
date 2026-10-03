import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { button } from "../../../components/ui";
import { useLanguage } from "../../../i18n";
import { todayISO } from "../../../lib/format";
import { useOrders } from "./useOrders";

const copy = {
  "pt-BR": { on: "Ativar som", off: "Desativar som", test: "Testar som", hint: "Os avisos funcionam enquanto este painel está aberto. Mantenha esta aba visível.", error: "Não foi possível reproduzir o som. Ative novamente ou confira o volume.", offline: "Sem atualização dos pedidos. Confira a conexão e tente novamente.", retry: "Atualizar", pending: "pedido(s) aguardando aceitação", received: "Novo pedido recebido", limit: "A lista mostra até 500 pedidos do dia." },
  es: { on: "Activar sonido", off: "Desactivar sonido", test: "Probar sonido", hint: "Los avisos funcionan mientras este panel está abierto. Mantené esta pestaña visible.", error: "No se pudo reproducir el sonido. Activá de nuevo o revisá el volumen.", offline: "Los pedidos no se están actualizando. Revisá la conexión y reintentá.", retry: "Actualizar", pending: "pedido(s) esperando aceptación", received: "Nuevo pedido recibido", limit: "La lista muestra hasta 500 pedidos del día." },
};

export function OrderAlerts() {
  const c = copy[useLanguage()];
  const day = todayISO(); const query = useOrders(day, true);
  const [sound, setSound] = useState(false); const [failed, setFailed] = useState(false); const [fresh, setFresh] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const seen = useRef<{ day: string; ids: Set<string> } | null>(null);
  async function play() {
    try {
      const context = audio.current ?? (audio.current = new AudioContext());
      await context.resume();
      if (context.state !== "running") throw new Error("Audio unavailable");
      for (const delay of [0, 0.25]) {
        const oscillator = context.createOscillator(); const gain = context.createGain();
        oscillator.frequency.value = 740; oscillator.connect(gain); gain.connect(context.destination);
        const start = context.currentTime + delay; gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(0.12, start + 0.02); gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
        oscillator.start(start); oscillator.stop(start + 0.2);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      }
      setFailed(false); return true;
    } catch { setFailed(true); setSound(false); return false; }
  }
  useEffect(() => () => { void audio.current?.close(); }, []);
  useEffect(() => {
    if (!query.data) return;
    const orders = query.data.orders;
    // First response and first response of a new day establish a silent baseline.
    if (!seen.current || seen.current.day !== day) { seen.current = { day, ids: new Set(orders.map((order) => order._id)) }; return; }
    const arrived = orders.some((order) => order.status === "new" && !seen.current!.ids.has(order._id));
    orders.forEach((order) => seen.current!.ids.add(order._id));
    if (arrived) { setFresh(true); if (sound) void play(); }
  }, [query.data, day, sound]);
  const pending = query.data?.orders.filter((order) => order.status === "new").length ?? 0;
  return <section aria-label={c.received} className="mb-5 space-y-2 rounded-xl border border-line bg-surface p-3">
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={button.secondary} aria-pressed={sound} onClick={async () => { if (sound) setSound(false); else if (await play()) setSound(true); }}>{sound ? c.off : c.on}</button>
      <button type="button" className={button.quiet} onClick={() => void play()}>{c.test}</button>
      {pending > 0 && <Link to="/painel/pedidos?filtro=new" className="rounded-lg bg-paper px-3 py-2 font-bold text-warning" onClick={() => setFresh(false)}>{pending} {c.pending}</Link>}
    </div>
    <p className="text-xs text-ink-muted">{c.hint}</p>
    {fresh && <p role="status" className="font-bold text-success">{c.received}</p>}
    {failed && <p role="alert" className="text-error">{c.error}</p>}
    {(query.isError || query.fetchStatus === "paused") && <div role="alert" className="text-error">{c.offline} <button type="button" className={button.secondary} onClick={() => void query.refetch()}>{c.retry}</button></div>}
    {query.data && query.data.orders.length >= 500 && <p className="text-warning">{c.limit}</p>}
  </section>;
}
