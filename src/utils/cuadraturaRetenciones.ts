// Cuadratura de retenciones para las DJ 1887 (sueldos) y 1879 (honorarios), mes a mes,
// comparando tres fuentes: el origen del dato (liquidaciones / boletas del RCV), lo declarado en el F29 y lo contabilizado.
import { ORIGEN_APERTURA, ORIGEN_CIERRE } from './cierreAnio';

export const TOLERANCIA_CUADRATURA = 1; // pesos

interface LineaMin { accountId?: string; accountCode?: string; debit?: number | string; credit?: number | string }
interface VoucherMin { date?: string; period?: string; status?: string; origin?: string; lines?: LineaMin[] }
interface CuentaMin { id: string; code: string; name: string }
interface LiquidacionMin { period?: string; impuestoUnicoSegundaCategoria?: number; rentaAfectaImpuesto?: number; totalHaberesImponibles?: number }
interface DocHonorarioMin { period?: string; tipoRegistro?: string; tipoDoc?: string; nombreTipoDoc?: string; montoRetencion?: number; montoBruto?: number; montoNeto?: number; montoTotal?: number }
interface F29Min { period?: string; retenciones?: { impuestoUnicoTrabajadores?: number; retencionHonorarios?: number } }

export interface FilaCuadratura {
  periodo: string;         // YYYY-MM
  origen: number;          // liquidaciones (1887) o boletas del RCV (1879)
  f29: number | null;      // null = no hay F29 guardado para el mes
  contabilidad: number | null; // null = no se eligió cuenta
  cuadra: boolean;
  faltaF29: boolean;       // hay retenciones en el mes pero no hay F29 guardado
}

export interface ResultadoCuadratura { filas: FilaCuadratura[]; totalOrigen: number; totalF29: number; totalContabilidad: number; mesesConDiferencia: number }

export const esHonorario = (d: DocHonorarioMin) =>
  d.tipoRegistro === 'Honorarios' || d.tipoDoc === 'BHE' || d.tipoDoc === '900' || d.tipoDoc === '901'
  || (d.nombreTipoDoc || '').toLowerCase().includes('honorario');

/** Haber de la cuenta en el mes (la retención se provisiona al haber; el pago del F29 va al debe y no se cuenta). */
function haberPorMes(vouchers: VoucherMin[], cuenta: CuentaMin | undefined, anio: number): Map<string, number> {
  const m = new Map<string, number>();
  if (!cuenta) return m;
  for (const v of vouchers) {
    if (v.status === 'Anulado' || v.origin === ORIGEN_APERTURA || v.origin === ORIGEN_CIERRE) continue;
    const p = v.period || (v.date || '').slice(0, 7);
    if (!p.startsWith(`${anio}-`)) continue;
    for (const l of v.lines || []) {
      if (l.accountId === cuenta.id || (!l.accountId && l.accountCode === cuenta.code)) {
        m.set(p, (m.get(p) || 0) + (Number(l.credit) || 0));
      }
    }
  }
  return m;
}

function armar(anio: number, origen: Map<string, number>, f29: Map<string, number>, conta: Map<string, number> | null): ResultadoCuadratura {
  const filas: FilaCuadratura[] = [];
  for (let mes = 1; mes <= 12; mes++) {
    const p = `${anio}-${String(mes).padStart(2, '0')}`;
    const o = Math.round(origen.get(p) || 0);
    const f = f29.has(p) ? Math.round(f29.get(p) || 0) : null;
    const c = conta ? Math.round(conta.get(p) || 0) : null;
    const valores = [o, f, c].filter((x): x is number => x !== null);
    const faltaF29 = f === null && Math.max(o, c || 0) > TOLERANCIA_CUADRATURA;
    const cuadra = !faltaF29 && valores.every(x => Math.abs(x - o) <= TOLERANCIA_CUADRATURA);
    filas.push({ periodo: p, origen: o, f29: f, contabilidad: c, cuadra, faltaF29 });
  }
  const suma = (sel: (f: FilaCuadratura) => number | null) => filas.reduce((s, f) => s + (sel(f) || 0), 0);
  return {
    filas,
    totalOrigen: suma(f => f.origen),
    totalF29: suma(f => f.f29),
    totalContabilidad: suma(f => f.contabilidad),
    mesesConDiferencia: filas.filter(f => !f.cuadra).length,
  };
}

const f29PorMes = (f29s: F29Min[], anio: number, campo: 'impuestoUnicoTrabajadores' | 'retencionHonorarios') => {
  const m = new Map<string, number>();
  for (const d of f29s) {
    if (!d.period?.startsWith(`${anio}-`)) continue;
    m.set(d.period, Number(d.retenciones?.[campo]) || 0);
  }
  return m;
};

/** DJ 1887: impuesto único según liquidaciones vs código 48 del F29 vs haber de la cuenta de impuesto único. */
export function cuadratura1887(anio: number, liquidaciones: LiquidacionMin[], f29s: F29Min[], vouchers: VoucherMin[], cuenta?: CuentaMin): ResultadoCuadratura {
  const origen = new Map<string, number>();
  for (const s of liquidaciones) {
    if (!s.period?.startsWith(`${anio}-`)) continue;
    origen.set(s.period, (origen.get(s.period) || 0) + (Number(s.impuestoUnicoSegundaCategoria) || 0));
  }
  return armar(anio, origen, f29PorMes(f29s, anio, 'impuestoUnicoTrabajadores'), cuenta ? haberPorMes(vouchers, cuenta, anio) : null);
}

/** DJ 1879: retenciones de las boletas de honorarios del RCV vs código 151 del F29 vs haber de la cuenta de retención. */
export function cuadratura1879(anio: number, docs: DocHonorarioMin[], f29s: F29Min[], vouchers: VoucherMin[], cuenta?: CuentaMin): ResultadoCuadratura {
  const origen = new Map<string, number>();
  for (const d of docs) {
    if (!d.period?.startsWith(`${anio}-`) || !esHonorario(d)) continue;
    origen.set(d.period, (origen.get(d.period) || 0) + (Number(d.montoRetencion) || 0));
  }
  return armar(anio, origen, f29PorMes(f29s, anio, 'retencionHonorarios'), cuenta ? haberPorMes(vouchers, cuenta, anio) : null);
}

export const sugerirCuentaImpuestoUnico = (accounts: CuentaMin[]) =>
  accounts.find(a => /UNICO|ÚNICO/i.test(a.name || ''))?.id;

export const sugerirCuentaRetencionHonorarios = (accounts: CuentaMin[]) =>
  accounts.find(a => !/UNICO|ÚNICO/i.test(a.name || '') && /HONORARIO|RETENCION(ES)? DE 2|RETENCI[OÓ]N 2/i.test(a.name || '') && /RETEN/i.test(a.name || ''))?.id
  ?? accounts.find(a => !/UNICO|ÚNICO/i.test(a.name || '') && /RETENCION DE 2|RETENCIÓN DE 2/i.test(a.name || ''))?.id;
