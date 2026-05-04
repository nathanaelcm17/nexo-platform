import { describe, it, expect } from 'vitest';
import { UserId } from '@nexo/core-shared-kernel';
import { User } from '../src/domain/user.js';

describe('User aggregate', () => {
  const createUser = () =>
    User.create({
      userId: UserId('u-1'),
      email: 'cashier@acme.do',
      passwordHash: 'hashed',
      firstName: 'Juan',
      lastName: 'Pérez',
    });

  it('creates a user in pending status', () => {
    const user = createUser();
    expect(user.status).toBe('pending');
    expect(user.fullName).toBe('Juan Pérez');
  });

  it('locks after 5 failed login attempts', () => {
    const user = createUser();
    user.activate();
    for (let i = 0; i < 5; i++) user.recordFailedLogin();
    expect(user.status).toBe('locked');
  });

  it('rejects login while suspended', () => {
    const user = createUser();
    user.activate();
    user.suspend();
    expect(() => user.recordSuccessfulLogin()).toThrow(/suspended/i);
  });

  it('rejects invalid email on creation', () => {
    expect(() =>
      User.create({
        userId: UserId('u-2'),
        email: 'no-at-sign',
        passwordHash: 'x',
        firstName: 'X',
        lastName: 'Y',
      }),
    ).toThrow(/email/i);
  });
});
