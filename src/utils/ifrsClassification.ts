// Motor ÚNICO de clasificación contable para los informes IFRS (Estado de Situación Financiera y
// Estado de Resultados). Antes cada informe tenía sus propias reglas y se contradecían
// (p. ej. el Balance trataba el código "5" como gasto y el Estado de Resultados como ingreso).
//
// Criterio de naturaleza (en este orden):
//   1. Convención por el PRIMER DÍGITO del código (cada contador tiene su propio plan, pero esto es común):
//        1 Activo · 2 Pasivo (23 = Patrimonio) · 3 Ingresos · 4 Gastos
//   2. Si el código no entra en la convención (p. ej. empieza con 5, 6… o no es numérico): el "Tipo" de la cuenta
//   3. Columna del Balance de 8 columnas (Activo/Pasivo/Pérdida/Ganancia)
//   4. Por el nombre
//
// El rubro IFRS dentro de cada sección NO depende de subcódigos (cada plan es distinto): se toma del rubro
// escrito en la cuenta, o del nombre de la cuenta. Los subcódigos solo se usan como último recurso.
//
// El resultado del ejercicio (Ingresos − Gastos) se presenta DENTRO del Patrimonio.

import type { ChartOfAccount } from '../types';

export type Naturaleza = 'ACTIVO' | 'PASIVO' | 'PATRIMONIO' | 'INGRESO' | 'GASTO';

const norm = (s?: string) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const digits = (code?: string) => (code || '').replace(/\D/g, '');

// ───────────────────────── Naturaleza ─────────────────────────

export function naturalezaPorTipo(tipo?: string): Naturaleza | null {
  const t = norm(tipo);
  if (!t) return null;
  if (t.includes('patrimonio') || t.includes('capital')) return 'PATRIMONIO';
  if (t.includes('activo')) return 'ACTIVO';
  if (t.includes('pasivo')) return 'PASIVO';
  if (t.includes('ingreso') || t.includes('ganancia') || t.includes('venta')) return 'INGRESO';
  if (t.includes('gasto') || t.includes('costo') || t.includes('perdida')) return 'GASTO';
  return null;
}

/** Convención de la contadora: 1 Activo · 2 Pasivo · 23 Patrimonio · 3 Ingresos · 4 Gastos. */
export function naturalezaPorCodigo(code?: string): Naturaleza | null {
  const d = digits(code);
  if (!d) return null;
  if (d[0] === '1') return 'ACTIVO';
  if (d[0] === '2') return d.startsWith('23') ? 'PATRIMONIO' : 'PASIVO';
  if (d[0] === '3') return 'INGRESO';
  if (d[0] === '4') return 'GASTO';
  return null; // 5, 6… no tienen significado en la convención
}

/** Clasificación IFRS escrita en la cuenta (1xxx Activo · 2xxx Pasivo, 23xx Patrimonio · 3xxx Ingresos · 4xxx Gastos). */
export function naturalezaPorIFRS(ifrs?: string): Naturaleza | null {
  const d = digits(ifrs);
  if (d.length < 4) return null;
  return naturalezaPorCodigo(d);
}

export function getNaturaleza(account: Pick<ChartOfAccount, 'code' | 'type' | 'name'> & { blce8Columnas?: string; codigoIFRS?: string }): Naturaleza {
  const porCodigo = naturalezaPorCodigo(account.code);
  if (porCodigo) return porCodigo;
  // Código propio fuera de la convención (ej: 5101001): manda la clasificación IFRS de la cuenta
  const porIFRS = naturalezaPorIFRS(account.codigoIFRS);
  if (porIFRS) return porIFRS;
  const porTipo = naturalezaPorTipo(account.type);
  if (porTipo) return porTipo;
  const b = norm(account.blce8Columnas);
  if (b === 'activo') return 'ACTIVO';
  if (b === 'pasivo') return 'PASIVO';
  if (b === 'ganancia') return 'INGRESO';
  if (b === 'perdida') return 'GASTO';
  const n = norm(account.name);
  if (/ingreso|venta|ganancia/.test(n)) return 'INGRESO';
  return 'GASTO';
}

