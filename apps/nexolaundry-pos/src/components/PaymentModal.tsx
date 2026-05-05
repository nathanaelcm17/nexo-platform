import { useState } from 'react';
import { ordersApi, billingApi } from '../lib/api';
import { usePosStore, type DraftLine } from '../stores/pos.store';

export interface SaleReceipt {
  orderId?:      string;
  ncf:           string;
  invoiceNumber: string;
  change:        number;
  total:         number;
  subtotal:      number;
  itbis:         number;
  paidAmount:    number;
  isPartial:     boolean;
  method:        string;
  customerName:  string;
  issuedAt:      string;
  lines:         Array<{ name: string; quantity: number; unitOfMeasure: string; unitPrice: number; lineTotal: number }>;
}

interface PaymentModalProps {
  onClose:       () => void;
  onSuccess:     (result: SaleReceipt) => void;
  orderOverride?: import('../lib/api').OrderSummary; // para cobrar orden ready existente
}

const METHODS = [
  { id: 'cash',        label: 'Efectivo',     icon: '💵' },
  { id: 'card_manual', label: 'Tarjeta',       icon: '💳' },
  { id: 'transfer',    label: 'Transferencia', icon: '🏦' },
  { id: 'credit',      label: 'Crédito',       icon: '📋' },
] as const;

const NCF_TYPES = [
  { id: 'B02', label: 'Consumidor final (B02)' },
  { id: 'B01', label: 'Crédito fiscal (B01)' },
  { id: 'B14', label: 'Régimen especial (B14)' },
] as const;

const fmt = (n: number) => `RD$ ${n.toFixed(2)}`;

function customerDisplayName(c: NonNullable<ReturnType<typeof usePosStore.getState>['customer']>): string {
  if (c.customerType === 'business') return c.businessName ?? c.customerCode;
  return [c.firstName, c.lastName].filter(Boolean).join(' ') || c.customerCode;
}

function linesToReceiptLines(lines: DraftLine[]) {
  return lines.map(l => ({
    name:          l.name,
    quantity:      l.quantity,
    unitOfMeasure: l.unitOfMeasure,
    unitPrice:     l.unitPrice,
    lineTotal:     l.lineTotal,
  }));
}

