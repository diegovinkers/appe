import { MongoMemoryReplSet } from "mongodb-memory-server";

let replSet;

// Replica set (de un nodo) porque la API usa transacciones, como en Atlas.
export async function setup(project) {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  project.provide("mongoUri", replSet.getUri());
}

export async function teardown() {
  await replSet?.stop();
}
