import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { ordersDetailApi, laundryApi } from '../lib/api';

const fmt = (n: number) => `RD$ ${n.toFixed(2)}`;

const STATUS_LABEL: Record<string, string> = {
  draft:          'Borrador',
  confirmed:      'Confirmada',
  in_fulfillment: 'En producción',
  ready:          'Lista para retiro',
  delivered:      'Entregada',
  cancelled:      'Cancelada',
};
const STATUS_CLASS: Record<string, string> = {
  draft:          'bg-slate-700 text-slate-300',
  confirmed:      'bg-blue-900/50 text-blue-300 border border-blue-700',
  in_fulfillment: 'bg-yellow-900/50 text-yellow-300 border border-yellow-700',
  ready:          'bg-green-900/50 text-green-300 border border-green-700',
  delivered:      'bg-slate-700 text-slate-400',
  cancelled:      'bg-red-900/30 text-red-400 border border-red-700',
};
const PRIORITY_LABEL: Record<string, string> = {
  normal: 'Normal', express: 'Express', same_day: 'Mismo día',
};
const PAYMENT_LABEL: Record<string, string> = {
  unpaid: 'Sin pagar', partial: 'Pago parcial', paid: 'Pagado',
};
const PAYMENT_CLASS: Record<string, string> = {
  unpaid:  'text-orange-400',
  partial: 'text-yellow-400',
  paid:    'text-green-400',
};

