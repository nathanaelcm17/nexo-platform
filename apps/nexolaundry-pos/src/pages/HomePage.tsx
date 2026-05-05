import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ordersApi, ordersApiExtra, cashApi, type OrderSummary, type OrderCustomer } from '../lib/api';
import { usePosStore } from '../stores/pos.store';
import { PaymentModal, type SaleReceipt } from '../components/PaymentModal';

const fmt = (n: number) => `RD$ ${n.toFixed(2)}`;

function customerName(c?: OrderCustomer): string {
  if (!c) return '—';
  if (c.customerType === 'business') return c.businessName ?? c.customerCode ?? '—';
  const full = [c.firstName, c.lastName].filter(Boolean).join(' ');
  return full || c.customerCode || '—';
}

const PAYMENT_BADGE: Record<string, string> = {
  unpaid:  'bg-orange-900/40 text-orange-300 border-orange-700',
  partial: 'bg-yellow-900/40 text-yellow-300 border-yellow-700',
  paid:    'bg-green-900/40 text-green-300 border-green-700',
};
const PAYMENT_LABEL: Record<string, string> = {
  unpaid: 'Sin cobrar', partial: 'Pago parcial', paid: 'Pagado',
};

interface HomePageProps {
  onNewOrder:   () => void;
  onGoToOrders: () => void;
  onGoToProd:   () => void;
}

