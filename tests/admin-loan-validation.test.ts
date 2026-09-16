import { describe, expect, it } from "vitest";
import {
  applicationDecisionSchema,
  documentReviewSchema,
} from "@/lib/admin-loan-validation";

describe("decisiones del administrador", () => {
  it("permite verificar un documento sin motivo", () => {
    expect(documentReviewSchema.parse({ status: "verificado" })).toEqual({
      status: "verificado",
      reason: "",
    });
  });

  it("exige un motivo al rechazar un documento", () => {
    expect(documentReviewSchema.safeParse({ status: "rechazado", reason: "mal" }).success).toBe(false);
    expect(
      documentReviewSchema.safeParse({
        status: "rechazado",
        reason: "La imagen no es legible.",
      }).success,
    ).toBe(true);
  });

  it("exige explicación suficiente al rechazar una solicitud", () => {
    expect(applicationDecisionSchema.safeParse({ action: "rechazar", reason: "No" }).success).toBe(false);
    expect(
      applicationDecisionSchema.safeParse({
        action: "rechazar",
        reason: "No cumple con la evaluación interna.",
      }).success,
    ).toBe(true);
  });

  it("rechaza una contraoferta con plazo no permitido", () => {
    expect(
      applicationDecisionSchema.safeParse({
        action: "ofertar",
        offeredAmount: 3000,
        offeredTermFortnights: 9,
      }).success,
    ).toBe(false);
  });
});
