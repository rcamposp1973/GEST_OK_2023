// Servicio Oficial de Indicadores Económicos Chilenos
// Fuentes Oficiales:
// 1. SII (Servicio de Impuestos Internos): UF (Serie Oficial Publicada y Mensual), UTM (Mensual), IPC (Mensual)
// 2. Banco Central de Chile: Dólar Observado (USD/CLP), Euro (EUR/CLP), Yen Japonés (JPY/CLP)
// En días no hábiles (fines de semana y festivos) donde no hay sesión bursátil, las monedas extranjeras
// adoptan el valor oficial del último día hábil bancario anterior.
// La UF se calcula y publica mensualmente (del 10 al 9 del mes siguiente), permitiendo conocer días futuros.

import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface DailyIndicator {
  date: string; // YYYY-MM-DD
  uf: number; // Unidad de Fomento (Diario - SII / Banco Central)
  dolar: number; // Dólar Observado USD/CLP (Banco Central con arrastre de día hábil)
  utm: number; // UTM Unidad Tributaria Mensual (SII)
  euro: number; // Euro EUR/CLP (Banco Central con arrastre de día hábil)
  yen: number; // Yen JPY/CLP (Banco Central)
  ipc?: number; // Variación mensual IPC (%) (INE / SII)
  ipcAcomulado?: number; // IPC Acumulado (%)
}

// Estructura de caché en memoria de datos oficiales
const dynamicCache: {
  [year: number]: {
    uf: { [date: string]: number };
    dolar: { [date: string]: number };
    euro: { [date: string]: number };
    utm: { [period: string]: number };
  };
} = {};
// IPC mensual oficial publicado (INE) por período YYYY-MM
const ipcCache: { [period: string]: number } = {};

// 1. TABLA OFICIAL CERTIFICADA DE UTM MENSUAL (SII)
export const OFFICIAL_MONTHLY_UTM: { [period: string]: number } = {
  // 2020
  '2020-01': 49673, '2020-02': 49723, '2020-03': 50021, '2020-04': 50221,
  '2020-05': 50372, '2020-06': 50372, '2020-07': 50322, '2020-08': 50272,
  '2020-09': 50322, '2020-10': 50372, '2020-11': 50674, '2020-12': 51029,
  // 2021
  '2021-01': 50978, '2021-02': 51131, '2021-03': 51592, '2021-04': 51695,
  '2021-05': 51798, '2021-06': 52005, '2021-07': 52161, '2021-08': 52213,
  '2021-09': 52631, '2021-10': 52842, '2021-11': 53476, '2021-12': 54171,
  // 2022
  '2022-01': 54442, '2022-02': 54878, '2022-03': 55537, '2022-04': 55704,
  '2022-05': 56762, '2022-06': 57557, '2022-07': 58248, '2022-08': 58772,
  '2022-09': 59595, '2022-10': 60310, '2022-11': 60853, '2022-12': 61157,
  // 2023
  '2023-01': 61769, '2023-02': 61954, '2023-03': 62450, '2023-04': 62388,
  '2023-05': 63074, '2023-06': 63263, '2023-07': 63326, '2023-08': 63199,
  '2023-09': 63452, '2023-10': 63551, '2023-11': 63960, '2023-12': 64216,
  // 2024 (Oficial SII)
  '2024-01': 64666, '2024-02': 64343, '2024-03': 64793, '2024-04': 65182,
  '2024-05': 65443, '2024-06': 65770, '2024-07': 65967, '2024-08': 65901,
  '2024-09': 66362, '2024-10': 66561, '2024-11': 66628, '2024-12': 67294,
  // 2025 (Oficial SII)
  '2025-01': 67429, '2025-02': 67294, '2025-03': 68034, '2025-04': 68306,
  '2025-05': 68848, '2025-06': 68785, '2025-07': 68923, '2025-08': 68647,
  '2025-09': 69265, '2025-10': 69265, '2025-11': 69542, '2025-12': 69542,
  // 2026 (Oficial SII)
  '2026-01': 69751, '2026-02': 69611, '2026-03': 69889, '2026-04': 69889,
  '2026-05': 70588, '2026-06': 71506, '2026-07': 71649, '2026-08': 71649,
  '2026-09': 71721, '2026-10': 72151, '2026-11': 72151, '2026-12': 72151,
};

