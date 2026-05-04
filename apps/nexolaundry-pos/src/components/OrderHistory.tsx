import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ordersApi, type OrderSummary } from '../lib/api';

const STATUS_LABEL: Record<string, string> = {
  draft:          'Borrador',
  confirmed:      'Confirmada',
  in_fulfillment: 'En producción',
  ready:          'Lista',
  delivered:      'Entregada',
  cancelled:      'Cancelada',
};

const STATUS_CLASS: Record<string, string> = {
  draft:          'bg-slate-700 text-slate-300 border-slate-600',
  confirmed:      'bg-blue-900/50 text-blue-300 border-blue-700',
  in_fulfillment: 'bg-yellow-900/50 text-yellow-300 border-yellow-700',
  ready:          'bg-green-900/50 text-green-300 border-green-700',
  delivered:      'bg-slate-700 text-slate-400 border-slate-600',
  cancelled:      'bg-red-900/30 text-red-400 border-red-700/60',
};

const PAYMENT_CLASS: Record<string, string> = {
  unpaid:  'bg-orange-900/40 text-orange-300 border-orange-700',
  partial: 'bg-yellow-900/40 text-yellow-300 border-yellow-700',
  paid:    'bg-green-900/40 text-green-300 border-green-700',
};

const PAYMENT_LABEL: Record<string, string> = {
  unpaid:  'Sin pagar',
  partial: 'Parcial',
  paid:    'Pagado',
};

const CANCELLABLE = new Set(['draft', 'confirmed', 'in_fulfillment']);

const TABS = [
  { id: '',               label: 'Todas' },
  { id: 'confirmed',      label: 'Confirmadas' },
  { id: 'in_fulfillment', label: 'En producción' },
  { id: 'ready',          label: 'Listas' },
  { id: 'delivered',      label: 'Entregadas' },
  { id: 'cancelled',      label: 'Canceladas' },
] as const;

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

export function OrderHistory() {
  const [statusFilter, setStatusFilter] = useState('');
  const [cancelTarget, setCancelTarget] = useState<OrderSummary | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling,   setCancelling]   = useState(false);
  const [cancelError,  setCancelError]  = useState('');
  const qc = useQueryClient();

  const { data: orders = [], isFetching, refetch } = useQuery({
    queryKey:       ['orders', statusFilter],
    queryFn:        () => ordersApi.list(statusFilter ? `status=${statusFilter}&limit=50` : 'limit=50'),
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
      {/* Status tabs */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-2 overflow-x-auto flex-shrink-0 border-b border-slate-700">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setStatusFilter(tab.id)}
            className={`px-3 py-1 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              statusFilter === tab.id
                ? 'bg-brand text-slate-900'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
        <button
          onClick={() => refetch()}
          className="ml-auto text-slate-400 hover:text-white transition-colors text-sm px-2 py-1 rounded-lg hover:bg-slate-700 flex-shrink-0"
        >
          {isFetching ? '⟳' : '↺'} Actualizar
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4">
        {!isFetching && orders.length === 0 && (
          <p className="text-center text-slate-500 py-16 text-sm">
            No hay órdenes{statusFilter ? ` con estado "${STATUS_LABEL[statusFilter]}"` : ''}
          </p>
        )}

        <div className="space-y-2">
          {orders.map(order => (
            <div
              key={order.orderId}
              className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 flex items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-semibold text-white text-sm">{order.orderNumber}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_CLASS[order.status] ?? 'bg-slate-700 text-slate-300 border-slate-600'}`}>
                    {STATUS_LABEL[order.status] ?? order.status}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${PAYMENT_CLASS[order.paymentStatus] ?? 'bg-slate-700 text-slate-300 border-slate-600'}`}>
                    {PAYMENT_LABEL[order.paymentStatus] ?? order.paymentStatus}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="text-brand font-semibold text-sm">{fmt(order.total)}</span>
                  {order.paymentStatus === 'partial' && (
                    <span className="text-slate-400 text-xs">
                      Pagado {fmt(order.paidAmount)} · Resto {fmt(order.total - order.paidAmount)}
                    </span>
                  )}
                  <span className="text-slate-500 text-xs ml-auto">{timeAgo(order.receivedAt)}</span>
                </div>
              </div>

              {CANCELLABLE.has(order.status) && (
                <button
                  onClick={() => { setCancelTarget(order); setCancelReason(''); setCancelError(''); }}
                  className="text-xs text-red-400 border border-red-700/50 hover:border-red-500 hover:bg-red-900/20 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
                >
                  Cancelar
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Cancel modal */}
      {cancelTarget && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-sm space-y-4">
            <div>
              <h3 className="font-bold text-white text-lg">Cancelar orden</h3>
              <p className="text-brand font-mono text-sm mt-0.5">{cancelTarget.orderNumber} · {fmt(cancelTarget.total)}</p>
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
    </div>
  );
}
