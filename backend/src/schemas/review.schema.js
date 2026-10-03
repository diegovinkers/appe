import { z } from "zod";
import { optionalText } from "./common.schema.js";

// La reseña del cliente: de 1 a 5 estrellas y un comentario opcional.
export const createReviewSchema = z.object({
  rating: z.number().int().min(1, "Escolha de 1 a 5 estrelas").max(5, "Escolha de 1 a 5 estrelas"),
  comment: optionalText(500).default(""),
});

// El local solo puede ocultarla o volver a mostrarla en el menú.
export const updateReviewSchema = z.object({ hidden: z.boolean() });
