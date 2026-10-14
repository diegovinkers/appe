import { Bell, BellOff } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Switch, button } from "../../../components/ui";
import { useDismiss } from "../../../hooks/useDismiss";
import { useT } from "../../../i18n";
import { playAlert } from "./alertSound";
import { setDeviceSetting, useDeviceSettings } from "./deviceSettings";

// La campana del encabezado: sonido e impresión de este aparato, a un toque.
export function AlertSettingsControl() {
  const t = useT();
  const settings = useDeviceSettings();
  const [open, setOpen] = useState(false);
  const [testFailed, setTestFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  const Icon = settings.sound ? Bell : BellOff;
  const state = settings.sound ? t.alerts.soundOn : t.alerts.soundOff;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${t.alerts.settings}: ${state}`}
        title={state}
        onClick={() => setOpen((value) => !value)}
        className={`grid size-11 shrink-0 place-items-center rounded-lg border border-line bg-surface hover:bg-paper ${settings.sound ? "text-ink" : "text-error"}`}
      >
        <Icon aria-hidden className="size-5" />
      </button>

      {open && (
        <div role="dialog" aria-label={t.alerts.settings} className="absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-1.5rem)] space-y-3 rounded-xl border border-line bg-surface p-4 shadow-lg">
          <p className="font-bold">{t.alerts.settings}</p>
          <div>
            <Switch label={t.alerts.sound} checked={settings.sound} onChange={(value) => setDeviceSetting("sound", value)} />
            <p className="text-sm text-ink-muted">{t.alerts.soundHint}</p>
          </div>
          <button type="button" className={`${button.secondary} w-full`} onClick={async () => setTestFailed(!(await playAlert()))}>
            {t.alerts.test}
          </button>
          {testFailed && (
            <p role="alert" className="text-sm text-error">
              {t.alerts.testFailed}
            </p>
          )}
          <hr className="border-line" />
          <Switch label={t.alerts.autoPrint} checked={settings.autoPrint} onChange={(value) => setDeviceSetting("autoPrint", value)} />
          <label className="flex items-center justify-between gap-3">
            <span>{t.alerts.paper}</span>
            <select
              value={settings.paper}
              onChange={(event) => setDeviceSetting("paper", Number(event.target.value) === 58 ? 58 : 80)}
              className="h-11 rounded-lg border border-line bg-surface px-2"
            >
              <option value={80}>80 mm</option>
              <option value={58}>58 mm</option>
            </select>
          </label>
          <p className="text-sm text-ink-muted">{t.alerts.deviceHint}</p>
        </div>
      )}
    </div>
  );
}
