import User from "../models/user.model.js";
import Commerce from "../models/commerce.model.js";
import { AppError, badRequest } from "../lib/errors.js";
import { checkPassword, hashPassword } from "../lib/passwords.js";
import { endSession, startSession } from "../lib/session.js";

// Se compara contra este hash cuando el email no existe: así la respuesta tarda
// lo mismo y no revela qué emails están registrados.
const dummyHash = hashPassword("senha-que-nao-existe");

const invalidCredentials = () => new AppError(401, "INVALID_CREDENTIALS", "E-mail ou senha incorretos");

// Lo que el front necesita saber de la sesión. Nunca incluye passwordHash ni tokenVersion.
async function sessionView(user) {
  const commerce = user.commerce
    ? await Commerce.findById(user.commerce).select("name slug status")
    : null;
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    commerce: commerce && {
      _id: commerce._id,
      name: commerce.name,
      slug: commerce.slug,
      status: commerce.status,
    },
  };
}

export const login = async (req, res) => {
  const { email, password } = req.valid.body;
  const user = await User.findOne({ email }).select("+passwordHash +tokenVersion");
  const matches = await checkPassword(password, user?.passwordHash ?? (await dummyHash));
  if (!user || !matches || !user.active) throw invalidCredentials();

  startSession(res, user);
  res.json({ user: await sessionView(user) });
};

export const logout = (req, res) => {
  endSession(res);
  res.status(204).end();
};

export const me = async (req, res) => {
  const user = await User.findById(req.user.id);
  res.json({ user: await sessionView(user) });
};

// Cambiar la contraseña cierra las otras sesiones; esta sigue abierta con un token nuevo.
export const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.valid.body;
  const user = await User.findById(req.user.id).select("+passwordHash +tokenVersion");
  if (!(await checkPassword(currentPassword, user.passwordHash))) {
    throw badRequest("INVALID_PASSWORD", "A senha atual está incorreta");
  }

  user.passwordHash = await hashPassword(newPassword);
  user.tokenVersion += 1;
  await user.save();

  startSession(res, user);
  res.status(204).end();
};
