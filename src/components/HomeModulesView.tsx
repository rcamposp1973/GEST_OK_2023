import React, { useMemo, useState } from 'react';
import { Search, ChevronRight, Landmark, Wallet, Boxes, Users, Receipt, Download, BarChart3, Settings } from 'lucide-react';
import { COCKPIT_MODULE_CATALOG, ModuleCategory } from './cockpit/cockpitTypes';

export interface HomeStat { label: string; value: string; hint?: string }

interface Props {
  onOpenModule: (moduleId: string) => void;
  stats?: HomeStat[];
  pinnedIds?: string[];
  periodLabel?: string;
}

const AREAS: { cat: ModuleCategory; titulo: string; desc: string; icon: any; tono: string }[] = [
  { cat: 'FINANZAS', titulo: 'Finanzas', desc: 'Contabilidad y estados financieros', icon: Landmark, tono: '#4f46e5' },
  { cat: 'TESORERIA', titulo: 'Tesorería', desc: 'Bancos, pagos y cobranza', icon: Wallet, tono: '#0891b2' },
  { cat: 'OPERACIONES', titulo: 'Operaciones', desc: 'Ventas, compras e inventario', icon: Boxes, tono: '#059669' },
  { cat: 'PERSONAL', titulo: 'Personal', desc: 'Empleados y remuneraciones', icon: Users, tono: '#2563eb' },
  { cat: 'IMPUESTOS', titulo: 'Impuestos', desc: 'F29, DDJJ y folios', icon: Receipt, tono: '#e11d48' },
  { cat: 'IMPORTACIONES', titulo: 'Importaciones', desc: 'RCV, planillas y carga inteligente', icon: Download, tono: '#d97706' },
  { cat: 'INDICADORES', titulo: 'Indicadores', desc: 'KPIs y valores oficiales', icon: BarChart3, tono: '#0d9488' },
  { cat: 'CONFIGURACIONES', titulo: 'Configuración', desc: 'Plan de cuentas y maestros', icon: Settings, tono: '#475569' },
];

export default function HomeModulesView({ onOpenModule, stats = [], pinnedIds = [], periodLabel }: Props) {
  const [q, setQ] = useState('');
  const [abierta, setAbierta] = useState<ModuleCategory>('FINANZAS');

  const porId = useMemo(() => new Map(COCKPIT_MODULE_CATALOG.map(m => [m.id, m])), []);
  const frecuentes = useMemo(
    () => pinnedIds.map(id => porId.get(id)).filter((m): m is NonNullable<typeof m> => !!m && m.id !== 'calculator').slice(0, 8),
    [pinnedIds, porId]
  );
  const resultados = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return COCKPIT_MODULE_CATALOG.filter(m => `${m.label} ${m.shortLabel} ${m.description}`.toLowerCase().includes(t)).slice(0, 10);
  }, [q]);
  const areaAbierta = AREAS.find(a => a.cat === abierta)!;
  const modulosAbiertos = COCKPIT_MODULE_CATALOG.filter(m => m.category === abierta);
  const card = 'bg-white border border-slate-200 shadow-sm';

  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-sky-50 to-slate-50 p-5 sm:p-7 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-sky-700 font-semibold">Centro de control{periodLabel ? ` · ${periodLabel}` : ''}</p>
          <h2 className="text-2xl font-semibold text-slate-900 mt-1">¿Qué quieres hacer hoy?</h2>
        </div>
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar módulo o aplicación"
            className={`w-full pl-10 pr-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 rounded-xl ${card} outline-none focus:ring-2 focus:ring-sky-400`}
          />
          {resultados.length > 0 && (
            <div className="absolute z-10 mt-2 w-full rounded-xl bg-white border border-slate-200 shadow-xl overflow-hidden">
              {resultados.map(m => {
                const Icon = m.icon;
                return (
                  <button key={m.id} type="button" onClick={() => { setQ(''); onOpenModule(m.id); }}
                    className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-sky-50 cursor-pointer">
                    {Icon && <Icon className="w-4 h-4 text-sky-600 shrink-0" />}
                    <span className="text-sm font-medium text-slate-900">{m.shortLabel || m.label}</span>
                    <span className="text-[11px] text-slate-500 truncate ml-auto">{m.description}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {stats.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {stats.map(s => (
            <div key={s.label} className={`rounded-xl p-4 ${card}`}>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{s.label}</p>
              <p className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">{s.value}</p>
              {s.hint && <p className="text-[11px] text-slate-500 mt-0.5">{s.hint}</p>}
            </div>
          ))}
        </div>
      )}

      {frecuentes.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Accesos frecuentes</p>
          <div className="flex flex-wrap gap-2">
            {frecuentes.map(m => {
              const Icon = m.icon;
              return (
                <button key={m.id} type="button" onClick={() => onOpenModule(m.id)}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-sm font-medium text-slate-800 ${card} hover:border-sky-400 hover:text-sky-800 transition-colors cursor-pointer`}>
                  {Icon && <Icon className="w-3.5 h-3.5 text-sky-600" />}
                  {m.shortLabel || m.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Áreas</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {AREAS.map(a => {
            const Icon = a.icon;
            const activa = abierta === a.cat;
            return (
              <button key={a.cat} type="button" onClick={() => setAbierta(a.cat)}
                className={`flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 border transition-all cursor-pointer ${activa ? 'bg-white shadow-md' : 'bg-white/70 border-slate-200 hover:bg-white'}`}
                style={activa ? { borderColor: a.tono, boxShadow: `0 0 0 1px ${a.tono}` } : undefined}>
                <Icon className="w-5 h-5" style={{ color: a.tono }} />
                <span className="text-xs font-semibold text-slate-800">{a.titulo}</span>
              </button>
            );
          })}
        </div>

        <div className={`rounded-xl p-4 mt-3 ${card}`} style={{ borderColor: areaAbierta.tono }}>
          <div className="flex items-baseline gap-2 mb-3">
            <p className="text-sm font-bold text-slate-900">{areaAbierta.titulo}</p>
            <p className="text-xs text-slate-500">{areaAbierta.desc}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {modulosAbiertos.map(m => {
              const Icon = m.icon;
              return (
                <button key={m.id} type="button" onClick={() => onOpenModule(m.id)} title={m.description}
                  className="group flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-100 text-left hover:bg-slate-50 hover:border-slate-300 cursor-pointer">
                  {Icon && <Icon className="w-4 h-4 shrink-0" style={{ color: areaAbierta.tono }} />}
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-900 truncate">{m.shortLabel || m.label}</span>
                    <span className="block text-[11px] text-slate-500 truncate">{m.description}</span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-600 ml-auto shrink-0" />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
