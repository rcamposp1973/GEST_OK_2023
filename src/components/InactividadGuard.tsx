import React, { useEffect, useState } from 'react';
import {
  STORAGE_KEY, MAX_INACTIVIDAD_MIN, MIN_INACTIVIDAD_MIN, EVENTO_AVISO_INACTIVIDAD,
  claveMinutosInactividad, leerMinutosInactividad,
} from '../utils/useCrossTabSessionSync';

/**
 * Aviso y configuración del cierre de sesión por inactividad (el control del tiempo lo hace useCrossTabSessionSync).
 * Cada usuario elige entre 5 y 60 minutos; más de 60 no se permite.
 */
export const EVENTO_CONFIG_INACTIVIDAD = 'gestok:config-inactividad';
export const abrirConfigInactividad = () => window.dispatchEvent(new Event(EVENTO_CONFIG_INACTIVIDAD));

const marcarActividad = () => { try { localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch { /* sin almacenamiento */ } };

export default function InactividadGuard({ uid, onLogout }: { uid: string; onLogout: () => void }) {
  const [aviso, setAviso] = useState<number | null>(null);
  const [config, setConfig] = useState(false);
  const [borrador, setBorrador] = useState(() => leerMinutosInactividad(uid));

  useEffect(() => {
    const onAviso = (e: Event) => { const s = Number((e as CustomEvent).detail); setAviso(s > 0 ? s : null); };
    const abrir = () => { setBorrador(leerMinutosInactividad(uid)); setConfig(true); };
    window.addEventListener(EVENTO_AVISO_INACTIVIDAD, onAviso);
    window.addEventListener(EVENTO_CONFIG_INACTIVIDAD, abrir);
    return () => { window.removeEventListener(EVENTO_AVISO_INACTIVIDAD, onAviso); window.removeEventListener(EVENTO_CONFIG_INACTIVIDAD, abrir); };
  }, [uid]);

  // Cuenta regresiva visible entre revisiones
  useEffect(() => {
    if (aviso === null) return;
    const t = window.setTimeout(() => setAviso(a => (a !== null && a > 1 ? a - 1 : a)), 1000);
    return () => window.clearTimeout(t);
  }, [aviso]);

  const guardar = () => {
    const n = Math.max(MIN_INACTIVIDAD_MIN, Math.min(MAX_INACTIVIDAD_MIN, Math.round(borrador) || 30));
    try { localStorage.setItem(claveMinutosInactividad(uid), String(n)); } catch { /* sin almacenamiento */ }
    marcarActividad();
    setConfig(false);
  };

  return (
    <>
      {aviso !== null && !config && (
        <div className="fixed inset-0 z-[200] bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5 text-center space-y-3">
            <h3 className="text-base font-bold text-slate-900">¿Sigues ahí?</h3>
            <p className="text-sm text-slate-600">Por inactividad, tu sesión se cerrará en <strong className="font-mono">{aviso}</strong> segundos.</p>
            <div className="flex justify-center gap-2">
              <button onClick={() => { marcarActividad(); setAviso(null); }} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-bold">Seguir conectado</button>
              <button onClick={onLogout} className="px-4 py-2 rounded-lg border border-slate-300 text-sm">Cerrar sesión</button>
            </div>
          </div>
        </div>
      )}
      {config && (
        <div className="fixed inset-0 z-[200] bg-slate-900/40 flex items-center justify-center p-4" onClick={() => setConfig(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-slate-900">Cierre de sesión por inactividad</h3>
            <p className="text-xs text-slate-600">Si no usas Gest_OK durante este tiempo, la sesión se cierra sola para proteger la información. Elige entre {MIN_INACTIVIDAD_MIN} y {MAX_INACTIVIDAD_MIN} minutos; más de {MAX_INACTIVIDAD_MIN} no se permite.</p>
            <div className="flex items-center gap-3">
              <input type="range" min={MIN_INACTIVIDAD_MIN} max={MAX_INACTIVIDAD_MIN} step={5} value={borrador} onChange={e => setBorrador(Number(e.target.value))} className="flex-1 accent-indigo-600" />
              <span className="w-20 text-right font-mono font-bold text-slate-900">{borrador} min</span>
            </div>
            <p className="text-[11px] text-slate-500">Se guarda en este navegador. La actividad en cualquier pestaña de Gest_OK cuenta para todas. Un minuto antes del cierre aparece un aviso.</p>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setConfig(false)} className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold">Cancelar</button>
              <button onClick={guardar} className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold">Guardar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
