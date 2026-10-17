import { z } from "zod";
import { email, newPassword, requiredText } from "./common.schema.js";

// PIN: de 4 a 6 dígitos.
export const pin = z.string().regex(/^\d{4,6}$/, "O PIN tem de 4 a 6 números");

// Equipe: el dueño da de alta a sus empleados. El rol no se elige: siempre es staff. Con email
// y contraseña (entra desde cualquier lado) o solo con nombre y PIN (entra desde los aparatos del
// equipo). Se puede dar las dos cosas.
export const createMemberSchema = z
  .object({ name: requiredText(80), email: email.optional(), password: newPassword.optional(), pin: pin.optional() })
  .refine((body) => Boolean(body.email) === Boolean(body.password), "Informe o e-mail e a senha juntos")
  .refine((body) => body.email || body.pin, "Informe e-mail e senha, ou um PIN");

export const memberPinSchema = z.object({ pin });

export const updateMemberSchema = z
  .object({ name: requiredText(80), active: z.boolean() })
  .partial()
  .refine((changes) => Object.keys(changes).length > 0, "Nada para atualizar");

export const memberPasswordSchema = z.object({ password: newPassword });
