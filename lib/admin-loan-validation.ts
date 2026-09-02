import { z } from "zod";

export const adminApplicationStatusSchema = z.enum([
  "borrador",
  "en_revision",
  "oferta_pendiente",
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
    action: z.enum(["aprobar", "ofertar", "rechazar"]),
    reason: z.string().trim().max(500).optional().default(""),
    notes: z.string().trim().max(1000).optional().default(""),
    offeredAmount: z.coerce.number().positive().optional(),
    offeredTermFortnights: z.coerce.number().int().positive().optional(),
  })
  .superRefine((data, context) => {
    if (data.action === "rechazar" && data.reason.length < 10) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Explica el motivo del rechazo con al menos 10 caracteres.",
      });
    }

    if (data.action === "ofertar") {
      if (!data.offeredAmount) {
        context.addIssue({
          code: "custom",
          path: ["offeredAmount"],
          message: "Selecciona el monto que puedes ofrecer.",
        });
      }

      if (![6, 8, 10, 12].includes(data.offeredTermFortnights || 0)) {
        context.addIssue({
          code: "custom",
          path: ["offeredTermFortnights"],
          message: "Selecciona un plazo disponible.",
        });
      }
    }
  });
