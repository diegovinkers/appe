import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, FileUp } from "lucide-react";
import { useState } from "react";
import { type ApiError, api } from "../../../api/client";
import type { ImportResult } from "../../../api/types";
import { PageHeader } from "../../../components/PageHeader";
import { button } from "../../../components/ui";
import { errorText, useT } from "../../../i18n";
import { readCsvFile } from "../../../lib/csvFile";

// Menú en planilla: se baja, se edita en Excel y se sube. Al subir, primero se muestra
// qué va a cambiar (dryRun) y solo se aplica si el dueño confirma y no hay errores.
export function SpreadsheetPage() {
  const t = useT();
  const s = t.spreadsheet;
  const queryClient = useQueryClient();
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [applied, setApplied] = useState(false);

  const check = useMutation<ImportResult, ApiError, { csv: string; dryRun: boolean }>({
    mutationFn: (body) => api<ImportResult>("/owner/menu/import", { method: "POST", body }),
    onSuccess: (result) => {
      if (result.dryRun) return;
      setApplied(true);
      setCsv(null);
      for (const key of [["owner-categories"], ["owner-products"], ["owner-option-groups"], ["public-store"]]) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setApplied(false);
    setFileName(file.name);
    const text = await readCsvFile(file);
    setCsv(text);
    check.mutate({ csv: text, dryRun: true });
  };

  const preview = check.data?.dryRun ? check.data : null;
  const changes = preview ? preview.summary.categoriesCreated + preview.summary.productsCreated + preview.summary.productsUpdated : 0;

  return (
    <>
      <PageHeader title={t.pages.spreadsheet.title} description={t.pages.spreadsheet.description} />
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="text-lg font-bold">{s.downloadTitle}</h2>
          <p className="mt-1 mb-4 text-ink-muted">{s.downloadText}</p>
          <a href="/api/owner/menu/export" download className={button.primary}>
            <Download aria-hidden className="size-5" />
            {s.download}
          </a>
        </section>

        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="text-lg font-bold">{s.uploadTitle}</h2>
          <p className="mt-1 mb-4 text-ink-muted">{s.uploadText}</p>
          <label className={`${button.secondary} cursor-pointer`}>
            <FileUp aria-hidden className="size-5" />
            {csv || applied ? s.anotherFile : s.chooseFile}
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(event) => {
                choose(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
          {fileName && <p className="mt-2 text-sm text-ink-muted">{fileName}</p>}

          <div aria-live="polite" className="mt-4 space-y-3">
            {check.isPending && <p>{check.variables?.dryRun ? s.checking : s.applying}</p>}
            {check.isError && <p className="font-bold text-error">{errorText(check.error, t)}</p>}
            {applied && <p className="rounded-lg bg-[#e3f4ea] p-3 font-bold text-[#16603b]">{s.applied}</p>}
            {preview && preview.errors.length > 0 && (
              <div className="rounded-lg border border-closed/40 p-3">
                <p className="font-bold text-error">{s.errorsTitle(preview.errors.length)}</p>
                <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-sm">
                  {preview.errors.map((error, index) => (
                    <li key={index}>
                      <strong>{s.line(error.line)}:</strong> {error.message}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-sm text-ink-muted">{s.fixAndRetry}</p>
              </div>
            )}
            {preview && preview.errors.length === 0 && (
              <div className="rounded-lg bg-paper p-3">
                {changes === 0 ? (
                  <p>{s.nothing}</p>
                ) : (
                  <>
                    <p className="font-bold">{s.willChange}</p>
                    <ul className="mt-1 list-disc pl-5">
                      {preview.summary.categoriesCreated > 0 && <li>{s.categoriesCreated(preview.summary.categoriesCreated)}</li>}
                      {preview.summary.productsCreated > 0 && <li>{s.productsCreated(preview.summary.productsCreated)}</li>}
                      {preview.summary.productsUpdated > 0 && <li>{s.productsUpdated(preview.summary.productsUpdated)}</li>}
                    </ul>
                    <button
                      type="button"
                      disabled={check.isPending || !csv}
                      onClick={() => csv && check.mutate({ csv, dryRun: false })}
                      className={`${button.primary} mt-3`}
                    >
                      {s.apply}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="mt-4 rounded-xl border border-line bg-surface p-5">
        <h2 className="text-lg font-bold">{s.columnsTitle}</h2>
        <dl className="mt-3 divide-y divide-line">
          {s.columns.map(([column, text]) => (
            <div key={column} className="grid gap-1 py-2 sm:grid-cols-[12rem_1fr]">
              <dt>
                <code className="rounded bg-paper px-1.5 py-0.5 text-sm">{column}</code>
              </dt>
              <dd className="text-ink-muted">{text}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-sm text-ink-muted">{s.tip}</p>
      </section>
    </>
  );
}
