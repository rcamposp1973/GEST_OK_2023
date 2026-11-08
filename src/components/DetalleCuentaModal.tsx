import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { ChartOfAccount, Voucher } from '../types';

interface Props {
  account: ChartOfAccount;
  /** Varias cuentas a la vez (p. ej. un rubro completo); si no se indica, solo `account`. */
  cuentasExtra?: ChartOfAccount[];
  /** Solo las líneas de este auxiliar ('' = líneas sin auxiliar). */
  soloRut?: string;
  vouchers: Voucher[];
  desde?: string;   // YYYY-MM-DD (incluido)
  hasta?: string;   // YYYY-MM-DD (incluido)
  titulo?: string;
  onClose: () => void;
  onOpenVoucher?: (voucherRef: Voucher | string | number) => void;
}

type Linea = {
  fecha: string; numero: number; voucher: Voucher; glosa: string; debe: number; haber: number;
  rut: string; auxiliar: string; doc: string; cc: string; item: string; proyecto: string; producto: string;
};

const fmt = (n: number) => Math.round(n).toLocaleString('es-CL');
const SIN = '(sin dato)';

export default function DetalleCuentaModal({ account, cuentasExtra, soloRut, vouchers, desde, hasta, titulo, onClose, onOpenVoucher }: Props) {
  const lineas = useMemo<Linea[]>(() => {
    const out: Linea[] = [];
    vouchers.forEach(v => {
      if (v.status === 'Anulado' || v.origin === 'CIERRE_ANIO') return;
      const f = v.date || '';
      if (desde && f < desde) return;
      if (hasta && f > hasta) return;
      (v.lines || []).forEach(l => {
        const enCuentas = cuentasExtra && cuentasExtra.length
          ? cuentasExtra.some(c => c.id === l.accountId || c.code === l.accountCode)
          : (l.accountId === account.id || l.accountCode === account.code);
        if (!enCuentas) return;
        if (soloRut !== undefined && (l.auxiliaryRut || '').trim() !== soloRut) return;
        out.push({
          fecha: f, numero: Number(v.voucherNumber || 0), voucher: v, glosa: l.gloss || v.gloss || '',
          debe: l.debit || 0, haber: l.credit || 0,
          rut: (l.auxiliaryRut || '').trim(), auxiliar: (l.auxiliaryName || '').trim(),
          doc: [l.documentType, l.documentRef].filter(Boolean).join(' ').trim(),
          cc: (l.costCenter || '').trim(), item: (l.expenseItem || '').trim(),
          proyecto: (l.project || '').trim(), producto: (l.product || '').trim(),
        });
      });
    });
    return out.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.numero - b.numero);
  }, [vouchers, account, cuentasExtra, soloRut, desde, hasta]);

  const agrupar = (clave: (l: Linea) => string, etiqueta?: (l: Linea) => string) => {
    const m = new Map<string, { clave: string; etiqueta: string; debe: number; haber: number; n: number }>();
    lineas.forEach(l => {
      const k = clave(l) || SIN;
      const g = m.get(k) || { clave: k, etiqueta: (etiqueta ? etiqueta(l) : k) || k, debe: 0, haber: 0, n: 0 };
      g.debe += l.debe; g.haber += l.haber; g.n += 1;
      m.set(k, g);
    });
    return Array.from(m.values()).sort((a, b) => Math.abs(b.debe - b.haber) - Math.abs(a.debe - a.haber));
  };

  const porAux = useMemo(() => agrupar(l => l.rut, l => (l.rut ? `${l.rut} ${l.auxiliar}` : SIN)), [lineas]);
  const porCC = useMemo(() => agrupar(l => l.cc), [lineas]);
  const porItem = useMemo(() => agrupar(l => l.item), [lineas]);
  const porProy = useMemo(() => agrupar(l => l.proyecto), [lineas]);
  const porProd = useMemo(() => agrupar(l => l.producto), [lineas]);
  // Documentos abiertos agrupados por auxiliar. El documento se reconoce por tipo (dígitos) + número,
  // así "33 #2540" y "DTE 33 N° 33 #2540" se compensan como el mismo documento.
  const abiertosPorAux = useMemo(() => {
    type Doc = { clave: string; etiqueta: string; debe: number; haber: number; n: number };
    type Aux = { rut: string; nombre: string; debe: number; haber: number; docs: Doc[] };
    const auxs = new Map<string, Aux>();
    lineas.forEach(l => {
      if (!l.doc) return;
      const numero = l.doc.match(/#\s*(\d+)/)?.[1] ?? l.doc.match(/(\d+)\s*$/)?.[1] ?? '';
      const tipo = (l.doc.match(/\d+/) || [''])[0];
      const clave = numero ? `${tipo}|${numero}` : l.doc;
      const etiqueta = numero ? `${tipo ? tipo + ' ' : ''}#${numero}` : l.doc;
      const kAux = l.rut || SIN;
      const a = auxs.get(kAux) || { rut: kAux, nombre: l.auxiliar, debe: 0, haber: 0, docs: [] };
      let d = a.docs.find(x => x.clave === clave);
      if (!d) { d = { clave, etiqueta, debe: 0, haber: 0, n: 0 }; a.docs.push(d); }
      d.debe += l.debe; d.haber += l.haber; d.n += 1;
      a.debe += l.debe; a.haber += l.haber;
      auxs.set(kAux, a);
    });
    return Array.from(auxs.values())
      .map(a => ({ ...a, docs: a.docs.filter(d => Math.round(d.debe - d.haber) !== 0).sort((x, y) => Math.abs(y.debe - y.haber) - Math.abs(x.debe - x.haber)) }))
      .filter(a => a.docs.length > 0)
      .sort((x, y) => Math.abs(y.debe - y.haber) - Math.abs(x.debe - x.haber));
  }, [lineas]);
  const nDocsAbiertos = abiertosPorAux.reduce((s, a) => s + a.docs.length, 0);
  const [expandidos, setExpandidos] = useState<Record<string, boolean>>({});

  const hay = (arr: { clave: string }[]) => arr.some(g => g.clave !== SIN);
  const tabs = [
    { id: 'mov', t: `Movimientos (${lineas.length})`, ok: true },
    { id: 'aux', t: 'Auxiliares', ok: hay(porAux) },
    { id: 'abiertos', t: `Documentos abiertos (${nDocsAbiertos})`, ok: nDocsAbiertos > 0 },
    { id: 'cc', t: 'Centros de costo', ok: hay(porCC) },
    { id: 'item', t: 'Ítems', ok: hay(porItem) },
    { id: 'proy', t: 'Proyectos', ok: hay(porProy) },
    { id: 'prod', t: 'Productos', ok: hay(porProd) },
  ].filter(t => t.ok);
  const [tab, setTab] = useState('mov');
  const activa = tabs.some(t => t.id === tab) ? tab : 'mov';

  const totalDebe = lineas.reduce((a, l) => a + l.debe, 0);
  const totalHaber = lineas.reduce((a, l) => a + l.haber, 0);

  const tablaGrupo = (g: { clave: string; etiqueta: string; debe: number; haber: number; n: number }[], cab: string) => (
    <table className="w-full text-xs">
      <thead className="bg-slate-50 text-slate-500 sticky top-0">
        <tr><th className="text-left p-1.5">{cab}</th><th className="text-right p-1.5">Mov.</th><th className="text-right p-1.5">Debe</th><th className="text-right p-1.5">Haber</th><th className="text-right p-1.5">Saldo</th></tr>
      </thead>
      <tbody>
        {g.map(x => (
          <tr key={x.clave} className="border-t border-slate-100">
            <td className="px-1.5 py-0.5">{x.etiqueta}</td>
            <td className="px-1.5 py-0.5 text-right">{x.n}</td>
            <td className="px-1.5 py-0.5 text-right font-mono">{x.debe ? fmt(x.debe) : ''}</td>
            <td className="px-1.5 py-0.5 text-right font-mono">{x.haber ? fmt(x.haber) : ''}</td>
            <td className="px-1.5 py-0.5 text-right font-mono font-bold">{fmt(x.debe - x.haber)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex justify-end" onClick={onClose}>
      <div className="bg-white w-full max-w-3xl h-full shadow-2xl flex flex-col text-slate-800" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-2 border-b border-slate-200 flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{titulo || 'Detalle de cuenta'}</div>
            <div className="text-sm font-bold">{account.code} · {account.name}</div>
            <div className="text-[11px] text-slate-500">
              {desde ? `Desde ${desde}` : 'Desde el inicio'} {hasta ? `hasta ${hasta}` : ''} · Debe {fmt(totalDebe)} · Haber {fmt(totalHaber)} · Saldo <b>{fmt(totalDebe - totalHaber)}</b>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100" aria-label="Cerrar"><X size={18} /></button>
        </div>

        <div className="px-3 pt-2 flex gap-1 flex-wrap border-b border-slate-100">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-t-md ${activa === t.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {t.t}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto p-3">
          {activa === 'mov' && (
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 sticky top-0">
                <tr><th className="text-left p-1.5">Fecha</th><th className="text-left p-1.5">Vch</th><th className="text-left p-1.5">Glosa</th><th className="text-left p-1.5">Auxiliar / Doc.</th><th className="text-right p-1.5">Debe</th><th className="text-right p-1.5">Haber</th></tr>
              </thead>
              <tbody>
                {lineas.map((l, i) => (
                  <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-1.5 py-0.5 font-mono whitespace-nowrap">{l.fecha}</td>
                    <td className="px-1.5 py-0.5">
                      {onOpenVoucher
                        ? <button className="text-indigo-600 hover:underline" onClick={() => onOpenVoucher(l.voucher)}>#{l.numero}</button>
                        : <>#{l.numero}</>}
                    </td>
                    <td className="px-1.5 py-0.5 max-w-[240px] truncate" title={l.glosa}>{l.glosa}</td>
                    <td className="px-1.5 py-0.5 text-slate-500">{[l.rut, l.doc].filter(Boolean).join(' · ')}</td>
                    <td className="px-1.5 py-0.5 text-right font-mono">{l.debe ? fmt(l.debe) : ''}</td>
                    <td className="px-1.5 py-0.5 text-right font-mono">{l.haber ? fmt(l.haber) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {activa === 'aux' && tablaGrupo(porAux, 'Auxiliar')}
          {activa === 'abiertos' && (
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 sticky top-0">
                <tr><th className="text-left p-1.5">Auxiliar / Documento</th><th className="text-right p-1.5">Docs</th><th className="text-right p-1.5">Debe</th><th className="text-right p-1.5">Haber</th><th className="text-right p-1.5">Saldo abierto</th></tr>
              </thead>
              <tbody>
                {abiertosPorAux.map(a => {
                  const abierto = expandidos[a.rut] ?? abiertosPorAux.length === 1;
                  return (
                    <React.Fragment key={a.rut}>
                      <tr className="border-t border-slate-200 bg-slate-50 cursor-pointer hover:bg-slate-100" onClick={() => setExpandidos(p => ({ ...p, [a.rut]: !abierto }))}>
                        <td className="px-1.5 py-1 font-bold">{abierto ? '▾' : '▸'} {a.rut === SIN ? SIN : `${a.rut} ${a.nombre}`}</td>
                        <td className="px-1.5 py-1 text-right">{a.docs.length}</td>
                        <td className="px-1.5 py-1 text-right font-mono">{fmt(a.docs.reduce((s, d) => s + d.debe, 0))}</td>
                        <td className="px-1.5 py-1 text-right font-mono">{fmt(a.docs.reduce((s, d) => s + d.haber, 0))}</td>
                        <td className="px-1.5 py-1 text-right font-mono font-bold">{fmt(a.docs.reduce((s, d) => s + d.debe - d.haber, 0))}</td>
                      </tr>
                      {abierto && a.docs.map(d => (
                        <tr key={d.clave} className="border-t border-slate-100">
                          <td className="pl-6 pr-1.5 py-0.5">{d.etiqueta}</td>
                          <td className="px-1.5 py-0.5 text-right">{d.n}</td>
                          <td className="px-1.5 py-0.5 text-right font-mono">{d.debe ? fmt(d.debe) : ''}</td>
                          <td className="px-1.5 py-0.5 text-right font-mono">{d.haber ? fmt(d.haber) : ''}</td>
                          <td className="px-1.5 py-0.5 text-right font-mono">{fmt(d.debe - d.haber)}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
          {activa === 'cc' && tablaGrupo(porCC, 'Centro de costo')}
          {activa === 'item' && tablaGrupo(porItem, 'Ítem de gasto')}
          {activa === 'proy' && tablaGrupo(porProy, 'Proyecto')}
          {activa === 'prod' && tablaGrupo(porProd, 'Producto')}
        </div>
      </div>
    </div>
  );
}
