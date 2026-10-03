import { describe, expect, it } from "vitest";
import User from "../../src/models/user.model.js";
import { createCommerceWithOwner } from "../helpers.js";

// Los scripts (create-superadmin, crear-usuario-prueba) crean usuarios con
// findOneAndUpdate + upsert, donde los validadores reciben la query y no el documento.
describe("User: el local es obligatorio salvo para el superadmin", () => {
  const upsert = (email, update) =>
    User.findOneAndUpdate({ email }, update, { upsert: true, runValidators: true, returnDocument: "after" });

  it("un superadmin se crea por upsert aunque se borre el local", async () => {
    const user = await upsert("root@test.local", {
      $set: { name: "Root", role: "superadmin", passwordHash: "x" },
      $unset: { commerce: 1 },
    });
    expect(user.role).toBe("superadmin");
  });

  it("un owner o staff por upsert sin local falla", async () => {
    for (const role of ["owner", "staff"]) {
      await expect(
        upsert(`${role}@test.local`, { $set: { name: "X", role, passwordHash: "x" }, $unset: { commerce: 1 } })
      ).rejects.toThrow(/commerce/);
    }
  });

  it("un update que no toca el rol ni el local no se traba", async () => {
    const { owner } = await createCommerceWithOwner();
    const updated = await User.findOneAndUpdate(
      { _id: owner._id },
      { $set: { name: "Nuevo nombre" } },
      { runValidators: true, returnDocument: "after" }
    );
    expect(updated.name).toBe("Nuevo nombre");
  });

  it("al crear un documento, owner y staff sin local fallan", async () => {
    await expect(User.create({ name: "X", email: "x@test.local", role: "staff", passwordHash: "x" })).rejects.toThrow(
      /commerce/
    );
    const root = await User.create({ name: "R", email: "r@test.local", role: "superadmin", passwordHash: "x" });
    expect(root.commerce).toBeUndefined();
  });
});