// ───────────────── Estado de Situación Financiera ─────────────────

export type SeccionESF = 'ACTIVO_CORRIENTE' | 'ACTIVO_NO_CORRIENTE' | 'PASIVO_CORRIENTE' | 'PASIVO_NO_CORRIENTE' | 'PATRIMONIO';

export interface RubroDef {
  id: string;
  code: string;
  name: string;
  seccion?: SeccionESF;
}

// Denominaciones según NIC 1 / formato CMF
export const RUBROS_ESF: RubroDef[] = [
  { id: '1101', code: '1101000', name: 'Efectivo y Equivalentes al Efectivo', seccion: 'ACTIVO_CORRIENTE' },
  { id: '1102', code: '1102000', name: 'Deudores Comerciales y Otras Cuentas por Cobrar, Corrientes', seccion: 'ACTIVO_CORRIENTE' },
  { id: '1103', code: '1103000', name: 'Inventarios Corrientes', seccion: 'ACTIVO_CORRIENTE' },
  { id: '1104', code: '1104000', name: 'Activos por Impuestos Corrientes (IVA Crédito, PPM, Remanente)', seccion: 'ACTIVO_CORRIENTE' },
  { id: '1105', code: '1105000', name: 'Otros Activos Financieros y No Financieros, Corrientes', seccion: 'ACTIVO_CORRIENTE' },
  { id: '1201', code: '1201000', name: 'Propiedades, Planta y Equipo (neto de depreciación)', seccion: 'ACTIVO_NO_CORRIENTE' },
  { id: '1202', code: '1202000', name: 'Activos Intangibles distintos de la Plusvalía', seccion: 'ACTIVO_NO_CORRIENTE' },
  { id: '1203', code: '1203000', name: 'Inversiones y Otros Activos No Corrientes', seccion: 'ACTIVO_NO_CORRIENTE' },
  { id: '2101', code: '2101000', name: 'Cuentas Comerciales y Otras Cuentas por Pagar, Corrientes', seccion: 'PASIVO_CORRIENTE' },
  { id: '2102', code: '2102000', name: 'Otros Pasivos Financieros, Corrientes (Préstamos Bancarios)', seccion: 'PASIVO_CORRIENTE' },
  { id: '2103', code: '2103000', name: 'Pasivos por Impuestos Corrientes (IVA Débito, Retenciones, F29)', seccion: 'PASIVO_CORRIENTE' },
  { id: '2104', code: '2104000', name: 'Provisiones por Beneficios a los Empleados, Corrientes', seccion: 'PASIVO_CORRIENTE' },
  { id: '2105', code: '2105000', name: 'Otros Pasivos No Financieros, Corrientes', seccion: 'PASIVO_CORRIENTE' },
  { id: '2201', code: '2201000', name: 'Otros Pasivos Financieros, No Corrientes', seccion: 'PASIVO_NO_CORRIENTE' },
  { id: '2202', code: '2202000', name: 'Pasivos por Impuestos Diferidos y Otros No Corrientes', seccion: 'PASIVO_NO_CORRIENTE' },
  { id: '2301', code: '2301000', name: 'Capital Emitido', seccion: 'PATRIMONIO' },
  { id: '2302', code: '2302000', name: 'Otras Reservas', seccion: 'PATRIMONIO' },
  { id: '2303', code: '2303000', name: 'Ganancias (Pérdidas) Acumuladas', seccion: 'PATRIMONIO' }
];

// Palabras clave del texto libre "Rubro Balance" que el usuario escribe en la cuenta
const TEXTO_RUBRO_ESF: Array<[RegExp, string]> = [
  [/efectivo|equivalente/, '1101'],
  [/deudores|por cobrar|cobrar/, '1102'],
  [/inventario|existencia/, '1103'],
  [/impuesto.*(corriente|activo)|activo.*impuesto/, '1104'],
  [/propiedad|planta|equipo|fijo/, '1201'],
  [/intangible|plusvalia/, '1202'],
  [/impuesto.*diferido|diferido/, '2202'],
  [/financiero.*no corriente|largo plazo/, '2201'],
  [/financiero|prestamo|obligaciones con/, '2102'],
  [/impuesto.*(corriente|pasivo)|pasivo.*impuesto/, '2103'],
  [/beneficio.*empleado|provision.*(laboral|empleado)|remuneracion/, '2104'],
  [/comerciales|proveedor|por pagar/, '2101'],
  [/capital/, '2301'],
  [/reserva/, '2302'],
  [/acumulad|resultado/, '2303']
];

