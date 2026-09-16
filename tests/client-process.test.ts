import { describe, expect, it } from "vitest";
import { getClientProcess } from "@/lib/client-process";

describe("proceso del cliente", () => {
  it("identifica una cuenta sin solicitud", () => {
    expect(getClientProcess({})).toMatchObject({ key: "cuenta", currentStep: 1 });
  });

  it("distingue solicitud y carga de documentos", () => {
    expect(getClientProcess({ applicationStatus: "borrador" }).key).toBe("solicitud");
    expect(
      getClientProcess({
        applicationStatus: "borrador",
        documentCount: 2,
        requiredDocumentCount: 4,
      }),
    ).toMatchObject({ key: "documentos", currentStep: 3 });
  });

  it("marca como lista una solicitud con todos los documentos verificados", () => {
    expect(
      getClientProcess({
        applicationStatus: "en_revision",
        verifiedDocumentCount: 4,
        requiredDocumentCount: 4,
      }),
    ).toMatchObject({ key: "revision", currentStep: 4 });
  });

  it.each([
    ["oferta_pendiente", null, "oferta_pendiente", 4],
    ["aprobado", "pendiente_desembolso", "autorizado", 5],
    ["aprobado", "activo", "activo", 6],
    ["aprobado", "liquidado", "liquidado", 6],
    ["rechazado", null, "rechazado", 4],
    ["cancelado", null, "cancelado", 4],
  ])(
    "mapea solicitud %s y crédito %s",
    (applicationStatus, loanStatus, expectedKey, expectedStep) => {
      expect(getClientProcess({ applicationStatus, loanStatus })).toMatchObject({
        key: expectedKey,
        currentStep: expectedStep,
      });
    },
  );
});
