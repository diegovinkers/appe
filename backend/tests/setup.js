import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, inject } from "vitest";

// Cada archivo de tests trabaja en su propia base, así pueden correr en paralelo.
beforeAll(async () => {
  await mongoose.connect(inject("mongoUri"), { dbName: `test-${randomUUID()}` });
  // Los índices únicos tienen que existir antes de los tests que dependen de ellos.
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).init()));
});

afterEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
