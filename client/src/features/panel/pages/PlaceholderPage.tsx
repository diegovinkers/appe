import { PageHeader } from "../../../components/PageHeader";
import { type Dictionary, useT } from "../../../i18n";

type PageKey = Exclude<keyof Dictionary["pages"], "orders" | "qr" | "platform">;

// Páginas que ya tienen su lugar en el menú y se construyen en las próximas etapas.
export function PlaceholderPage({ page }: { page: PageKey }) {
  const t = useT();
  const { title, description } = t.pages[page];
  return (
    <>
      <PageHeader title={title} description={description} />
      <p className="rounded-xl border border-dashed border-line bg-surface p-6 text-ink-muted">{t.coming}</p>
    </>
  );
}
