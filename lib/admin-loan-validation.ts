import { z } from "zod";

export const adminApplicationStatusSchema = z.enum([
  "borrador",
  "en_revision",
  "aprobado",
  "rechazado",
  "cancelado",
]);

export const documentReviewSchema = z
  .object({
    status: z.enum(["verificado", "rechazado"]),
    reason: z.string().trim().max(500).optional().default(""),
  })
  .superRefine((data, context) => {
    if (data.status === "rechazado" && data.reason.length < 5) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Escribe el motivo del rechazo del documento.",
      });
    }
  });

export const applicationDecisionSchema = z
  .object({
    action: z.enum(["aprobar", "rechazar"]),
    reason: z.string().trim().max(500).optional().default(""),
    notes: z.string().trim().max(1000).optional().default(""),
  })
  .superRefine((data, context) => {
    if (data.action === "rechazar" && data.reason.length < 10) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Explica el motivo del rechazo con al menos 10 caracteres.",
      });
    }
  });
