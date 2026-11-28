/**
 * Indicadores previsionales oficiales de Previred para TODO el sistema.
 * Lee https://www.previred.com/indicadores-previsionales/ (mes vigente), los interpreta y los guarda en
 * Firestore `previsionalIndicators/{AAAA-MM}` (colección global, la usan todas las empresas).
 * - GET  /api/previred/indicadores          → lee, guarda y devuelve los valores (lo llama el cron diario y la app).
 * - GET  /api/previred/indicadores?soloVer=1 → sólo lee y devuelve (no guarda).
 * Es autocontenido (sin imports relativos) como las demás funciones de /api.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const firebaseConfig = {
  projectId: process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0478013396',
  firestoreDatabaseId: process.env.FIREBASE_DATABASE_ID || 'ai-studio-gestor-0fa27d4a-5ce2-4999-afdb-eb28b01c6d8d',
};
function initAdmin() {
  if (getApps().length) return getApps()[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) {
    try { return initializeApp({ projectId: firebaseConfig.projectId, credential: cert(JSON.parse(raw)) }); }
    catch (e) { console.error('FIREBASE_SERVICE_ACCOUNT invalida:', (e as Error).message); }
  }
  return initializeApp({ projectId: firebaseConfig.projectId });
}

const URL_PREVIRED = 'https://www.previred.com/indicadores-previsionales/';
const MESES: Record<string, number> = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };

/** "41.439,89" → 41439.89 ; "0.90" → 0.9 ; "1,79" → 1.79 */
export const numCL = (t: string): number => {
  const s = String(t || '').trim().replace(/\s|\$|%/g, '');
  if (!s) return NaN;
  if (s.includes(',')) return Number(s.replace(/\./g, '').replace(',', '.'));
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ''));
  return Number(s);
};

/** HTML → texto plano en una línea por celda/fila. */
export const htmlATexto = (html: string) => String(html || '')
  .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<\/(td|th|tr|p|div|li|h\d)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#8211;|&ndash;/g, '–').replace(/&#8217;/g, "'").replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í').replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú').replace(/&ntilde;/g, 'ñ').replace(/&Aacute;/g, 'Á').replace(/&Iacute;/g, 'Í').replace(/&Oacute;/g, 'Ó')
  .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n');

export interface IndicadoresPrevired {
  period: string; uf: number; ufFecha: string; ufMesAnterior?: number; utm: number; uta?: number; imm: number;
  rentaMinimaMenores18Mayores65?: number; rentaMinimaCasaParticular?: number; rentaMinimaNoRemuneracional?: number;
  topeImponibleAfpUf: number; topeImponibleIpsUf?: number; topeImponibleAfcUf: number;
  tasaSisPercent: number; rentabilidadProtegidaPercent?: number; expectativaVidaPercent?: number;
  afpCommissions: Record<string, number>; afpEmpleadorPercent?: Record<string, number>;
  afc?: { indefinidoEmpleador: number; indefinidoTrabajador: number; plazoFijoEmpleador: number; indefinido11Empleador: number; casaParticularEmpleador: number };
  tramosAsignacionFamiliar?: { tramoA: number; tramoB: number; tramoC: number; tramoD: number; limiteA: number; limiteB: number; limiteC: number };
  topeApvMensualUf?: number; topeApvAnualUf?: number; topeDepositoConvenidoUf?: number;
  faltantes: string[];
}

