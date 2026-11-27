import React, { useEffect, useState } from 'react';
import { F29_ESTRUCTURA, CODIGOS_NO_PESOS, ValoresF29, lineaConValor, CodigoF29, SeccionF29 } from '../utils/f29Estructura';
import { leerNumero } from '../utils/f29Ppm';

interface Extra { codigo?: string; glosa: string; monto: number }

/** Casillero que el contador puede modificar directamente en el formulario. */
export interface CampoEditable {
  manual: boolean;
  onCambiar: (n: number) => void;
  onRestablecer?: () => void;
  textoRestablecer?: string;
  nota?: string;
  bloqueado?: boolean;
  decimales?: number;
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const pesos = (n: number) => Math.round(n).toLocaleString('es-CL');
const fmt = (cod: string, v: number | undefined) => {
  if (v === undefined || v === null || (Number(v) === 0 && cod !== '115')) return '';
  if (cod === '115' || cod === '542' || cod === '702' || cod === '808' || cod === '60') return `${Number(v).toLocaleString('es-CL', { maximumFractionDigits: 3 })}%`;
  if (CODIGOS_NO_PESOS.has(cod)) return Number(v).toLocaleString('es-CL', { maximumFractionDigits: 3 });
  return pesos(v);
};

/** Input numérico que acepta coma decimal y no se "come" lo que el usuario está escribiendo. */
function InputCasillero({ cod, valor, campo }: { cod: string; valor: number; campo: CampoEditable }) {
  const esTasa = cod === '115';
  const mostrar = (v: number) => esTasa ? String(v ?? 0).replace('.', ',') : (v ? pesos(v) : '');
  const [txt, setTxt] = useState(mostrar(valor));
  const [foco, setFoco] = useState(false);
  useEffect(() => { if (!foco) setTxt(mostrar(valor)); }, [valor, foco]);
  return (
    <span className="inline-flex items-center gap-1">
      <input
        value={txt}
        disabled={campo.bloqueado}
        inputMode="decimal"
        onFocus={() => setFoco(true)}
        onBlur={() => { setFoco(false); setTxt(mostrar(valor)); }}
        onChange={e => {
          setTxt(e.target.value);
          const n = leerNumero(e.target.value);
          if (n !== null && n >= 0) campo.onCambiar(esTasa ? n : Math.round(n));
          else if (e.target.value.trim() === '') campo.onCambiar(0);
        }}
        title={campo.nota || 'Puede modificar este casillero'}
        className={`text-right font-mono rounded-md px-2 py-0.5 border border-dashed outline-none focus:ring-2 focus:ring-[#f2b67c] ${esTasa ? 'w-20' : 'w-32'} ${campo.manual ? 'bg-[#fff1df] border-[#e79b52] text-[#8a3d0c] font-bold' : 'bg-[#fffaf0] border-[#f1c999] text-[#3d3a35]'} disabled:opacity-60`}
      />
      {esTasa && <span className="text-[#8a3d0c]">%</span>}
    </span>
  );
}

/**
 * F29 de Gest_OK: misma estructura del F29 del SII (secciones, líneas y códigos), con diseño propio.
 * Compacto: sólo las líneas que afectan a la empresa en el período (y los totales). Completo: todo el formulario.
 */
export default function F29GestOk({ periodo, empresa, rut, folio, valores, extras = [], avisos = [], editables = {} }: {
  periodo: string; empresa: string; rut: string; folio?: string; valores: ValoresF29; extras?: Extra[]; avisos?: string[];
  editables?: Record<string, CampoEditable>;
}) {
  const [completo, setCompleto] = useState(false);
  const [y, m] = periodo.split('-');
  const siempre = new Set(Object.keys(editables));

  const valor = (c: CodigoF29) => {
    const campo = editables[c.cod];
    const v = valores[c.cod];
    if (campo) return <InputCasillero key={c.cod} cod={c.cod} valor={Number(v) || 0} campo={campo} />;
    const t = fmt(c.cod, v);
    return <span className={Number(v) < 0 ? 'text-[#b4373a]' : ''}>{t}</span>;
  };
  const cod = (cod: string) => (
    <span className="inline-block min-w-[2.6rem] text-center font-mono text-[10px] font-semibold rounded-full px-1.5 py-[1px] bg-[#e4f5f2] text-[#2b7a72] border border-[#c4e7e1]">{cod}</span>
  );

  // Agrupar secciones por grupo (encabezado grande como en el SII)
  const grupos: { grupo: string; secciones: SeccionF29[] }[] = [];
  F29_ESTRUCTURA.forEach(s => {
    const g = grupos.find(x => x.grupo === s.grupo);
    if (g) g.secciones.push(s); else grupos.push({ grupo: s.grupo, secciones: [s] });
  });

  return (
    <div className="bg-[#fffdf9] border border-[#f1dfcd] rounded-b-xl text-[#3d3a35]">
      {/* Encabezado */}
      <div className="px-5 py-4 border-b border-[#f1dfcd] bg-gradient-to-r from-[#fff0e3] via-[#fff8f1] to-[#e5f5f2] rounded-t-none">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-bold text-[#8a3d0c] tracking-tight">Formulario 29</div>
            <div className="text-xs text-[#6f6a62]">Declaración mensual y pago simultáneo de impuestos · versión Gest_OK</div>
          </div>
          <div className="inline-flex rounded-full border border-[#e9c9a8] overflow-hidden text-xs font-semibold bg-white">
            <button onClick={() => setCompleto(false)} className={`px-3 py-1.5 transition-colors ${!completo ? 'bg-[#f5b27a] text-[#4a2006]' : 'text-[#7a6a5a] hover:bg-[#fff3e8]'}`}>Compacto</button>
            <button onClick={() => setCompleto(true)} className={`px-3 py-1.5 transition-colors ${completo ? 'bg-[#8fd3c9] text-[#123f3a]' : 'text-[#7a6a5a] hover:bg-[#eef9f7]'}`}>Formulario completo</button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="bg-white/80 border border-[#f1dfcd] rounded-lg px-3 py-1.5"><div className="text-[10px] text-[#a0735a]">{cod('15')} Período tributario</div><div className="font-semibold">{MESES[Number(m) - 1] || m} {y}</div></div>
          <div className="bg-white/80 border border-[#f1dfcd] rounded-lg px-3 py-1.5"><div className="text-[10px] text-[#a0735a]">{cod('03')} RUT</div><div className="font-mono font-semibold">{rut}</div></div>
          <div className="bg-white/80 border border-[#f1dfcd] rounded-lg px-3 py-1.5 col-span-2 sm:col-span-1"><div className="text-[10px] text-[#a0735a]">{cod('01')} Razón social</div><div className="font-semibold truncate" title={empresa}>{empresa}</div></div>
          <div className="bg-white/80 border border-[#f1dfcd] rounded-lg px-3 py-1.5"><div className="text-[10px] text-[#a0735a]">{cod('07')} Folio</div><div className="font-mono font-semibold">{folio || '—'}</div></div>
        </div>
        {Object.keys(editables).length > 0 && (
          <p className="mt-2 text-[11px] text-[#7a6a5a]">Los casilleros con borde punteado se pueden modificar directamente (tasa PPM y remanentes). Los modificados a mano quedan en naranjo.</p>
        )}
      </div>

      {avisos.length > 0 && (
        <div className="mx-5 mt-4 space-y-1">
          {avisos.map((a, i) => <div key={i} className="text-xs bg-[#fff4e0] border border-[#f3d29b] text-[#7a4b08] rounded-lg px-3 py-2">{a}</div>)}
        </div>
      )}

      <div className="p-5 space-y-5">
        {grupos.map(({ grupo, secciones }) => {
          const visibles = secciones.map(sec => ({ sec, lineas: sec.lineas.filter(l => completo || lineaConValor(l, valores, siempre)) })).filter(x => x.lineas.length);
          if (!visibles.length) return null;
          return (
            <section key={grupo} className="rounded-xl border border-[#f1dfcd] overflow-hidden">
              <h4 className="px-4 py-2 bg-[#fde6d3] text-[#8a3d0c] text-sm font-bold text-center">{grupo}</h4>
              {visibles.map(({ sec, lineas }) => {
                const conCant = lineas.some(l => l.codigos.some(c => c.rol === 'cant'));
                return (
                  <div key={sec.id}>
                    {(sec.titulo || sec.columnas) && (
                      <div className="flex flex-wrap items-center gap-x-4 px-4 py-1.5 bg-[#e8f6f3] border-y border-[#d3ece7] text-[11px] font-semibold text-[#246a63]">
                        <span className="flex-1 min-w-[200px]">{sec.titulo || ''}</span>
                        {sec.columnas && conCant && sec.columnas[0] && <span className="w-44 text-right">{sec.columnas[0]}</span>}
                        {sec.columnas && <span className="w-48 text-right">{sec.columnas[1]}</span>}
                        <span className="w-5" />
                      </div>
                    )}
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <tbody>
                          {lineas.map((l, i) => {
                            const cant = l.codigos.find(c => c.rol === 'cant');
                            const monto = l.codigos.find(c => c.rol === 'monto');
                            const info = l.codigos.filter(c => c.rol === 'info' && (completo || editables[c.cod] || (valores[c.cod] !== undefined && Number(valores[c.cod]) !== 0)));
                            const notas = l.codigos.map(c => editables[c.cod]).filter(Boolean) as CampoEditable[];
                            return (
                              <tr key={`${l.linea}-${i}`} className={`border-b border-[#f6ebe0] last:border-b-0 ${l.total ? 'bg-[#fff2e4] font-bold' : 'hover:bg-[#fffaf4]'}`}>
                                <td className="py-1.5 pl-4 pr-2 w-10 text-right font-mono text-[#d08a5a] align-top">{l.linea ?? ''}</td>
                                <td className="py-1.5 pr-3 min-w-[220px] align-top">
                                  <span className={l.total ? 'text-[#7a3409]' : ''}>{l.glosa}</span>
                                  {info.length > 0 && (
                                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[10.5px] font-normal text-[#6f6a62]">
                                      {info.map(c => (
                                        <span key={c.cod} className="inline-flex items-center gap-1">{cod(c.cod)} {c.etiqueta}: <span className="font-mono text-[#3d3a35]">{valor(c)}{!editables[c.cod] && !fmt(c.cod, valores[c.cod]) ? '—' : ''}</span></span>
                                      ))}
                                    </div>
                                  )}
                                  {notas.map((n, k) => (n.nota || (n.manual && n.onRestablecer)) ? (
                                    <div key={k} className="mt-1 text-[10.5px] font-normal text-[#8a6a4a]">
                                      {n.nota}
                                      {n.manual && n.onRestablecer && !n.bloqueado && <button type="button" onClick={n.onRestablecer} className="ml-2 underline text-[#2b7a72] hover:text-[#1d5c55]">{n.textoRestablecer || 'Volver al cálculo automático'}</button>}
                                    </div>
                                  ) : null)}
                                </td>
                                {conCant && <td className="py-1.5 pr-1 w-12 text-right align-top">{cant && cod(cant.cod)}</td>}
                                {conCant && <td className="py-1.5 pr-3 w-32 text-right font-mono align-top">{cant && valor(cant)}</td>}
                                <td className="py-1.5 pr-1 w-12 text-right align-top">{monto && cod(monto.cod)}</td>
                                <td className={`py-1.5 pr-2 w-36 text-right font-mono align-top ${l.total ? 'text-[#a4470f]' : ''}`}>{monto && valor(monto)}</td>
                                <td className="py-1.5 pr-3 w-5 text-center font-mono text-[#c9a58a] align-top">{l.signo}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </section>
          );
        })}

        {extras.filter(e => e.monto).length > 0 && (
          <section className="rounded-xl border border-[#cfe9e4] overflow-hidden">
            <h4 className="px-4 py-2 bg-[#e3f4f1] text-[#246a63] text-sm font-bold">Otros conceptos incluidos en el total <span className="font-normal text-[11px]">· ingresados en Gest_OK</span></h4>
            <table className="w-full text-xs"><tbody>
              {extras.filter(e => e.monto).map((e, i) => (
                <tr key={i} className="border-b border-[#eef6f4] last:border-b-0">
                  <td className="py-1.5 pl-4 pr-3">{e.glosa}</td>
                  <td className="py-1.5 pr-1 w-16 text-right">{e.codigo && cod(e.codigo)}</td>
                  <td className="py-1.5 pr-2 w-36 text-right font-mono">{pesos(e.monto)}</td>
                  <td className="py-1.5 pr-3 w-5 text-center font-mono text-[#c9a58a]">+</td>
                </tr>
              ))}
            </tbody></table>
          </section>
        )}
        <p className="text-[10px] text-[#a0958a]">Estructura, líneas y códigos del F29 del SII; montos en pesos, sin decimales. La declaración se presenta en el SII.</p>
      </div>
    </div>
  );
}
