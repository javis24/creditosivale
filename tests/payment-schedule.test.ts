import { describe, expect, it } from "vitest";
import {
  buildFortnightSchedule,
  firstFortnightDueDate,
} from "@/lib/payment-schedule";

describe("calendario quincenal", () => {
  it.each([
    ["2026-09-01", "2026-09-15"],
    ["2026-09-14", "2026-09-15"],
    ["2026-09-15", "2026-09-30"],
    ["2026-09-23", "2026-09-30"],
    ["2026-09-29", "2026-09-30"],
    ["2026-09-30", "2026-10-15"],
    ["2026-10-31", "2026-11-15"],
    ["2026-12-31", "2027-01-15"],
  ])("calcula el primer vencimiento para %s", (disbursementDate, expected) => {
    expect(firstFortnightDueDate(disbursementDate)).toBe(expected);
  });

  it("usa el último día de febrero cuando no existe el día 30", () => {
    expect(firstFortnightDueDate("2028-02-15")).toBe("2028-02-29");
    expect(firstFortnightDueDate("2028-02-28")).toBe("2028-02-29");
    expect(firstFortnightDueDate("2028-02-29")).toBe("2028-03-15");
    expect(firstFortnightDueDate("2027-02-15")).toBe("2027-02-28");
    expect(firstFortnightDueDate("2027-02-28")).toBe("2027-03-15");
  });

  it("genera todas las quincenas, numeradas y con importes redondeados", () => {
    const schedule = buildFortnightSchedule("2026-09-23", 6, 451.005);

    expect(schedule).toHaveLength(6);
    expect(schedule.map((item) => item.installmentNumber)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(schedule.map((item) => item.dueDate)).toEqual([
      "2026-09-30",
      "2026-10-15",
      "2026-10-30",
      "2026-11-15",
      "2026-11-30",
      "2026-12-15",
    ]);
    expect(schedule.every((item) => item.amountDue === 451.01)).toBe(true);
  });

  it.each([
    ["2026-02-30", 10, 451],
    ["02/09/2026", 10, 451],
    ["2026-09-02", 0, 451],
    ["2026-09-02", 49, 451],
    ["2026-09-02", 10, 0],
  ])("rechaza un calendario inválido", (date, term, amount) => {
    expect(() => buildFortnightSchedule(date, term, amount)).toThrow();
  });
});
