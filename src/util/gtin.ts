/**
 * Barcode numbers (GTIN): EAN-13, EAN-8, UPC-A (12 digits) and GTIN-14. Pure, no clock.
 */

/** True for 8, 12, 13 or 14 digits whose last digit is the right check digit. */
export function isValidGtin(code: string): boolean {
  if (!/^\d+$/.test(code) || ![8, 12, 13, 14].includes(code.length)) return false;
  const digits = Array.from(code, Number);
  const check = digits.pop()!;
  // From the right of the body, weights alternate 3, 1, 3, 1 ...
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    const fromRight = digits.length - 1 - i;
    sum += digits[i]! * (fromRight % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10 === check;
}

/**
 * The key a barcode is remembered under: a UPC-A (12 digits) becomes its EAN-13 form with a
 * leading zero, so the two spellings are one product. Everything else is unchanged.
 */
export function normaliseGtin(code: string): string {
  const c = code.trim();
  return /^\d{12}$/.test(c) ? `0${c}` : c;
}
