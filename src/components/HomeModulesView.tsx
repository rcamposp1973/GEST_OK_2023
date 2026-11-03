import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { COCKPIT_MODULE_CATALOG, ModuleCategory } from './cockpit/cockpitTypes';

interface Props {
  onOpenModule: (moduleId: string) => void;
}

const ORDEN: ModuleCategory[] = ['FINANZAS', 'TESORERIA', 'OPERACIONES', 'PERSONAL', 'IMPUESTOS', 'CARGA (SII)', 'INDICADORES', 'CONFIGURACIONES'];
const TITULOS: Record<string, string> = {
  FINANZAS: 'Finanzas',
  TESORERIA: 'Tesorería',
  OPERACIONES: 'Operaciones',
  PERSONAL: 'Personal',
  IMPUESTOS: 'Impuestos',
  'CARGA (SII)': 'Carga SII',
  INDICADORES: 'Indicadores',
  CONFIGURACIONES: 'Configuraciones',
};
const COLOR: Record<string, string> = {
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  amber: 'bg-amber-50 text-amber-700 border-amber-100',
  rose: 'bg-rose-50 text-rose-700 border-rose-100',
  cyan: 'bg-cyan-50 text-cyan-700 border-cyan-100',
  purple: 'bg-purple-50 text-purple-700 border-purple-100',
  blue: 'bg-blue-50 text-blue-700 border-blue-100',
  slate: 'bg-slate-100 text-slate-700 border-slate-200',
};

export default function HomeModulesView({ onOpenModule }: Props) {
  const [q, setQ] = useState('');

  const grupos = useMemo(() => {
    const t = q.trim().toLowerCase();
    const items = COCKPIT_MODULE_CATALOG.filter(m =>
      !t || `${m.label} ${m.shortLabel} ${m.description}`.toLowerCase().includes(t)
    );
    return ORDEN.map(cat => ({ cat, items: items.filter(m => m.category === cat) })).filter(g => g.items.length > 0);
  }, [q]);

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Inicio</h2>
          <p className="text-xs text-slate-500">Elige el módulo con el que quieres trabajar.</p>
        </div>
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar módulo..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>
      </div>

      {grupos.length === 0 && <p className="text-sm text-slate-500 py-8 text-center">No hay módulos que coincidan.</p>}

      {grupos.map(g => (
        <section key={g.cat}>
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">{TITULOS[g.cat] || g.cat}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {g.items.map(m => {
              const Icon = m.icon;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onOpenModule(m.id)}
                  className="text-left flex items-start gap-3 p-3 rounded-xl border border-slate-200 hover:border-indigo-300 hover:shadow-sm bg-white transition-all cursor-pointer"
                >
                  <span className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${COLOR[m.colorScheme] || COLOR.slate}`}>
                    {Icon && <Icon className="w-4 h-4" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-900 truncate">{m.shortLabel || m.label}</span>
                    <span className="block text-[11px] text-slate-500 leading-snug line-clamp-2">{m.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
