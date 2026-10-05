/**
 * Leitweg-ID: the routing identifier German public buyers publish for XRechnung (sent as Buyer
 * reference, BT-10). Format: coarse address (2–12 digits), optional fine address (up to 30 letters
 * or digits), check digits (2 digits), separated by hyphens. The check digits follow ISO/IEC 7064
 * MOD 97-10, like an IBAN.
 */

const LEITWEG_RE = /^(\d{2,12})(?:-([A-Za-z0-9]{1,30}))?-(\d{2})$/;

export interface LeitwegId {
  coarse: string;
  fine?: string;
  checkDigits: string;
}

/** Parses a Leitweg-ID without checking its check digits. Returns undefined if the format is wrong. */
export function parseLeitwegId(value: string): LeitwegId | undefined {
  const m = LEITWEG_RE.exec(value.trim());
  if (!m) return undefined;
  return { coarse: m[1] as string, ...(m[2] ? { fine: m[2] } : {}), checkDigits: m[3] as string };
}

function mod97(digits: string): number {
  let rest = 0;
  for (const ch of digits) rest = (rest * 10 + Number(ch)) % 97;
  return rest;
}

function toDigits(s: string): string {
  return s.toUpperCase().replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
}

/** True when the value is a well-formed Leitweg-ID with correct check digits. */
export function isValidLeitwegId(value: string): boolean {
  const id = parseLeitwegId(value);
  if (!id) return false;
  return mod97(toDigits(`${id.coarse}${id.fine ?? ""}${id.checkDigits}`)) === 1;
}

/** Computes the check digits for a coarse and optional fine address. */
export function leitwegCheckDigits(coarse: string, fine = ""): string {
  const rest = mod97(toDigits(`${coarse}${fine}00`));
  return String(98 - rest).padStart(2, "0");
}

/** True when the value has the shape of a Leitweg-ID (used to decide whether to check it). */
export function looksLikeLeitwegId(value: string): boolean {
  return LEITWEG_RE.test(value.trim());
}
