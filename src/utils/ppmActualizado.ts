/**
 * Corrección monetaria (actualización) de los PPM para la renta anual.
 *
 * Regla del SII: cada PPM se actualiza con el factor del MES EN QUE SE PAGÓ el F29 hasta el cierre del año.
 * El PPM del período m se paga en m+1, por lo que usa el factor de m+1; el de diciembre se paga en enero y usa 1,000.
 * Los factores son los "porcentajes y factores de actualización directos" que el SII publica cada enero.
 * Si el año aún no tiene tabla oficial, se estiman con el IPC mensual (variación entre el mes anterior al pago y noviembre).
 */
import { VoucherMin, CuentaMin } from './rentaAnual';

/** Factores oficiales del SII (enero..diciembre) por año comercial. */
export const FACTORES_ACTUALIZACION_OFICIALES: Record<number, number[]> = {
  // AT 2025 (Circular N° 9 de 2025)
  2024: [1.047, 1.040, 1.034, 1.030, 1.025, 1.022, 1.023, 1.016, 1.013, 1.012, 1.003, 1.000],
  // AT 2026 (Circular N° 5 de 2026)
  2025: [1.036, 1.026, 1.022, 1.016, 1.014, 1.012, 1.017, 1.008, 1.007, 1.003, 1.003, 1.000],
};

export interface FactoresAnio { factores: number[]; oficial: boolean; faltanIpc: string[] }

/**
 * Factores del año. Sin tabla oficial, se estima: factor(mes p) = Π (1 + IPC_k) para k = p .. noviembre (redondeado a 3 decimales).
 * ipcMensual(periodo 'YYYY-MM') devuelve la variación mensual en % o undefined si no se conoce.
 */
export function factoresActualizacion(anio: number, ipcMensual?: (periodo: string) => number | undefined): FactoresAnio {
  const of = FACTORES_ACTUALIZACION_OFICIALES[anio];
  if (of) return { factores: of, oficial: true, faltanIpc: [] };
  const faltan: string[] = [];
  const v = Array.from({ length: 12 }, (_, i) => {
    const p = `${anio}-${String(i + 1).padStart(2, '0')}`;
    const x = ipcMensual?.(p);
    if (x === undefined || x === null || !Number.isFinite(x)) { if (i < 11) faltan.push(p); return 0; }
    return Number(x);
  });
  const factores = Array.from({ length: 12 }, (_, i) => {
    if (i === 11) return 1;
    let f = 1;
    for (let k = i; k <= 10; k++) f *= 1 + Math.max(-100, v[k]) / 100;
    return Math.max(1, Math.round(f * 1000) / 1000); // reajustes negativos se consideran cero
  });
  return { factores, oficial: false, faltanIpc: faltan };
}

const ES_CM = /correcci[oó]n monetaria|reajust|actualizaci[oó]n/i;

export interface DetallePpm { mes: number; ppm: number; mesPago: string; factor: number; actualizado: number }
export interface ResultadoCmPpm { detalle: DetallePpm[]; historico: number; actualizado: number; cmCalculada: number; cmYaContabilizada: number; cmSugerida: number }

/**
 * PPM del año desde la cuenta de PPM, mes a mes (sólo cargos; los abonos son imputaciones o devoluciones),
 * y su actualización. Las líneas cuya glosa indica corrección monetaria se informan aparte como "ya contabilizada".
 */
export function calcularCmPpm(vouchers: VoucherMin[], accounts: CuentaMin[], cuentaId: string, anio: number, factores: number[]): ResultadoCmPpm {
  const cuenta = accounts.find(a => a.id === cuentaId);
  const porMes = Array(12).fill(0) as number[];
  let cmYa = 0;
  if (cuenta) {
    for (const v of vouchers as any[]) {
      if (v.status === 'Anulado') continue;
      const f = String(v.date || (v.period ? `${v.period}-01` : ''));
      if (!f.startsWith(String(anio))) continue;
      const mes = Number(f.slice(5, 7));
      if (!(mes >= 1 && mes <= 12)) continue;
      for (const l of v.lines || []) {
        if (!(l.accountId === cuenta.id || (!l.accountId && l.accountCode === cuenta.code))) continue;
        const neto = (Number(l.debit) || 0) - (Number(l.credit) || 0);
        if (ES_CM.test(String(l.gloss || '')) || ES_CM.test(String(v.gloss || ''))) { cmYa += neto; continue; }
        if ((Number(l.debit) || 0) > 0) porMes[mes - 1] += Number(l.debit) || 0;
      }
    }
  }
  const detalle: DetallePpm[] = porMes.map((ppm, i) => {
    const mes = i + 1;
    const factor = mes === 12 ? 1 : (factores[mes] || 1); // pagado en el mes siguiente
    const mesPago = mes === 12 ? `${anio + 1}-01` : `${anio}-${String(mes + 1).padStart(2, '0')}`;
    return { mes, ppm: Math.round(ppm), mesPago, factor, actualizado: Math.round(ppm * factor) };
  });
  const historico = detalle.reduce((s, d) => s + d.ppm, 0);
  const actualizado = detalle.reduce((s, d) => s + d.actualizado, 0);
  const cmCalculada = actualizado - historico;
  const cmYaContabilizada = Math.round(cmYa);
  return { detalle, historico, actualizado, cmCalculada, cmYaContabilizada, cmSugerida: Math.max(0, cmCalculada - cmYaContabilizada) };
}
