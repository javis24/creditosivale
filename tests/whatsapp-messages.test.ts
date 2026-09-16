import { describe, expect, it } from "vitest";
import { buildProcessWhatsAppMessage } from "@/lib/whatsapp-messages";

describe("mensajes de WhatsApp por proceso", () => {
  it("recuerda completar una solicitud", () => {
    expect(
      buildProcessWhatsAppMessage({
        process: "solicitud",
        clientName: "María de los Ángeles",
      }),
    ).toContain("Hola María");
  });

  it("incluye monto, pago y plazo de una oferta", () => {
    const message = buildProcessWhatsAppMessage({
      process: "oferta_pendiente",
      clientName: "Karla García",
      amount: 3000,
      installmentAmount: 451,
      termFortnights: 10,
    });

    expect(message).toContain("$3,000.00");
    expect(message).toContain("$451.00");
    expect(message).toContain("10 quincenas");
  });

  it("incluye número y fecha del próximo pago", () => {
    const message = buildProcessWhatsAppMessage({
      process: "activo",
      clientName: "Luis Martínez",
      installmentAmount: 875,
      installmentNumber: 2,
      termFortnights: 10,
      dueDate: "2026-09-30",
    });

    expect(message).toContain("pago 2 de 10");
    expect(message).toContain("$875.00");
    expect(message).toContain("30 de septiembre de 2026");
  });

  it("avisa que un crédito liquidado permite solicitar otro", () => {
    expect(
      buildProcessWhatsAppMessage({
        process: "liquidado",
        clientName: "Sandra Ríos",
      }),
    ).toContain("solicitar un nuevo préstamo");
  });
});
