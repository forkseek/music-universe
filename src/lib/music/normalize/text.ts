/** Presentation keeps case; only lookup keys are lowercased. */
export function displayText(value: string): string {
  return value.normalize("NFKC").replace(/[\u200b-\u200d\ufeff]/gu, "").replace(/\s+/gu, " ").trim();
}

export function matchText(value: string): string {
  return displayText(value).toLowerCase().replace(/[’‘]/gu, "'");
}

export function normalizeIsrc(value: string): string | undefined {
  const cleaned = value.replace(/[-\s]/gu, "").toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/u.test(cleaned) ? cleaned : undefined;
}
