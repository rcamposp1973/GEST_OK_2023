import React, { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import type { Employee, ProjectMaster } from '../../types';
import { formatRut } from '../../utils/rutMatcher';
import { getPrevisionalParametersForPeriod } from '../../utils/payrollCalculator';
import { calcularFiniquito, baseArt172 } from '../../utils/finiquito';
import { terminarContrato, contratoActual } from '../../utils/contratosLaborales';

/**
 * Término de obra o faena para varios trabajadores a la vez (Art. 159 N° 5).
 * Calcula la indemnización del Art. 163 inc. 3° (Ley 21.122) y el feriado proporcional de cada uno.
 */
interface Props {
  employees: Employee[];
  companyName: string;
  onVerIndividual: (employeeId: string, fechaCese: string) => void;
  onGuardarTrabajador?: (emp: Employee) => Promise<void>;
  obras?: ProjectMaster[];
}

const pesos = (n: number) => '$' + Math.round(n).toLocaleString('es-CL');

export default function FiniquitoMasivoObra({ employees, companyName, onVerIndividual, onGuardarTrabajador, obras = [] }: Props) {
  const hoy = new Date().toISOString().slice(0, 10);
  const [fechaCese, setFechaCese] = useState(hoy);
  const [filtro, setFiltro] = useState('');
  const [obraId, setObraId] = useState('');
  const [seleccion, setSeleccion] = useState<Record<string, boolean>>({});
  const [vacTomadas, setVacTomadas] = useState<Record<string, number>>({});
  const [confirmando, setConfirmando] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  const obraSel = obras.find(o => o.id === obraId);
  const candidatos = useMemo(() => employees.filter(e =>
    // vigentes, o ya cerrados por el cierre de la obra elegida (para calcular su finiquito)
    (!e.terminationDate || (!!obraSel?.fechaTermino && e.terminationDate === obraSel.fechaTermino && contratoActual(e)?.obraId === obraId))
    && e.contractType === 'OBRA_FAENA' // solo contratos por obra o faena
    && (!obraId || contratoActual(e)?.obraId === obraId)
    && (!filtro || `${e.name} ${e.rut} ${e.department || ''} ${e.position || ''} ${contratoActual(e)?.obraFaena || ''}`.toLowerCase().includes(filtro.toLowerCase()))
  ), [employees, filtro, obraId, obraSel]);

  const uf = getPrevisionalParametersForPeriod(fechaCese.slice(0, 7)).uf || 0;

  const filas = useMemo(() => candidatos.map(e => {
    const id = e.id || e.rut;
    const r = calcularFiniquito({
      hireDate: e.hireDate, fechaCese, contractType: e.contractType,
      requiereIAS: false, requiereAvisoPrevio: false, esConclusionObra: true, conAvisoPrevio: false,
      baseMensual: baseArt172(e), ufCese: uf, diasVacacionesTomados: vacTomadas[id] || 0,
    });
    return { e, id, r };
  }), [candidatos, fechaCese, uf, vacTomadas]);

  const marcadas = filas.filter(f => seleccion[f.id]);
  const total = marcadas.reduce((s, f) => s + f.r.totalLiquido, 0);
  const todasMarcadas = filas.length > 0 && filas.every(f => seleccion[f.id]);

  const registrarTermino = async () => {
    if (!onGuardarTrabajador) return;
    setRegistrando(true); setMensaje('');
    let ok = 0; const fallas: string[] = [];
    for (const { e } of marcadas) {
      if (e.terminationDate === fechaCese) { ok++; continue; } // ya cerrado por la obra
      try { await onGuardarTrabajador(terminarContrato(e, fechaCese, 'ART_159_CONCLUSION') as Employee); ok++; }
      catch (err: any) { fallas.push(`${e.name}: ${err?.message || err}`); }
    }
    setRegistrando(false); setConfirmando(false); setSeleccion({});
    setMensaje(`Término registrado en ${ok} ficha(s).` + (fallas.length ? ` No se pudo en: ${fallas.join(' · ')}` : ''));
  };

  const exportar = () => {
    const cab = ['Trabajador', 'RUT', 'Cargo', 'Inicio', 'Término', 'Meses', 'Días por mes', 'Días indemnización', 'Indemnización obra', 'Días feriado pendientes', 'Feriado proporcional', 'Total'];
    const lineas = marcadas.map(({ e, r }) => [e.name, formatRut(e.rut), e.position || '', e.hireDate, fechaCese, r.mesesObra, r.diasPorMesObra, r.diasIndemnizacionObra, r.montoIndemnizacionObra, r.diasVacacionesPendientes, r.montoVacaciones, r.totalLiquido]);
    const csv = [cab, ...lineas].map(l => l.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `Termino_obra_${companyName.replace(/\W+/g, '_')}_${fechaCese}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 text-sm">
      <p className="text-slate-600">
        Selecciona a los trabajadores cuya obra o faena terminó. Para cada uno se calcula la indemnización del Art. 163 inc. 3° (días por mes trabajado según la fecha del contrato, con tope de 90 UF) y el feriado proporcional.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-slate-600">Fecha de término
          <input type="date" value={fechaCese} onChange={e => setFechaCese(e.target.value)} className="block mt-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
        </label>
        {obras.length > 0 && (
          <label className="text-xs text-slate-600">Obra
            <select value={obraId} onChange={e => {
              const id = e.target.value; setObraId(id); setSeleccion({});
              const o = obras.find(x => x.id === id);
              if (o?.fechaTermino) setFechaCese(o.fechaTermino);
            }} className="block mt-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm max-w-[16rem]">
              <option value="">Todas</option>
              {obras.map(o => <option key={o.id} value={o.id}>{o.code} · {o.name}{o.fechaTermino ? ` (termina ${o.fechaTermino})` : ''}</option>)}
            </select>
          </label>
        )}
        <label className="text-xs text-slate-600 flex-1 min-w-[12rem]">Buscar (nombre, RUT, obra o cargo)
          <input value={filtro} onChange={e => setFiltro(e.target.value)} className="block w-full mt-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
        </label>
      </div>
      {uf === 0 && <p className="text-xs text-amber-700">La UF de ese mes no está cargada: no se aplica el tope de 90 UF.</p>}

      {filas.length === 0 ? (
        <p className="text-slate-500 py-6 text-center">No hay trabajadores activos con contrato por obra o faena.</p>
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="p-2"><input type="checkbox" checked={todasMarcadas} onChange={e => setSeleccion(Object.fromEntries(filas.map(f => [f.id, e.target.checked])))} /></th>
                <th className="p-2 text-left">Trabajador</th>
                <th className="p-2 text-left">Inicio</th>
                <th className="p-2 text-right">Meses</th>
                <th className="p-2 text-right">Días indemn.</th>
                <th className="p-2 text-right">Indemnización</th>
                <th className="p-2 text-right" title="Días hábiles de feriado ya usados">Feriado tomado</th>
                <th className="p-2 text-right">Feriado prop.</th>
                <th className="p-2 text-right">Total</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {filas.map(({ e, id, r }) => (
                <tr key={id} className={`border-t border-slate-100 ${seleccion[id] ? 'bg-indigo-50/50' : ''}`}>
                  <td className="p-2 text-center"><input type="checkbox" checked={!!seleccion[id]} onChange={ev => setSeleccion(s => ({ ...s, [id]: ev.target.checked }))} /></td>
                  <td className="p-2">
                    <div className="font-medium text-slate-900">{e.name}</div>
                    <div className="text-slate-500">{formatRut(e.rut)}{e.position ? ` · ${e.position}` : ''}{contratoActual(e)?.obraFaena ? ` · ${contratoActual(e)?.obraFaena}` : ''}</div>
                    {r.avisoObra && <div className="text-amber-700 mt-0.5">{r.avisoObra}</div>}
                    {r.avisoFeriado && <div className="text-amber-700 mt-0.5">{r.avisoFeriado}</div>}
                  </td>
                  <td className="p-2 font-mono">{e.hireDate}</td>
                  <td className="p-2 text-right font-mono">{r.mesesObra}</td>
                  <td className="p-2 text-right font-mono">{r.diasIndemnizacionObra}</td>
                  <td className="p-2 text-right font-mono">{pesos(r.montoIndemnizacionObra)}</td>
                  <td className="p-2 text-right">
                    <input type="number" min={0} value={vacTomadas[id] || 0} onChange={ev => setVacTomadas(v => ({ ...v, [id]: Number(ev.target.value) || 0 }))}
                      className="w-16 border border-slate-300 rounded px-1 py-0.5 text-right font-mono" />
                  </td>
                  <td className="p-2 text-right font-mono">{pesos(r.montoVacaciones)}</td>
                  <td className="p-2 text-right font-mono font-semibold">{pesos(r.totalLiquido)}</td>
                  <td className="p-2">
                    <button onClick={() => onVerIndividual(id, fechaCese)} className="text-indigo-700 hover:underline whitespace-nowrap">Finiquito PDF</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-slate-700">{marcadas.length} trabajador(es) seleccionado(s) · Total a pagar: <strong className="font-mono">{pesos(total)}</strong></span>
        <div className="flex flex-wrap gap-2">
        {onGuardarTrabajador && !confirmando && (
          <button disabled={marcadas.length === 0} onClick={() => setConfirmando(true)}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs disabled:opacity-40 hover:bg-slate-50">
            Registrar término en las fichas
          </button>
        )}
        {confirmando && (
          <span className="flex items-center gap-2 text-xs bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
            ¿Registrar el {fechaCese} como término (Art. 159 N° 5) de {marcadas.length} contrato(s)?
            <button disabled={registrando} onClick={registrarTermino} className="bg-slate-900 text-white rounded px-2 py-0.5">{registrando ? 'Registrando…' : 'Sí, registrar'}</button>
            <button disabled={registrando} onClick={() => setConfirmando(false)} className="underline">Cancelar</button>
          </span>
        )}
        <button disabled={marcadas.length === 0} onClick={exportar}
          className="inline-flex items-center gap-1.5 bg-slate-900 text-white rounded-lg px-3 py-1.5 text-xs disabled:opacity-40">
          <Download className="w-4 h-4" /> Exportar seleccionados (Excel/CSV)
        </button>
        </div>
      </div>
      {mensaje && <p className="text-xs text-slate-700 bg-slate-100 rounded-lg px-3 py-2">{mensaje}</p>}
      <p className="text-xs text-slate-500">Base: última remuneración mensual (Art. 172) registrada en la ficha del trabajador. El feriado se paga en días corridos con factor aproximado de 1,4; revisa casos con feriado progresivo o regiones extremas (20 días).</p>
    </div>
  );
}
