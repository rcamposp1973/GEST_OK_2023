import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { auth, db } from '../lib/firebase';
import {
  collection, collectionGroup, documentId, getCountFromServer, getDocs, limit, orderBy, query, where,
} from 'firebase/firestore';
import { Study, AuditLog } from '../types';
import {
  Activity, Building2, Users, Briefcase, RefreshCw, Search, X, Key, Eye, EyeOff, CheckCircle2, AlertTriangle, XCircle,
} from 'lucide-react';
import JuniorAITrainingCenter from './JuniorAITrainingCenter';
import { APP_VERSION_FULL } from '../constants/version';

/**
 * Panel de control del Super Administrador.
 * Pensado para teléfono y para gastar poco: NO consulta automáticamente. Carga una vez al abrir
 * (o desde una copia guardada de hasta 10 minutos) y solo vuelve a consultar al pulsar "Actualizar".
 * Los totales usan consultas de conteo (1 lectura cada 1.000 registros) en vez de leer todos los documentos.
 */

interface Props { onSelectStudy?: (study: Study) => void }

type Estado = 'ok' | 'aviso' | 'error';
interface Chequeo { id: string; nombre: string; estado: Estado; detalle: string }
interface Panel {
  cargadoEn: number;
  estudios: (Study & { empresas: number })[];
  totales: { estudios: number; empresas: number; usuarios: number; superAdmins: number };
  actividad: { hoy: number; semana: number; mes: number };
  ultimo: { quien: string; cuando: string; que: string } | null;
  chequeos: Chequeo[];
}

const CACHE_KEY = 'gest_ok_panel_super_v2';
const CACHE_MIN = 10;
const fmt = (n: number) => n.toLocaleString('es-CL');

