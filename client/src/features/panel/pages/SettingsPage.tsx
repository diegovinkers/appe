import { useQuery } from "@tanstack/react-query";
import { ChevronRight, CircleAlert } from "lucide-react";
import { Link } from "react-router";
import { api } from "../../../api/client";
import type { Product } from "../../../api/types";
import { PageHeader } from "../../../components/PageHeader";
import { button } from "../../../components/ui";
import { useT } from "../../../i18n";
import { settingsFor } from "../nav";
import { usePanel } from "../PanelLayout";
import { settingsReadiness } from "../settings/readiness";

// Configurações: una tarjeta por tema. Las que les falta algo para recibir pedidos dicen "Revisar".
export function SettingsPage() {
  const t = useT();
  const { user, store, storeUrl } = usePanel();
  const ready = settingsReadiness(store);
  const products = useQuery({ queryKey: ["setup-products"], queryFn: () => api<{ products: Product[] }>("/owner/products") });
  const noProducts = products.data && !products.data.products.some((product) => product.available);

  return (
    <>
      <PageHeader
        title={t.pages.settings.title}
        description={t.pages.settings.description}
        actions={
          <a className={button.secondary} href={storeUrl} target="_blank" rel="noreferrer">
            {t.settings.testMenu} ↗
          </a>
        }
      />
      {noProducts && (
        <div role="status" className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-error-soft p-4 text-error ring-1 ring-error/30">
          <CircleAlert aria-hidden className="size-5 shrink-0" />
          <p className="min-w-0 flex-1 font-bold">{t.settings.noProducts}</p>
          <Link to="/painel/cardapio/produtos" className={button.secondary}>
            {t.settings.goToMenu}
          </Link>
        </div>
      )}
      <ul className="grid gap-3 sm:grid-cols-2">
        {settingsFor(user.role).map((item) => {
          const pending = ready[item.key] === false;
          return (
            <li key={item.key}>
              <Link to={item.to} className="flex h-full min-h-20 items-center gap-4 rounded-xl border border-line bg-surface p-4 hover:bg-paper">
                <item.icon aria-hidden className="size-6 shrink-0 text-ink-muted" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 font-bold">
                    {item.label}
                    {pending && <span className="rounded-full bg-error-soft px-2 py-0.5 text-xs text-error ring-1 ring-inset ring-error/30">{t.settings.review}</span>}
                  </span>
                  <span className="mt-0.5 block text-sm text-ink-muted">{t.pages[item.key].description}</span>
                </span>
                <ChevronRight aria-hidden className="size-5 shrink-0 text-ink-muted" />
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
