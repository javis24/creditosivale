import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { z } from "zod";
import { ApiError } from "@/lib/api-error";

const ALGORITHM = "aes-256-gcm";
const AAD = Buffer.from("creditosivale:payout-clabe:v1", "utf8");
const CLABE_WEIGHTS = [3, 7, 1];

export function normalizeClabe(value: string) {
  return value.replace(/\D/g, "");
}

export function isValidClabe(value: string) {
  const clabe = normalizeClabe(value);
  if (!/^\d{18}$/.test(clabe)) return false;

  const sum = clabe
    .slice(0, 17)
    .split("")
    .reduce(
      (total, digit, index) =>
        total + (Number(digit) * CLABE_WEIGHTS[index % 3]) % 10,
      0,
    );
  const expectedCheckDigit = (10 - (sum % 10)) % 10;
  return expectedCheckDigit === Number(clabe[17]);
}

export const payoutAccountSchema = z.object({
  bankName: z.string().trim().min(2, "Escribe el nombre del banco.").max(120),
  accountHolder: z
    .string()
    .trim()
    .min(5, "Escribe el nombre completo del titular.")
    .max(190),
  clabe: z
    .string()
    .transform(normalizeClabe)
    .refine((value) => /^\d{18}$/.test(value), {
      message: "La CLABE debe tener exactamente 18 dígitos.",
    })
    .refine(isValidClabe, {
      message: "La CLABE no es válida. Verifica los 18 dígitos.",
    }),
  ownershipConsent: z.literal(true, {
    error: "Confirma que la cuenta pertenece al cliente.",
  }),
});

function encryptionKey() {
  const encoded = process.env.BANK_DATA_ENCRYPTION_KEY?.trim();
  if (!encoded || encoded.startsWith("CAMBIA_")) {
    throw new ApiError(
      503,
      "Falta configurar BANK_DATA_ENCRYPTION_KEY.",
      "BANK_ENCRYPTION_NOT_CONFIGURED",
    );
  }

  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new ApiError(
      503,
      "BANK_DATA_ENCRYPTION_KEY debe ser una clave Base64 de 32 bytes.",
      "INVALID_BANK_ENCRYPTION_KEY",
    );
  }
  return key;
}

export function encryptClabe(clabe: string) {
  const normalized = normalizeClabe(clabe);
  if (!isValidClabe(normalized)) {
    throw new ApiError(400, "La CLABE no es válida.", "INVALID_CLABE");
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([
    cipher.update(normalized, "utf8"),
    cipher.final(),
  ]);

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    last4: normalized.slice(-4),
  };
}

export function decryptClabe(input: {
  ciphertext: string;
  iv: string;
  authTag: string;
}) {
  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      encryptionKey(),
      Buffer.from(input.iv, "base64"),
    );
    decipher.setAAD(AAD);
    decipher.setAuthTag(Buffer.from(input.authTag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(input.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      500,
      "No fue posible descifrar la cuenta de depósito.",
      "BANK_DATA_DECRYPTION_FAILED",
    );
  }
}

export function maskedClabe(last4: string) {
  return `•••• •••• •••• ••${last4}`;
}
