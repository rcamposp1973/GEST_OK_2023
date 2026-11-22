// Hoja de trabajo de Renta: RLI / base imponible y Capital Propio Tributario por régimen.
// Es un papel de trabajo REFERENCIAL: el contador revisa y valida cada ajuste. No reemplaza al F22.
import { getNaturaleza } from './ifrsClassification';
import { ORIGEN_APERTURA, ORIGEN_CIERRE } from './cierreAnio';

export type RegimenRenta = '14_A_SEMI_INTEGRADO' | '14_D3_PROPYME_GENERAL' | '14_D8_PROPYME_TRANSPARENTE';

export const NOMBRE_REGIMEN: Record<RegimenRenta, string> = {
  '14_A_SEMI_INTEGRADO': 'Régimen General (14 A)',
  '14_D3_PROPYME_GENERAL': 'Pro Pyme General (14 D N° 3)',
  '14_D8_PROPYME_TRANSPARENTE': 'Pro Pyme Transparente (14 D N° 8)',
};

// Tasas del Impuesto de Primera Categoría para el año comercial 2026 (AT 2027). Editables en pantalla.
export const TASA_IDPC_SUGERIDA: Record<RegimenRenta, number> = {
  '14_A_SEMI_INTEGRADO': 27,
  '14_D3_PROPYME_GENERAL': 12.5,
  '14_D8_PROPYME_TRANSPARENTE': 0, // la base imponible se atribuye a los dueños
};

export interface AjusteRenta { id: string; concepto: string; tipo: 'AGREGADO' | 'DEDUCCION'; monto: number; }

export const AJUSTES_SUGERIDOS: Record<RegimenRenta, { concepto: string; tipo: 'AGREGADO' | 'DEDUCCION' }[]> = {
  '14_A_SEMI_INTEGRADO': [
    { concepto: 'Gastos rechazados (Art. 21 y 31 LIR)', tipo: 'AGREGADO' },
    { concepto: 'Impuesto a la renta provisionado como gasto', tipo: 'AGREGADO' },
    { concepto: 'Provisiones no aceptadas tributariamente', tipo: 'AGREGADO' },
    { concepto: 'Depreciación financiera', tipo: 'AGREGADO' },
    { concepto: 'Multas e intereses fiscales', tipo: 'AGREGADO' },
    { concepto: 'Depreciación tributaria', tipo: 'DEDUCCION' },
    { concepto: 'Corrección monetaria tributaria (neta)', tipo: 'DEDUCCION' },
    { concepto: 'Ingresos no constitutivos de renta', tipo: 'DEDUCCION' },
    { concepto: 'Pérdida tributaria de arrastre', tipo: 'DEDUCCION' },
    { concepto: 'Incentivo al ahorro (Art. 14 E)', tipo: 'DEDUCCION' },
  ],
  '14_D3_PROPYME_GENERAL': [
    { concepto: 'Gastos rechazados (Art. 21 y 31 LIR)', tipo: 'AGREGADO' },
    { concepto: 'Gastos devengados no pagados al 31-12', tipo: 'AGREGADO' },
    { concepto: 'Ingresos de años anteriores percibidos este año', tipo: 'AGREGADO' },
    { concepto: 'Ingresos devengados no percibidos al 31-12', tipo: 'DEDUCCION' },
    { concepto: 'Gastos de años anteriores pagados este año', tipo: 'DEDUCCION' },
    { concepto: 'Depreciación instantánea', tipo: 'DEDUCCION' },
    { concepto: 'Pérdida tributaria de arrastre', tipo: 'DEDUCCION' },
    { concepto: 'Incentivo al ahorro (Art. 14 E)', tipo: 'DEDUCCION' },
  ],
  '14_D8_PROPYME_TRANSPARENTE': [
    { concepto: 'Gastos rechazados (Art. 21 y 31 LIR)', tipo: 'AGREGADO' },
    { concepto: 'Gastos devengados no pagados al 31-12', tipo: 'AGREGADO' },
    { concepto: 'Ingresos de años anteriores percibidos este año', tipo: 'AGREGADO' },
    { concepto: 'Ingresos devengados no percibidos al 31-12', tipo: 'DEDUCCION' },
    { concepto: 'Gastos de años anteriores pagados este año', tipo: 'DEDUCCION' },
    { concepto: 'Depreciación instantánea', tipo: 'DEDUCCION' },
    { concepto: 'Pérdida tributaria de arrastre', tipo: 'DEDUCCION' },
  ],
};

