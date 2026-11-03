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
  { cat: 'FINANZAS', titulo: 'Finanzas', desc: 'Contabilidad y estados financieros', icon: Landmark, tono: '#818cf8' },
  { cat: 'TESORERIA', titulo: 'Tesorería', desc: 'Bancos, pagos y cobranza', icon: Wallet, tono: '#22d3ee' },
  { cat: 'OPERACIONES', titulo: 'Operaciones', desc: 'Ventas, compras e inventario', icon: Boxes, tono: '#34d399' },
  { cat: 'PERSONAL', titulo: 'Personal', desc: 'Empleados y remuneraciones', icon: Users, tono: '#60a5fa' },
  { cat: 'IMPUESTOS', titulo: 'Impuestos', desc: 'F29, DDJJ y folios', icon: Receipt, tono: '#fb7185' },
  { cat: 'CARGA (SII)', titulo: 'Carga SII', desc: 'RCV e importaciones', icon: Download, tono: '#fbbf24' },
  { cat: 'INDICADORES', titulo: 'Indicadores', desc: 'KPIs y valores oficiales', icon: BarChart3, tono: '#2dd4bf' },
  { cat: 'CONFIGURACIONES', titulo: 'Configuración', desc: 'Plan de cuentas y maestros', icon: Settings, tono: '#94a3b8' },
];

const vidrio = 'bg-white/[0.06] backdrop-blur-md border border-white/10';

export default function HomeModulesView({ onOpenModule, stats = [], pinnedIds = [], periodLabel }: Props) {
  const [q, setQ] = useState('');
  const [abierta, setAbierta] = useState<ModuleCategory | null>(null);

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
  const areaAbierta = AREAS.find(a => a.cat === abierta);
  const modulosAbiertos = areaAbierta ? COCKPIT_MODULE_CATALOG.filter(m => m.category === areaAbierta.cat) : [];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-[#070d1a] text-slate-100 p-6 sm:p-8 min-h-[520px]">
      {/* resplandores de fondo */}
      <div className="pointer-events-none absolute -top-24 -left-16 w-96 h-96 rounded-full bg-indigo-600/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -right-10 w-[28rem] h-[28rem] rounded-full bg-cyan-500/15 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '44px 44px' }} />

      <div className="relative space-y-7">
        {/* Buscador */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.25em] text-cyan-300/80">Centro de control{periodLabel ? ` · ${periodLabel}` : ''}</p>
            <h2 className="text-2xl font-light text-white mt-1">¿Qué quieres hacer hoy?</h2>
          </div>
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Buscar módulo o aplicación"
              className={`w-full pl-10 pr-3 py-2.5 text-sm text-white placeholder:text-slate-500 rounded-xl ${vidrio} outline-none focus:border-cyan-400/60`}
            />
            {resultados.length > 0 && (
              <div className="absolute z-10 mt-2 w-full rounded-xl bg-[#0b1426]/95 backdrop-blur-md border border-white/10 shadow-2xl overflow-hidden">
                {resultados.map(m => {
                  const Icon = m.icon;
                  return (
                    <button key={m.id} type="button" onClick={() => { setQ(''); onOpenModule(m.id); }}
                      className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-white/10 cursor-pointer">
                      {Icon && <Icon className="w-4 h-4 text-cyan-300 shrink-0" />}
                      <span className="text-sm text-white">{m.shortLabel || m.label}</span>
                      <span className="text-[11px] text-slate-400 truncate ml-auto">{m.description}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Datos del período */}
        {stats.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {stats.map(s => (
              <div key={s.label} className={`rounded-xl p-4 ${vidrio}`}>
                <p className="text-[10px] uppercase tracking-widest text-slate-400">{s.label}</p>
                <p className="text-2xl font-light text-white mt-1 tabular-nums">{s.value}</p>
                {s.hint && <p className="text-[11px] text-slate-500 mt-0.5">{s.hint}</p>}
              </div>
            ))}
          </div>
        )}

        {/* Accesos frecuentes */}
        {frecuentes.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-2">Accesos frecuentes</p>
            <div className="flex flex-wrap gap-2">
              {frecuentes.map(m => {
                const Icon = m.icon;
                return (
                  <button key={m.id} type="button" onClick={() => onOpenModule(m.id)}
                    className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-sm text-slate-100 ${vidrio} hover:bg-white/15 hover:border-cyan-400/40 transition-colors cursor-pointer`}>
                    {Icon && <Icon className="w-3.5 h-3.5 text-cyan-300" />}
                    {m.shortLabel || m.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Áreas */}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-2">Áreas</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {AREAS.map(a => {
              const Icon = a.icon;
              const activa = abierta === a.cat;
              const n = COCKPIT_MODULE_CATALOG.filter(m => m.category === a.cat).length;
              return (
                <button key={a.cat} type="button" onClick={() => setAbierta(activa ? null : a.cat)}
                  className={`text-left rounded-xl p-4 ${vidrio} hover:bg-white/10 transition-all cursor-pointer ${activa ? 'bg-white/10' : ''}`}
                  style={activa ? { borderColor: a.tono } : undefined}>
                  <Icon className="w-5 h-5 mb-3" style={{ color: a.tono }} />
                  <p className="text-sm font-semibold text-white">{a.titulo}</p>
                  <p className="text-[11px] text-slate-400 leading-snug">{a.desc}</p>
                  <p className="text-[10px] text-slate-500 mt-2">{n} aplicaciones</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Panel de aplicaciones del área elegida */}
        {areaAbierta && (
          <div className={`rounded-xl p-4 ${vidrio}`} style={{ borderColor: areaAbierta.tono + '66' }}>
            <p className="text-[10px] uppercase tracking-widest mb-3" style={{ color: areaAbierta.tono }}>{areaAbierta.titulo}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {modulosAbiertos.map(m => {
                const Icon = m.icon;
                return (
                  <button key={m.id} type="button" onClick={() => onOpenModule(m.id)} title={m.description}
                    className="group flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-white/10 cursor-pointer">
                    {Icon && <Icon className="w-4 h-4 shrink-0" style={{ color: areaAbierta.tono }} />}
                    <span className="min-w-0">
                      <span className="block text-sm text-white truncate">{m.shortLabel || m.label}</span>
                      <span className="block text-[11px] text-slate-400 truncate">{m.description}</span>
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-white ml-auto shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
