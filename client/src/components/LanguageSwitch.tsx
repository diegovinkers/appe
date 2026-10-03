import { LANGUAGES, setLanguage, useLanguage, useT } from "../i18n";
import { ThemeSwitch } from "./ThemeSwitch";

// Selector a la vista (entrada y menú público). Dentro del panel está en el menú de la cuenta.
// compact: "PT | ES", para pantallas angostas (el nombre completo queda para lectores de pantalla).
export function LanguageSwitch({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const language = useLanguage();

  return (
    <div className="inline-flex items-center gap-2">
      <ThemeSwitch />
    <div role="group" aria-label={t.language} className="inline-flex rounded-lg border border-line bg-surface p-1">
      {LANGUAGES.map(({ code, name }) => (
        <button
          key={code}
          type="button"
          lang={code}
          aria-pressed={code === language}
          aria-label={name}
          onClick={() => setLanguage(code)}
          className={`h-9 rounded-md px-3 text-sm ${
            code === language ? "bg-action font-bold text-white" : "text-ink-muted hover:bg-paper hover:text-ink"
          }`}
        >
          <span className={compact ? "" : "sm:hidden"}>{code.slice(0, 2).toUpperCase()}</span>
          {!compact && <span className="hidden sm:inline">{name}</span>}
        </button>
      ))}
    </div>
    </div>
  );
}
