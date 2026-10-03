import { describe, expect, it } from "vitest";
import { checkImageUrl, signParams } from "../../src/lib/cloudinary.js";

describe("signParams", () => {
  it("firma como Cloudinary: parámetros ordenados + secret, en SHA-1", () => {
    // Ejemplo de la documentación de Cloudinary (authentication signatures).
    const params = { timestamp: 1315060510, public_id: "sample_image", eager: "w_400,h_300,c_pad|w_260,h_200,c_crop" };
    expect(signParams(params, "abcd")).toBe("bfd09f95f331f558cbd1320e67aa8d488770583e");
  });
});

describe("checkImageUrl (con la nube de prueba de vitest.config.js)", () => {
  const commerce = "64b000000000000000000001";
  const ours = `https://res.cloudinary.com/nube-de-prueba/image/upload/v17/app-pedidos/${commerce}/product/x.jpg`;

  it("acepta imágenes de nuestra nube en la carpeta del local, y vacío", () => {
    expect(() => checkImageUrl(ours, commerce, "imageUrl")).not.toThrow();
    expect(() => checkImageUrl("", commerce, "imageUrl")).not.toThrow();
  });

  it.each([
    ["de otro local", ours.replace(commerce, "64b000000000000000000002")],
    ["de otra nube", ours.replace("nube-de-prueba", "otra-nube")],
    ["externa", "https://example.com/foto.jpg"],
  ])("rechaza una imagen %s", (_caso, url) => {
    expect(() => checkImageUrl(url, commerce, "imageUrl")).toThrow(expect.objectContaining({ code: "INVALID_IMAGE_URL" }));
  });
});
