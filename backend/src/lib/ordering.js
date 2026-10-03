import { notFound } from "./errors.js";

// Posición para agregar un elemento al final de su lista.
export async function nextPosition(Model, filter) {
  const last = await Model.findOne(filter).sort({ position: -1 }).select("position").lean();
  return last ? last.position + 1 : 0;
}

// Guarda el orden recibido. Todos los ids tienen que cumplir el filtro, que siempre
// incluye el local: así nadie reordena elementos de otro.
export async function applyOrder(Model, filter, ids) {
  const found = await Model.countDocuments({ ...filter, _id: { $in: ids } });
  if (found !== ids.length) throw notFound("Algum item não foi encontrado");

  await Model.bulkWrite(
    ids.map((id, position) => ({
      updateOne: { filter: { ...filter, _id: id }, update: { $set: { position } } },
    }))
  );
}
