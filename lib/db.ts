import mysql, { type Pool } from "mysql2/promise";

declare global {
  var creditosivaleDbPool: Pool | undefined;
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Falta configurar la variable de entorno ${name}.`);
  }

  return value;
}

function createPool() {
  return mysql.createPool({
    host: requiredEnv("DB_HOST"),
    port: Number(process.env.DB_PORT || 3306),
    user: requiredEnv("DB_USER"),
    password: process.env.DB_PASSWORD || "",
    database: requiredEnv("DB_NAME"),
    waitForConnections: true,
    connectionLimit: process.env.NODE_ENV === "production" ? 5 : 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    decimalNumbers: true,
    dateStrings: true,
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: true } : undefined,
  });
}

export function getDb() {
  if (!global.creditosivaleDbPool) {
    global.creditosivaleDbPool = createPool();
  }

  return global.creditosivaleDbPool;
}
