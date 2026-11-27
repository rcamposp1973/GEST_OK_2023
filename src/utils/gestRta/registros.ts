/**
 * Registros de rentas empresariales (Art. 14 A N° 2 y Art. 14 D N° 3 letra d) LIR): RAI, DDAN, REX y SAC.
 * Propuesta referencial: el contador revisa cada saldo antes de informarlo (F22 / DJ 1948).
 *
 * - RAI (rentas afectas a impuestos finales) = CPT final + retiros del año − capital aportado reajustado − REX. Si es negativo, 0.
 * - Imputación de retiros: primero a RAI (con crédito SAC), luego DDAN (sólo 14 A), luego REX y por último capital;
 *   lo que exceda queda como retiro en exceso (afecto, sin crédito).
 * - SAC: el crédito por IDPC asignado a los retiros imputados a RAI = monto × t/(1−t), con tope en el SAC disponible.
 *   El IDPC del año ingresa al SAC al cierre (queda para los retiros del año siguiente).
 */
export type RegimenRegistros = '14_D3' | '14_A';

export interface SaldosRegistros {
  rai: number; ddan: number; rex: number;
  sacConDevolucion: number; sacSinDevolucion: number;
  capitalAportado: number;
}

export interface MovimientosRegistros {
  /** % de reajuste de los saldos iniciales (el mismo del CPT inicial que publica el SII; 2025: 3,4%). */
  reajusteInicialPct: number;
  aumentosCapital: number;
  disminucionesCapital: number;
  /** Rentas exentas e ingresos no constitutivos de renta del año que van a REX. */
  rexDelAnio: number;
  /** Diferencia depreciación acelerada vs normal del año (sólo 14 A). */
  ddanDelAnio: number;
  /** Retiros, remesas o distribuciones del año. */
  retiros: number;
}

export interface ResultadoRegistros {
  iniciales: SaldosRegistros;
  capitalReajustado: number;
  raiDeterminado: number;
  imputacion: { rai: number; ddan: number; rex: number; capital: number; exceso: number };
  factorCredito: number;
  sacAsignado: number;
  finales: SaldosRegistros;
  avisos: string[];
}

export const factorCreditoIdpc = (tasaPct: number) => {
  const t = (Number(tasaPct) || 0) / 100;
  return t > 0 && t < 1 ? Math.round((t / (1 - t)) * 1e6) / 1e6 : 0;
};

/** Porcentaje de reajuste del CPT inicial publicado por el SII, por año comercial. */
export const REAJUSTE_CPT_INICIAL_PCT: Record<number, number> = { 2024: 4.2, 2025: 3.4 };

export function calcularRegistros(
  regimen: RegimenRegistros,
  saldos: SaldosRegistros,
  mov: MovimientosRegistros,
  datos: { cptFinal: number; idpcDelAnio: number; tasaIdpc: number },
): ResultadoRegistros {
  const r = 1 + (Number(mov.reajusteInicialPct) || 0) / 100;
  const re = (n: number) => Math.round((Number(n) || 0) * r);
  const iniciales: SaldosRegistros = {
    rai: re(saldos.rai), ddan: regimen === '14_A' ? re(saldos.ddan) : 0, rex: re(saldos.rex),
    sacConDevolucion: re(saldos.sacConDevolucion), sacSinDevolucion: re(saldos.sacSinDevolucion),
    capitalAportado: re(saldos.capitalAportado),
  };
  const avisos: string[] = [];
  const capitalReajustado = Math.max(0, iniciales.capitalAportado + Math.round(Number(mov.aumentosCapital) || 0) - Math.round(Number(mov.disminucionesCapital) || 0));
  const rexDisponible = Math.max(0, iniciales.rex + Math.round(Number(mov.rexDelAnio) || 0));
  const ddanDisponible = regimen === '14_A' ? Math.max(0, iniciales.ddan + Math.round(Number(mov.ddanDelAnio) || 0)) : 0;
  const retiros = Math.max(0, Math.round(Number(mov.retiros) || 0));
  const raiDeterminado = Math.max(0, Math.round((Number(datos.cptFinal) || 0) + retiros - capitalReajustado - rexDisponible));
  if ((Number(datos.cptFinal) || 0) < 0) avisos.push('El CPT final es negativo: no hay rentas afectas (RAI = 0).');

  // Imputación de retiros
  let resto = retiros;
  const tomar = (disp: number) => { const t = Math.min(resto, Math.max(0, disp)); resto -= t; return t; };
  const imp = { rai: tomar(raiDeterminado), ddan: tomar(ddanDisponible), rex: tomar(rexDisponible), capital: tomar(capitalReajustado), exceso: 0 };
  imp.exceso = resto;
  if (imp.exceso > 0) avisos.push(`Retiros en exceso por $${imp.exceso.toLocaleString('es-CL')}: no tienen saldo que los cubra (revisar Art. 14 A N° 2 letra d).`);

  // Crédito SAC asignado: primero el que no da derecho a devolución, luego el con devolución (orden de imputación del SAC)
  const factorCredito = factorCreditoIdpc(datos.tasaIdpc);
  let porAsignar = Math.round((imp.rai + imp.ddan) * factorCredito);
  const deSin = Math.min(porAsignar, iniciales.sacSinDevolucion); porAsignar -= deSin;
  const deCon = Math.min(porAsignar, iniciales.sacConDevolucion);
  const sacAsignado = deSin + deCon;
  if (imp.rai > 0 && sacAsignado < Math.round(imp.rai * factorCredito)) avisos.push('El SAC disponible no alcanza para todo el crédito de los retiros imputados a RAI.');

  const idpc = Math.max(0, Math.round(Number(datos.idpcDelAnio) || 0));
  const finales: SaldosRegistros = {
    rai: Math.max(0, raiDeterminado - imp.rai),
    ddan: Math.max(0, ddanDisponible - imp.ddan),
    rex: Math.max(0, rexDisponible - imp.rex),
    sacSinDevolucion: iniciales.sacSinDevolucion - deSin,
    // El IDPC pagado del año ingresa como crédito con derecho a devolución (salvo créditos especiales, que el contador ajusta)
    sacConDevolucion: iniciales.sacConDevolucion - deCon + idpc,
    capitalAportado: Math.max(0, capitalReajustado - imp.capital),
  };
  return { iniciales, capitalReajustado, raiDeterminado, imputacion: imp, factorCredito, sacAsignado, finales, avisos };
}