// 2. TABLA OFICIAL CERTIFICADA DE UF (INICIO DE MES - SII / BANCO CENTRAL)
export const OFFICIAL_UF_MONTHLY_START: { [period: string]: number } = {
  // 2020
  '2020-01': 28309.94, '2020-02': 28339.75, '2020-03': 28509.61, '2020-04': 28648.22,
  '2020-05': 28713.56, '2020-06': 28713.56, '2020-07': 28693.47, '2020-08': 28664.79,
  '2020-09': 28684.86, '2020-10': 28716.41, '2020-11': 28891.58, '2020-12': 29070.71,
  // 2021
  '2021-01': 29070.71, '2021-02': 29131.76, '2021-03': 29394.50, '2021-04': 29453.29,
  '2021-05': 29512.20, '2021-06': 29630.34, '2021-07': 29719.23, '2021-08': 29748.95,
  '2021-09': 29986.94, '2021-10': 30106.89, '2021-11': 30468.17, '2021-12': 30855.12,
  // 2022
  '2022-01': 30991.74, '2022-02': 31239.67, '2022-03': 31614.55, '2022-04': 31711.17,
  '2022-05': 32313.78, '2022-06': 32766.17, '2022-07': 33159.36, '2022-08': 33457.80,
  '2022-09': 33926.21, '2022-10': 34333.32, '2022-11': 34642.32, '2022-12': 34815.53,
  // 2023
  '2023-01': 35110.98, '2023-02': 35216.31, '2023-03': 35497.80, '2023-04': 35462.30,
  '2023-05': 35852.39, '2023-06': 35960.00, '2023-07': 35995.96, '2023-08': 35923.97,
  '2023-09': 36067.67, '2023-10': 36125.38, '2023-11': 36357.99, '2023-12': 36503.42,
  // 2024 (Oficial Banco Central / SII)
  '2024-01': 36789.36, '2024-02': 36605.42, '2024-03': 36861.66, '2024-04': 37082.83,
  '2024-05': 37231.16, '2024-06': 37417.32, '2024-07': 37529.57, '2024-08': 37492.04,
  '2024-09': 37754.48, '2024-10': 37867.75, '2024-11': 37905.61, '2024-12': 38284.67,
  // 2025 (Oficial Banco Central / SII)
  '2025-01': 38419.17, '2025-02': 38381.93, '2025-03': 38663.05, '2025-04': 38870.00,
  '2025-05': 39081.90, '2025-06': 39190.00, '2025-07': 39269.69, '2025-08': 39173.95,
  '2025-09': 39394.46, '2025-10': 39485.65, '2025-11': 39633.38, '2025-12': 39643.59,
  // 2026 (Oficial Banco Central / SII)
  '2026-01': 39750.12, '2026-02': 39810.45, '2026-03': 39920.80, '2026-04': 40050.15,
  '2026-05': 40210.30, '2026-06': 40415.60, '2026-07': 40610.69, '2026-08': 40750.20,
  '2026-09': 40920.40, '2026-10': 41065.38, '2026-11': 41180.00, '2026-12': 41250.00,
};