export function interpretarPrevired(html: string): IndicadoresPrevired {
  const t = htmlATexto(html);
  const faltantes: string[] = [];
  const m = (re: RegExp) => t.match(re);
  // UF: la primera fecha "Al DD de Mes del AAAA: $ x" es el último día del mes de remuneraciones
  const ufs = [...t.matchAll(/Al\s+(\d{1,2})\s+de\s+([A-Za-zÁÉÍÓÚáéíóú]+)\s+(?:del?\s+)?(\d{4})\s*:?\s*\$?\s*([\d.]+,\d{1,2})/gi)];
  let period = ''; let uf = NaN; let ufFecha = ''; let ufMesAnterior: number | undefined;
  if (ufs.length) {
    const [_, d, mesTxt, y, val] = ufs[0];
    const mes = MESES[mesTxt.toLowerCase()];
    if (mes) { period = `${y}-${String(mes).padStart(2, '0')}`; ufFecha = `${y}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }
    uf = numCL(val);
    if (ufs[1]) ufMesAnterior = numCL(ufs[1][4]);
  } else faltantes.push('UF');
  // UTM y UTA: "Noviembre 2026 $ 72.440 $ 869.280"
  const mu = m(/(Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre)\s+(\d{4})\s*\$\s*([\d.]+)\s*\$\s*([\d.]+)/i);
  const utm = mu ? numCL(mu[3]) : NaN; const uta = mu ? numCL(mu[4]) : undefined;
  if (!mu) faltantes.push('UTM');
  if (!period && mu) period = `${mu[2]}-${String(MESES[mu[1].toLowerCase()]).padStart(2, '0')}`;
  const topeAfp = m(/afiliados a una AFP\s*\(\s*([\d.,]+)\s*UF\s*\)/i);
  const topeIps = m(/IPS[^(\n]*\(ex INP\)\s*\(\s*([\d.,]+)\s*UF\s*\)/i);
  const topeAfc = m(/Seguro de Cesant[ií]a\s*\(\s*([\d.,]+)\s*UF\s*\)/i);
  if (!topeAfp) faltantes.push('Tope AFP'); if (!topeAfc) faltantes.push('Tope AFC');
  const imm = m(/Dependientes e Independientes\s*:?\s*\$\s*([\d.]+)/i);
  if (!imm) faltantes.push('Renta mínima');
  const menores = m(/Menores de 18 y Mayores de 65\s*:?\s*\$\s*([\d.]+)/i);
  const casa = m(/Casa Particular\s*:\s*\$\s*([\d.]+)/i);
  const noRem = m(/fines no remuneracionales\s*:?\s*\$\s*([\d.]+)/i);
  const sis = m(/\(SIS\)[^\d]{0,20}([\d]+[.,]\d+)\s*%/i);
  if (!sis) faltantes.push('SIS');
  const rentab = m(/Rentabilidad Protegida\s*([\d]+[.,]\d+)\s*%/i);
  const expect = m(/Expectativa de Vida\s*([\d]+[.,]\d+)\s*%/i);
  // Tasas AFP: "Capital 11,44% 0,1% 11,54%"
  const AFPS: Record<string, string> = { CAPITAL: 'Capital', CUPRUM: 'Cuprum', HABITAT: 'Habitat', PLANVITAL: 'PlanVital', PROVIDA: 'ProVida', MODELO: 'Modelo', UNO: 'Uno' };
  const afpCommissions: Record<string, number> = {}; const afpEmpleadorPercent: Record<string, number> = {};
  for (const [k, nombre] of Object.entries(AFPS)) {
    const r = t.match(new RegExp(`\\n\\s*${nombre}\\s+([\\d]+[.,]\\d+)\\s*%\\s*([\\d]+[.,]?\\d*)\\s*%`, 'i'));
    if (r) { afpCommissions[k] = numCL(r[1]); afpEmpleadorPercent[k] = numCL(r[2]); } else faltantes.push(`AFP ${nombre}`);
  }
  // Seguro de cesantía
  const afcInd = m(/Plazo Indefinido\s+([\d]+[.,]\d+)\s*%\s*R\.?I\.?\s*([\d]+[.,]\d+)\s*%/i);
  const afcFijo = m(/Plazo Fijo\s+([\d]+[.,]\d+)\s*%/i);
  const afc11 = m(/11 años o más[^\d]*([\d]+[.,]\d+)\s*%/i);
  const afcCasa = m(/Casa Particular\s*\(\*+\)\s*([\d]+[.,]\d+)\s*%/i);
  // Asignación familiar: "1 (A) $ 22.601 Renta < ó = $ 649.039"
  const ta = m(/\(A\)\s*\$\s*([\d.]+)[^$]*\$\s*([\d.]+)/);
  const tb = m(/\(B\)\s*\$\s*([\d.]+)[^$]*\$\s*[\d.]+[^$]*\$\s*([\d.]+)/);
  const tc = m(/\(C\)\s*\$\s*([\d.]+)[^$]*\$\s*[\d.]+[^$]*\$\s*([\d.]+)/);
  const apvM = m(/Tope Mensual\s*\(\s*([\d.,]+)\s*UF/i); const apvA = m(/Tope Anual\s*\(\s*([\d.,]+)\s*UF/i);
  const dep = m(/Dep[oó]sito Convenido[\s\S]{0,80}?\(\s*([\d.,]+)\s*UF/i);
  return {
    period, uf, ufFecha, ufMesAnterior, utm, uta, imm: imm ? numCL(imm[1]) : NaN,
    rentaMinimaMenores18Mayores65: menores ? numCL(menores[1]) : undefined,
    rentaMinimaCasaParticular: casa ? numCL(casa[1]) : undefined,
    rentaMinimaNoRemuneracional: noRem ? numCL(noRem[1]) : undefined,
    topeImponibleAfpUf: topeAfp ? numCL(topeAfp[1]) : NaN, topeImponibleIpsUf: topeIps ? numCL(topeIps[1]) : undefined,
    topeImponibleAfcUf: topeAfc ? numCL(topeAfc[1]) : NaN,
    tasaSisPercent: sis ? numCL(sis[1]) : NaN,
    rentabilidadProtegidaPercent: rentab ? numCL(rentab[1]) : undefined, expectativaVidaPercent: expect ? numCL(expect[1]) : undefined,
    afpCommissions, afpEmpleadorPercent,
    afc: afcInd ? { indefinidoEmpleador: numCL(afcInd[1]), indefinidoTrabajador: numCL(afcInd[2]), plazoFijoEmpleador: afcFijo ? numCL(afcFijo[1]) : 3, indefinido11Empleador: afc11 ? numCL(afc11[1]) : 0.8, casaParticularEmpleador: afcCasa ? numCL(afcCasa[1]) : 3 } : undefined,
    tramosAsignacionFamiliar: ta && tb && tc ? { tramoA: numCL(ta[1]), limiteA: numCL(ta[2]), tramoB: numCL(tb[1]), limiteB: numCL(tb[2]), tramoC: numCL(tc[1]), limiteC: numCL(tc[2]), tramoD: 0 } : undefined,
    topeApvMensualUf: apvM ? numCL(apvM[1]) : undefined, topeApvAnualUf: apvA ? numCL(apvA[1]) : undefined, topeDepositoConvenidoUf: dep ? numCL(dep[1]) : undefined,
    faltantes,
  };
}

const sinUndefined = (o: any) => JSON.parse(JSON.stringify(o, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? undefined : v)));

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const responder = (code: number, payload: any) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(payload)); };
  if (req.method !== 'GET' && req.method !== 'POST') return responder(405, { ok: false, error: 'Método no permitido' });
  const soloVer = /[?&]soloVer=1/.test(req.url || '');
  let html = '';
  try {
    const r = await fetch(URL_PREVIRED, { headers: { 'User-Agent': 'Mozilla/5.0 (Gest_OK indicadores)', Accept: 'text/html' } });
    if (!r.ok) return responder(502, { ok: false, error: `Previred respondió ${r.status}` });
    html = await r.text();
  } catch (e: any) {
    return responder(502, { ok: false, error: `No se pudo leer Previred: ${e?.message || e}` });
  }
  const ind = interpretarPrevired(html);
  const esenciales = ['UF', 'UTM', 'Tope AFP', 'Tope AFC', 'Renta mínima', 'SIS'];
  const faltaEsencial = ind.faltantes.filter(f => esenciales.includes(f));
  if (!ind.period || faltaEsencial.length) return responder(422, { ok: false, error: `No se pudo interpretar la página de Previred (falta: ${faltaEsencial.join(', ') || 'período'}).`, indicadores: sinUndefined(ind) });
  if (soloVer) return responder(200, { ok: true, guardado: false, indicadores: sinUndefined(ind) });
  try {
    const db = getFirestore(initAdmin(), firebaseConfig.firestoreDatabaseId as any);
    const ref = db.collection('previsionalIndicators').doc(ind.period);
    const previo = await ref.get();
    // Si un Super Admin corrigió a mano el mes, no se pisa
    if (previo.exists && (previo.data() as any)?.fuente === 'manual') return responder(200, { ok: true, guardado: false, motivo: 'El mes tiene valores fijados a mano por el Super Admin.', indicadores: sinUndefined(ind) });
    const datos: any = sinUndefined({
      period: ind.period, uf: ind.uf, utm: ind.utm, imm: ind.imm,
      topeImponibleAfpUf: ind.topeImponibleAfpUf, topeImponibleAfcUf: ind.topeImponibleAfcUf, tasaSisPercent: ind.tasaSisPercent,
      afpCommissions: Object.keys(ind.afpCommissions).length === 7 ? ind.afpCommissions : undefined,
      tramosAsignacionFamiliar: ind.tramosAsignacionFamiliar,
      previred: { ...ind, faltantes: ind.faltantes },
      fuente: 'previred.com', leidoEn: new Date().toISOString(),
    });
    await ref.set({ ...datos, actualizadoEn: FieldValue.serverTimestamp() }, { merge: true });
    return responder(200, { ok: true, guardado: true, indicadores: sinUndefined(ind) });
  } catch (e: any) {
    return responder(500, { ok: false, error: `Leído pero no guardado: ${e?.message || e}`, indicadores: sinUndefined(ind) });
  }
}
