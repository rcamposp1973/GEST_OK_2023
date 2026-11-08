import React, { useMemo, useState } from 'react';
import { X, ChevronRight } from 'lucide-react';
import type { ChartOfAccount, Voucher, CostCenterMaster, ExpenseItemMaster } from '../types';

// Panel tipo "tabla dinámica" para el Estado de Resultados:
// filas = una dimensión (centro de costo, ítem, cuenta, auxiliar...), columnas = meses.
// Al hacer clic en una fila se baja un nivel (filtra y pasa a la siguiente dimensión);
// al hacer clic en un mes se llega directo a los movimientos de ese mes.

type Dim = 'cuenta' | 'cc' | 'item' | 'aux' | 'proyecto' | 'producto';
type Vista = Dim | 'mov';

interface Props {
  cuentas: ChartOfAccount[];
  naturaleza: 'INGRESO' | 'GASTO';
  vouchers: Voucher[];
  anio: number | string;
  mesCorte: number; // 1..12
  titulo: string;
  onClose: () => void;
  /** Para mostrar "código - nombre" en vez del código guardado en el comprobante. */
  costCenters?: CostCenterMaster[];
  expenseItems?: ExpenseItemMaster[];
  /** Abrir ya filtrado por una dimensión (p. ej. un centro de costo) y/o partiendo por otra. */
  filtroInicial?: { dim: Dim; valor: string };
  vistaInicial?: Dim;
}

type Linea = {
  fecha: string; mes: number; numero: number; glosa: string; valor: number;
  cuenta: string; cc: string; item: string; aux: string; proyecto: string; producto: string; doc: string;
};

const SIN = '(sin dato)';
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const NOMBRE_DIM: Record<Dim, string> = {
  cuenta: 'Cuenta', cc: 'Centro de costo', item: 'Ítem de gasto', aux: 'Auxiliar', proyecto: 'Proyecto', producto: 'Producto',
};
const fmt = (n: number) => Math.round(n).toLocaleString('es-CL');

/** Etiqueta "código - nombre" de un centro de costo o ítem guardado por código/id/nombre. */
export function etiquetaMaestro(raw: string | undefined, lista?: { id: string; code: string; name: string }[]): string {
  const v = (raw || '').trim();
  if (!v || v === 'NONE') return SIN;
  const low = v.toLowerCase();
  const m = lista?.find(x => x.id === v || x.code.toLowerCase() === low || x.name.toLowerCase() === low);
  return m ? `${m.code} - ${m.name}` : v;
}

