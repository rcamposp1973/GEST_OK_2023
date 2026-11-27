import React from 'react';
import { InputNumeroEvento } from './ui/NumeroCL';
import { InputNumeroCL } from './ui/NumeroCL';
import { LicenciaGestRta, ModalidadGestRta, NOMBRE_MODALIDAD, NOMBRE_PERIODICIDAD, licenciaVigente } from '../utils/gestRta/licencia';

interface Props {
  activo: boolean;
  licencia: LicenciaGestRta;
  readOnly: boolean;
  onActivo: (v: boolean) => void;
  onChange: (l: LicenciaGestRta) => void;
}

/** Super Admin: contratación del módulo Gest_Rta para un estudio, con las condiciones negociadas. */
export default function GestRtaLicenciaPanel({ activo, licencia, readOnly, onActivo, onChange }: Props) {
  const set = (p: Partial<LicenciaGestRta>) => onChange({ ...licencia, ...p });
  const campo = 'border border-slate-300 rounded-md px-2 py-1 text-xs bg-white text-slate-800 disabled:bg-slate-100';
  const vigente = licenciaVigente(licencia);
  return (
    <div className="mt-4 border border-slate-200 rounded-xl bg-white p-4 text-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-semibold text-sm">Gest_Rta · Renta anual (módulo adicional)</div>
          <div className="text-xs text-slate-500">Base imponible, capital propio, asignación a propietarios y propuesta F22. Condiciones negociadas con el estudio.</div>
        </div>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" disabled={readOnly} checked={activo} onChange={e => onActivo(e.target.checked)} /> Contratado
        </label>
      </div>
      {activo && (
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <label className="flex flex-col gap-1">Modalidad
            <select disabled={readOnly} className={campo} value={licencia.modalidad} onChange={e => set({ modalidad: e.target.value as ModalidadGestRta })}>
              {(Object.keys(NOMBRE_MODALIDAD) as ModalidadGestRta[]).map(m => <option key={m} value={m}>{NOMBRE_MODALIDAD[m]}</option>)}
            </select>
          </label>
          {licencia.modalidad === 'CUPO_EMPRESAS' && (
            <label className="flex flex-col gap-1">Cupo de empresas
              <InputNumeroEvento disabled={readOnly} min={0} className={campo} value={licencia.cupoEmpresas ?? 0} onChange={e => set({ cupoEmpresas: Math.max(0, Number(e.target.value) || 0) })} decimales={4} />
            </label>
          )}
          <label className="flex flex-col gap-1">Precio acordado
            <div className="flex gap-1">
              <span className="flex-1"><InputNumeroCL disabled={readOnly} decimales={licencia.moneda === 'CLP' ? 0 : 2} className={campo + ' w-full text-right'} value={licencia.precioAcordado ?? null} onChange={n => set({ precioAcordado: n })} /></span>
              <select disabled={readOnly} className={campo} value={licencia.moneda || 'UF'} onChange={e => set({ moneda: e.target.value as any })}><option value="UF">UF</option><option value="CLP">CLP</option></select>
            </div>
          </label>
          <label className="flex flex-col gap-1">Periodicidad
            <select disabled={readOnly} className={campo} value={licencia.periodicidad || 'ANUAL'} onChange={e => set({ periodicidad: e.target.value as any })}>
              {Object.entries(NOMBRE_PERIODICIDAD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">Vigente desde
            <input disabled={readOnly} type="date" className={campo} value={licencia.vigenciaDesde || ''} onChange={e => set({ vigenciaDesde: e.target.value || undefined })} />
          </label>
          <label className="flex flex-col gap-1">Vigente hasta (vacío = sin término)
            <input disabled={readOnly} type="date" className={campo} value={licencia.vigenciaHasta || ''} onChange={e => set({ vigenciaHasta: e.target.value || undefined })} />
          </label>
          <label className="flex flex-col gap-1 md:col-span-3">Notas de la negociación
            <textarea disabled={readOnly} rows={2} className={campo} value={licencia.notas || ''} onChange={e => set({ notas: e.target.value })} />
          </label>
          <div className={`md:col-span-3 ${vigente ? 'text-emerald-700' : 'text-rose-700'}`}>
            {vigente ? 'Licencia vigente.' : 'Licencia fuera de vigencia: el módulo no se muestra en las empresas.'}
            {licencia.modalidad !== 'ESTUDIO' && ' El administrador del estudio activa Gest_Rta en cada empresa.'}
          </div>
        </div>
      )}
    </div>
  );
}