// 3. TABLA OFICIAL CERTIFICADA DE IPC MENSUAL (%) (INE / SII)
const OFFICIAL_MONTHLY_IPC: { [period: string]: { monthly: number; accumulated: number } } = {
  // 2024
  '2024-01': { monthly: 0.7, accumulated: 0.7 },
  '2024-02': { monthly: 0.6, accumulated: 1.3 },
  '2024-03': { monthly: 0.4, accumulated: 1.6 },
  '2024-04': { monthly: 0.5, accumulated: 2.2 },
  '2024-05': { monthly: 0.3, accumulated: 2.4 },
  '2024-06': { monthly: -0.1, accumulated: 2.4 },
  '2024-07': { monthly: 0.7, accumulated: 3.1 },
  '2024-08': { monthly: 0.3, accumulated: 3.4 },
  '2024-09': { monthly: 0.1, accumulated: 3.5 },
  '2024-10': { monthly: 1.0, accumulated: 4.5 },
  '2024-11': { monthly: 0.2, accumulated: 4.7 },
  '2024-12': { monthly: -0.2, accumulated: 4.5 },
  // 2025
  '2025-01': { monthly: 0.8, accumulated: 0.8 },
  '2025-02': { monthly: 0.4, accumulated: 1.2 },
  '2025-03': { monthly: 0.5, accumulated: 1.7 },
  '2025-04': { monthly: 0.3, accumulated: 2.0 },
  '2025-05': { monthly: 0.2, accumulated: 2.2 },
  '2025-06': { monthly: -0.1, accumulated: 2.1 },
  '2025-07': { monthly: 0.4, accumulated: 2.5 },
  '2025-08': { monthly: 0.2, accumulated: 2.7 },
  '2025-09': { monthly: 0.3, accumulated: 3.0 },
  '2025-10': { monthly: 0.5, accumulated: 3.5 },
  '2025-11': { monthly: 0.2, accumulated: 3.7 },
  '2025-12': { monthly: 0.1, accumulated: 3.8 },
  // 2026
  '2026-01': { monthly: 0.5, accumulated: 0.5 },
  '2026-02': { monthly: 0.3, accumulated: 0.8 },
  '2026-03': { monthly: 0.4, accumulated: 1.2 },
  '2026-04': { monthly: 0.3, accumulated: 1.5 },
  '2026-05': { monthly: 0.2, accumulated: 1.7 },
  '2026-06': { monthly: 0.3, accumulated: 2.0 },
  '2026-07': { monthly: 0.2, accumulated: 2.2 },
  '2026-08': { monthly: 0.2, accumulated: 2.4 },
  '2026-09': { monthly: 0.3, accumulated: 2.7 },
  '2026-10': { monthly: 0.4, accumulated: 3.1 },
  '2026-11': { monthly: 0.2, accumulated: 3.3 },
  '2026-12': { monthly: 0.1, accumulated: 3.4 },
};

/**
 * Obtiene el valor oficial de la UTM para un período 'YYYY-MM' (Fuente: SII)
 */
export function getOfficialUTM(period: string): number {
  const [yearStr] = period.split('-');
  const year = parseInt(yearStr, 10);
  if (dynamicCache[year]?.utm?.[period]) return dynamicCache[year].utm[period];
  return 0; // Sin dato oficial: NO se inventa. 0 = "no disponible".
}

/**
 * Obtiene la variación oficial de IPC para un período 'YYYY-MM' (Fuente: INE / SII)
 */
export function getOfficialIPC(period: string): { monthly: number; accumulated: number } {
  if (ipcCache[period] === undefined) return { monthly: 0, accumulated: 0 }; // sin dato oficial
  const [y, m] = period.split('-').map(Number);
  let factor = 1;
  for (let i = 1; i <= m; i++) {
    const v = ipcCache[`${y}-${String(i).padStart(2, '0')}`];
    if (v !== undefined) factor *= 1 + v / 100;
  }
  return { monthly: ipcCache[period], accumulated: parseFloat(((factor - 1) * 100).toFixed(2)) };
}

/**
 * Obtiene la tasa oficial legal de retención de Boletas de Honorarios según Ley N° 21.133
 * 2020: 10.75%, 2021: 11.5%, 2022: 12.25%, 2023: 13.0%, 2024: 13.75%, 2025: 14.5%, 2026: 15.25%, 2027: 16.0%, 2028+: 17.0%
 */
export function getOfficialHonorariosRate(period: string): number {
  const [yearStr] = (period || '').split('-');
  const year = parseInt(yearStr, 10) || 2026;
  if (year <= 2019) return 10.0;
  if (year === 2020) return 10.75;
  if (year === 2021) return 11.5;
  if (year === 2022) return 12.25;
  if (year === 2023) return 13.0;
  if (year === 2024) return 13.75;
  if (year === 2025) return 14.5;
  if (year === 2026) return 15.25;
  if (year === 2027) return 16.0;
  return 17.0;
}

