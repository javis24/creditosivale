import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : path.endsWith(".ts") || path.endsWith(".tsx")
        ? [path]
        : [];
  });
}

describe("regresión de collations MySQL", () => {
  it("no compara parámetros de texto con literales dentro de CASE", () => {
    const offenders = sourceFiles("app/api").filter((path) => {
      const source = readFileSync(path, "utf8");
      return /WHEN\s+\?\s*=\s*['"][^'"]+['"]/i.test(source);
    });

    expect(
      offenders,
      "Ese patrón causó ER_CANT_AGGREGATE_2COLLATIONS en producción; calcula la condición en TypeScript y envía 0/1 a MySQL.",
    ).toEqual([]);
  });

  it("mantiene utf8mb4_unicode_ci en el esquema y las migraciones que crean tablas", () => {
    const files = [
      "database/schema.sql",
      "database/migration-003-loan-applications.sql",
      "database/migration-005-loans-and-payments.sql",
      "database/migration-008-payout-accounts.sql",
    ];

    for (const path of files) {
      const source = readFileSync(path, "utf8");
      const createCount = source.match(/CREATE TABLE/gi)?.length ?? 0;
      const collationCount = source.match(/COLLATE=utf8mb4_unicode_ci/gi)?.length ?? 0;
      expect(collationCount, `${path} debe declarar una collation por tabla`).toBe(createCount);
    }
  });
});
