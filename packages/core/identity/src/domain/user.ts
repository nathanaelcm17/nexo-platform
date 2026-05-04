/**
 * User - Aggregate Root del contexto Identity.
 * Encapsula las reglas de invariantes del usuario global.
 */

import type { UserId } from '@nexo/core-shared-kernel';
import { InvariantViolationError } from '@nexo/core-shared-kernel';

export type UserStatus = 'pending' | 'active' | 'suspended' | 'locked';

export interface UserProps {
  userId: UserId;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone?: string;
  status: UserStatus;
  mfaEnabled: boolean;
  mfaSecret?: string;
  failedLoginAttempts: number;
  lockedUntil?: Date;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutos

export class User {
  private constructor(private props: UserProps) {}

  static rehydrate(props: UserProps): User {
    return new User(props);
  }

  static create(input: {
    userId: UserId;
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    phone?: string;
  }): User {
    if (!input.email.includes('@')) {
      throw new InvariantViolationError('Invalid email format');
    }
    const now = new Date();
    return new User({
      ...input,
      status: 'pending',
      mfaEnabled: false,
      failedLoginAttempts: 0,
      createdAt: now,
      updatedAt: now,
    });
  }

  // --- Comandos ---

  activate(): void {
    if (this.props.status === 'active') return;
    if (this.props.status === 'suspended') {
      throw new InvariantViolationError('Cannot activate suspended user');
    }
    this.props.status = 'active';
    this.props.updatedAt = new Date();
  }

  suspend(): void {
    this.props.status = 'suspended';
    this.props.updatedAt = new Date();
  }

  recordSuccessfulLogin(): void {
    this.assertCanLogin();
    this.props.failedLoginAttempts = 0;
    this.props.lockedUntil = undefined;
    this.props.lastLoginAt = new Date();
    this.props.updatedAt = new Date();
  }

  recordFailedLogin(): void {
    this.props.failedLoginAttempts += 1;
    if (this.props.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
      this.props.lockedUntil = new Date(Date.now() + LOCK_DURATION_MS);
      this.props.status = 'locked';
    }
    this.props.updatedAt = new Date();
  }

  changePassword(newHash: string): void {
    this.props.passwordHash = newHash;
    this.props.updatedAt = new Date();
  }

  enableMfa(secret: string): void {
    this.props.mfaEnabled = true;
    this.props.mfaSecret = secret;
    this.props.updatedAt = new Date();
  }

  // --- Invariantes ---

  private assertCanLogin(): void {
    if (this.props.status === 'suspended') {
      throw new InvariantViolationError('User is suspended');
    }
    if (this.props.status === 'pending') {
      throw new InvariantViolationError('User is pending activation');
    }
    if (this.props.lockedUntil && this.props.lockedUntil > new Date()) {
      throw new InvariantViolationError('User is temporarily locked');
    }
  }

  // --- Getters (evita exponer mutable state) ---

  get userId(): UserId { return this.props.userId; }
  get email(): string { return this.props.email; }
  get fullName(): string { return `${this.props.firstName} ${this.props.lastName}`; }
  get status(): UserStatus { return this.props.status; }
  get mfaEnabled(): boolean { return this.props.mfaEnabled; }
  get passwordHash(): string { return this.props.passwordHash; }

  toSnapshot(): Readonly<UserProps> { return { ...this.props }; }
}
