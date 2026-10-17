import Commerce from "../models/commerce.model.js";
import Device from "../models/device.model.js";
import User from "../models/user.model.js";
import { audit } from "../lib/audit.js";
import { endDevice, hashDeviceToken, readDeviceToken, startDevice } from "../lib/deviceSession.js";
import { AppError, notFound } from "../lib/errors.js";
import { checkPassword, hashPassword } from "../lib/passwords.js";
import { startSession } from "../lib/session.js";
import { sessionView } from "./auth.controller.js";

// Intentos de PIN equivocados seguidos antes de bloquear a esa persona, y por cuánto.
export const PIN_MAX_FAILURES = 5;
const PIN_LOCK_MS = 15 * 60 * 1000;

const deviceView = ({ _id, name, lastUsedAt, createdAt }) => ({ _id, name, lastUsedAt, createdAt });
const notRegistered = () => new AppError(401, "DEVICE_NOT_REGISTERED", "Este aparelho não está liberado para entrar com PIN");
const wrongPin = () => new AppError(401, "INVALID_PIN", "PIN incorreto");

// Se compara contra este hash cuando la persona no existe: la respuesta tarda lo mismo.
const dummyHash = hashPassword("0000");

// --- Panel del dueño: los aparatos del equipo ---

// Este aparato pasa a ser del equipo: desde acá los empleados entran con su PIN.
export const registerDevice = async (req, res) => {
  const tokenHash = startDevice(res);
  const device = await Device.create({ commerce: req.commerce._id, name: req.valid.body.name, tokenHash, createdBy: req.user.id });
  await audit(req, { action: "device.registered", entity: { type: "device", id: device._id }, changes: { name: device.name } });
  res.status(201).json({ device: deviceView(device) });
};

export const listDevices = async (req, res) => {
  const devices = await Device.find({ commerce: req.commerce._id, revokedAt: null }).sort({ createdAt: -1 }).lean();
  res.json({ devices: devices.map(deviceView) });
};

// Dar de baja un aparato (se perdió, se cambió): su cookie deja de valer.
export const revokeDevice = async (req, res) => {
  const device = await Device.findOneAndUpdate(
    { _id: req.valid.params.id, commerce: req.commerce._id, revokedAt: null },
    { $set: { revokedAt: new Date() } },
    { returnDocument: "after" }
  );
  if (!device) throw notFound("Aparelho não encontrado");
  await audit(req, { action: "device.revoked", entity: { type: "device", id: device._id }, changes: { name: device.name } });
  res.status(204).end();
};

// --- Entrar con PIN, desde un aparato del equipo ---

async function currentDevice(req) {
  const token = readDeviceToken(req);
  if (!token) return null;
  const device = await Device.findOne({ tokenHash: hashDeviceToken(token), revokedAt: null });
  if (!device) return null;
  const commerce = await Commerce.findOne({ _id: device.commerce, status: "active" }).select("name slug logoUrl primaryColor");
  return commerce ? { device, commerce } : null;
}

// GET /api/auth/device — si este aparato es del equipo: el local y quién puede entrar con PIN.
export const deviceInfo = async (req, res) => {
  const found = await currentDevice(req);
  if (!found) {
    // Una cookie vieja o dada de baja se borra.
    if (readDeviceToken(req)) endDevice(res);
    throw notRegistered();
  }
  const { device, commerce } = found;
  const people = await User.find({ commerce: commerce._id, active: true, role: "staff", pinHash: { $exists: true } }).select("name").sort({ name: 1 }).lean();
  res.json({
    device: { _id: device._id, name: device.name },
    commerce: { name: commerce.name, slug: commerce.slug, logoUrl: commerce.logoUrl, primaryColor: commerce.primaryColor },
    people: people.map(({ _id, name }) => ({ _id, name })),
  });
};

// POST /api/auth/pin — entrar (o cambiar de persona) con el PIN. Solo desde un aparato del
// equipo, solo empleados de ese local, y con bloqueo después de varios PIN equivocados.
export const pinLogin = async (req, res) => {
  const found = await currentDevice(req);
  if (!found) throw notRegistered();
  const { userId, pin } = req.valid.body;
  const user = await User.findOne({ _id: userId, commerce: found.commerce._id, role: "staff", active: true }).select("+pinHash +pinFailures +pinLockedUntil +tokenVersion");
  if (user?.pinLockedUntil && user.pinLockedUntil > new Date()) {
    throw new AppError(429, "PIN_LOCKED", "Muitas tentativas com PIN errado. Tente de novo em alguns minutos ou peça ao dono para trocar o PIN.");
  }
  const matches = await checkPassword(pin, user?.pinHash ?? (await dummyHash));
  if (!user?.pinHash || !matches) {
    if (user?.pinHash) {
      const failures = (user.pinFailures ?? 0) + 1;
      await User.updateOne(
        { _id: user._id },
        failures >= PIN_MAX_FAILURES ? { $set: { pinFailures: 0, pinLockedUntil: new Date(Date.now() + PIN_LOCK_MS) } } : { $set: { pinFailures: failures } }
      );
      if (failures >= PIN_MAX_FAILURES) {
        await audit({ ...req, user: { id: user._id, role: user.role } }, { action: "auth.pin_locked", commerce: found.commerce._id, entity: { type: "user", id: user._id }, changes: { device: found.device.name } });
      }
    }
    throw wrongPin();
  }
  await User.updateOne({ _id: user._id }, { $set: { pinFailures: 0, pinLockedUntil: null } });
  await Device.updateOne({ _id: found.device._id }, { $set: { lastUsedAt: new Date() } });
  startSession(res, user);
  await audit({ ...req, user: { id: user._id, role: user.role } }, { action: "auth.pin_login", commerce: found.commerce._id, entity: { type: "user", id: user._id }, changes: { device: found.device.name } });
  res.json({ user: await sessionView(user) });
};
