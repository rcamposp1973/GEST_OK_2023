// Motor de KPIs: usa la MISMA clasificación y la MISMA regla de comprobantes que los informes
// (Balance IFRS, Estado de Resultados, Balance de 8 columnas): sin anulados y solo cuadrados.
import type { ChartOfAccount, Voucher } from '../types';
import { getNaturaleza, getRubroER, getRubroESF, RUBROS_ESF } from './ifrsClassification';

export interface KpiFigures {
  meses: number;
  // Balance (a la fecha de corte)
  efectivo: number; cxc: number; inventarios: number; cxp: number;
  activoCorriente: number; activoNoCorriente: number; activoTotal: number;
  pasivoCorriente: number; pasivoNoCorriente: number; pasivoTotal: number;
  deudaFinanciera: number; patrimonio: number; // patrimonio incluye resultado del ejercicio
  // Resultado (acumulado del año al corte)
  ingresos: number; costoVentas: number; gastoPersonal: number; gastoAdm: number; depreciacion: number;
  ingFin: number; costoFin: number; otrosIng: number; otrosGastos: number; impuesto: number;
  margenBruto: number; ebit: number; ebitda: number; resultado: number;
  // Series mensuales (12)
  ingresosMes: number[]; gastosMes: number[];
}

export function calcularFiguras(vouchers: Voucher[], accounts: ChartOfAccount[], year: number, cutoffMonth: number): KpiFigures {
  const byKey = new Map<string, ChartOfAccount>();
  accounts.forEach(a => { byKey.set(a.id, a); byKey.set(a.code, a); });
  const corte = cutoffMonth > 0 ? cutoffMonth : 12;
  const sums = new Map<string, { acc: ChartOfAccount; d: number; c: number }>();
  const ingresosMes = new Array(12).fill(0);
  const gastosMes = new Array(12).fill(0);

  vouchers.forEach(v => {
    if (v.status === 'Anulado' || !v.date) return;
    const y = parseInt(v.date.slice(0, 4), 10);
    const m = parseInt(v.date.slice(5, 7), 10);
    if (y !== year || m > corte || m < 1) return;
    const lines = v.lines || [];
    const deb = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
    const cre = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
    if (Math.abs(deb - cre) > 0.01) return;
    lines.forEach(l => {
      const d = Number(l.debit) || 0, c = Number(l.credit) || 0;
      if (!d && !c) return;
      const acc = byKey.get(l.accountId) || byKey.get(l.accountCode)
        || ({ id: l.accountId || l.accountCode || '?', code: (l.accountCode || '').trim(), name: l.accountName || '', type: '' } as unknown as ChartOfAccount);
      const e = sums.get(acc.id) || { acc, d: 0, c: 0 };
      e.d += d; e.c += c; sums.set(acc.id, e);
      const nat = getNaturaleza(acc);
      if (nat === 'INGRESO') ingresosMes[m - 1] += c - d;
      else if (nat === 'GASTO') gastosMes[m - 1] += d - c;
    });
  });

  const f: KpiFigures = {
    meses: corte, efectivo: 0, cxc: 0, inventarios: 0, cxp: 0, activoCorriente: 0, activoNoCorriente: 0, activoTotal: 0,
    pasivoCorriente: 0, pasivoNoCorriente: 0, pasivoTotal: 0, deudaFinanciera: 0, patrimonio: 0,
    ingresos: 0, costoVentas: 0, gastoPersonal: 0, gastoAdm: 0, depreciacion: 0, ingFin: 0, costoFin: 0,
    otrosIng: 0, otrosGastos: 0, impuesto: 0, margenBruto: 0, ebit: 0, ebitda: 0, resultado: 0, ingresosMes, gastosMes
  };
  let totIng = 0, totGas = 0;

  sums.forEach(({ acc, d, c }) => {
    const nat = getNaturaleza(acc);
    if (nat === 'ACTIVO') {
      const s = d - c;
      const r = getRubroESF(acc);
      const sec = RUBROS_ESF.find(x => x.id === r)?.seccion || 'ACTIVO_CORRIENTE';
      if (sec === 'ACTIVO_NO_CORRIENTE') f.activoNoCorriente += s; else f.activoCorriente += s;
      if (r === '1101') f.efectivo += s;
      if (r === '1102') f.cxc += s;
      if (r === '1103') f.inventarios += s;
    } else if (nat === 'PASIVO') {
      const s = c - d;
      const r = getRubroESF(acc);
      const sec = RUBROS_ESF.find(x => x.id === r)?.seccion || 'PASIVO_CORRIENTE';
      if (sec === 'PASIVO_NO_CORRIENTE') f.pasivoNoCorriente += s; else f.pasivoCorriente += s;
      if (r === '2101') f.cxp += s;
      if (r === '2102' || r === '2201') f.deudaFinanciera += s;
    } else if (nat === 'PATRIMONIO') {
      f.patrimonio += c - d;
    } else if (nat === 'INGRESO') {
      const s = c - d; totIng += s;
      const r = getRubroER(acc);
      if (r === 'ING_FIN') f.ingFin += s; else if (r === 'OTROS_ING') f.otrosIng += s; else f.ingresos += s;
    } else if (nat === 'GASTO') {
      const s = d - c; totGas += s;
      switch (getRubroER(acc)) {
        case 'COSTO_VENTAS': f.costoVentas += s; break;
        case 'GASTO_PERSONAL': f.gastoPersonal += s; break;
        case 'DEPRECIACION': f.depreciacion += s; break;
        case 'COSTO_FIN': f.costoFin += s; break;
        case 'OTROS_GASTOS': f.otrosGastos += s; break;
        case 'IMPUESTO': f.impuesto += s; break;
        default: f.gastoAdm += s;
      }
    }
  });

  f.resultado = totIng - totGas;
  f.patrimonio += f.resultado; // el resultado del ejercicio se presenta dentro del patrimonio
  f.activoTotal = f.activoCorriente + f.activoNoCorriente;
  f.pasivoTotal = f.pasivoCorriente + f.pasivoNoCorriente;
  f.margenBruto = f.ingresos - f.costoVentas;
  f.ebit = f.margenBruto - f.gastoPersonal - f.gastoAdm - f.depreciacion;
  f.ebitda = f.ebit + f.depreciacion;
  return f;
}

