import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applicationDecisionSchema } from "@/lib/admin-loan-validation";
import { loanQuoteSchema } from "@/lib/loan-validation";

describe("solicitudes y contraofertas", () => {
  it.each([1000, 1500, 6000, 6500, 8000])(
    "permite solicitar %s pesos",
    (amount) => {
      expect(
        loanQuoteSchema.parse({
          amount,
          termFortnights: 12,
          purpose: "Capital para mi negocio",
        }).amount,
      ).toBe(amount);
    },
  );

  it.each([500, 1250, 8500])("rechaza el monto inválido %s", (amount) => {
    expect(() =>
      loanQuoteSchema.parse({
        amount,
        termFortnights: 8,
        purpose: "Capital para mi negocio",
      }),
    ).toThrow();
  });

  it("exige monto y plazo cuando el administrador crea una oferta", () => {
    expect(() => applicationDecisionSchema.parse({ action: "ofertar" })).toThrow();
    expect(
      applicationDecisionSchema.parse({
        action: "ofertar",
        offeredAmount: 6000,
        offeredTermFortnights: 12,
      }),
    ).toMatchObject({
      action: "ofertar",
      offeredAmount: 6000,
      offeredTermFortnights: 12,
    });
  });

  it("la migración conserva solicitudes anteriores y agrega oferta pendiente", () => {
    const sql = readFileSync("database/migration-007-counteroffers.sql", "utf8");
    expect(sql).toContain("'oferta_pendiente'");
    expect(sql).toContain("flow_version");
    expect(sql).toContain("offered_amount");
    expect(sql).toContain("offer_accepted_at");
  });
});
