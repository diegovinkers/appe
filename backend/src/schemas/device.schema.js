import { z } from "zod";
import { objectId, requiredText } from "./common.schema.js";
import { pin } from "./team.schema.js";

// Registrar este aparato para el equipo: un nombre para reconocerlo ("Tablet do salão").
export const deviceSchema = z.object({ name: requiredText(40) });

// Entrar con PIN desde un aparato del equipo.
export const pinLoginSchema = z.object({ userId: objectId, pin });
