import { z } from "zod";
import { COMMERCE_STATUSES } from "../models/commerce.model.js";
import { email, newPassword, objectId, phone, requiredText, slug } from "./common.schema.js";

// El superadmin crea el local y su dueño en un solo paso.
export const createCommerceSchema = z.object({
  commerce: z.object({ name: requiredText(80), slug, whatsapp: phone }),
  owner: z.object({ name: requiredText(80), email, password: newPassword }),
});

export const updateCommerceSchema = z
  .object({ name: requiredText(80), slug, whatsapp: phone, status: z.enum(COMMERCE_STATUSES) })
  .partial()
  .refine((changes) => Object.keys(changes).length > 0, "Nada para atualizar");

export const resetPasswordSchema = z.object({ password: newPassword });

export const auditQuery = z.object({
  commerce: objectId.optional(),
  action: z.string().trim().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
