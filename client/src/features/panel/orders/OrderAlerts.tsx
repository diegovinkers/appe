import { BellRing, VolumeX, WifiOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useT } from "../../../i18n";
import { operatingDayISO } from "../../../lib/format";
import { getDeviceSettings, useDeviceSettings } from "./deviceSettings";
import { playAlert, unlockSound } from "./alertSound";
import { useOrders } from "./useOrders";

// Mientras haya pedidos sin aceptar, el aviso vuelve a sonar cada tanto.
const REPEAT_MS = 15_000;

// Aviso de pedidos nuevos para todo el panel. Suena (y vibra) al llegar uno y repite hasta
// que alguien lo acepte; el número queda en la pestaña y la pantalla no se apaga. Se ve como
// una pastilla chica en la barra de arriba (no le quita lugar a la página), solo cuando hay
// algo: pedidos esperando o sin conexión.
export function OrderAlerts({ dayStart }: { dayStart: string }) {
  const t = useT();
  const settings = useDeviceSettings();
  const day = operatingDayISO(new Date(), dayStart);
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

  const muted = blocked && settings.sound;
  return (
    <div aria-label={t.alerts.label} className="flex shrink-0 items-center gap-2 print:hidden">
      {pending > 0 && (
        <Link
          to="/painel/pedidos?filtro=new"
          role="status"
          aria-label={`${t.alerts.pending(pending)}${muted ? `. ${t.alerts.tapToEnable}` : ""}`}
          title={muted ? t.alerts.tapToEnable : t.alerts.pending(pending)}
          // En el celular ya está el número en "Pedidos" de la barra de abajo: ahí no hace falta.
          className="relative hidden h-11 items-center gap-1.5 rounded-full bg-[#fff4d6] px-3 font-bold text-[#7a4e00] ring-1 ring-[#f0d48a] hover:bg-[#ffecb8] lg:inline-flex"
        >
          {/* El punto late mientras haya pedidos esperando (quieto si el aparato pide menos movimiento). */}
          <span aria-hidden className="absolute -top-0.5 -right-0.5 flex size-3">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#e0a21b] opacity-75" />
            <span className="relative inline-flex size-3 rounded-full bg-[#e0a21b]" />
          </span>
          <BellRing aria-hidden className="size-5 shrink-0" />
          {t.alerts.pendingShort(pending)}
          {muted && <VolumeX aria-hidden className="size-4 shrink-0" />}
        </Link>
      )}
      {offline && (
        <button
          type="button"
          role="alert"
          onClick={() => void query.refetch()}
          aria-label={`${t.alerts.offline} ${t.alerts.retry}`}
          title={t.alerts.offline}
          className="inline-flex h-11 items-center gap-1.5 rounded-full bg-error-soft px-3 font-bold text-error ring-1 ring-error/30"
        >
          <WifiOff aria-hidden className="size-5 shrink-0" />
          <span className="hidden sm:inline">{t.alerts.offlineShort}</span>
        </button>
      )}
      {full && !pending && !offline && <span className="sr-only">{t.alerts.limit}</span>}
    </div>
  );
}
