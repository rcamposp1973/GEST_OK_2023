import React, { useState } from 'react';
import { auth } from '../lib/firebase';
import { Voucher } from '../types';
import { logAuditEvent } from '../utils/auditLogger';
import {
  armarComprobantesDeReclasificacion, armarPropuesta, validarFiltro, type Propuesta,
} from '../utils/agenteReclasificador';

interface Props {
  studyId: string;
  company: { id: string; name?: string };
  accounts: { id: string; code: string; name: string }[];
  vouchers: Voucher[];
  isReadOnly?: boolean;
  onCreateVoucher: (v: { date: string; gloss: string; lines: any[]; reclasificadas: string[] }) => Promise<{ id: string; voucherNumber: number }>;
  onRefresh: () => Promise<void> | void;
}

const clp = (n: number) => n.toLocaleString('es-CL');

export default function AgenteReclasificadorView({ studyId, company, accounts, vouchers, isReadOnly, onCreateVoucher, onRefresh }: Props) {
  const [instruccion, setInstruccion] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [aclaracion, setAclaracion] = useState('');
  const [explicacion, setExplicacion] = useState('');
  const [propuesta, setPropuesta] = useState<Propuesta | null>(null);
  const [excluidas, setExcluidas] = useState<Set<string>>(new Set());
  const [aplicando, setAplicando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: string[]; fallas: string[] } | null>(null);

  const cuentas = accounts.map(a => ({ id: a.id, code: String(a.code), name: a.name }));

  const interpretar = async () => {
    setError(''); setAclaracion(''); setExplicacion(''); setPropuesta(null); setResultado(null); setExcluidas(new Set());
    setCargando(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
      const res = await fetch('/api/agents/reclasificador/interpretar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ studyId, instruccion, cuentas }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || `Error ${res.status}`);
      if (data.aclaracion) { setAclaracion(data.aclaracion); return; }
      const v = validarFiltro(data.filtro, cuentas);
      if (v.ok === false) { setError(v.error); return; }
      setExplicacion(data.explicacion || '');
      setPropuesta(armarPropuesta(v.filtro, vouchers, cuentas));
    } catch (e: any) {
      setError(e.message || 'No se pudo consultar al agente.');
    } finally {
      setCargando(false);
    }
  };

  const clave = (l: { voucherId: string; lineIndex: number }) => `${l.voucherId}_${l.lineIndex}`;
  const incluidas = propuesta ? propuesta.lineas.filter(l => !excluidas.has(clave(l))) : [];
  const netoIncluido = incluidas.reduce((s, l) => s + l.debit - l.credit, 0);

  const aprobar = async () => {
    if (!propuesta || isReadOnly) return;
    setAplicando(true); setResultado(null);
    const ok: string[] = []; const fallas: string[] = [];
    try {
      const comprobantes = armarComprobantesDeReclasificacion(propuesta, excluidas);
      for (const c of comprobantes) {
        try {
          const r = await onCreateVoucher({ date: c.date, gloss: c.gloss, lines: c.lines, reclasificadas: c.reclasificadas });
          ok.push(`Comprobante N° ${r.voucherNumber} (${c.period})`);
          logAuditEvent({
            userId: auth.currentUser?.uid || 'anon', userEmail: auth.currentUser?.email || '', studyId, companyId: company.id,
            action: 'CREAR', module: 'COMPROBANTES',
            details: `Agente de reclasificación: comprobante N° ${r.voucherNumber} (${c.period}), ${c.reclasificadas.length} líneas de ${propuesta.origen.code} a ${propuesta.destino.code}. Instrucción: "${instruccion.slice(0, 200)}"`,
          });
        } catch (e: any) {
          fallas.push(`${c.period}: ${e.message || 'no se pudo crear'}`);
        }
      }
    } catch (e: any) {
      fallas.push(e.message || 'No se pudo armar el comprobante.');
    }
    setResultado({ ok, fallas });
    setAplicando(false);
    if (ok.length > 0) { setPropuesta(null); await onRefresh(); }
  };

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h2 className="text-lg font-bold text-slate-900" title="Dime qué cuenta reclasificar y a cuál. Yo preparo la propuesta y tú la apruebas antes de que se cree cualquier comprobante.">Agente de reclasificación</h2>
        <p className="text-sm text-slate-600 mt-1">Describe el cambio. Verás una vista previa y nada se crea hasta que apruebes.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <textarea
          value={instruccion}
          onChange={e => setInstruccion(e.target.value)}
          rows={3}
          maxLength={600}
          placeholder="Reclasifica los gastos de combustible de septiembre y octubre a movilización"
          className="w-full border border-slate-300 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={interpretar}
            disabled={cargando || instruccion.trim().length < 5}
            className="bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-700 disabled:opacity-50"
          >
            {cargando ? 'Interpretando…' : 'Preparar propuesta'}
          </button>
          <span className="text-xs text-slate-500">Empresa: {company.name || company.id}</span>
        </div>
        {error && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">{error}</p>}
        {aclaracion && <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">{aclaracion}</p>}
      </div>

      {propuesta && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {propuesta.origen.code} {propuesta.origen.name} → {propuesta.destino.code} {propuesta.destino.name}
            </p>
            {explicacion && <p className="text-xs text-slate-500 mt-0.5">{explicacion}</p>}
            {(propuesta.filtro.desde || propuesta.filtro.hasta) && (
              <p className="text-xs text-slate-500">Período: {propuesta.filtro.desde || 'inicio'} a {propuesta.filtro.hasta || 'hoy'}</p>
            )}
          </div>

          {propuesta.totalLineas === 0 ? (
            <p className="text-sm text-slate-600">No encontré movimientos que cumplan ese criterio (o ya fueron reclasificados).</p>
          ) : (
            <>
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="p-2 w-8"></th>
                      <th className="p-2 text-left">Comprobante</th>
                      <th className="p-2 text-left">Fecha</th>
                      <th className="p-2 text-left">Glosa</th>
                      <th className="p-2 text-right">Debe</th>
                      <th className="p-2 text-right">Haber</th>
                    </tr>
                  </thead>
                  <tbody>
                    {propuesta.lineas.map(l => {
                      const k = clave(l);
                      return (
                        <tr key={k} className={`border-t border-slate-100 ${excluidas.has(k) ? 'opacity-40' : ''}`}>
                          <td className="p-2">
                            <input
                              type="checkbox"
                              checked={!excluidas.has(k)}
                              onChange={e => setExcluidas(prev => { const n = new Set(prev); e.target.checked ? n.delete(k) : n.add(k); return n; })}
                            />
                          </td>
                          <td className="p-2">N° {l.voucherNumber}</td>
                          <td className="p-2">{l.date}</td>
                          <td className="p-2">{l.gloss}{l.auxiliaryName ? ` · ${l.auxiliaryName}` : ''}</td>
                          <td className="p-2 text-right">{l.debit ? clp(l.debit) : ''}</td>
                          <td className="p-2 text-right">{l.credit ? clp(l.credit) : ''}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-sm text-slate-700">
                Se reclasificarán <b>{incluidas.length}</b> movimientos por <b>${clp(netoIncluido)}</b>. Se crea un comprobante por mes con el Debe y Haber invertidos entre las dos cuentas. Los comprobantes originales no se modifican.
              </p>
              <button
                type="button"
                onClick={aprobar}
                disabled={aplicando || isReadOnly || incluidas.length === 0}
                className="bg-emerald-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
              >
                {aplicando ? 'Creando…' : 'Aprobar y crear comprobantes'}
              </button>
            </>
          )}
        </div>
      )}

      {resultado && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-sm space-y-2">
          {resultado.ok.length > 0 && <p className="text-emerald-800">Creados: {resultado.ok.join(', ')}.</p>}
          {resultado.fallas.length > 0 && (
            <div className="text-rose-800">
              <p>No se pudieron crear:</p>
              <ul className="list-disc pl-5">{resultado.fallas.map((f, i) => <li key={i}>{f}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
