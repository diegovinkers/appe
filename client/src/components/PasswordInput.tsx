import { Eye, EyeOff } from "lucide-react";
import { type InputHTMLAttributes, useState } from "react";
import { useT } from "../i18n";

// Campo de contraseña con el botón para verla (en el celular se escribe mal muy fácil).
export function PasswordInput({ className = "", ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const t = useT();
  const [visible, setVisible] = useState(false);
  const label = visible ? t.hidePassword : t.showPassword;
  return (
    <div className="relative">
      <input {...props} type={visible ? "text" : "password"} className={`${className} pr-12`} />
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        aria-label={label}
        aria-pressed={visible}
        title={label}
        className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-lg text-ink-muted hover:text-ink"
      >
        {visible ? <EyeOff aria-hidden className="size-5" /> : <Eye aria-hidden className="size-5" />}
      </button>
    </div>
  );
}