// Código IFRS de la plantilla del sistema → rubro del informe
const CODIGO_IFRS_ESF: Record<string, Record<string, string>> = {
  ACTIVO: { '1101': '1101', '1102': '1102', '1105': '1104', '1201': '1201', '1202': '1202', '1203': '1203' },
  PASIVO: { '2101': '2101', '2102': '2103', '2103': '2104', '2201': '2201', '2202': '2202' },
  PATRIMONIO: { '3101': '2301', '3102': '2303', '2301': '2301', '2302': '2302', '2303': '2303' }
};

const esIVA = (n: string) => /\biva\b|credito fiscal|debito fiscal|remanente|\bppm\b|pagos? provisional/.test(n);

export function getRubroESF(account: ChartOfAccount): string {
  const nat = getNaturaleza(account);
  const n = norm(account.name);
  const d = digits(account.code);
  const p2 = d.slice(0, 2);

  // 1. Rubro escrito por el usuario en la cuenta
  const txt = norm(account.rubroBalance);
  if (txt) {
    for (const [re, id] of TEXTO_RUBRO_ESF) {
      const def = RUBROS_ESF.find(r => r.id === id)!;
      const esDeNat =
        (nat === 'ACTIVO' && def.seccion?.startsWith('ACTIVO')) ||
        (nat === 'PASIVO' && def.seccion?.startsWith('PASIVO')) ||
        (nat === 'PATRIMONIO' && def.seccion === 'PATRIMONIO');
      if (esDeNat && re.test(txt)) return id;
    }
  }

  // 1b. Pasivos: palabras clave claras del nombre prevalecen sobre códigos de plantilla
  //     (cada contador numera distinto: no se puede inferir el rubro desde el código)
  if (nat === 'PASIVO') {
    if (/diferido/.test(n)) return '2202';
    if (/honorarios? por pagar|facturas? por pagar|proveedor/.test(n)) return '2101';
    if (/prestamo|linea de credito|tarjeta (de )?credito|credito (bancario|itau|santander|bci|estado|chile)|sobregiro|leasing|obligacion.*banco/.test(n)) return p2 === '22' ? '2201' : '2102';
    if (/remuneracion|sueldo|\bafp\b|isapre|fonasa|ccaf|caja de compensacion|seguro.*vida|cuotas? sindical|colecta|mutual|leyes sociales|imposicion|previred|feriado|vacacion|gratificacion|finiquito/.test(n)) return '2104';
  }

  // 2. Código IFRS de la plantilla
  const ifrs = (account.codigoIFRS || '').trim();
  const mapa = CODIGO_IFRS_ESF[nat];
  if (mapa && ifrs && mapa[ifrs]) return mapa[ifrs];

  if (nat === 'ACTIVO') {
    if (/depreciacion acumulada|amortizacion acumulada|terreno|vehiculo|maquinaria|edificio|construccion|mobiliario|equipos?\b|instalacion|activo fijo|propiedad|planta/.test(n) && !/por cobrar|clientes/.test(n)) return '1201';
    if (/intangible|software|marca|licencia|plusvalia|derecho de llave/.test(n)) return '1202';
    if (/inversion|asociada|propiedad de inversion|garantia.*largo|largo plazo|no corriente/.test(n)) return '1203';
    if (/\bcaja\b|banco|efectivo|tesoreria|fondo fijo|fondos por rendir|deposito a plazo|inversion.*(liquida|corto)/.test(n)) return '1101';
    if (esIVA(n) || /impuesto/.test(n)) return '1104';
    if (/inventario|mercaderia|existencia|materia prima|producto terminado/.test(n)) return '1103';
    if (/cliente|deudor|por cobrar|documentos? por cobrar|factura|anticipo|prestamo.*(trabajador|empleado)|cheque/.test(n)) return '1102';
    if (p2 === '12') return '1201';
    // estructura del código (plantilla: 1101 efectivo, 1102 deudores, 1103 docs/inventarios, 1104 impuestos)
    const p4 = d.slice(0, 4);
    if (p4 === '1101') return '1101';
    if (p4 === '1102') return '1102';
    if (p4 === '1104') return '1104';
    return '1105';
  }

  if (nat === 'PASIVO') {
    if (/diferido/.test(n)) return '2202';
    if (p2 === '22' || /largo plazo|hipotecari|no corriente/.test(n)) return '2201';
    if (esIVA(n) || /impuesto|retencion|f29|iva/.test(n)) return '2103';
    if (/sueldo|remuneracion|leyes sociales|imposicion|previred|honorario|feriado|vacacion|gratificacion|finiquito|\bafp\b|isapre|mutual/.test(n)) return '2104';
    if (/prestamo|credito|linea de credito|sobregiro|leasing|obligacion.*banco|banco.*obligacion|tarjeta/.test(n)) return '2102';
    if (/proveedor|por pagar|acreedor|honorarios? por pagar|factura/.test(n)) return '2101';
    const p4 = d.slice(0, 4);
    if (p4 === '2101') return '2101';
    if (p4 === '2102') return '2103';
    if (p4 === '2103') return '2104';
    return '2105';
  }

  // PATRIMONIO
  if (/capital/.test(n)) return '2301';
  if (/reserva|revalorizacion|otras? reservas/.test(n)) return '2302';
  return '2303';
}

