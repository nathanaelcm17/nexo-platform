import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { laundryApi, type WorkOrderWithItems, type StageProps, type ProductionItemSnap } from '../lib/api';
import { OrderDetailModal } from './OrderDetailModal';

const PRIORITY_BORDER: Record<string, string> = {
  normal:   'border-l-slate-600',
  express:  'border-l-yellow-500',
  same_day: 'border-l-red-500',
};
const PRIORITY_BADGE: Record<string, { label: string; cls: string } | undefined> = {
  express:  { label: 'EXPRESS',   cls: 'bg-yellow-900/60 text-yellow-300' },
  same_day: { label: 'MISMO DÍA', cls: 'bg-red-900/60 text-red-300' },
};
const PRIORITY_FILTERS = [
  { id: '',         label: 'Todas' },
  { id: 'normal',   label: 'Normal' },
  { id: 'express',  label: 'Express' },
  { id: 'same_day', label: 'Mismo día' },
] as const;

function slaLabel(iso?: string) {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < 0) return <span className="text-red-400 text-xs font-medium">⚠ Vencido</span>;
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return <span className="text-slate-400 text-xs">⏱ {h}h {m}m</span>;
}

function matchesSearch(wo: WorkOrderWithItems, item: ProductionItemSnap, q: string): boolean {
  if (!q) return true;
  const ql = q.toLowerCase();
  return (
    wo.orderId.slice(-8).toLowerCase().includes(ql) ||
    (item.barcode?.toLowerCase().includes(ql) ?? false) ||
    (item.description?.toLowerCase().includes(ql) ?? false)
  );
}

// ── DragData ──────────────────────────────────────────────────────────────────
interface DragData {
  productionItemId: string;
  fromStageId:      string;
}

// ── ItemCard ──────────────────────────────────────────────────────────────────
interface ItemCardProps {
  item:        ProductionItemSnap;
  wo:          WorkOrderWithItems;
  isDragged:   boolean;
  onDragStart: (data: DragData) => void;
  onViewOrder: (orderId: string) => void;
}

