import React, { useMemo, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { Settings2, CheckCircle2, AlertCircle, Save } from 'lucide-react';
import { db } from '../lib/firebase';
import type { Company, Voucher, ChartOfAccount } from '../types';
import {
  calcularFiguras, KPI_CATALOGO, KPI_PAQUETES, KPI_POR_ID, KpiConfig, KpiGrupo,
  configPorDefecto, formatKpi, semaforo, KpiInputs
} from '../utils/kpiEngine';

interface Props {
  company: Company;
  vouchers: Voucher[];
  accounts: ChartOfAccount[];
  year: number;
  cutoffMonth: number;
  canConfigure: boolean;
}

function visiblesIds(c: KpiConfig) { return c.enabled; }

export default function KpiPanel({ company, vouchers, accounts, year, cutoffMonth, canConfigure }: Props) {
  const inicial: KpiConfig = (company as any).kpiConfig?.enabled?.length ? (company as any).kpiConfig : configPorDefecto();
  const [config, setConfig] = useState<KpiConfig>(inicial);
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState<KpiConfig>(inicial);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState('');

  const [inputs, setInputs] = useState<KpiInputs>(((company as any).kpiInputs || {})[String(year)] || {});
  const [inputsTodos, setInputsTodos] = useState<Record<string, KpiInputs>>((company as any).kpiInputs || {});
  const [editInputs, setEditInputs] = useState(false);
  React.useEffect(() => { setInputs(inputsTodos[String(year)] || {}); }, [year]);
  const figuras = useMemo(() => calcularFiguras(vouchers, accounts, year, cutoffMonth, inputs), [vouchers, accounts, year, cutoffMonth, inputs]);

  const campo = (k: keyof KpiInputs, v: string) => {
    const n = v.trim() === '' ? undefined : Math.max(0, Number(v.replace(/\./g, '').replace(',', '.')));
    setInputs(prev => ({ ...prev, [k]: n === undefined || isNaN(n as number) ? undefined : n }));
  };
  const guardarInputs = async () => {
    setGuardando(true);
    try {
      const limpio: KpiInputs = {};
      (Object.keys(inputs) as (keyof KpiInputs)[]).forEach(k => { if (inputs[k] !== undefined) limpio[k] = inputs[k]; });
      const todos = { ...inputsTodos, [String(year)]: limpio };
      await updateDoc(doc(db, 'studies', company.studyId, 'companies', company.id), { kpiInputs: todos });
      setInputsTodos(todos);
      setEditInputs(false);
      setMsg('Datos del negocio guardados');
    } catch (e: any) {
      setMsg('No se pudo guardar: ' + (e?.message || 'error'));
    } finally {
      setGuardando(false);
      setTimeout(() => setMsg(''), 4000);
    }
  };
  const usaClientes = visiblesIds(config).some(id => ['clientes_activos', 'churn', 'arpa', 'cac', 'ltv', 'ltv_cac', 'payback_cac'].includes(id));

  const visibles = config.enabled.map(id => KPI_POR_ID.get(id)).filter(Boolean) as typeof KPI_CATALOGO;
  const grupos = Array.from(new Set(KPI_CATALOGO.map(k => k.grupo))) as KpiGrupo[];

  const elegirPaquete = (id: string) => {
    const p = KPI_PAQUETES.find(x => x.id === id);
    if (p) setBorrador({ pack: id, enabled: [...p.kpis] });
  };
  const alternar = (id: string) => setBorrador(b => ({
    pack: 'personalizado',
    enabled: b.enabled.includes(id) ? b.enabled.filter(x => x !== id) : [...b.enabled, id]
  }));

  const guardar = async () => {
    setGuardando(true);
    try {
      await updateDoc(doc(db, 'studies', company.studyId, 'companies', company.id), { kpiConfig: borrador });
      setConfig(borrador);
      setEditando(false);
      setMsg('Configuración guardada');
    } catch (e: any) {
      setMsg('No se pudo guardar: ' + (e?.message || 'error'));
    } finally {
      setGuardando(false);
      setTimeout(() => setMsg(''), 4000);
    }
  };

  const packActual = KPI_PAQUETES.find(p => p.id === config.pack)?.nombre || 'Personalizado';

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-800">Mis KPIs · {packActual}</h3>
          <p className="text-[11px] text-slate-500">
            Acumulado {year} hasta el mes {cutoffMonth || 12}. Se calcula con la misma clasificación y comprobantes cuadrados de los informes financieros.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {msg && <span className="text-[11px] text-emerald-700 font-semibold">{msg}</span>}
          {canConfigure && (
            <button onClick={() => { setBorrador(config); setEditando(e => !e); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-bold hover:bg-indigo-100 cursor-pointer">
              <Settings2 className="w-3.5 h-3.5" /> Configurar KPIs
            </button>
          )}
        </div>
      </div>

      {editando && canConfigure && (
        <div className="bg-white border border-indigo-200 rounded-xl p-4 space-y-3">
          <div>
            <label className="text-[11px] font-bold text-slate-600 uppercase">Paquete</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {KPI_PAQUETES.map(p => (
                <button key={p.id} onClick={() => elegirPaquete(p.id)} title={p.descripcion}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${borrador.pack === p.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                  {p.nombre}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">{KPI_PAQUETES.find(p => p.id === borrador.pack)?.descripcion || 'Selección personalizada.'}</p>
          </div>
          {grupos.map(g => (
            <div key={g}>
              <div className="text-[11px] font-bold text-slate-600 uppercase mb-1">{g}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                {KPI_CATALOGO.filter(k => k.grupo === g).map(k => (
                  <label key={k.id} className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer p-1.5 rounded hover:bg-slate-50" title={k.descripcion}>
                    <input type="checkbox" checked={borrador.enabled.includes(k.id)} onChange={() => alternar(k.id)} className="mt-0.5" />
                    <span>{k.nombre}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button onClick={() => setEditando(false)} className="px-3 py-1.5 text-xs font-bold text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer">Cancelar</button>
            <button onClick={guardar} disabled={guardando || borrador.enabled.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 cursor-pointer">
              <Save className="w-3.5 h-3.5" /> {guardando ? 'Guardando…' : 'Guardar para esta empresa'}
            </button>
          </div>
        </div>
      )}

      {usaClientes && canConfigure && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-slate-800">Datos del negocio {year} (acumulado al corte)</h4>
              <p className="text-[11px] text-slate-500">La contabilidad no tiene estos datos. Ingrésalos para calcular churn, CAC y LTV.</p>
            </div>
            <button onClick={() => setEditInputs(e => !e)} className="text-xs font-bold text-indigo-700 hover:underline cursor-pointer">{editInputs ? 'Cerrar' : 'Editar'}</button>
          </div>
          {editInputs && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {([['clientesInicio', 'Clientes al inicio del año'], ['clientesNuevos', 'Clientes nuevos'], ['clientesPerdidos', 'Clientes perdidos'], ['gastoMarketingVentas', 'Gasto marketing y ventas ($)']] as [keyof KpiInputs, string][]).map(([k, label]) => (
                <label key={k} className="text-[11px] font-semibold text-slate-600">
                  {label}
                  <input type="text" inputMode="decimal" defaultValue={inputs[k] ?? ''} onBlur={e => campo(k, e.target.value)}
                    className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm font-normal" />
                </label>
              ))}
              <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
                <button onClick={guardarInputs} disabled={guardando} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 cursor-pointer">
                  <Save className="w-3.5 h-3.5" /> Guardar datos
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {grupos.filter(g => visibles.some(k => k.grupo === g)).map(g => (
        <div key={g}>
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">{g}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {visibles.filter(k => k.grupo === g).map(k => {
              const v = k.calcular(figuras);
              const s = semaforo(k, v);
              const borde = s === 'ok' ? 'border-emerald-300' : s === 'alerta' ? 'border-amber-300' : 'border-slate-200';
              return (
                <div key={k.id} className={`bg-white rounded-xl border ${borde} p-3 shadow-xs`} title={k.descripcion}>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-600">{k.nombre}</span>
                    {s === 'ok' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                    {s === 'alerta' && <AlertCircle className="w-3.5 h-3.5 text-amber-500" />}
                  </div>
                  <div className="text-xl font-extrabold text-slate-900 mt-1">{formatKpi(k, v)}</div>
                  <div className="text-[10px] text-slate-400 mt-1 leading-snug">{k.descripcion}</div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
