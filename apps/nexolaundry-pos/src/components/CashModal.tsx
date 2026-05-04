import { useState } from 'react';
import { cashApi } from '../lib/api';
import { usePosStore } from '../stores/pos.store';

interface CashModalProps {
  branchId: string;
  onOpened: (sessionId: string) => void;
}

export function CashModal({ branchId, onOpened }: CashModalProps) {
  const [terminalId,      setTerminalId]      = useState('6157a250-2bc1-4fa0-b6b9-3755ce6896ee');
  const [openingBalance,  setOpeningBalance]  = useState('');
  const [error,           setError]           = useState('');
  const [loading,         setLoading]         = useState(false);
  const { setSession, setBranchId }           = usePosStore(s => ({ setSession: s.setSession, setBranchId: s.setBranchId }));

  async function handleOpen(e: React.FormEvent) {
    e.preventDefault();
    const balance = parseFloat(openingBalance);
    if (!terminalId || isNaN(balance)) { setError('Completa todos los campos'); return; }
    setError('');
    setLoading(true);
    try {
      const { sessionId } = await cashApi.openSession({ terminalId, branchId, openingBalance: balance });
      setSession(sessionId, terminalId);
      setBranchId(branchId);
      onOpened(sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al abrir caja');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-sm space-y-5">
        <div className="text-center">
          <div className="text-3xl mb-2">🏦</div>
          <h2 className="text-xl font-bold text-white">Apertura de caja</h2>
          <p className="text-slate-400 text-sm mt-1">Ingresa el monto inicial antes de operar</p>
        </div>

        <form onSubmit={handleOpen} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">ID de terminal</label>
            <input
              type="text"
              className="input-field"
              placeholder="ej. terminal-01 (UUID)"
              value={terminalId}
              onChange={e => setTerminalId(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Monto de apertura (RD$)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="input-field"
              placeholder="0.00"
              value={openingBalance}
              onChange={e => setOpeningBalance(e.target.value)}
              required
            />
          </div>

          {error && (
            <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full py-3">
            {loading ? 'Abriendo…' : 'Abrir caja'}
          </button>
        </form>
      </div>
    </div>
  );
}
