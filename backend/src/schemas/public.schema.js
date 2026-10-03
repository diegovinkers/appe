import { z } from "zod";

// Un slug con formato raro no es un error del cliente: simplemente no existe (404).
export const storeParams = z.object({ slug: z.string().trim().toLowerCase().max(60) });

// ?lang=es: textos en español cuando el local los cargó (si no, en portugués).
export const storeQuery = z.object({ lang: z.enum(["pt", "es"]).default("pt") });
