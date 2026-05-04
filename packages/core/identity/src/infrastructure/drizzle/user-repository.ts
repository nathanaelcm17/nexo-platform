import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';

import { UserId } from '@nexo/core-shared-kernel';

import { User, type UserStatus } from '../../domain/user.js';
import type { UserRepository } from '../../domain/ports.js';
import * as schema from './schema.js';

export class DrizzleUserRepository implements UserRepository {
  private readonly db: ReturnType<typeof drizzle>;

  constructor(pool: Pool) {
    this.db = drizzle(pool, { schema });
  }

  async findById(id: UserId): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.userId, id))
      .limit(1);
    return rows[0] ? this.toAggregate(rows[0]) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email.toLowerCase()))
      .limit(1);
    return rows[0] ? this.toAggregate(rows[0]) : null;
  }

  async save(user: User): Promise<void> {
    const s = user.toSnapshot();
    await this.db
      .insert(schema.users)
      .values({
        userId:               s.userId,
        email:                s.email,
        passwordHash:         s.passwordHash,
        firstName:            s.firstName,
        lastName:             s.lastName,
        phone:                s.phone ?? null,
        status:               s.status,
        mfaEnabled:           s.mfaEnabled,
        mfaSecret:            s.mfaSecret ?? null,
        lastLoginAt:          s.lastLoginAt ?? null,
        failedLoginAttempts:  s.failedLoginAttempts,
        lockedUntil:          s.lockedUntil ?? null,
        createdAt:            s.createdAt,
        updatedAt:            s.updatedAt,
      })
      .onConflictDoUpdate({
        target: schema.users.userId,
        set: {
          passwordHash:         s.passwordHash,
          status:               s.status,
          mfaEnabled:           s.mfaEnabled,
          mfaSecret:            s.mfaSecret ?? null,
          lastLoginAt:          s.lastLoginAt ?? null,
          failedLoginAttempts:  s.failedLoginAttempts,
          lockedUntil:          s.lockedUntil ?? null,
          updatedAt:            s.updatedAt,
        },
      });
  }

  private toAggregate(row: schema.UserRow): User {
    return User.rehydrate({
      userId:               UserId(row.userId),
      email:                row.email,
      passwordHash:         row.passwordHash,
      firstName:            row.firstName,
      lastName:             row.lastName,
      phone:                row.phone ?? undefined,
      status:               row.status as UserStatus,
      mfaEnabled:           row.mfaEnabled,
      mfaSecret:            row.mfaSecret ?? undefined,
      lastLoginAt:          row.lastLoginAt ?? undefined,
      failedLoginAttempts:  row.failedLoginAttempts,
      lockedUntil:          row.lockedUntil ?? undefined,
      createdAt:            row.createdAt,
      updatedAt:            row.updatedAt,
    });
  }
}
