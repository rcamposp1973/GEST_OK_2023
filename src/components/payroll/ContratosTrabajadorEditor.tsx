import React, { useState } from 'react';
import type { ContractType, ContratoLaboral, Employee, ProjectMaster } from '../../types';
import { contratosDe, nuevoContrato, terminarContrato, NOMBRE_TIPO_CONTRATO } from '../../utils/contratosLaborales';
import { CHILEAN_TERMINATION_CAUSALS } from './FiniquitosCalculatorModal';

/**
 * Historial de contratos del trabajador dentro de la ficha.
 * Al recontratar a la misma persona se registra un contrato nuevo: el finiquito considera solo el contrato que termina.
 */
type Ficha = Pick<Employee, 'contratos' | 'hireDate' | 'terminationDate' | 'contractType'>;

interface Props {
  ficha: Ficha;
  onChange: (cambios: Partial<Employee>) => void;
  obras?: ProjectMaster[]; // maestro de Proyectos / Obras de la empresa
}

const nombreCausal = (code?: string) => CHILEAN_TERMINATION_CAUSALS.find(c => c.code === code)?.name.split(' - ')[0] || '';

export default function ContratosTrabajadorEditor({ ficha, onChange, obras = [] }: Props) {
  const obrasActivas = obras.filter(o => o.estado !== 'Inactivo');
  const [obraId, setObraId] = useState('');
  const contratos = contratosDe(ficha);
  const actual = contratos[contratos.length - 1];
  const [modo, setModo] = useState<'' | 'termino' | 'nuevo'>('');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [causal, setCausal] = useState(actual?.tipo === 'OBRA_FAENA' ? 'ART_159_CONCLUSION' : actual?.tipo === 'PLAZO_FIJO' ? 'ART_159_VENCIMIENTO' : 'ART_159_RENUNCIA');
  const [tipo, setTipo] = useState<ContractType>('OBRA_FAENA');
  const [obra, setObra] = useState('');
  const [error, setError] = useState('');

  if (!actual) return null;

  const aplicar = (fn: () => Ficha) => {
    try {
      const r = fn();
      onChange({ contratos: r.contratos, hireDate: r.hireDate, contractType: r.contractType, terminationDate: r.terminationDate });
      setModo(''); setError('');
    } catch (e: any) { setError(e?.message || 'No se pudo registrar'); }
  };

  const asignarObra = (c: ContratoLaboral, id: string) => {
    const o = obras.find(x => x.id === id);
    onChange({ contratos: contratos.map(x => (x.id === c.id ? { ...x, obraId: id || undefined, obraFaena: o ? o.name : x.obraFaena } : x)) });
  };

  const actualizarObra = (c: ContratoLaboral, texto: string) =>
    onChange({ contratos: contratos.map(x => (x.id === c.id ? { ...x, obraFaena: texto } : x)) });

  return (
    <div className="md:col-span-3 border border-slate-200 rounded-xl p-3 space-y-3 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="text-xs font-semibold text-slate-800">Contratos</span>
          <p className="text-[11px] text-slate-500">Si vuelves a contratar a esta persona, registra un contrato nuevo: la antigüedad y el finiquito se calculan solo sobre el contrato que termina.</p>
        </div>
        <div className="flex gap-2">
          {!actual.fechaTermino && (
            <button type="button" onClick={() => setModo(modo === 'termino' ? '' : 'termino')} className="text-xs border border-slate-300 rounded-lg px-2.5 py-1 hover:bg-slate-50">Registrar término</button>
          )}
          {actual.fechaTermino && (
            <button type="button" onClick={() => setModo(modo === 'nuevo' ? '' : 'nuevo')} className="text-xs bg-slate-900 text-white rounded-lg px-2.5 py-1">Nuevo contrato</button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-slate-500 text-left">
            <tr><th className="py-1 pr-2 font-medium">Tipo</th><th className="py-1 pr-2 font-medium">Obra o faena</th><th className="py-1 pr-2 font-medium">Inicio</th><th className="py-1 pr-2 font-medium">Término</th><th className="py-1 font-medium">Causal</th></tr>
          </thead>
          <tbody>
            {contratos.map(c => (
              <tr key={c.id} className="border-t border-slate-100">
                <td className="py-1 pr-2">{NOMBRE_TIPO_CONTRATO[c.tipo] || c.tipo}</td>
                <td className="py-1 pr-2">
                  {obras.length > 0 ? (
                    <select value={c.obraId || ''} onChange={e => asignarObra(c, e.target.value)} className="w-full min-w-[9rem] border border-slate-200 rounded px-1 py-0.5">
                      <option value="">{c.obraFaena && !c.obraId ? c.obraFaena : 'Sin obra'}</option>
                      {obras.map(o => <option key={o.id} value={o.id}>{o.code} · {o.name}</option>)}
                    </select>
                  ) : (
                    <input value={c.obraFaena || ''} onChange={e => actualizarObra(c, e.target.value)} placeholder={c.tipo === 'OBRA_FAENA' ? 'Nombre de la obra' : ''}
                      className="w-full min-w-[8rem] border border-slate-200 rounded px-1.5 py-0.5" />
                  )}
                </td>
                <td className="py-1 pr-2 font-mono">{c.fechaInicio}</td>
                <td className="py-1 pr-2 font-mono">{c.fechaTermino || <span className="text-emerald-700">Vigente</span>}</td>
                <td className="py-1">{nombreCausal(c.causalTermino)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modo === 'termino' && (
        <div className="flex flex-wrap items-end gap-2 bg-slate-50 rounded-lg p-2">
          <label className="text-[11px] text-slate-600">Fecha de término
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="block border border-slate-300 rounded px-2 py-1 text-xs" />
          </label>
          <label className="text-[11px] text-slate-600 flex-1 min-w-[14rem]">Causal
            <select value={causal} onChange={e => setCausal(e.target.value)} className="block w-full border border-slate-300 rounded px-2 py-1 text-xs">
              {CHILEAN_TERMINATION_CAUSALS.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => aplicar(() => terminarContrato(ficha, fecha, causal))} className="text-xs bg-slate-900 text-white rounded-lg px-3 py-1.5">Registrar</button>
        </div>
      )}

      {modo === 'nuevo' && (
        <div className="flex flex-wrap items-end gap-2 bg-slate-50 rounded-lg p-2">
          <label className="text-[11px] text-slate-600">Tipo
            <select value={tipo} onChange={e => setTipo(e.target.value as ContractType)} className="block border border-slate-300 rounded px-2 py-1 text-xs">
              {(Object.keys(NOMBRE_TIPO_CONTRATO) as ContractType[]).map(t => <option key={t} value={t}>{NOMBRE_TIPO_CONTRATO[t]}</option>)}
            </select>
          </label>
          <label className="text-[11px] text-slate-600">Fecha de inicio
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="block border border-slate-300 rounded px-2 py-1 text-xs" />
          </label>
          {obrasActivas.length > 0 ? (
            <label className="text-[11px] text-slate-600 flex-1 min-w-[10rem]">Obra o faena
              <select value={obraId} onChange={e => { setObraId(e.target.value); const o = obras.find(x => x.id === e.target.value); if (o?.fechaInicio && o.fechaInicio > fecha) setFecha(o.fechaInicio); }}
                className="block w-full border border-slate-300 rounded px-2 py-1 text-xs">
                <option value="">Sin obra</option>
                {obrasActivas.map(o => <option key={o.id} value={o.id}>{o.code} · {o.name}</option>)}
              </select>
            </label>
          ) : (
            <label className="text-[11px] text-slate-600 flex-1 min-w-[10rem]">Obra o faena
              <input value={obra} onChange={e => setObra(e.target.value)} className="block w-full border border-slate-300 rounded px-2 py-1 text-xs" />
            </label>
          )}
          <button type="button" onClick={() => aplicar(() => {
            const o = obras.find(x => x.id === obraId);
            const r = nuevoContrato(ficha, { tipo, fechaInicio: fecha, obraFaena: o ? o.name : (obra.trim() || undefined) });
            if (o && r.contratos) r.contratos[r.contratos.length - 1].obraId = o.id;
            return r;
          })} className="text-xs bg-slate-900 text-white rounded-lg px-3 py-1.5">Agregar</button>
        </div>
      )}
      {error && <p className="text-xs text-rose-700">{error}</p>}
      {(modo || error) ? null : actual.fechaTermino && (
        <p className="text-[11px] text-slate-500">El contrato actual está terminado. Guarda la ficha para conservar el registro.</p>
      )}
    </div>
  );
}
