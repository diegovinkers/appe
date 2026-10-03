import type { Role } from "../api/types";

// Copia del mapa de permisos del backend (backend/src/lib/permissions.js).
// El backend es el que decide: esto solo sirve para mostrar u ocultar lo que cada rol puede usar.
export const ROLE_PERMISSIONS = {
  superadmin: ["platform:manage"],
  owner: [
    "store:read",
    "store:write",
    "store:open",
    "menu:read",
    "menu:write",
    "menu:availability",
    "orders:read",
    "orders:write",
    "orders:manual",
    "coupons:manage",
  ],
  staff: ["store:read", "store:open", "menu:read", "menu:availability", "orders:read", "orders:write", "orders:manual"],
} as const satisfies Record<Role, readonly string[]>;

export type Permission = (typeof ROLE_PERMISSIONS)[Role][number];

export const can = (role: Role | undefined, permission: Permission): boolean =>
  role ? (ROLE_PERMISSIONS[role] as readonly string[]).includes(permission) : false;
