import { z } from "zod";
import { email, newPassword, requiredText } from "./common.schema.js";

// Equipe: el dueño da de alta a sus empleados. El rol no se elige: siempre es staff.
export const createMemberSchema = z.object({ name: requiredText(80), email, password: newPassword });

export const updateMemberSchema = z
  .object({ name: requiredText(80), active: z.boolean() })
  .partial()
  .refine((changes) => Object.keys(changes).length > 0, "Nada para atualizar");

export const memberPasswordSchema = z.object({ password: newPassword });
