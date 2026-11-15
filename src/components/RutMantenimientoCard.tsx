import React, { useState } from 'react';
import { auth } from '../lib/firebase';
import { Wrench, Play, RotateCcw, CheckCircle2, AlertTriangle } from 'lucide-react';

/**
 * Mantenimiento de RUT (solo Super Administrador).
 * Recorre TODOS los estudios y empresas y deja cada RUT como 11.111.111-1.
 * Paso 1: "Revisar" no cambia nada, solo cuenta. Paso 2: "Aplicar". Cada cambio queda respaldado y se puede revertir.
 */
interface Alcance { scope: string; studyId?: string; companyId?: string; coleccion?: string; etiqueta: string }
interface Resultado { revisados: number; cambiados: number; porColeccion: Record<string, number>; ejemplos: { ruta: string; campos: string[] }[]; raros: string[] }

const VACIO = (): Resultado => ({ revisados: 0, cambiados: 0, porColeccion: {}, ejemplos: [], raros: [] });

async function llamar(cuerpo: any) {
  const token = await auth.currentUser?.getIdToken();
  const r = await fetch('/api/admin/normalizar-ruts', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(cuerpo),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(j.error || `Error ${r.status}`);
  return j;
}

export default function RutMantenimientoCard() {
  const [estado, setEstado] = useState<'libre' | 'trabajando'>('libre');
  const [avance, setAvance] = useState('');
  const [res, setRes] = useState<Resultado | null>(null);
  const [modoRes, setModoRes] = useState<'revision' | 'aplicado' | null>(null);
  const [revisado, setRevisado] = useState(false);
  const [confirma, setConfirma] = useState(false);
  const [error, setError] = useState('');
  const [fallidos, setFallidos] = useState<string[]>([]);
  const [ultimaCorrida, setUltimaCorrida] = useState<string>(() => { try { return localStorage.getItem('gest_ok_rut_corrida') || ''; } catch { return ''; } });
  const [mensaje, setMensaje] = useState('');

  const correr = async (simular: boolean) => {
    setEstado('trabajando'); setError(''); setMensaje(''); setRes(null); setFallidos([]);
    const total = VACIO();
    const corrida = `rut_${Date.now()}`;
    const malos: string[] = [];
    try {
      setAvance('Preparando la lista de estudios y empresas…');
      const { alcances } = await llamar({ modo: 'plan' }) as { alcances: Alcance[] };
      for (let i = 0; i < alcances.length; i++) {
        const a = alcances[i];
        setAvance(`${simular ? 'Revisando' : 'Corrigiendo'} ${i + 1} de ${alcances.length}: ${a.etiqueta}`);
        try {
          const r = await llamar({ modo: 'ejecutar', ...a, dryRun: simular, runId: corrida });
          total.revisados += r.revisados; total.cambiados += r.cambiados;
          Object.entries(r.porColeccion as Record<string, number>).forEach(([k, n]) => { total.porColeccion[k] = (total.porColeccion[k] || 0) + n; });
          total.ejemplos.push(...r.ejemplos.slice(0, Math.max(0, 8 - total.ejemplos.length)));
          (r.raros as string[]).forEach(x => { if (total.raros.length < 40 && !total.raros.includes(x)) total.raros.push(x); });
        } catch (e: any) { malos.push(`${a.etiqueta}: ${e?.message || 'error'}`); }
      }
      setRes(total); setModoRes(simular ? 'revision' : 'aplicado'); setFallidos(malos);
      if (simular) { setRevisado(malos.length === 0); setConfirma(false); }
      else {
        setRevisado(false);
        if (total.cambiados > 0) { setUltimaCorrida(corrida); try { localStorage.setItem('gest_ok_rut_corrida', corrida); } catch { /* sin acceso */ } }
      }
      setAvance('');
    } catch (e: any) { setError(e?.message || 'No se pudo completar'); setAvance(''); }
    finally { setEstado('libre'); }
  };

  const revertir = async () => {
    if (!ultimaCorrida) return;
    setEstado('trabajando'); setError(''); setMensaje(''); setAvance('Devolviendo los RUT a como estaban…');
    try {
      const r = await llamar({ modo: 'revertir', runId: ultimaCorrida });
      setMensaje(`Listo: se devolvieron ${r.revertidos} registros a su valor anterior.`);
      setUltimaCorrida(''); try { localStorage.removeItem('gest_ok_rut_corrida'); } catch { /* sin acceso */ }
      setRes(null); setModoRes(null);
    } catch (e: any) { setError(e?.message || 'No se pudo revertir'); }
    finally { setEstado('libre'); setAvance(''); }
  };

  const ocupado = estado === 'trabajando';
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
      <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2"><Wrench className="w-4 h-4 text-indigo-600" /> Formato de RUT en todos los registros</h3>
      <p className="text-xs text-slate-600">
        Regla del sistema: todo RUT se guarda como <b>11.111.111-1</b>, sin importar cómo se digite. Los datos nuevos ya se guardan así.
        Esta herramienta corrige los registros antiguos de <b>todos los estudios y empresas</b>. Primero se revisa (no cambia nada) y recién después se aplica.
        Cada cambio queda respaldado y se puede devolver.
      </p>
      <div className="flex flex-wrap gap-2">
        <button disabled={ocupado} onClick={() => correr(true)} className="px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50">
          <Play className="w-3.5 h-3.5" /> 1. Revisar (no cambia nada)
        </button>
        <button disabled={ocupado || !revisado || !confirma || !res?.cambiados} onClick={() => correr(false)} className="px-3 py-2 rounded-xl bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-40">
          <CheckCircle2 className="w-3.5 h-3.5" /> 2. Aplicar correcciones
        </button>
        {ultimaCorrida && (
          <button disabled={ocupado} onClick={revertir} className="px-3 py-2 rounded-xl bg-white border border-rose-300 text-rose-700 text-xs font-bold flex items-center gap-1.5 disabled:opacity-50">
            <RotateCcw className="w-3.5 h-3.5" /> Devolver la última corrección
          </button>
        )}
      </div>
      {revisado && !!res?.cambiados && (
        <label className="flex items-start gap-2 text-xs text-slate-700">
          <input type="checkbox" checked={confirma} onChange={e => setConfirma(e.target.checked)} className="mt-0.5" />
          <span>Entiendo que se modificarán {res.cambiados} registros en la base de datos real (con respaldo para devolverlos).</span>
        </label>
      )}
      {avance && <p className="text-xs text-indigo-700 font-semibold animate-pulse">{avance}</p>}
      {error && <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">{error}</p>}
      {mensaje && <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2">{mensaje}</p>}
      {res && (
        <div className="text-xs space-y-2 bg-slate-50 border border-slate-200 rounded-xl p-3">
          <p className="font-bold text-slate-900">
            {modoRes === 'revision' ? 'Revisión terminada' : 'Corrección aplicada'}: {res.revisados.toLocaleString('es-CL')} registros revisados,{' '}
            <span className={res.cambiados ? 'text-amber-700' : 'text-emerald-700'}>
              {res.cambiados.toLocaleString('es-CL')} {modoRes === 'revision' ? 'necesitan corrección' : 'corregidos'}
            </span>.
          </p>
          {Object.keys(res.porColeccion).length > 0 && (
            <p className="text-slate-600">Por tipo: {Object.entries(res.porColeccion).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} (${n})`).join(' · ')}</p>
          )}
          {res.raros.length > 0 && (
            <p className="text-amber-800 flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>Valores que no parecen un RUT y quedaron sin tocar (revisar a mano): {res.raros.slice(0, 15).join(' · ')}</span></p>
          )}
          {fallidos.length > 0 && (
            <p className="text-rose-700">No se pudieron revisar {fallidos.length} partes: {fallidos.slice(0, 3).join(' | ')}. Vuelve a intentar antes de aplicar.</p>
          )}
        </div>
      )}
    </div>
  );
}
