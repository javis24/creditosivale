import { describe, expect, it } from "vitest";
import {
  activateLoanSchema,
  loanStatusSchema,
  loanUuidSchema,
  registerPaymentSchema,
} from "@/lib/payment-validation";

describe("validación de créditos y pagos", () => {
  it("acepta el folio UUID y los estados conocidos", () => {
    expect(loanUuidSchema.parse("f0698cf7-d571-4321-be15-175d6e96b556")).toBe(
      "f0698cf7-d571-4321-be15-175d6e96b556",
    );
    expect(loanStatusSchema.options).toEqual([
      "pendiente_desembolso",
      "activo",
      "liquidado",
      "cancelado",
    ]);
  });

  it("rechaza folios y fechas inexistentes", () => {
    expect(loanUuidSchema.safeParse("folio-invalido").success).toBe(false);
    expect(activateLoanSchema.safeParse({ disbursementDate: "2026-02-30" }).success).toBe(false);
  });

  it("normaliza un pago recibido desde un formulario", () => {
    const result = registerPaymentSchema.parse({
      amount: "451.00",
      paymentDate: "2026-09-15",
      paymentMethod: "transferencia",
      reference: " SPEI 123 ",
      notes: " Pago puntual ",
    });

    expect(result).toEqual({
      amount: 451,
      paymentDate: "2026-09-15",
      paymentMethod: "transferencia",
      reference: "SPEI 123",
      notes: "Pago puntual",
    });
  });

  it.each([0, -1, 1_000_001, "texto"])("rechaza el monto inválido %s", (amount) => {
    expect(
      registerPaymentSchema.safeParse({
        amount,
        paymentDate: "2026-09-15",
        paymentMethod: "efectivo",
      }).success,
    ).toBe(false);
  });

  it("rechaza métodos de pago desconocidos", () => {
    expect(
      registerPaymentSchema.safeParse({
        amount: 451,
        paymentDate: "2026-09-15",
        paymentMethod: "tarjeta",
      }).success,
    ).toBe(false);
  });
});