// ───────────────────────── Catálogo ─────────────────────────
export type KpiUnit = 'x' | 'pct' | 'clp' | 'dias' | 'meses';
export type KpiGrupo = 'Liquidez' | 'Endeudamiento' | 'Rentabilidad' | 'Márgenes' | 'Actividad' | 'Crecimiento' | 'Caja (Startup)';

export interface KpiDef {
  id: string;
  nombre: string;
  grupo: KpiGrupo;
  unidad: KpiUnit;
  descripcion: string;
  /** true: mayor es mejor; false: menor es mejor */
  mayorEsMejor: boolean;
  /** Rango saludable de referencia (para el semáforo). */
  min?: number; max?: number;
  calcular: (f: KpiFigures) => number | null;
}

const div = (a: number, b: number): number | null => (b > 0 || b < 0 ? a / b : null);
const dias = (f: KpiFigures) => f.meses * 30;
const prom = (arr: number[], n: number) => (n > 0 ? arr.slice(0, n).reduce((s, x) => s + x, 0) / n : 0);

export const KPI_CATALOGO: KpiDef[] = [
  { id: 'razon_corriente', nombre: 'Razón corriente', grupo: 'Liquidez', unidad: 'x', mayorEsMejor: true, min: 1.2,
    descripcion: 'Activo corriente / Pasivo corriente. Capacidad de pagar deudas de corto plazo.', calcular: f => div(f.activoCorriente, f.pasivoCorriente) },
  { id: 'prueba_acida', nombre: 'Prueba ácida', grupo: 'Liquidez', unidad: 'x', mayorEsMejor: true, min: 1,
    descripcion: '(Activo corriente − Inventarios) / Pasivo corriente.', calcular: f => div(f.activoCorriente - f.inventarios, f.pasivoCorriente) },
  { id: 'capital_trabajo', nombre: 'Capital de trabajo', grupo: 'Liquidez', unidad: 'clp', mayorEsMejor: true, min: 0,
    descripcion: 'Activo corriente − Pasivo corriente.', calcular: f => f.activoCorriente - f.pasivoCorriente },
  { id: 'efectivo', nombre: 'Efectivo y equivalentes', grupo: 'Liquidez', unidad: 'clp', mayorEsMejor: true,
    descripcion: 'Saldo contable de caja y bancos.', calcular: f => f.efectivo },

  { id: 'deuda_patrimonio', nombre: 'Deuda / Patrimonio', grupo: 'Endeudamiento', unidad: 'x', mayorEsMejor: false, max: 2,
    descripcion: 'Pasivo total / Patrimonio.', calcular: f => (f.patrimonio > 0 ? f.pasivoTotal / f.patrimonio : null) },
  { id: 'deuda_activo', nombre: 'Deuda / Activo', grupo: 'Endeudamiento', unidad: 'pct', mayorEsMejor: false, max: 60,
    descripcion: 'Pasivo total / Activo total.', calcular: f => { const r = div(f.pasivoTotal, f.activoTotal); return r === null ? null : r * 100; } },
  { id: 'deuda_fin_ebitda', nombre: 'Deuda financiera / EBITDA', grupo: 'Endeudamiento', unidad: 'x', mayorEsMejor: false, max: 3,
    descripcion: 'Veces que el EBITDA anualizado cubre la deuda financiera.', calcular: f => (f.ebitda > 0 ? f.deudaFinanciera / (f.ebitda * 12 / f.meses) : null) },
  { id: 'cobertura_intereses', nombre: 'Cobertura de intereses', grupo: 'Endeudamiento', unidad: 'x', mayorEsMejor: true, min: 2,
    descripcion: 'Resultado operacional / Costos financieros.', calcular: f => div(f.ebit, f.costoFin) },

  { id: 'roa', nombre: 'ROA (anualizado)', grupo: 'Rentabilidad', unidad: 'pct', mayorEsMejor: true, min: 0,
    descripcion: 'Resultado del ejercicio / Activo total, anualizado.', calcular: f => { const r = div(f.resultado * 12 / f.meses, f.activoTotal); return r === null ? null : r * 100; } },
  { id: 'roe', nombre: 'ROE (anualizado)', grupo: 'Rentabilidad', unidad: 'pct', mayorEsMejor: true, min: 0,
    descripcion: 'Resultado del ejercicio / Patrimonio, anualizado.', calcular: f => (f.patrimonio > 0 ? (f.resultado * 12 / f.meses / f.patrimonio) * 100 : null) },
  { id: 'resultado', nombre: 'Resultado del ejercicio', grupo: 'Rentabilidad', unidad: 'clp', mayorEsMejor: true, min: 0,
    descripcion: 'Ingresos − Gastos acumulados del año al corte.', calcular: f => f.resultado },
  { id: 'ebitda', nombre: 'EBITDA', grupo: 'Rentabilidad', unidad: 'clp', mayorEsMejor: true, min: 0,
    descripcion: 'Resultado operacional + Depreciación y amortización.', calcular: f => f.ebitda },

  { id: 'margen_bruto', nombre: 'Margen bruto', grupo: 'Márgenes', unidad: 'pct', mayorEsMejor: true,
    descripcion: '(Ingresos − Costo de ventas) / Ingresos.', calcular: f => { const r = div(f.margenBruto, f.ingresos); return r === null ? null : r * 100; } },
  { id: 'margen_operacional', nombre: 'Margen operacional', grupo: 'Márgenes', unidad: 'pct', mayorEsMejor: true, min: 0,
    descripcion: 'Resultado operacional / Ingresos.', calcular: f => { const r = div(f.ebit, f.ingresos); return r === null ? null : r * 100; } },
  { id: 'margen_ebitda', nombre: 'Margen EBITDA', grupo: 'Márgenes', unidad: 'pct', mayorEsMejor: true,
    descripcion: 'EBITDA / Ingresos.', calcular: f => { const r = div(f.ebitda, f.ingresos); return r === null ? null : r * 100; } },
  { id: 'margen_neto', nombre: 'Margen neto', grupo: 'Márgenes', unidad: 'pct', mayorEsMejor: true, min: 0,
    descripcion: 'Resultado del ejercicio / Ingresos.', calcular: f => { const r = div(f.resultado, f.ingresos); return r === null ? null : r * 100; } },
  { id: 'personal_ingresos', nombre: 'Gasto en personal / Ingresos', grupo: 'Márgenes', unidad: 'pct', mayorEsMejor: false,
    descripcion: 'Peso de las remuneraciones sobre los ingresos.', calcular: f => { const r = div(f.gastoPersonal, f.ingresos); return r === null ? null : r * 100; } },
  { id: 'gasto_adm_ingresos', nombre: 'Gastos de administración / Ingresos', grupo: 'Márgenes', unidad: 'pct', mayorEsMejor: false,
    descripcion: 'Peso de la administración sobre los ingresos.', calcular: f => { const r = div(f.gastoAdm, f.ingresos); return r === null ? null : r * 100; } },
  { id: 'punto_equilibrio', nombre: 'Punto de equilibrio mensual', grupo: 'Márgenes', unidad: 'clp', mayorEsMejor: false,
    descripcion: 'Gastos fijos mensuales / Margen bruto %. Ingreso mensual mínimo para no perder.',
    calcular: f => { const mb = div(f.margenBruto, f.ingresos); return mb && mb > 0 ? ((f.gastoPersonal + f.gastoAdm + f.depreciacion + f.costoFin) / f.meses) / mb : null; } },

  { id: 'dias_cobro', nombre: 'Días de cobro', grupo: 'Actividad', unidad: 'dias', mayorEsMejor: false, max: 45,
    descripcion: 'Cuentas por cobrar / Ingresos × días del período.', calcular: f => { const r = div(f.cxc, f.ingresos); return r === null ? null : r * dias(f); } },
  { id: 'dias_pago', nombre: 'Días de pago', grupo: 'Actividad', unidad: 'dias', mayorEsMejor: true,
    descripcion: 'Cuentas por pagar / (Costo de ventas + Gastos de administración) × días.', calcular: f => { const r = div(f.cxp, f.costoVentas + f.gastoAdm); return r === null ? null : r * dias(f); } },
  { id: 'dias_inventario', nombre: 'Días de inventario', grupo: 'Actividad', unidad: 'dias', mayorEsMejor: false,
    descripcion: 'Inventarios / Costo de ventas × días.', calcular: f => { const r = div(f.inventarios, f.costoVentas); return r === null ? null : r * dias(f); } },
  { id: 'rotacion_inventario', nombre: 'Rotación de inventario', grupo: 'Actividad', unidad: 'x', mayorEsMejor: true,
    descripcion: 'Costo de ventas anualizado / Inventarios.', calcular: f => div(f.costoVentas * 12 / f.meses, f.inventarios) },
  { id: 'rotacion_activos', nombre: 'Rotación de activos', grupo: 'Actividad', unidad: 'x', mayorEsMejor: true,
    descripcion: 'Ingresos anualizados / Activo total.', calcular: f => div(f.ingresos * 12 / f.meses, f.activoTotal) },
  { id: 'ciclo_caja', nombre: 'Ciclo de conversión de caja', grupo: 'Actividad', unidad: 'dias', mayorEsMejor: false,
    descripcion: 'Días de cobro + Días de inventario − Días de pago.',
    calcular: f => {
      const dc = div(f.cxc, f.ingresos), di = div(f.inventarios, f.costoVentas), dp = div(f.cxp, f.costoVentas + f.gastoAdm);
      if (dc === null) return null;
      return (dc + (di || 0) - (dp || 0)) * dias(f);
    } },

  { id: 'crecimiento_mensual', nombre: 'Crecimiento de ingresos (último mes)', grupo: 'Crecimiento', unidad: 'pct', mayorEsMejor: true, min: 0,
    descripcion: 'Variación de los ingresos del último mes cerrado versus el mes anterior.',
    calcular: f => { const a = f.ingresosMes[f.meses - 1], b = f.ingresosMes[f.meses - 2]; return f.meses < 2 || !b ? null : ((a - b) / Math.abs(b)) * 100; } },
  { id: 'ingreso_promedio', nombre: 'Ingreso promedio mensual', grupo: 'Crecimiento', unidad: 'clp', mayorEsMejor: true,
    descripcion: 'Ingresos acumulados / meses transcurridos.', calcular: f => f.ingresos / f.meses },

  { id: 'burn_rate', nombre: 'Burn rate mensual', grupo: 'Caja (Startup)', unidad: 'clp', mayorEsMejor: false,
    descripcion: 'Pérdida mensual promedio (gastos − ingresos). Si la empresa gana, es 0.', calcular: f => Math.max(0, -f.resultado / f.meses) },
  { id: 'runway', nombre: 'Runway (meses de caja)', grupo: 'Caja (Startup)', unidad: 'meses', mayorEsMejor: true, min: 6,
    descripcion: 'Efectivo / Burn rate. Meses que alcanza la caja al ritmo actual.', calcular: f => { const b = Math.max(0, -f.resultado / f.meses); return b > 0 ? f.efectivo / b : null; } },
  { id: 'mrr', nombre: 'Ingreso recurrente aprox. (MRR)', grupo: 'Caja (Startup)', unidad: 'clp', mayorEsMejor: true,
    descripcion: 'Ingresos del último mes cerrado. Es una aproximación: toma todos los ingresos ordinarios como recurrentes.', calcular: f => f.ingresosMes[f.meses - 1] },
  { id: 'arr', nombre: 'ARR aprox. (MRR × 12)', grupo: 'Caja (Startup)', unidad: 'clp', mayorEsMejor: true,
    descripcion: 'Ingreso recurrente anualizado, a partir del MRR aproximado.', calcular: f => f.ingresosMes[f.meses - 1] * 12 },
  { id: 'crecimiento_3m', nombre: 'Crecimiento 3 meses (CMGR)', grupo: 'Caja (Startup)', unidad: 'pct', mayorEsMejor: true, min: 0,
    descripcion: 'Crecimiento mensual compuesto de ingresos en los últimos 3 meses.',
    calcular: f => { if (f.meses < 4) return null; const a = prom(f.ingresosMes.slice(f.meses - 3, f.meses), 3), b = prom(f.ingresosMes.slice(f.meses - 6 < 0 ? 0 : f.meses - 6, f.meses - 3), 3); return b > 0 && a > 0 ? (Math.pow(a / b, 1 / 3) - 1) * 100 : null; } },
  { id: 'eficiencia_burn', nombre: 'Eficiencia del burn (burn multiple)', grupo: 'Caja (Startup)', unidad: 'x', mayorEsMejor: false, max: 2,
    descripcion: 'Burn mensual / Ingreso nuevo mensual. Menor es mejor. Requiere ingresos crecientes.',
    calcular: f => { const a = f.ingresosMes[f.meses - 1], b = f.ingresosMes[f.meses - 2]; const nuevo = a - b; const burn = Math.max(0, -f.resultado / f.meses); return f.meses > 1 && nuevo > 0 && burn > 0 ? burn / nuevo : null; } }
];

