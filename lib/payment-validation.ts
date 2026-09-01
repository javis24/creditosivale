import { z } from "zod";

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha debe tener el formato AAAA-MM-DD.")
  .refine((value) => {
    const date = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "La fecha no es válida.");

export const loanUuidSchema = z.string().uuid("El folio del crédito no es válido.");

export const loanStatusSchema = z.enum([
  "pendiente_desembolso",
  "activo",
  "liquidado",
  "cancelado",
]);

export const activateLoanSchema = z.object({
  disbursementDate: isoDateSchema,
});

export const registerPaymentSchema = z.object({
  amount: z.coerce
    .number()
    .finite()
    .positive("El pago debe ser mayor a cero.")
    .max(1_000_000, "El pago excede el límite permitido."),
  paymentDate: isoDateSchema,
  paymentMethod: z.enum(["efectivo", "transferencia", "deposito", "otro"]),
  reference: z.string().trim().max(120).default(""),
  notes: z.string().trim().max(500).default(""),
});

