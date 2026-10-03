import Coupon from "../models/coupon.model.js";
import { audit } from "../lib/audit.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";

const couponNotFound = () => notFound("Cupom não encontrado");
const entityOf = (coupon) => ({ type: "coupon", id: coupon._id });

// Reglas que dependen de varios campos: se chequean con el cupón ya armado.
function checkCouponRules(coupon) {
  if (coupon.type === "percent" && (coupon.value < 1 || coupon.value > 100)) {
    throw badRequest("INVALID_COUPON", "O desconto em porcentagem vai de 1 a 100");
  }
  if (coupon.type === "fixed" && coupon.value < 1) {
    throw badRequest("INVALID_COUPON", "Informe o valor do desconto");
  }
  if (coupon.startsAt && coupon.endsAt && coupon.endsAt <= coupon.startsAt) {
    throw badRequest("INVALID_COUPON", "O cupom precisa terminar depois de começar");
  }
}

async function checkCodeFree(commerce, code, exceptId) {
  const filter = { commerce, code, ...(exceptId ? { _id: { $ne: exceptId } } : {}) };
  if (await Coupon.exists(filter)) throw conflict("COUPON_CODE_TAKEN", "Já existe um cupom com esse código");
}

async function findCoupon(req) {
  const coupon = await Coupon.findOne({ _id: req.valid.params.id, commerce: req.commerce._id });
  if (!coupon) throw couponNotFound();
  return coupon;
}

export const listCoupons = async (req, res) => {
  const coupons = await Coupon.find({ commerce: req.commerce._id }).sort({ createdAt: -1 });
  res.json({ coupons });
};

export const createCoupon = async (req, res) => {
  const data = req.valid.body;
  await checkCodeFree(req.commerce._id, data.code);
  const coupon = new Coupon({ ...data, commerce: req.commerce._id });
  checkCouponRules(coupon);
  await coupon.save();
  await audit(req, { action: "coupon.created", entity: entityOf(coupon), changes: { code: coupon.code, type: coupon.type, value: coupon.value } });
  res.status(201).json({ coupon });
};

export const updateCoupon = async (req, res) => {
  const changes = req.valid.body;
  const coupon = await findCoupon(req);
  if (changes.code) await checkCodeFree(req.commerce._id, changes.code, coupon._id);
  coupon.set(changes);
  checkCouponRules(coupon);
  await coupon.save();
  await audit(req, { action: "coupon.updated", entity: entityOf(coupon), changes: { code: coupon.code, ...changes } });
  res.json({ coupon });
};

// Los pedidos que lo usaron guardan su propia copia del código y del descuento.
export const deleteCoupon = async (req, res) => {
  const coupon = await findCoupon(req);
  await coupon.deleteOne();
  await audit(req, { action: "coupon.deleted", entity: entityOf(coupon), changes: { code: coupon.code } });
  res.status(204).end();
};
