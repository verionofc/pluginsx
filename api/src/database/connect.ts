import mongoose from "mongoose";
import { env } from "../env.js";
import { logger } from "../utils/logger.js";

let connectPromise: Promise<typeof mongoose> | null = null;

export async function connectDatabase() {
  if (mongoose.connection.readyState === 1) return mongoose;

  if (connectPromise) {
    await connectPromise;
    return mongoose;
  }

  connectPromise = mongoose.connect(env.MONGODB_URI, {
    dbName: env.MONGODB_DB_NAME,
  });

  try {
    await connectPromise;
    logger("MongoDB - database conectado com sucesso!");
    return mongoose;
  } catch (error: unknown) {
    connectPromise = null;
    const message =
      error instanceof Error ? error.message : "erro desconhecido";
    logger(`Ocorreu um erro com a Database:\n ${message}`);
    throw error;
  }
}

export function getDb() {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error("MongoDB ainda nao conectou.");
  }
  return db;
}
