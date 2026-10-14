import User from "../models/user.model.js";
import { audit, diffFields } from "../lib/audit.js";
import { conflict, notFound } from "../lib/errors.js";
import { hashPassword } from "../lib/passwords.js";

const memberNotFound = () => notFound("Pessoa da equipe não encontrada");
const emailTaken = () => conflict("EMAIL_TAKEN", "Esse e-mail já está em uso");
const entityOf = (user) => ({ type: "user", id: user._id });

// Lo que el panel ve de cada persona: nunca la contraseña ni la versión de la sesión.
const memberView = ({ _id, name, email, role, active, createdAt }) => ({ _id, name, email, role, active, createdAt });

// Solo empleados del local de la sesión: al dueño no se lo toca desde acá.
async function findStaff(req) {
  const user = await User.findOne({ _id: req.valid.params.id, commerce: req.commerce._id, role: "staff" }).select("+tokenVersion");
  if (!user) throw memberNotFound();
  return user;
}

export const listTeam = async (req, res) => {
  const members = await User.find({ commerce: req.commerce._id, role: { $in: ["owner", "staff"] } })
    .sort({ role: 1, name: 1 })
    .lean();
  res.json({ members: members.map(memberView) });
};

export const createMember = async (req, res) => {
  const { name, email, password } = req.valid.body;
  if (await User.exists({ email })) throw emailTaken();
  let member;
  try {
    member = await User.create({ name, email, role: "staff", commerce: req.commerce._id, passwordHash: await hashPassword(password) });
  } catch (error) {
    // Dos altas al mismo tiempo con el mismo e-mail.
    if (error.code === 11000) throw emailTaken();
    throw error;
  }
  await audit(req, { action: "team.member_created", entity: entityOf(member), changes: { name, email } });
  res.status(201).json({ member: memberView(member) });
};

// Cambiar el nombre o desactivar. Desactivado no entra más y pierde la sesión abierta.
export const updateMember = async (req, res) => {
  const member = await findStaff(req);
  const before = member.toObject();
  member.set(req.valid.body);
  if (before.active && member.active === false) member.tokenVersion += 1;
  await member.save();
  await audit(req, {
    action: "team.member_updated",
    entity: entityOf(member),
    changes: { email: member.email, ...diffFields(before, member.toObject(), ["name", "active"]) },
  });
  res.json({ member: memberView(member) });
};

// El dueño le pone una contraseña nueva al empleado que se la olvidó. Cierra sus sesiones.
export const resetMemberPassword = async (req, res) => {
  const member = await findStaff(req);
  member.passwordHash = await hashPassword(req.valid.body.password);
  member.tokenVersion += 1;
  await member.save();
  await audit(req, { action: "team.password_reset", entity: entityOf(member), changes: { email: member.email } });
  res.status(204).end();
};
