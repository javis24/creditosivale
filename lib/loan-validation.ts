import { z } from "zod";

export const loanQuoteSchema = z.object({
  amount: z.coerce.number().positive(),
  termFortnights: z.coerce.number().int().positive(),
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
