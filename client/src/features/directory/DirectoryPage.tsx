import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { type CSSProperties, useState } from "react";
import { Link } from "react-router";
import { api } from "../../api/client";
import type { DirectoryStore, PublicStoresResponse } from "../../api/types";
import { Spinner } from "../../components/FullScreenMessage";
import { LanguageSwitch } from "../../components/LanguageSwitch";
import { RatingSummary } from "../../components/Stars";
import { StoreMark } from "../../components/StoreMark";
import { useLanguage, useT } from "../../i18n";
import { readableTextOn } from "../../lib/color";
import { cloudinaryFit } from "../../lib/images";
import { matchesSearch } from "../../lib/text";
import { SearchBox } from "../menu/MenuChrome";
import { DoorSign } from "../menu/StoreHero";

// La tarjeta de un local: la misma portada, logo y cartel que su perfil.
function StoreCard({ store }: { store: DirectoryStore }) {
  const t = useT();
  const brand = { "--brand": store.primaryColor, "--on-brand": readableTextOn(store.primaryColor) } as CSSProperties;
  return (
    <li>
      <Link
        to={`/${store.slug}?origem=directory`}
        style={brand}
        className="block h-full overflow-hidden rounded-2xl bg-surface shadow-[0_1px_6px_rgba(0,0,0,0.08)] hover:shadow-[0_2px_14px_rgba(0,0,0,0.14)]"
      >
        <div className="h-28 bg-(--brand)">
          {store.coverUrl ? (
            <img src={cloudinaryFit(store.coverUrl, 800)} alt="" loading="lazy" className="size-full object-cover" />
          ) : (
            <p aria-hidden className="grid size-full place-items-center px-4 pb-6 text-center text-2xl leading-none font-bold text-(--on-brand)">
              {store.name}
            </p>
          )}
        </div>
        <div className="px-4 pb-4">
          <div className="relative -mt-8 w-fit rounded-full bg-surface p-1">
            <StoreMark store={store} size={60} round />
          </div>
          <h2 className="mt-2 text-lg leading-tight font-bold">{store.name}</h2>
          {store.description && <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{store.description}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <DoorSign opening={store.opening} />
            {store.fulfillment.delivery && (
              <span className="text-sm text-ink-muted">{t.menu.deliveryTime(store.estimates.deliveryMin, store.estimates.deliveryMax)}</span>
            )}
            <RatingSummary rating={store.rating} compact />
          </div>
        </div>
      </Link>
    </li>
  );
}

// "/": todas las lojas, primero las abiertas. Tocando una se entra a su menú.
export function DirectoryPage() {
  const t = useT();
  const lang = useLanguage() === "es" ? "es" : "pt";
  const [search, setSearch] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [fulfillment, setFulfillment] = useState("all");
  const query = useQuery({
    queryKey: ["public-stores", lang],
    queryFn: () => api<PublicStoresResponse>(`/public/stores?lang=${lang}`),
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });
  const stores = (query.data?.stores ?? []).filter((store) => matchesSearch(`${store.name} ${store.description} ${store.address}`, search) && (!onlyOpen || store.opening.status === "open") && (fulfillment === "all" || (fulfillment === "delivery" ? store.fulfillment.delivery : store.fulfillment.pickup)));

  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-15 max-w-[70rem] items-center justify-end gap-2 px-4">
          <LanguageSwitch />
          <Link to="/conta" className="inline-flex h-11 items-center rounded-lg px-3 text-sm font-bold hover:bg-paper">
            {t.account.title}
          </Link>
          {/* Para los dueños: si ya tienen sesión, /entrar los lleva a su panel. */}
          <Link to="/entrar" className="inline-flex h-11 items-center rounded-lg px-3 text-sm font-bold hover:bg-paper">
            {t.directory.ownerLogin}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[70rem] px-4 py-8">
        <h1 className="text-3xl leading-tight font-bold tracking-tight text-balance">{t.directory.title}</h1>
        <p className="mt-2 max-w-prose text-ink-muted">{t.directory.subtitle}</p>
        <Link to="/entrar/conhecer" className="mt-3 inline-block font-bold underline">{lang === "es" ? "Tu comercio aquí por R$79,90/mes" : "Sua loja aqui por R$79,90/mês"}</Link>
        <div className="mt-6 max-w-md">
          <SearchBox value={search} onChange={setSearch} placeholder={t.directory.search} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4"><label className="flex min-h-11 items-center gap-2"><input type="checkbox" className="size-5" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />{lang === "es" ? "Abiertos ahora" : "Abertos agora"}</label><select aria-label={lang === "es" ? "Forma de recibir" : "Como receber"} value={fulfillment} onChange={(e) => setFulfillment(e.target.value)} className="h-11 rounded-lg border border-line bg-surface px-3"><option value="all">{lang === "es" ? "Todos" : "Todos"}</option><option value="delivery">{lang === "es" ? "Con entrega" : "Com entrega"}</option><option value="pickup">{lang === "es" ? "Para retirar" : "Para retirar"}</option></select></div>

        {query.isPending && (
          <div className="py-10">
            <Spinner />
          </div>
        )}
        {query.isError && (
          <div className="py-10">
            <p>{t.errors.generic}</p>
            <button type="button" onClick={() => query.refetch()} className="mt-3 h-11 rounded-lg bg-action px-4 font-bold text-white">
              {t.errors.retry}
            </button>
          </div>
        )}
        {query.data &&
          (stores.length > 0 ? (
            <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {stores.map((store) => (
                <StoreCard key={store.slug} store={store} />
              ))}
            </ul>
          ) : (
            <p className="py-10 text-center text-ink-muted">
              {search.trim() ? t.directory.noResults(search.trim()) : t.directory.empty}
            </p>
          ))}
      </main>
    </div>
  );
}
