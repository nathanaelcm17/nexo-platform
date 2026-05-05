import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { catalogApi, type CatalogItemSnapshot } from '../lib/api';
import { usePosStore } from '../stores/pos.store';

function formatPrice(item: CatalogItemSnapshot): string {
  const pm = item.pricingModel;
  const fmt = (n: number) => `RD$ ${n.toFixed(2)}`;
  if (pm.kind === 'fixed')      return fmt(pm.price ?? 0);
  if (pm.kind === 'per_unit')   return `${fmt(pm.unitPrice ?? 0)} / ${item.unitOfMeasure}`;
  if (pm.kind === 'per_weight') return `${fmt(pm.pricePerKg ?? 0)} / kg`;
  if (pm.kind === 'package')    return fmt(pm.packagePrice ?? 0);
  return '—';
}

const ITEM_TYPE_LABEL: Record<string, string> = {
  service: 'Servicio',
  product: 'Producto',
  package: 'Paquete',
};

export function CatalogGrid() {
  const [category, setCategory] = useState<string | null>(null);
  const [search,   setSearch]   = useState('');
  const addItem = usePosStore(s => s.addItem);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['catalog'],
    queryFn:  catalogApi.list,
    staleTime: 60_000,
  });

  const categories = Array.from(new Set(items.map(i => i.category).filter(Boolean))) as string[];

  const filtered = items
    .filter(i => category ? i.category === category : true)
    .filter(i => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q);
    });

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400">
        Cargando catálogo…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      {/* Buscador + filtros por categoría */}
      {categories.length > 0 && (
        <div className="flex flex-col gap-2 flex-shrink-0">
        <input
          type="text"
          className="input-field text-sm"
          placeholder="🔍 Buscar servicio…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setCategory(null)}
            className={`px-3 py-1 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              category === null
                ? 'bg-brand text-slate-900'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            Todos
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-3 py-1 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                category === cat
                  ? 'bg-brand text-slate-900'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 overflow-y-auto">
        {filtered.map(item => (
          <button
            key={item.itemId}
            onClick={() => addItem(item)}
            className="card text-left hover:border-brand/60 hover:bg-slate-750 active:scale-95
                       transition-all flex flex-col gap-2 p-3 group"
          >
            <div className="flex items-start justify-between gap-1">
              <span className="text-xs text-slate-400 uppercase tracking-wide">
                {ITEM_TYPE_LABEL[item.itemType] ?? item.itemType}
              </span>
              <span className="text-xs bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">
                {item.code}
              </span>
            </div>
            <p className="font-semibold text-white text-sm leading-snug line-clamp-2 group-hover:text-brand transition-colors">
              {item.name}
            </p>
            <p className="text-brand font-bold text-sm mt-auto">
              {formatPrice(item)}
            </p>
          </button>
        ))}

        {filtered.length === 0 && (
          <div className="col-span-full text-center text-slate-400 py-10">
            Sin artículos en esta categoría
          </div>
        )}
      </div>
    </div>
  );
}
