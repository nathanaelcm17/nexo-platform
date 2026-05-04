import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import {
  CashSession,
  type CashSessionStatus,
  type CashMovementType,
  type CashPaymentMethod,
} from '../../domain/cash-session.js';
import type { CashSessionRepository, TerminalRepository, TerminalInfo } from '../../domain/ports.js';
import * as schema from './schema.js';

type Db = NodePgDatabase<typeof schema>;

export class DrizzleCashSessionRepository implements CashSessionRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<CashSession | null> {
    const [rows, movRows] = await Promise.all([
      this.db.select().from(schema.cashSessions).where(eq(schema.cashSessions.sessionId, id)).limit(1),
      this.db.select().from(schema.cashMovements).where(eq(schema.cashMovements.sessionId, id)),
    ]);
    return rows[0] ? this.toAggregate(rows[0], movRows) : null;
  }

  async findOpenByTerminal(terminalId: string): Promise<CashSession | null> {
    const rows = await this.db.select().from(schema.cashSessions)
      .where(and(eq(schema.cashSessions.terminalId, terminalId), eq(schema.cashSessions.status, 'open')))
      .limit(1);
    if (!rows[0]) return null;
    const movRows = await this.db.select().from(schema.cashMovements)
      .where(eq(schema.cashMovements.sessionId, rows[0].sessionId));
    return this.toAggregate(rows[0], movRows);
  }

  async save(session: CashSession): Promise<void> {
    const s = session.toSnapshot();
    await this.db.transaction(async (tx) => {
      await tx.insert(schema.cashSessions)
        .values({
          sessionId:            s.sessionId,
          terminalId:           s.terminalId,
          branchId:             s.branchId,
          cashierId:            s.cashierId,
          status:               s.status,
          openedAt:             s.openedAt,
          openingBalance:       String(s.openingBalance),
          openingDenominations: JSON.stringify(s.openingDenominations),
          closedAt:             s.closedAt ?? null,
          closingBalance:       s.closingBalance !== undefined ? String(s.closingBalance) : null,
          closingDenominations: s.closingDenominations ? JSON.stringify(s.closingDenominations) : null,
          expectedCash:         s.expectedCash !== undefined ? String(s.expectedCash) : null,
          difference:           s.difference !== undefined ? String(s.difference) : null,
          differenceReason:     s.differenceReason ?? null,
          closedBy:             s.closedBy ?? null,
          supervisorApprovedBy: s.supervisorApprovedBy ?? null,
        })
        .onConflictDoUpdate({
          target: schema.cashSessions.sessionId,
          set: {
            status:               s.status,
            closedAt:             s.closedAt ?? null,
            closingBalance:       s.closingBalance !== undefined ? String(s.closingBalance) : null,
            closingDenominations: s.closingDenominations ? JSON.stringify(s.closingDenominations) : null,
            expectedCash:         s.expectedCash !== undefined ? String(s.expectedCash) : null,
            difference:           s.difference !== undefined ? String(s.difference) : null,
            differenceReason:     s.differenceReason ?? null,
            closedBy:             s.closedBy ?? null,
            supervisorApprovedBy: s.supervisorApprovedBy ?? null,
          },
        });

      // Insertar solo movimientos nuevos (los ya guardados se detectan por movementId)
      if (s.movements.length > 0) {
        for (const m of s.movements) {
          await tx.insert(schema.cashMovements)
            .values({
              movementId:       m.movementId,
              sessionId:        s.sessionId,
              type:             m.type,
              amount:           String(m.amount),
              method:           m.method ?? null,
              relatedInvoiceId: m.relatedInvoiceId ?? null,
              relatedOrderId:   m.relatedOrderId ?? null,
              description:      m.description ?? null,
              performedBy:      m.performedBy,
              occurredAt:       m.occurredAt,
            })
            .onConflictDoNothing();
        }
      }
    });
  }

  private toAggregate(row: schema.CashSessionRow, movRows: schema.CashMovementRow[]): CashSession {
    return CashSession.rehydrate({
      sessionId:            row.sessionId,
      terminalId:           row.terminalId,
      branchId:             row.branchId,
      cashierId:            row.cashierId,
      status:               row.status as CashSessionStatus,
      openedAt:             row.openedAt,
      openingBalance:       Number(row.openingBalance),
      openingDenominations: JSON.parse(row.openingDenominations ?? '{}'),
      closedAt:             row.closedAt ?? undefined,
      closingBalance:       row.closingBalance !== null ? Number(row.closingBalance) : undefined,
      closingDenominations: row.closingDenominations ? JSON.parse(row.closingDenominations) : undefined,
      expectedCash:         row.expectedCash !== null ? Number(row.expectedCash) : undefined,
      difference:           row.difference !== null ? Number(row.difference) : undefined,
      differenceReason:     row.differenceReason ?? undefined,
      closedBy:             row.closedBy ?? undefined,
      supervisorApprovedBy: row.supervisorApprovedBy ?? undefined,
      movements: movRows.map(m => ({
        movementId:       m.movementId,
        sessionId:        m.sessionId,
        type:             m.type as CashMovementType,
        amount:           Number(m.amount),
        method:           m.method as CashPaymentMethod | undefined,
        relatedInvoiceId: m.relatedInvoiceId ?? undefined,
        relatedOrderId:   m.relatedOrderId ?? undefined,
        description:      m.description ?? undefined,
        performedBy:      m.performedBy,
        occurredAt:       m.occurredAt,
      })),
    });
  }
}

export class DrizzleTerminalRepository implements TerminalRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<TerminalInfo | null> {
    const rows = await this.db.select().from(schema.terminals)
      .where(eq(schema.terminals.terminalId, id)).limit(1);
    if (!rows[0]) return null;
    return { terminalId: rows[0].terminalId, branchId: rows[0].branchId, name: rows[0].name, deviceFingerprint: rows[0].deviceFingerprint ?? undefined, active: rows[0].active };
  }

  async findActiveByBranch(branchId: string): Promise<TerminalInfo[]> {
    const rows = await this.db.select().from(schema.terminals)
      .where(and(eq(schema.terminals.branchId, branchId), eq(schema.terminals.active, true)));
    return rows.map(r => ({ terminalId: r.terminalId, branchId: r.branchId, name: r.name, deviceFingerprint: r.deviceFingerprint ?? undefined, active: r.active }));
  }
}
