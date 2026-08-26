import { createHash, createHmac } from "node:crypto";

export function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

export function privateIdentifierHash(value: string) {
  const secret = process.env.AUTH_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET debe tener al menos 32 caracteres.");
  }

  return createHmac("sha256", secret).update(value).digest("hex");
}

export function applicationEventHash(input: {
  applicationUuid: string;
  eventType: string;
  actorUserId: number;
  occurredAt: string;
  metadata?: unknown;
}) {
  return sha256(JSON.stringify(input));
}