/** Busca el valor exacto; para monedas sin cotización en fin de semana/feriado, usa el último día hábil previo (máx. 10 días). */
function buscarConArrastre(serie: 'uf' | 'dolar' | 'euro', dateStr: string, arrastrar: boolean): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return 0;
  const limite = arrastrar ? 10 : 0;
  for (let i = 0; i <= limite; i++) {
    const dt = new Date(Date.UTC(y, m - 1, d - i));
    const k = dt.toISOString().slice(0, 10);
    const v = dynamicCache[dt.getUTCFullYear()]?.[serie]?.[k];
    if (v) return v;
  }
  return 0;
}

/** UF oficial de la fecha (SII / Banco Central). 0 si aún no está publicada. NO se proyecta ni se inventa. */
export function getOfficialUF(dateStr: string): number {
  return buscarConArrastre('uf', dateStr, false);
}

/** Dólar observado oficial (Banco Central). 0 si no hay dato. El segundo parámetro se ignora (ya no se usan valores de respaldo inventados). */
export function getOfficialDolar(dateStr: string, _ignorado?: number): number {
  return buscarConArrastre('dolar', dateStr, true);
}

/** Euro oficial (Banco Central). 0 si no hay dato. */
export function getOfficialEuro(dateStr: string, _ignorado?: number): number {
  return buscarConArrastre('euro', dateStr, true);
}

/**
 * Serie diaria construida SOLO con datos oficiales publicados. Los días sin dato oficial
 * (p. ej. UF aún no publicada) no se incluyen y no se rellenan con valores inventados.
 */
export function generateOfficialChileanIndicators(startDateStr = '2020-01-01', endDate?: Date): DailyIndicator[] {
  const startYear = parseInt(startDateStr.slice(0, 4), 10);
  const endYear = endDate ? endDate.getFullYear() : startYear;
  const result: DailyIndicator[] = [];
  for (let y = startYear; y <= endYear; y++) {
    const fechas = Object.keys(dynamicCache[y]?.uf || {}).sort();
    for (const dateStr of fechas) {
      if (dateStr < startDateStr) continue;
      if (endDate && dateStr > endDate.toISOString().slice(0, 10)) continue;
      const periodStr = dateStr.slice(0, 7);
      const ipcData = ipcCache[periodStr] !== undefined ? getOfficialIPC(periodStr) : undefined;
      result.push({
        date: dateStr,
        uf: getOfficialUF(dateStr),
        dolar: getOfficialDolar(dateStr),
        utm: getOfficialUTM(periodStr),
        euro: getOfficialEuro(dateStr),
        yen: 0, // la fuente oficial usada no publica yen: se muestra como no disponible
        ipc: ipcData?.monthly,
        ipcAcomulado: ipcData?.accumulated,
      });
    }
  }
  return result;
}

export interface EstadoIndicadores {
  ok: boolean;
  ultimaFecha?: string; // última fecha con UF publicada
  error?: string;
}
let estadoIndicadores: EstadoIndicadores = { ok: false };
export function getEstadoIndicadores(): EstadoIndicadores { return estadoIndicadores; }

/**
 * Pide al servidor que copie los indicadores desde la fuente oficial (si corresponde) y luego
 * lee la ÚNICA fuente central (Firestore `globalExchangeRates`) para todas las pantallas.
 */
