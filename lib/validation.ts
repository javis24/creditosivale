import { z } from "zod";
import { roles } from "@/types/auth";

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().max(max).nullable().optional(),
  );

const optionalEmail = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.email("Escribe un correo válido.").trim().toLowerCase().nullable().optional(),
);

const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()-]{10,20}$/, "Escribe un teléfono válido.");

const password = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres.")
  .max(72)
  .regex(/[a-z]/, "Incluye una letra minúscula.")
  .regex(/[A-Z]/, "Incluye una letra mayúscula.")
  .regex(/[0-9]/, "Incluye un número.");

function isAdult(dateText: string) {
  const birthDate = new Date(`${dateText}T00:00:00`);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDifference = today.getMonth() - birthDate.getMonth();

  if (
    monthDifference < 0 ||
    (monthDifference === 0 && today.getDate() < birthDate.getDate())
  ) {
    age -= 1;
  }

  return Number.isFinite(age) && age >= 18 && age <= 100;
}

export const loginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(5, "Escribe tu número de WhatsApp o correo."),
  password: z.string().min(1, "Escribe tu contraseña.").max(72),
});

export const publicRegisterSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(5, "Escribe el nombre completo.")
    .max(250),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Selecciona la fecha de nacimiento.")
    .refine(isAdult, "Debes tener entre 18 y 100 años."),
  address: z
    .string()
    .trim()
    .min(10, "Escribe la dirección completa.")
    .max(500),
  whatsapp: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{10,20}$/, "Escribe un número de WhatsApp válido."),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{5}$/, "El código postal debe tener 5 dígitos."),
  password,
});

const accountFields = {
  firstName: z.string().trim().min(2, "Escribe el nombre.").max(100),
  paternalLastName: z.string().trim().min(2, "Escribe el apellido paterno.").max(100),
  maternalLastName: optionalText(100),
  email: z.email("Escribe un correo válido.").trim().toLowerCase(),
  phone,
  password,
};

const clientFields = {
  ...accountFields,
  role: z.literal("cliente"),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Selecciona la fecha de nacimiento.")
    .refine(isAdult, "El cliente debe tener entre 18 y 100 años."),
  curp: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z][AEIOUX][A-Z]{2}\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[HM][A-Z]{5}[A-Z0-9]\d$/, "La CURP no tiene un formato válido.")
      .nullable()
      .optional(),
  ),
  rfc: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/, "El RFC no tiene un formato válido.")
      .nullable()
      .optional(),
  ),
  ineNumber: optionalText(30),
  gender: z.enum(["mujer", "hombre", "no_especificado"]),
  maritalStatus: z.enum([
    "soltero",
    "casado",
    "union_libre",
    "divorciado",
    "viudo",
    "otro",
  ]),
  occupation: z.string().trim().min(2, "Escribe la ocupación.").max(150),
  companyName: optionalText(190),
  monthlyIncome: z.coerce
    .number()
    .min(0, "El ingreso no puede ser negativo.")
    .max(9999999999.99),
  street: z.string().trim().min(2, "Escribe la calle.").max(190),
  exteriorNumber: z.string().trim().min(1, "Escribe el número exterior.").max(20),
  interiorNumber: optionalText(20),
  neighborhood: z.string().trim().min(2, "Escribe la colonia.").max(150),
  postalCode: z.string().trim().regex(/^\d{5}$/, "El código postal debe tener 5 dígitos."),
  city: z.string().trim().min(2, "Escribe la ciudad.").max(120),
  state: z.string().trim().min(2, "Escribe el estado.").max(120),
  country: z.string().trim().min(2).max(80).default("México"),
  emergencyContactName: optionalText(190),
  emergencyContactPhone: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    phone.nullable().optional(),
  ),
  notes: optionalText(2000),
};

const staffFields = {
  ...accountFields,
  role: z.enum(["admin", "gerencia", "vendedor"]),
};

export const createUserSchema = z.discriminatedUnion("role", [
  z.object(clientFields),
  z.object(staffFields),
]);

export const listUsersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).default(""),
  role: z.enum(roles).optional(),
});

export const updateClientSchema = z.object({
  firstName: z.string().trim().min(2, "Escribe el nombre.").max(100),
  paternalLastName: z.string().trim().max(100).default(""),
  maternalLastName: optionalText(100),
  email: optionalEmail,
  phone,
  status: z.enum(["activo", "inactivo", "bloqueado"]),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Selecciona la fecha de nacimiento.")
    .refine(isAdult, "El cliente debe tener entre 18 y 100 años."),
  curp: clientFields.curp,
  rfc: clientFields.rfc,
  ineNumber: clientFields.ineNumber,
  gender: clientFields.gender,
  maritalStatus: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    clientFields.maritalStatus.nullable().optional(),
  ),
  occupation: optionalText(150),
  companyName: clientFields.companyName,
  monthlyIncome: z.coerce
    .number()
    .min(0, "El ingreso no puede ser negativo.")
    .max(9999999999.99),
  address: optionalText(500),
  street: optionalText(190),
  exteriorNumber: optionalText(20),
  interiorNumber: clientFields.interiorNumber,
  neighborhood: optionalText(150),
  postalCode: clientFields.postalCode,
  city: optionalText(120),
  state: optionalText(120),
  country: z.string().trim().min(2).max(80).default("México"),
  emergencyContactName: clientFields.emergencyContactName,
  emergencyContactPhone: clientFields.emergencyContactPhone,
  notes: clientFields.notes,
});

export const deleteClientSchema = z.object({
  confirmation: z.literal("ELIMINAR", {
    error: "Escribe ELIMINAR para confirmar.",
  }),
});

export const uuidSchema = z.uuid("El identificador no es válido.");
