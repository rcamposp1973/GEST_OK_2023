import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDocs, setDoc, writeBatch } from 'firebase/firestore';
import { CalendarCheck, CheckCircle2, AlertCircle, Undo2, FilePlus2, Lock } from 'lucide-react';
import { db, auth } from '../lib/firebase';
import type { Company, ChartOfAccount, Voucher, AccountMatch, FiscalPeriodYear } from '../types';
import { logAuditEvent } from '../utils/auditLogger';
import { generarPropuesta, sugerirCuentas, ComprobanteProp, ORIGEN_CIERRE, ORIGEN_APERTURA } from '../utils/cierreAnio';

interface Props {
  studyId: string;
  company: Company;
  accounts: ChartOfAccount[];
  vouchers: Voucher[];
  fiscalYears?: FiscalPeriodYear[];
  onVouchersUpdated?: () => void;
}

const fmt = (n: number) => Math.round(n).toLocaleString('es-CL');

export default function CierreAperturaAnioView({ studyId, company, accounts, vouchers, fiscalYears = [], onVouchersUpdated }: Props) {
  const [matches, setMatches] = useState<AccountMatch[]>([]);
  useEffect(() => {
    getDocs(collection(db, 'studies', studyId, 'companies', company.id, 'accountMatches'))
      .then(snap => setMatches(snap.docs.map(d => ({ ...d.data(), id: d.id } as AccountMatch))))
      .catch(() => setMatches([]));
  }, [studyId, company.id]);

  const anios = useMemo(() => {
    const set = new Set<number>();
    vouchers.forEach(v => { const y = parseInt((v.date || '').slice(0, 4), 10); if (y) set.add(y); });
    return Array.from(set).sort((a, b) => b - a);
  }, [vouchers]);
  const [anio, setAnio] = useState<number>(() => anios[0] || new Date().getFullYear());
  const sug = useMemo(() => sugerirCuentas(accounts), [accounts]);
  const [resultadoId, setResultadoId] = useState(sug.resultadoId);
  const [utilidadesId, setUtilidadesId] = useState(sug.utilidadesId);
  const [trabajando, setTrabajando] = useState(false);
  const [msg, setMsg] = useState('');
  const [verCierre, setVerCierre] = useState(false);
  const [verApertura, setVerApertura] = useState(false);

  const patrimonio = useMemo(
    () => accounts.filter(a => a.isImputable !== false && /^2/.test(a.code)).sort((a, b) => a.code.localeCompare(b.code)),
    [accounts]
  );

  const prop = useMemo(
    () => generarPropuesta(accounts, vouchers, { anio, cuentaResultadoId: resultadoId, cuentaUtilidadesId: utilidadesId }, matches),
    [accounts, vouchers, anio, resultadoId, utilidadesId, matches]
  );
  const graves = prop.chequeos.filter(c => !c.ok && c.grave);
  const yaGenerado = prop.yaGenerados.cierre.length > 0 || prop.yaGenerados.apertura.length > 0;
  const puedeGenerar = graves.length === 0 && !yaGenerado && !trabajando;

  const companyRef = doc(db, 'studies', studyId, 'companies', company.id);

  const generar = async () => {
    if (!puedeGenerar) return;
    if (!window.confirm(`Se crearán 2 comprobantes de traspaso: el cierre del ejercicio ${anio} (31-12-${anio}) y la apertura ${anio + 1} (01-01-${anio + 1}). Podrás revertirlos después. ¿Continuar?`)) return;
    setTrabajando(true); setMsg('');
    try {
      let num = vouchers.reduce((m, v) => Math.max(m, v.voucherNumber || 0), 0);
      const batch = writeBatch(db);
      const ahora = new Date().toISOString();
      const uid = auth.currentUser?.uid || 'sistema';
      const email = auth.currentUser?.email || '';
      const crear = (c: ComprobanteProp) => {
        num += 1;
        batch.set(doc(collection(companyRef, 'vouchers')), {
          voucherNumber: num, date: c.fecha, period: c.periodo, type: 'Traspaso', gloss: c.glosa,
          lines: c.lineas, totalDebit: c.debe, totalCredit: c.haber, status: 'Valido',
          origin: c.origen, creationMode: 'SISTEMA',
          createdBy: uid, createdByUserEmail: email, createdAt: ahora, lastModifiedBy: uid, lastModifiedAt: ahora,
        });
        return num;
      };
      const nCierre = crear(prop.cierre);
      const nApertura = crear(prop.apertura);
      await batch.commit();
      logAuditEvent({
        userId: uid, userEmail: email, studyId, companyId: company.id,
        action: 'CONTABILIZAR', module: 'COMPROBANTES',
        details: `Cierre ejercicio ${anio} (#${nCierre}) y apertura ${anio + 1} (#${nApertura})`,
      } as any);
      setMsg(`Listo: cierre #${nCierre} y apertura #${nApertura} creados.`);
      onVouchersUpdated?.();
    } catch (e: any) {
      setMsg('No pude guardar: ' + (e?.message || 'error'));
    } finally { setTrabajando(false); }
  };

  const fyDe = (y: number) => fiscalYears.find(f => f.id === String(y) || Number(f.year) === y);
  const mesesAbiertos = Object.values(fyDe(anio)?.months || {}).filter(s => s === 'Abierto').length;

  const bloquearAnio = async () => {
    if (!window.confirm(`Se cerrarán los 12 meses de ${anio} (no se podrán registrar movimientos) y se dejará abierto enero de ${anio + 1}. Podrás reabrir meses desde Períodos. ¿Continuar?`)) return;
    setTrabajando(true); setMsg('');
    try {
      const cerrados: Record<number, 'Cerrado'> = {};
      for (let m = 1; m <= 12; m++) cerrados[m] = 'Cerrado';
      await setDoc(doc(companyRef, 'fiscalPeriods', String(anio)), { id: String(anio), year: anio, months: cerrados }, { merge: true });
      if (!fyDe(anio + 1)) {
        const siguiente: Record<number, 'Abierto' | 'Cerrado'> = {};
        for (let m = 1; m <= 12; m++) siguiente[m] = m === 1 ? 'Abierto' : 'Cerrado';
        await setDoc(doc(companyRef, 'fiscalPeriods', String(anio + 1)), { id: String(anio + 1), year: anio + 1, months: siguiente }, { merge: true });
      }
      logAuditEvent({
        userId: auth.currentUser?.uid || 'sistema', userEmail: auth.currentUser?.email || '', studyId, companyId: company.id,
        action: 'MODIFICAR', module: 'PERIODOS_FISCALES', details: `Bloqueo de los 12 meses de ${anio} tras el cierre`,
      } as any);
      setMsg(`Año ${anio} cerrado.`);
    } catch (e: any) {
      setMsg('No pude cerrar los meses: ' + (e?.message || 'error'));
    } finally { setTrabajando(false); }
  };

  const revertir = async () => {
    const todos = [...prop.yaGenerados.cierre, ...prop.yaGenerados.apertura];
    if (todos.length === 0) return;
    if (!window.confirm(`Se anularán ${todos.length} comprobante(s) de cierre/apertura (#${todos.map(v => v.voucherNumber).join(', #')}). ¿Continuar?`)) return;
    setTrabajando(true); setMsg('');
    try {
      const batch = writeBatch(db);
      const ahora = new Date().toISOString();
      const email = auth.currentUser?.email || '';
      todos.forEach(v => batch.update(doc(companyRef, 'vouchers', v.id), {
        status: 'Anulado', anuladoAt: ahora, anuladoPor: email, motivoAnulacion: `Reversa de cierre/apertura ${anio}`,
      }));
      await batch.commit();
      logAuditEvent({
        userId: auth.currentUser?.uid || 'sistema', userEmail: email, studyId, companyId: company.id,
        action: 'ANULAR', module: 'COMPROBANTES', details: `Reversa de cierre/apertura ${anio}`,
      } as any);
      setMsg('Comprobantes anulados. Puedes generar el cierre de nuevo.');
      onVouchersUpdated?.();
    } catch (e: any) {
      setMsg('No pude anular: ' + (e?.message || 'error'));
    } finally { setTrabajando(false); }
  };

  const card = 'bg-white border border-slate-200 rounded-xl p-3 shadow-sm';
  const sel = 'border border-slate-300 rounded-md px-2 py-1 text-xs bg-white w-full';

  const tabla = (c: ComprobanteProp, abierto: boolean) => abierto && (
    <div className="max-h-64 overflow-auto border border-slate-200 rounded-md mt-2">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 text-slate-500 sticky top-0">
          <tr><th className="text-left p-1.5">Cuenta</th><th className="text-left p-1.5">Auxiliar / Doc.</th><th className="text-right p-1.5">Debe</th><th className="text-right p-1.5">Haber</th></tr>
        </thead>
        <tbody>
          {c.lineas.slice(0, 300).map((l, i) => (
            <tr key={i} className="border-t border-slate-100">
              <td className="px-1.5 py-0.5">{l.accountCode} {l.accountName}</td>
              <td className="px-1.5 py-0.5 text-slate-500">{[l.auxiliaryRut, l.documentRef].filter(Boolean).join(' · ')}</td>
              <td className="px-1.5 py-0.5 text-right font-mono">{l.debit ? fmt(l.debit) : ''}</td>
              <td className="px-1.5 py-0.5 text-right font-mono">{l.credit ? fmt(l.credit) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-2 p-3 max-w-6xl mx-auto">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center"><CalendarCheck className="text-indigo-600" size={18} /></div>
        <div>
          <h2 className="text-base font-bold text-slate-800 leading-tight">Cierre y apertura de año</h2>
          <p className="text-[11px] text-slate-500">Traspasa el resultado a patrimonio y abre el año siguiente con los saldos. {company.name}</p>
        </div>
      </div>

      <div className={`${card} grid md:grid-cols-4 gap-2 items-end`}>
        <label className="text-[11px] font-semibold text-slate-600">Año a cerrar
          <select className={sel} value={anio} onChange={e => setAnio(+e.target.value)}>
            {(anios.length ? anios : [anio]).map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <label className="text-[11px] font-semibold text-slate-600 md:col-span-2">Cuenta que recibe el resultado del ejercicio
          <select className={sel} value={resultadoId} onChange={e => setResultadoId(e.target.value)}>
            <option value="">— elegir —</option>
            {patrimonio.map(a => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
          </select>
        </label>
        <label className="text-[11px] font-semibold text-slate-600">Resultado pasa en la apertura a
          <select className={sel} value={utilidadesId} onChange={e => setUtilidadesId(e.target.value)}>
            <option value="">— elegir —</option>
            {patrimonio.map(a => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
          </select>
        </label>
      </div>

      <div className="grid md:grid-cols-3 gap-2">
        <div className={card}><div className="text-[10px] font-bold uppercase text-slate-500">Ingresos {anio}</div><div className="text-lg font-bold font-mono">{fmt(prop.ingresos)}</div></div>
        <div className={card}><div className="text-[10px] font-bold uppercase text-slate-500">Gastos y costos {anio}</div><div className="text-lg font-bold font-mono">{fmt(prop.gastos)}</div></div>
        <div className={card}><div className="text-[10px] font-bold uppercase text-slate-500">{prop.resultado >= 0 ? 'Utilidad' : 'Pérdida'} del ejercicio</div><div className={`text-lg font-bold font-mono ${prop.resultado >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{fmt(Math.abs(prop.resultado))}</div></div>
      </div>

      <div className={card}>
        <div className="text-xs font-bold text-slate-700 mb-1">Revisión previa</div>
        <ul className="space-y-0.5">
          {prop.chequeos.map((c, i) => (
            <li key={i} className={`flex gap-1.5 text-xs ${c.ok ? 'text-emerald-700' : c.grave ? 'text-rose-700' : 'text-amber-700'}`}>
              {c.ok ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <AlertCircle size={14} className="mt-0.5 shrink-0" />}
              <span><b>{c.titulo}.</b> {c.detalle}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid md:grid-cols-2 gap-2">
        {[{ t: `1. Cierre de resultados · 31-12-${anio}`, c: prop.cierre, ab: verCierre, set: setVerCierre },
          { t: `2. Apertura · 01-01-${anio + 1}`, c: prop.apertura, ab: verApertura, set: setVerApertura }].map(x => (
          <div key={x.t} className={card}>
            <div className="flex justify-between items-center">
              <div className="text-xs font-bold text-slate-700">{x.t}</div>
              <button onClick={() => x.set(!x.ab)} className="text-[11px] text-indigo-600 hover:underline">{x.ab ? 'Ocultar líneas' : 'Ver líneas'}</button>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">{x.c.lineas.length} líneas · Debe {fmt(x.c.debe)} · Haber {fmt(x.c.haber)} {x.c.debe === x.c.haber ? '✓' : '✗'}</div>
            {tabla(x.c, x.ab)}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={generar} disabled={!puedeGenerar}
          className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg px-3 py-1.5 text-xs font-semibold">
          <FilePlus2 size={14} /> {trabajando ? 'Trabajando…' : 'Generar comprobantes de cierre y apertura'}
        </button>
        {yaGenerado && (
          <button onClick={revertir} disabled={trabajando}
            className="inline-flex items-center gap-1.5 border border-rose-300 text-rose-700 hover:bg-rose-50 rounded-lg px-3 py-1.5 text-xs font-semibold">
            <Undo2 size={14} /> Revertir cierre y apertura (#{[...prop.yaGenerados.cierre, ...prop.yaGenerados.apertura].map(v => v.voucherNumber).join(', #')})
          </button>
        )}
        {yaGenerado && mesesAbiertos > 0 && (
          <button onClick={bloquearAnio} disabled={trabajando}
            className="inline-flex items-center gap-1.5 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg px-3 py-1.5 text-xs font-semibold">
            <Lock size={14} /> Cerrar los 12 meses de {anio} ({mesesAbiertos} abiertos)
          </button>
        )}
        {msg && <span className="text-xs text-slate-600">{msg}</span>}
      </div>
      <p className="text-[11px] text-slate-400">Las cuentas con auxiliar o documento, y las que tienes analizadas con pareos, se abren partida por partida (solo lo que sigue pendiente). Al revertir, los comprobantes quedan anulados y el año se puede volver a cerrar.</p>
    </div>
  );
}
