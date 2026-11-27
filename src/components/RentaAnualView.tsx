import React, { useEffect, useMemo, useState } from 'react';
import { DetalleCmPpm } from './DetalleCmPpm';
import { getOfficialIPC } from '../utils/chileanEconomicIndicators';
import { factoresActualizacion, calcularCmPpm } from '../utils/ppmActualizado';
import { InputNumeroCL } from './ui/NumeroCL';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Plus, Trash2, Save, Download, AlertTriangle } from 'lucide-react';
import { db, auth } from '../lib/firebase';
import type { Company, ChartOfAccount, Voucher } from '../types';
import { getNaturaleza } from '../utils/ifrsClassification';
import {
  AJUSTES_SUGERIDOS, NOMBRE_REGIMEN, TASA_IDPC_SUGERIDA, RegimenRenta, HojaRenta,
  calcularRenta, datosContablesDelAnio, hojaInicial, normalizarRegimen, movimientoCuentaDelAnio, sugerirCuentaPpm,
} from '../utils/rentaAnual';

interface Props {
  studyId: string;
  company: Company;
  accounts: ChartOfAccount[];
  vouchers: Voucher[];
  soloLectura?: boolean;
}

const pesos = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('es-CL');
const nuevoId = () => Math.random().toString(36).slice(2, 10);

const Fila: React.FC<{ label: string; value: number; strong?: boolean; hint?: string }> = ({ label, value, strong, hint }) => (
  <div className={`flex items-baseline justify-between py-1.5 ${strong ? 'border-t border-slate-200 mt-1 pt-2' : ''}`}>
    <span className={`text-sm ${strong ? 'font-semibold text-slate-900' : 'text-slate-600'}`} title={hint}>{label}</span>
    <span className={`font-mono text-sm ${strong ? 'font-semibold text-slate-900' : 'text-slate-800'}`}>{pesos(value)}</span>
  </div>
);

const Monto: React.FC<{ value: number; onChange: (n: number) => void; disabled?: boolean }> = ({ value, onChange, disabled }) => (
  <InputNumeroCL value={Number.isFinite(value) ? value : 0} onChange={onChange} disabled={disabled} permitirNegativo />
);