function hace(ms: number) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'hace un momento';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`;
}
const cuandoTxt = (iso: string) => {
  const t = new Date(iso);
  return isNaN(t.getTime()) ? iso : t.toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

async function cargarPanel(): Promise<Panel> {
  const chequeos: Chequeo[] = [];
  const t0 = performance.now();

  // Estudios (pocos documentos) + empresas por estudio con conteo
  const estSnap = await getDocs(collection(db, 'studies'));
  const msBase = Math.round(performance.now() - t0);
  chequeos.push({ id: 'bd', nombre: 'Base de datos', estado: msBase > 4000 ? 'aviso' : 'ok', detalle: `Responde en ${fmt(msBase)} ms` });

  const estudios = await Promise.all(estSnap.docs.map(async d => {
    let empresas = 0;
    try { empresas = (await getCountFromServer(collection(db, 'studies', d.id, 'companies'))).data().count; } catch { /* sin acceso */ }
    return { id: d.id, ...(d.data() as any), empresas } as Study & { empresas: number };
  }));

  const cnt = async (q: any) => { try { return (await getCountFromServer(q)).data().count as number; } catch { return 0; } };
  const hoyIni = new Date(); hoyIni.setHours(0, 0, 0, 0);
  const desde = (dias: number) => new Date(Date.now() - dias * 86400000).toISOString();
  const [empresas, usuarios, superAdmins, hoy, semana, mes] = await Promise.all([
    cnt(collectionGroup(db, 'companies')),
    cnt(collectionGroup(db, 'users')),
    cnt(collection(db, 'superUsers')),
    cnt(query(collection(db, 'auditLogs'), where('timestamp', '>=', hoyIni.toISOString()))),
    cnt(query(collection(db, 'auditLogs'), where('timestamp', '>=', desde(7)))),
    cnt(query(collection(db, 'auditLogs'), where('timestamp', '>=', desde(30)))),
  ]);

  let ultimo: Panel['ultimo'] = null;
  try {
    const s = await getDocs(query(collection(db, 'auditLogs'), orderBy('timestamp', 'desc'), limit(1)));
    const l = s.docs[0]?.data() as AuditLog | undefined;
    if (l) ultimo = { quien: l.userEmail || '—', cuando: l.timestamp, que: `${l.action} · ${l.module}` };
  } catch { /* sin registros */ }

  // Servidor
  try {
    const t = performance.now();
    const r = await fetch('/api/health', { cache: 'no-store' });
    const ms = Math.round(performance.now() - t);
    chequeos.push(r.ok
      ? { id: 'srv', nombre: 'Servidor', estado: ms > 4000 ? 'aviso' : 'ok', detalle: `Responde en ${fmt(ms)} ms` }
      : { id: 'srv', nombre: 'Servidor', estado: 'error', detalle: `Respondió con error ${r.status}` });
  } catch (e: any) {
    chequeos.push({ id: 'srv', nombre: 'Servidor', estado: 'error', detalle: 'No responde' });
  }

  // Sesión
  try {
    const tk = await auth.currentUser?.getIdTokenResult();
    chequeos.push(tk
      ? { id: 'auth', nombre: 'Sesión', estado: 'ok', detalle: `${auth.currentUser?.email || 'usuario'} (${(tk.claims as any).role || 'sin rol en la sesión'})` }
      : { id: 'auth', nombre: 'Sesión', estado: 'error', detalle: 'Sin sesión activa' });
  } catch { chequeos.push({ id: 'auth', nombre: 'Sesión', estado: 'error', detalle: 'No se pudo verificar' }); }

  // Indicadores UF / dólar: fecha del último publicado
  try {
    const s = await getDocs(query(collection(db, 'globalExchangeRates'), orderBy(documentId(), 'desc'), limit(1)));
    const d = s.docs[0];
    if (!d) chequeos.push({ id: 'ind', nombre: 'Indicadores UF/dólar', estado: 'error', detalle: 'No hay valores publicados' });
    else {
      const fecha = ((d.data() as any).date || d.id) as string;
      const dias = Math.floor((Date.now() - new Date(fecha + 'T12:00:00').getTime()) / 86400000);
      chequeos.push({ id: 'ind', nombre: 'Indicadores UF/dólar', estado: dias > 4 ? 'error' : dias > 2 ? 'aviso' : 'ok', detalle: `Último valor: ${fecha}${dias > 0 ? ` (${dias} d atrás)` : ''}` });
    }
  } catch { chequeos.push({ id: 'ind', nombre: 'Indicadores UF/dólar', estado: 'error', detalle: 'No se pudo leer' }); }

  // Clave del gateway SII (se guarda en este equipo)
  let clave = false;
  try { clave = !!localStorage.getItem('gest_ok_master_api_key'); } catch { /* sin acceso */ }
  chequeos.push({ id: 'sii', nombre: 'Clave API del SII (este equipo)', estado: clave ? 'ok' : 'aviso', detalle: clave ? 'Configurada en este navegador' : 'No configurada en este navegador' });

  return {
    cargadoEn: Date.now(), estudios,
    totales: { estudios: estudios.length, empresas, usuarios, superAdmins },
    actividad: { hoy, semana, mes }, ultimo, chequeos,
  };
}

const COLOR: Record<Estado, string> = {
  ok: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  aviso: 'bg-amber-50 border-amber-300 text-amber-900',
  error: 'bg-rose-50 border-rose-300 text-rose-900',
};

export default function SuperAdminSystemMonitor({ onSelectStudy }: Props) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'resumen' | 'estudios' | 'actividad' | 'sii' | 'asistente'>('resumen');
  const [busca, setBusca] = useState('');
  const [logs, setLogs] = useState<AuditLog[] | null>(null);
  const [cargandoLogs, setCargandoLogs] = useState(false);
  const [claveSii, setClaveSii] = useState(() => { try { return localStorage.getItem('gest_ok_master_api_key') || ''; } catch { return ''; } });
  const [verClave, setVerClave] = useState(false);
  const [claveOk, setClaveOk] = useState(false);
  const [prueba, setPrueba] = useState<{ estado: 'enviando' | 'ok' | 'error'; texto: string } | null>(null);

  const cargar = useCallback(async (forzar: boolean) => {
    if (!forzar) {
      try {
        const c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null') as Panel | null;
        if (c && Date.now() - c.cargadoEn < CACHE_MIN * 60000) { setPanel(c); return; }
      } catch { /* sin copia */ }
    }
    setCargando(true); setError('');
    try {
      const p = await cargarPanel();
      setPanel(p);
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(p)); } catch { /* sin espacio */ }
      setLogs(null);
    } catch (e: any) {
      setError(e?.message || 'No se pudo cargar el panel');
    } finally { setCargando(false); }
  }, []);

  useEffect(() => { cargar(false); }, [cargar]);

  // La actividad detallada se lee solo al abrir esa pestaña (20 registros) o al pedir más
  const cargarLogs = async (cuantos: number) => {
    setCargandoLogs(true);
    try {
      const s = await getDocs(query(collection(db, 'auditLogs'), orderBy('timestamp', 'desc'), limit(cuantos)));
      setLogs(s.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as AuditLog[]);
    } catch (e: any) { setError(e?.message || 'No se pudo leer la actividad'); }
    finally { setCargandoLogs(false); }
  };
  useEffect(() => { if (tab === 'actividad' && logs === null) cargarLogs(20); }, [tab]); // eslint-disable-line

  const estudiosFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (panel?.estudios || []).filter(s => !q || (s.name || '').toLowerCase().includes(q) || (s.rut || '').toLowerCase().includes(q));
  }, [panel, busca]);

  const porModulo = useMemo(() => {
    const m: Record<string, number> = {};
    (logs || []).forEach(l => { m[l.module || 'OTROS'] = (m[l.module || 'OTROS'] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [logs]);

  const enviarPrueba = async () => {
    setPrueba({ estado: 'enviando', texto: 'Enviando…' });
    try {
      const token = await auth.currentUser?.getIdToken();
      const r = await fetch('/api/alertas/prueba', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const j = await r.json().catch(() => ({}));
      setPrueba(r.ok && j.ok
        ? { estado: 'ok', texto: j.alertas?.length ? `Correo enviado con ${j.alertas.length} alerta(s).` : 'Correo enviado: sin alertas, todo en orden.' }
        : { estado: 'error', texto: j.error || `No se pudo enviar (error ${r.status}).` });
    } catch (e: any) { setPrueba({ estado: 'error', texto: e?.message || 'No se pudo enviar.' }); }
  };

  const problemas = (panel?.chequeos || []).filter(c => c.estado !== 'ok');
  const TABS: { id: typeof tab; t: string }[] = [
    { id: 'resumen', t: 'Resumen' }, { id: 'estudios', t: 'Estudios' }, { id: 'actividad', t: 'Actividad' },
    { id: 'sii', t: 'Clave SII' }, { id: 'asistente', t: 'Asistente IA' },
  ];

  const Kpi = ({ icon, n, t, sub }: { icon: React.ReactNode; n: number; t: string; sub?: string }) => (
    <div className="bg-white border border-slate-200 rounded-2xl p-3.5">
      <div className="flex items-center gap-2 text-slate-500 text-[11px] font-bold uppercase">{icon}{t}</div>
      <div className="text-2xl font-extrabold text-slate-900 mt-1">{fmt(n)}</div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </div>
  );

  return (
    <div className="space-y-3 pb-24">
      {/* Cabecera */}
      <div className="bg-slate-900 text-white rounded-2xl p-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-extrabold leading-tight">Panel de control</h2>
          <p className="text-[11px] text-slate-300 truncate">
            {APP_VERSION_FULL} · {panel ? `datos de ${hace(panel.cargadoEn)}` : 'cargando…'}
          </p>
        </div>
        <button onClick={() => cargar(true)} disabled={cargando}
          className="shrink-0 min-h-11 px-4 rounded-xl bg-white text-slate-900 text-sm font-bold flex items-center gap-2 disabled:opacity-60 active:scale-95">
          <RefreshCw className={`w-4 h-4 ${cargando ? 'animate-spin' : ''}`} /> Actualizar
        </button>
      </div>

      {error && <div className="bg-rose-50 border border-rose-300 text-rose-900 text-xs rounded-xl p-3 font-semibold">{error}</div>}

      {/* Pestañas: desplazables, fáciles de tocar */}
      <div className="sticky top-0 z-10 -mx-1 px-1 py-1 bg-slate-100/95 backdrop-blur overflow-x-auto">
        <div className="flex gap-1.5 w-max">
          {TABS.map(x => (
            <button key={x.id} onClick={() => setTab(x.id)}
              className={`min-h-11 px-4 rounded-xl text-sm font-bold whitespace-nowrap ${tab === x.id ? 'bg-indigo-600 text-white' : 'bg-white text-slate-700 border border-slate-200'}`}>
              {x.t}
            </button>
          ))}
        </div>
      </div>

      {!panel && cargando && <div className="text-center text-sm text-slate-500 py-10">Cargando datos…</div>}

      {panel && tab === 'resumen' && (
        <>
          {/* Estado del sistema */}
          <div className={`rounded-2xl border p-3.5 ${problemas.length ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'}`}>
            <div className="flex items-center gap-2 font-extrabold text-sm">
              {problemas.length ? <AlertTriangle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
              {problemas.length ? `${problemas.length} punto(s) por revisar` : 'Todo en orden'}
            </div>
          </div>
          <div className="space-y-2">
            {panel.chequeos.map(c => (
              <div key={c.id} className={`border rounded-xl px-3.5 py-2.5 flex items-start gap-2.5 ${COLOR[c.estado]}`}>
                {c.estado === 'ok' ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : c.estado === 'aviso' ? <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> : <XCircle className="w-4 h-4 mt-0.5 shrink-0" />}
                <div className="min-w-0">
                  <div className="text-sm font-bold">{c.nombre}</div>
                  <div className="text-xs break-words">{c.detalle}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Totales */}
          <div className="grid grid-cols-2 gap-2.5">
            <Kpi icon={<Briefcase className="w-3.5 h-3.5" />} n={panel.totales.estudios} t="Estudios" sub={`${panel.estudios.filter(s => s.estado !== 'Sin Vigencia').length} vigentes`} />
            <Kpi icon={<Building2 className="w-3.5 h-3.5" />} n={panel.totales.empresas} t="Empresas" />
            <Kpi icon={<Users className="w-3.5 h-3.5" />} n={panel.totales.usuarios} t="Usuarios" sub={`+ ${panel.totales.superAdmins} super admin`} />
            <Kpi icon={<Activity className="w-3.5 h-3.5" />} n={panel.actividad.hoy} t="Acciones hoy" sub={`${fmt(panel.actividad.semana)} en 7 días · ${fmt(panel.actividad.mes)} en 30 días`} />
          </div>
          {panel.ultimo && (
            <div className="bg-white border border-slate-200 rounded-2xl p-3.5 text-xs text-slate-600">
              <b className="text-slate-800">Última acción:</b> {panel.ultimo.que} · {panel.ultimo.quien} · {cuandoTxt(panel.ultimo.cuando)}
            </div>
          )}
          <div className="bg-white border border-slate-200 rounded-2xl p-3.5 space-y-2">
            <div className="text-sm font-extrabold text-slate-900">Alertas por correo</div>
            <p className="text-xs text-slate-600">Cada día a las 9:00 (hora de Chile) el sistema revisa indicadores UF/dólar, estudios sin actividad por 7 días y estudios cerca de su límite de plan. Te escribe solo si hay algo por revisar.</p>
            <button onClick={enviarPrueba} disabled={prueba?.estado === 'enviando'} className="w-full min-h-11 rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-800 active:scale-[.99] disabled:opacity-60">Enviar correo de prueba</button>
            {prueba && <p className={`text-xs font-semibold ${prueba.estado === 'ok' ? 'text-emerald-700' : prueba.estado === 'error' ? 'text-rose-700' : 'text-slate-500'}`}>{prueba.texto}</p>}
          </div>
          <p className="text-[11px] text-slate-500 px-1">Los datos se consultan solo al abrir y al pulsar Actualizar; no se refrescan solos. Los totales usan conteos, que cuestan una fracción de leer cada registro.</p>
        </>
      )}

      {panel && tab === 'estudios' && (
        <>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar estudio o RUT"
              className="w-full min-h-11 pl-10 pr-10 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-indigo-500" />
            {busca && <button onClick={() => setBusca('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-400"><X className="w-4 h-4" /></button>}
          </div>
          {estudiosFiltrados.map(s => {
            const max = s.maxCompanies || 10;
            const pct = Math.min(100, Math.round((s.empresas / max) * 100));
            const vigente = s.estado !== 'Sin Vigencia';
            return (
              <div key={s.id} className="bg-white border border-slate-200 rounded-2xl p-3.5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-extrabold text-slate-900 break-words">{s.name}</div>
                    <div className="text-xs text-slate-500 font-mono">{s.rut || 'sin RUT'}</div>
                  </div>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${vigente ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>{vigente ? 'Vigente' : 'Sin vigencia'}</span>
                </div>
                <div>
                  <div className="flex justify-between text-xs text-slate-600 mb-1"><span>{s.empresas} de {max} empresas</span><span>{pct}%</span></div>
                  <div className="h-2 bg-slate-200 rounded-full overflow-hidden"><div className={`h-full ${pct >= 90 ? 'bg-rose-500' : pct >= 70 ? 'bg-amber-500' : 'bg-indigo-600'}`} style={{ width: `${pct}%` }} /></div>
                </div>
                {onSelectStudy && <button onClick={() => onSelectStudy(s)} className="w-full min-h-11 rounded-xl bg-indigo-50 text-indigo-700 text-sm font-bold active:scale-[.99]">Abrir estudio</button>}
              </div>
            );
          })}
          {estudiosFiltrados.length === 0 && <p className="text-center text-sm text-slate-400 py-8">{panel.estudios.length ? `Sin resultados para "${busca}".` : 'No hay estudios registrados.'}</p>}
        </>
      )}

      {tab === 'actividad' && (
        <>
          {cargandoLogs && <div className="text-center text-sm text-slate-500 py-6">Cargando…</div>}
          {logs && (
            <>
              {porModulo.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-2xl p-3.5">
                  <div className="text-xs font-bold text-slate-700 mb-2">Por módulo (últimos {logs.length} registros)</div>
                  <div className="flex flex-wrap gap-1.5">
                    {porModulo.map(([m, n]) => <span key={m} className="px-2 py-1 rounded-lg bg-slate-100 text-[11px] font-semibold text-slate-700">{m.replace(/_/g, ' ')} · {n}</span>)}
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                {logs.map(l => (
                  <div key={l.id} className="bg-white border border-slate-200 rounded-xl px-3 py-2">
                    <div className="flex justify-between gap-2 text-[11px] text-slate-500"><span className="font-bold text-slate-700">{l.action} · {(l.module || '').replace(/_/g, ' ')}</span><span>{cuandoTxt(l.timestamp)}</span></div>
                    <div className="text-xs text-slate-800 break-words">{l.details}</div>
                    <div className="text-[11px] text-slate-500 break-all">{l.userEmail}{l.companyName ? ` · ${l.companyName}` : ''}</div>
                  </div>
                ))}
                {logs.length === 0 && <p className="text-center text-sm text-slate-400 py-8">Sin registros de actividad.</p>}
              </div>
              {logs.length >= 20 && logs.length < 200 && (
                <button disabled={cargandoLogs} onClick={() => cargarLogs(logs.length + 50)} className="w-full min-h-11 rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-700">Cargar 50 más</button>
              )}
            </>
          )}
        </>
      )}

      {tab === 'sii' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
          <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2"><Key className="w-4 h-4 text-indigo-600" /> Clave API del SII</h3>
          <p className="text-xs text-slate-600">
            Esta clave se guarda <b>solo en este navegador</b>. No se comparte con los demás usuarios: la consulta automática del RCV funciona únicamente desde este equipo hasta que la clave se mueva al servidor (pendiente).
          </p>
          <div className="relative">
            <input type={verClave ? 'text' : 'password'} value={claveSii} onChange={e => { setClaveSii(e.target.value); setClaveOk(false); }}
              placeholder="Pega aquí la clave" autoComplete="off"
              className="w-full min-h-11 pl-3.5 pr-12 text-sm font-mono bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-indigo-500" />
            <button type="button" onClick={() => setVerClave(!verClave)} className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2.5 text-slate-500">
              {verClave ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <button onClick={() => { try { localStorage.setItem('gest_ok_master_api_key', claveSii.trim()); setClaveOk(true); } catch { setError('No se pudo guardar en este navegador'); } }}
            className="w-full min-h-11 rounded-xl bg-slate-900 text-white text-sm font-bold active:scale-[.99]">Guardar en este navegador</button>
          {claveOk && <p className="text-xs font-semibold text-emerald-700">Guardada en este navegador.</p>}
        </div>
      )}

      {tab === 'asistente' && <JuniorAITrainingCenter />}
    </div>
  );
}
