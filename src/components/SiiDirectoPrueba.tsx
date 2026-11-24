import React, { useState } from 'react';
import { consultarSiiDirecto } from '../utils/siiRcvClient';

// Prueba de la API propia de Gest_OK contra el SII (sin SimpleAPI). Solo lectura: no importa nada.
export default function SiiDirectoPrueba({ studyId, companyId, periodo, onClose }: { studyId: string; companyId: string; periodo: string; onClose: () => void }) {
  const [cargando, setCargando] = useState('');
  const [salida, setSalida] = useState<Record<string, any>>({});
  const [anio, mes] = (periodo || '').split('-').map(Number);
  const correr = async (accion: 'datos' | 'rcv' | 'f29') => {
    setCargando(accion);
    const t0 = Date.now();
    const r = await consultarSiiDirecto({ studyId, companyId, accion, year: anio, month: mes });
    setSalida(s => ({ ...s, [accion]: { ...r, segundos: ((Date.now() - t0) / 1000).toFixed(1) } }));
    setCargando('');
  };
  const pesos = (n: number) => '$ ' + Math.round(n || 0).toLocaleString('es-CL');
  const caja = (accion: string, contenido: React.ReactNode) => {
    const r = salida[accion];
    if (!r) return null;
    return (
      <div className={`rounded-lg border p-3 text-xs ${r.success ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
        <div className="font-bold mb-1">{r.success ? 'Funcionó' : 'No funcionó'} · {r.segundos} s</div>
        {r.success ? contenido : <div className="text-rose-800">{r.error}</div>}
        {r.apiErrors && <div className="text-amber-800 mt-1">{r.apiErrors.join(' · ')}</div>}
      </div>
    );
  };
  const d = salida.datos?.datos;
  const rcv = salida.rcv;
  const sum = (tipo: string) => (rcv?.documents || []).filter((x: any) => x.tipoRegistro === tipo).reduce((a: number, x: any) => a + (x.montoTotal || 0), 0);
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-3xl p-5 space-y-4 my-8">
        <div className="flex justify-between items-start gap-3">
          <div>
            <h3 className="font-bold text-slate-900">API propia SII (prueba)</h3>
            <p className="text-xs text-slate-500">Entra al SII con la clave tributaria de la empresa, sin SimpleAPI. Solo lee: no importa ni modifica nada.</p>
          </div>
          <button onClick={onClose} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-100">Cerrar</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {([['datos', 'Datos de la empresa'], ['rcv', `RCV y honorarios ${periodo}`], ['f29', `F29 presentados ${anio}`]] as const).map(([a, t]) => (
            <button key={a} disabled={!!cargando} onClick={() => correr(a)}
              className="px-3 py-2 rounded-lg bg-indigo-600 disabled:bg-slate-400 text-white text-xs font-bold">
              {cargando === a ? 'Consultando…' : t}
            </button>
          ))}
        </div>
        {caja('datos', d && (
          <div className="space-y-0.5">
            <div><b>{d.razonSocial}</b> · {d.rut}</div>
            <div>Inicio de actividades: {d.inicioActividades || '-'} {d.terminoGiro && `· Término de giro: ${d.terminoGiro}`}</div>
            <div>Actividad: {d.glosaActividad || '-'} · F29 día {d.f29Dia20 ? '20' : '12'}</div>
            {d.direcciones?.map((x: string) => <div key={x}>Dirección: {x}</div>)}
            {d.atributos?.map((a: any) => <div key={a.codigo}>{a.descripcion || a.codigo} (desde {a.desde})</div>)}
          </div>
        ))}
        {caja('rcv', rcv?.success && (
          <div className="space-y-0.5">
            <div>Ventas: {rcv.resumen?.ventas} documentos · {pesos(sum('Venta'))}</div>
            <div>Compras: {rcv.resumen?.compras} documentos · {pesos(sum('Compra'))}</div>
            <div>Honorarios: {rcv.resumen?.honorarios} boletas · {pesos(sum('Honorario'))}</div>
          </div>
        ))}
        {caja('f29', salida.f29?.success && (
          <table className="w-full">
            <thead><tr className="text-left text-slate-500 [&>th]:pr-4"><th>Período</th><th>Folio</th><th>Fecha</th><th className="text-right">Total</th><th>Estado</th></tr></thead>
            <tbody>
              {(salida.f29.f29 || []).map((f: any, i: number) => (
                <tr key={i} className="[&>td]:pr-4"><td>{f.periodo}</td><td>{f.folio || '-'}</td><td>{f.fecha || '-'}</td><td className="text-right">{f.error ? '' : pesos(f.total)}</td><td>{f.error || f.estado}</td></tr>
              ))}
              {(salida.f29.f29 || []).length === 0 && <tr><td colSpan={5}>Sin F29 presentados este año.</td></tr>}
            </tbody>
          </table>
        ))}
      </div>
    </div>
  );
}
