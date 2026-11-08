import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { Camera, AlertTriangle, Printer, Save, RefreshCw, CheckCircle2 } from 'lucide-react';
import { auth, db } from '../lib/firebase';
import type { Company, ChartOfAccount, Voucher } from '../types';
import { triggerIframePrint } from '../utils/printUtils';
import {
  construirInforme, cambiosDesdeFoto, limpiarParaGuardar, MESES_LARGO,
  InformeCifras, InformeGuardado, LineaInforme,
} from '../utils/informeMensual';

interface Props {
  studyId: string;
  company: Company;
  accounts: ChartOfAccount[];
  vouchers: Voucher[];
  canEdit: boolean;
}

const fmt = (n: number) => Math.round(n).toLocaleString('es-CL');
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pct = (a: number, b: number): number | null => (Math.abs(b) > 0.5 ? ((a - b) / Math.abs(b)) * 100 : null);
type Seccion = 'general' | 'resultados' | 'balance' | 'kpis';

export default function InformeMensualView({ studyId, company, accounts, vouchers, canEdit }: Props) {
  // Mes por defecto: el último con movimientos
  const [anio, setAnio] = useState<number>(() => {
    const m = vouchers.reduce((mx, v) => (v.date && v.date > mx ? v.date : mx), '');
    return m ? parseInt(m.slice(0, 4), 10) : new Date().getFullYear();
  });
  const [mes, setMes] = useState<number>(() => {
    const m = vouchers.reduce((mx, v) => (v.date && v.date > mx ? v.date : mx), '');
    return m ? parseInt(m.slice(5, 7), 10) : new Date().getMonth() + 1;
  });
  const anios = useMemo(() => {
    const s = new Set<number>([new Date().getFullYear()]);
    vouchers.forEach(v => { const y = parseInt((v.date || '').slice(0, 4), 10); if (y) s.add(y); });
    return Array.from(s).sort((a, b) => b - a);
  }, [vouchers]);

  const id = `${anio}-${String(mes).padStart(2, '0')}`;
  const [foto, setFoto] = useState<InformeGuardado | null>(null);
  const [guardadas, setGuardadas] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);
  const [com, setCom] = useState<Record<Seccion, string>>({ general: '', resultados: '', balance: '', kpis: '' });
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  const refColeccion = () => collection(db, 'studies', studyId, 'companies', company.id, 'informesMensuales');

  // Fotos guardadas de la empresa
  const recargarLista = async () => {
    try {
      const snap = await getDocs(refColeccion());
      setGuardadas(snap.docs.map(d => d.id).sort().reverse());
    } catch { setGuardadas([]); }
  };
  useEffect(() => { recargarLista(); }, [studyId, company.id]);

  // Foto del mes elegido
  useEffect(() => {
    let vivo = true;
    setCargando(true);
    getDoc(doc(refColeccion(), id))
      .then(s => {
        if (!vivo) return;
        const f = s.exists() ? ({ ...(s.data() as InformeGuardado), id: s.id }) : null;
        setFoto(f);
        setCom({ general: f?.comentarios?.general || '', resultados: f?.comentarios?.resultados || '', balance: f?.comentarios?.balance || '', kpis: f?.comentarios?.kpis || '' });
      })
      .catch(() => { if (vivo) { setFoto(null); setCom({ general: '', resultados: '', balance: '', kpis: '' }); } })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [id, studyId, company.id]);

  // Contabilidad de hoy
  const hoy = useMemo<InformeCifras>(
    () => construirInforme(vouchers, accounts, anio, mes, (company as any).kpiInputs?.[String(anio)] || {}, (company as any).kpiConfig),
    [vouchers, accounts, anio, mes, company]
  );
  const cifras = foto?.cifras ?? hoy;
  const cambios = useMemo(() => (foto ? cambiosDesdeFoto(foto.cifras, hoy) : []), [foto, hoy]);

  const aviso = (ok: boolean, t: string) => { setMsg({ ok, t }); setTimeout(() => setMsg(null), 5000); };

  const guardar = async (actualizarCifras: boolean) => {
    if (!canEdit) return;
    if (foto && actualizarCifras && !window.confirm(`Esto reemplaza las cifras congeladas de ${MESES_LARGO[mes - 1]} ${anio} por las de la contabilidad de hoy. ¿Continuar?`)) return;
    setGuardando(true);
    try {
      const ahora = new Date().toISOString();
      const usuario = auth.currentUser?.email || 'Usuario contable';
      const nuevo: InformeGuardado = {
        id, anio, mes,
        version: (foto?.version || 0) + (actualizarCifras || !foto ? 1 : 0),
        creadoEn: foto?.creadoEn || ahora,
        creadoPor: foto?.creadoPor || usuario,
        actualizadoEn: ahora,
        cifras: actualizarCifras || !foto ? hoy : foto.cifras,
        comentarios: { ...com },
      };
      await setDoc(doc(refColeccion(), id), limpiarParaGuardar(nuevo));
      setFoto(nuevo);
      recargarLista();
      aviso(true, !foto ? 'Foto fija guardada.' : actualizarCifras ? 'Foto actualizada con la contabilidad de hoy.' : 'Comentarios guardados.');
    } catch (e: any) {
      aviso(false, 'No se pudo guardar: ' + (e?.message || 'error'));
    } finally {
      setGuardando(false);
    }
  };

  const imprimir = () => {
    const tabla = (titulo: string, lineas: LineaInforme[], conMes: boolean, ant: string) => `
      <h3>${titulo}</h3>
      <table><thead><tr><th style="text-align:left">Concepto</th>${conMes ? '<th>Mes</th>' : ''}<th>Acumulado</th><th>${ant}</th><th>Var.</th></tr></thead><tbody>
      ${lineas.map(l => {
        const p = pct(l.acum, l.anterior);
        return `<tr class="${l.tipo}"><td style="text-align:left">${esc(l.nombre)}</td>${conMes ? `<td>${fmt(l.mes || 0)}</td>` : ''}<td>${fmt(l.acum)}</td><td>${fmt(l.anterior)}</td><td>${p === null ? '' : p.toFixed(0) + '%'}</td></tr>`;
      }).join('')}</tbody></table>`;
    const coment = (t: string) => (t.trim() ? `<p class="coment">${esc(t).replace(/\n/g, '<br>')}</p>` : '');
    const kp = cifras.kpis.map(k => `<tr><td style="text-align:left">${esc(k.nombre)}</td><td>${esc(k.texto)}</td></tr>`).join('');
    triggerIframePrint({
      title: `Informe mensual ${MESES_LARGO[mes - 1]} ${anio} - ${company.name}`,
      styles: `h2{margin:0}h3{margin:14px 0 4px;border-bottom:1px solid #0f172a;font-size:12px}table{width:100%;border-collapse:collapse;font-size:10px}th,td{padding:2px 4px;text-align:right;border-bottom:1px solid #e2e8f0}tr.subtotal td{font-weight:bold;background:#f1f5f9}tr.total td{font-weight:bold;border-top:1px solid #0f172a}.coment{font-size:10.5px;background:#f8fafc;border-left:3px solid #6366f1;padding:6px 8px;margin:6px 0}.sub{font-size:10px;color:#64748b}`,
      htmlContent: `
        <h2>${esc(company.name)}</h2>
        <div class="sub">RUT ${esc(company.rut || '')} · Informe de ${MESES_LARGO[mes - 1]} ${anio} · ${foto ? `foto fija del ${(foto.actualizadoEn || foto.creadoEn).slice(0, 10)}` : 'cifras a la fecha de emisión'}</div>
        ${coment(com.general)}
        ${tabla('Estado de Resultados', cifras.resultado, true, `Mismo período ${anio - 1}`)}
        ${coment(com.resultados)}
        ${tabla('Situación financiera', cifras.balance, false, `Mismo mes ${anio - 1}`)}
        ${coment(com.balance)}
        <h3>Indicadores</h3><table><tbody>${kp}</tbody></table>
        ${coment(com.kpis)}`,
    });
  };

  const cajaComentario = (s: Seccion, etiqueta: string) => (
    <div className="mt-2">
      {canEdit && (
        <div data-solo-trabajo>
          <textarea
            value={com[s]}
            onChange={e => setCom(p => ({ ...p, [s]: e.target.value }))}
            placeholder={`Comentario del contador — ${etiqueta}`}
            rows={2}
            className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-400"
          />
        </div>
      )}
      {com[s].trim() && (
        <p className={`${canEdit ? 'solo-presentacion' : ''} text-xs text-slate-700 bg-slate-50 border-l-4 border-indigo-400 px-3 py-2 rounded whitespace-pre-line mt-1`}>{com[s]}</p>
      )}
    </div>
  );

  const tabla = (lineas: LineaInforme[], conMes: boolean, etiquetaAnt: string) => (
    <table className="w-full text-xs">
      <thead className="text-slate-500 bg-slate-50">
        <tr>
          <th className="text-left p-1.5">Concepto</th>
          {conMes && <th className="text-right p-1.5">Mes</th>}
          <th className="text-right p-1.5">Acumulado</th>
          <th className="text-right p-1.5">{etiquetaAnt}</th>
          <th className="text-right p-1.5">Var.</th>
        </tr>
      </thead>
      <tbody>
        {lineas.map(l => {
          const p = pct(l.acum, l.anterior);
          const fuerte = l.tipo !== 'linea';
          return (
            <tr key={l.id} className={`border-t border-slate-100 ${l.tipo === 'subtotal' ? 'bg-slate-50 font-bold' : l.tipo === 'total' ? 'bg-indigo-50/60 font-black' : ''}`}>
              <td className={`px-1.5 py-0.5 ${fuerte ? '' : 'pl-4'}`}>{l.nombre}</td>
              {conMes && <td className="px-1.5 py-0.5 text-right font-mono">{fmt(l.mes || 0)}</td>}
              <td className="px-1.5 py-0.5 text-right font-mono">{fmt(l.acum)}</td>
              <td className="px-1.5 py-0.5 text-right font-mono text-slate-500">{fmt(l.anterior)}</td>
              <td className="px-1.5 py-0.5 text-right font-mono text-slate-500">{p === null ? '' : `${p > 0 ? '▲' : p < 0 ? '▼' : '='}${Math.abs(p).toFixed(0)}%`}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <div className="space-y-3 font-sans">
      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Camera className="w-4 h-4 text-indigo-600" /> Informe mensual · {company.name}</h3>
          <p className="text-[11px] text-slate-500">Cifras de la contabilidad con comentarios del contador. La foto fija congela el mes; si la contabilidad cambia después, el sistema lo avisa.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap" data-solo-trabajo>
          <select value={anio} onChange={e => setAnio(Number(e.target.value))} className="border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold">
            {anios.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={mes} onChange={e => setMes(Number(e.target.value))} className="border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold capitalize">
            {MESES_LARGO.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <button onClick={imprimir} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer">
            <Printer className="w-3.5 h-3.5" /> Imprimir / PDF
          </button>
        </div>
      </div>

      {guardadas.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap text-[11px]" data-solo-trabajo>
          <span className="text-slate-500 font-semibold">Fotos guardadas:</span>
          {guardadas.map(g => (
            <button key={g}
              onClick={() => { setAnio(parseInt(g.slice(0, 4), 10)); setMes(parseInt(g.slice(5, 7), 10)); }}
              className={`px-2 py-0.5 rounded-full border font-mono ${g === id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>
              {g}
            </button>
          ))}
        </div>
      )}

      {/* Estado de la foto */}
      {!cargando && (foto ? (
        <div className="flex flex-wrap items-center justify-between gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 text-xs text-emerald-900">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            <b>Foto fija</b> de {MESES_LARGO[mes - 1]} {anio} · versión {foto.version} · {(foto.actualizadoEn || foto.creadoEn).slice(0, 10)} · {foto.creadoPor}
          </span>
          {canEdit && (
            <span className="flex items-center gap-2" data-solo-trabajo>
              <button disabled={guardando} onClick={() => guardar(false)} className="flex items-center gap-1 px-2.5 py-1 bg-white border border-emerald-300 rounded-lg font-bold hover:bg-emerald-100 disabled:opacity-50 cursor-pointer">
                <Save className="w-3.5 h-3.5" /> Guardar comentarios
              </button>
              <button disabled={guardando} onClick={() => guardar(true)} className="flex items-center gap-1 px-2.5 py-1 bg-white border border-emerald-300 rounded-lg font-bold hover:bg-emerald-100 disabled:opacity-50 cursor-pointer" title="Reemplaza las cifras congeladas por las de la contabilidad de hoy">
                <RefreshCw className="w-3.5 h-3.5" /> Actualizar con la contabilidad de hoy
              </button>
            </span>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 bg-sky-50 border border-sky-200 rounded-xl px-3 py-2 text-xs text-sky-900">
          <span>Vista en vivo: estas cifras cambian si cambia la contabilidad. Guarda la foto fija para congelarlas junto con tus comentarios.</span>
          {canEdit && (
            <button disabled={guardando} onClick={() => guardar(true)} data-solo-trabajo className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 text-white rounded-lg font-bold hover:bg-sky-700 disabled:opacity-50 cursor-pointer">
              <Camera className="w-3.5 h-3.5" /> Guardar foto fija de {MESES_LARGO[mes - 1]}
            </button>
          )}
        </div>
      ))}
      {msg && <div className={`text-xs font-semibold ${msg.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{msg.t}</div>}

      {/* La contabilidad manda: aviso si ya no coincide con la foto */}
      {foto && cambios.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl px-3 py-2 text-xs text-amber-900" data-solo-trabajo>
          <div className="flex items-center gap-1.5 font-bold"><AlertTriangle className="w-4 h-4" /> La contabilidad cambió desde esta foto ({cambios.length} cifra(s))</div>
          <ul className="mt-1 space-y-0.5">
            {cambios.slice(0, 6).map(c => (
              <li key={c.id}>{c.nombre}: foto ${fmt(c.foto)} → hoy ${fmt(c.hoy)} <span className="font-mono">({c.diferencia > 0 ? '+' : ''}{fmt(c.diferencia)})</span></li>
            ))}
          </ul>
          <p className="mt-1 text-[11px]">La foto no se modifica sola. La contabilidad es la que manda: si el cambio es correcto, actualiza la foto; si no, revisa los comprobantes del período.</p>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-3">
        <div className="text-[11px] font-bold uppercase text-slate-500 mb-1">Resumen del mes</div>
        {cajaComentario('general', 'resumen general del mes')}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-3">
        <h4 className="text-xs font-bold text-slate-800 mb-1">Estado de Resultados · {MESES_LARGO[mes - 1]} {anio}</h4>
        {tabla(cifras.resultado, true, `Mismo período ${anio - 1}`)}
        {cajaComentario('resultados', 'resultados')}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-3">
        <h4 className="text-xs font-bold text-slate-800 mb-1">Situación financiera al cierre de {MESES_LARGO[mes - 1]} {anio}</h4>
        {tabla(cifras.balance, false, `${MESES_LARGO[mes - 1]} ${anio - 1}`)}
        {cajaComentario('balance', 'situación financiera')}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-3">
        <h4 className="text-xs font-bold text-slate-800 mb-2">Indicadores</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2">
          {cifras.kpis.map(k => (
            <div key={k.id} className={`rounded-lg border p-2 ${k.semaforo === 'ok' ? 'border-emerald-300' : k.semaforo === 'alerta' ? 'border-amber-300' : 'border-slate-200'}`}>
              <div className="text-[10px] font-semibold text-slate-500">{k.nombre}</div>
              <div className="text-sm font-extrabold text-slate-900">{k.texto}</div>
            </div>
          ))}
        </div>
        {cajaComentario('kpis', 'indicadores')}
      </div>
    </div>
  );
}