interface LineaMin { accountId?: string; accountCode?: string; debit?: number | string; credit?: number | string }
interface VoucherMin { date?: string; period?: string; status?: string; origin?: string; lines?: LineaMin[]; totalDebit?: number; totalCredit?: number }
interface CuentaMin { id: string; code: string; name: string; type?: string }

export interface DatosContablesAnio {
  ingresos: number;          // saldo acreedor de cuentas de ingreso del año
  gastos: number;            // saldo deudor de cuentas de gasto/costo del año
  utilidadContable: number;  // ingresos - gastos
  activos: number;           // saldo al 31-12
  pasivos: number;           // saldo exigible al 31-12
  patrimonioContable: number;// saldo de cuentas de patrimonio al 31-12 (sin el resultado del año)
  capitalSugerido: number;   // saldo de cuentas de patrimonio cuyo nombre contiene "CAPITAL"
  comprobantesUsados: number;
  comprobantesDescuadrados: number;
}

const cuadra = (v: VoucherMin) => {
  const d = v.totalDebit ?? (v.lines || []).reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const c = v.totalCredit ?? (v.lines || []).reduce((s, l) => s + (Number(l.credit) || 0), 0);
  return Math.abs(d - c) <= 0.01;
};

/** Suma la contabilidad del año comercial. Si el año tiene comprobante de apertura, los saldos de balance parten de él; si no, se usa toda la historia hasta el 31-12. */
export function datosContablesDelAnio(vouchers: VoucherMin[], accounts: CuentaMin[], anio: number): DatosContablesAnio {
  const desde = `${anio}-01-01`, hasta = `${anio}-12-31`;
  const vigentes = vouchers.filter(v => v.status !== 'Anulado' && v.origin !== ORIGEN_CIERRE);
  const tieneApertura = vigentes.some(v => v.origin === ORIGEN_APERTURA && (v.date || '') >= desde && (v.date || '') <= hasta);
  const enRango = vigentes.filter(v => {
    const f = v.date || (v.period ? `${v.period}-01` : '');
    return f && f <= hasta && (!tieneApertura || f >= desde);
  });
  const descuadrados = enRango.filter(v => !cuadra(v)).length;
  const usados = enRango.filter(cuadra);

  const porId = new Map(accounts.map(a => [a.id, a]));
  const porCodigo = new Map(accounts.map(a => [a.code, a]));
  let ingresos = 0, gastos = 0, activos = 0, pasivos = 0, patrimonio = 0, capital = 0;

  for (const v of usados) {
    const f = v.date || (v.period ? `${v.period}-01` : '');
    const delAnio = f >= desde;
    for (const l of v.lines || []) {
      const cuenta = (l.accountId && porId.get(l.accountId)) || (l.accountCode && porCodigo.get(l.accountCode))
        || { id: '', code: l.accountCode || '', name: '' };
      const neto = (Number(l.debit) || 0) - (Number(l.credit) || 0);
      const nat = getNaturaleza(cuenta as any);
      if (nat === 'INGRESO') { if (delAnio) ingresos -= neto; }
      else if (nat === 'GASTO') { if (delAnio) gastos += neto; }
      else if (nat === 'ACTIVO') activos += neto;
      else if (nat === 'PASIVO') pasivos -= neto;
      else if (nat === 'PATRIMONIO') {
        patrimonio -= neto;
        if (/CAPITAL/i.test(cuenta.name || '')) capital -= neto;
      }
    }
  }
  const r = (n: number) => Math.round(n);
  return {
    ingresos: r(ingresos), gastos: r(gastos), utilidadContable: r(ingresos - gastos),
    activos: r(activos), pasivos: r(pasivos), patrimonioContable: r(patrimonio), capitalSugerido: r(capital),
    comprobantesUsados: usados.length, comprobantesDescuadrados: descuadrados,
  };
}

export interface HojaRenta {
  regimen: RegimenRenta;
  tasaIdpc: number;
  ajustes: AjusteRenta[];
  ppmPagados: number;
  cuentaPpmId?: string; // si está, los PPM se leen del saldo de esta cuenta en el año
  otrosCreditos: number;
  // CPT régimen general
  ajustesCpt: { id: string; concepto: string; monto: number }[];
  // CPT simplificado Pro Pyme
  capitalAportado: number;
  aumentosCapital: number;
  disminucionesCapital: number;
  utilidadesTributariasAnteriores: number;
  retirosDelAnio: number;
}