// ───────────────────── Estado de Resultados ─────────────────────

export type RubroERId =
  | 'INGRESOS_ORD'
  | 'COSTO_VENTAS'
  | 'GASTO_PERSONAL'
  | 'GASTO_ADM'
  | 'DEPRECIACION'
  | 'ING_FIN'
  | 'COSTO_FIN'
  | 'OTROS_ING'
  | 'OTROS_GASTOS'
  | 'IMPUESTO';

const TEXTO_RUBRO_ER: Array<[RegExp, RubroERId]> = [
  [/ingreso.*ordinari|ventas?|explotacion/, 'INGRESOS_ORD'],
  [/costo.*venta|costo.*explotacion/, 'COSTO_VENTAS'],
  [/personal|remuneracion/, 'GASTO_PERSONAL'],
  [/depreciacion|amortizacion/, 'DEPRECIACION'],
  [/administracion|distribucion/, 'GASTO_ADM'],
  [/costo.*financiero|gasto.*financiero|interes/, 'COSTO_FIN'],
  [/ingreso.*financiero|reajuste|diferencia de cambio/, 'ING_FIN'],
  [/impuesto|ganancias/, 'IMPUESTO'],
  [/otros? ingreso|otras? ganancia/, 'OTROS_ING'],
  [/otros? gasto|otras? perdida/, 'OTROS_GASTOS']
];

