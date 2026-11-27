import React, { useEffect, useMemo, useState } from 'react';
import { InputNumeroCL } from './ui/NumeroCL';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { ChevronDown, ChevronRight, Download, Lock, Save, Unlock, AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { db, auth } from '../lib/firebase';
import type { ChartOfAccount, Company, PayrollSlip, RCVAccountingParams, RCVDocument, Voucher } from '../types';
import { movimientoCuentaDelAnio, sugerirCuentaPpm } from '../utils/rentaAnual';
import { pendientesAlCorte } from '../utils/gestRta/pendientes';
import {
  asignarPropietarios, calcularCptSimplificado, CptSimplificado, Propietario, propuestaTransparente,
} from '../utils/gestRta/transparente';

interface Props {
  studyId: string;
  company: Company;
  accounts: ChartOfAccount[];
  vouchers: Voucher[];
  rcvDocuments: RCVDocument[];
  payrollSlips: PayrollSlip[];
  rcvParams: RCVAccountingParams | null | undefined;
  soloLectura?: boolean;
}

type Regimen = '14_D8' | '14_D3' | '14_A';
const REGIMENES: { id: Regimen; nombre: string; disponible: boolean }[] = [
  { id: '14_D8', nombre: 'Pro Pyme Transparente (14 D N° 8)', disponible: true },
  { id: '14_D3', nombre: 'Pro Pyme General (14 D N° 3) — próximamente', disponible: false },
  { id: '14_A', nombre: 'Régimen General (14 A) — próximamente', disponible: false },
];

interface HojaGestRta {
  regimen: Regimen;
  ajustes: Record<string, number>;
  notas: Record<string, string>;
  incluirSupermercado: boolean;
  cuentaPpmId?: string;
  ppmManual: number;
  /** Corrección monetaria (reajuste) de los PPM al 31-12, si no está contabilizada en la cuenta de PPM. */
  ppmCm?: number;
  cpt: CptSimplificado;
  /** El CPT inicial lo fijó el contador; si no, sigue en línea al CPT final del año anterior (o a los saldos de apertura). */
  cptInicialManual?: boolean;
  propietarios: Propietario[];
  estado: 'BORRADOR' | 'CERRADO';
  historial: { fecha: string; usuario: string; accion: string }[];
}

interface SaldosApertura { anioInicio: number; cptInicial: number; perdidaArrastre: number; notas?: string }

const pesos = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n || 0)).toLocaleString('es-CL');

/** Monto con signo (los ajustes pueden ser negativos). */
const MontoConSigno: React.FC<{ value: number; onChange: (n: number) => void; disabled?: boolean }> = ({ value, onChange, disabled }) => {
  const [txt, setTxt] = useState(value ? value.toLocaleString('es-CL') : '');
  const [foco, setFoco] = useState(false);
  useEffect(() => { if (!foco) setTxt(value ? value.toLocaleString('es-CL') : ''); }, [value, foco]);
  return (
    <input
      type="text" inputMode="numeric" disabled={disabled} value={txt} placeholder="0"
      onFocus={() => setFoco(true)}
      onBlur={() => setFoco(false)}
      onChange={e => {
        const neg = e.target.value.trim().startsWith('-');
        const dig = e.target.value.replace(/\D/g, '');
        const n = dig ? parseInt(dig, 10) * (neg ? -1 : 1) : 0;
        setTxt(dig ? (neg ? '-' : '') + parseInt(dig, 10).toLocaleString('es-CL') : (neg ? '-' : ''));
        onChange(n);
      }}
      className="w-32 border border-slate-300 rounded-md px-2 py-1 text-right font-mono text-xs disabled:bg-slate-50"
    />
  );
};

const hojaVacia = (): HojaGestRta => ({
  regimen: '14_D8', ajustes: {}, notas: {}, incluirSupermercado: false, ppmManual: 0,
  cpt: { cptInicial: 0, aumentosCapital: 0, disminucionesCapital: 0, retiros: 0, otrasAgregar: 0, otrasDeducir: 0 },
  propietarios: [], estado: 'BORRADOR', historial: [],
});

