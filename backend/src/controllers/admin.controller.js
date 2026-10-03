import AuditLog from "../models/auditLog.model.js";
import Commerce from "../models/commerce.model.js";
import User from "../models/user.model.js";
import { audit, diffFields } from "../lib/audit.js";
import { conflict, notFound } from "../lib/errors.js";
import { hashPassword } from "../lib/passwords.js";

const slugTaken = () => conflict("SLUG_TAKEN", "Esse endereço já está em uso");
const commerceEntity = (commerce) => ({ type: "commerce", id: commerce._id });

export const createCommerce = async (req, res) => {
  const { commerce: commerceData, owner: ownerData } = req.valid.body;
  if (await Commerce.exists({ slug: commerceData.slug })) throw slugTaken();
  if (await User.exists({ email: ownerData.email })) {
    throw conflict("EMAIL_TAKEN", "Esse e-mail já está em uso");
  }

  const commerce = await Commerce.create(commerceData);
  let owner;
  try {
    owner = await User.create({
      name: ownerData.name,
      email: ownerData.email,
      role: "owner",
      commerce: commerce._id,
      passwordHash: await hashPassword(ownerData.password),
    });
  } catch (error) {
    // Si falla el dueño, se borra el local para no dejarlo huérfano.
    await Commerce.deleteOne({ _id: commerce._id });
    throw error;
  }

  await audit(req, {
    action: "admin.commerce_created",
    commerce: commerce._id,
    entity: commerceEntity(commerce),
    changes: { slug: commerce.slug, owner: owner.email },
  });
  res.status(201).json({ commerce, owner });
};

export const listCommerces = async (req, res) => {
  const commerces = await Commerce.find().sort({ createdAt: -1 }).lean();
  const owners = await User.find({ role: "owner", commerce: { $in: commerces.map((c) => c._id) } })
    .select("name email active commerce")
    .lean();

  res.json({
    commerces: commerces.map((commerce) => ({
      ...commerce,
      owners: owners
        .filter((owner) => String(owner.commerce) === String(commerce._id))
        .map(({ _id, name, email, active }) => ({ _id, name, email, active })),
    })),
  });
};

export const updateCommerce = async (req, res) => {
  const { id } = req.valid.params;
  const changes = req.valid.body;
  if (changes.slug && (await Commerce.exists({ slug: changes.slug, _id: { $ne: id } }))) throw slugTaken();

  const commerce = await Commerce.findById(id);
  if (!commerce) throw notFound("Estabelecimento não encontrado");
  const before = commerce.toObject();
  commerce.set(changes);
  await commerce.save();

  await audit(req, {
    action: "admin.commerce_updated",
    commerce: commerce._id,
    entity: commerceEntity(commerce),
    changes: diffFields(before, commerce.toObject(), Object.keys(changes)),
  });
  res.json({ commerce });
};

// Para cuando un dueño se olvida la contraseña. Cierra sus sesiones abiertas.
export const resetOwnerPassword = async (req, res) => {
  const user = await User.findOne({ _id: req.valid.params.id, role: "owner" }).select("+tokenVersion");
  if (!user) throw notFound("Usuário não encontrado");

  user.passwordHash = await hashPassword(req.valid.body.password);
  user.tokenVersion += 1;
  await user.save();

  await audit(req, {
    action: "admin.password_reset",
    commerce: user.commerce,
    entity: { type: "user", id: user._id },
    changes: { email: user.email },
  });
  res.status(204).end();
};

// Registro de auditoría de toda la plataforma, del más nuevo al más viejo.
export const listAudit = async (req, res) => {
  const { commerce, action, limit } = req.valid.query;
  const filter = {};
  if (commerce) filter.commerce = commerce;
  if (action) filter.action = action;
  const entries = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
  res.json({ entries });
};
