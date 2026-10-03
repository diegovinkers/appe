import { describe, expect, it } from "vitest";
import { costMicros, currentMonth, priceOf } from "../../src/services/assistant/costs.js";

describe("costo de la IA", () => {
  it("en millonésimos de dólar, con la caché más barata", () => {
    const usage = { inputTokens: 2000, outputTokens: 300, cacheWriteTokens: 6000, cacheReadTokens: 12000 };
    // 2000 × 1 + 300 × 5 + 6000 × 1,25 + 12000 × 0,1
    expect(costMicros("claude-haiku-4-5-20251001", usage)).toBe(12200);
  });

  it("reconoce el modelo con o sin fecha; uno sin precio no se cobra a ciegas", () => {
    expect(priceOf("claude-haiku-4-5")).toEqual(priceOf("claude-haiku-4-5-20251001"));
    expect(costMicros("otro-modelo", { inputTokens: 1, outputTokens: 1, cacheWriteTokens: 0, cacheReadTokens: 0 })).toBeNull();
  });

  it("el mes empieza a la medianoche de Brasil", () => {
    const { month, start } = currentMonth(new Date("2026-10-01T02:00:00Z")); // 30/09 23:00 en Brasil
    expect(month).toBe("2026-09");
    expect(start.toISOString()).toBe("2026-09-01T03:00:00.000Z");
  });
});
