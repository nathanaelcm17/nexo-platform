import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { customersApi, type CustomerSnapshot } from '../lib/api';
import { usePosStore } from '../stores/pos.store';

function displayName(c: CustomerSnapshot): string {
  if (c.customerType === 'business') return c.businessName ?? c.customerCode;
  return [c.firstName, c.lastName].filter(Boolean).join(' ') || c.customerCode;
}

export function CustomerSearch() {
  const [query, setQuery]   = useState('');
  const [open,  setOpen]    = useState(false);
  const inputRef            = useRef<HTMLInputElement>(null);
  const { customer, setCustomer } = usePosStore(s => ({ customer: s.customer, setCustomer: s.setCustomer }));

  const { data: results = [], isFetching } = useQuery({
    queryKey: ['customers-search', query],
    queryFn:  () => customersApi.search(query),
    enabled:  query.length >= 2,
    staleTime: 10_000,
  });

  function selectCustomer(c: CustomerSnapshot) {
    setCustomer(c);
    setQuery('');
    setOpen(false);
  }

  function clearCustomer() {
    setCustomer(null);
    setQuery('');
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  if (customer) {
    return (
      <div className="flex items-center gap-3 bg-slate-800 border border-brand/40 rounded-xl px-4 py-3">
        <div className="w-9 h-9 rounded-full bg-brand/20 flex items-center justify-center text-brand font-bold flex-shrink-0">
          {displayName(customer)[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white truncate">{displayName(customer)}</p>
          <p className="text-xs text-slate-400">{customer.customerCode} {customer.phone ? `· ${customer.phone}` : ''}</p>
        </div>
        <button onClick={clearCustomer} className="text-slate-400 hover:text-white transition-colors text-lg leading-none">
          ×
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
        <input
          ref={inputRef}
          type="text"
          className="input-field pl-9"
          placeholder="Buscar cliente por nombre, teléfono o cédula…"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {isFetching && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">…</span>
        )}
      </div>

      {open && results.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full bg-slate-800 border border-slate-600 rounded-xl shadow-xl overflow-hidden">
          {results.map(c => (
            <li key={c.customerId}>
              <button
                onMouseDown={() => selectCustomer(c)}
                className="w-full text-left px-4 py-3 hover:bg-slate-700 transition-colors flex items-center gap-3"
              >
                <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center text-sm font-bold flex-shrink-0">
                  {displayName(c)[0]?.toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-white font-medium truncate">{displayName(c)}</p>
                  <p className="text-xs text-slate-400">{c.customerCode}{c.phone ? ` · ${c.phone}` : ''}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && query.length >= 2 && results.length === 0 && !isFetching && (
        <div className="absolute z-20 mt-1 w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-slate-400 text-sm">
          Sin resultados para "{query}"
        </div>
      )}
    </div>
  );
}
