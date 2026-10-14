import { describe, expect, it } from "vitest";
import { ApiError } from "../api/client";
import { expiredSession } from "./expiry";

describe("sesión vencida", () => {
  const error = (path: string, code = "UNAUTHENTICATED", status = 401) => new ApiError(status, code, "", undefined, path);

  it("distingue la del panel de la del cliente", () => {
    expect(expiredSession(error("/owner/orders"))).toBe("panel");
    expect(expiredSession(error("/admin/commerces"))).toBe("panel");
    expect(expiredSession(error("/customer/orders"))).toBe("customer");
  });

  it("no confunde una contraseña equivocada ni el chequeo de sesión con una sesión vencida", () => {
    expect(expiredSession(error("/auth/login", "INVALID_CREDENTIALS"))).toBeNull();
    expect(expiredSession(error("/customer/login", "INVALID_CREDENTIALS"))).toBeNull();
    expect(expiredSession(error("/auth/me"))).toBeNull();
    expect(expiredSession(error("/owner/orders", "FORBIDDEN", 403))).toBeNull();
    expect(expiredSession(new Error("x"))).toBeNull();
  });
});