export function getRubroER(account: ChartOfAccount): RubroERId {
  const nat = getNaturaleza(account);
  const esIngreso = nat === 'INGRESO';
  const n = norm(account.name);
  const d = digits(account.code);

  // 1. Rubro escrito por el usuario
  const txt = norm(account.rubroResultado);
  if (txt) {
    for (const [re, id] of TEXTO_RUBRO_ER) {
      const ok = esIngreso
        ? ['INGRESOS_ORD', 'ING_FIN', 'OTROS_ING'].includes(id)
        : !['INGRESOS_ORD', 'ING_FIN', 'OTROS_ING'].includes(id);
      if (ok && re.test(txt)) return id;
    }
  }

  // 2. Palabras clave fuertes del nombre (prevalecen sobre códigos de plantilla inconsistentes)
  if (esIngreso) {
    if (/interes|financier|reajuste|diferencia de cambio|utilidad.*cambio|correccion monetaria|dividend/.test(n)) return 'ING_FIN';
    if (/fuera de (la )?explotacion|no operacional|otros? ingreso|otras? ganancia|venta.*activo|arriendo.*recibido|recuperacion|bonificacion/.test(n)) return 'OTROS_ING';
    return 'INGRESOS_ORD';
  }
  if (/impuesto a la renta|impuesto.*primera categoria|gasto por impuesto|impuesto renta|impuesto diferido/.test(n)) return 'IMPUESTO';
  if (/depreciacion|amortizacion/.test(n)) return 'DEPRECIACION';
  if (/interes|gasto.*bancario|comision.*banc|financier|reajuste|diferencia de cambio|perdida.*cambio|correccion monetaria|mantencion.*cuenta/.test(n)) return 'COSTO_FIN';
  if (/costo de venta|costo directo|costo.*explotacion|mercaderia vendida|costo.*mercaderia|costo de produccion|materia prima consumida/.test(n)) return 'COSTO_VENTAS';
  if (/fuera de (la )?explotacion|no operacional|otros? gasto|otras? perdida|multa|castigo|perdida.*venta/.test(n)) return 'OTROS_GASTOS';
  if (/sueldo|remuneracion|gratificacion|leyes sociales|imposicion|previred|honorario|bono|aguinaldo|colacion|movilizacion|finiquito|indemnizacion|vacacion|capacitacion|personal/.test(n)) return 'GASTO_PERSONAL';

  // 3. Código IFRS de la plantilla (gastos: 4101 costo ventas, 4201 personal, 4202 admin)
  const ifrs = (account.codigoIFRS || '').trim();
  if (ifrs === '4101') return 'COSTO_VENTAS';
  if (ifrs === '4201') return 'GASTO_PERSONAL';
  if (ifrs === '4202') return 'GASTO_ADM';

  // 4. Estructura del código
  const p2 = d.slice(0, 2);
  if (p2 === '41') return 'COSTO_VENTAS';
  return 'GASTO_ADM';
}

// ─────────────────── Revisión de la clasificación ───────────────────

export interface HallazgoClasificacion {
  account: ChartOfAccount;
  naturaleza: Naturaleza;
  rubro: string;
  tipo: 'CONVENCION' | 'SIN_TIPO' | 'ANTIGUO_5';
  detalle: string;
}

/** Lista cuentas cuyo "Tipo" contradice la convención del código (el informe usa el código) o que no entran en la convención. */
export function revisarClasificacion(accounts: ChartOfAccount[]): HallazgoClasificacion[] {
  const out: HallazgoClasificacion[] = [];
  accounts.forEach(a => {
    if (!digits(a.code)) return;
    const nat = getNaturaleza(a);
    const rubro = nat === 'INGRESO' || nat === 'GASTO' ? getRubroER(a) : getRubroESF(a);
    const conv = naturalezaPorCodigo(a.code);
    const tipo = naturalezaPorTipo(a.type);
    if (conv && tipo && conv !== tipo) {
      out.push({ account: a, naturaleza: nat, rubro, tipo: 'CONVENCION', detalle: `Su Tipo dice ${tipo.toLowerCase()}, pero por el código (${a.code}) es ${conv.toLowerCase()}. El informe usó el código.` });
    } else if (!conv && digits(a.code)[0] === '5') {
      out.push({ account: a, naturaleza: nat, rubro, tipo: 'ANTIGUO_5', detalle: naturalezaPorIFRS(a.codigoIFRS) ? `Código fuera de la convención (empieza con 5). Se usó su clasificación IFRS (${a.codigoIFRS}).` : tipo ? 'Código fuera de la convención (empieza con 5). Se usó el Tipo de la cuenta.' : 'Código fuera de la convención y sin Tipo; se clasificó por su nombre.' });
    } else if (!conv && !tipo) {
      out.push({ account: a, naturaleza: nat, rubro, tipo: 'SIN_TIPO', detalle: 'Código fuera de la convención y sin Tipo; se clasificó por su nombre.' });
    }
  });
  return out;
}
