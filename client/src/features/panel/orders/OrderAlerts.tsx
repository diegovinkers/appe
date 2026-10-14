import { BellRing, WifiOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { button } from "../../../components/ui";
import { useT } from "../../../i18n";
import { operatingDayISO } from "../../../lib/format";
import { getDeviceSettings, useDeviceSettings } from "./deviceSettings";
import { playAlert, unlockSound } from "./alertSound";
import { useOrders } from "./useOrders";

// Mientras haya pedidos sin aceptar, el aviso vuelve a sonar cada tanto.
const REPEAT_MS = 15_000;

// Aviso de pedidos nuevos para todo el panel. Suena (y vibra) al llegar uno y repite hasta
// que alguien lo acepte; el número queda en la pestaña y la pantalla no se apaga. Solo ocupa
// lugar cuando hay algo que hacer: pedidos esperando, el sonido trabado o sin conexión.
export function OrderAlerts() {
  const t = useT();
  const settings = useDeviceSettings();
  const day = operatingDayISO();
  const query = useOrders(day, true);
  const [blocked, setBlocked] = useState(false);
  const seen = useRef<{ day: string; ids: Set<string> } | null>(null);
  const pending = query.data?.orders.filter((order) => order.status === "new").length ?? 0;

  async function ring() {
    if (!getDeviceSettings().sound) return;
    setBlocked(!(await playAlert()));
  }

  // El primer toque en la página destraba el sonido.
  useEffect(() => {
    const unlock = () => void unlockSound().then((ok) => ok && setBlocked(false));
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, []);

  // Pedido nuevo: suena y vibra enseguida. La primera respuesta (y la de un día nuevo) es la
  // base: no suena por los que ya estaban, salvo que haya alguno esperando.
  useEffect(() => {
    if (!query.data) return;
    const orders = query.data.orders;
    if (!seen.current || seen.current.day !== day) {
      seen.current = { day, ids: new Set(orders.map((order) => order._id)) };
      if (orders.some((order) => order.status === "new")) void ring();
      return;
    }
    const arrived = orders.some((order) => order.status === "new" && !seen.current!.ids.has(order._id));
    orders.forEach((order) => seen.current!.ids.add(order._id));
    if (arrived) {
      void ring();
      navigator.vibrate?.([200, 100, 200]);
    }
  }, [query.data, day]);

  // Repite mientras haya pedidos esperando.
  useEffect(() => {
    if (!pending || !settings.sound) return;
    const id = setInterval(() => void ring(), REPEAT_MS);
    return () => clearInterval(id);
  }, [pending, settings.sound]);

  // "(2) Pedido novo" en la pestaña.
  useEffect(() => {
    if (!pending) return;
    const base = document.title;
    document.title = t.alerts.tabTitle(pending);
    return () => {
      document.title = base;
    };
  }, [pending, t]);

  // La pantalla no se apaga con el panel abierto (si el aparato lo permite).
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const request = async () => {
      if (document.visibilityState !== "visible" || !("wakeLock" in navigator)) return;
      try {
        lock = await navigator.wakeLock.request("screen");
      } catch {
        // Batería baja o sin permiso: sigue sin mantenerla prendida.
      }
    };
    void request();
    document.addEventListener("visibilitychange", request);
    return () => {
      document.removeEventListener("visibilitychange", request);
      void lock?.release();
    };
  }, []);

  const offline = query.isError || query.fetchStatus === "paused";
  const full = (query.data?.orders.length ?? 0) >= 500;
  if (!pending && !offline && !full) return null;

  return (
    <div aria-label={t.alerts.label} className="sticky top-18 z-20 mb-5 space-y-2 print:hidden">
      {pending > 0 && (
        <div role="status" className="flex min-h-12 items-center gap-3 rounded-xl bg-[#fff4d6] px-4 py-1.5 text-[#7a4e00] shadow-sm ring-1 ring-[#f0d48a]">
          <BellRing aria-hidden className="size-5 shrink-0" />
          <p className="min-w-0 flex-1 leading-tight">
            <strong>{t.alerts.pending(pending)}</strong>
            {blocked && settings.sound && <span className="block text-sm">{t.alerts.tapToEnable}</span>}
          </p>
          <Link to="/painel/pedidos?filtro=new" className="inline-flex h-11 shrink-0 items-center rounded-lg bg-[#7a4e00] px-4 font-bold text-white">
            {t.alerts.view}
          </Link>
        </div>
      )}
      {offline && (
        <div role="alert" className="flex min-h-12 items-center gap-3 rounded-xl bg-error-soft px-4 py-1.5 text-error ring-1 ring-error/30">
          <WifiOff aria-hidden className="size-5 shrink-0" />
          <p className="min-w-0 flex-1 font-bold leading-tight">{t.alerts.offline}</p>
          <button type="button" className={button.secondary} onClick={() => void query.refetch()}>
            {t.alerts.retry}
          </button>
        </div>
      )}
      {full && <p className="text-sm text-warning">{t.alerts.limit}</p>}
    </div>
  );
}
