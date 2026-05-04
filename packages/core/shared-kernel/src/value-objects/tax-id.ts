/**
 * TaxId - Value Object para identificación fiscal.
 * En MVP soporta Cédula y RNC de República Dominicana.
 * El formato/validación específico del país vive en adapters.
 */

export type TaxIdType = 'cedula' | 'rnc' | 'passport';

export class TaxId {
  private constructor(
    public readonly type: TaxIdType,
    public readonly value: string,
  ) {}

  static of(type: TaxIdType, value: string): TaxId {
    const cleaned = value.replace(/[^0-9A-Z]/gi, '').toUpperCase();
    if (!cleaned) {
      throw new Error('TaxId value cannot be empty');
    }
    return new TaxId(type, cleaned);
  }

  toString(): string {
    return `${this.type}:${this.value}`;
  }

  equals(other: TaxId): boolean {
    return this.type === other.type && this.value === other.value;
  }

  toJSON(): { type: TaxIdType; value: string } {
    return { type: this.type, value: this.value };
  }
}
