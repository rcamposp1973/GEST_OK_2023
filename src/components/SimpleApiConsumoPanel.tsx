import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, getDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';

/**
 * Consumo de SimpleAPI (consultas al RCV del SII) por mes, por estudio y por empresa. Sólo Super Admin.
 * Cada bloque de hasta 5.000 documentos devueltos cuenta como 1 consulta; una respuesta vacía no se cobra.
 */
interface UsoMes {
  mes: string;
  total: number;
  porEmpresa: Record<string, number>;
  porEstudio: Record<string, number>;
  empresas: Record<string, { nombre?: string; rut?: string; studyId?: string }>;
  actualizado?: string;
}

const LIMITE_REFERENCIAL = 30;

export default function SimpleApiConsumoPanel() {
  const [meses, setMeses] = useState<UsoMes[]>([]);
  const [mesSel, setMesSel] = useState('');
  const [estudios, setEstudios] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'systemUsage'));
        const lista = snap.docs.filter(d => d.id.startsWith('simpleApi_')).map(d => {
          const x = d.data() as any;
          return { mes: x.mes || d.id.replace('simpleApi_', ''), total: Number(x.total) || 0, porEmpresa: x.porEmpresa || {}, porEstudio: x.porEstudio || {}, empresas: x.empresas || {}, actualizado: x.actualizado } as UsoMes;
        }).sort((a, b) => b.mes.localeCompare(a.mes));
        setMeses(lista);
        setMesSel(lista[0]?.mes || '');
        // Nombres de estudios
        const ids = new Set<string>();
        lista.forEach(m => { Object.keys(m.porEstudio).forEach(i => ids.add(i)); Object.values(m.empresas).forEach(e => e.studyId && ids.add(e.studyId)); });
        const nombres: Record<string, string> = {};
        await Promise.all([...ids].map(async id => {
          try { const s = await getDoc(doc(db, 'studies', id)); nombres[id] = (s.data() as any)?.name || id; } catch { nombres[id] = id; }
        }));
        setEstudios(nombres);
      } catch (e: any) {
        setError(e?.code === 'permission-denied'
          ? 'Sin permiso para leer el consumo. Falta publicar las reglas nuevas de Firebase (firestore.rules).'
          : `No se pudo leer el consumo: ${e?.message || e}`);
      } finally { setCargando(false); }
    })();
  }, []);

  const actual = meses.find(m => m.mes === mesSel);
  const filas = useMemo(() => {
    if (!actual) return [];
    return Object.entries(actual.porEmpresa).map(([id, n]) => {
      const e = actual.empresas[id] || {};
      return { id, consultas: Number(n) || 0, nombre: e.nombre || id, rut: e.rut || '', estudio: e.studyId ? (estudios[e.studyId] || e.studyId) : '—' };
    }).sort((a, b) => b.consultas - a.consultas);
  }, [actual, estudios]);
  const porEstudio = useMemo(() => {
    if (!actual) return [];
    const m = new Map<string, number>();
    filas.forEach(f => m.set(f.estudio, (m.get(f.estudio) || 0) + f.consultas));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [actual, filas]);

  const n = (v: number) => v.toLocaleString('es-CL');

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-900">Consumo de SimpleAPI</h3>
          <p className="text-xs text-slate-500">Consultas al Registro de Compras y Ventas. Cada bloque de hasta 5.000 documentos es 1 consulta; las respuestas vacías no se cobran.</p>
        </div>
        {meses.length > 0 && (
          <select value={mesSel} onChange={e => setMesSel(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
            {meses.map(m => <option key={m.mes} value={m.mes}>{m.mes}</option>)}
          </select>
        )}
      </div>

      {cargando && <p className="text-sm text-slate-500">Cargando…</p>}
      {error && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}
      {!cargando && !error && meses.length === 0 && <p className="text-sm text-slate-500">Aún no hay consultas registradas.</p>}

      {actual && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg border border-slate-200 p-3"><div className="text-[11px] text-slate-500">Consultas del mes</div><div className="text-xl font-bold font-mono">{n(actual.total)}</div></div>
            <div className="rounded-lg border border-slate-200 p-3"><div className="text-[11px] text-slate-500">Límite referencial del plan</div><div className="text-xl font-bold font-mono">{n(LIMITE_REFERENCIAL)}</div></div>
            <div className="rounded-lg border border-slate-200 p-3"><div className="text-[11px] text-slate-500">Empresas que consultaron</div><div className="text-xl font-bold font-mono">{n(filas.length)}</div></div>
            <div className="rounded-lg border border-slate-200 p-3"><div className="text-[11px] text-slate-500">Última consulta</div><div className="text-sm font-semibold">{actual.actualizado ? new Date(actual.actualizado).toLocaleString('es-CL') : '—'}</div></div>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden" title={`${actual.total} de ${LIMITE_REFERENCIAL}`}>
            <div className={`h-full ${actual.total > LIMITE_REFERENCIAL ? 'bg-rose-500' : 'bg-teal-500'}`} style={{ width: `${Math.min(100, (actual.total / LIMITE_REFERENCIAL) * 100)}%` }} />
          </div>

          <div className="grid lg:grid-cols-[1fr_2fr] gap-4">
            <div>
              <h4 className="text-xs font-bold text-slate-700 mb-1">Por estudio</h4>
              <table className="w-full text-xs"><tbody>
                {porEstudio.map(([e, c]) => <tr key={e} className="border-b border-slate-100"><td className="py-1.5">{e}</td><td className="py-1.5 text-right font-mono">{n(c)}</td></tr>)}
              </tbody></table>
            </div>
            <div className="overflow-x-auto">
              <h4 className="text-xs font-bold text-slate-700 mb-1">Por empresa</h4>
              <table className="w-full text-xs">
                <thead><tr className="text-left text-slate-500 border-b border-slate-200"><th className="py-1.5">Empresa</th><th>RUT</th><th>Estudio</th><th className="text-right">Consultas</th></tr></thead>
                <tbody>
                  {filas.map(f => (
                    <tr key={f.id} className="border-b border-slate-100">
                      <td className="py-1.5">{f.nombre}</td><td className="font-mono">{f.rut}</td><td>{f.estudio}</td><td className="text-right font-mono">{n(f.consultas)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11px] text-slate-400 mt-1">Los meses anteriores a esta versión muestran sólo el identificador de la empresa.</p>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
