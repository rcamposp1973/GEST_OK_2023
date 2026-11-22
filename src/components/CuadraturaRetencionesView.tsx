import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { db } from '../lib/firebase';
import type { ChartOfAccount, PayrollSlip, RCVDocument, Voucher, Company } from '../types';
import {
  cuadratura1887, cuadratura1879, sugerirCuentaImpuestoUnico, sugerirCuentaRetencionHonorarios, ResultadoCuadratura,
} from '../utils/cuadraturaRetenciones';

interface Props {
  studyId?: string;
  company: Company;
  anio: number;
  savedSlips: PayrollSlip[];
  rcvDocuments: RCVDocument[];
  vouchers: Voucher[];
  accounts: ChartOfAccount[];
}

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const pesos = (n: number | null) => (n === null ? '—' : '$' + Math.round(n).toLocaleString('es-CL'));

const Tabla: React.FC<{
  titulo: string; subtitulo: string; etiquetaOrigen: string; codigoF29: string;
  res: ResultadoCuadratura; cuentaId: string; onCuenta: (id: string) => void; accounts: ChartOfAccount[];
}> = ({ titulo, subtitulo, etiquetaOrigen, codigoF29, res, cuentaId, onCuenta, accounts }) => (
  <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h3 className="font-semibold text-slate-900">{titulo}</h3>
        <p className="text-sm text-slate-500">{subtitulo}</p>
      </div>
      {res.mesesConDiferencia === 0
        ? <span className="inline-flex items-center gap-1 text-sm text-emerald-700"><CheckCircle2 className="w-4 h-4" /> Cuadra todo el año</span>
        : <span className="inline-flex items-center gap-1 text-sm text-amber-700"><AlertTriangle className="w-4 h-4" /> {res.mesesConDiferencia} mes(es) con diferencia</span>}
    </div>
    <label className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
      Cuenta contable de la retención
      <select value={cuentaId} onChange={e => onCuenta(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1 text-sm max-w-[20rem]">
        <option value="">Sin cuenta (no comparar contabilidad)</option>
        {accounts.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
      </select>
    </label>
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 border-b border-slate-200">
            <th className="py-2 pr-3 font-medium">Mes</th>
            <th className="py-2 px-3 font-medium text-right">{etiquetaOrigen}</th>
            <th className="py-2 px-3 font-medium text-right">F29 (cód. {codigoF29})</th>
            <th className="py-2 px-3 font-medium text-right">Contabilidad</th>
            <th className="py-2 pl-3 font-medium">Estado</th>
          </tr>
        </thead>
        <tbody>
          {res.filas.map((f, i) => (
            <tr key={f.periodo} className={`border-b border-slate-100 ${f.cuadra ? '' : 'bg-amber-50'}`}>
              <td className="py-1.5 pr-3 text-slate-700">{MESES[i]}</td>
              <td className="py-1.5 px-3 text-right font-mono">{pesos(f.origen)}</td>
              <td className="py-1.5 px-3 text-right font-mono">{pesos(f.f29)}</td>
              <td className="py-1.5 px-3 text-right font-mono">{pesos(f.contabilidad)}</td>
              <td className="py-1.5 pl-3 text-slate-600">{f.faltaF29 ? 'Falta F29' : f.cuadra ? 'OK' : 'Diferencia'}</td>
            </tr>
          ))}
          <tr className="font-semibold text-slate-900">
            <td className="py-2 pr-3">Total</td>
            <td className="py-2 px-3 text-right font-mono">{pesos(res.totalOrigen)}</td>
            <td className="py-2 px-3 text-right font-mono">{pesos(res.totalF29)}</td>
            <td className="py-2 px-3 text-right font-mono">{cuentaId ? pesos(res.totalContabilidad) : '—'}</td>
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  </section>
);

export const CuadraturaRetencionesView: React.FC<Props> = ({ studyId, company, anio, savedSlips, rcvDocuments, vouchers, accounts }) => {
  const [f29s, setF29s] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [cuentaIU, setCuentaIU] = useState<string>(() => sugerirCuentaImpuestoUnico(accounts) || '');
  const [cuentaRH, setCuentaRH] = useState<string>(() => sugerirCuentaRetencionHonorarios(accounts) || '');

  useEffect(() => {
    if (!studyId) { setCargando(false); return; }
    let vivo = true;
    setCargando(true);
    getDocs(collection(db, 'studies', studyId, 'companies', company.id, 'f29Declarations'))
      .then(s => { if (vivo) setF29s(s.docs.map(d => d.data())); })
      .catch(() => {})
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [studyId, company.id]);

  const r1887 = useMemo(() => cuadratura1887(anio, savedSlips as any, f29s, vouchers as any, accounts.find(a => a.id === cuentaIU)), [anio, savedSlips, f29s, vouchers, accounts, cuentaIU]);
  const r1879 = useMemo(() => cuadratura1879(anio, rcvDocuments as any, f29s, vouchers as any, accounts.find(a => a.id === cuentaRH)), [anio, rcvDocuments, f29s, vouchers, accounts, cuentaRH]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Compara mes a mes lo retenido según su origen, lo declarado en el F29 y lo contabilizado. Una diferencia aquí es lo que el SII observa después (inconsistencias entre la DJ y el F29). Revisa antes de aceptar la propuesta del SII.
      </p>
      {cargando && <p className="text-sm text-slate-500">Cargando F29 guardados…</p>}
      <Tabla
        titulo={`DJ 1887 · Impuesto único ${anio}`} subtitulo="Liquidaciones de sueldo del sistema vs F29 vs contabilidad"
        etiquetaOrigen="Liquidaciones" codigoF29="48" res={r1887} cuentaId={cuentaIU} onCuenta={setCuentaIU} accounts={accounts}
      />
      <Tabla
        titulo={`DJ 1879 · Retención de honorarios ${anio}`} subtitulo="Boletas de honorarios del RCV vs F29 vs contabilidad"
        etiquetaOrigen="Boletas (RCV)" codigoF29="151" res={r1879} cuentaId={cuentaRH} onCuenta={setCuentaRH} accounts={accounts}
      />
      <p className="text-xs text-slate-500">"Contabilidad" suma el haber de la cuenta en cada mes (la provisión de la retención); el pago del F29 va al debe y no se cuenta. Las liquidaciones solo aparecen si la empresa calcula sus sueldos en Gest_OK.</p>
    </div>
  );
};

export default CuadraturaRetencionesView;
