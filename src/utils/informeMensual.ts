// Informe mensual con "foto fija": cifras de un mes congeladas junto con los comentarios del contador.
// La contabilidad manda: la foto no cambia, pero el sistema compara con la contabilidad de hoy y avisa si ya no coincide.
import type { ChartOfAccount, Voucher } from '../types';
import {
  calcularFiguras, KPI_POR_ID, configPorDefecto, formatKpi, semaforo, KpiConfig, KpiFigures, KpiInputs, KpiUnit, Semaforo,
} from './kpiEngine';

export interface LineaInforme { id: string; nombre: string; tipo: 'linea' | 'subtotal' | 'total'; mes?: number; acum: number; anterior: number }
export interface KpiInforme { id: string; nombre: string; grupo: string; unidad: KpiUnit; valor: number | null; texto: string; semaforo: Semaforo }
export interface InformeCifras {
  anio: number; mes: number;
  resultado: LineaInforme[];
  balance: LineaInforme[];
  kpis: KpiInforme[];
}
export interface InformeGuardado {
  id: string; anio: number; mes: number; version: number;
  creadoEn: string; creadoPor: string; actualizadoEn?: string;
  cifras: InformeCifras;
  comentarios: { general?: string; resultados?: string; balance?: string; kpis?: string };
}

export const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const RESULTADO: { id: keyof KpiFigures; nombre: string; tipo: LineaInforme['tipo'] }[] = [
  { id: 'ingresos', nombre: 'Ingresos de actividades ordinarias', tipo: 'linea' },
  { id: 'costoVentas', nombre: 'Costo de ventas', tipo: 'linea' },
  { id: 'margenBruto', nombre: 'Margen bruto', tipo: 'subtotal' },
  { id: 'gastoPersonal', nombre: 'Gastos de personal', tipo: 'linea' },
  { id: 'gastoAdm', nombre: 'Gastos de administración', tipo: 'linea' },
  { id: 'depreciacion', nombre: 'Depreciación y amortización', tipo: 'linea' },
  { id: 'ebit', nombre: 'Resultado operacional', tipo: 'subtotal' },
  { id: 'ingFin', nombre: 'Ingresos financieros', tipo: 'linea' },
  { id: 'costoFin', nombre: 'Costos financieros', tipo: 'linea' },
  { id: 'otrosIng', nombre: 'Otras ganancias', tipo: 'linea' },
  { id: 'otrosGastos', nombre: 'Otras pérdidas', tipo: 'linea' },
  { id: 'impuesto', nombre: 'Impuesto a las ganancias', tipo: 'linea' },
  { id: 'resultado', nombre: 'Resultado del ejercicio', tipo: 'total' },
];
const BALANCE: { id: keyof KpiFigures; nombre: string; tipo: LineaInforme['tipo'] }[] = [
  { id: 'efectivo', nombre: 'Efectivo y equivalentes', tipo: 'linea' },
  { id: 'cxc', nombre: 'Cuentas por cobrar', tipo: 'linea' },
  { id: 'inventarios', nombre: 'Inventarios', tipo: 'linea' },
  { id: 'activoCorriente', nombre: 'Activo corriente', tipo: 'subtotal' },
  { id: 'activoNoCorriente', nombre: 'Activo no corriente', tipo: 'subtotal' },
  { id: 'activoTotal', nombre: 'Total activos', tipo: 'total' },
  { id: 'cxp', nombre: 'Cuentas por pagar', tipo: 'linea' },
  { id: 'deudaFinanciera', nombre: 'Deuda financiera', tipo: 'linea' },
  { id: 'pasivoCorriente', nombre: 'Pasivo corriente', tipo: 'subtotal' },
  { id: 'pasivoNoCorriente', nombre: 'Pasivo no corriente', tipo: 'subtotal' },
  { id: 'pasivoTotal', nombre: 'Total pasivos', tipo: 'total' },
  { id: 'patrimonio', nombre: 'Patrimonio (incluye resultado del ejercicio)', tipo: 'total' },
];
const num = (f: KpiFigures, k: keyof KpiFigures) => Number(f[k]) || 0;

/** Arma las cifras del informe de un mes con los mismos motores y reglas que los informes y KPIs. */
export function construirInforme(
  vouchers: Voucher[], accounts: ChartOfAccount[], anio: number, mes: number, inputs: KpiInputs = {}, kpiConfig?: KpiConfig,
): InformeCifras {
  const f = calcularFiguras(vouchers, accounts, anio, mes, inputs);
  const fMesAnt = mes > 1 ? calcularFiguras(vouchers, accounts, anio, mes - 1, inputs) : null;
  const fAnioAnt = calcularFiguras(vouchers, accounts, anio - 1, mes, inputs);

  const resultado: LineaInforme[] = RESULTADO.map(r => ({
    id: String(r.id), nombre: r.nombre, tipo: r.tipo,
    acum: num(f, r.id), anterior: num(fAnioAnt, r.id),
    mes: num(f, r.id) - (fMesAnt ? num(fMesAnt, r.id) : 0),
  }));
  const balance: LineaInforme[] = BALANCE.map(r => ({
    id: String(r.id), nombre: r.nombre, tipo: r.tipo, acum: num(f, r.id), anterior: num(fAnioAnt, r.id),
  }));

  const cfg = kpiConfig?.enabled?.length ? kpiConfig : configPorDefecto();
  const kpis: KpiInforme[] = [];
  cfg.enabled.forEach(id => {
    const k = KPI_POR_ID.get(id);
    if (!k) return;
    const valor = k.calcular(f);
    kpis.push({ id: k.id, nombre: k.nombre, grupo: k.grupo, unidad: k.unidad, valor, texto: formatKpi(k, valor), semaforo: semaforo(k, valor) });
  });
  return { anio, mes, resultado, balance, kpis };
}

export interface CambioContable { id: string; nombre: string; foto: number; hoy: number; diferencia: number }
/** Líneas cuyo valor acumulado cambió entre la foto y la contabilidad de hoy (la contabilidad manda). */
export function cambiosDesdeFoto(foto: InformeCifras, hoy: InformeCifras): CambioContable[] {
  const out: CambioContable[] = [];
  const comparar = (a: LineaInforme[], b: LineaInforme[]) => a.forEach(l => {
    const h = b.find(x => x.id === l.id);
    if (h && Math.abs(h.acum - l.acum) >= 1) out.push({ id: l.id, nombre: l.nombre, foto: l.acum, hoy: h.acum, diferencia: h.acum - l.acum });
  });
  comparar(foto.resultado, hoy.resultado);
  comparar(foto.balance, hoy.balance);
  return out;
}

/** Quita valores indefinidos (Firestore no los acepta). */
export function limpiarParaGuardar<T>(x: T): T { return JSON.parse(JSON.stringify(x)); }