export function HomePage({ onNewOrder, onGoToOrders, onGoToProd }: HomePageProps) {
  const { sessionId, terminalId } = usePosStore(s => ({
    sessionId:  s.sessionId,
    terminalId: s.terminalId,
  }));

  const qc = useQueryClient();
  const [payingOrder, setPayingOrder] = useState<OrderSummary | null>(null);
  const [receipt,     setReceipt]     = useState<SaleReceipt | null>(null);

  const { data: readyOrders = [] } = useQuery({
    queryKey:        ['orders-ready'],
    queryFn:         () => ordersApi.search({ status: 'ready', limit: 30 }),
    refetchInterval: 30_000,
  });

  const { data: inProdOrders = [] } = useQuery({
    queryKey:        ['orders-in-prod'],
    queryFn:         () => ordersApi.search({ status: 'in_fulfillment', limit: 5 }),
    refetchInterval: 30_000,
  });

  const { data: confirmedOrders = [] } = useQuery({
    queryKey:        ['orders-confirmed'],
    queryFn:         () => ordersApi.search({ status: 'confirmed', limit: 5 }),
    refetchInterval: 30_000,
  });

  const { data: session } = useQuery({
    queryKey:        ['cash-session-home', terminalId],
    queryFn:         () => cashApi.currentSession(terminalId!),
    enabled:         !!terminalId,
    refetchInterval: 60_000,
  });

  const unpaidReady = readyOrders.filter(o => o.paymentStatus !== 'paid');

  async function handleDeliver(orderId: string) {
    try {
      await ordersApiExtra.deliver(orderId);
    } catch { /* ya entregada o error transitorio */ }
    qc.invalidateQueries({ queryKey: ['orders-ready'] });
    qc.invalidateQueries({ queryKey: ['orders'] });
  }

  function handlePaySuccess(r: SaleReceipt) {
    setPayingOrder(null);
    setReceipt(r);
    if (r.orderId && !r.isPartial) {
      ordersApiExtra.deliver(r.orderId).catch(() => {});
    }
    qc.invalidateQueries({ queryKey: ['orders-ready'] });
    qc.invalidateQueries({ queryKey: ['orders'] });
  }

  return (
    <div className="overflow-y-auto h-full p-5 space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-xs text-slate-400 uppercase tracking-wide">Listas para retiro</p>
          <p className="text-3xl font-bold text-brand mt-1">{readyOrders.length}</p>
          <p className="text-xs text-slate-500 mt-1">Esperando cliente</p>
        </div>
        <div className="card">
          <p className="text-xs text-slate-400 uppercase tracking-wide">En producción</p>
          <p className="text-3xl font-bold text-yellow-400 mt-1">{inProdOrders.length + confirmedOrders.length}</p>
          <p className="text-xs text-slate-500 mt-1">Órdenes activas</p>
        </div>
        <div className="card">
          <p className="text-xs text-slate-400 uppercase tracking-wide">Fondo de caja</p>
          <p className="text-2xl font-bold text-white mt-1">
            {session ? fmt(session.openingBalance) : '—'}
          </p>
          <p className="text-xs text-slate-500 mt-1">{sessionId ? 'Caja abierta' : 'Sin sesión'}</p>
        </div>
        <div className="card">
          <p className="text-xs text-slate-400 uppercase tracking-wide">Cobros pendientes</p>
          <p className="text-3xl font-bold text-orange-400 mt-1">{unpaidReady.length}</p>
          <p className="text-xs text-slate-500 mt-1">Sin cobrar</p>
        </div>
      </div>

      {/* Acciones rápidas */}
      <div className="card">
        <h2 className="font-semibold text-white mb-4">Acciones rápidas</h2>
        <div className="grid grid-cols-3 gap-3">
          {([
            { icon: '🛒', label: 'Nueva orden', action: onNewOrder   },
            { icon: '📋', label: 'Ver órdenes', action: onGoToOrders },
            { icon: '🏭', label: 'Producción',  action: onGoToProd   },
          ] as const).map(tile => (
            <button
              key={tile.label}
              onClick={tile.action}
              className="bg-slate-700 hover:bg-slate-600 rounded-xl p-4 text-center transition-all
                         active:scale-95 border border-transparent hover:border-brand/30"
            >
              <span className="text-3xl block mb-2">{tile.icon}</span>
              <span className="text-sm font-medium text-white">{tile.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Órdenes listas para retiro */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-white">Órdenes listas para retiro</h2>
          {readyOrders.length > 0 && (
            <span className="text-xs bg-green-900/40 text-green-400 border border-green-700 px-2 py-1 rounded-full">
              {readyOrders.length} lista{readyOrders.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {readyOrders.length === 0 ? (
          <p className="text-center text-slate-500 py-8 text-sm">No hay órdenes listas en este momento</p>
        ) : (
          <div className="space-y-3">
            {readyOrders.map(order => {
              const name      = customerName(order.customer);
              const remaining = order.total - (order.paidAmount ?? 0);
              const isPaid    = order.paymentStatus === 'paid';
              const isPartial = order.paymentStatus === 'partial';

              return (
                <div key={order.orderId} className="bg-slate-900/60 border border-slate-700/60 rounded-xl px-4 py-3">
                  {/* Fila 1: # orden + badge pago */}
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono font-bold text-white text-sm">{order.orderNumber}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${PAYMENT_BADGE[order.paymentStatus] ?? 'bg-slate-700 text-slate-300 border-slate-600'}`}>
                      {PAYMENT_LABEL[order.paymentStatus] ?? order.paymentStatus}
                    </span>
                  </div>

                  {/* Fila 2: cliente */}
                  <p className="text-sm text-slate-200 truncate">
                    {name}
                    {order.customer?.phone && (
                      <span className="text-slate-400 text-xs ml-2">{order.customer.phone}</span>
                    )}
                  </p>

                  {/* Fila 3: totales + acción */}
                  <div className="flex items-center justify-between mt-2">
                    <div>
                      <span className="text-brand font-semibold text-sm">{fmt(order.total)}</span>
                      {isPartial && (
                        <span className="text-orange-400 text-xs ml-2">
                          Saldo: {fmt(remaining)}
                        </span>
                      )}
                    </div>

                    {isPaid ? (
                      <button
                        onClick={() => handleDeliver(order.orderId)}
                        className="text-xs bg-green-800/40 text-green-300 border border-green-700/60
                                   px-3 py-1.5 rounded-lg hover:bg-green-800/70 transition-colors font-medium"
                      >
                        Entregar
                      </button>
                    ) : (
                      <button
                        onClick={() => setPayingOrder(order)}
                        className="text-xs bg-brand text-slate-900 font-bold px-3 py-1.5 rounded-lg
                                   hover:bg-sky-400 transition-colors whitespace-nowrap"
                      >
                        💵 {isPartial ? `Cobrar ${fmt(remaining)}` : 'Cobrar'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* PaymentModal */}
      {payingOrder && (
        <PaymentModal
          orderOverride={payingOrder}
          onClose={() => setPayingOrder(null)}
          onSuccess={handlePaySuccess}
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
                <span className="text-slate-400">Total cobrado</span>
                <span className="text-white font-semibold">RD$ {receipt.paidAmount.toFixed(2)}</span>
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
    </div>
  );
}
