import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ordersApi, ordersApiExtra, type OrderSummary, type OrderCustomer } from '../lib/api';
// OrderSummary used for payingOrder state and cancel modal
import { PaymentModal, type SaleReceipt } from './PaymentModal';
import { OrderDetailModal } from './OrderDetailModal';

// ── Helpers ───────────────────────────────────────────────────────────────────
function customerName(c?: OrderCustomer): string {
  if (!c) return '—';
  if (c.customerType === 'business') return c.businessName ?? c.customerCode ?? '—';
  const name = [c.firstName, c.lastName].filter(Boolean).join(' ');
  return name || c.customerCode || '—';
}

const fmt = (n: number) => `RD$ ${n.toFixed(2)}`;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return 'ahora';
  if (mins < 60) return `hace ${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `hace ${hrs}h`;
  return new Date(iso).toLocaleDateString('es-DO', { day: '2-digit', month: 'short' });
}

// ── Colores por estado ────────────────────────────────────────────────────────
const STATUS_LABEL: Record<string, string> = {
  draft:          'Borrador',
  confirmed:      'Confirmada',
  in_fulfillment: 'En producción',
  ready:          'Lista para retiro',
  delivered:      'Entregada',
  cancelled:      'Cancelada',
};
const STATUS_CLASS: Record<string, string> = {
  draft:          'bg-slate-700 text-slate-300 border-slate-600',
  confirmed:      'bg-blue-900/50 text-blue-300 border-blue-700',
  in_fulfillment: 'bg-yellow-900/50 text-yellow-300 border-yellow-700',
  ready:          'bg-green-900/50 text-green-400 border-green-700',
  delivered:      'bg-slate-700 text-slate-400 border-slate-600',
  cancelled:      'bg-red-900/30 text-red-400 border-red-700/60',
};
const PAYMENT_CLASS: Record<string, string> = {
  unpaid:  'bg-orange-900/40 text-orange-300 border-orange-700',
  partial: 'bg-yellow-900/40 text-yellow-300 border-yellow-700',
  paid:    'bg-green-900/40 text-green-300 border-green-700',
};
const PAYMENT_LABEL: Record<string, string> = {
  unpaid: 'Sin pagar', partial: 'Parcial', paid: 'Pagado',
};

const CANCELLABLE = new Set(['draft', 'confirmed', 'in_fulfillment']);

const STATUS_FILTERS = [
  { id: '',               label: 'Todas' },
  { id: 'confirmed',      label: 'Confirmadas' },
  { id: 'in_fulfillment', label: 'En producción' },
  { id: 'ready',          label: '✅ Listas' },
  { id: 'delivered',      label: 'Entregadas' },
  { id: 'cancelled',      label: 'Canceladas' },
] as const;

const METHOD_LABEL: Record<string, string> = {
  cash: 'Efectivo', card_manual: 'Tarjeta', transfer: 'Transferencia', credit: 'Crédito',
};

// ── Componente ────────────────────────────────────────────────────────────────
export function OrderHistory() {
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery,  setSearchQuery]  = useState('');
  const [dateFilter,   setDateFilter]   = useState('');

  const [cancelTarget, setCancelTarget] = useState<OrderSummary | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling,   setCancelling]   = useState(false);
  const [cancelError,  setCancelError]  = useState('');

  const [payingOrder,  setPayingOrder]  = useState<OrderSummary | null>(null);
  const [receipt,      setReceipt]      = useState<SaleReceipt | null>(null);
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);

  const qc = useQueryClient();

  const queryKey = ['orders', statusFilter, searchQuery, dateFilter];

  const { data: orders = [], isFetching, refetch } = useQuery({
    queryKey,
    queryFn: () => ordersApi.search({
      status: statusFilter || undefined,
      q:      searchQuery.trim() || undefined,
      date:   dateFilter || undefined,
      limit:  60,
    }),
    refetchInterval: 30_000,
  });

  async function handleCancel() {
    if (!cancelTarget || !cancelReason.trim()) { setCancelError('Ingresa una razón'); return; }
    setCancelling(true);
    setCancelError('');
    try {
      await ordersApi.cancel(cancelTarget.orderId, cancelReason.trim());
      await qc.invalidateQueries({ queryKey: ['orders'] });
      setCancelTarget(null);
      setCancelReason('');
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Error al cancelar');
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Barra de búsqueda */}
      <div className="px-4 pt-3 pb-2 border-b border-slate-700 flex-shrink-0 space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
            <input
              type="text"
              className="input-field pl-9 text-sm"
              placeholder="Buscar por # orden, nombre, teléfono, cédula…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <input
            type="date"
            className="input-field text-sm w-40 flex-shrink-0"
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
            title="Filtrar por fecha"
          />
          {(searchQuery || dateFilter) && (
            <button
              onClick={() => { setSearchQuery(''); setDateFilter(''); }}
              className="btn-ghost text-sm px-3 flex-shrink-0"
            >
              ✕ Limpiar
            </button>
          )}
          <button
            onClick={() => refetch()}
            className="text-slate-400 hover:text-white text-sm px-2 py-1 rounded-lg hover:bg-slate-700 transition-colors flex-shrink-0"
          >
            {isFetching ? '⟳' : '↺'}
          </button>
        </div>

        {/* Filtros por estado */}
        <div className="flex gap-2 overflow-x-auto pb-0.5">
          {STATUS_FILTERS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                statusFilter === tab.id
                  ? 'bg-brand text-slate-900'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto p-4">
        {!isFetching && orders.length === 0 && (
          <p className="text-center text-slate-500 py-16 text-sm">
            {searchQuery || dateFilter ? `Sin resultados para la búsqueda` : 'No hay órdenes'}
          </p>
        )}

        <div className="space-y-2">
          {orders.map(order => (
            <div
              key={order.orderId}
              className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 flex items-center gap-3 cursor-pointer hover:border-slate-500 transition-colors"
              onClick={() => setDetailOrderId(order.orderId)}
            >
              <div className="flex-1 min-w-0">
                {/* Fila 1: número + badges */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold text-white text-sm">{order.orderNumber}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_CLASS[order.status] ?? 'bg-slate-700 text-slate-300 border-slate-600'}`}>
                    {STATUS_LABEL[order.status] ?? order.status}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${PAYMENT_CLASS[order.paymentStatus] ?? 'bg-slate-700 text-slate-300 border-slate-600'}`}>
                    {PAYMENT_LABEL[order.paymentStatus] ?? order.paymentStatus}
                  </span>
                </div>

                {/* Fila 2: cliente */}
                <p className="text-sm text-slate-200 mt-0.5 truncate">
                  {customerName(order.customer)}
                  {order.customer?.phone && (
                    <span className="text-slate-400 text-xs ml-2">{order.customer.phone}</span>
                  )}
                </p>

                {/* Fila 3: total + saldo + tiempo */}
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-brand font-semibold text-sm">{fmt(order.total)}</span>
                  {order.paymentStatus === 'partial' && (
                    <span className="text-slate-400 text-xs">
                      Pagado {fmt(order.paidAmount)} · Resto {fmt(order.total - order.paidAmount)}
                    </span>
                  )}
                  <span className="text-slate-500 text-xs ml-auto">{timeAgo(order.receivedAt)}</span>
                </div>
              </div>

              {/* Acciones */}
              <div className="flex flex-col gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                {order.status === 'ready' && order.paymentStatus !== 'paid' && (
                  <button
                    onClick={() => setPayingOrder(order)}
                    className="text-xs bg-brand text-slate-900 font-semibold px-3 py-1.5 rounded-lg hover:bg-sky-400 transition-colors"
                  >
                    💵 Cobrar
                  </button>
                )}
                {CANCELLABLE.has(order.status) && (
                  <button
                    onClick={() => { setCancelTarget(order); setCancelReason(''); setCancelError(''); }}
                    className="text-xs text-red-400 border border-red-700/50 hover:border-red-500 hover:bg-red-900/20 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* PaymentModal */}
      {payingOrder && (
        <PaymentModal
          orderOverride={payingOrder}
          onClose={() => setPayingOrder(null)}
          onSuccess={(r) => {
            setPayingOrder(null);
            setReceipt(r);
            ordersApiExtra.deliver(r.orderId!).catch(() => {});
            qc.invalidateQueries({ queryKey: ['orders'] });
          }}
        />
      )}

      {/* Mini receipt */}
      {receipt && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-sm text-center space-y-4">
            <div className="text-4xl">✅</div>
            <h2 className="text-xl font-bold text-white">¡Cobro registrado!</h2>
            <div className="bg-slate-900 rounded-xl p-4 text-sm text-left space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Factura</span>
                <span className="text-white font-medium">{receipt.invoiceNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">NCF</span>
                <span className="text-brand font-mono">{receipt.ncf}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Total</span>
                <span className="text-white">RD$ {receipt.total.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Pago ({METHOD_LABEL[receipt.method] ?? receipt.method})</span>
                <span className="text-white">RD$ {receipt.paidAmount.toFixed(2)}</span>
              </div>
              {receipt.change > 0 && (
                <div className="flex justify-between border-t border-slate-700 pt-2">
                  <span className="text-slate-400">Cambio</span>
                  <span className="text-green-400 font-bold">RD$ {receipt.change.toFixed(2)}</span>
                </div>
              )}
            </div>
            <button onClick={() => setReceipt(null)} className="btn-primary w-full py-2.5">Cerrar</button>
          </div>
        </div>
      )}

      {/* Cancel modal */}
      {cancelTarget && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-sm space-y-4">
            <div>
              <h3 className="font-bold text-white text-lg">Cancelar orden</h3>
              <p className="text-brand font-mono text-sm mt-0.5">
                {cancelTarget.orderNumber} — {customerName(cancelTarget.customer)} — {fmt(cancelTarget.total)}
              </p>
            </div>
            <p className="text-slate-400 text-sm">Esta acción no se puede deshacer. Ingresa el motivo:</p>
            <input
              type="text"
              className="input-field"
              placeholder="Ej. Cliente desistió, error en la orden…"
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleCancel(); }}
            />
            {cancelError && <p className="text-red-400 text-sm">{cancelError}</p>}
            <div className="flex gap-3">
              <button onClick={() => setCancelTarget(null)} className="btn-ghost flex-1" disabled={cancelling}>
                Volver
              </button>
              <button onClick={handleCancel} disabled={cancelling || !cancelReason.trim()} className="btn-danger flex-1">
                {cancelling ? 'Cancelando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order detail */}
      {detailOrderId && (
        <OrderDetailModal
          orderId={detailOrderId}
          onClose={() => setDetailOrderId(null)}
        />
      )}
    </div>
  );
}
