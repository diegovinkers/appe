import { describe, expect, it } from "vitest";
import { couponDraft, couponState, validateCouponDraft, type CouponDraft, type OwnerCoupon } from "./coupons";

const draft = (changes: Partial<CouponDraft> = {}) => ({ ...couponDraft(null), code: "DEMO10", ...changes });
const coupon = (changes: Partial<OwnerCoupon> = {}) => ({ active: true, startsAt: null, endsAt: null, maxUses: null, uses: 0, ...changes }) as OwnerCoupon;

describe("owner coupon validation", () => {
  it("normalizes the code, sends BRL as cents and explicitly clears optional limits and dates", () => {
    expect(validateCouponDraft(draft({ code: " demo_10 ", type: "fixed", value: "10,25", minOrderCents: "25.90" })).body).toMatchObject({
      code: "DEMO_10", value: 1025, minOrderCents: 2590, maxUses: null, maxUsesPerCustomer: null, startsAt: null, endsAt: null,
    });
  });

  it("rejects negative values, excessive decimals and amounts beyond the API limit", () => {
    for (const value of ["-10", "1,001", "100000.01", "invalid", "0"]) {
      expect(validateCouponDraft(draft({ type: "fixed", value })).errors.value).toBe("positiveMoney");
    }
    expect(validateCouponDraft(draft({ minOrderCents: "-1" })).errors.minOrderCents).toBe("money");
    expect(validateCouponDraft(draft({ type: "fixed", value: "100000,00" })).body?.value).toBe(10_000_000);
  });

  it("requires whole percentages and bounded use limits", () => {
    for (const value of ["0", "101", "1.5", "1e1", ""]) expect(validateCouponDraft(draft({ value })).errors.value).toBe("percent");
    expect(validateCouponDraft(draft({ maxUses: "0", maxUsesPerCustomer: "1000001" })).errors).toMatchObject({ maxUses: "limit", maxUsesPerCustomer: "limit" });
    expect(validateCouponDraft(draft({ maxUses: "2", maxUsesPerCustomer: "1" })).body).toMatchObject({ maxUses: 2, maxUsesPerCustomer: 1 });
  });

  it("clears unused discount value for free delivery", () => {
    expect(validateCouponDraft(draft({ type: "free_delivery", value: "invalid" })).body?.value).toBe(0);
  });

  it("validates calendar dates and enforces the validity interval in Brazil time", () => {
    expect(validateCouponDraft(draft({ startsAt: "2026-02-30T12:00" })).errors.startsAt).toBe("date");
    expect(validateCouponDraft(draft({ startsAt: "2026-09-27T23:00", endsAt: "2026-09-27T22:00" })).errors.endsAt).toBe("dateOrder");
    expect(validateCouponDraft(draft({ startsAt: "2026-09-27T23:00", endsAt: "2026-09-28T01:00" })).body).toMatchObject({
      startsAt: "2026-09-27T23:00:00-03:00", endsAt: "2026-09-28T01:00:00-03:00",
    });
  });
});

describe("owner coupon state", () => {
  const now = Date.parse("2026-09-27T12:00:00Z");
  it("matches checkout time boundaries and exhausted usage", () => {
    expect(couponState(coupon({ startsAt: "2026-09-27T12:00:00Z" }), now)).toBe("active");
    expect(couponState(coupon({ endsAt: "2026-09-27T12:00:00Z" }), now)).toBe("expired");
    expect(couponState(coupon({ startsAt: "2026-09-27T12:01:00Z" }), now)).toBe("scheduled");
    expect(couponState(coupon({ maxUses: 2, uses: 2 }), now)).toBe("exhausted");
    expect(couponState(coupon({ maxUses: 2, uses: 1 }), now)).toBe("active");
    expect(couponState(coupon({ active: false, maxUses: 2, uses: 2 }), now)).toBe("inactive");
  });
});
