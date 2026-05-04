/**
 * Money - Value Object para representar cantidades monetarias.
 * Inmutable, con validación de moneda y operaciones seguras.
 */

export type Currency = 'DOP' | 'USD';

export class Money {
  private constructor(
    public readonly amount: number,
    public readonly currency: Currency,
  ) {}

  static of(amount: number, currency: Currency = 'DOP'): Money {
    if (!Number.isFinite(amount)) {
      throw new Error('Money amount must be finite');
    }
    // Redondeamos a 2 decimales para evitar errores de punto flotante
    const rounded = Math.round(amount * 100) / 100;
    return new Money(rounded, currency);
  }

  static zero(currency: Currency = 'DOP'): Money {
    return new Money(0, currency);
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.of(this.amount + other.amount, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.of(this.amount - other.amount, this.currency);
  }

  multiply(factor: number): Money {
    return Money.of(this.amount * factor, this.currency);
  }

  isZero(): boolean {
    return this.amount === 0;
  }

  isNegative(): boolean {
    return this.amount < 0;
  }

  equals(other: Money): boolean {
    return this.amount === other.amount && this.currency === other.currency;
  }

  toString(): string {
    return `${this.currency} ${this.amount.toFixed(2)}`;
  }

  toJSON(): { amount: number; currency: Currency } {
    return { amount: this.amount, currency: this.currency };
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error(`Currency mismatch: ${this.currency} vs ${other.currency}`);
    }
  }
}
