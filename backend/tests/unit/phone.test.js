import { describe, expect, it } from "vitest";
import { normalizePhone, phoneVariants } from "../../src/lib/phone.js";

describe("normalizePhone", () => {
  it.each([
    ["55 99999-8888", "+5555999998888"], // DDD 55 (Quaraí) + celular
    ["(55) 3423-1234", "+555534231234"], // fijo
    ["+55 55 99999 8888", "+5555999998888"],
    ["5555999998888", "+5555999998888"], // con código de país, sin +
    ["055 99999 8888", "+5555999998888"], // prefijo nacional
    ["0055 55 99999 8888", "+5555999998888"],
    ["+598 99 123 456", "+59899123456"], // Uruguay
    ["099 123 456", "+59899123456"], // celular uruguayo con 0
    ["99 123 456", "+59899123456"],
    ["59899123456", "+59899123456"], // Uruguay con código, sin +
  ])("%s → %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(["99999-8888", "12345", "", "abc", "+1 212 555 1234", "0 1234"])(
    "rechaza %s",
    (input) => {
      expect(normalizePhone(input)).toBeNull();
    }
  );
});

describe("phoneVariants", () => {
  it("un celular de Brasil, con y sin el 9 del principio", () => {
    expect(phoneVariants("+5555981112045")).toEqual(["+5555981112045", "+555581112045"]);
    expect(phoneVariants("+555581112045")).toEqual(["+555581112045", "+5555981112045"]);
  });

  it("un fijo o un número de Uruguay quedan como están", () => {
    expect(phoneVariants("+555534231234")).toEqual(["+555534231234"]);
    expect(phoneVariants("+59899123456")).toEqual(["+59899123456"]);
    expect(phoneVariants("")).toEqual([]);
  });
});
