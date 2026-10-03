// Qué puede hacer cada rol. Los endpoints declaran el permiso que necesitan con
// requirePermission("..."); cambiar lo que puede hacer un rol es tocar solo este mapa.
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
  // Empleado del local: atiende pedidos (también los que llegan por teléfono o en el
  // mostrador), abre o pausa el local y marca agotados. No cambia precios, cupones,
  // configuración ni equipo.
  staff: [
    "store:read",
    "store:open",
    "menu:read",
    "menu:availability",
    "orders:read",
    "orders:write",
    "orders:manual",
  ],
};

export const PERMISSIONS = [...new Set(Object.values(ROLE_PERMISSIONS).flat())];

export const hasPermission = (role, permission) => ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
