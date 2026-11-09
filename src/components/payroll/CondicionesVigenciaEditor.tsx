import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { subirRespaldo, abrirRespaldo, tamanoLegible, MAX_RESPALDO_BYTES } from '../../utils/respaldosPrevisionales';
import { auth } from '../../lib/firebase';
import type { EmployeeCondicion, PensionSystem, HealthSystem, HealthPlanType, ContractType } from '../../types';

interface Props {
  value: EmployeeCondicion[];
  onChange: (v: EmployeeCondicion[]) => void;
  empresa?: { studyId: string; companyId: string; employeeId: string }; // para guardar respaldos
}

const AFPS: PensionSystem[] = ['CAPITAL', 'CUPRUM', 'HABITAT', 'MODELO', 'PLANVITAL', 'PROVIDA', 'UNO', 'INP', 'JUBILADO_COTIZA', 'JUBILADO_NO_COTIZA'];
const SALUD: HealthSystem[] = ['FONASA', 'BANMEDICA', 'COLMENA', 'CONSALUD', 'CRUZ_BLANCA', 'NUEVA_MASVIDA', 'VIDA_TRES', 'ESENCIAL', 'ISALUD'];
const PLANES: { v: HealthPlanType; t: string }[] = [
  { v: 'FONASA_7', t: 'Fonasa 7%' }, { v: 'ISAPRE_UF', t: 'Isapre en UF' }, { v: 'ISAPRE_PESOS', t: 'Isapre en $' }, { v: 'ISAPRE_PORCENTAJE', t: 'Isapre en %' },
];
const CONTRATOS: { v: ContractType; t: string }[] = [
  { v: 'INDEFINIDO', t: 'Indefinido' }, { v: 'PLAZO_FIJO', t: 'Plazo fijo' }, { v: 'OBRA_FAENA', t: 'Obra o faena' }, { v: 'PART_TIME', t: 'Part time' },
];
const MONTOS: { k: keyof EmployeeCondicion; t: string }[] = [
  { k: 'colacionPactada', t: 'Colación' }, { k: 'movilizacionPactada', t: 'Movilización' }, { k: 'viaticosPactados', t: 'Viáticos' },
  { k: 'bonosPactados', t: 'Bonos (imponible)' }, { k: 'otrosImponiblesPactados', t: 'Otros imponibles' }, { k: 'otrosNoImponiblesPactados', t: 'Otros no imponibles' },
  { k: 'descuentoPrestamoCuota', t: 'Cuota préstamo' }, { k: 'descuentoSeguroComplementario', t: 'Seguro complementario' },
  { k: 'descuentoAhorroBienestar', t: 'Ahorro / bienestar' }, { k: 'otrosDescuentosPactados', t: 'Otros descuentos' },
];
const inp = 'w-full px-2 py-1 border border-slate-300 rounded text-xs bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500';

