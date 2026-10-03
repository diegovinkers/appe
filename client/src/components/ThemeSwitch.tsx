import { Moon, Sun } from "lucide-react";
import { useT } from "../i18n";
import { setTheme, useTheme } from "../lib/theme";

export function ThemeSwitch() {
  const t = useT();
  const dark = useTheme() === "dark";
  const label = dark ? t.theme.useLight : t.theme.useDark;
  const Icon = dark ? Sun : Moon;
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={label}
      title={label}
      className="grid size-11 shrink-0 place-items-center rounded-lg border border-line bg-surface text-ink hover:bg-paper"
    >
      <Icon aria-hidden="true" className="size-5" />
    </button>
  );
}