export const KPI_POR_ID = new Map(KPI_CATALOGO.map(k => [k.id, k]));

// ───────────────────────── Paquetes ─────────────────────────
export interface KpiPack { id: string; nombre: string; descripcion: string; kpis: string[]; }

export const KPI_PAQUETES: KpiPack[] = [
  { id: 'base', nombre: 'Básico (todas las empresas)', descripcion: 'Los indicadores más comunes de liquidez, deuda y rentabilidad.',
    kpis: ['razon_corriente', 'prueba_acida', 'capital_trabajo', 'deuda_patrimonio', 'margen_bruto', 'margen_operacional', 'margen_neto', 'roe', 'resultado', 'ebitda'] },
  { id: 'comercio', nombre: 'Comercio / Retail', descripcion: 'Foco en inventario, margen y ciclo de caja.',
    kpis: ['razon_corriente', 'prueba_acida', 'margen_bruto', 'margen_operacional', 'dias_inventario', 'rotacion_inventario', 'dias_cobro', 'dias_pago', 'ciclo_caja', 'punto_equilibrio', 'resultado'] },
  { id: 'servicios', nombre: 'Servicios profesionales', descripcion: 'Foco en costo de personal, cobranza y márgenes.',
    kpis: ['razon_corriente', 'margen_operacional', 'margen_neto', 'personal_ingresos', 'gasto_adm_ingresos', 'dias_cobro', 'punto_equilibrio', 'ebitda', 'crecimiento_mensual', 'resultado'] },
  { id: 'construccion', nombre: 'Construcción / Proyectos', descripcion: 'Foco en capital de trabajo, endeudamiento y cobranza.',
    kpis: ['razon_corriente', 'capital_trabajo', 'deuda_patrimonio', 'deuda_fin_ebitda', 'cobertura_intereses', 'margen_bruto', 'margen_operacional', 'dias_cobro', 'dias_pago', 'resultado'] },
  { id: 'restaurantes', nombre: 'Restaurantes / Gastronomía', descripcion: 'Foco en costo de ventas, personal y rotación de inventario.',
    kpis: ['margen_bruto', 'personal_ingresos', 'gasto_adm_ingresos', 'margen_operacional', 'rotacion_inventario', 'dias_pago', 'punto_equilibrio', 'efectivo', 'resultado'] },
  { id: 'startup', nombre: 'Startup', descripcion: 'Caja, burn, runway y crecimiento. MRR/ARR son aproximados; CAC, LTV y churn requieren datos de clientes (próxima etapa).',
    kpis: ['efectivo', 'burn_rate', 'runway', 'mrr', 'arr', 'crecimiento_mensual', 'crecimiento_3m', 'eficiencia_burn', 'margen_bruto', 'resultado'] }
];

