import React, { useState } from 'react';
import { F29_ESTRUCTURA, NOMBRE_CODIGO, ValoresF29, lineaConValor } from '../utils/f29Estructura';

interface Extra { codigo?: string; glosa: string; monto: number }

const pesos = (n: number) => Math.round(n).toLocaleString('es-CL');

/**
 * F29 de Gest_OK: misma estructura del F29 del SII (secciones, líneas y códigos), con diseño propio.
 * Compacto: sólo las líneas que afectan a la empresa en el período (y los totales). Completo: todo el formulario.
 */
export default function F29GestOk({ periodo, empresa, rut, valores, extras = [], avisos = [] }: {
  periodo: string; empresa: string; rut: string; valores: ValoresF29; extras?: Extra[]; avisos?: string[];
}) {
  const [completo, setCompleto] = useState(false);
  const [y, m] = periodo.split('-');
  const fmt = (cod: string, v: number | undefined) => {
    if (v === undefined) return '';
    if (cod === '115') return `${v.toLocaleString('es-CL', { maximumFractionDigits: 3 })}%`;
    return pesos(v);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-b-xl">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-200">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Formulario 29 · Declaración mensual y pago simultáneo de impuestos</div>
          <div className="text-base font-bold text-slate-900">{empresa} <span className="font-mono text-sm text-slate-500">· RUT {rut} · Período {m}/{y}</span></div>
        </div>
        <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden text-xs font-semibold">
          <button onClick={() => setCompleto(false)} className={`px-3 py-1.5 ${!completo ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>Compacto (lo que afecta a la empresa)</button>
          <button onClick={() => setCompleto(true)} className={`px-3 py-1.5 ${completo ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>Formulario completo</button>
        </div>
      </div>

      {avisos.length > 0 && (
        <div className="mx-5 mt-4 space-y-1">
          {avisos.map((a, i) => <div key={i} className="text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2">{a}</div>)}
        </div>
      )}

      <div className="p-5 space-y-5">
        {F29_ESTRUCTURA.map(sec => {
          const lineas = sec.lineas.filter(l => completo || lineaConValor(l, valores));
          if (!lineas.length) return null;
          return (
            <section key={sec.id}>
              <div className="flex items-baseline justify-between border-b-2 border-slate-800 pb-1 mb-1">
                <h4 className="text-sm font-bold text-slate-900">{sec.titulo}</h4>
                {sec.subtitulo && <span className="text-[11px] text-slate-500">{sec.subtitulo}</span>}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <tbody>
                    {lineas.map(l => {
                      const cant = l.codigos.find(c => c.rol === 'cant');
                      const monto = l.codigos.find(c => c.rol === 'monto');
                      const info = l.codigos.filter(c => c.rol === 'info' && (completo || (valores[c.cod] !== undefined && Number(valores[c.cod]) !== 0)));
                      const vMonto = monto ? valores[monto.cod] : undefined;
                      return (
                        <tr key={l.linea} className={`border-b border-slate-100 ${l.total ? 'bg-slate-50 font-bold' : ''}`}>
                          <td className="py-1.5 pr-2 w-10 text-right font-mono text-slate-400">{l.linea}</td>
                          <td className="py-1.5 pr-3 text-slate-800 min-w-[220px]">
                            {l.glosa}
                            {info.length > 0 && (
                              <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] font-normal text-slate-500">
                                {info.map(c => <span key={c.cod}>[{c.cod}] {NOMBRE_CODIGO[c.cod] || ''}: <span className="font-mono text-slate-700">{fmt(c.cod, valores[c.cod]) || '—'}</span></span>)}
                              </div>
                            )}
                          </td>
                          <td className="py-1.5 pr-2 w-14 text-right font-mono text-indigo-700">{cant ? `[${cant.cod}]` : ''}</td>
                          <td className="py-1.5 pr-3 w-20 text-right font-mono">{cant ? fmt(cant.cod, valores[cant.cod]) : ''}</td>
                          <td className="py-1.5 pr-2 w-14 text-right font-mono text-indigo-700">{monto ? `[${monto.cod}]` : ''}</td>
                          <td className={`py-1.5 pr-2 w-32 text-right font-mono ${Number(vMonto) < 0 ? 'text-rose-700' : 'text-slate-900'}`}>{monto ? fmt(monto.cod, vMonto) : ''}</td>
                          <td className="py-1.5 w-6 text-center font-mono text-slate-400">{l.signo}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}

        {extras.filter(e => e.monto).length > 0 && (
          <section>
            <div className="flex items-baseline justify-between border-b-2 border-slate-800 pb-1 mb-1">
              <h4 className="text-sm font-bold text-slate-900">Otros conceptos incluidos en el total</h4>
              <span className="text-[11px] text-slate-500">Códigos adicionales y ajustes ingresados en Gest_OK</span>
            </div>
            <table className="w-full text-xs"><tbody>
              {extras.filter(e => e.monto).map((e, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="py-1.5 pr-3 text-slate-800">{e.glosa}</td>
                  <td className="py-1.5 pr-2 w-14 text-right font-mono text-indigo-700">{e.codigo ? `[${e.codigo}]` : ''}</td>
                  <td className="py-1.5 pr-2 w-32 text-right font-mono">{pesos(e.monto)}</td>
                  <td className="py-1.5 w-6 text-center font-mono text-slate-400">+</td>
                </tr>
              ))}
            </tbody></table>
          </section>
        )}
        <p className="text-[10px] text-slate-400">Estructura, líneas y códigos del F29 del SII; montos en pesos, sin decimales. Es una propuesta de Gest_OK: la declaración se presenta en el SII.</p>
      </div>
    </div>
  );
}
