import React, { useMemo, useRef, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import type { RCVDocument } from '../types';
import { formatearRut } from '../utils/rutFormato';

/**
 * Resumen de ventas por mes: año elegido vs año anterior (monto neto), listo para copiar y pegar en un correo.
 * Fuente: Registro de Ventas (RCV). Monto neto = neto afecto + exento; las notas de crédito restan.
 */
const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
const AZUL = '#4472c4';
const AZUL_CLARO = '#dae1f2';
const BORDE = '#9fb2dc';
const fmt = (n: number) => Math.round(n).toLocaleString('es-CL');

interface Props {
  company: { name: string; rut: string };
  rcvDocuments: RCVDocument[];
  year?: number;
}

export default function ResumenVentasMensual({ company, rcvDocuments, year }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState('');

  // Neto de ventas por año y mes
  const porAnio = useMemo(() => {
    const m = new Map<number, number[]>();
    rcvDocuments.forEach(d => {
      if (d.tipoRegistro !== 'Venta') return;
      const per = String(d.period || d.fechaEmision || '').slice(0, 7); // YYYY-MM
      const y = parseInt(per.slice(0, 4), 10), mes = parseInt(per.slice(5, 7), 10);
      if (!y || !mes || mes < 1 || mes > 12) return;
      const t = String(d.tipoDoc || '');
      const esNC = t === '61' || t === '112' || t === '106' || String(d.nombreTipoDoc || '').toLowerCase().includes('credito') || String(d.nombreTipoDoc || '').toLowerCase().includes('crédito');
      const monto = (Math.abs(d.montoNeto || 0) + Math.abs(d.montoExento || 0)) * (esNC ? -1 : 1);
      if (!m.has(y)) m.set(y, Array(12).fill(0));
      m.get(y)![mes - 1] += monto;
    });
    return m;
  }, [rcvDocuments]);

  const anios = useMemo(() => Array.from(porAnio.keys()).sort((a, b) => b - a), [porAnio]);
  const [anioSel, setAnioSel] = useState<number>(() => year || new Date().getFullYear());
  const actual = anioSel;
  const previo = actual - 1;
  const datosActual = porAnio.get(actual) || Array(12).fill(0);
  const datosPrevio = porAnio.get(previo) || Array(12).fill(0);
  const totActual = datosActual.reduce((a, b) => a + b, 0);
  const totPrevio = datosPrevio.reduce((a, b) => a + b, 0);

  const copiar = async () => {
    setError('');
    const el = ref.current;
    if (!el) return;
    const html = el.innerHTML;
    const texto = [
      `${company.name}`, `RUT ${formatearRut(company.rut)}`, 'RESUMEN VENTAS', '',
      ['MES', `MONTO NETO ${previo}`, `MONTO NETO ${actual}`].join('\t'),
      ...MESES.map((mes, i) => [mes, fmt(datosPrevio[i]), fmt(datosActual[i])].join('\t')),
      ['TOTAL', fmt(totPrevio), fmt(totActual)].join('\t'),
    ].join('\n');
    try {
      if (navigator.clipboard && (window as any).ClipboardItem) {
        await navigator.clipboard.write([new (window as any).ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([texto], { type: 'text/plain' }),
        })]);
      } else {
        throw new Error('sin ClipboardItem');
      }
      setCopiado(true); setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Plan B: seleccionar la tabla y copiar
      try {
        const sel = window.getSelection();
        const rango = document.createRange();
        rango.selectNodeContents(el);
        sel?.removeAllRanges(); sel?.addRange(rango);
        const ok = document.execCommand('copy');
        sel?.removeAllRanges();
        if (!ok) throw new Error('no copió');
        setCopiado(true); setTimeout(() => setCopiado(false), 2500);
      } catch {
        setError('No se pudo copiar automáticamente. Selecciona la tabla con el mouse y copia con Ctrl+C.');
      }
    }
  };

  const celdaCab: React.CSSProperties = { background: AZUL, color: '#fff', fontWeight: 700, padding: '6px 10px', border: `1px solid ${BORDE}`, textAlign: 'left', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 14 };
  const celda = (i: number, der = false, neg = false): React.CSSProperties => ({ background: i % 2 === 1 ? AZUL_CLARO : '#fff', color: neg ? '#b91c1c' : '#000', padding: '5px 10px', border: `1px solid ${BORDE}`, textAlign: der ? 'right' : 'left', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 14 });

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-extrabold text-slate-900" title="Monto neto del Registro de Ventas (incluye exentas; las notas de crédito restan). Pulsa Copiar y pégalo en tu correo.">Resumen de ventas por mes</h3>
        </div>
        <div className="flex items-center gap-2">
          <select value={anioSel} onChange={e => setAnioSel(parseInt(e.target.value, 10))} className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs bg-white font-semibold">
            {Array.from(new Set([anioSel, ...anios])).sort((a, b) => b - a).map(y => <option key={y} value={y}>{y} vs {y - 1}</option>)}
          </select>
          <button onClick={copiar} className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5">
            {copiado ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
            {copiado ? 'Copiado' : 'Copiar para correo'}
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">{error}</p>}
      {copiado && <p className="text-xs text-emerald-800">Listo. Ahora pega con Ctrl+V en el correo.</p>}

      <div className="overflow-x-auto">
        <div ref={ref} style={{ background: '#fff', display: 'inline-block', padding: 4 }}>
          <table style={{ borderCollapse: 'collapse', marginBottom: 14 }}>
            <tbody>
              <tr><td style={{ ...celdaCab, fontSize: 16 }}>{company.name}</td></tr>
              <tr><td style={celdaCab}>RUT {formatearRut(company.rut)}</td></tr>
              <tr><td style={celdaCab}>RESUMEN VENTAS</td></tr>
            </tbody>
          </table>
          <table style={{ borderCollapse: 'collapse', minWidth: 460 }}>
            <thead>
              <tr>
                <th style={{ ...celdaCab, verticalAlign: 'bottom' }}>MES</th>
                <th style={{ ...celdaCab, textAlign: 'right' }}>MONTO NETO<br />{previo}</th>
                <th style={{ ...celdaCab, textAlign: 'right' }}>MONTO NETO<br />{actual}</th>
              </tr>
            </thead>
            <tbody>
              {MESES.map((mes, i) => (
                <tr key={mes}>
                  <td style={celda(i)}>{mes}</td>
                  <td style={celda(i, true, datosPrevio[i] < 0)}>{fmt(datosPrevio[i])}</td>
                  <td style={celda(i, true, datosActual[i] < 0)}>{fmt(datosActual[i])}</td>
                </tr>
              ))}
              <tr>
                <td style={{ ...celda(0), fontWeight: 700 }}>TOTAL</td>
                <td style={{ ...celda(0, true), fontWeight: 700 }}>{fmt(totPrevio)}</td>
                <td style={{ ...celda(0, true), fontWeight: 700 }}>{fmt(totActual)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
