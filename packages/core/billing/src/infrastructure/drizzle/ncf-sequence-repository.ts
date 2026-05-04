import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { NcfSequence } from '../../domain/ncf-sequence.js';
import type { NcfType } from '../../domain/invoice.js';
import type { NcfSequenceRepository } from '../../domain/ports.js';
import * as schema from './schema.js';

type Db = NodePgDatabase<typeof schema>;

export class DrizzleNcfSequenceRepository implements NcfSequenceRepository {
  constructor(private readonly db: Db) {}

  async findActive(ncfType: NcfType, branchId?: string): Promise<NcfSequence | null> {
    const conditions = branchId
      ? and(eq(schema.ncfSequences.ncfType, ncfType), eq(schema.ncfSequences.branchId, branchId), eq(schema.ncfSequences.active, true))
      : and(eq(schema.ncfSequences.ncfType, ncfType), eq(schema.ncfSequences.active, true));

    const rows = await this.db.select().from(schema.ncfSequences).where(conditions).limit(1);
    return rows[0] ? this.toAggregate(rows[0]) : null;
  }

  async save(seq: NcfSequence): Promise<void> {
    const s = seq.toSnapshot();
    await this.db.update(schema.ncfSequences)
      .set({ currentNumber: s.currentNumber })
      .where(eq(schema.ncfSequences.sequenceId, s.sequenceId));
  }

  private toAggregate(row: schema.NcfSequenceRow): NcfSequence {
    return NcfSequence.rehydrate({
      sequenceId:     row.sequenceId,
      branchId:       row.branchId ?? undefined,
      ncfType:        row.ncfType as NcfType,
      prefix:         row.prefix,
      numberFrom:     row.numberFrom,
      numberTo:       row.numberTo,
      currentNumber:  row.currentNumber,
      expirationDate: row.expirationDate ? (row.expirationDate instanceof Date ? row.expirationDate : new Date(row.expirationDate)) : undefined,
      active:         row.active,
    });
  }
}
