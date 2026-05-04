import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cashApi } from '../lib/api';
import { usePosStore } from '../stores/pos.store';

interface CloseSessionModalProps {
  onClosed: () => void;
  onCancel: () => void;
}

const DENOMINATIONS = [2000, 1000, 500, 200, 100, 50, 25, 10];

const fmt = (n: number) => `RD$ ${n.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;

export function CloseSessionModal({ onClosed, onCancel }: CloseSessionModalProps) {
  const { sessionId, terminalId, clearSession } = usePosStore(s => ({
    sessionId:    s.sessionId,
    terminalId:   s.terminalId,
    clearSession: s.clearSession,
  }));

  const [denoms,  setDenoms]  = useState<Record<string, number>>({});
  const [coins,   setCoins]   = useState('');
  const [reason,  setReason]  = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [result,  setResult]  = useState<{ expectedCash: number; closingBalance: number; difference: number } | null>(null);

  const { data: session } = useQuery({
    queryKey: ['session-current', terminalId],
    queryFn:  () => cashApi.currentSession(terminalId!),
    enabled:  !!terminalId,
  });

  const closingBalance = DENOMINATIONS.reduce((sum, d) => sum + d * (denoms[String(d)] || 0), 0)
    + (parseFloat(coins) || 0);

  function setDenom(d: number, val: string) {
    const n = parseInt(val) || 0;
    setDenoms(prev => ({ ...prev, [String(d)]: n }));
  }

  // Pre-calcular diferencia en tiempo real
  const expectedPreview = session ? session.openingBalance : null;
  const diffPreview = expectedPreview !== null ? closingBalance - expectedPreview : null;

  async function handleClose(e: React.FormEvent) {
    e.preventDefault();
    if (closingBalance < 0) { setError('Ingresa un monto válido'); return; }
    setError('');
    setLoading(true);

    const closingDenominations: Record<string, number> = {};
    DENOMINATIONS.forEach(d => { if (denoms[String(d)] > 0) closingDenominations[String(d)] = denoms[String(d)]; });
    if (parseFloat(coins) > 0) closingDenominations['coins'] = parseFloat(coins);

    try {
      const res = await cashApi.closeSession(sessionId!, {
        closingBalance,
        differenceReason: reason.trim() || undefined,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cerrar caja');
    } finally {
      setLoading(false);
    }
  }

  function handleDone() {
    clearSession();
    onClosed();
  }

  if (result) {
    const diff      = result.difference;
    const diffColor = diff === 0 ? 'text-green-400' : diff > 0 ? 'text-blue-400' : 'text-red-400';
    const diffLabel = diff === 0 ? 'Sin diferencia' : diff > 0 ? 'Sobrante' : 'Faltante';
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="card w-full max-w-sm space-y-5 text-center">
          <div className="text-5xl">🏦</div>
          <h2 className="text-xl font-bold text-white">Caja cerrada</h2>
          <div className="bg-slate-900 rounded-xl p-4 space-y-3 text-sm text-left">
            <div className="flex justify-between">
              <span className="text-slate-400">Efectivo esperado</span>
              <span className="text-white">{fmt(result.expectedCash)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Efectivo contado</span>
              <span className="text-white">{fmt(result.closingBalance)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-700 pt-2 font-semibold">
              <span className="text-slate-400">{diffLabel}</span>
              <span className={diffColor}>{fmt(Math.abs(diff))}</span>
            </div>
          </div>
          <button onClick={handleDone} className="btn-primary w-full py-3">Listo</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="card w-full max-w-md space-y-5 my-4">
        <div className="text-center">
          <div className="text-3xl mb-2">🔒</div>
          <h2 className="text-xl font-bold text-white">Cierre de caja</h2>
          {session && (
            <p className="text-slate-400 text-sm mt-1">
              Apertura: <span className="text-white font-medium">{fmt(session.openingBalance)}</span>
            </p>
          )}
        </div>

        <form onSubmit={handleClose} className="space-y-4">
          {/* Denomination grid */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Cuenta el efectivo por denominación
            </label>
            <div className="grid grid-cols-2 gap-2">
              {DENOMINATIONS.map(d => (
                <div key={d} className="flex items-center gap-2 bg-slate-900 rounded-lg px-3 py-2">
                  <span className="text-slate-400 text-sm w-14 flex-shrink-0">RD$ {d}</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="w-full bg-transparent text-white text-sm text-right outline-none placeholder-slate-600"
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

          {/* Live totals */}
          <div className="bg-slate-900 rounded-xl px-4 py-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Total contado</span>
              <span className={`font-bold ${closingBalance > 0 ? 'text-white' : 'text-slate-500'}`}>
                {fmt(closingBalance)}
              </span>
            </div>
            {diffPreview !== null && closingBalance > 0 && (
              <div className="flex justify-between border-t border-slate-700 pt-2">
                <span className="text-slate-400">Diferencia estimada</span>
                <span className={`font-semibold ${diffPreview === 0 ? 'text-green-400' : diffPreview > 0 ? 'text-blue-400' : 'text-red-400'}`}>
                  {diffPreview >= 0 ? '+' : ''}{fmt(diffPreview)}
                </span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Razón de diferencia <span className="text-slate-500">(opcional)</span>
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="Ej. Error de cambio en venta #005"
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
          </div>

          {error && (
            <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button type="button" onClick={onCancel} className="btn-ghost flex-1" disabled={loading}>
              Cancelar
            </button>
            <button type="submit" disabled={loading || closingBalance < 0} className="btn-danger flex-1">
              {loading ? 'Cerrando…' : 'Cerrar caja'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
