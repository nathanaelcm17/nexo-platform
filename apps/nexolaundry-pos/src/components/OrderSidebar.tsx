import { usePosStore, type OrderPriority } from '../stores/pos.store';

interface OrderSidebarProps {
  onConfirm:  () => void;
  confirming: boolean;
}

const fmt = (n: number) => `RD$ ${n.toFixed(2)}`;

const PRIORITIES: { id: OrderPriority; label: string; desc: string; activeClass: string }[] = [
  { id: 'normal',   label: 'Normal',    desc: '',     activeClass: 'bg-slate-500 text-white' },
  { id: 'express',  label: 'Express',   desc: '',     activeClass: 'bg-yellow-600 text-white' },
  { id: 'same_day', label: 'Mismo día', desc: '',     activeClass: 'bg-red-600 text-white' },
];

export function OrderSidebar({ onConfirm, confirming }: OrderSidebarProps) {
  const {
    lines, customer,
    increment, decrement, removeItem,
    subtotal, itbis, total,
    priority, setPriority,
    promisedAt, setPromisedAt,
    notes, setNotes,
  } = usePosStore(s => ({
    lines:        s.lines,
    customer:     s.customer,
    increment:    s.increment,
    decrement:    s.decrement,
    removeItem:   s.removeItem,
    subtotal:     s.subtotal,
    itbis:        s.itbis,
    total:        s.total,
    priority:     s.priority,
    setPriority:  s.setPriority,
    promisedAt:   s.promisedAt,
    setPromisedAt: s.setPromisedAt,
    notes:        s.notes,
    setNotes:     s.setNotes,
  }));

  const sub     = subtotal();
  const tax     = itbis();
  const tot     = total();
  const isEmpty = lines.length === 0;

  return (
    <aside className="w-80 xl:w-96 bg-slate-800 border-l border-slate-700 flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-700 flex-shrink-0">
        <h2 className="font-semibold text-white">Orden actual</h2>
        {customer && (
          <p className="text-xs text-brand mt-0.5">
            {customer.customerType === 'business'
              ? customer.businessName ?? customer.customerCode
              : [customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.customerCode}
          </p>
        )}
      </div>

      {/* Lines */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {isEmpty && (
          <p className="text-slate-500 text-sm text-center mt-8">Agrega artículos del catálogo</p>
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

      {/* Prioridad */}
      <div className="px-4 py-3 border-t border-slate-700 flex-shrink-0">
        <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">Prioridad</p>
        <div className="flex gap-1">
          {PRIORITIES.map(p => (
            <button
              key={p.id}
              onClick={() => setPriority(p.id)}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                priority === p.id
                  ? p.activeClass
                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Fecha prometida */}
      <div className="px-4 pb-2 flex-shrink-0">
        <label className="block text-xs text-slate-400 uppercase tracking-wide mb-1">Fecha prometida</label>
        <input
          type="datetime-local"
          className="input-field text-sm"
          value={promisedAt}
          onChange={e => setPromisedAt(e.target.value)}
        />
      </div>

      {/* Notas */}
      <div className="px-4 pb-3 flex-shrink-0">
        <label className="block text-xs text-slate-400 uppercase tracking-wide mb-1">Notas</label>
        <textarea
          className="input-field text-sm resize-none"
          rows={2}
          placeholder="Instrucciones especiales…"
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
      </div>

      {/* Totales */}
      <div className="px-4 py-3 border-t border-slate-700 flex-shrink-0 space-y-1">
        <div className="flex justify-between text-sm text-slate-300">
          <span>Subtotal</span><span>{fmt(sub)}</span>
        </div>
        <div className="flex justify-between text-sm text-slate-300">
          <span>ITBIS (18%)</span><span>{fmt(tax)}</span>
        </div>
        <div className="flex justify-between text-base font-bold text-white border-t border-slate-600 pt-2 mt-2">
          <span>TOTAL</span><span className="text-brand">{fmt(tot)}</span>
        </div>
      </div>

      {/* Botón confirmar */}
      <div className="px-4 py-3 flex-shrink-0">
        <button
          disabled={isEmpty || !customer || confirming}
          onClick={onConfirm}
          className="btn-primary w-full py-3 text-base"
        >
          {confirming
            ? 'Procesando…'
            : isEmpty
              ? 'Sin artículos'
              : !customer
                ? 'Selecciona cliente'
                : `Confirmar · ${fmt(tot)}`}
        </button>
        {!customer && !isEmpty && (
          <p className="text-xs text-slate-400 text-center mt-1">Selecciona un cliente para continuar</p>
        )}
      </div>
    </aside>
  );
}
