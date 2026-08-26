import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { hash } from "bcryptjs";
import mysql from "mysql2/promise";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta ${name} en .env.local`);
  return value;
};

const rl = createInterface({ input, output });
let connection;

try {
  const firstName = (await rl.question("Nombre(s) del administrador: ")).trim();
  const paternalLastName = (await rl.question("Apellido paterno: ")).trim();
  const maternalLastName = (await rl.question("Apellido materno (opcional): ")).trim();
  const email = (await rl.question("Correo: ")).trim().toLowerCase();
  const phone = (await rl.question("Teléfono (opcional): ")).trim();
  const password = await rl.question("Contraseña (mínimo 8 caracteres, mayúscula, minúscula y número): ");

  if (!firstName || !paternalLastName || !/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error("Nombre, apellido o correo no válidos.");
  }

  if (
    password.length < 8 ||
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/[0-9]/.test(password)
  ) {
    throw new Error("La contraseña no cumple los requisitos de seguridad.");
  }

  connection = await mysql.createConnection({
    host: required("DB_HOST"),
    port: Number(process.env.DB_PORT || 3306),
    user: required("DB_USER"),
    password: process.env.DB_PASSWORD || "",
    database: required("DB_NAME"),
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: true } : undefined,
  });

  const [existing] = await connection.execute(
    "SELECT id FROM users WHERE email = ? LIMIT 1",
    [email],
  );

  if (existing.length) {
    throw new Error("Ya existe un usuario con ese correo.");
  }

  const passwordHash = await hash(password, 12);
  await connection.execute(
    `INSERT INTO users (
      uuid, first_name, paternal_last_name, maternal_last_name,
      email, phone, password_hash, role, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'admin', 'activo')`,
    [
      randomUUID(),
      firstName,
      paternalLastName,
      maternalLastName || null,
      email,
      phone || null,
      passwordHash,
    ],
  );

  console.log(`\nAdministrador creado: ${email}`);
} catch (error) {
  console.error(`\nNo se pudo crear el administrador: ${error.message}`);
  process.exitCode = 1;
} finally {
  await connection?.end();
  rl.close();
}