export const RentaAnualView: React.FC<Props> = ({ studyId, company, accounts, vouchers, soloLectura }) => {
  const anioDefecto = new Date().getMonth() >= 9 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  const [anio, setAnio] = useState<number>(anioDefecto);
  const datos = useMemo(() => datosContablesDelAnio(vouchers as any, accounts, anio), [vouchers, accounts, anio]);
  const [hoja, setHoja] = useState<HojaRenta>(() => hojaInicial(normalizarRegimen(company.regimenTributario), datos));
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string>('');
  const [guardadaEnBD, setGuardadaEnBD] = useState(false);

  const ref = useMemo(() => doc(db, 'studies', studyId, 'companies', company.id, 'rentaAnual', `AT${anio + 1}`), [studyId, company.id, anio]);

  useEffect(() => {
    let vivo = true;
    getDoc(ref).then(s => {
      if (!vivo) return;
      setGuardadaEnBD(s.exists());
      if (s.exists()) setHoja({ ...hojaInicial(normalizarRegimen(company.regimenTributario), datos), ...(s.data() as any).hoja });
      else setHoja({ ...hojaInicial(normalizarRegimen(company.regimenTributario), datos), cuentaPpmId: sugerirCuentaPpm(accounts) });
    }).catch(() => {});
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref]);

  // La contabilidad manda: el capital aportado sigue en línea a las cuentas de capital, salvo que el contador lo fije a mano.

  // PPM: si hay una cuenta elegida, el monto sale de la contabilidad del año
  const ppmDesdeCuenta = useMemo(
    () => (hoja.cuentaPpmId ? movimientoCuentaDelAnio(vouchers as any, accounts, hoja.cuentaPpmId, anio) : null),
    [hoja.cuentaPpmId, vouchers, accounts, anio]
  );
  // CM de PPM: factores de actualización del SII (o estimados con IPC) aplicados a cada PPM según el mes de pago
  const factoresPpm = useMemo(() => factoresActualizacion(anio, p => { const r = getOfficialIPC(p); return r.monthly || r.accumulated ? r.monthly : undefined; }), [anio]);
  const cmPpm = useMemo(() => (hoja.cuentaPpmId ? calcularCmPpm(vouchers as any, accounts as any, hoja.cuentaPpmId, anio, factoresPpm.factores) : null), [hoja.cuentaPpmId, vouchers, accounts, anio, factoresPpm]);
  const [verDetalleCm, setVerDetalleCm] = useState(false);
  const hojaEfectiva = useMemo(() => ({
    ...hoja,
    ...(cmPpm && !hoja.ppmCmManual ? { ppmCm: cmPpm.cmSugerida } : {}),
    ...(ppmDesdeCuenta === null ? {} : { ppmPagados: ppmDesdeCuenta }),
    ...(hoja.capitalManual ? {} : { capitalAportado: datos.capitalSugerido }),
  }), [hoja, ppmDesdeCuenta, datos.capitalSugerido, cmPpm]);
  const cuentasActivo = useMemo(() => accounts.filter(a => getNaturaleza(a as any) === 'ACTIVO' && a.isImputable !== false), [accounts]);
  const res = useMemo(() => calcularRenta(datos, hojaEfectiva), [datos, hojaEfectiva]);
  const pyme = hoja.regimen !== '14_A_SEMI_INTEGRADO';
  const transparente = hoja.regimen === '14_D8_PROPYME_TRANSPARENTE';
  const set = (p: Partial<HojaRenta>) => setHoja(h => ({ ...h, ...p }));

  const guardar = async () => {
    setGuardando(true);
    try {
      await setDoc(ref, { hoja: hojaEfectiva, anioComercial: anio, actualizadoPor: auth.currentUser?.email || '', actualizadoEn: new Date().toISOString() });
      setGuardadaEnBD(true);
      setAviso('Hoja guardada.');
    } catch (e: any) {
      setAviso('No se pudo guardar: ' + (e?.message || e));
    } finally {
      setGuardando(false);
      setTimeout(() => setAviso(''), 4000);
    }
  };

  const exportar = () => {
    const filas: (string | number)[][] = [
      ['Empresa', company.name], ['RUT', company.rut], ['Año comercial', anio], ['Año tributario', anio + 1], ['Régimen', NOMBRE_REGIMEN[hoja.regimen]], [],
      ['Ingresos del ejercicio', datos.ingresos], ['Costos y gastos del ejercicio', datos.gastos], ['Resultado contable', datos.utilidadContable], [],
      ...hoja.ajustes.map(a => [`${a.tipo === 'AGREGADO' ? 'Agregado' : 'Deducción'}: ${a.concepto}`, a.tipo === 'AGREGADO' ? a.monto : -a.monto]),
      [], [transparente ? 'Base imponible' : 'Renta líquida imponible', res.rli], ['Pérdida tributaria', res.perdidaTributaria],
      ['Tasa IDPC %', transparente ? 0 : hoja.tasaIdpc], ['Impuesto de Primera Categoría', res.idpc], ['PPM pagados', hojaEfectiva.ppmPagados], ['Corrección monetaria PPM', Number(hojaEfectiva.ppmCm) || 0], ['PPM actualizados', (Number(hojaEfectiva.ppmPagados) || 0) + (Number(hojaEfectiva.ppmCm) || 0)],
      ['Otros créditos', hoja.otrosCreditos], ['Saldo (a pagar + / a devolver -)', res.saldoImpuesto], [], ['Capital propio tributario', res.cpt],
    ];
    const csv = filas.map(f => f.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `Renta_AT${anio + 1}_${(company.rut || '').replace(/[^0-9kK]/g, '')}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const sugeridosPendientes = AJUSTES_SUGERIDOS[hoja.regimen].filter(s => !hoja.ajustes.some(a => a.concepto === s.concepto));

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Renta anual: RLI y capital propio</h2>
          <p className="text-sm text-slate-500">Hoja de trabajo desde la contabilidad. Es referencial: revisa cada ajuste antes de declarar en el F22.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-slate-600">Año comercial
            <select value={anio} onChange={e => setAnio(Number(e.target.value))} className="ml-2 border border-slate-300 rounded-lg px-2 py-1 text-sm">
              {[anioDefecto + 1, anioDefecto, anioDefecto - 1, anioDefecto - 2].map(a => <option key={a} value={a}>{a} (AT {a + 1})</option>)}
            </select>
          </label>
          <select
            value={hoja.regimen} disabled={soloLectura}
            onChange={e => { const r = e.target.value as RegimenRenta; set({ regimen: r, tasaIdpc: TASA_IDPC_SUGERIDA[r] }); }}
            className="border border-slate-300 rounded-lg px-2 py-1 text-sm"
          >
            {(Object.keys(NOMBRE_REGIMEN) as RegimenRenta[]).map(r => <option key={r} value={r}>{NOMBRE_REGIMEN[r]}</option>)}
          </select>
          <button onClick={exportar} className="inline-flex items-center gap-1.5 border border-slate-300 rounded-lg px-3 py-1.5 text-sm hover:bg-slate-50">
            <Download className="w-4 h-4" /> Exportar
          </button>
          {!soloLectura && (
            <button onClick={guardar} disabled={guardando} className="inline-flex items-center gap-1.5 bg-slate-900 text-white rounded-lg px-3 py-1.5 text-sm disabled:opacity-60">
              <Save className="w-4 h-4" /> {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          )}
        </div>
      </div>

      {aviso && <div className="text-sm text-slate-700 bg-slate-100 rounded-lg px-3 py-2">{aviso}</div>}
      {datos.comprobantesDescuadrados > 0 && (
        <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertTriangle className="w-4 h-4 mt-0.5" />
          <span>{datos.comprobantesDescuadrados} comprobante(s) descuadrado(s) quedaron fuera del cálculo. Corrígelos antes de cerrar la renta.</span>
        </div>
      )}

      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <h3 className="font-semibold text-slate-900 mb-2">1. Resultado contable {anio}</h3>
        <Fila label="Ingresos del ejercicio" value={datos.ingresos} />
        <Fila label="Costos y gastos del ejercicio" value={-datos.gastos} />
        <Fila label="Resultado contable" value={datos.utilidadContable} strong />
        <p className="text-xs text-slate-500 mt-2">{datos.comprobantesUsados} comprobantes válidos. Fuente: los mismos saldos del Balance de 8 columnas.</p>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <h3 className="font-semibold text-slate-900">2. Ajustes tributarios</h3>
        <p className="text-sm text-slate-500 mb-3">
          {pyme
            ? 'Pro Pyme tributa sobre ingresos percibidos y gastos pagados: ajusta lo devengado que no se cobró o no se pagó al 31-12.'
            : 'Agrega lo que la contabilidad rebajó y la ley no acepta; deduce lo que la ley permite y la contabilidad no registró.'}
        </p>
        <div className="space-y-2">
          {hoja.ajustes.map(a => (
            <div key={a.id} className="flex flex-wrap items-center gap-2">
              <select value={a.tipo} disabled={soloLectura}
                onChange={e => set({ ajustes: hoja.ajustes.map(x => x.id === a.id ? { ...x, tipo: e.target.value as any } : x) })}
                className="border border-slate-300 rounded-lg px-2 py-1 text-sm">
                <option value="AGREGADO">Agregado (+)</option>
                <option value="DEDUCCION">Deducción (−)</option>
              </select>
              <input value={a.concepto} disabled={soloLectura}
                onChange={e => set({ ajustes: hoja.ajustes.map(x => x.id === a.id ? { ...x, concepto: e.target.value } : x) })}
                className="flex-1 min-w-[12rem] border border-slate-300 rounded-lg px-2 py-1 text-sm" />
              <Monto value={a.monto} disabled={soloLectura} onChange={n => set({ ajustes: hoja.ajustes.map(x => x.id === a.id ? { ...x, monto: n } : x) })} />
              {!soloLectura && (
                <button onClick={() => set({ ajustes: hoja.ajustes.filter(x => x.id !== a.id) })} className="p-1.5 text-slate-400 hover:text-rose-600" title="Quitar ajuste">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        {!soloLectura && (
          <div className="mt-3 flex flex-wrap gap-2">
            {sugeridosPendientes.map(s => (
              <button key={s.concepto}
                onClick={() => set({ ajustes: [...hoja.ajustes, { id: nuevoId(), concepto: s.concepto, tipo: s.tipo, monto: 0 }] })}
                className="text-xs border border-slate-300 rounded-full px-2.5 py-1 hover:bg-slate-50 text-slate-700">
                + {s.concepto}
              </button>
            ))}
            <button onClick={() => set({ ajustes: [...hoja.ajustes, { id: nuevoId(), concepto: 'Otro ajuste', tipo: 'AGREGADO', monto: 0 }] })}
              className="inline-flex items-center gap-1 text-xs border border-slate-300 rounded-full px-2.5 py-1 hover:bg-slate-50 text-slate-700">
              <Plus className="w-3 h-3" /> Otro ajuste
            </button>
          </div>
        )}
        {hoja.ajustes.some(a => /14 E/.test(a.concepto)) && (
          <p className="text-xs text-slate-500 mt-2">Incentivo al ahorro: hasta el 50 % de la RLI que se mantiene invertida en la empresa, con tope de UF 5.000.</p>
        )}
        <div className="mt-3">
          <Fila label="Total agregados" value={res.agregados} />
          <Fila label="Total deducciones" value={-res.deducciones} />
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <h3 className="font-semibold text-slate-900 mb-2">3. {transparente ? 'Base imponible y atribución' : 'Renta líquida imponible e impuesto'}</h3>
        <Fila label={transparente ? 'Base imponible del ejercicio' : 'Renta líquida imponible (RLI)'} value={res.rli} strong />
        {res.perdidaTributaria > 0 && <Fila label="Pérdida tributaria del ejercicio" value={-res.perdidaTributaria} hint="Se puede rebajar en ejercicios siguientes" />}
        {transparente ? (
          <p className="text-sm text-slate-600 mt-2">En el régimen transparente la empresa no paga Primera Categoría: la base imponible se atribuye a los dueños según su participación y la declaran en su impuesto personal.</p>
        ) : (
          <>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-sm text-slate-600">Tasa Primera Categoría (%)</span>
              <InputNumeroCL value={hoja.tasaIdpc} disabled={soloLectura} decimales={2} sufijo="%"
                onChange={n => set({ tasaIdpc: n })}
                className="w-24 border border-slate-300 rounded-lg px-2 py-1 text-right font-mono text-sm" />
            </div>
            <Fila label="Impuesto de Primera Categoría" value={res.idpc} />
            <div className="flex flex-wrap items-center justify-between gap-2 py-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-slate-600">PPM pagados en el año</span>
                <select
                  value={hoja.cuentaPpmId || ''} disabled={soloLectura}
                  onChange={e => set({ cuentaPpmId: e.target.value || undefined })}
                  className="border border-slate-300 rounded-lg px-2 py-1 text-sm max-w-[18rem]"
                  title="Cuenta donde se contabilizan los PPM. El monto se lee de sus movimientos del año."
                >
                  <option value="">Ingresar a mano</option>
                  {cuentasActivo.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
                </select>
              </div>
              {ppmDesdeCuenta === null
                ? <Monto value={hoja.ppmPagados} disabled={soloLectura} onChange={n => set({ ppmPagados: n })} />
                : <span className="font-mono text-sm text-slate-800">{pesos(ppmDesdeCuenta)}</span>}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 py-1.5">
              <span className="text-sm text-slate-600" title="Reajuste de los PPM con los factores de actualización del SII. Si ya contabilizaste la CM en la cuenta de PPM, déjalo en 0 para no contarla dos veces.">Corrección monetaria de PPM (reajuste al 31-12)</span>
              <span className="flex items-center gap-2">
                {cmPpm && (hoja.ppmCmManual
                  ? !soloLectura && <button onClick={() => set({ ppmCmManual: false })} className="text-xs text-indigo-600 underline">Calcular con factores del SII</button>
                  : <span className="text-[11px] text-emerald-700">Calculada con factores {factoresPpm.oficial ? 'oficiales del SII' : 'estimados con IPC'}</span>)}
                {cmPpm && <button onClick={() => setVerDetalleCm(v => !v)} className="text-xs text-slate-500 underline">{verDetalleCm ? 'Ocultar detalle' : 'Ver detalle'}</button>}
                <Monto value={hojaEfectiva.ppmCm || 0} disabled={soloLectura} onChange={n => set({ ppmCm: n, ppmCmManual: true })} />
              </span>
            </div>
            {cmPpm && verDetalleCm && <DetalleCmPpm r={cmPpm} oficial={factoresPpm.oficial} faltan={factoresPpm.faltanIpc} />}
            {Number(hojaEfectiva.ppmCm) > 0 && <Fila label="PPM actualizados" value={(Number(hojaEfectiva.ppmPagados) || 0) + (Number(hojaEfectiva.ppmCm) || 0)} />}
            {ppmDesdeCuenta !== null && (
              <p className="text-xs text-slate-500 -mt-1">Movimientos de la cuenta entre el 1-1 y el 31-12-{anio}, sin apertura. Si un PPM se pagó fuera de plazo y se contabilizó en otro año, ajústalo en "Otros créditos".</p>
            )}
            <div className="flex items-center justify-between py-1.5">
              <span className="text-sm text-slate-600">Otros créditos (Sence, donaciones, etc.)</span>
              <Monto value={hoja.otrosCreditos} disabled={soloLectura} onChange={n => set({ otrosCreditos: n })} />
            </div>
            <Fila label={res.saldoImpuesto >= 0 ? 'Saldo a pagar (referencial)' : 'Saldo a devolver (referencial)'} value={Math.abs(res.saldoImpuesto)} strong />
          </>
        )}
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <h3 className="font-semibold text-slate-900">4. Capital propio tributario al 31-12-{anio}</h3>
        {pyme ? (
          <>
            <p className="text-sm text-slate-500 mb-2">Capital propio simplificado: capital aportado, sus aumentos y disminuciones, más los resultados tributarios y menos los retiros.</p>
            {([
              ['Capital efectivamente aportado', 'capitalAportado', 'Sugerido desde las cuentas de capital del plan'],
              ['Aumentos de capital del año', 'aumentosCapital', ''],
              ['Disminuciones de capital del año', 'disminucionesCapital', ''],
              ['Resultados tributarios de años anteriores (netos de retiros)', 'utilidadesTributariasAnteriores', ''],
              ['Retiros o distribuciones del año', 'retirosDelAnio', ''],
            ] as const).map(([label, campo, hint]) => (
              <div key={campo} className="flex items-center justify-between py-1.5">
                <span className="text-sm text-slate-600" title={hint}>{label}</span>
                <span className="flex items-center gap-2">
                  {campo === 'capitalAportado' && (hoja.capitalManual
                    ? !soloLectura && <button onClick={() => set({ capitalManual: false })} className="text-xs text-indigo-600 underline">Seguir a la contabilidad</button>
                    : <span className="text-[11px] text-emerald-700">En línea con la contabilidad</span>)}
                  <Monto value={(hojaEfectiva as any)[campo]} disabled={soloLectura} onChange={n => set({ [campo]: n, ...(campo === 'capitalAportado' ? { capitalManual: true } : {}) } as any)} />
                </span>
              </div>
            ))}
            <Fila label="Resultado tributario del año" value={res.rli - res.perdidaTributaria} />
          </>
        ) : (
          <>
            <p className="text-sm text-slate-500 mb-2">Activos menos pasivos exigibles a valores tributarios. Ajusta lo que la contabilidad valoriza distinto (activos intangibles, valorizaciones, provisiones).</p>
            <Fila label="Total activos" value={datos.activos} />
            <Fila label="Pasivos exigibles" value={-datos.pasivos} />
            {hoja.ajustesCpt.map(a => (
              <div key={a.id} className="flex flex-wrap items-center gap-2 py-1">
                <input value={a.concepto} disabled={soloLectura}
                  onChange={e => set({ ajustesCpt: hoja.ajustesCpt.map(x => x.id === a.id ? { ...x, concepto: e.target.value } : x) })}
                  className="flex-1 min-w-[12rem] border border-slate-300 rounded-lg px-2 py-1 text-sm" />
                <Monto value={a.monto} disabled={soloLectura} onChange={n => set({ ajustesCpt: hoja.ajustesCpt.map(x => x.id === a.id ? { ...x, monto: n } : x) })} />
                {!soloLectura && (
                  <button onClick={() => set({ ajustesCpt: hoja.ajustesCpt.filter(x => x.id !== a.id) })} className="p-1.5 text-slate-400 hover:text-rose-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            {!soloLectura && (
              <button onClick={() => set({ ajustesCpt: [...hoja.ajustesCpt, { id: nuevoId(), concepto: 'Ajuste a valor tributario (usa − para restar)', monto: 0 }] })}
                className="mt-1 inline-flex items-center gap-1 text-xs border border-slate-300 rounded-full px-2.5 py-1 hover:bg-slate-50 text-slate-700">
                <Plus className="w-3 h-3" /> Ajuste al capital propio
              </button>
            )}
          </>
        )}
        <Fila label="Capital propio tributario" value={res.cpt} strong />
      </section>
    </div>
  );
};

export default RentaAnualView;
