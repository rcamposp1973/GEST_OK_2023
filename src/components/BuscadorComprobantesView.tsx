import React, { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Voucher } from '../types';

interface Props {
  vouchers: Voucher[];
  onOpenVoucher: (v: Voucher) => void;
}

const norm = (x: any) => String(x ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const fmt = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-CL');
const LIMITE = 200;

export default function BuscadorComprobantesView({ vouchers, onOpenVoucher }: Props) {
  const [q, setQ] = useState('');
  const [tipo, setTipo] = useState('');
  const [estado, setEstado] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  // Índice de texto por comprobante (se arma una sola vez por cambio de datos)
  const indexados = useMemo(() => vouchers.map(v => {
    const partes: string[] = [String(v.voucherNumber), v.gloss || '', v.origin || ''];
    (v.lines || []).forEach(l => {
      partes.push(l.documentRef || '', l.auxiliaryRut || '', l.auxiliaryName || '', l.accountCode || '', l.accountName || '', l.gloss || '', l.bankDocRef || '');
      partes.push(String(Math.round(l.debit || l.credit || 0)));
    });
    return { v, texto: norm(partes.join(' | ')), rutsLimpios: norm(partes.join(' ')).replace(/[.\-\s]/g, '') };
  }), [vouchers]);

  const resultados = useMemo(() => {
    const palabras = norm(q).split(/\s+/).filter(Boolean);
    const sinPuntos = palabras.map(p => p.replace(/[.\-]/g, ''));
    return indexados
      .filter(({ v, texto, rutsLimpios }) => {
        if (tipo && v.type !== tipo) return false;
        if (estado && (v.status || 'Valido') !== estado) return false;
        if (desde && v.date < desde) return false;
        if (hasta && v.date > hasta) return false;
        return palabras.every((p, i) => texto.includes(p) || (sinPuntos[i] && rutsLimpios.includes(sinPuntos[i])));
      })
      .map(x => x.v)
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.voucherNumber || 0) - (a.voucherNumber || 0));
  }, [indexados, q, tipo, estado, desde, hasta]);

  const hayFiltros = q || tipo || estado || desde || hasta;
  const limpiar = () => { setQ(''); setTipo(''); setEstado(''); setDesde(''); setHasta(''); };
  const mostrados = resultados.slice(0, LIMITE);

  const resumen = (v: Voucher) => {
    const t = norm(q).split(/\s+/).filter(Boolean);
    const lineas = (v.lines || []).filter(l => {
      if (t.length === 0) return false;
      const s = norm(`${l.documentRef} ${l.auxiliaryName} ${l.auxiliaryRut} ${l.accountName}`);
      return t.some(p => s.includes(p));
    });
    const l = lineas[0] || (v.lines || []).find(x => x.auxiliaryName || x.documentRef);
    if (!l) return '';
    return [l.auxiliaryName || l.auxiliaryRut, l.documentRef].filter(Boolean).join(' · ');
  };

  const campo = 'px-2.5 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white';

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Buscador de Comprobantes</h2>
        <p className="text-xs text-slate-500">Busca por N° de comprobante, N° de factura o documento, proveedor o cliente (nombre o RUT), glosa, cuenta o monto. Haz clic en una fila para abrir el comprobante.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            autoFocus
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Ej: 2089, 15432, METLIFE, 76.123.456-7, arriendo, 1500000"
            className={`${campo} w-full pl-9`}
          />
        </div>
        <select value={tipo} onChange={e => setTipo(e.target.value)} className={campo}>
          <option value="">Todos los tipos</option>
          <option value="Ingreso">Ingreso</option>
          <option value="Egreso">Egreso</option>
          <option value="Traspaso">Traspaso</option>
        </select>
        <select value={estado} onChange={e => setEstado(e.target.value)} className={campo}>
          <option value="">Todos los estados</option>
          <option value="Valido">Válido</option>
          <option value="Anulado">Anulado</option>
          <option value="Descuadrado">Descuadrado</option>
          <option value="Pendiente">Pendiente</option>
        </select>
        <input type="date" value={desde} onChange={e => setDesde(e.target.value)} className={campo} title="Desde" />
        <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className={campo} title="Hasta" />
        {hayFiltros && (
          <button type="button" onClick={limpiar} className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer">
            <X className="w-3.5 h-3.5" /> Limpiar
          </button>
        )}
      </div>

      <p className="text-xs text-slate-500">
        {resultados.length === vouchers.length ? `${vouchers.length} comprobantes` : `${resultados.length} de ${vouchers.length} comprobantes`}
        {resultados.length > LIMITE && ` (mostrando los ${LIMITE} más recientes; afina la búsqueda para ver el resto)`}
      </p>

      <div className="overflow-x-auto border border-slate-200 rounded-xl">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="text-left px-3 py-2">N°</th>
              <th className="text-left px-3 py-2">Fecha</th>
              <th className="text-left px-3 py-2">Tipo</th>
              <th className="text-left px-3 py-2">Glosa</th>
              <th className="text-left px-3 py-2">Contraparte / documento</th>
              <th className="text-right px-3 py-2">Monto</th>
              <th className="text-left px-3 py-2">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {mostrados.map(v => (
              <tr key={v.id} onClick={() => onOpenVoucher(v)} className="hover:bg-indigo-50/50 cursor-pointer">
                <td className="px-3 py-2 font-bold text-indigo-700">{v.voucherNumber}</td>
                <td className="px-3 py-2 whitespace-nowrap text-slate-600">{v.date}</td>
                <td className="px-3 py-2 text-slate-600">{v.type}</td>
                <td className="px-3 py-2 text-slate-800 max-w-[320px] truncate" title={v.gloss}>{v.gloss}</td>
                <td className="px-3 py-2 text-slate-600 max-w-[280px] truncate">{resumen(v)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">{fmt(v.totalDebit)}</td>
                <td className="px-3 py-2 text-xs text-slate-500">{v.status || 'Valido'}</td>
              </tr>
            ))}
            {mostrados.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-10 text-center text-slate-500">No se encontraron comprobantes con esos datos.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
