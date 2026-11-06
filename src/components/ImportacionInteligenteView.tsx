import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { doc, updateDoc } from 'firebase/firestore';
import { Sparkles, Upload, CheckCircle2, AlertCircle, Download, Save, FileSpreadsheet, Users } from 'lucide-react';
import { db } from '../lib/firebase';
import type { Company, ChartOfAccount } from '../types';
import {
  ReglasImportacion, REGLAS_VACIAS, Libro, leerLibroRemuneraciones, chequearLibro,
  generarComprobante, datosComprobante, filasPlantilla, ENCABEZADOS_PLANTILLA, aprender, norm, prefijo,
} from '../utils/importacionInteligente';

interface Props {
  studyId: string;
  company: Company;
  accounts: ChartOfAccount[];
}

const fmt = (n: number) => Math.round(n).toLocaleString('es-CL');

const PROPOSITOS = [
  { id: 'remuneraciones', titulo: 'Libro de remuneraciones', desc: 'Planilla mensual (Talana u otro) → comprobante de sueldos', activo: true },
  { id: 'otro', titulo: 'Otro tipo de planilla', desc: 'Próximamente: facturas, liquidaciones, cartolas y más', activo: false },
];

export default function ImportacionInteligenteView({ studyId, company, accounts }: Props) {
  const reglasGuardadas: ReglasImportacion = (company as any).importReglas || REGLAS_VACIAS;
  const [reglas, setReglas] = useState<ReglasImportacion>(reglasGuardadas);
  const [proposito, setProposito] = useState<string>('');
  const [nombreArchivo, setNombreArchivo] = useState('');
  const [libro, setLibro] = useState<Libro | null>(null);
  const [error, setError] = useState('');
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [glosa, setGlosa] = useState('');
  const [numero, setNumero] = useState(1);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState('');

  const cargarArchivo = async (f: File) => {
    setError(''); setMsg(''); setLibro(null);
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      let hallado: Libro | null = null; let ultimoError = '';
      for (const nombre of wb.SheetNames) {
        const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[nombre], { header: 1, raw: true, defval: '' }) as any[][];
        const r = leerLibroRemuneraciones(rows);
        if (r.libro) { hallado = r.libro; break; }
        if (r.error) ultimoError = r.error;
      }
      if (!hallado) { setError(ultimoError || 'No encontré un libro de remuneraciones en este archivo.'); return; }
      setNombreArchivo(f.name);
      setLibro(hallado);
      setAnio(hallado.anio); setMes(hallado.mes);
      setGlosa(datosComprobante(hallado.anio, hallado.mes).glosa);
    } catch (e: any) {
      setError('No pude leer el archivo: ' + (e?.message || 'formato no reconocido'));
    }
  };

  const chequeos = useMemo(() => (libro ? chequearLibro(libro) : []), [libro]);
  const resultado = useMemo(() => (libro ? generarComprobante(libro, reglas) : null), [libro, reglas]);
  const meta = useMemo(() => {
    const d = datosComprobante(anio, mes);
    return { ...d, glosa: glosa || d.glosa, numero };
  }, [anio, mes, glosa, numero]);

  const cuentasImputables = useMemo(
    () => accounts.filter(a => a.isImputable !== false).sort((a, b) => a.code.localeCompare(b.code)),
    [accounts]
  );
  const nombreCuenta = (codigo: string) => accounts.find(a => a.code === codigo)?.name || '';

  const setCentro = (clave: string, v: string) =>
    setReglas(r => ({ ...r, centros: { ...r.centros, [clave]: v.trim().toUpperCase() } }));
  const setCuenta = (pf: string, codigo: string) =>
    setReglas(r => ({ ...r, cuentaPorPrefijo: { ...r.cuentaPorPrefijo, [pf]: { codigo, nombre: nombreCuenta(codigo) } } }));
  const setItem = (clave: string, v: string) =>
    setReglas(r => ({ ...r, items: { ...r.items, [clave]: v.trim().toUpperCase() } }));

  // Preguntas: se muestran mientras falte algo
  const pend = resultado?.pendientes;
  const centrosSinResolver = pend?.centros.filter(c => !reglas.centros[c.clave]) ?? [];
  const faltanPrefijos = pend?.prefijos ?? [];
  const itemsPorConfirmar = pend?.items ?? [];

  // los prefijos solo se conocen cuando todos los centros están resueltos
  const listo = !!resultado && centrosSinResolver.length === 0 && faltanPrefijos.length === 0;
  const cuadra = !!resultado && Math.round(resultado.debe) === Math.round(resultado.haber);

  const claveDe = (nombre: string) => libro?.conceptos.find(c => c.nombre === nombre)?.clave || norm(nombre);

  const descargar = () => {
    if (!resultado) return;
    const filas = filasPlantilla(resultado.lineas, meta);
    const ws = XLSX.utils.aoa_to_sheet([ENCABEZADOS_PLANTILLA as any, ...filas]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Comprobantes');
    XLSX.writeFile(wb, `Comprobante_Remuneraciones_${meta.periodo}.xlsx`);
  };

  const guardarReglas = async () => {
    if (!libro) return;
    setGuardando(true); setMsg('');
    try {
      const confirmadas = { centros: reglas.centros, cuentas: reglas.cuentaPorPrefijo, items: { ...reglas.items } };
      // los ítems sugeridos que el contador dejó tal cual también quedan confirmados
      itemsPorConfirmar.forEach(i => { confirmadas.items[claveDe(i.concepto)] = reglas.items[claveDe(i.concepto)] ?? i.sugerido; });
      const nuevas = aprender(reglas, libro, confirmadas);
      await updateDoc(doc(db, 'studies', studyId, 'companies', company.id), { importReglas: nuevas });
      setReglas(nuevas);
      setMsg('Reglas guardadas. El próximo mes ya no te preguntaré lo mismo.');
    } catch (e: any) {
      setMsg('No pude guardar las reglas: ' + (e?.message || 'error'));
    } finally { setGuardando(false); }
  };

  const card = 'bg-white border border-slate-200 rounded-xl p-5 shadow-sm';
  const input = 'border border-slate-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400';

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center"><Sparkles className="text-amber-600" size={22} /></div>
        <div>
          <h2 className="text-xl font-bold text-slate-800">Importación inteligente</h2>
          <p className="text-sm text-slate-500">Sube una planilla, dime para qué es, y te armo el comprobante cuadrado. {company.name}</p>
        </div>
      </div>

      {/* Paso 1 */}
      <div className={card}>
        <h3 className="font-semibold text-slate-800 mb-3">1. ¿Qué quieres importar?</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          {PROPOSITOS.map(p => (
            <button key={p.id} disabled={!p.activo} onClick={() => setProposito(p.id)}
              className={`text-left rounded-lg border p-4 transition ${proposito === p.id ? 'border-amber-500 bg-amber-50' : 'border-slate-200 hover:border-amber-300'} ${!p.activo ? 'opacity-50 cursor-not-allowed' : ''}`}>
              <div className="font-medium text-slate-800">{p.titulo}</div>
              <div className="text-xs text-slate-500 mt-1">{p.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Paso 2 */}
      {proposito === 'remuneraciones' && (
        <div className={card}>
          <h3 className="font-semibold text-slate-800 mb-3">2. Sube el libro de remuneraciones (Excel)</h3>
          <label className="flex items-center gap-3 border-2 border-dashed border-amber-300 rounded-lg p-5 cursor-pointer hover:bg-amber-50">
            <Upload className="text-amber-600" />
            <span className="text-sm text-slate-700">{nombreArchivo || 'Elegir archivo .xlsx'}</span>
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => e.target.files?.[0] && cargarArchivo(e.target.files[0])} />
          </label>
          {error && <div className="mt-3 flex gap-2 text-sm text-red-700 bg-red-50 rounded-md p-3"><AlertCircle size={16} className="mt-0.5" />{error}</div>}
        </div>
      )}

      {libro && resultado && (
        <>
          {/* Lo que entendí */}
          <div className={card}>
            <h3 className="font-semibold text-slate-800 mb-3">3. Esto es lo que entendí</h3>
            <div className="flex flex-wrap gap-4 text-sm text-slate-700 mb-3">
              <span className="flex items-center gap-1"><Users size={15} /> {libro.trabajadores.length} trabajadores</span>
              <span className="flex items-center gap-1"><FileSpreadsheet size={15} /> {libro.conceptos.length} conceptos</span>
              <span>Líquido a pago: <b>{fmt(libro.totales.liquidoAPago)}</b></span>
            </div>
            <ul className="space-y-1">
              {chequeos.map((c, i) => (
                <li key={i} className={`flex gap-2 text-sm ${c.ok ? 'text-emerald-700' : 'text-red-700'}`}>
                  {c.ok ? <CheckCircle2 size={16} className="mt-0.5" /> : <AlertCircle size={16} className="mt-0.5" />}
                  <span><b>{c.titulo}.</b> {c.detalle}</span>
                </li>
              ))}
            </ul>
            <div className="grid sm:grid-cols-4 gap-3 mt-4">
              <label className="text-xs text-slate-500">Año<input type="number" className={input + ' w-full'} value={anio} onChange={e => setAnio(+e.target.value)} /></label>
              <label className="text-xs text-slate-500">Mes<input type="number" min={1} max={12} className={input + ' w-full'} value={mes} onChange={e => { setMes(+e.target.value); setGlosa(datosComprobante(anio, +e.target.value).glosa); }} /></label>
              <label className="text-xs text-slate-500 sm:col-span-2">Glosa<input className={input + ' w-full'} value={glosa} onChange={e => setGlosa(e.target.value)} /></label>
            </div>
          </div>

          {/* Preguntas */}
          {(centrosSinResolver.length > 0 || faltanPrefijos.length > 0 || itemsPorConfirmar.length > 0) && (
            <div className={card}>
              <h3 className="font-semibold text-slate-800 mb-1">4. Necesito que me ayudes con esto</h3>
              <p className="text-xs text-slate-500 mb-4">Lo que respondas queda guardado para esta empresa.</p>

              {centrosSinResolver.length > 0 && (
                <div className="mb-5">
                  <div className="text-sm font-medium text-slate-700 mb-2">Centros de costo sin código propio ({centrosSinResolver.length})</div>
                  <div className="max-h-64 overflow-auto border border-slate-200 rounded-md">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-slate-500 text-xs"><tr><th className="text-left p-2">Centro en el archivo</th><th className="p-2">Trab.</th><th className="text-left p-2">Código propio (ej: A101)</th></tr></thead>
                      <tbody>
                        {centrosSinResolver.map(c => (
                          <tr key={c.clave} className="border-t border-slate-100">
                            <td className="p-2">{c.clave.replace('|', ' — ')}</td>
                            <td className="p-2 text-center">{c.trabajadores}</td>
                            <td className="p-2"><input className={input + ' w-28'} defaultValue="" onBlur={e => e.target.value && setCentro(c.clave, e.target.value)} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {centrosSinResolver.length === 0 && faltanPrefijos.length > 0 && (
                <div className="mb-5">
                  <div className="text-sm font-medium text-slate-700 mb-2">¿A qué cuenta de gasto va cada tipo de centro?</div>
                  {faltanPrefijos.map(pf => (
                    <div key={pf} className="flex items-center gap-3 mb-2 text-sm">
                      <span className="w-40">Centros que parten con <b>{pf || '(sin letra)'}</b></span>
                      <input list="cuentas-imp" className={input + ' w-40'} placeholder="Código cuenta" onBlur={e => e.target.value && setCuenta(pf, e.target.value.trim())} />
                      <span className="text-slate-500">{nombreCuenta(reglas.cuentaPorPrefijo[pf]?.codigo || '')}</span>
                    </div>
                  ))}
                  <datalist id="cuentas-imp">{cuentasImputables.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}</datalist>
                </div>
              )}

              {itemsPorConfirmar.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-slate-700 mb-2">Ítem de gasto por concepto ({itemsPorConfirmar.length}) — te sugerí uno, corrígelo si no es</div>
                  <div className="max-h-64 overflow-auto border border-slate-200 rounded-md">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-slate-500 text-xs"><tr><th className="text-left p-2">Concepto</th><th className="text-left p-2">Ítem</th></tr></thead>
                      <tbody>
                        {itemsPorConfirmar.map(i => {
                          const k = claveDe(i.concepto);
                          return (
                            <tr key={k} className="border-t border-slate-100">
                              <td className="p-2">{i.concepto}</td>
                              <td className="p-2"><input className={input + ' w-24'} defaultValue={i.sugerido} onBlur={e => setItem(k, e.target.value)} /></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Vista previa */}
          {listo && (
            <div className={card}>
              <h3 className="font-semibold text-slate-800 mb-3">5. Comprobante</h3>
              <div className="flex flex-wrap items-center gap-6 text-sm mb-3">
                <span>Debe: <b>{fmt(resultado.debe)}</b></span>
                <span>Haber: <b>{fmt(resultado.haber)}</b></span>
                <span className={cuadra ? 'text-emerald-700 font-semibold' : 'text-red-700 font-semibold'}>
                  {cuadra ? 'Cuadrado ✓' : `Diferencia: ${fmt(resultado.debe - resultado.haber)}`}
                </span>
                <span className="text-slate-500">{resultado.lineas.length} líneas</span>
                <label className="text-xs text-slate-500">N° comprobante <input type="number" className={input + ' w-20 ml-1'} value={numero} onChange={e => setNumero(+e.target.value || 1)} /></label>
              </div>
              <div className="max-h-72 overflow-auto border border-slate-200 rounded-md">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500 sticky top-0"><tr>
                    <th className="text-left p-2">Cuenta</th><th className="text-left p-2">Glosa</th><th className="text-left p-2">CC</th><th className="text-left p-2">Ítem</th><th className="text-right p-2">Debe</th><th className="text-right p-2">Haber</th>
                  </tr></thead>
                  <tbody>
                    {resultado.lineas.slice(0, 200).map((l, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="p-2">{l.cuenta || ''}</td><td className="p-2">{l.glosa}{l.razonSocial ? ` — ${l.razonSocial}` : ''}</td>
                        <td className="p-2">{l.centroCosto || ''}</td><td className="p-2">{l.item || ''}</td>
                        <td className="p-2 text-right">{l.debe ? fmt(l.debe) : ''}</td><td className="p-2 text-right">{l.haber ? fmt(l.haber) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {resultado.lineas.length > 200 && <p className="text-xs text-slate-400 mt-1">Mostrando las primeras 200 líneas; el Excel trae todas.</p>}
              <div className="flex flex-wrap gap-3 mt-4">
                <button onClick={descargar} disabled={!cuadra} className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white rounded-lg px-4 py-2 text-sm font-medium">
                  <Download size={16} /> Descargar comprobante (Excel)
                </button>
                <button onClick={guardarReglas} disabled={guardando} className="inline-flex items-center gap-2 border border-slate-300 hover:bg-slate-50 rounded-lg px-4 py-2 text-sm">
                  <Save size={16} /> {guardando ? 'Guardando…' : 'Guardar reglas de esta empresa'}
                </button>
              </div>
              {msg && <p className="text-sm mt-3 text-slate-600">{msg}</p>}
              <p className="text-xs text-slate-400 mt-2">El Excel sale en formato Plantilla de Carga Masiva: súbelo en Importaciones → Carga Masiva Comprobantes.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