function ItemCard({ item, wo, isDragged, onDragStart, onViewOrder }: ItemCardProps) {
  const badge = PRIORITY_BADGE[wo.priority];

  return (
    <div
      draggable
      onDragStart={() => onDragStart({ productionItemId: item.productionItemId, fromStageId: item.currentStageId ?? '' })}
      className={`bg-slate-800 rounded-lg p-3 border border-slate-700 border-l-4 cursor-grab active:cursor-grabbing
        transition-opacity select-none
        ${PRIORITY_BORDER[wo.priority] ?? PRIORITY_BORDER.normal}
        ${isDragged ? 'opacity-40 scale-95' : 'hover:border-slate-500'}`}
    >
      <div className="flex items-start justify-between gap-1 mb-1.5">
        <span className="text-xs font-mono text-slate-300 truncate">
          #{wo.orderId.slice(-8).toUpperCase()}
        </span>
        {badge && (
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${badge.cls}`}>
            {badge.label}
          </span>
        )}
      </div>

      {item.description && (
        <p className="text-xs text-slate-300 truncate mb-0.5">{item.description}</p>
      )}
      <p className="text-xs text-slate-500 font-mono mb-1">{item.barcode}</p>
      {slaLabel(wo.slaDeadline) && <div>{slaLabel(wo.slaDeadline)}</div>}

      {/* Actions row */}
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-1 text-slate-600 text-xs">
          <span>⠿</span>
          <span>arrastra</span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onViewOrder(wo.orderId); }}
          className="text-xs text-brand hover:text-sky-300 underline-offset-2 hover:underline transition-colors"
        >
          Ver orden
        </button>
      </div>
    </div>
  );
}

// ── StageColumn ───────────────────────────────────────────────────────────────
interface StageColumnProps {
  stage:       StageProps;
  items:       Array<{ wo: WorkOrderWithItems; item: ProductionItemSnap }>;
  draggedItem: DragData | null;
  onDrop:      (toStageId: string) => void;
  onDragStart: (data: DragData) => void;
  onViewOrder: (orderId: string) => void;
}

function StageColumn({ stage, items, draggedItem, onDrop, onDragStart, onViewOrder }: StageColumnProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounter = useRef(0);

  const canDrop = draggedItem && draggedItem.fromStageId !== stage.stageId;

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current++;
    if (canDrop) setIsDragOver(true);
  }
  function handleDragLeave() {
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragOver(false);
  }
  function handleDragOver(e: React.DragEvent) {
    if (canDrop) e.preventDefault();
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragOver(false);
    if (canDrop) onDrop(stage.stageId);
  }

  return (
    <div className="w-52 flex-shrink-0 flex flex-col h-full">
      <div className={`flex items-center justify-between px-3 py-2 rounded-t-lg mb-1 transition-colors ${
        isDragOver
          ? 'bg-brand/20 border border-brand/50'
          : stage.isFinal
            ? 'bg-green-900/40 border border-green-700/50'
            : stage.isInitial
              ? 'bg-brand/10 border border-brand/30'
              : 'bg-slate-700/50'
      }`}>
        <span className={`text-xs font-bold uppercase tracking-wide ${
          isDragOver ? 'text-brand' : stage.isFinal ? 'text-green-400' : stage.isInitial ? 'text-brand' : 'text-slate-300'
        }`}>
          {stage.name}{stage.requiresQualityCheck && ' 🔍'}
        </span>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
          stage.isFinal ? 'bg-green-700 text-green-100' : 'bg-slate-600 text-slate-200'
        }`}>
          {items.length}
        </span>
      </div>

      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`flex-1 overflow-y-auto space-y-2 rounded-b-lg p-2 transition-all min-h-[80px] ${
          isDragOver && canDrop
            ? 'bg-brand/5 ring-2 ring-brand/40 ring-inset'
            : 'bg-slate-800/30'
        }`}
      >
        {isDragOver && canDrop && (
          <div className="border-2 border-dashed border-brand/50 rounded-lg h-16 flex items-center justify-center">
            <span className="text-brand text-xs font-medium">Soltar aquí</span>
          </div>
        )}

        {items.length === 0 && !isDragOver && (
          <p className="text-center text-slate-600 text-xs py-6">Sin ítems</p>
        )}

        {items.map(({ wo, item }) => (
          <ItemCard
            key={item.productionItemId}
            item={item}
            wo={wo}
            isDragged={draggedItem?.productionItemId === item.productionItemId}
            onDragStart={onDragStart}
            onViewOrder={onViewOrder}
          />
        ))}
      </div>
    </div>
  );
}

