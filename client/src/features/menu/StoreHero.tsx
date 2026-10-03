import { AtSign, Bike, MapPin, Share2, ShoppingBag } from "lucide-react";
import { type ReactNode, useState } from "react";
import type { PublicStore } from "../../api/types";
import { LanguageSwitch } from "../../components/LanguageSwitch";
import { RatingSummary } from "../../components/Stars";
import { StoreMark } from "../../components/StoreMark";
import { useT } from "../../i18n";
import { formatMoney } from "../../lib/format";
import { cloudinaryFit } from "../../lib/images";
import { statusView } from "../panel/storeStatus";

// El cartel de la puerta, el mismo que el dueño cambia desde su panel.
export function DoorSign({ opening }: { opening: PublicStore["opening"] }) {
  const view = statusView(opening);
  return (
    <p className={`inline-flex h-8 items-center gap-2 rounded-lg px-2.5 text-sm text-white ring-1 ring-white/20 ring-inset ${view.tone}`}>
      <span aria-hidden className="size-2 rounded-full bg-white shadow-[0_0_0_3px_rgba(255,255,255,0.25)]" />
      <span className="font-bold">{view.label}</span>
      {view.detail && <span className="text-white/90">{view.detail}</span>}
    </p>
  );
}

// Compartir el link del menú: el menú de compartir del celular o, si no hay, copiarlo.
function ShareButton({ name }: { name: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}`;
    if (navigator.share) {
      await navigator.share({ title: name, url }).catch(() => {});
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Sin permiso para copiar: el link está en la barra del navegador.
    }
  };
  return (
    <div className="flex items-center gap-2 sm:flex-row-reverse">
      <button
        type="button"
        onClick={share}
        aria-label={t.menu.share}
        title={t.menu.share}
        className="grid size-11 place-items-center rounded-full bg-surface text-ink shadow-[0_1px_6px_rgba(0,0,0,0.14)] hover:shadow-md"
      >
        <Share2 aria-hidden className="size-5" />
      </button>
      <span aria-live="polite" className="text-sm text-ink-muted">
        {copied && t.menu.linkCopied}
      </span>
    </div>
  );
}

// La cabecera del perfil: portada, logo redondo encima, nombre, dirección y estado.
export function StoreHero({ store, onMore, onReviews }: { store: PublicStore; onMore: () => void; onReviews: () => void }) {
  const t = useT();
  return (
    <header className="sm:pt-4">
      <div className="relative">
        <div className="relative h-40 overflow-hidden bg-(--brand) sm:h-64 sm:rounded-2xl">
          {store.coverUrl ? (
            <img src={cloudinaryFit(store.coverUrl, 1400)} alt="" className="size-full object-cover" />
          ) : (
            // Sin foto de portada: el nombre del local en grande, como un cartel.
            <p aria-hidden className="grid size-full place-items-center px-6 pb-10 text-center text-3xl leading-none font-bold tracking-tight text-balance text-(--on-brand) sm:pb-12 sm:text-6xl">
              {store.name}
            </p>
          )}
        </div>
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 rounded-full bg-surface p-1 shadow-sm">
          <StoreMark store={store} size={88} round />
        </div>
      </div>

      {/* A la altura del logo: compartir (a la izquierda en el celular, a la derecha en la PC) y,
          en el celular, el idioma (en la PC está en la barra de arriba). */}
      <div className="flex items-center justify-between px-4 pt-12 pb-2 sm:h-14 sm:justify-end sm:px-0 sm:pt-2 sm:pb-0">
        <ShareButton name={store.name} />
        <div className="sm:hidden">
          <LanguageSwitch compact />
        </div>
      </div>

      <div className="px-4 sm:px-0">
        <h1 className="text-xl leading-tight font-bold sm:inline">{store.name}</h1>
        {store.address && (
          <>
            <span aria-hidden className="mx-2 hidden text-ink-muted sm:inline">
              •
            </span>
            <p className="text-sm text-ink-muted sm:inline">{store.address}</p>
          </>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <DoorSign opening={store.opening} />
          {store.fulfillment.delivery && (
            <span className="text-sm text-ink-muted">{t.menu.deliveryTime(store.estimates.deliveryMin, store.estimates.deliveryMax)}</span>
          )}
          {store.rating.count > 0 && (
            <button type="button" onClick={onReviews} className="inline-flex h-10 items-center rounded-lg hover:underline">
              <RatingSummary rating={store.rating} />
            </button>
          )}
        </div>
        <button type="button" onClick={onMore} className="h-10 font-bold hover:underline">
          {t.menu.seeMore}
        </button>

        {store.notice && <p className="mt-2 rounded-xl bg-surface px-4 py-3 ring-1 ring-line">{store.notice}</p>}
        {!store.isOpen && (
          <p role="status" className="mt-2 rounded-xl bg-surface px-4 py-3 ring-1 ring-line">
            {store.opening.status === "paused" ? store.opening.message || t.menu.pausedNotice : t.menu.closedNotice}
          </p>
        )}
      </div>
    </header>
  );
}

// La tasa de entrega más baja (por barrio o fija), o null si es gratis.
function lowestFee(store: PublicStore): { cents: number; varies: boolean } | null {
  const fees = store.deliveryMode === "zones" ? store.deliveryZones.map((zone) => zone.feeCents) : [store.deliveryFeeCents];
  if (!fees.length) return null;
  const cents = Math.min(...fees);
  return cents > 0 ? { cents, varies: new Set(fees).size > 1 } : null;
}

const Fact = ({ icon, children, notes = [] }: { icon: ReactNode; children: ReactNode; notes?: string[] }) => (
  <li className="flex items-start gap-2.5">
    <span aria-hidden className="mt-0.5 text-ink-muted">
      {icon}
    </span>
    <span>
      {children}
      {notes.map((note) => (
        <span key={note} className="block text-sm text-ink-muted">
          {note}
        </span>
      ))}
    </span>
  </li>
);

const WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

// "Ver mais": descripción, cómo entrega, horarios de la semana y dirección.
export function StoreInfo({ store }: { store: PublicStore }) {
  const t = useT();
  const fee = lowestFee(store);
  const { estimates } = store;
  return (
    <div className="space-y-6 p-4">
      <section className="space-y-3">
        <DoorSign opening={store.opening} />
        {store.description && <p className="text-ink-muted">{store.description}</p>}
        <ul className="space-y-2 text-[15px]">
          {store.fulfillment.delivery && (
            <Fact
              icon={<Bike className="size-4" />}
              notes={[
                ...(store.freeDeliveryFromCents != null ? [t.menu.freeDeliveryFrom(formatMoney(store.freeDeliveryFromCents))] : []),
                ...(store.minOrderCents > 0 ? [t.menu.minOrder(formatMoney(store.minOrderCents))] : []),
              ]}
            >
              {t.menu.deliveryTime(estimates.deliveryMin, estimates.deliveryMax)}
              {fee && `, ${fee.varies ? t.menu.deliveryFeeFrom(formatMoney(fee.cents)) : t.menu.deliveryFee(formatMoney(fee.cents))}`}
            </Fact>
          )}
          {store.fulfillment.pickup && (
            <Fact icon={<ShoppingBag className="size-4" />}>{t.menu.pickupTime(estimates.pickupMin, estimates.pickupMax)}</Fact>
          )}
          {store.address && <Fact icon={<MapPin className="size-4" />}>{store.address}</Fact>}
          {store.instagram && (
            <Fact icon={<AtSign className="size-4" />}>
              <a
                href={`https://instagram.com/${store.instagram.replace(/^@/, "")}`}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4"
              >
                {store.instagram.startsWith("@") ? store.instagram : `@${store.instagram}`}
              </a>
            </Fact>
          )}
        </ul>
      </section>

      <section>
        <h3 className="mb-2 font-bold">{t.menu.hours}</h3>
        <dl className="divide-y divide-line">
          {WEEK.map((day) => {
            const intervals = store.hours.weekly[day];
            return (
              <div key={day} className="flex justify-between gap-4 py-2">
                <dt>{t.menu.weekdays[day]}</dt>
                <dd className="text-right tabular-nums">
                  {intervals.length ? intervals.map((i) => `${i.open} – ${i.close}`).join(", ") : t.menu.closedDay}
                </dd>
              </div>
            );
          })}
        </dl>
        {store.hours.upcomingExceptions.map((exception) => (
          <p key={exception.date} className="mt-2 text-sm text-ink-muted">
            {exception.date.split("-").reverse().join("/")}:{" "}
            {exception.closed ? t.menu.closedDay : exception.intervals.map((i) => `${i.open} – ${i.close}`).join(", ")}
            {exception.note && ` (${exception.note})`}
          </p>
        ))}
      </section>

      {store.about && <p className="whitespace-pre-line text-ink-muted">{store.about}</p>}
    </div>
  );
}
