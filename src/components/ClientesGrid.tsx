import React, { useMemo, useState } from 'react';
import { Search, ArrowRight, Settings, KeyRound, Plus, ChevronUp, ChevronDown, ChevronsUpDown, Building2, Eye, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Company, User, Assignment, UserRole } from '../types';

interface Props {
  title?: string;
  subtitle?: string;
  companies: Company[];
  users: User[];
  assignments: Assignment[];
  canManage: boolean;
  onOpenAccounting: (c: Company) => void;
  onConfigure?: (c: Company) => void;
  onCredentials?: (c: Company) => void;
  onManage?: () => void;
}

type SortKey = 'name' | 'rut' | 'estado';

const norm = (s?: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const rutDigits = (s?: string) => (s || '').replace(/[^0-9kK]/g, '').toLowerCase();
const iniciales = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('') || '?';
const TONOS = [
  'from-indigo-500 to-violet-500', 'from-sky-500 to-cyan-400', 'from-emerald-500 to-teal-400',
  'from-amber-500 to-orange-400', 'from-rose-500 to-pink-400', 'from-blue-600 to-indigo-500'
];
const tono = (s: string) => TONOS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % TONOS.length];

const Chip = ({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all ${
      activo ? 'bg-slate-900 text-white border-slate-900 shadow-sm' : 'bg-white/60 text-slate-600 border-white/70 hover:bg-white/90 hover:text-slate-900'
    }`}
  >{children}</button>
);

export default function ClientesGrid({ title = 'Mis clientes', subtitle, companies, users, assignments, canManage, onOpenAccounting, onConfigure, onCredentials, onManage }: Props) {
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState<'TODAS' | 'ACTIVAS' | 'INACTIVAS'>('TODAS');
  const [sii, setSii] = useState<'TODAS' | 'CON' | 'SIN'>('TODAS');
  const [contador, setContador] = useState('TODOS');
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'name', asc: true });
  const [selId, setSelId] = useState<string | null>(null);

  const filas = useMemo(() => {
    const porId = new Map(users.map(u => [u.id, u]));
    return companies.map(c => {
      const ids = new Set<string>(c.assignedAccountantIds || []);
      assignments.filter(a => a.companyId === c.id).forEach(a => ids.add(a.userId));
      const asignados = [...ids].map(id => porId.get(id)).filter(Boolean) as User[];
      const contadores = asignados.filter(u => u.role !== UserRole.OBSERVER);
      const observadores = asignados.filter(u => u.role === UserRole.OBSERVER);
      const siiOk = !!(c.dteConfig?.claveRepLegalSii || c.dteConfig?.hasCertificadoDigital || c.dteConfig?.siiConnectionStatus === 'Conectado');
      return { c, contadores, observadores, siiOk, inactiva: c.estado === 'Inactivo' };
    });
  }, [companies, users, assignments]);

  const visibles = useMemo(() => {
    const t = norm(q).trim();
    const td = rutDigits(q);
    const res = filas.filter(f => {
      if (estado === 'ACTIVAS' && f.inactiva) return false;
      if (estado === 'INACTIVAS' && !f.inactiva) return false;
      if (sii === 'CON' && !f.siiOk) return false;
      if (sii === 'SIN' && f.siiOk) return false;
      if (contador === 'SIN' && f.contadores.length > 0) return false;
      if (contador !== 'TODOS' && contador !== 'SIN' && !f.contadores.some(u => u.id === contador)) return false;
      if (!t) return true;
      const texto = norm([f.c.name, f.c.fantasyName, f.c.giro, f.c.rut, ...f.contadores.map(u => u.name)].join(' '));
      return t.split(/\s+/).every(w => texto.includes(w)) || (td.length >= 3 && rutDigits(f.c.rut).includes(td));
    });
    const dir = sort.asc ? 1 : -1;
    return res.sort((a, b) => {
      const va = sort.key === 'name' ? norm(a.c.name) : sort.key === 'rut' ? rutDigits(a.c.rut) : (a.inactiva ? '1' : '0');
      const vb = sort.key === 'name' ? norm(b.c.name) : sort.key === 'rut' ? rutDigits(b.c.rut) : (b.inactiva ? '1' : '0');
      return va < vb ? -dir : va > vb ? dir : 0;
    });
  }, [filas, q, estado, sii, contador, sort]);

  const listaContadores = useMemo(() => {
    const m = new Map<string, string>();
    filas.forEach(f => f.contadores.forEach(u => m.set(u.id, u.name || u.email)));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [filas]);

  const th = (key: SortKey, label: string, cls = '') => (
    <th className={`px-3 py-2.5 text-left font-semibold border-r border-white/10 ${cls}`}>
      <button type="button" onClick={() => setSort(s => ({ key, asc: s.key === key ? !s.asc : true }))} className="inline-flex items-center gap-1 hover:text-sky-200">
        {label}
        {sort.key === key ? (sort.asc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ChevronsUpDown className="w-3 h-3 opacity-50" />}
      </button>
    </th>
  );
  const thFijo = (label: string, cls = '') => <th className={`px-3 py-2.5 text-left font-semibold border-r border-white/10 ${cls}`}>{label}</th>;
  const hayFiltros = q || estado !== 'TODAS' || sii !== 'TODAS' || contador !== 'TODOS';

  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/70 bg-gradient-to-br from-slate-100 via-indigo-50 to-sky-100 p-3 sm:p-5">
      <div className="pointer-events-none absolute -top-16 -left-10 w-72 h-72 rounded-full bg-indigo-300/40 blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 -right-16 w-80 h-80 rounded-full bg-sky-300/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 left-1/3 w-72 h-72 rounded-full bg-violet-300/30 blur-3xl" />

      <div className="relative space-y-3">
        {/* Encabezado y barra de herramientas */}
        <div className="rounded-2xl border border-white/70 bg-white/55 backdrop-blur-xl shadow-[0_8px_30px_rgba(15,23,42,0.07)] p-3 sm:p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-md shrink-0"><Building2 className="w-5 h-5" /></span>
              <div className="min-w-0">
                <h3 className="text-base font-extrabold text-slate-900 tracking-tight">{title} <span className="text-slate-400 font-semibold">({companies.length})</span></h3>
                <p className="text-[11px] text-slate-500">{subtitle || 'Haz doble clic en un cliente o usa la flecha para abrir su contabilidad.'}</p>
              </div>
            </div>
            {canManage && onManage && (
              <button type="button" onClick={onManage} className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-2 shadow-md shadow-blue-600/25 transition-colors">
                <Plus className="w-4 h-4" /><span>Registrar y administrar</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Buscar por nombre, RUT, giro o contador…"
                className="w-full pl-9 pr-8 py-2 rounded-xl border border-white/80 bg-white/70 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
              />
              {q && <button type="button" onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"><X className="w-3.5 h-3.5" /></button>}
            </div>
            <div className="flex items-center gap-1">
              <Chip activo={estado === 'TODAS'} onClick={() => setEstado('TODAS')}>Todas</Chip>
              <Chip activo={estado === 'ACTIVAS'} onClick={() => setEstado('ACTIVAS')}>Activas</Chip>
              <Chip activo={estado === 'INACTIVAS'} onClick={() => setEstado('INACTIVAS')}>Inactivas</Chip>
            </div>
            <div className="flex items-center gap-1">
              <Chip activo={sii === 'TODAS'} onClick={() => setSii('TODAS')}>SII: todos</Chip>
              <Chip activo={sii === 'CON'} onClick={() => setSii('CON')}>Con claves</Chip>
              <Chip activo={sii === 'SIN'} onClick={() => setSii('SIN')}>Sin claves</Chip>
            </div>
            {listaContadores.length > 0 && (
              <select value={contador} onChange={e => setContador(e.target.value)} className="py-2 px-3 rounded-xl border border-white/80 bg-white/70 text-[11px] font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/60">
                <option value="TODOS">Todos los contadores</option>
                <option value="SIN">Sin contador asignado</option>
                {listaContadores.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
              </select>
            )}
          </div>
        </div>

        {/* Grilla */}
        <div className="rounded-2xl border border-white/70 bg-white/45 backdrop-blur-xl shadow-[0_8px_30px_rgba(15,23,42,0.07)] overflow-hidden">
          <div className="overflow-auto max-h-[62vh]">
            <table className="w-full text-xs border-collapse min-w-[900px]">
              <thead className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur text-white text-[11px] uppercase tracking-wide">
                <tr>
                  {thFijo('N°', 'w-12 text-center')}
                  {th('name', 'Cliente')}
                  {th('rut', 'RUT', 'w-36')}
                  {thFijo('Giro')}
                  {thFijo('Contador asignado')}
                  {thFijo('SII', 'w-32')}
                  {th('estado', 'Estado', 'w-28')}
                  {thFijo('Acciones', 'w-52 text-right')}
                </tr>
              </thead>
              <tbody>
                {visibles.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-10 text-center">
                    <p className="text-sm font-semibold text-slate-700">{companies.length === 0 ? 'Aún no hay clientes registrados.' : 'Ningún cliente coincide con los filtros.'}</p>
                    {companies.length === 0 && canManage ? (
                      <p className="text-xs text-slate-500 mt-1">Usa “Registrar y administrar” para crear la primera empresa.</p>
                    ) : hayFiltros ? (
                      <button type="button" onClick={() => { setQ(''); setEstado('TODAS'); setSii('TODAS'); setContador('TODOS'); }} className="mt-2 text-xs font-bold text-blue-600 hover:underline">Quitar filtros</button>
                    ) : null}
                  </td></tr>
                )}
                {visibles.map((f, i) => (
                  <tr
                    key={f.c.id}
                    onClick={() => setSelId(f.c.id)}
                    onDoubleClick={() => onOpenAccounting(f.c)}
                    className={`group cursor-pointer transition-colors ${selId === f.c.id ? 'bg-blue-100/70' : i % 2 ? 'bg-white/30 hover:bg-white/80' : 'bg-white/55 hover:bg-white/80'} ${f.inactiva ? 'opacity-70' : ''}`}
                  >
                    <td className="px-3 py-2.5 text-center font-mono text-[10px] text-slate-400 border-b border-r border-slate-200/60">{i + 1}</td>
                    <td className="px-3 py-2.5 border-b border-r border-slate-200/60">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`w-8 h-8 rounded-xl bg-gradient-to-br ${tono(f.c.name)} text-white text-[11px] font-extrabold flex items-center justify-center shadow-sm shrink-0`}>{iniciales(f.c.name)}</span>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 truncate">{f.c.name}</p>
                          {f.c.fantasyName && <p className="text-[10px] text-slate-500 truncate">{f.c.fantasyName}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-slate-700 border-b border-r border-slate-200/60 whitespace-nowrap">{f.c.rut}</td>
                    <td className="px-3 py-2.5 text-slate-600 border-b border-r border-slate-200/60 max-w-[220px]"><span className="block truncate" title={f.c.giro}>{f.c.giro || <span className="text-slate-300">—</span>}</span></td>
                    <td className="px-3 py-2.5 border-b border-r border-slate-200/60">
                      {users.length === 0 ? (
                        <span className="text-slate-300">—</span>
                      ) : f.contadores.length === 0 && f.observadores.length === 0 ? (
                        <span className="text-[11px] text-amber-700 italic">Sin asignar</span>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1">
                          {f.contadores.slice(0, 2).map(u => (
                            <span key={u.id} title={u.email} className="inline-flex items-center gap-1 pl-0.5 pr-2 py-0.5 rounded-full bg-white/80 border border-slate-200 text-[10px] font-semibold text-slate-700">
                              <span className={`w-[18px] h-[18px] rounded-full bg-gradient-to-br ${tono(u.name || u.email || '')} text-white text-[8px] font-bold flex items-center justify-center`}>{iniciales(u.name || u.email || '?')}</span>
                              {(u.name || u.email || '').split(' ')[0]}
                            </span>
                          ))}
                          {f.contadores.length > 2 && <span className="text-[10px] font-bold text-slate-500">+{f.contadores.length - 2}</span>}
                          {f.observadores.length > 0 && (
                            <span title={`${f.observadores.length} observador(es): ${f.observadores.map(o => o.name || o.email).join(', ')}`} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-sky-50 border border-sky-200 text-[10px] font-bold text-sky-700">
                              <Eye className="w-3 h-3" />{f.observadores.length}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 border-b border-r border-slate-200/60">
                      {f.siiOk
                        ? <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-50 text-emerald-800 border border-emerald-200"><CheckCircle2 className="w-3 h-3" />Conectado</span>
                        : <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold bg-amber-50 text-amber-800 border border-amber-200"><AlertTriangle className="w-3 h-3" />Sin claves</span>}
                    </td>
                    <td className="px-3 py-2.5 border-b border-r border-slate-200/60">
                      <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-bold border ${f.inactiva ? 'bg-rose-50 text-rose-800 border-rose-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'}`}>{f.c.estado || 'Activo'}</span>
                    </td>
                    <td className="px-3 py-2.5 border-b border-slate-200/60">
                      <div className="flex items-center justify-end gap-1.5">
                        {canManage && onCredentials && (
                          <button type="button" title="Credenciales SII y certificado" onClick={e => { e.stopPropagation(); onCredentials(f.c); }} className="w-8 h-8 rounded-xl bg-white/80 hover:bg-amber-50 border border-slate-200 hover:border-amber-300 text-slate-600 hover:text-amber-700 flex items-center justify-center transition-colors"><KeyRound className="w-4 h-4" /></button>
                        )}
                        {canManage && onConfigure && (
                          <button type="button" title="Configuración de la empresa" onClick={e => { e.stopPropagation(); onConfigure(f.c); }} className="w-8 h-8 rounded-xl bg-white/80 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 text-slate-600 hover:text-indigo-700 flex items-center justify-center transition-colors"><Settings className="w-4 h-4" /></button>
                        )}
                        <button type="button" onClick={e => { e.stopPropagation(); onOpenAccounting(f.c); }} className="h-8 pl-3 pr-2.5 rounded-xl bg-slate-900 hover:bg-slate-700 text-white text-[11px] font-bold flex items-center gap-1.5 shadow-sm transition-colors">
                          Contabilidad <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-slate-200/70 bg-white/50 text-[11px] text-slate-500 flex justify-between">
            <span>Mostrando <strong className="text-slate-700">{visibles.length}</strong> de {companies.length} clientes</span>
            {hayFiltros && <button type="button" onClick={() => { setQ(''); setEstado('TODAS'); setSii('TODAS'); setContador('TODOS'); }} className="font-bold text-blue-600 hover:underline">Quitar filtros</button>}
          </div>
        </div>
      </div>
    </section>
  );
}
