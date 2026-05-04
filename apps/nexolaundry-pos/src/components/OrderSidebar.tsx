import { usePosStore } from '../stores/pos.store';

interface OrderSidebarProps {
  onConfirm: () => void;
  confirming: boolean;
}

const fmt = (n: number) => `RD$ ${n.toFixed(2)}`;

export function OrderSidebar({ onConfirm, confirming }: OrderSidebarProps) {
  const { lines, customer, increment, decrement, removeItem, subtotal, itbis, total } =
    usePosStore(s => ({
      lines:      s.lines,
      customer:   s.customer,
      increment:  s.increment,
      decrement:  s.decrement,
      removeItem: s.removeItem,
      subtotal:   s.subtotal,
      itbis:      s.itbis,
      total:      s.total,
    }));

  const sub  = subtotal();
  const tax  = itbis();
  const tot  = total();
  const isEmpty = lines.length === 0;

  return (
    <aside className="w-80 xl:w-96 bg-slate-800 border-l border-slate-700 flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-700 flex-shrink-0">
        <h2 className="font-semibold text-white">Orden actual</h2>
        {customer && (
          <p className="text-xs text-brand mt-0.5">
            Cliente: {customer.firstName ? `${customer.firstName} ${customer.lastName ?? ''}`.trim() : customer.businessName ?? customer.customerCode}
          </p>
        )}
      </div>

      {/* Lines */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {isEmpty && (
          <p className="text-slate-500 text-sm text-center mt-8">
            Agrega artículos del catálogo
          </p>
        )}

        {lines.map(line => (
          <div key={line.catalogItemId} className="bg-slate-900/60 rounded-lg p-3">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">{line.name}</p>
                <p className="text-xs text-slate-400">{fmt(line.unitPrice)} × {line.quantity}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <p className="text-sm font-semibold text-brand">{fmt(line.lineTotal)}</p>
                <button
                  onClick={() => removeItem(line.catalogItemId)}
                  className="text-slate-500 hover:text-red-400 transition-colors ml-1 text-lg leading-none"
                >
                  ×
                </button>
              </div>
            </div>
            {/* Qty controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => decrement(line.catalogItemId)}
                className="w-7 h-7 rounded bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-white font-bold transition-colors"
              >
                −
              </button>
              <span className="text-white font-semibold w-6 text-center text-sm">{line.quantity}</span>
              <button
                onClick={() => increment(line.catalogItemId)}
                className="w-7 h-7 rounded bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-white font-bold transition-colors"
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div className="px-4 py-3 border-t border-slate-700 flex-shrink-0 space-y-1">
        <div className="flex justify-between text-sm text-slate-300">
          <span>Subtotal</span>
          <span>{fmt(sub)}</span>
        </div>
        <div className="flex justify-between text-sm text-slate-300">
          <span>ITBIS (18%)</span>
          <span>{fmt(tax)}</span>
        </div>
        <div className="flex justify-between text-base font-bold text-white border-t border-slate-600 pt-2 mt-2">
          <span>TOTAL</span>
          <span className="text-brand">{fmt(tot)}</span>
        </div>
      </div>

      {/* Action */}
      <div className="px-4 py-3 flex-shrink-0">
        <button
          disabled={isEmpty || !customer || confirming}
          onClick={onConfirm}
          className="btn-primary w-full py-3 text-base"
        >
          {confirming ? 'Procesando…' : isEmpty ? 'Sin artículos' : !customer ? 'Selecciona cliente' : `Confirmar · ${fmt(tot)}`}
        </button>
        {!customer && !isEmpty && (
          <p className="text-xs text-slate-400 text-center mt-1">Selecciona un cliente para continuar</p>
        )}
      </div>
    </aside>
  );
}
