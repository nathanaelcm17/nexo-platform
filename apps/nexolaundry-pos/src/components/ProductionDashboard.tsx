import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { laundryApi, type WorkOrderWithItems, type StageProps, type ProductionItemSnap } from '../lib/api';

const PRIORITY_CLASS: Record<string, string> = {
  normal:   'bg-slate-700 text-slate-300',
  express:  'bg-yellow-900/50 text-yellow-300 border border-yellow-700',
  same_day: 'bg-red-900/50 text-red-300 border border-red-700',
};
const PRIORITY_LABEL: Record<string, string> = {
  normal: 'Normal', express: 'Express', same_day: 'Mismo día',
};

function slaCountdown(deadline?: string): string {
  if (!deadline) return '';
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) return '⚠ Vencido';
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}min`;
}

interface AdvanceModalProps {
  item: ProductionItemSnap;
  stages: StageProps[];
  onClose: () => void;
  onDone: () => void;
}

function AdvanceModal({ item, stages, onClose, onDone }: AdvanceModalProps) {
  const [toStageId, setToStageId] = useState('');
  const [notes,     setNotes]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');

  const nextStages = stages.filter(s => s.stageId !== item.currentStageId && s.active);

  async function handleAdvance() {
    if (!toStageId) { setError('Selecciona la etapa destino'); return; }
    setLoading(true); setError('');
    try {
      await laundryApi.advanceItem(item.productionItemId, { toStageId, notes: notes || undefined });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al avanzar');
    } finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-sm space-y-4">
        <div>
          <h3 className="font-bold text-white">Avanzar etapa</h3>
          <p className="text-slate-400 text-sm mt-0.5 font-mono">{item.barcode} — {item.description}</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Etapa destino</label>
          <select className="input-field" value={toStageId} onChange={e => setToStageId(e.target.value)}>
            <option value="">Seleccionar…</option>
            {nextStages.map(s => (
              <option key={s.stageId} value={s.stageId}>
                {s.name}{s.requiresQualityCheck ? ' (QC)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Notas <span className="text-slate-500">(opcional)</span></label>
          <input type="text" className="input-field" placeholder="Observaciones…" value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-ghost flex-1" disabled={loading}>Cancelar</button>
          <button onClick={handleAdvance} disabled={loading || !toStageId} className="btn-primary flex-1">
            {loading ? 'Avanzando…' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface WorkOrderCardProps {
  wo: WorkOrderWithItems;
  stages: StageProps[];
  onRefresh: () => void;
}

function WorkOrderCard({ wo, stages, onRefresh }: WorkOrderCardProps) {
  const [advancingItem, setAdvancingItem] = useState<ProductionItemSnap | null>(null);
  const stageMap = Object.fromEntries(stages.map(s => [s.stageId, s]));
  const sla = slaCountdown(wo.slaDeadline);

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-white font-semibold text-sm">
              #{wo.orderId.slice(0, 8).toUpperCase()}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${PRIORITY_CLASS[wo.priority] ?? PRIORITY_CLASS.normal}`}>
              {PRIORITY_LABEL[wo.priority] ?? wo.priority}
            </span>
          </div>
          {sla && (
            <p className={`text-xs mt-0.5 ${sla.startsWith('⚠') ? 'text-red-400 font-medium' : 'text-slate-400'}`}>
              🕐 {sla}
            </p>
          )}
        </div>
        <span className="text-xs text-slate-500 flex-shrink-0">
          {wo.items.length} {wo.items.length === 1 ? 'ítem' : 'ítems'}
        </span>
      </div>

      {wo.items.length > 0 && (
        <div className="space-y-1.5">
          {wo.items.map(item => {
            const stage = item.currentStageId ? stageMap[item.currentStageId] : null;
            return (
              <div key={item.productionItemId} className="flex items-center gap-2 bg-slate-900/60 rounded-lg px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-300 truncate">{item.description}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-xs text-slate-500 font-mono">{item.barcode}</span>
                    {stage && (
                      <span className="text-xs bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">
                        {stage.name}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setAdvancingItem(item)}
                  className="text-xs bg-brand/10 text-brand border border-brand/40 hover:bg-brand/20 px-2 py-1.5 rounded-lg transition-colors flex-shrink-0"
                >
                  Avanzar
                </button>
              </div>
            );
          })}
        </div>
      )}

      {advancingItem && (
        <AdvanceModal
          item={advancingItem}
          stages={stages}
          onClose={() => setAdvancingItem(null)}
          onDone={() => { setAdvancingItem(null); onRefresh(); }}
        />
      )}
    </div>
  );
}

const COLUMNS = [
  { key: 'pending',     label: 'Pendiente',   color: 'border-slate-600' },
  { key: 'in_progress', label: 'En progreso', color: 'border-yellow-700' },
  { key: 'on_hold',     label: 'En espera',   color: 'border-orange-700' },
] as const;

export function ProductionDashboard() {
  const qc = useQueryClient();

  const { data: workOrders = [], isFetching, refetch } = useQuery({
    queryKey:        ['work-orders-active'],
    queryFn:         laundryApi.workOrders,
    refetchInterval: 30_000,
  });

  const { data: stages = [] } = useQuery({
    queryKey:  ['stages'],
    queryFn:   laundryApi.stages,
    staleTime: 5 * 60_000,
  });

  function handleRefresh() {
    qc.invalidateQueries({ queryKey: ['work-orders-active'] });
  }

  const groups: Record<string, WorkOrderWithItems[]> = {
    pending:     workOrders.filter(w => w.status === 'pending'),
    in_progress: workOrders.filter(w => w.status === 'in_progress'),
    on_hold:     workOrders.filter(w => w.status === 'on_hold'),
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-slate-700 flex-shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-white">Dashboard de producción</h2>
          <span className="text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded-full">
            {workOrders.length} activas
          </span>
        </div>
        <button
          onClick={() => refetch()}
          className="text-slate-400 hover:text-white text-sm px-2 py-1 rounded-lg hover:bg-slate-700 transition-colors"
        >
          {isFetching ? '⟳' : '↺'} Actualizar
        </button>
      </div>

      {/* Kanban */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
        <div className="flex gap-4 h-full" style={{ minWidth: `${COLUMNS.length * 300}px` }}>
          {COLUMNS.map(col => (
            <div key={col.key} className="w-72 flex-shrink-0 flex flex-col h-full">
              <div className={`flex items-center gap-2 mb-3 pb-2 border-b-2 ${col.color}`}>
                <h3 className="font-medium text-white text-sm">{col.label}</h3>
                <span className="text-xs bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded-full">
                  {groups[col.key].length}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {groups[col.key].length === 0 && (
                  <p className="text-slate-600 text-xs text-center py-8">Sin órdenes</p>
                )}
                {groups[col.key].map(wo => (
                  <WorkOrderCard
                    key={wo.workOrderId}
                    wo={wo}
                    stages={stages}
                    onRefresh={handleRefresh}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