// ── ProductionDashboard ───────────────────────────────────────────────────────
export function ProductionDashboard() {
  const qc = useQueryClient();

  const [draggedItem,     setDraggedItem]     = useState<DragData | null>(null);
  const [advancing,       setAdvancing]       = useState(false);
  const [advError,        setAdvError]        = useState('');
  const [searchQuery,     setSearchQuery]     = useState('');
  const [priorityFilter,  setPriorityFilter]  = useState('');
  const [detailOrderId,   setDetailOrderId]   = useState<string | null>(null);

  const { data: stages = [], isLoading: loadingStages } = useQuery({
    queryKey:  ['laundry-stages'],
    queryFn:   laundryApi.stages,
    staleTime: 60_000,
  });

  const { data: workOrders = [], isFetching } = useQuery({
    queryKey:        ['laundry-work-orders'],
    queryFn:         laundryApi.workOrders,
    refetchInterval: 30_000,
  });

  if (loadingStages) {
    return <div className="flex items-center justify-center h-full text-slate-400">Cargando etapas…</div>;
  }

  // Agrupar items por etapa aplicando filtros
  type GroupEntry = { wo: WorkOrderWithItems; item: ProductionItemSnap };
  const byStage = new Map<string, GroupEntry[]>();
  stages.forEach(s => byStage.set(s.stageId, []));

  workOrders.forEach(wo => {
    if (priorityFilter && wo.priority !== priorityFilter) return;
    wo.items.forEach(item => {
      if (!matchesSearch(wo, item, searchQuery)) return;
      if (item.currentStageId && byStage.has(item.currentStageId)) {
        byStage.get(item.currentStageId)!.push({ wo, item });
      }
    });
  });

  const totalItems    = workOrders.reduce((s, wo) => s + wo.items.length, 0);
  const filteredItems = [...byStage.values()].reduce((s, arr) => s + arr.length, 0);
  const isFiltered    = !!(searchQuery || priorityFilter);

  async function handleDrop(toStageId: string) {
    if (!draggedItem || draggedItem.fromStageId === toStageId) return;
    setDraggedItem(null);
    setAdvancing(true);
    setAdvError('');
    try {
      await laundryApi.advanceItem(draggedItem.productionItemId, { toStageId });
      await qc.invalidateQueries({ queryKey: ['laundry-work-orders'] });
      await qc.invalidateQueries({ queryKey: ['orders'] });
      await qc.invalidateQueries({ queryKey: ['orders-ready'] });
    } catch (err) {
      setAdvError(err instanceof Error ? err.message : 'Error al mover ítem');
    } finally {
      setAdvancing(false);
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0" onDragEnd={() => setDraggedItem(null)}>

      {/* Header */}
      <div className="px-4 pt-3 pb-2 border-b border-slate-700 flex-shrink-0 space-y-2">
        {/* Título + stats + refresh */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-white">Dashboard de producción</h2>
            <span className="text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded-full">
              {isFiltered ? `${filteredItems} de ${totalItems}` : `${workOrders.length} órd · ${totalItems} ítems`}
            </span>
            {advancing && (
              <span className="text-xs text-brand animate-pulse">Actualizando…</span>
            )}
          </div>
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ['laundry-work-orders'] })}
            className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded-lg hover:bg-slate-700 transition-colors"
          >
            {isFetching ? '⟳' : '↺'}
          </button>
        </div>

        {/* Búsqueda */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
            <input
              type="text"
              className="input-field pl-9 text-sm"
              placeholder="Buscar por # orden, código de barras, descripción…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          {(searchQuery || priorityFilter) && (
            <button
              onClick={() => { setSearchQuery(''); setPriorityFilter(''); }}
              className="btn-ghost text-sm px-3 flex-shrink-0"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filtro de prioridad */}
        <div className="flex gap-2">
          {PRIORITY_FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setPriorityFilter(f.id)}
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                priorityFilter === f.id
                  ? 'bg-brand text-slate-900'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {advError && (
        <div className="mx-4 mt-2 bg-red-900/40 border border-red-700 text-red-300 text-xs rounded-lg px-3 py-2 flex-shrink-0">
          {advError}
          <button onClick={() => setAdvError('')} className="ml-2 underline">Cerrar</button>
        </div>
      )}

      {/* Kanban */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
        <div
          className="flex gap-3 h-full"
          style={{ minWidth: `${Math.max(stages.length, 1) * 220}px` }}
        >
          {stages.map(stage => (
            <StageColumn
              key={stage.stageId}
              stage={stage}
              items={byStage.get(stage.stageId) ?? []}
              draggedItem={draggedItem}
              onDrop={handleDrop}
              onDragStart={setDraggedItem}
              onViewOrder={setDetailOrderId}
            />
          ))}

          {stages.length === 0 && (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
              Sin etapas configuradas. Ejecuta <code className="mx-1 text-brand">pnpm tsx tools/seed-admin.ts</code>
            </div>
          )}
        </div>
      </div>

      {/* Leyenda */}
      <div className="px-4 py-2 border-t border-slate-700 flex-shrink-0 flex items-center gap-4 text-xs text-slate-500">
        <span>⠿ Arrastra ítems entre columnas para avanzar etapa</span>
        <div className="flex items-center gap-3 ml-auto">
          <span className="flex items-center gap-1"><span className="w-2 h-3 rounded-sm bg-slate-600 inline-block" /> Normal</span>
          <span className="flex items-center gap-1"><span className="w-2 h-3 rounded-sm bg-yellow-500 inline-block" /> Express</span>
          <span className="flex items-center gap-1"><span className="w-2 h-3 rounded-sm bg-red-500 inline-block" /> Mismo día</span>
        </div>
      </div>

      {/* Order detail modal */}
      {detailOrderId && (
        <OrderDetailModal
          orderId={detailOrderId}
          onClose={() => setDetailOrderId(null)}
        />
      )}
    </div>
  );
}