export const GestRtaView: React.FC<Props> = ({ studyId, company, accounts, vouchers, rcvDocuments, payrollSlips, rcvParams, soloLectura }) => {
  const anioDefecto = new Date().getMonth() >= 9 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  const [anio, setAnio] = useState(anioDefecto);
  const [hoja, setHoja] = useState<HojaGestRta>(hojaVacia);
  const [anterior, setAnterior] = useState<{ cptFinal: number; base: number } | null>(null);
  const [saldos, setSaldos] = useState<SaldosApertura | null>(null);
  const [tab, setTab] = useState<'base' | 'cpt' | 'propietarios' | 'apertura'>('base');
  const [abiertas, setAbiertas] = useState<Record<string, boolean>>({});
  const [aviso, setAviso] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [confirmarReabrir, setConfirmarReabrir] = useState(false);

  const base = ['studies', studyId, 'companies', company.id, 'gestRta'] as const;
  const refAnio = useMemo(() => doc(db, ...base, `AT${anio + 1}`), [studyId, company.id, anio]); // eslint-disable-line react-hooks/exhaustive-deps
  const refAnterior = useMemo(() => doc(db, ...base, `AT${anio}`), [studyId, company.id, anio]); // eslint-disable-line react-hooks/exhaustive-deps
  const refSaldos = useMemo(() => doc(db, ...base, 'saldosApertura'), [studyId, company.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // El año anterior y los saldos de apertura se escuchan en línea: si se modifican (en otra pestaña o por otro usuario), la propuesta se recalcula.
  useEffect(() => {
    const u1 = onSnapshot(refAnterior, p => {
      const prev = p.exists() ? (p.data() as any) : null;
      setAnterior(prev ? { cptFinal: Number(prev.resumen?.cptFinal) || 0, base: Number(prev.resumen?.baseImponible) || 0 } : null);
    }, () => {});
    const u2 = onSnapshot(refSaldos, s => setSaldos(s.exists() ? (s.data() as SaldosApertura) : null), () => {});
    return () => { u1(); u2(); };
  }, [refAnterior, refSaldos]);

  useEffect(() => {
    let vivo = true;
    Promise.all([getDoc(refAnio), getDoc(refAnterior), getDoc(refSaldos)]).then(([a, p, s]) => {
      if (!vivo) return;
      const sal = s.exists() ? (s.data() as SaldosApertura) : null;
      const prev = p.exists() ? (p.data() as any) : null;
      if (a.exists()) setHoja({ ...hojaVacia(), ...(a.data() as any).hoja });
      else {
        const h = hojaVacia();
        h.cuentaPpmId = sugerirCuentaPpm(accounts);
        h.cpt.cptInicial = prev ? Number(prev.resumen?.cptFinal) || 0 : (sal && sal.anioInicio === anio ? sal.cptInicial : 0);
        if (prev?.hoja?.propietarios) h.propietarios = prev.hoja.propietarios;
        setHoja(h);
      }
    }).catch(e => setAviso('No se pudo leer: ' + (e?.message || e)));
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refAnio]);

  const cerrado = hoja.estado === 'CERRADO';
  const bloqueado = soloLectura || cerrado;
  const set = (p: Partial<HojaGestRta>) => setHoja(h => ({ ...h, ...p }));

  const perdidaAnterior = anterior ? Math.max(-anterior.base, 0) : (saldos && saldos.anioInicio === anio ? saldos.perdidaArrastre : 0);

  const cuentas = { clientes: rcvParams?.defaultCustomerAccountId, proveedores: rcvParams?.defaultSupplierAccountId, honorarios: rcvParams?.defaultHonorariosAccountId };
  const pendCierre = useMemo(() => pendientesAlCorte(`${anio}-12-31`, cuentas, accounts, rcvDocuments, vouchers), [anio, accounts, rcvDocuments, vouchers, cuentas.clientes, cuentas.proveedores, cuentas.honorarios]); // eslint-disable-line react-hooks/exhaustive-deps
  const pendAnterior = useMemo(() => pendientesAlCorte(`${anio - 1}-12-31`, cuentas, accounts, rcvDocuments, vouchers), [anio, accounts, rcvDocuments, vouchers, cuentas.clientes, cuentas.proveedores, cuentas.honorarios]); // eslint-disable-line react-hooks/exhaustive-deps

  const res = useMemo(() => propuestaTransparente({
    anio, rcv: rcvDocuments as any, pendientesCierre: pendCierre, pendientesCierreAnterior: pendAnterior,
    remuneraciones: payrollSlips as any, perdidaAnterior, ajustes: hoja.ajustes,
    incluirSupermercado: hoja.incluirSupermercado, recuperaDiesel: Boolean(rcvParams?.recuperaDiesel),
  }), [anio, rcvDocuments, pendCierre, pendAnterior, payrollSlips, perdidaAnterior, hoja.ajustes, hoja.incluirSupermercado, rcvParams?.recuperaDiesel]);

  const ppm = useMemo(() => (hoja.cuentaPpmId ? movimientoCuentaDelAnio(vouchers as any, accounts, hoja.cuentaPpmId, anio) : hoja.ppmManual), [hoja.cuentaPpmId, hoja.ppmManual, vouchers, accounts, anio]);
  // CPT inicial en línea: CPT final del año anterior en Gest_Rta, o saldos de apertura, salvo que el contador lo haya fijado
  const cptInicialAuto = anterior ? anterior.cptFinal : (saldos && saldos.anioInicio === anio ? saldos.cptInicial : null);
  const cptHoja: CptSimplificado = (hoja.cptInicialManual || cptInicialAuto === null) ? hoja.cpt : { ...hoja.cpt, cptInicial: cptInicialAuto };
  const cpt = calcularCptSimplificado(cptHoja, res.baseImponible);
  const ppmCm = Math.round(Number(hoja.ppmCm) || 0);
  const ppmActualizado = ppm + ppmCm;
  const asignacion = asignarPropietarios(hoja.propietarios, res.baseImponible, ppmActualizado);

  const registrar = (accion: string, h: HojaGestRta): HojaGestRta => ({ ...h, historial: [...(h.historial || []), { fecha: new Date().toISOString(), usuario: auth.currentUser?.email || '', accion }].slice(-30) });

  const guardar = async (h: HojaGestRta, accion: string) => {
    setGuardando(true);
    try {
      const conHistorial = registrar(accion, h);
      await setDoc(refAnio, {
        hoja: { ...conHistorial, cpt: (h.cptInicialManual || cptInicialAuto === null) ? h.cpt : { ...h.cpt, cptInicial: cptInicialAuto } }, anioComercial: anio, regimen: h.regimen,
        resumen: { baseImponible: res.baseImponible, totalIngresos: res.totalIngresos, totalEgresos: res.totalEgresos, cptFinal: cpt.final, ppm: ppmActualizado, ppmHistorico: ppm, ppmCm },
        actualizadoPor: auth.currentUser?.email || '', actualizadoEn: new Date().toISOString(),
      });
      setHoja(conHistorial);
      setAviso(accion === 'Cerrado' ? 'Año cerrado: la propuesta queda bloqueada.' : accion === 'Reabierto' ? 'Año reabierto.' : 'Guardado.');
    } catch (e: any) {
      setAviso('No se pudo guardar: ' + (e?.message || e));
    } finally {
      setGuardando(false);
      setTimeout(() => setAviso(''), 5000);
    }
  };

  const guardarSaldos = async (s: SaldosApertura) => {
    try {
      await setDoc(refSaldos, { ...s, actualizadoPor: auth.currentUser?.email || '', actualizadoEn: new Date().toISOString() });
      setSaldos(s);
      setAviso('Saldos de apertura guardados.');
    } catch (e: any) { setAviso('No se pudo guardar: ' + (e?.message || e)); }
    setTimeout(() => setAviso(''), 4000);
  };

  const exportar = () => {
    const wb = XLSX.utils.book_new();
    const cab = [['Empresa', company.name], ['RUT', company.rut], ['Año comercial', anio], ['Año tributario', anio + 1], ['Régimen', 'Pro Pyme Transparente (14 D N° 8)'], ['Estado', hoja.estado], []];
    const r22 = [...cab, ['Código', 'Glosa', 'Propuesto', 'Ajuste', 'Final', 'Fuente', 'Nota'],
      ...res.lineas.map(l => [l.codigo, l.glosa, l.propuesto, l.ajuste, l.final, l.fuente, hoja.notas[l.codigo] || ''])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(r22), 'Recuadro 22');
    const det = [['Código', 'Documento', 'Fecha', 'Base', 'Pendiente 31-12', 'Considerado', 'Nota'],
      ...res.lineas.flatMap(l => (l.detalle || []).map(d => [l.codigo, d.referencia, d.fecha, d.base, d.pendiente, d.computado, d.nota || '']))];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(det), 'Detalle documentos');
    const c = [...cab, ['CPT inicial', cptHoja.cptInicial], ['Base imponible del ejercicio', res.baseImponible], ['Aumentos de capital', hoja.cpt.aumentosCapital],
      ['Disminuciones de capital', -hoja.cpt.disminucionesCapital], ['Retiros del ejercicio', -hoja.cpt.retiros], ['Otras partidas a agregar', hoja.cpt.otrasAgregar],
      ['Otras partidas a deducir', -hoja.cpt.otrasDeducir], ['CPT simplificado final', cpt.final]];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(c), 'CPT simplificado');
    const p = [...cab, ['RUT', 'Nombre', '% participación', 'Base imponible asignada', 'PPM asignado'],
      ...asignacion.filas.map(f => [f.rut, f.nombre, f.porcentaje, f.base, f.ppm]), [], ['PPM del año (histórico)', ppm], ['Corrección monetaria PPM', ppmCm], ['PPM actualizados', ppmActualizado]];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(p), 'Propietarios DJ 1947');
    XLSX.writeFile(wb, `Gest_Rta_AT${anio + 1}_${(company.rut || '').replace(/[^0-9kK]/g, '')}.xlsx`);
  };

  const TabBtn: React.FC<{ id: typeof tab; children: React.ReactNode }> = ({ id, children }) => (
    <button onClick={() => setTab(id)} className={`px-3 py-1.5 text-sm rounded-md ${tab === id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{children}</button>
  );

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Gest_Rta · Renta anual</h2>
          <p className="text-sm text-slate-500">Propuesta de base imponible, capital propio y asignación a propietarios. El contador revisa y decide: nada se envía al SII.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={anio} onChange={e => setAnio(Number(e.target.value))} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
            {[anioDefecto + 1, anioDefecto, anioDefecto - 1, anioDefecto - 2].map(a => <option key={a} value={a}>Año comercial {a} (AT {a + 1})</option>)}
          </select>
          <select value={hoja.regimen} disabled={bloqueado} onChange={e => set({ regimen: e.target.value as Regimen })} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
            {REGIMENES.map(r => <option key={r.id} value={r.id} disabled={!r.disponible}>{r.nombre}</option>)}
          </select>
          <button onClick={exportar} className="inline-flex items-center gap-1.5 border border-slate-300 rounded-lg px-3 py-1.5 text-sm hover:bg-slate-50"><Download className="w-4 h-4" /> Excel</button>
          {!soloLectura && !cerrado && (
            <>
              <button onClick={() => guardar(hoja, 'Guardado')} disabled={guardando} className="inline-flex items-center gap-1.5 bg-slate-900 text-white rounded-lg px-3 py-1.5 text-sm disabled:opacity-60"><Save className="w-4 h-4" /> Guardar</button>
              <button onClick={() => guardar({ ...hoja, estado: 'CERRADO' }, 'Cerrado')} disabled={guardando || !asignacion.cuadra && hoja.propietarios.length > 0} className="inline-flex items-center gap-1.5 border border-emerald-600 text-emerald-700 rounded-lg px-3 py-1.5 text-sm hover:bg-emerald-50 disabled:opacity-50"><Lock className="w-4 h-4" /> Cerrar año</button>
            </>
          )}
          {!soloLectura && cerrado && (confirmarReabrir ? (
            <span className="inline-flex items-center gap-2 text-sm">¿Reabrir? Quedará registrado.
              <button onClick={() => { setConfirmarReabrir(false); guardar({ ...hoja, estado: 'BORRADOR' }, 'Reabierto'); }} className="border border-amber-600 text-amber-700 rounded-lg px-2 py-1">Sí, reabrir</button>
              <button onClick={() => setConfirmarReabrir(false)} className="text-slate-500 px-2 py-1">No</button>
            </span>
          ) : (
            <button onClick={() => setConfirmarReabrir(true)} className="inline-flex items-center gap-1.5 border border-amber-600 text-amber-700 rounded-lg px-3 py-1.5 text-sm hover:bg-amber-50"><Unlock className="w-4 h-4" /> Reabrir</button>
          ))}
        </div>
      </div>

      {aviso && <div className="text-sm bg-slate-100 text-slate-700 rounded-lg px-3 py-2">{aviso}</div>}
      {cerrado && <div className="text-sm bg-emerald-50 text-emerald-800 rounded-lg px-3 py-2 flex items-center gap-2"><Lock className="w-4 h-4" /> Año cerrado. Para modificar, reábrelo (queda en el historial).</div>}

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        {[['Total ingresos [1610]', res.totalIngresos], ['Total egresos [1629]', res.totalEgresos], [res.baseImponible >= 0 ? 'Base imponible [1630]' : 'Pérdida tributaria [1630]', res.baseImponible], ['CPT simplificado final', cpt.final]].map(([t, v]) => (
          <div key={t as string} className="border border-slate-200 rounded-xl p-3 bg-white">
            <div className="text-xs text-slate-500">{t}</div>
            <div className={`font-mono text-lg font-semibold ${Number(v) < 0 ? 'text-rose-700' : 'text-slate-900'}`}>{pesos(Number(v))}</div>
          </div>
        ))}
      </div>

      {res.avisos.length > 0 && (
        <div className="border border-amber-200 bg-amber-50 rounded-xl p-3 space-y-1">
          {res.avisos.map((a, i) => <div key={i} className="text-xs text-amber-900 flex gap-2"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{a}</div>)}
        </div>
      )}

      <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-2">
        <TabBtn id="base">Base imponible (Recuadro 22)</TabBtn>
        <TabBtn id="cpt">Capital propio</TabBtn>
        <TabBtn id="propietarios">Propietarios (DJ 1947)</TabBtn>
        <TabBtn id="apertura">Saldos de apertura</TabBtn>
      </div>

      {tab === 'base' && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" disabled={bloqueado} checked={hoja.incluirSupermercado} onChange={e => set({ incluirSupermercado: e.target.checked })} />
            Incluir compras de supermercados y comercios similares {res.supermercadoExcluido > 0 && <span className="text-slate-500">({pesos(res.supermercadoExcluido)} hoy fuera)</span>}
          </label>
          <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-600">
                <tr><th className="p-2 text-left w-16">Código</th><th className="p-2 text-left">Concepto</th><th className="p-2 text-right">Propuesto</th><th className="p-2 text-right">Ajuste</th><th className="p-2 text-right">Final</th><th className="p-2 text-left">Fuente / nota</th></tr>
              </thead>
              <tbody>
                {res.lineas.map(l => {
                  const total = l.tipo === 'total';
                  const tieneDetalle = (l.detalle || []).length > 0;
                  return (
                    <React.Fragment key={l.codigo}>
                      <tr className={`border-t border-slate-100 ${total ? 'bg-slate-50 font-semibold' : ''}`}>
                        <td className="p-2 font-mono">{l.tipo === 'egreso' ? '−' : l.tipo === 'ingreso' ? '+' : '='} {l.codigo}</td>
                        <td className="p-2">
                          {tieneDetalle ? (
                            <button onClick={() => setAbiertas(a => ({ ...a, [l.codigo]: !a[l.codigo] }))} className="inline-flex items-start gap-1 text-left hover:text-indigo-700">
                              {abiertas[l.codigo] ? <ChevronDown className="w-3.5 h-3.5 mt-0.5" /> : <ChevronRight className="w-3.5 h-3.5 mt-0.5" />}{l.glosa} <span className="text-slate-400">({l.detalle!.length} docs)</span>
                            </button>
                          ) : l.glosa}
                        </td>
                        <td className="p-2 text-right font-mono">{total ? '' : pesos(l.propuesto)}</td>
                        <td className="p-2 text-right">{total ? '' : <MontoConSigno value={l.ajuste} disabled={bloqueado} onChange={n => set({ ajustes: { ...hoja.ajustes, [l.codigo]: n } })} />}</td>
                        <td className={`p-2 text-right font-mono ${l.final < 0 ? 'text-rose-700' : ''}`}>{pesos(l.final)}</td>
                        <td className="p-2 text-slate-500 min-w-[220px]">
                          {!total && <div>{l.fuente}</div>}
                          {!total && (l.ajuste !== 0 || hoja.notas[l.codigo]) && (
                            <input disabled={bloqueado} value={hoja.notas[l.codigo] || ''} placeholder="Motivo del ajuste" onChange={e => set({ notas: { ...hoja.notas, [l.codigo]: e.target.value } })}
                              className="mt-1 w-full border border-slate-200 rounded px-1.5 py-0.5 text-[11px]" />
                          )}
                        </td>
                      </tr>
                      {abiertas[l.codigo] && (l.detalle || []).map((d, i) => (
                        <tr key={i} className="bg-indigo-50/30 text-[11px] text-slate-600">
                          <td></td><td className="p-1.5 pl-6">{d.referencia} · {d.fecha}{d.nota ? <span className="text-amber-700"> · {d.nota}</span> : null}</td>
                          <td className="p-1.5 text-right font-mono">{pesos(d.base)}</td><td className="p-1.5 text-right font-mono text-slate-400">{d.pendiente ? `pend. ${pesos(d.pendiente)}` : ''}</td>
                          <td className="p-1.5 text-right font-mono">{pesos(d.computado)}</td><td></td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-400">Códigos del Recuadro N° 22 del F22. Antes de declarar, compáralos con el formulario oficial del año tributario.</p>
        </div>
      )}

      {tab === 'cpt' && (
        <div className="border border-slate-200 rounded-xl bg-white p-4 max-w-xl space-y-2 text-sm">
          {([['cptInicial', 'CPT inicial (año anterior, F22 cód. 1545/1581)'], ['aumentosCapital', 'Aumentos de capital del ejercicio'], ['disminucionesCapital', 'Disminuciones de capital del ejercicio'], ['retiros', 'Retiros del ejercicio'], ['otrasAgregar', 'Otras partidas a agregar'], ['otrasDeducir', 'Otras partidas a deducir']] as [keyof CptSimplificado, string][]).map(([k, t]) => (
            <div key={k} className="flex items-center justify-between gap-3">
              <span className="text-slate-600">{t}
                {k === 'cptInicial' && cptInicialAuto !== null && (hoja.cptInicialManual
                  ? !bloqueado && <button onClick={() => set({ cptInicialManual: false })} className="ml-2 text-xs text-indigo-600 underline">Tomar el del año anterior</button>
                  : <span className="ml-2 text-[11px] text-emerald-700">en línea</span>)}
              </span>
              <MontoConSigno value={cptHoja[k]} disabled={bloqueado} onChange={n => set({ cpt: { ...cptHoja, [k]: n }, ...(k === 'cptInicial' ? { cptInicialManual: true } : {}) })} />
            </div>
          ))}
          <div className="flex justify-between border-t border-slate-200 pt-2"><span className="text-slate-600">Base imponible / pérdida del ejercicio</span><span className="font-mono">{pesos(res.baseImponible)}</span></div>
          <div className="flex justify-between font-semibold"><span>CPT simplificado final</span><span className="font-mono">{pesos(cpt.final)}</span></div>
          {!anterior && !(saldos && saldos.anioInicio === anio) && <p className="text-xs text-amber-700">No hay año anterior en Gest_Rta ni saldos de apertura para {anio}: ingresa el CPT inicial.</p>}
        </div>
      )}

      {tab === 'propietarios' && (
        <div className="space-y-3">
          <div className="border border-slate-200 rounded-xl bg-white p-3 flex flex-wrap items-center gap-3 text-sm">
            <span className="text-slate-600">PPM del año:</span>
            <select disabled={bloqueado} value={hoja.cuentaPpmId || ''} onChange={e => set({ cuentaPpmId: e.target.value || undefined })} className="border border-slate-300 rounded-md px-2 py-1 text-xs">
              <option value="">Ingresar a mano</option>
              {accounts.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
            </select>
            {hoja.cuentaPpmId ? <span className="font-mono">{pesos(ppm)}</span> : <MontoConSigno value={hoja.ppmManual} disabled={bloqueado} onChange={n => set({ ppmManual: n })} />}
            <span className="text-slate-600 ml-2" title="Reajuste de los PPM con los factores de actualización del SII. Si ya contabilizaste la CM en la cuenta de PPM, déjalo en 0 para no contarla dos veces.">+ Corrección monetaria PPM:</span>
            <MontoConSigno value={hoja.ppmCm || 0} disabled={bloqueado} onChange={n => set({ ppmCm: n })} />
            <span className="text-slate-600 ml-2">= PPM actualizados:</span>
            <span className="font-mono font-semibold">{pesos(ppmActualizado)}</span>
          </div>
          <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-600"><tr><th className="p-2 text-left">RUT</th><th className="p-2 text-left">Nombre</th><th className="p-2 text-right">% participación</th><th className="p-2 text-right">Base asignada</th><th className="p-2 text-right">PPM asignado</th><th></th></tr></thead>
              <tbody>
                {asignacion.filas.map((f, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="p-2"><input disabled={bloqueado} value={f.rut} onChange={e => { const p = [...hoja.propietarios]; p[i] = { ...p[i], rut: e.target.value }; set({ propietarios: p }); }} className="w-28 border border-slate-200 rounded px-1.5 py-0.5" /></td>
                    <td className="p-2"><input disabled={bloqueado} value={f.nombre} onChange={e => { const p = [...hoja.propietarios]; p[i] = { ...p[i], nombre: e.target.value }; set({ propietarios: p }); }} className="w-full border border-slate-200 rounded px-1.5 py-0.5" /></td>
                    <td className="p-2 text-right"><InputNumeroCL disabled={bloqueado} decimales={4} value={f.porcentaje} onChange={n => { const p = [...hoja.propietarios]; p[i] = { ...p[i], porcentaje: n }; set({ propietarios: p }); }} className="w-20 border border-slate-200 rounded px-1.5 py-0.5 text-right" /></td>
                    <td className="p-2 text-right font-mono">{pesos(f.base)}</td>
                    <td className="p-2 text-right font-mono">{pesos(f.ppm)}</td>
                    <td className="p-2">{!bloqueado && <button onClick={() => set({ propietarios: hoja.propietarios.filter((_, j) => j !== i) })} className="text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!bloqueado && <button onClick={() => set({ propietarios: [...hoja.propietarios, { rut: '', nombre: '', porcentaje: 0 }] })} className="inline-flex items-center gap-1 text-sm text-indigo-700"><Plus className="w-4 h-4" /> Agregar propietario</button>}
          {hoja.propietarios.length > 0 && !asignacion.cuadra && <p className="text-xs text-rose-700">Los porcentajes suman {asignacion.sumaPorcentajes}%: deben sumar 100% para cerrar el año.</p>}
          {res.baseImponible < 0 && <p className="text-xs text-slate-500">Hay pérdida tributaria: no se asigna base a los propietarios; la pérdida pasa al año siguiente (código 1627).</p>}
        </div>
      )}

      {tab === 'apertura' && (
        <SaldosAperturaForm saldos={saldos} anio={anio} disabled={soloLectura} onGuardar={guardarSaldos} />
      )}

      {hoja.historial.length > 0 && (
        <details className="text-xs text-slate-500">
          <summary className="cursor-pointer">Historial ({hoja.historial.length})</summary>
          <ul className="mt-1 space-y-0.5">{[...hoja.historial].reverse().map((h, i) => <li key={i}>{new Date(h.fecha).toLocaleString('es-CL')} · {h.usuario} · {h.accion}</li>)}</ul>
        </details>
      )}
    </div>
  );
};

const SaldosAperturaForm: React.FC<{ saldos: SaldosApertura | null; anio: number; disabled?: boolean; onGuardar: (s: SaldosApertura) => void }> = ({ saldos, anio, disabled, onGuardar }) => {
  const [s, setS] = useState<SaldosApertura>(saldos || { anioInicio: anio, cptInicial: 0, perdidaArrastre: 0, notas: '' });
  useEffect(() => { if (saldos) setS(saldos); }, [saldos]);
  return (
    <div className="border border-slate-200 rounded-xl bg-white p-4 max-w-xl space-y-3 text-sm">
      <p className="text-slate-600">Saldos tributarios con que la empresa parte en Gest_Rta (los del último F22 presentado antes de usar el sistema). Desde el año siguiente se arrastran solos.</p>
      <label className="flex items-center justify-between gap-3"><span>Primer año comercial en Gest_Rta</span>
        <input disabled={disabled} type="number" value={s.anioInicio} onChange={e => setS({ ...s, anioInicio: Number(e.target.value) || anio })} className="w-24 border border-slate-300 rounded-md px-2 py-1 text-right" /></label>
      <label className="flex items-center justify-between gap-3"><span>CPT inicial (F22 anterior, cód. 1545/1581)</span>
        <MontoConSigno value={s.cptInicial} disabled={disabled} onChange={n => setS({ ...s, cptInicial: n })} /></label>
      <label className="flex items-center justify-between gap-3"><span>Pérdida tributaria de arrastre</span>
        <MontoConSigno value={s.perdidaArrastre} disabled={disabled} onChange={n => setS({ ...s, perdidaArrastre: Math.abs(n) })} /></label>
      <textarea disabled={disabled} value={s.notas || ''} onChange={e => setS({ ...s, notas: e.target.value })} placeholder="Notas / respaldo" className="w-full border border-slate-300 rounded-md px-2 py-1 text-xs" rows={2} />
      {!disabled && <button onClick={() => onGuardar(s)} className="inline-flex items-center gap-1.5 bg-slate-900 text-white rounded-lg px-3 py-1.5 text-sm"><Save className="w-4 h-4" /> Guardar saldos</button>}
      <p className="text-[11px] text-slate-400">Para Pro Pyme General y Régimen General se agregarán aquí los registros RAI, REX, DDAN y SAC.</p>
    </div>
  );
};

export default GestRtaView;