export default function DetallePivotModal({ cuentas, naturaleza, vouchers, anio, mesCorte, titulo, onClose, costCenters, expenseItems, filtroInicial, vistaInicial }: Props) {
  const nMeses = mesCorte > 0 ? mesCorte : 12;

  const lineas = useMemo<Linea[]>(() => {
    const ids = new Set(cuentas.map(c => c.id));
    const codigos = new Map(cuentas.map(c => [c.code, c]));
    const out: Linea[] = [];
    const nombreAux = new Map<string, string>(); // un solo nombre por RUT, aunque venga escrito distinto
    vouchers.forEach(v => (v.lines || []).forEach(l => {
      const r = (l.auxiliaryRut || '').trim();
      if (r && !nombreAux.get(r) && (l.auxiliaryName || '').trim()) nombreAux.set(r, (l.auxiliaryName || '').trim());
    }));
    vouchers.forEach(v => {
      if (v.status === 'Anulado' || v.origin === 'CIERRE_ANIO') return;
      const f = v.date || '';
      if (f.slice(0, 4) !== String(anio)) return;
      const mes = parseInt(f.slice(5, 7), 10) - 1;
      if (mes < 0 || mes >= nMeses) return;
      // Misma regla que los informes: solo comprobantes cuadrados
      const deb = (v.lines || []).reduce((a, l) => a + (Number(l.debit) || 0), 0);
      const cre = (v.lines || []).reduce((a, l) => a + (Number(l.credit) || 0), 0);
      if (Math.abs(deb - cre) > 0.01) return;
      (v.lines || []).forEach(l => {
        const cta = ids.has(l.accountId) ? cuentas.find(c => c.id === l.accountId) : codigos.get(l.accountCode);
        if (!cta) return;
        const neto = (l.debit || 0) - (l.credit || 0);
        const rut = (l.auxiliaryRut || '').trim();
        out.push({
          fecha: f, mes, numero: Number(v.voucherNumber || 0), glosa: l.gloss || v.gloss || '',
          valor: naturaleza === 'INGRESO' ? -neto : neto,
          cuenta: `${cta.code} ${cta.name}`,
          cc: etiquetaMaestro(l.costCenter, costCenters),
          item: etiquetaMaestro(l.expenseItem, expenseItems),
          aux: rut ? `${rut} ${nombreAux.get(rut) || ''}`.trim() : SIN,
          proyecto: (l.project || '').trim() || SIN,
          producto: (l.product || '').trim() || SIN,
          doc: [l.documentType, l.documentRef].filter(Boolean).join(' ').trim(),
        });
      });
    });
    return out.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.numero - b.numero);
  }, [vouchers, cuentas, naturaleza, anio, nMeses, costCenters, expenseItems]);

  // Dimensiones con datos reales (cuenta solo si el panel abarca varias cuentas)
  const dimsDisponibles = useMemo<Dim[]>(() => {
    const d: Dim[] = [];
    if (cuentas.length > 1) d.push('cuenta');
    (['cc', 'item', 'aux', 'proyecto', 'producto'] as Dim[]).forEach(k => {
      if (lineas.some(l => l[k] !== SIN)) d.push(k);
    });
    return d;
  }, [lineas, cuentas.length]);

  const siguienteVista = (filtrosNuevos: { dim: Dim; valor: string }[]): Vista => {
    const u = filtrosNuevos.map(f => f.dim);
    const restantes = dimsDisponibles.filter(d => !u.includes(d));
    // Sugerencia natural: centro de costo ⇄ ítem; si no, la primera libre; si no, movimientos
    const ultima = u[u.length - 1];
    const par: Dim | undefined = ultima === 'cc' ? 'item' : ultima === 'item' ? 'cc' : undefined;
    if (par && restantes.includes(par)) return par;
    return restantes[0] || 'mov';
  };

  // Para auxiliares el filtro inicial puede venir solo con el RUT
  const filtroResuelto = filtroInicial && filtroInicial.dim === 'aux'
    ? { dim: filtroInicial.dim, valor: lineas.find(l => l.aux === filtroInicial.valor || l.aux.startsWith(filtroInicial.valor + ' '))?.aux ?? filtroInicial.valor }
    : filtroInicial;
  const [filtros, setFiltros] = useState<{ dim: Dim; valor: string }[]>(() => (filtroResuelto ? [filtroResuelto] : []));
  const [mesSel, setMesSel] = useState<number | null>(null);
  const [vista, setVista] = useState<Vista>(() => {
    if (vistaInicial && dimsDisponibles.includes(vistaInicial) && vistaInicial !== filtroResuelto?.dim) return vistaInicial;
    return filtroResuelto ? siguienteVista([filtroResuelto]) : (dimsDisponibles[0] || 'mov');
  });

  const usadas = filtros.map(f => f.dim);
  const libres = dimsDisponibles.filter(d => !usadas.includes(d));

  const filtradas = useMemo(
    () => lineas.filter(l => filtros.every(f => l[f.dim] === f.valor) && (mesSel === null || l.mes === mesSel)),
    [lineas, filtros, mesSel]
  );

  const filas = useMemo(() => {
    if (vista === 'mov') return [];
    const m = new Map<string, number[]>();
    filtradas.forEach(l => {
      const k = l[vista];
      const arr = m.get(k) || new Array(12).fill(0);
      arr[l.mes] += l.valor;
      m.set(k, arr);
    });
    return Array.from(m.entries())
      .map(([clave, meses]) => ({ clave, meses, total: meses.reduce((s, v) => s + v, 0) }))
      .filter(f => Math.round(f.total) !== 0 || f.meses.some(v => Math.round(v) !== 0))
      .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  }, [filtradas, vista]);

  const totalMeses = useMemo(() => {
    const t = new Array(12).fill(0);
    filtradas.forEach(l => { t[l.mes] += l.valor; });
    return t;
  }, [filtradas]);
  const totalGeneral = totalMeses.reduce((s, v) => s + v, 0);

  const bajar = (valor: string, mes: number | null) => {
    if (vista === 'mov') return;
    const nuevos = [...filtros, { dim: vista as Dim, valor }];
    setFiltros(nuevos);
    if (mes !== null) { setMesSel(mes); setVista('mov'); }
    else setVista(siguienteVista(nuevos));
  };

  const subirA = (n: number) => {
    // n = cantidad de filtros que se conservan
    const nuevos = filtros.slice(0, n);
    setFiltros(nuevos);
    setMesSel(null);
    setVista(nuevos.length === 0 ? (dimsDisponibles[0] || 'mov') : siguienteVista(nuevos));
  };

  const sinDimensiones = dimsDisponibles.length === 0;

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex justify-end" onClick={onClose}>
      <div className="bg-white w-full max-w-6xl h-full shadow-2xl flex flex-col text-slate-800" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-2 border-b border-slate-200 flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Estado de Resultados · detalle {anio} (ene–{MESES[nMeses - 1].toLowerCase()})</div>
            <div className="text-sm font-bold">{titulo}</div>
            <div className="text-[11px] text-slate-500">Total del período: <b>{fmt(totalGeneral)}</b> · {filtradas.length} movimientos</div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100" aria-label="Cerrar"><X size={18} /></button>
        </div>

        {/* Ruta de navegación */}
        <div className="px-4 py-1.5 border-b border-slate-100 flex items-center gap-1 flex-wrap text-[11px]">
          <button onClick={() => subirA(0)} className={`px-1.5 py-0.5 rounded font-bold ${filtros.length === 0 && mesSel === null ? 'text-slate-800' : 'text-indigo-600 hover:underline'}`}>
            Todo
          </button>
          {filtros.map((f, i) => (
            <React.Fragment key={i}>
              <ChevronRight size={12} className="text-slate-400" />
              <button onClick={() => subirA(i + 1)} className="px-1.5 py-0.5 rounded text-indigo-600 hover:underline">
                {NOMBRE_DIM[f.dim]}: <b>{f.valor}</b>
              </button>
            </React.Fragment>
          ))}
          {mesSel !== null && (
            <>
              <ChevronRight size={12} className="text-slate-400" />
              <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-bold">
                {MESES[mesSel]} {anio}
                <button className="ml-1 text-indigo-400 hover:text-indigo-700" onClick={() => { setMesSel(null); if (vista === 'mov') setVista(siguienteVista(filtros)); }} aria-label="Quitar mes">×</button>
              </span>
            </>
          )}
        </div>

        {/* Selector de agrupación */}
        <div className="px-4 py-1.5 border-b border-slate-100 flex items-center gap-1 flex-wrap">
          <span className="text-[10px] font-bold uppercase text-slate-500 mr-1">Ver por:</span>
          {libres.map(d => (
            <button key={d} onClick={() => setVista(d)}
              className={`px-2 py-0.5 text-[11px] font-bold rounded ${vista === d ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {NOMBRE_DIM[d]}
            </button>
          ))}
          <button onClick={() => setVista('mov')}
            className={`px-2 py-0.5 text-[11px] font-bold rounded ${vista === 'mov' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            Movimientos
          </button>
          {!sinDimensiones && vista !== 'mov' && <span className="ml-2 text-[10px] text-slate-400">Clic en un nombre para bajar un nivel · clic en un monto para ver los movimientos de ese mes</span>}
        </div>

        <div className="flex-1 overflow-auto p-3">
          {sinDimensiones && vista !== 'mov' && null}
          {vista !== 'mov' ? (
            <table className="w-full text-[11px] border-collapse">
              <thead className="bg-slate-50 text-slate-500 sticky top-0 z-10">
                <tr>
                  <th className="text-left p-1.5 sticky left-0 bg-slate-50 min-w-[200px]">{NOMBRE_DIM[vista]}</th>
                  {MESES.slice(0, nMeses).map(m => <th key={m} className="text-right p-1.5 whitespace-nowrap">{m}</th>)}
                  <th className="text-right p-1.5 font-bold">Total</th>
                </tr>
              </thead>
              <tbody>
                {filas.map(f => (
                  <tr key={f.clave} className="border-t border-slate-100 hover:bg-indigo-50/50">
                    <td className="px-1.5 py-0.5 sticky left-0 bg-white">
                      <button className="text-left text-indigo-700 hover:underline" onClick={() => bajar(f.clave, null)} title="Bajar un nivel">
                        {f.clave}
                      </button>
                    </td>
                    {f.meses.slice(0, nMeses).map((v, i) => (
                      <td key={i} className="px-1.5 py-0.5 text-right font-mono">
                        {Math.round(v) !== 0
                          ? <button className="hover:underline hover:text-indigo-700" onClick={() => bajar(f.clave, i)} title={`Ver movimientos de ${MESES[i]}`}>{fmt(v)}</button>
                          : ''}
                      </td>
                    ))}
                    <td className="px-1.5 py-0.5 text-right font-mono font-bold">{fmt(f.total)}</td>
                  </tr>
                ))}
                {filas.length === 0 && (
                  <tr><td colSpan={nMeses + 2} className="p-4 text-center text-slate-400">Sin movimientos para esta selección.</td></tr>
                )}
              </tbody>
              <tfoot className="bg-slate-100 font-bold sticky bottom-0">
                <tr className="border-t-2 border-slate-300">
                  <td className="px-1.5 py-1 sticky left-0 bg-slate-100">Total</td>
                  {totalMeses.slice(0, nMeses).map((v, i) => <td key={i} className="px-1.5 py-1 text-right font-mono">{Math.round(v) !== 0 ? fmt(v) : ''}</td>)}
                  <td className="px-1.5 py-1 text-right font-mono">{fmt(totalGeneral)}</td>
                </tr>
              </tfoot>
            </table>
          ) : (
            <table className="w-full text-[11px]">
              <thead className="bg-slate-50 text-slate-500 sticky top-0">
                <tr>
                  <th className="text-left p-1.5">Fecha</th><th className="text-left p-1.5">Vch</th>
                  {cuentas.length > 1 && <th className="text-left p-1.5">Cuenta</th>}
                  <th className="text-left p-1.5">Glosa</th>
                  <th className="text-left p-1.5">C. costo</th><th className="text-left p-1.5">Ítem</th><th className="text-left p-1.5">Auxiliar / Doc.</th>
                  <th className="text-right p-1.5">Monto</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.slice(0, 1000).map((l, i) => (
                  <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-1.5 py-0.5 font-mono whitespace-nowrap">{l.fecha}</td>
                    <td className="px-1.5 py-0.5">#{l.numero}</td>
                    {cuentas.length > 1 && <td className="px-1.5 py-0.5 max-w-[180px] truncate" title={l.cuenta}>{l.cuenta}</td>}
                    <td className="px-1.5 py-0.5 max-w-[240px] truncate" title={l.glosa}>{l.glosa}</td>
                    <td className="px-1.5 py-0.5">{l.cc === SIN ? '' : l.cc}</td>
                    <td className="px-1.5 py-0.5">{l.item === SIN ? '' : l.item}</td>
                    <td className="px-1.5 py-0.5 text-slate-500 max-w-[220px] truncate">{[l.aux === SIN ? '' : l.aux, l.doc].filter(Boolean).join(' · ')}</td>
                    <td className="px-1.5 py-0.5 text-right font-mono">{fmt(l.valor)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-100 font-bold">
                <tr className="border-t-2 border-slate-300">
                  <td className="px-1.5 py-1" colSpan={cuentas.length > 1 ? 7 : 6}>Total ({filtradas.length} movimientos{filtradas.length > 1000 ? ', se muestran los primeros 1.000' : ''})</td>
                  <td className="px-1.5 py-1 text-right font-mono">{fmt(totalGeneral)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
