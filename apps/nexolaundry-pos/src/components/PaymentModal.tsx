import { useState } from 'react';
import { ordersApi, billingApi } from '../lib/api';
import { usePosStore } from '../stores/pos.store';

interface PaymentModalProps {
  onClose:   () => void;
  onSuccess: (result: { ncf: string; invoiceNumber: string; change: number }) => void;
}

const METHODS = [
  { id: 'cash',        label: 'Efectivo',      icon: '💵' },
  { id: 'card_manual', label: 'Tarjeta',        icon: '💳' },
  { id: 'transfer',    label: 'Transferencia',  icon: '🏦' },
  { id: 'credit',      label: 'Crédito',        icon: '📋' },
] as const;

const NCF_TYPES = [
  { id: 'B02', label: 'Consumidor final (B02)' },
  { id: 'B01', label: 'Crédito fiscal (B01)' },
  { id: 'B14', label: 'Régimen especial (B14)' },
] as const;

const fmt = (n: number) => `RD$ ${n.toFixed(2)}`;

export function PaymentModal({ onClose, onSuccess }: PaymentModalProps) {
  const { customer, lines, branchId, total, clearOrder } = usePosStore(s => ({
    customer:   s.customer,
    lines:      s.lines,
    branchId:   s.branchId,
    total:      s.total,
    clearOrder: s.clearOrder,
  }));

  const orderTotal = total();
  const [method,    setMethod]    = useState<string>('cash');
  const [ncfType,   setNcfType]   = useState<string>('B02');
  const [received,  setReceived]  = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');

  const receivedNum = parseFloat(received) || 0;
  const change      = method === 'cash' ? Math.max(0, receivedNum - orderTotal) : 0;
  const canPay      = method !== 'cash' || receivedNum >= orderTotal;

  async function handlePay() {
    if (!customer) return;
    setError('');
    setLoading(true);

    try {
      // 1. Crear y confirmar orden
      const orderRes = await ordersApi.create({
        customerId:      customer.customerId,
        branchId:        branchId || '50cb49d0-0c62-4582-8597-9e3fbae83835',
        fulfillmentType: 'laundry_production',
        lines: lines.map(l => ({
          catalogItemId: l.catalogItemId,
          description:   l.name,
          quantity:      l.quantity,
          unitOfMeasure: l.unitOfMeasure,
          unitPrice:     l.unitPrice,
          taxRate:       l.taxRate,
        })),
      });
      await ordersApi.confirm(orderRes.orderId);

      // 2. Emitir factura
      const invoice = await billingApi.issueInvoice({
        orderId:    orderRes.orderId,
        customerId: customer.customerId,
        branchId:   branchId || '50cb49d0-0c62-4582-8597-9e3fbae83835',
        ncfType,
        lines: lines.map(l => ({
          description: l.name,
          quantity:    l.quantity,
          unitPrice:   l.unitPrice,
          taxRate:     l.taxRate,
        })),
      });

      // 3. Registrar pago
      const payAmount = method === 'cash' ? Math.min(receivedNum, orderTotal) : orderTotal;
      await billingApi.recordPayment(invoice.invoiceId, { amount: payAmount, method });

      clearOrder();
      onSuccess({ ncf: invoice.ncf, invoiceNumber: invoice.invoiceNumber, change });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al procesar el pago');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Cobro</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none">×</button>
        </div>

        {/* Total */}
        <div className="bg-slate-900 rounded-xl p-4 text-center">
          <p className="text-slate-400 text-sm">Total a cobrar</p>
          <p className="text-4xl font-bold text-brand mt-1">{fmt(orderTotal)}</p>
        </div>

        {/* NCF */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Tipo de comprobante (NCF)</label>
          <select
            className="input-field"
            value={ncfType}
            onChange={e => setNcfType(e.target.value)}
          >
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
                onClick={() => setMethod(m.id)}
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

        {/* Cash received */}
        {method === 'cash' && (
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
        )}

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
          <button
            onClick={handlePay}
            disabled={loading || !canPay}
            className="btn-primary flex-1 py-3"
          >
            {loading ? 'Procesando…' : 'Confirmar pago'}
          </button>
        </div>
      </div>
    </div>
  );
}
