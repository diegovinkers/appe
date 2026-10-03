import { describe, expect, it } from "vitest";
import { PERMISSIONS, hasPermission } from "../../src/lib/permissions.js";
import { requirePermission } from "../../src/middlewares/auth.middleware.js";

describe("permisos", () => {
  it.each([
    ["owner", "menu:write", true],
    ["owner", "platform:manage", false],
    ["staff", "orders:write", true],
    ["staff", "menu:availability", true],
    ["staff", "store:open", true],
    ["staff", "menu:write", false],
    ["staff", "store:write", false],
    ["superadmin", "platform:manage", true],
    ["superadmin", "orders:read", false],
    ["nadie", "orders:read", false],
  ])("%s → %s: %s", (role, permission, expected) => {
    expect(hasPermission(role, permission)).toBe(expected);
  });

  it("un permiso mal escrito falla al definir la ruta, no en producción", () => {
    expect(() => requirePermission("menu:escribir")).toThrow(/Permiso desconocido/);
    expect(PERMISSIONS).toContain("menu:write");
  });
});
