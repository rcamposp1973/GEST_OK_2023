import React from 'react';
import { InputNumeroCL } from './ui/NumeroCL';
import { MovimientosRegistros, ResultadoRegistros, RegimenRegistros } from '../utils/gestRta/registros';

const p = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n || 0)).toLocaleString('es-CL');

/** Registros RAI, DDAN, REX y SAC: saldos iniciales reajustados, movimientos del año, imputación de retiros y saldos finales. */
export default function GestRtaRegistros({ regimen, mov, onMov, r, origenIniciales, cptFinal, idpc, tasaIdpc, bloqueado }: {
  regimen: RegimenRegistros; mov: MovimientosRegistros; onMov: (m: MovimientosRegistros) => void; r: ResultadoRegistros;
  origenIniciales: string; cptFinal: number; idpc: number; tasaIdpc: number; bloqueado?: boolean;
}) {
  const general = regimen === '14_A';
  const campo = (label: string, k: keyof MovimientosRegistros, dec = 0, ayuda?: string) => (
    <label className="flex items-center justify-between gap-3 py-1" title={ayuda}>
      <span className="text-slate-600">{label}</span>
      <InputNumeroCL disabled={bloqueado} decimales={dec} value={mov[k]} onChange={n => onMov({ ...mov, [k]: n })} sufijo={k === 'reajusteInicialPct' ? '%' : undefined} />
    </label>
  );
  const filas: [string, keyof ResultadoRegistros['finales']][] = [
    ['RAI (rentas afectas a impuestos finales)', 'rai'],
    ...(general ? [['DDAN (diferencia depreciación acelerada / normal)', 'ddan'] as [string, keyof ResultadoRegistros['finales']]] : []),
    ['REX (rentas exentas e ingresos no renta)', 'rex'],
    ['SAC sin derecho a devolución', 'sacSinDevolucion'],
    ['SAC con derecho a devolución', 'sacConDevolucion'],
    ['Capital aportado reajustado', 'capitalAportado'],
  ];
  return (
    <div className="space-y-4 text-sm">
      <div className="grid md:grid-cols-2 gap-4">
        <div className="border border-slate-200 rounded-xl bg-white p-4">
          <h4 className="font-semibold text-slate-900 mb-1">Movimientos del año</h4>
          <p className="text-[11px] text-slate-500 mb-2">Saldos iniciales: {origenIniciales}. CPT final {p(cptFinal)} e IDPC {p(idpc)} (tasa {String(tasaIdpc).replace('.', ',')}%) vienen de la hoja de RLI.</p>
          {campo('Reajuste de saldos iniciales', 'reajusteInicialPct', 2, 'El mismo porcentaje que el SII publica para el CPT inicial (2025: 3,4%).')}
          {campo('Aumentos de capital (reajustados)', 'aumentosCapital')}
          {campo('Disminuciones de capital (reajustadas)', 'disminucionesCapital')}
          {campo('Rentas exentas / ingresos no renta del año (a REX)', 'rexDelAnio')}
          {general && campo('Diferencia depreciación acelerada − normal del año', 'ddanDelAnio')}
          {campo('Retiros, remesas o distribuciones del año', 'retiros')}
        </div>
        <div className="border border-slate-200 rounded-xl bg-white p-4 space-y-1">
          <h4 className="font-semibold text-slate-900 mb-1">Determinación e imputación</h4>
          <div className="flex justify-between"><span className="text-slate-600">Capital aportado reajustado</span><span className="font-mono">{p(r.capitalReajustado)}</span></div>
          <div className="flex justify-between"><span className="text-slate-600">RAI determinado (CPT + retiros − capital − REX)</span><span className="font-mono font-semibold">{p(r.raiDeterminado)}</span></div>
          <div className="pt-2 text-xs font-semibold text-slate-700">Retiros imputados a:</div>
          <div className="flex justify-between"><span className="text-slate-600">RAI</span><span className="font-mono">{p(r.imputacion.rai)}</span></div>
          {general && <div className="flex justify-between"><span className="text-slate-600">DDAN</span><span className="font-mono">{p(r.imputacion.ddan)}</span></div>}
          <div className="flex justify-between"><span className="text-slate-600">REX</span><span className="font-mono">{p(r.imputacion.rex)}</span></div>
          <div className="flex justify-between"><span className="text-slate-600">Capital</span><span className="font-mono">{p(r.imputacion.capital)}</span></div>
          {r.imputacion.exceso > 0 && <div className="flex justify-between text-rose-700"><span>Retiro en exceso</span><span className="font-mono">{p(r.imputacion.exceso)}</span></div>}
          <div className="flex justify-between pt-2 border-t border-slate-100"><span className="text-slate-600">Crédito SAC asignado a los retiros (factor {r.factorCredito.toLocaleString('es-CL', { maximumFractionDigits: 6 })})</span><span className="font-mono">{p(r.sacAsignado)}</span></div>
        </div>
      </div>
      {r.avisos.length > 0 && <div className="border border-amber-200 bg-amber-50 rounded-xl p-3 text-xs text-amber-900 space-y-1">{r.avisos.map((a, i) => <div key={i}>{a}</div>)}</div>}
      <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500"><tr><th className="text-left px-3 py-2">Registro</th><th className="text-right px-3">Saldo inicial reajustado</th><th className="text-right px-3">Saldo final al 31-12</th></tr></thead>
          <tbody>
            {filas.map(([t, k]) => (
              <tr key={k} className="border-t border-slate-100"><td className="px-3 py-1.5">{t}</td><td className="px-3 text-right font-mono">{p(r.iniciales[k])}</td><td className="px-3 text-right font-mono font-semibold">{p(r.finales[k])}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-400">Propuesta referencial según Art. 14 {general ? 'A N° 2' : 'D N° 3 letra d)'} LIR. Los saldos finales pasan solos como saldos iniciales del año siguiente. Revísalos antes de informarlos en el F22 y la DJ 1948.</p>
    </div>
  );
}
