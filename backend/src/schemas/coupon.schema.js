import { z } from "zod";
import { COUPON_TYPES } from "../models/coupon.model.js";
import { cents, dateTime, optionalText } from "./common.schema.js";
import { couponCode } from "./order.schema.js";

const uses = z.number().int().min(1).max(1_000_000).nullable();

const couponFields = {
  code: couponCode,
  type: z.enum(COUPON_TYPES),
  // percent: 1 a 100; fixed: centavos; free_delivery: no se usa.
  value: z.number().int().min(0).max(10_000_000),
  minOrderCents: cents,
  startsAt: dateTime.nullable(),
  endsAt: dateTime.nullable(),
  maxUses: uses,
  maxUsesPerCustomer: uses,
  active: z.boolean(),
  description: optionalText(140),
};

export const createCouponSchema = z
  .object(couponFields)
  .partial({ value: true, minOrderCents: true, startsAt: true, endsAt: true, maxUses: true, maxUsesPerCustomer: true, active: true, description: true });

export const updateCouponSchema = z
  .object(couponFields)
  .partial()
  .refine((changes) => Object.keys(changes).length > 0, "Nada para atualizar");