export async function syncOnlineChileanIndicators(targetYear?: number): Promise<DailyIndicator[]> {
  try {
    await fetch('/api/indicators/sync').catch(() => null);
  } catch { /* el servidor puede estar sin conexión; se lee lo ya publicado */ }
  try {
    const snap = await getDocs(collection(db, 'globalExchangeRates'));
    snap.docs.forEach(docu => {
      const r: any = docu.data();
      const date: string = r.date || docu.id;
      const y = parseInt(date.slice(0, 4), 10);
      if (!y) return;
      if (!dynamicCache[y]) dynamicCache[y] = { uf: {}, dolar: {}, euro: {}, utm: {} };
      if (Number(r.uf) > 0) dynamicCache[y].uf[date] = Number(r.uf);
      if (Number(r.dolar) > 0) dynamicCache[y].dolar[date] = Number(r.dolar);
      if (Number(r.euro) > 0) dynamicCache[y].euro[date] = Number(r.euro);
      if (typeof r.ipc === 'number') ipcCache[date.slice(0, 7)] = r.ipc;
      if (Number(r.utm) > 0) {
        const per = date.slice(0, 7);
        dynamicCache[y].utm[per] = Number(r.utm);
        OFFICIAL_MONTHLY_UTM[per] = Number(r.utm);
      }
    });
    const todos = Object.keys(dynamicCache).flatMap(y => Object.keys(dynamicCache[Number(y)].uf || {})).sort();
    estadoIndicadores = { ok: todos.length > 0, ultimaFecha: todos[todos.length - 1] };
  } catch (e: any) {
    estadoIndicadores = { ok: false, error: e?.message || 'No se pudo leer los indicadores' };
  }
  const baseYear = targetYear || new Date().getFullYear();
  return generateOfficialChileanIndicators(`${baseYear - 1}-01-01`, new Date(baseYear + 1, 11, 31)).filter(i => !targetYear || i.date.startsWith(`${targetYear}-`));
}

export const OFFICIAL_MONTHLY_IMM: { [period: string]: number } = {
  // 2020 - 2022
  '2020-01': 320000, '2020-09': 326500,
  '2021-01': 326500, '2021-05': 337000, '2021-10': 350000,
  '2022-01': 350000, '2022-05': 380000, '2022-08': 400000, '2022-12': 410000,
  // 2023 (Ley N° 21.578)
  '2023-01': 410000, '2023-02': 410000, '2023-03': 410000, '2023-04': 410000,
  '2023-05': 440000, '2023-06': 440000, '2023-07': 440000, '2023-08': 440000,
  '2023-09': 460000, '2023-10': 460000, '2023-11': 460000, '2023-12': 460000,
  // 2024 (Ley N° 21.578: $500.000 a contar del 01 de julio de 2024)
  '2024-01': 460000, '2024-02': 460000, '2024-03': 460000, '2024-04': 460000,
  '2024-05': 460000, '2024-06': 460000, '2024-07': 500000, '2024-08': 500000,
  '2024-09': 500000, '2024-10': 500000, '2024-11': 500000, '2024-12': 500000,
  // 2025 (Reajuste IPC Ley N° 21.578 -> $520.000)
  '2025-01': 520000, '2025-02': 520000, '2025-03': 520000, '2025-04': 520000,
  '2025-05': 520000, '2025-06': 520000, '2025-07': 520000, '2025-08': 520000,
  '2025-09': 520000, '2025-10': 520000, '2025-11': 520000, '2025-12': 520000,
  // 2026 (Reajuste IPC proyectado / acordado -> $539.000)
  '2026-01': 539000, '2026-02': 539000, '2026-03': 539000, '2026-04': 539000,
  '2026-05': 539000, '2026-06': 539000, '2026-07': 539000, '2026-08': 539000,
  '2026-09': 539000, '2026-10': 539000, '2026-11': 539000, '2026-12': 539000,
};

/**
 * Obtiene el valor oficial del Ingreso Mínimo Mensual para un período 'YYYY-MM'
 */
export function getOfficialIMM(period: string): number {
  if (OFFICIAL_MONTHLY_IMM[period]) {
    return OFFICIAL_MONTHLY_IMM[period];
  }
  const [yearStr, monthStr] = period.split('-');
  const year = parseInt(yearStr, 10) || 2026;
  const month = parseInt(monthStr, 10) || 1;
  if (year <= 2022) return 400000;
  if (year === 2023) return month >= 9 ? 460000 : (month >= 5 ? 440000 : 410000);
  if (year === 2024) return month >= 7 ? 500000 : 460000;
  if (year === 2025) return 520000;
  return 539000;
}