export const CondicionesVigenciaEditor: React.FC<Props> = ({ value, onChange, empresa }) => {
  const [subiendo, setSubiendo] = React.useState<string | null>(null);
  const [error, setError] = React.useState('');
  const adjuntar = async (id: string, file?: File | null) => {
    if (!file || !empresa) return;
    setError(''); setSubiendo(id);
    try { const r = await subirRespaldo(empresa.studyId, empresa.companyId, empresa.employeeId, file); onChange(value.map(c => (c.id === id ? { ...c, respaldoId: r.id, respaldoNombre: r.nombre } : c))); }
    catch (e: any) { setError(e?.message || 'No se pudo subir el respaldo'); }
    finally { setSubiendo(null); }
  };
  const set = (id: string, patch: Partial<EmployeeCondicion>) => onChange(value.map(c => (c.id === id ? { ...c, ...patch } : c)));
  const num = (t: string) => (t === '' ? undefined : Number(t));
  const agregar = () => onChange([...value, { id: `cond_${Date.now()}`, desde: new Date().toISOString().slice(0, 7), registradoPor: auth.currentUser?.email || undefined, registradoEn: new Date().toISOString() }]);

  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/60">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <h4 className="text-xs font-bold text-slate-800 uppercase">Cambios con vigencia (desde / hasta)</h4>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Los datos de arriba son las condiciones iniciales. Aquí registras lo que cambia <b>desde un mes</b> (AFP, Isapre/Fonasa, contrato) o lo que rige <b>solo por un tiempo</b> (bonos, cuotas de préstamo). Los meses anteriores no se alteran. Deja vacío lo que no cambia.
          </p>
        </div>
        <button type="button" onClick={agregar} className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-indigo-700 border border-indigo-300 rounded-lg hover:bg-indigo-50 cursor-pointer">
          <Plus className="w-3.5 h-3.5" /> Agregar cambio
        </button>
      </div>
      {error && <p className="text-[11px] text-rose-600 font-semibold mb-1">{error}</p>}
      {value.length === 0 && <p className="text-[11px] text-slate-400 italic">Sin cambios registrados.</p>}
      <div className="space-y-3">
        {[...value].sort((a, b) => a.desde.localeCompare(b.desde)).map(c => (
          <div key={c.id} className="bg-white border border-slate-200 rounded-lg p-3">
            <div className="flex flex-wrap items-end gap-2 mb-2">
              <label className="text-[10px] font-semibold text-slate-600">Desde *<input type="month" required value={c.desde} onChange={e => set(c.id, { desde: e.target.value })} className={inp} /></label>
              <label className="text-[10px] font-semibold text-slate-600">Hasta (opcional)<input type="month" value={c.hasta || ''} onChange={e => set(c.id, { hasta: e.target.value || undefined })} className={inp} /></label>
              <label className="text-[10px] font-semibold text-slate-600 flex-1 min-w-[140px]">Motivo<input type="text" value={c.motivo || ''} onChange={e => set(c.id, { motivo: e.target.value })} placeholder="Ej. Cambio a Isapre" className={inp} /></label>
              <button type="button" onClick={() => onChange(value.filter(x => x.id !== c.id))} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded cursor-pointer" title="Eliminar cambio"><Trash2 className="w-4 h-4" /></button>
            </div>
            <div className="flex flex-wrap items-center gap-2 mb-2 text-[11px]">
              <span className="font-semibold text-slate-600">Respaldo (FUN, carta, anexo) — opcional:</span>
              {c.respaldoId ? (
                <>
                  <button type="button" onClick={() => empresa && abrirRespaldo(empresa.studyId, empresa.companyId, c.respaldoId!).catch(e => setError(e.message))} className="text-indigo-700 underline font-semibold cursor-pointer">{c.respaldoNombre || 'Ver respaldo'}</button>
                  <button type="button" onClick={() => set(c.id, { respaldoId: undefined, respaldoNombre: undefined })} className="text-rose-600 font-semibold cursor-pointer">Quitar</button>
                </>
              ) : empresa ? (
                <label className="cursor-pointer px-2 py-1 border border-slate-300 rounded text-slate-700 font-semibold hover:bg-slate-50">
                  {subiendo === c.id ? 'Subiendo...' : `Adjuntar (máx. ${tamanoLegible(MAX_RESPALDO_BYTES)})`}
                  <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={e => { adjuntar(c.id, e.target.files?.[0]); e.target.value = ''; }} />
                </label>
              ) : <span className="text-slate-400 italic">disponible al guardar la empresa</span>}
              {c.registradoPor && <span className="text-slate-400 ml-auto">Registrado por {c.registradoPor} · {(c.registradoEn || '').slice(0, 10)}</span>}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <label className="text-[10px] font-semibold text-slate-600">AFP
                <select value={c.pensionSystem || ''} onChange={e => set(c.id, { pensionSystem: (e.target.value || undefined) as PensionSystem | undefined, pensionCommissionPercent: undefined })} className={inp}>
                  <option value="">(sin cambio)</option>{AFPS.map(a => <option key={a} value={a}>{a}</option>)}
                </select></label>
              <label className="text-[10px] font-semibold text-slate-600">Salud
                <select value={c.healthSystem || ''} onChange={e => set(c.id, { healthSystem: (e.target.value || undefined) as HealthSystem | undefined })} className={inp}>
                  <option value="">(sin cambio)</option>{SALUD.map(a => <option key={a} value={a}>{a.replace('_', ' ')}</option>)}
                </select></label>
              <label className="text-[10px] font-semibold text-slate-600">Tipo de plan
                <select value={c.healthPlanType || ''} onChange={e => set(c.id, { healthPlanType: (e.target.value || undefined) as HealthPlanType | undefined })} className={inp}>
                  <option value="">(sin cambio)</option>{PLANES.map(p => <option key={p.v} value={p.v}>{p.t}</option>)}
                </select></label>
              <label className="text-[10px] font-semibold text-slate-600">Valor plan (UF, $ o %)
                <input type="number" step="any" value={c.healthPlanValue ?? ''} onChange={e => set(c.id, { healthPlanValue: num(e.target.value) })} className={inp} /></label>
              <label className="text-[10px] font-semibold text-slate-600">Tipo de contrato
                <select value={c.contractType || ''} onChange={e => set(c.id, { contractType: (e.target.value || undefined) as ContractType | undefined })} className={inp}>
                  <option value="">(sin cambio)</option>{CONTRATOS.map(p => <option key={p.v} value={p.v}>{p.t}</option>)}
                </select></label>
              {MONTOS.map(m => (
                <label key={String(m.k)} className="text-[10px] font-semibold text-slate-600">{m.t} ($)
                  <input type="number" value={(c[m.k] as number | undefined) ?? ''} onChange={e => set(c.id, { [m.k]: num(e.target.value) } as Partial<EmployeeCondicion>)} className={inp} /></label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
