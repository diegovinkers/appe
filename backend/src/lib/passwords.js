import bcrypt from "bcryptjs";
import { config } from "../config.js";

export const hashPassword = (password) => bcrypt.hash(password, config.BCRYPT_ROUNDS);

export const checkPassword = (password, hash) => bcrypt.compare(password, hash);
