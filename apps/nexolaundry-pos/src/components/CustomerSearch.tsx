import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { customersApi, type CustomerSnapshot, type CreateCustomerBody } from '../lib/api';
import { usePosStore } from '../stores/pos.store';

function displayName(c: CustomerSnapshot): string {
  if (c.customerType === 'business') return c.businessName ?? c.customerCode;
  return [c.firstName, c.lastName].filter(Boolean).join(' ') || c.customerCode;
}

export function CustomerSearch() {
  const [query,    setQuery]    = useState('');
  const [open,     setOpen]     = useState(false);
  const [showNew,  setShowNew]  = useState(false);
  const inputRef                = useRef<HTMLInputElement>(null);
  const { customer, setCustomer } = usePosStore(s => ({ customer: s.customer, setCustomer: s.setCustomer }));

  // New customer form state
  const [newType,        setNewType]        = useState<'individual' | 'business'>('individual');
  const [newFirstName,   setNewFirstName]   = useState('');
  const [newLastName,    setNewLastName]    = useState('');
  const [newBusinessName,setNewBusinessName] = useState('');
  const [newPhone,       setNewPhone]       = useState('');
  const [newDoc,         setNewDoc]         = useState('');
  const [creating,       setCreating]       = useState(false);
  const [createError,    setCreateError]    = useState('');

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

  function openNewModal() {
    setShowNew(true);
    setOpen(false);
    setNewFirstName(query);
    setNewLastName('');
    setNewBusinessName('');
    setNewPhone('');
    setNewDoc('');
    setCreateError('');
    setNewType('individual');
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError('');
    try {
      const body: CreateCustomerBody = {
        customerType:   newType,
        firstName:      newType === 'individual' ? newFirstName || undefined : undefined,
        lastName:       newType === 'individual' ? newLastName  || undefined : undefined,
        businessName:   newType === 'business'   ? newBusinessName || undefined : undefined,
        phone:          newPhone || undefined,
        documentNumber: newDoc   || undefined,
      };
      const result = await customersApi.create(body);
      const created: CustomerSnapshot = {
        customerId:   result.customerId,
        customerCode: result.customerCode,
        customerType: newType,
        firstName:    newType === 'individual' ? newFirstName  || undefined : undefined,
        lastName:     newType === 'individual' ? newLastName   || undefined : undefined,
        businessName: newType === 'business'   ? newBusinessName || undefined : undefined,
        phone:        newPhone || undefined,
        status:       'active',
      };
      selectCustomer(created);
      setShowNew(false);
      setQuery('');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Error al crear cliente');
    } finally {
      setCreating(false);
    }
  }

  // ── Cliente seleccionado ──────────────────────────────────────────────────
  if (customer) {
    return (
      <div className="flex items-center gap-3 bg-slate-800 border border-brand/40 rounded-xl px-4 py-3">
        <div className="w-9 h-9 rounded-full bg-brand/20 flex items-center justify-center text-brand font-bold flex-shrink-0">
          {displayName(customer)[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white truncate">{displayName(customer)}</p>
          <p className="text-xs text-slate-400">{customer.customerCode}{customer.phone ? ` · ${customer.phone}` : ''}</p>
        </div>
        <button onClick={clearCustomer} className="text-slate-400 hover:text-white transition-colors text-lg leading-none">
          ×
        </button>
      </div>
    );
  }

  // ── Buscador ─────────────────────────────────────────────────────────────
  return (
    <>
      <div className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
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
          <button
            type="button"
            onClick={openNewModal}
            className="btn-ghost text-sm px-3 whitespace-nowrap flex-shrink-0"
            title="Crear nuevo cliente"
          >
            + Nuevo
          </button>
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
          <div className="absolute z-20 mt-1 w-full bg-slate-800 border border-slate-600 rounded-xl shadow-xl overflow-hidden">
            <p className="px-4 py-3 text-slate-400 text-sm border-b border-slate-700">
              Sin resultados para "{query}"
            </p>
            <button
              onMouseDown={openNewModal}
              className="w-full text-left px-4 py-3 hover:bg-slate-700 transition-colors text-brand text-sm font-medium"
            >
              + Crear cliente "{query}"
            </button>
          </div>
        )}
      </div>

      {/* ── Modal nuevo cliente (portal → montado en document.body) ─────── */}
      {showNew && createPortal(
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[9999] p-4">
          <div className="card w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Nuevo cliente</h2>
              <button onClick={() => setShowNew(false)} className="text-slate-400 hover:text-white text-xl leading-none">×</button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3">
              {/* Tipo */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Tipo</label>
                  <select
                    className="input-field"
                    value={newType}
                    onChange={e => setNewType(e.target.value as 'individual' | 'business')}
                  >
                    <option value="individual">Persona</option>
                    <option value="business">Empresa</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Cédula / RNC <span className="text-slate-500">(opcional)</span></label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="001-1234567-8"
                    value={newDoc}
                    onChange={e => setNewDoc(e.target.value)}
                  />
                </div>
              </div>

              {/* Nombre */}
              {newType === 'individual' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-slate-300 mb-1">Nombre *</label>
                    <input
                      type="text"
                      className="input-field"
                      required
                      autoFocus
                      value={newFirstName}
                      onChange={e => setNewFirstName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-300 mb-1">Apellido</label>
                    <input
                      type="text"
                      className="input-field"
                      value={newLastName}
                      onChange={e => setNewLastName(e.target.value)}
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Razón social *</label>
                  <input
                    type="text"
                    className="input-field"
                    required
                    autoFocus
                    value={newBusinessName}
                    onChange={e => setNewBusinessName(e.target.value)}
                  />
                </div>
              )}

              {/* Teléfono */}
              <div>
                <label className="block text-sm text-slate-300 mb-1">Teléfono</label>
                <input
                  type="tel"
                  className="input-field"
                  placeholder="809-000-0000"
                  value={newPhone}
                  onChange={e => setNewPhone(e.target.value)}
                />
              </div>

              {createError && (
                <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm rounded-lg px-3 py-2">
                  {createError}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowNew(false)}
                  className="btn-ghost flex-1"
                  disabled={creating}
                >
                  Cancelar
                </button>
                <button type="submit" disabled={creating} className="btn-primary flex-1">
                  {creating ? 'Creando…' : 'Crear y seleccionar'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
