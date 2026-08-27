export function normalizeMexicanWhatsapp(value: string) {
  const digits = value.replace(/\D/g, "");

  // Formato anterior: +52 1 871 123 4567
  if (digits.length === 13 && digits.startsWith("521")) {
    return digits.slice(3);
  }

  // Formato actual: +52 871 123 4567
  if (digits.length === 12 && digits.startsWith("52")) {
    return digits.slice(2);
  }

  return digits;
}

export function whatsappLookupCandidates(value: string) {
  const normalized = normalizeMexicanWhatsapp(value);

  return [
    normalized,
    `52${normalized}`,
    `521${normalized}`,
  ];
}