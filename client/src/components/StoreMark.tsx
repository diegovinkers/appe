import type { OwnerStore } from "../api/types";
import { initials, readableTextOn } from "../lib/color";
import { cloudinaryThumb } from "../lib/images";

type Props = { store: Pick<OwnerStore, "name" | "logoUrl" | "primaryColor">; size?: number; round?: boolean };

// El logo del local o, si no tiene, sus iniciales sobre su color. Redondo en el perfil público.
export function StoreMark({ store, size = 40, round = false }: Props) {
  const box = { width: size, height: size };
  const shape = round ? "rounded-full" : "rounded-lg";
  if (store.logoUrl) {
    return (
      <img
        src={cloudinaryThumb(store.logoUrl, size * 2)}
        alt=""
        style={box}
        className={`shrink-0 ${shape} bg-surface object-cover ring-1 ring-black/10`}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{ ...box, background: store.primaryColor, color: readableTextOn(store.primaryColor), fontSize: size * 0.4 }}
      className={`grid shrink-0 place-items-center ${shape} font-bold tracking-tight`}
    >
      {initials(store.name)}
    </span>
  );
}
