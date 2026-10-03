import mongoose from "mongoose";
import { config } from "./config.js";

// Todas las colecciones viven en la base app-pedidos del cluster.
export const DB_NAME = "app-pedidos";

const connectDB = () => mongoose.connect(config.MONGO_URI, { dbName: DB_NAME });

export default connectDB;
