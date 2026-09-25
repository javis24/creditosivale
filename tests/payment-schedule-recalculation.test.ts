import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("recalcular calendarios existentes", () => {
  const route = readFileSync(
    "app/api/admin/loans/[uuid]/schedule/route.ts",
    "utf8",
  );

  it("sólo permite corregir créditos activos sin pagos", () => {
    expect(route).toContain('loan.status !== "activo"');
    expect(route).toContain("Number(loan.amount_paid) !== 0");
    expect(route).toContain("status = 'aplicado'");
    expect(route).toContain("LOAN_SCHEDULE_HAS_PAYMENTS");
  });

  it("actualiza quincenas y fechas del crédito en una transacción", () => {
    expect(route).toContain("beginTransaction");
    expect(route).toContain("UPDATE loan_installments");
    expect(route).toContain("UPDATE loans");
    expect(route).toContain("first_due_date");
    expect(route).toContain("maturity_date");
    expect(route).toContain("commit");
  });
});
