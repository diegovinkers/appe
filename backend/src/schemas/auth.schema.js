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