function timeStr(iso: string) {
  return new Date(iso).toLocaleString('es-DO', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

interface OrderDetailModalProps {
  orderId: string;
  onClose: () => void;
}

export function OrderDetailModal({ orderId, onClose }: OrderDetailModalProps) {
  const { data: detail, isLoading: loadingOrder } = useQuery({
    queryKey: ['order-detail', orderId],
    queryFn:  () => ordersDetailApi.getById(orderId),
  });

  const { data: workOrder, isLoading: loadingWO } = useQuery({
    queryKey: ['work-order-for-order', orderId],
    queryFn:  () => laundryApi.orderWorkOrder(orderId),
    retry:    false,
  });

  const modal = (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-[9999] p-0 sm:p-4">
      <div className="bg-slate-900 w-full sm:max-w-2xl sm:rounded-2xl flex flex-col max-h-[92vh] sm:max-h-[85vh] border border-slate-700 shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            {detail ? (
              <>
                <span className="font-mono font-bold text-white text-lg">{detail.orderNumber}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_CLASS[detail.status] ?? 'bg-slate-700 text-slate-300'}`}>
                  {STATUS_LABEL[detail.status] ?? detail.status}
                </span>
              </>
            ) : (
              <span className="text-slate-400 text-sm animate-pulse">Cargando…</span>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none">×</button>
        </div>

        {/* Contenido scrollable */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">

          {/* Cliente */}
          {detail?.customer && (
            <div className="bg-slate-800 rounded-xl px-4 py-3">
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">Cliente</p>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-white font-semibold text-sm truncate">
                    {detail.customer.customerType === 'business'
                      ? detail.customer.businessName ?? detail.customer.customerCode ?? '—'
                      : [detail.customer.firstName, detail.customer.lastName].filter(Boolean).join(' ') || detail.customer.customerCode || '—'
                    }
                  </p>
                  {detail.customer.phone && (
                    <p className="text-slate-400 text-xs mt-0.5">{detail.customer.phone}</p>
                  )}
                  {detail.customer.documentNumber && (
                    <p className="text-slate-500 text-xs mt-0.5">
                      {detail.customer.documentType === 'rnc' ? 'RNC' : 'Cédula'}: {detail.customer.documentNumber}
                    </p>
                  )}
                </div>
                {detail.customer.customerCode && (
                  <span className="font-mono text-xs text-brand bg-slate-900 px-2 py-1 rounded-lg flex-shrink-0">
                    {detail.customer.customerCode}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Meta-info */}
          {detail && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div className="bg-slate-800 rounded-xl p-3">
                <p className="text-slate-400 text-xs mb-0.5">Prioridad</p>
                <p className="text-white font-medium">{PRIORITY_LABEL[detail.priority] ?? detail.priority}</p>
              </div>
              <div className="bg-slate-800 rounded-xl p-3">
                <p className="text-slate-400 text-xs mb-0.5">Recibida</p>
                <p className="text-white font-medium">{timeStr(detail.receivedAt)}</p>
              </div>
              <div className="bg-slate-800 rounded-xl p-3">
                <p className="text-slate-400 text-xs mb-0.5">Pago</p>
                <p className={`font-medium ${PAYMENT_CLASS[detail.paymentStatus] ?? 'text-white'}`}>
                  {PAYMENT_LABEL[detail.paymentStatus] ?? detail.paymentStatus}
                </p>
              </div>
              {detail.confirmedAt && (
                <div className="bg-slate-800 rounded-xl p-3">
                  <p className="text-slate-400 text-xs mb-0.5">Confirmada</p>
                  <p className="text-white font-medium">{timeStr(detail.confirmedAt)}</p>
                </div>
              )}
              {detail.readyAt && (
                <div className="bg-slate-800 rounded-xl p-3">
                  <p className="text-slate-400 text-xs mb-0.5">Lista</p>
                  <p className="text-green-400 font-medium">{timeStr(detail.readyAt)}</p>
                </div>
              )}
              {detail.deliveredAt && (
                <div className="bg-slate-800 rounded-xl p-3">
                  <p className="text-slate-400 text-xs mb-0.5">Entregada</p>
                  <p className="text-brand font-medium">{timeStr(detail.deliveredAt)}</p>
                </div>
              )}
            </div>
          )}

          {detail?.notes && (
            <div className="bg-slate-800 rounded-xl px-4 py-3">
              <p className="text-xs text-slate-400 mb-1">Notas</p>
              <p className="text-slate-200 text-sm">{detail.notes}</p>
            </div>
          )}

          {/* Líneas */}
          {loadingOrder && <p className="text-slate-400 text-sm text-center py-4">Cargando…</p>}
          {detail && detail.lines.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wide">Servicios</h3>
              <div className="space-y-2">
                {detail.lines.map(line => (
                  <div key={line.lineId} className="flex items-center justify-between bg-slate-800 rounded-xl px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-white text-sm font-medium truncate">{line.description}</p>
                      <p className="text-slate-400 text-xs mt-0.5">
                        {line.quantity} {line.unitOfMeasure} × {fmt(line.unitPrice)}
                        {line.discount > 0 && ` − desc. ${fmt(line.discount)}`}
                      </p>
                    </div>
                    <span className="text-brand font-semibold text-sm flex-shrink-0 ml-4">
                      {fmt(line.lineTotal)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Totales */}
          {detail && (
            <div className="bg-slate-800 rounded-xl px-4 py-3 space-y-1.5 text-sm">
              <div className="flex justify-between text-slate-300">
                <span>Subtotal</span><span>{fmt(detail.subtotal)}</span>
              </div>
              {detail.discount > 0 && (
                <div className="flex justify-between text-slate-300">
                  <span>Descuento</span><span>−{fmt(detail.discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-300">
                <span>ITBIS 18%</span><span>{fmt(detail.taxTotal)}</span>
              </div>
              <div className="flex justify-between font-bold text-white border-t border-slate-700 pt-2 mt-1 text-base">
                <span>Total</span><span className="text-brand">{fmt(detail.total)}</span>
              </div>
              {detail.paidAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Pagado</span>
                  <span className="text-green-400">{fmt(detail.paidAmount)}</span>
                </div>
              )}
              {detail.paymentStatus !== 'paid' && detail.paidAmount < detail.total && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Pendiente</span>
                  <span className="text-orange-400 font-medium">{fmt(detail.total - detail.paidAmount)}</span>
                </div>
              )}
            </div>
          )}

          {/* Producción / Trazabilidad */}
          {!loadingWO && workOrder && (
            <div>
              <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wide">
                Producción — Work Order
              </h3>
              <div className="space-y-4">
                {workOrder.items.map(item => (
                  <div key={item.productionItemId} className="bg-slate-800 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
                      <div>
                        <span className="font-mono text-xs text-brand">{item.barcode}</span>
                        <p className="text-white text-sm mt-0.5">{item.description}</p>
                      </div>
                      {item.currentStageName && (
                        <span className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded-lg flex-shrink-0 ml-3">
                          📍 {item.currentStageName}
                        </span>
                      )}
                    </div>

                    {item.transitions.length > 0 ? (
                      <div className="px-4 py-3">
                        <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Historial</p>
                        <div className="space-y-2">
                          {item.transitions.map((t, idx) => (
                            <div key={t.transitionId} className="flex items-start gap-3">
                              <div className="flex flex-col items-center flex-shrink-0">
                                <div className={`w-2.5 h-2.5 rounded-full mt-0.5 ${t.rejected ? 'bg-red-500' : 'bg-brand'}`} />
                                {idx < item.transitions.length - 1 && (
                                  <div className="w-px flex-1 bg-slate-700 my-1" style={{ minHeight: 12 }} />
                                )}
                              </div>
                              <div className="pb-1">
                                <p className="text-xs text-white">
                                  {t.fromStage
                                    ? <><span className="text-slate-400">{t.fromStage}</span> → <span className="font-medium">{t.toStage}</span></>
                                    : <span className="font-medium">Ingresado en {t.toStage}</span>
                                  }
                                  {t.rejected && <span className="text-red-400 ml-1">(rechazado)</span>}
                                </p>
                                <p className="text-xs text-slate-500 mt-0.5">{timeStr(t.occurredAt)}</p>
                                {t.notes && <p className="text-xs text-slate-400 italic mt-0.5">"{t.notes}"</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="px-4 py-3 text-xs text-slate-500">Sin movimientos registrados aún</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {detail?.cancelledReason && (
            <div className="bg-red-900/20 border border-red-700/40 rounded-xl px-4 py-3">
              <p className="text-xs text-red-400 font-medium mb-0.5">Motivo de cancelación</p>
              <p className="text-slate-300 text-sm">{detail.cancelledReason}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-700 flex-shrink-0">
          <button onClick={onClose} className="btn-ghost w-full py-2.5">Cerrar</button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
