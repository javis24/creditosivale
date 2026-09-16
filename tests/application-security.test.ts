import { afterEach, describe, expect, it } from "vitest";
import {
  applicationEventHash,
  privateIdentifierHash,
  sha256,
} from "@/lib/application-security";

const previousSecret = process.env.AUTH_SECRET;

afterEach(() => {
  if (previousSecret === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = previousSecret;
});

describe("integridad de solicitudes", () => {
  it("produce SHA-256 estable", () => {
    expect(sha256("Crédito Sí Vale")).toMatch(/^[a-f0-9]{64}$/);
    expect(sha256("Crédito Sí Vale")).toBe(sha256("Crédito Sí Vale"));
  });

  it("no permite crear identificadores privados con una llave débil", () => {
    process.env.AUTH_SECRET = "corta";
    expect(() => privateIdentifierHash("127.0.0.1")).toThrow(
      "AUTH_SECRET debe tener al menos 32 caracteres.",
    );
  });

  it("cambia el hash cuando cambia un dato del evento", () => {
    const base = {
      applicationUuid: "29bdf356-f2b0-420e-8be6-083e0e6478cf",
      eventType: "application_submitted",
      actorUserId: 11,
      occurredAt: "2026-09-15T12:00:00.000Z",
      metadata: { amount: 3000 },
    };

    expect(applicationEventHash(base)).not.toBe(
      applicationEventHash({ ...base, metadata: { amount: 3500 } }),
    );
  });
});
