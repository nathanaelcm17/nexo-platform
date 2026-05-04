/**
 * Phone - Value Object para teléfono en formato E.164.
 * Clave para WhatsApp en Fase 3.
 */

export class Phone {
  private constructor(public readonly e164: string) {}

  static of(value: string, defaultCountryCode = '1'): Phone {
    const digits = value.replace(/\D/g, '');
    if (digits.length < 7) {
      throw new Error(`Invalid phone number: ${value}`);
    }
    const e164 = digits.startsWith(defaultCountryCode) || digits.length > 10
      ? `+${digits}`
      : `+${defaultCountryCode}${digits}`;
    return new Phone(e164);
  }

  equals(other: Phone): boolean {
    return this.e164 === other.e164;
  }

  toString(): string {
    return this.e164;
  }
}
