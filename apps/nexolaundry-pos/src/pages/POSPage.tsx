import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.store';
import { usePosStore } from '../stores/pos.store';
import { authApi } from '../lib/api';
import { CustomerSearch } from '../components/CustomerSearch';
import { CatalogGrid } from '../components/CatalogGrid';
import { OrderSidebar } from '../components/OrderSidebar';
import { PaymentModal } from '../components/PaymentModal';
import { CashModal } from '../components/CashModal';

interface SuccessTicket {
  ncf: string;
  invoiceNumber: string;
  change: number;
}

// IDs del tenant demo - generados por el provisioner
const DEMO_BRANCH_ID   = '50cb49d0-0c62-4582-8597-9e3fbae83835';
const DEMO_TERMINAL_ID = '6157a250-2bc1-4fa0-b6b9-3755ce6896ee';

export function POSPage() {
  const navigate  = useNavigate();
  const { user, clearAuth, refreshToken }  = useAuthStore(s => ({ user: s.user, clearAuth: s.clearAuth, refreshToken: s.refreshToken }));
  const { sessionId, setBranchId }         = usePosStore(s => ({ sessionId: s.sessionId, setBranchId: s.setBranchId }));

  const [showPayment, setShowPayment] = useState(false);
  const [showCash,    setShowCash]    = useState(!sessionId);
  const [confirming] = useState(false);
  const [ticket,      setTicket]      = useState<SuccessTicket | null>(null);

  async function handleLogout() {
    try { if (refreshToken) await authApi.logout(refreshToken); } catch { /* ignore */ }
    clearAuth();
    navigate('/login', { replace: true });
  }

  function handleCashOpened(sId: string) {
    setBranchId(DEMO_BRANCH_ID);
    usePosStore.getState().setSession(sId, DEMO_TERMINAL_ID);
    setShowCash(false);
  }

  function handleConfirmOrder() {
    setShowPayment(true);
  }

  function handlePaymentSuccess(result: SuccessTicket) {
    setShowPayment(false);
    setTicket(result);
  }

  return (
    <div className="h-screen flex flex-col bg-slate-900">
      {/* ── Header ── */}
      <header className="flex items-center justify-between px-4 py-2.5 bg-slate-800 border-b border-slate-700 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-brand font-bold text-lg">◈</span>
          <span className="font-semibold text-white">NexoLaundry POS</span>
        </div>

        <div className="flex items-center gap-4">
          {sessionId ? (
            <span className="text-xs bg-green-900/40 text-green-400 border border-green-700 px-2 py-1 rounded-full">
              ● Caja abierta
            </span>
          ) : (
            <button
              onClick={() => setShowCash(true)}
              className="text-xs bg-yellow-900/40 text-yellow-400 border border-yellow-700 px-2 py-1 rounded-full hover:bg-yellow-900/60"
            >
              ⚠ Abrir caja
            </button>
          )}

          <span className="text-sm text-slate-300 hidden sm:block">
            {user?.fullName}
          </span>

          <button onClick={handleLogout} className="btn-ghost text-sm py-1.5 px-3">
            Salir
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 min-h-0">
        {/* Left panel */}
        <main className="flex-1 flex flex-col p-4 gap-4 min-w-0 overflow-hidden">
          <CustomerSearch />
          <CatalogGrid />
        </main>

        {/* Right panel */}
        <OrderSidebar
          onConfirm={handleConfirmOrder}
          confirming={confirming}
        />
      </div>

      {/* ── Modals ── */}
      {showCash && (
        <CashModal
          branchId={DEMO_BRANCH_ID}
          onOpened={handleCashOpened}
        />
      )}

      {showPayment && (
        <PaymentModal
          onClose={() => setShowPayment(false)}
          onSuccess={handlePaymentSuccess}
        />
      )}

      {/* ── Success ticket ── */}
      {ticket && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-sm text-center space-y-4">
            <div className="text-5xl">✅</div>
            <h2 className="text-2xl font-bold text-white">¡Venta completada!</h2>

            <div className="bg-slate-900 rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Factura</span>
                <span className="text-white font-medium">{ticket.invoiceNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">NCF</span>
                <span className="text-brand font-mono font-medium">{ticket.ncf}</span>
              </div>
              {ticket.change > 0 && (
                <div className="flex justify-between border-t border-slate-700 pt-2 mt-2">
                  <span className="text-slate-400">Cambio</span>
                  <span className="text-green-400 font-bold">RD$ {ticket.change.toFixed(2)}</span>
                </div>
              )}
            </div>

            <button
              onClick={() => setTicket(null)}
              className="btn-primary w-full py-3 text-base"
            >
              Nueva venta
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
