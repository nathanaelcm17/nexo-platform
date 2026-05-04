import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.store';
import { usePosStore } from '../stores/pos.store';
import { authApi } from '../lib/api';
import { CustomerSearch }    from '../components/CustomerSearch';
import { CatalogGrid }       from '../components/CatalogGrid';
import { OrderSidebar }      from '../components/OrderSidebar';
import { PaymentModal, type SaleReceipt } from '../components/PaymentModal';
import { CashModal }         from '../components/CashModal';
import { CloseSessionModal } from '../components/CloseSessionModal';
import { OrderHistory }          from '../components/OrderHistory';
import { ProductionDashboard }   from '../components/ProductionDashboard';

type ActiveTab = 'sale' | 'orders' | 'production';

const METHOD_LABEL: Record<string, string> = {
  cash: 'Efectivo', card_manual: 'Tarjeta', transfer: 'Transferencia', credit: 'Crédito',
};

function printReceipt(ticket: SaleReceipt) {
  const w = window.open('', '_blank', 'width=320,height=720,toolbar=0,menubar=0,scrollbars=1');
  if (!w) return;

  const linesHtml = ticket.lines.map(l => `
    <tr>
      <td>${l.name}</td>
      <td style="text-align:center">${l.quantity}&nbsp;${l.unitOfMeasure}</td>
      <td style="text-align:right">RD$&nbsp;${l.lineTotal.toFixed(2)}</td>
    </tr>`).join('');

  const pendiente = ticket.isPartial
    ? `<div class="row warn"><span>Saldo pendiente</span><span>RD$ ${(ticket.total - ticket.paidAmount).toFixed(2)}</span></div>`
    : '';

  const cambio = ticket.change > 0
    ? `<div class="row"><span>Cambio</span><span>RD$ ${ticket.change.toFixed(2)}</span></div>`
    : '';

  const dt = new Date(ticket.issuedAt);
  const fecha = dt.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' });
  const hora  = dt.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });

  w.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Recibo ${ticket.invoiceNumber}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Courier New',monospace;font-size:12px;width:280px;margin:0 auto;padding:12px 8px;color:#000}
  .center{text-align:center}
  .bold{font-weight:bold}
  .large{font-size:16px}
  .divider{border-top:1px dashed #000;margin:8px 0}
  .row{display:flex;justify-content:space-between;margin:2px 0}
  .row.warn{color:#b45309;font-weight:bold}
  table{width:100%;border-collapse:collapse;margin:4px 0;font-size:11px}
  td{padding:2px 2px;vertical-align:top}
  thead td{font-weight:bold;border-bottom:1px solid #000}
  @media print{body{width:100%}}
</style>
</head><body>
  <div class="center bold large">NexoLaundry</div>
  <div class="center">Lavandería Profesional</div>
  <div class="divider"></div>
  <div class="row"><span>${fecha}</span><span>${hora}</span></div>
  <div>Cliente: <strong>${ticket.customerName}</strong></div>
  <div class="divider"></div>
  <table>
    <thead><tr><td>Artículo</td><td style="text-align:center">Cant</td><td style="text-align:right">Total</td></tr></thead>
    <tbody>${linesHtml}</tbody>
  </table>
  <div class="divider"></div>
  <div class="row"><span>Subtotal</span><span>RD$ ${ticket.subtotal.toFixed(2)}</span></div>
  <div class="row"><span>ITBIS 18%</span><span>RD$ ${ticket.itbis.toFixed(2)}</span></div>
  <div class="row bold"><span>TOTAL</span><span>RD$ ${ticket.total.toFixed(2)}</span></div>
  <div class="divider"></div>
  <div class="row"><span>${METHOD_LABEL[ticket.method] ?? ticket.method}</span><span>RD$ ${ticket.paidAmount.toFixed(2)}</span></div>
  ${cambio}
  ${pendiente}
  <div class="divider"></div>
  <div>Factura: <strong>${ticket.invoiceNumber}</strong></div>
  <div>NCF: <strong>${ticket.ncf}</strong></div>
  <div class="divider"></div>
  <div class="center">¡Gracias por su preferencia!</div>
</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

export function POSPage() {
  const navigate = useNavigate();
  const { user, clearAuth, refreshToken } = useAuthStore(s => ({
    user:         s.user,
    clearAuth:    s.clearAuth,
    refreshToken: s.refreshToken,
  }));
  const { sessionId } = usePosStore(s => ({ sessionId: s.sessionId }));

  const [activeTab,        setActiveTab]        = useState<ActiveTab>('sale');
  const [showPayment,      setShowPayment]      = useState(false);
  const [showCash,         setShowCash]         = useState(!sessionId);
  const [showCloseSession, setShowCloseSession] = useState(false);
  const [confirming] = useState(false);
  const [ticket,     setTicket]     = useState<SaleReceipt | null>(null);

  async function handleLogout() {
    try { if (refreshToken) await authApi.logout(refreshToken); } catch { /* ignore */ }
    clearAuth();
    navigate('/login', { replace: true });
  }

  function handleCashOpened(_sId: string, _branchId: string) {
    setShowCash(false);
  }

  function handleCashClosed() {
    setShowCloseSession(false);
  }

  return (
    <div className="h-screen flex flex-col bg-slate-900">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2.5 bg-slate-800 border-b border-slate-700 flex-shrink-0 gap-3">
        {/* Brand + tabs */}
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-brand font-bold text-lg">◈</span>
            <span className="font-semibold text-white hidden sm:block">NexoLaundry POS</span>
          </div>

          <div className="flex gap-1 bg-slate-700/50 rounded-lg p-1">
            {(['sale', 'orders', 'production'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  activeTab === tab ? 'bg-slate-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab === 'sale' ? 'Nueva venta' : tab === 'orders' ? 'Órdenes' : 'Producción'}
              </button>
            ))}
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {sessionId ? (
            <>
              <span className="text-xs bg-green-900/40 text-green-400 border border-green-700 px-2 py-1 rounded-full hidden sm:inline">
                ● Caja abierta
              </span>
              <button
                onClick={() => setShowCloseSession(true)}
                className="text-xs bg-red-900/40 text-red-400 border border-red-700 px-2 py-1 rounded-full hover:bg-red-900/60 transition-colors"
              >
                🔒 Cerrar caja
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowCash(true)}
              className="text-xs bg-yellow-900/40 text-yellow-400 border border-yellow-700 px-2 py-1 rounded-full hover:bg-yellow-900/60 transition-colors"
            >
              ⚠ Abrir caja
            </button>
          )}

          <span className="text-sm text-slate-300 hidden md:block">{user?.fullName}</span>

          <button onClick={handleLogout} className="btn-ghost text-sm py-1.5 px-3">
            Salir
          </button>
        </div>
      </header>

      {/* Body */}
      {activeTab === 'sale' ? (
        <div className="flex flex-1 min-h-0">
          <main className="flex-1 flex flex-col p-4 gap-4 min-w-0 overflow-hidden">
            <CustomerSearch />
            <CatalogGrid />
          </main>
          <OrderSidebar onConfirm={() => setShowPayment(true)} confirming={confirming} />
        </div>
      ) : activeTab === 'orders' ? (
        <OrderHistory />
      ) : (
        <ProductionDashboard />
      )}

      {/* Modals */}
      {showCash && (
        <CashModal onOpened={handleCashOpened} />
      )}

      {showCloseSession && (
        <CloseSessionModal
          onClosed={handleCashClosed}
          onCancel={() => setShowCloseSession(false)}
        />
      )}

      {showPayment && (
        <PaymentModal
          onClose={() => setShowPayment(false)}
          onSuccess={(receipt) => { setShowPayment(false); setTicket(receipt); }}
        />
      )}

      {/* Success ticket */}
      {ticket && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-sm text-center space-y-4">
            <div className="text-5xl">✅</div>
            <h2 className="text-2xl font-bold text-white">¡Venta completada!</h2>

            <div className="bg-slate-900 rounded-xl p-4 space-y-2 text-sm text-left">
              <div className="flex justify-between">
                <span className="text-slate-400">Factura</span>
                <span className="text-white font-medium">{ticket.invoiceNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">NCF</span>
                <span className="text-brand font-mono font-medium">{ticket.ncf}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Total</span>
                <span className="text-white">RD$ {ticket.total.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Pagado ({METHOD_LABEL[ticket.method] ?? ticket.method})</span>
                <span className="text-white">RD$ {ticket.paidAmount.toFixed(2)}</span>
              </div>
              {ticket.isPartial && (
                <div className="flex justify-between border-t border-slate-700 pt-2">
                  <span className="text-orange-400 font-medium">Saldo pendiente</span>
                  <span className="text-orange-400 font-bold">RD$ {(ticket.total - ticket.paidAmount).toFixed(2)}</span>
                </div>
              )}
              {ticket.change > 0 && (
                <div className="flex justify-between border-t border-slate-700 pt-2">
                  <span className="text-slate-400">Cambio</span>
                  <span className="text-green-400 font-bold">RD$ {ticket.change.toFixed(2)}</span>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => printReceipt(ticket)}
                className="btn-ghost flex-1 py-2.5"
              >
                🖨 Imprimir
              </button>
              <button
                onClick={() => setTicket(null)}
                className="btn-primary flex-1 py-2.5 text-base"
              >
                Nueva venta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
