import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { db, auth } from '../../lib/firebase';
import { leerArchivoPrevired105, totalesPorInstitucion, FilaPrevired, NOMBRE_AFP_POR_CODIGO, NOMBRE_SALUD_POR_CODIGO } from '../../utils/previred105';

/**
 * Libro desde Previred: se cargan los archivos de 105 campos de cada mes (los que se suben o descargan de Previred)
 * y Gest_OK arma el libro de cotizaciones por trabajador y mes, los totales por institución y los asientos mensuales.
 * Sirve para empresas que liquidan fuera de Gest_OK.
 */
interface Nomina { periodo: string; filas: FilaPrevired[]; archivo?: string; cargadoPor?: string; cargadoEn?: string }

const p = (n: number) => `$${Math.round(n || 0).toLocaleString('es-CL')}`;
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export default function PreviredLibroView({ studyId, companyId, companyName, companyRut, anioInicial }: { studyId: string; companyId: string; companyName: string; companyRut: string; anioInicial: number }) {
  const [nominas, setNominas] = useState<Nomina[]>([]);
  const [anio, setAnio] = useState(anioInicial);
  const [aviso, setAviso] = useState('');
  const [mesVer, setMesVer] = useState<string>('');
  const col = useMemo(() => collection(db, 'studies', studyId, 'companies', companyId, 'previredNominas'), [studyId, companyId]);

  useEffect(() => onSnapshot(col, s => setNominas(s.docs.map(d => ({ periodo: d.id, ...(d.data() as any) } as Nomina)).sort((a, b) => a.periodo.localeCompare(b.periodo))), () => setNominas([])), [col]);

  const delAnio = nominas.filter(n => n.periodo.startsWith(String(anio)));

  const cargar = async (files: FileList | null) => {
    if (!files?.length) return;
    const msgs: string[] = [];
    for (const file of Array.from(files)) {
      const buf = await file.arrayBuffer();
      let texto = new TextDecoder('utf-8').decode(buf);
      if (texto.includes('�')) texto = new TextDecoder('iso-8859-1').decode(buf);
      const { filas, errores } = leerArchivoPrevired105(texto);
      if (!filas.length) { msgs.push(`${file.name}: no se encontraron líneas de 105 campos. ${errores[0] || ''}`); continue; }
      // Un archivo puede traer más de un período (o varias nóminas del mismo mes): se agrupa y se SUMA a lo ya cargado del mes
      const porPeriodo = new Map<string, FilaPrevired[]>();
      filas.forEach(f => { const k = f.periodo || 'sin-periodo'; porPeriodo.set(k, [...(porPeriodo.get(k) || []), f]); });
      for (const [per, fs] of porPeriodo) {
        if (per === 'sin-periodo') { msgs.push(`${file.name}: ${fs.length} líneas sin período válido (campo 9).`); continue; }
        const previa = nominas.find(n => n.periodo === per);
        const yaEsta = previa?.archivo?.split(' + ').includes(file.name);
        if (yaEsta) { msgs.push(`${file.name}: ya estaba cargado en ${per}.`); continue; }
        const todas = [...(previa?.filas || []), ...fs];
        await setDoc(doc(col, per), { periodo: per, filas: todas, archivo: [previa?.archivo, file.name].filter(Boolean).join(' + '), cargadoPor: auth.currentUser?.email || '', cargadoEn: new Date().toISOString() });
        msgs.push(`${file.name}: ${fs.length} trabajadores en ${per}${previa ? ' (sumado a la nómina ya cargada del mes)' : ''}.`);
      }
      if (errores.length) msgs.push(`${file.name}: ${errores.length} líneas con formato distinto se omitieron.`);
    }
    setAviso(msgs.join('\n'));
  };

  // Libro anual: trabajador × mes
  const trabajadores = useMemo(() => {
    const m = new Map<string, { rut: string; nombre: string; meses: Record<string, FilaPrevired[]> }>();
    for (const n of delAnio) for (const f of n.filas) {
      const k = f.rut;
      const t = m.get(k) || { rut: f.rut, nombre: f.nombre, meses: {} };
      (t.meses[n.periodo] = t.meses[n.periodo] || []).push(f);
      m.set(k, t);
    }
    return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [delAnio]);

  const sum = (fs: FilaPrevired[] | undefined, k: keyof FilaPrevired) => (fs || []).reduce((s, f) => s + (Number(f[k]) || 0), 0);

  const exportar = () => {
    const wb = XLSX.utils.book_new();
    const cab = [['Empresa', companyName], ['RUT', companyRut], ['Año', anio], ['Fuente', 'Archivos Previred de 105 campos cargados en Gest_OK'], []];
    const libro = [...cab, ['Período', 'RUT', 'Nombre', 'Días', 'AFP', 'Imponible AFP', 'Cotización AFP', 'SIS', 'APV', 'IPS', 'Salud', 'Fonasa', 'Isapre', 'CCAF', 'ISL', 'Mutual', 'Imponible AFC', 'AFC trabajador', 'AFC empleador', 'Seguro Social', 'Asig. familiar']];
    for (const n of delAnio) for (const f of n.filas) libro.push([n.periodo, f.rut, f.nombre, f.dias, NOMBRE_AFP_POR_CODIGO[f.afp] || f.afp, f.imponibleAfp, f.cotizacionAfp, f.sis, f.apv, f.ips, NOMBRE_SALUD_POR_CODIGO[f.salud] || f.salud, f.fonasa, f.isapreTotal, f.ccaf, f.isl, f.mutual, f.imponibleAfc, f.afcTrabajador, f.afcEmpleador, f.seguroSocial, f.asignacionFamiliar] as any);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(libro), 'Libro');
    // Asientos mensuales: Debe gasto (cargo del empleador) y retenciones al trabajador; Haber por pagar a cada institución
    const asientos: any[] = [...cab, ['Fecha', 'Cuenta (conceptual)', 'Debe', 'Haber', 'Glosa']];
    for (const n of delAnio) {
      const [y, m] = n.periodo.split('-').map(Number);
      const fecha = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
      const empleador = sum(n.filas, 'sis') + sum(n.filas, 'afcEmpleador') + sum(n.filas, 'isl') + sum(n.filas, 'mutual') + sum(n.filas, 'seguroSocial');
      const tot = totalesPorInstitucion(n.filas);
      const totalPorPagar = tot.reduce((s, t) => s + t.monto, 0);
      asientos.push([fecha, 'Leyes sociales cargo empleador (gasto)', empleador, 0, `Previred ${n.periodo}`]);
      asientos.push([fecha, 'Remuneraciones por pagar (descuentos previsionales del trabajador)', totalPorPagar - empleador, 0, `Previred ${n.periodo}`]);
      tot.forEach(t => asientos.push([fecha, `Cotizaciones por pagar ${t.institucion}`, 0, t.monto, `Previred ${n.periodo}`]));
      asientos.push([]);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(asientos), 'Asientos mensuales');
    const res = [...cab, ['Período', 'Trabajadores', 'Imponible AFP', 'Total a pagar Previred']];
    delAnio.forEach(n => res.push([n.periodo, new Set(n.filas.map(f => f.rut)).size, sum(n.filas, 'imponibleAfp'), totalesPorInstitucion(n.filas).reduce((s, t) => s + t.monto, 0)] as any));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(res), 'Resumen');
    XLSX.writeFile(wb, `Libro_Previred_${anio}_${companyRut.replace(/[^0-9kK]/g, '')}.xlsx`);
  };

  const ver = nominas.find(n => n.periodo === mesVer);

  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-900">Libro desde archivos Previred</h3>
          <p className="text-xs text-slate-600 max-w-2xl">Carga los archivos de 105 campos de cada mes (los que se suben o se descargan de Previred). Gest_OK arma el libro de cotizaciones por trabajador y mes, los totales por institución y los asientos mensuales. Si un mes tuvo varias nóminas, carga todas: se suman.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={anio} onChange={e => setAnio(Number(e.target.value))} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
            {[anioInicial + 1, anioInicial, anioInicial - 1, anioInicial - 2].map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <label className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold cursor-pointer">Cargar archivos Previred (.txt)
            <input type="file" accept=".txt,.csv" multiple className="hidden" onChange={e => { cargar(e.target.files); e.target.value = ''; }} />
          </label>
          <button onClick={exportar} disabled={!delAnio.length} className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold disabled:opacity-50">Excel: libro y asientos</button>
        </div>
      </div>
      {aviso && <pre className="text-xs bg-slate-50 border border-slate-200 rounded-lg p-2 whitespace-pre-wrap">{aviso}</pre>}

      <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-12 gap-1.5">
        {MESES.map((nm, i) => {
          const per = `${anio}-${String(i + 1).padStart(2, '0')}`;
          const n = nominas.find(x => x.periodo === per);
          return (
            <button key={per} onClick={() => setMesVer(n ? per : '')} className={`rounded-lg border px-2 py-1.5 text-left text-[11px] ${n ? (mesVer === per ? 'border-indigo-500 bg-indigo-50' : 'border-emerald-200 bg-emerald-50') : 'border-slate-200 text-slate-400'}`}>
              <div className="font-semibold">{nm}</div>
              <div className="font-mono">{n ? `${new Set(n.filas.map(f => f.rut)).size} trab.` : '—'}</div>
            </button>
          );
        })}
      </div>

      {ver && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-800">Nómina {ver.periodo} <span className="font-normal text-xs text-slate-500">· {ver.archivo}</span></h4>
            <button onClick={async () => { await deleteDoc(doc(col, ver.periodo)); setMesVer(''); }} className="text-xs text-rose-600 underline">Quitar este mes</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {totalesPorInstitucion(ver.filas).map(t => <span key={t.institucion} className="text-[11px] bg-slate-100 rounded-full px-2 py-0.5">{t.institucion}: <strong className="font-mono">{p(t.monto)}</strong></span>)}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-slate-500 border-b"><th className="text-left py-1">Trabajador</th><th>Días</th><th className="text-right">Imponible</th><th className="text-right">AFP</th><th className="text-right">SIS</th><th className="text-right">Salud</th><th className="text-right">AFC trab.</th><th className="text-right">AFC empl.</th><th className="text-right">Mutual/ISL</th><th className="text-right">Seg. Social</th></tr></thead>
              <tbody>{ver.filas.map((f, i) => (
                <tr key={i} className="border-b border-slate-100"><td className="py-1">{f.nombre}<div className="text-[10px] text-slate-400 font-mono">{f.rut} · {NOMBRE_AFP_POR_CODIGO[f.afp] || f.afp} · {NOMBRE_SALUD_POR_CODIGO[f.salud] || f.salud}</div></td>
                  <td className="text-center">{f.dias}</td><td className="text-right font-mono">{p(f.imponibleAfp)}</td><td className="text-right font-mono">{p(f.cotizacionAfp)}</td><td className="text-right font-mono">{p(f.sis)}</td>
                  <td className="text-right font-mono">{p(f.salud === '07' ? f.fonasa : f.isapreTotal)}</td><td className="text-right font-mono">{p(f.afcTrabajador)}</td><td className="text-right font-mono">{p(f.afcEmpleador)}</td><td className="text-right font-mono">{p(f.mutual + f.isl)}</td><td className="text-right font-mono">{p(f.seguroSocial)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {trabajadores.length > 0 && (
        <details>
          <summary className="text-xs font-semibold text-slate-700 cursor-pointer">Libro anual {anio}: imponible por trabajador y mes ({trabajadores.length} trabajadores)</summary>
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-[11px]">
              <thead><tr className="text-slate-500 border-b"><th className="text-left py-1">Trabajador</th>{MESES.map(m => <th key={m} className="text-right px-1">{m}</th>)}<th className="text-right px-1">Total</th></tr></thead>
              <tbody>{trabajadores.map(t => {
                const vals = MESES.map((_, i) => sum(t.meses[`${anio}-${String(i + 1).padStart(2, '0')}`], 'imponibleAfp'));
                return <tr key={t.rut} className="border-b border-slate-100"><td className="py-1">{t.nombre}</td>{vals.map((v, i) => <td key={i} className="text-right font-mono px-1">{v ? Math.round(v).toLocaleString('es-CL') : ''}</td>)}<td className="text-right font-mono px-1 font-semibold">{Math.round(vals.reduce((a, b) => a + b, 0)).toLocaleString('es-CL')}</td></tr>;
              })}</tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
