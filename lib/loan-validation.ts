import { z } from "zod";

export const loanQuoteSchema = z.object({
  amount: z.coerce
    .number()
    .int()
    .min(1000, "El monto mínimo es de $1,000.")
    .max(8000, "El monto máximo es de $8,000.")
    .refine((amount) => amount % 500 === 0, {
      message: "El monto debe avanzar en cantidades de $500.",
    }),
  termFortnights: z.coerce.number().pipe(z.union([
    z.literal(6),
    z.literal(8),
    z.literal(10),
    z.literal(12),
  ])),
  purpose: z
    .string()
    .trim()
    .min(5, "Explica brevemente para qué necesitas el préstamo.")
    .max(300),
});

export const applicationUuidSchema = z.uuid(
  "La solicitud no tiene un identificador válido.",
);

export const documentTypeSchema = z.enum([
  "ine_front",
  "ine_back",
  "face_photo",
  "address_proof",
  "signature",
]);

export type DocumentType = z.infer<typeof documentTypeSchema>;

export const promissoryNoteHashSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "El pagaré no es válido.");

export const submitApplicationSchema = z.object({
  privacyConsent: z.literal(true, {
    error: "Debes aceptar el aviso de privacidad.",
  }),
  biometricConsent: z.literal(true, {
    error: "Debes autorizar expresamente el tratamiento de la fotografía facial.",
  }),
  promissoryAccepted: z.literal(true, {
    error: "Debes aceptar los términos y firmar el documento.",
  }),
  noteHash: promissoryNoteHashSchema,
});

export const submitInitialApplicationSchema = z.object({
  privacyConsent: z.literal(true, {
    error: "Debes aceptar el aviso de privacidad.",
  }),
  biometricConsent: z.literal(true, {
    error: "Debes autorizar expresamente el tratamiento de la fotografía facial.",
  }),
});
