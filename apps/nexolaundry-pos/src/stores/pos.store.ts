import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CustomerSnapshot, CatalogItemSnapshot } from '../lib/api';

export interface DraftLine {
  catalogItemId: string;
  code: string;
  name: string;
  quantity: number;
  unitOfMeasure: string;
  unitPrice: number;
  taxRate: number;
  discount: number;
  lineTotal: number;
}

interface PosState {
  customer:     CustomerSnapshot | null;
  lines:        DraftLine[];
  branchId:     string;
  sessionId:    string | null;
  terminalId:   string | null;

  setCustomer:  (c: CustomerSnapshot | null) => void;
  setBranchId:  (id: string) => void;
  setSession:   (sessionId: string, terminalId: string) => void;
  clearSession: () => void;

  addItem:      (item: CatalogItemSnapshot) => void;
  removeItem:   (catalogItemId: string) => void;
  increment:    (catalogItemId: string) => void;
  decrement:    (catalogItemId: string) => void;
  clearOrder:   () => void;

  subtotal: () => number;
  itbis:    () => number;
  total:    () => number;
}

function calcLine(l: DraftLine): number {
  return Math.round(((l.unitPrice * l.quantity) - l.discount) * 100) / 100;
}

function basePrice(item: CatalogItemSnapshot): number {
  const pm = item.pricingModel;
  if (pm.kind === 'fixed')      return pm.price      ?? 0;
  if (pm.kind === 'per_unit')   return pm.unitPrice   ?? 0;
  if (pm.kind === 'per_weight') return pm.pricePerKg  ?? 0;
  if (pm.kind === 'package')    return pm.packagePrice ?? 0;
  return 0;
}

export const usePosStore = create<PosState>()(
  persist(
    (set, get) => ({
  customer:   null,
  lines:      [],
  branchId:   '',
  sessionId:  null,
  terminalId: null,

  setCustomer:  (c) => set({ customer: c }),
  setBranchId:  (id) => set({ branchId: id }),
  setSession:   (sessionId, terminalId) => set({ sessionId, terminalId }),
  clearSession: () => set({ sessionId: null, terminalId: null }),

  addItem: (item) => {
    const price = basePrice(item);
    set((s) => {
      const idx = s.lines.findIndex(l => l.catalogItemId === item.itemId);
      if (idx >= 0) {
        const updated = [...s.lines];
        updated[idx] = { ...updated[idx], quantity: updated[idx].quantity + 1 };
        updated[idx].lineTotal = calcLine(updated[idx]);
        return { lines: updated };
      }
      const line: DraftLine = {
        catalogItemId: item.itemId,
        code:          item.code,
        name:          item.name,
        quantity:      1,
        unitOfMeasure: item.unitOfMeasure,
        unitPrice:     price,
        taxRate:       item.taxRate,
        discount:      0,
        lineTotal:     price,
      };
      return { lines: [...s.lines, line] };
    });
  },

  removeItem: (id) => set((s) => ({ lines: s.lines.filter(l => l.catalogItemId !== id) })),

  increment: (id) => set((s) => ({
    lines: s.lines.map(l => {
      if (l.catalogItemId !== id) return l;
      const qty = l.quantity + 1;
      return { ...l, quantity: qty, lineTotal: calcLine({ ...l, quantity: qty }) };
    }),
  })),

  decrement: (id) => set((s) => ({
    lines: s.lines
      .map(l => {
        if (l.catalogItemId !== id) return l;
        const qty = Math.max(1, l.quantity - 1);
        return { ...l, quantity: qty, lineTotal: calcLine({ ...l, quantity: qty }) };
      }),
  })),

  clearOrder: () => set({ customer: null, lines: [] }),

  subtotal: () => get().lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0),
  itbis:    () => get().lines.reduce((s, l) => {
    const taxable = (l.unitPrice * l.quantity) - l.discount;
    return s + Math.round(taxable * (l.taxRate / 100) * 100) / 100;
  }, 0),
  total:    () => {
    const st = get().subtotal();
    const it = get().itbis();
    const disc = get().lines.reduce((s, l) => s + l.discount, 0);
    return Math.round((st - disc + it) * 100) / 100;
  },
    }),
    {
      name:    'nexo-pos-session',
      partialize: (s) => ({ sessionId: s.sessionId, terminalId: s.terminalId, branchId: s.branchId }),
    },
  ),
);
