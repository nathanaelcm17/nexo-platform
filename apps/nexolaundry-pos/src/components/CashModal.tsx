import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cashApi, branchesApi, type Branch, type Terminal } from '../lib/api';
import { usePosStore } from '../stores/pos.store';

interface CashModalProps {
  onOpened: (sessionId: string, branchId: string) => void;
}

const DENOMINATIONS = [2000, 1000, 500, 200, 100, 50, 25, 10];

const fmt = (n: number) => `RD$ ${n.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;

export function CashModal({ onOpened }: CashModalProps) {
  const { setSession, setBranchId } = usePosStore(s => ({ setSession: s.setSession, setBranchId: s.setBranchId }));

  const [selectedBranch,   setSelectedBranch]   = useState<Branch | null>(null);
  const [selectedTerminal, setSelectedTerminal] = useState<Terminal | null>(null);
  const [denoms,  setDenoms]  = useState<Record<string, number>>({});
  const [coins,   setCoins]   = useState('');
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);

  const { data: branches = [], isLoading: loadingBranches } = useQuery({
    queryKey: ['branches'],
    queryFn:  branchesApi.list,
  });

  const { data: terminals = [], isLoading: loadingTerminals } = useQuery({
    queryKey: ['terminals', selectedBranch?.branch_id],
    queryFn:  () => branchesApi.terminals(selectedBranch!.branch_id),
    enabled:  !!selectedBranch,
  });

  // Auto-seleccionar si solo hay una branch/terminal
  useEffect(() => {
    if (branches.length === 1) setSelectedBranch(branches[0]);
  }, [branches]);

  useEffect(() => {
    if (terminals.length === 1) setSelectedTerminal(terminals[0]);
  }, [terminals]);

  // Verificar si el terminal ya tiene sesión abierta
  useEffect(() => {
    if (!selectedTerminal) return;
    let cancelled = false;
    setChecking(true);
    cashApi.currentSession(selectedTerminal.terminal_id)
      .then(existing => {
        if (!cancelled && existing?.sessionId) {
          setSession(existing.sessionId, selectedTerminal.terminal_id);
          setBranchId(selectedBranch?.branch_id ?? '');
          onOpened(existing.sessionId, selectedBranch?.branch_id ?? '');
        }
      })
      .catch(() => { /* sin sesión activa */ })
      .finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTerminal]);

  const totalFromDenoms = DENOMINATIONS.reduce((sum, d) => sum + d * (denoms[String(d)] || 0), 0)
    + (parseFloat(coins) || 0);

  function setDenom(d: number, val: string) {
    const n = parseInt(val) || 0;
    setDenoms(prev => ({ ...prev, [String(d)]: n }));
  }

  async function handleOpen(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedBranch || !selectedTerminal) { setError('Selecciona sucursal y terminal'); return; }
    if (totalFromDenoms <= 0) { setError('Ingresa el monto de apertura'); return; }
    setError('');
    setLoading(true);
    try {
      const openingDenominations: Record<string, number> = {};
      DENOMINATIONS.forEach(d => { if (denoms[String(d)] > 0) openingDenominations[String(d)] = denoms[String(d)]; });
      if (parseFloat(coins) > 0) openingDenominations['coins'] = parseFloat(coins);

      const { sessionId } = await cashApi.openSession({
        terminalId:           selectedTerminal.terminal_id,
        branchId:             selectedBranch.branch_id,
        openingBalance:       totalFromDenoms,
        openingDenominations,
      });
      setSession(sessionId, selectedTerminal.terminal_id);
      setBranchId(selectedBranch.branch_id);
      onOpened(sessionId, selectedBranch.branch_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al abrir caja');
    } finally {
      setLoading(false);
    }
  }

  if (loadingBranches || checking) {
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
        <div className="card w-full max-w-sm text-center py-8">
          <p className="text-slate-400 text-sm animate-pulse">
            {checking ? 'Verificando sesión de caja…' : 'Cargando sucursales…'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="card w-full max-w-md space-y-5 my-4">
        <div className="text-center">
          <div className="text-3xl mb-2">🏦</div>
          <h2 className="text-xl font-bold text-white">Apertura de caja</h2>
          <p className="text-slate-400 text-sm mt-1">Selecciona el terminal y cuenta el efectivo inicial</p>
        </div>

        <form onSubmit={handleOpen} className="space-y-4">
          {/* Branch selector */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Sucursal</label>
            <select
              className="input-field"
              value={selectedBranch?.branch_id ?? ''}
              onChange={e => {
                const b = branches.find(x => x.branch_id === e.target.value) ?? null;
                setSelectedBranch(b);
                setSelectedTerminal(null);
              }}
              required
            >
              <option value="">Seleccionar sucursal…</option>
              {branches.map(b => (
                <option key={b.branch_id} value={b.branch_id}>{b.name}</option>
              ))}
            </select>
          </div>

          {/* Terminal selector */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Terminal</label>
            <select
              className="input-field"
              value={selectedTerminal?.terminal_id ?? ''}
              onChange={e => setSelectedTerminal(terminals.find(t => t.terminal_id === e.target.value) ?? null)}
              disabled={!selectedBranch || loadingTerminals}
              required
            >
              <option value="">
                {!selectedBranch ? 'Selecciona una sucursal primero' : loadingTerminals ? 'Cargando…' : 'Seleccionar terminal…'}
              </option>
              {terminals.map(t => (
                <option key={t.terminal_id} value={t.terminal_id}>{t.name}</option>
              ))}
            </select>
          </div>

          {/* Denomination grid */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Desglose de efectivo <span className="text-slate-500">(billetes y monedas)</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {DENOMINATIONS.map(d => (
                <div key={d} className="flex items-center gap-2 bg-slate-900 rounded-lg px-3 py-2">
                  <span className="text-slate-400 text-sm w-14 flex-shrink-0">RD$ {d}</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="w-full bg-transparent text-white text-sm text-right outline-none placeholder-slate-600 focus:ring-0"
                    placeholder="0"
                    value={denoms[String(d)] || ''}
                    onChange={e => setDenom(d, e.target.value)}
                  />
                  <span className="text-slate-600 text-xs flex-shrink-0">uds</span>
                </div>
              ))}
              <div className="flex items-center gap-2 bg-slate-900 rounded-lg px-3 py-2 col-span-2">
                <span className="text-slate-400 text-sm w-24 flex-shrink-0">Monedas</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full bg-transparent text-white text-sm text-right outline-none placeholder-slate-600"
                  placeholder="0.00"
                  value={coins}
                  onChange={e => setCoins(e.target.value)}
                />
                <span className="text-slate-600 text-xs flex-shrink-0">RD$</span>
              </div>
            </div>
          </div>

          {/* Total */}
          <div className="bg-slate-900 rounded-xl px-4 py-3 flex justify-between items-center">
            <span className="text-slate-400 text-sm">Total apertura</span>
            <span className={`font-bold text-lg ${totalFromDenoms > 0 ? 'text-brand' : 'text-slate-500'}`}>
              {fmt(totalFromDenoms)}
            </span>
          </div>

          {error && (
            <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading || totalFromDenoms <= 0} className="btn-primary w-full py-3">
            {loading ? 'Abriendo…' : 'Abrir caja'}
          </button>
        </form>
      </div>
    </div>
  );
}