export function PaymentModal({ onClose, onSuccess, orderOverride }: PaymentModalProps) {
  const { customer, lines, branchId, total, clearOrder, priority, promisedAt, notes } = usePosStore(s => ({
    customer:   s.customer,
    lines:      s.lines,
    branchId:   s.branchId,
    total:      s.total,
    clearOrder: s.clearOrder,
    priority:   s.priority,
    promisedAt: s.promisedAt,
    notes:      s.notes,
  }));

  // Si la orden ya tiene pagos parciales, cobrar solo el saldo pendiente
  const alreadyPaid   = orderOverride?.paidAmount ?? 0;
  const orderTotal    = orderOverride ? orderOverride.total - alreadyPaid : total();
  const orderSubtotal = orderTotal / 1.18;
  const orderItbis    = orderTotal - orderSubtotal;

  const [method,        setMethod]        = useState<string>('cash');
  const [ncfType,       setNcfType]       = useState<string>('B02');
  const [received,      setReceived]      = useState('');
  const [isPartial,     setIsPartial]     = useState(false);
  const [partialAmount, setPartialAmount] = useState('');
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState('');

  const receivedNum    = parseFloat(received) || 0;
  const partialNum     = parseFloat(partialAmount) || 0;
  const change         = method === 'cash' && !isPartial ? Math.max(0, receivedNum - orderTotal) : 0;

  const canPay = isPartial
    ? partialNum > 0 && partialNum <= orderTotal
    : method !== 'cash' || receivedNum >= orderTotal;

  async function handlePay() {
    if (!orderOverride && !customer) return;
    setError('');
    setLoading(true);

    try {
      let resolvedOrderId: string;
      let resolvedCustomerId: string;
      let resolvedBranchId: string;
      let invoiceLines: Array<{ description: string; quantity: number; unitPrice: number; taxRate: number }>;

      if (orderOverride) {
        // Orden ya existente — facturar el saldo pendiente (o el total si no hay pagos previos)
        resolvedOrderId    = orderOverride.orderId;
        resolvedCustomerId = orderOverride.customerId;
        resolvedBranchId   = orderOverride.branchId;
        const desc = alreadyPaid > 0
          ? `Saldo orden ${orderOverride.orderNumber}`
          : `Orden ${orderOverride.orderNumber}`;
        invoiceLines = [{ description: desc, quantity: 1, unitPrice: orderTotal / 1.18, taxRate: 18 }];
      } else {
        if (!customer) return;
        const orderRes = await ordersApi.create({
          customerId:      customer.customerId,
          branchId:        branchId || '50cb49d0-0c62-4582-8597-9e3fbae83835',
          fulfillmentType: 'laundry_production',
          priority,
          promisedAt:      promisedAt || undefined,
          notes:           notes || undefined,
          lines: lines.map(l => ({
            catalogItemId: l.catalogItemId,
            description:   l.name,
            quantity:      l.quantity,
            unitOfMeasure: l.unitOfMeasure as never,
            unitPrice:     l.unitPrice,
            taxRate:       l.taxRate,
          })),
        });
        await ordersApi.confirm(orderRes.orderId);
        resolvedOrderId    = orderRes.orderId;
        resolvedCustomerId = customer.customerId;
        resolvedBranchId   = branchId || '50cb49d0-0c62-4582-8597-9e3fbae83835';
        invoiceLines       = lines.map(l => ({ description: l.name, quantity: l.quantity, unitPrice: l.unitPrice, taxRate: l.taxRate }));
      }

      const invoice = await billingApi.issueInvoice({
        orderId:    resolvedOrderId,
        customerId: resolvedCustomerId,
        branchId:   resolvedBranchId,
        ncfType,
        lines:      invoiceLines,
      });

      const payAmount = isPartial
        ? partialNum
        : method === 'cash' ? Math.min(receivedNum, orderTotal) : orderTotal;

      await billingApi.recordPayment(invoice.invoiceId, { amount: payAmount, method });

      if (!orderOverride) clearOrder();
      onSuccess({
        orderId: resolvedOrderId,
        ncf:           invoice.ncf,
        invoiceNumber: invoice.invoiceNumber,
        change,
        total:         orderTotal,
        subtotal:      orderSubtotal,
        itbis:         orderItbis,
        paidAmount:    payAmount,
        isPartial,
        method,
        customerName:  orderOverride ? orderOverride.customerId.slice(0, 8) : (customer ? customerDisplayName(customer) : ''),
        issuedAt:      new Date().toISOString(),
        lines:         orderOverride ? [] : linesToReceiptLines(lines),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al procesar el pago');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Cobro</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none">×</button>
        </div>

        {/* Total */}
        <div className="bg-slate-900 rounded-xl p-4 text-center">
          <p className="text-slate-400 text-sm">
            {orderOverride && alreadyPaid > 0 ? 'Saldo pendiente' : 'Total a cobrar'}
          </p>
          <p className="text-4xl font-bold text-brand mt-1">{fmt(orderTotal)}</p>
          <p className="text-slate-500 text-xs mt-1">
            Subtotal {fmt(orderSubtotal)} + ITBIS {fmt(orderItbis)}
          </p>
          {orderOverride && alreadyPaid > 0 && (
            <p className="text-xs text-slate-500 mt-1">
              Total orden {fmt(orderOverride.total)} · Ya pagado {fmt(alreadyPaid)}
            </p>
          )}
        </div>

        {/* NCF */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Tipo de comprobante (NCF)</label>
          <select className="input-field" value={ncfType} onChange={e => setNcfType(e.target.value)}>
            {NCF_TYPES.map(n => (
              <option key={n.id} value={n.id}>{n.label}</option>
            ))}
          </select>
        </div>

        {/* Payment method */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Método de pago</label>
          <div className="grid grid-cols-2 gap-2">
            {METHODS.map(m => (
              <button
                key={m.id}
                onClick={() => { setMethod(m.id); setReceived(''); }}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                  method === m.id
                    ? 'border-brand bg-brand/10 text-brand'
                    : 'border-slate-600 bg-slate-700 text-slate-300 hover:border-slate-500'
                }`}
              >
                <span>{m.icon}</span>
                <span>{m.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Partial payment toggle */}
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <div
            onClick={() => { setIsPartial(v => !v); setPartialAmount(''); }}
            className={`w-10 h-5 rounded-full transition-colors relative ${isPartial ? 'bg-brand' : 'bg-slate-600'}`}
          >
            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isPartial ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </div>
          <span className="text-sm text-slate-300">Pago parcial</span>
        </label>

        {/* Amount inputs */}
        {isPartial ? (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Monto a cobrar ahora (RD$) <span className="text-slate-500">— máx. {fmt(orderTotal)}</span>
            </label>
            <input
              type="number"
              min="0.01"
              max={orderTotal}
              step="0.01"
              className="input-field text-lg font-semibold"
              placeholder="0.00"
              value={partialAmount}
              onChange={e => setPartialAmount(e.target.value)}
              autoFocus
            />
            {partialNum > 0 && partialNum <= orderTotal && (
              <p className="text-orange-400 text-sm mt-1 font-medium">
                Saldo pendiente: {fmt(orderTotal - partialNum)}
              </p>
            )}
          </div>
        ) : method === 'cash' ? (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Monto recibido (RD$)</label>
            <input
              type="number"
              min={orderTotal}
              step="0.01"
              className="input-field text-lg font-semibold"
              placeholder={orderTotal.toFixed(2)}
              value={received}
              onChange={e => setReceived(e.target.value)}
              autoFocus
            />
            {receivedNum >= orderTotal && (
              <p className="text-green-400 text-sm mt-1 font-medium">
                Cambio: {fmt(change)}
              </p>
            )}
          </div>
        ) : null}

        {error && (
          <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-ghost flex-1" disabled={loading}>
            Cancelar
          </button>
          <button onClick={handlePay} disabled={loading || !canPay} className="btn-primary flex-1 py-3">
            {loading ? 'Procesando…' : 'Confirmar pago'}
          </button>
        </div>
      </div>
    </div>
  );
}