export interface ResultadoRenta {
  agregados: number;
  deducciones: number;
  rli: number;
  perdidaTributaria: number;
  idpc: number;
  saldoImpuesto: number;  // positivo = a pagar, negativo = a devolver (referencial)
  cpt: number;
  basePropietarios: number; // 14 D N° 8: base imponible que se atribuye a los dueños
}

export function calcularRenta(datos: DatosContablesAnio, hoja: HojaRenta): ResultadoRenta {
  const agregados = hoja.ajustes.filter(a => a.tipo === 'AGREGADO').reduce((s, a) => s + (Number(a.monto) || 0), 0);
  const deducciones = hoja.ajustes.filter(a => a.tipo === 'DEDUCCION').reduce((s, a) => s + (Number(a.monto) || 0), 0);
  const base = datos.utilidadContable + agregados - deducciones;
  const rli = Math.max(base, 0);
  const perdidaTributaria = Math.max(-base, 0);
  const transparente = hoja.regimen === '14_D8_PROPYME_TRANSPARENTE';
  const idpc = transparente ? 0 : Math.round(rli * (Number(hoja.tasaIdpc) || 0) / 100);
  const saldoImpuesto = idpc - (Number(hoja.ppmPagados) || 0) - (Number(hoja.otrosCreditos) || 0);

  let cpt: number;
  if (hoja.regimen === '14_A_SEMI_INTEGRADO') {
    cpt = datos.activos - datos.pasivos + hoja.ajustesCpt.reduce((s, a) => s + (Number(a.monto) || 0), 0);
  } else {
    // CPT simplificado: capital aportado ± aumentos/disminuciones + utilidades tributarias + resultado tributario del año − retiros
    cpt = (Number(hoja.capitalAportado) || 0) + (Number(hoja.aumentosCapital) || 0) - (Number(hoja.disminucionesCapital) || 0)
      + (Number(hoja.utilidadesTributariasAnteriores) || 0) + base - (Number(hoja.retirosDelAnio) || 0);
  }
  return {
    agregados, deducciones, rli, perdidaTributaria, idpc, saldoImpuesto, cpt: Math.round(cpt),
    basePropietarios: transparente ? rli : 0,
  };
}

export function hojaInicial(regimen: RegimenRenta, datos: DatosContablesAnio): HojaRenta {
  return {
    regimen, tasaIdpc: TASA_IDPC_SUGERIDA[regimen], ajustes: [], ppmPagados: 0, otrosCreditos: 0, ajustesCpt: [],
    capitalAportado: datos.capitalSugerido, aumentosCapital: 0, disminucionesCapital: 0,
    utilidadesTributariasAnteriores: 0, retirosDelAnio: 0,
  };
}

export function normalizarRegimen(r?: string): RegimenRenta {
  const s = (r || '').toUpperCase();
  if (s.includes('D8') || s.includes('TRANSPARENTE')) return '14_D8_PROPYME_TRANSPARENTE';
  if (s.includes('14_A') || s.includes('14 A') || s.includes('SEMI') || s.includes('GENERAL (14 A')) return '14_A_SEMI_INTEGRADO';
  return '14_D3_PROPYME_GENERAL';
}

/** Débitos menos créditos de una cuenta en el año comercial (sin el comprobante de apertura ni el de cierre). Para leer los PPM pagados. */
export function movimientoCuentaDelAnio(vouchers: VoucherMin[], accounts: CuentaMin[], cuentaId: string, anio: number): number {
  const cuenta = accounts.find(a => a.id === cuentaId);
  if (!cuenta) return 0;
  const desde = `${anio}-01-01`, hasta = `${anio}-12-31`;
  let total = 0;
  for (const v of vouchers) {
    if (v.status === 'Anulado' || v.origin === ORIGEN_CIERRE || v.origin === ORIGEN_APERTURA || !cuadra(v)) continue;
    const f = v.date || (v.period ? `${v.period}-01` : '');
    if (!f || f < desde || f > hasta) continue;
    for (const l of v.lines || []) {
      if (l.accountId === cuenta.id || (!l.accountId && l.accountCode === cuenta.code)) total += (Number(l.debit) || 0) - (Number(l.credit) || 0);
    }
  }
  return Math.round(total);
}

/** Cuenta de PPM sugerida por su nombre. */
export function sugerirCuentaPpm(accounts: CuentaMin[]): string | undefined {
  return accounts.find(a => /\bPPM\b|PAGOS? PROVISIONAL/i.test(a.name || ''))?.id;
}