export const KPI_PAQUETE_DEFECTO = 'base';

export interface KpiConfig { pack: string; enabled: string[]; }

export function configPorDefecto(): KpiConfig {
  return { pack: KPI_PAQUETE_DEFECTO, enabled: [...KPI_PAQUETES[0].kpis] };
}

export type Semaforo = 'ok' | 'alerta' | 'neutro';
export function semaforo(k: KpiDef, v: number | null): Semaforo {
  if (v === null || !isFinite(v)) return 'neutro';
  if (k.min !== undefined && v < k.min) return 'alerta';
  if (k.max !== undefined && v > k.max) return 'alerta';
  if (k.min === undefined && k.max === undefined) return 'neutro';
  return 'ok';
}

export function formatKpi(k: KpiDef, v: number | null): string {
  if (v === null || !isFinite(v)) return 'Sin datos';
  switch (k.unidad) {
    case 'x': return v.toLocaleString('es-CL', { maximumFractionDigits: 2 }) + 'x';
    case 'pct': return v.toLocaleString('es-CL', { maximumFractionDigits: 1 }) + '%';
    case 'dias': return Math.round(v).toLocaleString('es-CL') + ' días';
    case 'meses': return v.toLocaleString('es-CL', { maximumFractionDigits: 1 }) + ' meses';
    default: return '$' + Math.round(v).toLocaleString('es-CL');
  }
}
