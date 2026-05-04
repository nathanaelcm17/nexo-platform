import { InvariantViolationError } from '@nexo/core-shared-kernel';
import type { NcfType } from './invoice.js';

export interface NcfSequenceProps {
  sequenceId: string;
  branchId?: string;
  ncfType: NcfType;
  prefix: string;
  numberFrom: number;
  numberTo: number;
  currentNumber: number;
  expirationDate?: Date;
  active: boolean;
}

export class NcfSequence {
  private constructor(private props: NcfSequenceProps) {}

  static rehydrate(props: NcfSequenceProps): NcfSequence {
    return new NcfSequence(props);
  }

  /** Retorna el siguiente NCF y avanza el contador internamente */
  nextNcf(): string {
    if (!this.props.active) {
      throw new InvariantViolationError(`NCF sequence for ${this.props.ncfType} is inactive`);
    }
    if (this.props.currentNumber > this.props.numberTo) {
      throw new InvariantViolationError(`NCF sequence for ${this.props.ncfType} is exhausted`);
    }
    if (this.props.expirationDate && this.props.expirationDate < new Date()) {
      throw new InvariantViolationError(`NCF sequence for ${this.props.ncfType} has expired`);
    }

    const num = this.props.currentNumber;
    this.props.currentNumber += 1;

    // Formato DGII: prefijo (ej. B01) + número de 8 dígitos
    return `${this.props.prefix}${String(num).padStart(8, '0')}`;
  }

  get remaining(): number { return this.props.numberTo - this.props.currentNumber + 1; }
  get ncfType(): NcfType { return this.props.ncfType; }
  get currentNumber(): number { return this.props.currentNumber; }

  toSnapshot(): Readonly<NcfSequenceProps> { return { ...this.props }; }
}
