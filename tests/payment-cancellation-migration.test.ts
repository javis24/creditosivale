import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("migración para cancelar pagos", () => {
  const migration = readFileSync(
    "database/migration-010-payment-cancellations.sql",
    "utf8",
  );
  const route = readFileSync(
    "app/api/admin/loans/[uuid]/payments/[paymentUuid]/route.ts",
    "utf8",
  );

  it("conserva auditoría del pago cancelado", () => {
    expect(migration).toContain("status ENUM('aplicado', 'cancelado')");
    expect(migration).toContain("cancellation_reason");
    expect(migration).toContain("cancelled_by");
    expect(route).not.toMatch(/DELETE\s+FROM\s+loan_payments/i);
  });

  it("revierte quincenas y recalcula el crédito dentro de una transacción", () => {
    expect(route).toContain("beginTransaction");
    expect(route).toContain("loan_payment_allocations");
    expect(route).toContain("UPDATE loan_installments");
    expect(route).toContain("SUM(amount)");
    expect(route).toContain("UPDATE loans");
    expect(route).toContain("commit");
  });
});
