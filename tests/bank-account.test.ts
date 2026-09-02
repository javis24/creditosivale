import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  decryptClabe,
  encryptClabe,
  isValidClabe,
  maskedClabe,
  payoutAccountSchema,
} from "../lib/bank-account";

const previousKey = process.env.BANK_DATA_ENCRYPTION_KEY;

function clabeWithCheckDigit(first17Digits: string) {
  const weights = [3, 7, 1];
  const sum = first17Digits.split("").reduce(
    (total, digit, index) =>
      total + (Number(digit) * weights[index % weights.length]) % 10,
    0,
  );
  return `${first17Digits}${(10 - (sum % 10)) % 10}`;
}

const validClabe = clabeWithCheckDigit("01218000123456789");

beforeAll(() => {
  process.env.BANK_DATA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

afterAll(() => {
  if (previousKey === undefined) {
    delete process.env.BANK_DATA_ENCRYPTION_KEY;
  } else {
    process.env.BANK_DATA_ENCRYPTION_KEY = previousKey;
  }
});

describe("CLABE de depósito", () => {
  it("acepta una CLABE con dígito verificador correcto", () => {
    expect(validClabe).toHaveLength(18);
    expect(isValidClabe(validClabe)).toBe(true);
  });

  it("rechaza una CLABE con dígito verificador incorrecto", () => {
    const wrongLastDigit = validClabe.endsWith("9") ? "0" : "9";
    expect(isValidClabe(`${validClabe.slice(0, -1)}${wrongLastDigit}`)).toBe(false);
  });

  it("normaliza espacios al validar el formulario", () => {
    const spacedClabe = validClabe.replace(/(\d{3})(?=\d)/g, "$1 ");
    const result = payoutAccountSchema.parse({
      bankName: "Banco de prueba",
      accountHolder: "Cliente de Prueba",
      clabe: spacedClabe,
      ownershipConsent: true,
    });
    expect(result.clabe).toBe(validClabe);
  });

  it("cifra y descifra sin guardar la CLABE en texto plano", () => {
    const encrypted = encryptClabe(validClabe);
    expect(encrypted.ciphertext).not.toContain(validClabe);
    expect(encrypted.last4).toBe(validClabe.slice(-4));
    expect(decryptClabe(encrypted)).toBe(validClabe);
    expect(maskedClabe(encrypted.last4)).not.toContain(validClabe.slice(0, 14));
  });
});
