import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cashApi } from '../lib/api';
import { usePosStore } from '../stores/pos.store';

interface CloseSessionModalProps {
  onClosed: () => void;
  onCancel: () => void;
}

const fmt = (n: number) => `RD$ ${n.toFixed(2)}`;

export function CloseSessionModal({ onClosed, onCancel }: CloseSessionModalProps) {
  const { sessionId, terminalId, clearSession } = usePosStore(s => ({
    sessionId:    s.sessionId,
    terminalId:   s.terminalId,
    clearSession: s.clearSession,
  }));

  const [closing, setClosing] = useState('');
  const [reason,  setReason]  = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [result,  setResult]  = useState<{ expectedCash: number; closingBalance: number; difference: number } | null>(null);

  const { data: session } = useQuery({
    queryKey: ['session-current', terminalId],
    queryFn:  () => cashApi.currentSession(terminalId!),
    enabled:  !!terminalId,
  });

  async function handleClose(e: React.FormEvent) {
    e.preventDefault();
    const balance = parseFloat(closing);
    if (isNaN(balance) || balance < 0) { setError('Ingresa un monto válido'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await cashApi.closeSession(sessionId!, {
        closingBalance:   balance,
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
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-sm space-y-5">
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
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Monto contado en caja (RD$)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="input-field text-lg"
              placeholder="0.00"
              value={closing}
              onChange={e => setClosing(e.target.value)}
              required
              autoFocus
            />
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
            <button type="submit" disabled={loading} className="btn-danger flex-1">
              {loading ? 'Cerrando…' : 'Cerrar caja'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
