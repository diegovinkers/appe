import { z } from "zod";
import { email, newPassword } from "./common.schema.js";

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Informe a senha").max(72),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Informe a senha atual").max(72),
  newPassword,
});

// Cambiar el propio PIN: con PIN, el actual; sin PIN todavía, la contraseña.
export const changePinSchema = z.object({
  pin: z.string().regex(/^\d{4,6}$/, "O PIN tem de 4 a 6 números"),
  currentPin: z.string().max(6).optional(),
  currentPassword: z.string().max(72).optional(),
});
