import { describe, expect, it } from "vitest";
import {
  normalizeMexicanWhatsapp,
  whatsappLookupCandidates,
} from "@/lib/phone";

describe("números de WhatsApp mexicanos", () => {
  it.each([
    ["871 986 2455", "8719862455"],
    ["+52 871 986 2455", "8719862455"],
    ["+52 1 871 986 2455", "8719862455"],
    ["(871) 986-2455", "8719862455"],
  ])("normaliza %s", (input, expected) => {
    expect(normalizeMexicanWhatsapp(input)).toBe(expected);
  });

  it("crea variantes compatibles con registros antiguos", () => {
    expect(whatsappLookupCandidates("+52 871 986 2455")).toEqual([
      "8719862455",
      "528719862455",
      "5218719862455",
    ]);
  });
});
