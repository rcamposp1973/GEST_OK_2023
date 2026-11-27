import React from 'react';
import { ResultadoCmPpm } from '../utils/ppmActualizado';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const p = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

/** Detalle mes a mes de la actualización de los PPM (para revisar contra el F22). */
export function DetalleCmPpm({ r, oficial, faltan }: { r: ResultadoCmPpm; oficial: boolean; faltan: string[] }) {
  return (
    <div className="my-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="text-slate-500 text-left"><th className="py-1">Período F29</th><th>Pagado en</th><th className="text-right">PPM</th><th className="text-right">Factor</th><th className="text-right">Actualizado</th></tr></thead>
          <tbody>
            {r.detalle.filter(d => d.ppm).map(d => (
              <tr key={d.mes} className="border-t border-slate-200">
                <td className="py-1">{MESES[d.mes - 1]}</td><td className="font-mono">{d.mesPago}</td>
                <td className="text-right font-mono">{p(d.ppm)}</td><td className="text-right font-mono">{d.factor.toLocaleString('es-CL', { minimumFractionDigits: 3 })}</td>
                <td className="text-right font-mono">{p(d.actualizado)}</td>
              </tr>
            ))}
            <tr className="border-t border-slate-300 font-semibold"><td className="py-1" colSpan={2}>Total</td><td className="text-right font-mono">{p(r.historico)}</td><td /><td className="text-right font-mono">{p(r.actualizado)}</td></tr>
          </tbody>
        </table>
      </div>
      <p className="text-slate-600">Corrección monetaria calculada: <strong>{p(r.cmCalculada)}</strong>
        {r.cmYaContabilizada ? <> · ya contabilizada en la cuenta: <strong>{p(r.cmYaContabilizada)}</strong> · se agrega la diferencia: <strong>{p(r.cmSugerida)}</strong></> : null}
      </p>
      <p className="text-slate-500">Cada PPM se actualiza con el factor del mes en que se pagó el F29 (el mes siguiente al período); el de diciembre se paga en enero y no se actualiza.
        {oficial ? ' Factores oficiales del SII.' : ' El SII publica la tabla oficial en enero: por ahora los factores se estiman con el IPC mensual.'}
        {!oficial && faltan.length > 0 && ` Falta el IPC de: ${faltan.join(', ')} (se consideró 0%).`}
      </p>
    </div>
  );
}
