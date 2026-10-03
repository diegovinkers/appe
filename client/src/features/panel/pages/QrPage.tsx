import { Check, Copy, Download } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "../../../components/PageHeader";
import { useT } from "../../../i18n";
import { usePanel } from "../PanelLayout";

export function QrPage() {
  const t = useT();
  const { store, storeUrl } = usePanel();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(storeUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Sin permiso de portapapeles: el link queda seleccionable en el campo.
    }
  };

  const button = "inline-flex h-11 items-center gap-2 rounded-lg border border-line bg-surface px-4 font-bold hover:bg-paper";

  return (
    <>
      <PageHeader title={t.pages.qr.title} description={t.pages.qr.description} />
      <div className="grid gap-8 md:grid-cols-[auto_1fr] md:items-start">
        <img
          src="/api/owner/store/qr?size=512"
          alt={t.qr.alt(storeUrl)}
          width={256}
          height={256}
          className="rounded-xl border border-line bg-white p-3"
        />
        <div className="max-w-md space-y-5">
          <div>
            <label htmlFor="link-cardapio" className="mb-1.5 block font-bold">
              {t.qr.linkLabel}
            </label>
            <div className="flex gap-2">
              <input
                id="link-cardapio"
                readOnly
                value={storeUrl}
                onFocus={(event) => event.currentTarget.select()}
                className="h-11 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3"
              />
              <button type="button" onClick={copy} className={button}>
                {copied ? <Check aria-hidden className="size-4 text-success" /> : <Copy aria-hidden className="size-4" />}
                <span aria-live="polite">{copied ? t.qr.copied : t.qr.copy}</span>
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/api/owner/store/qr?format=png&size=1024" download={`qr-${store.slug}.png`} className={button}>
              <Download aria-hidden className="size-4" />
              {t.qr.downloadPng}
            </a>
            <a href="/api/owner/store/qr?format=svg" download={`qr-${store.slug}.svg`} className={button}>
              <Download aria-hidden className="size-4" />
              {t.qr.downloadSvg}
            </a>
          </div>
          <p className="text-ink-muted">{t.qr.hint}</p>
        </div>
      </div>
    </>
  );
}
