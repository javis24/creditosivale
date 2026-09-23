import { describe, expect, it } from "vitest";
import {
  calculateLoanAfterCancellation,
  reverseInstallmentAllocation,
} from "@/lib/payment-cancellation";

describe("cancelación de pagos", () => {
  it("regresa una quincena pagada a pendiente", () => {
    expect(
      reverseInstallmentAllocation({
        amountDue: 307,
        amountPaid: 307,
        allocationAmount: 307,
      }),
    ).toEqual({ amountPaid: 0, status: "pendiente" });
  });

  it("conserva como parcial el importe que sigue aplicado", () => {
    expect(
      reverseInstallmentAllocation({
        amountDue: 307,
        amountPaid: 307,
        allocationAmount: 107,
      }),
    ).toEqual({ amountPaid: 200, status: "parcial" });
  });

  it("rechaza una reversión mayor al pago de la quincena", () => {
    expect(() =>
      reverseInstallmentAllocation({
        amountDue: 307,
        amountPaid: 100,
        allocationAmount: 101,
      }),
    ).toThrow("supera lo pagado");
  });

  it("reactiva un crédito liquidado al cancelar un pago", () => {
    expect(
      calculateLoanAfterCancellation({ totalDue: 3_070, appliedPayments: 2_763 }),
    ).toEqual({
      amountPaid: 2_763,
      balance: 307,
      status: "activo",
    });
  });
});
