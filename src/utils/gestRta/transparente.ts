/**
 * Gest_Rta · Régimen Pro Pyme Transparente (Art. 14 letra D) N° 8 LIR).
 *
 * Propuesta del Recuadro N° 22 del F22 (base imponible sobre ingresos PERCIBIDOS y gastos PAGADOS), del Capital Propio
 * Tributario simplificado y de la asignación a los propietarios (DJ 1947).
 *
 * Reglas:
 *  - Cada monto automático muestra de dónde sale (RCV, cuentas corrientes de clientes/proveedores, liquidaciones).
 *  - El contador puede ajustar cualquier línea; el ajuste queda separado del monto propuesto.
 *  - Lo que el sistema no puede saber con certeza queda en 0 y como línea a completar: nada se inventa.
 *  - Es una propuesta: no se presenta al SII.
 */
import { repartirOtrosImpuestos } from '../otrosImpuestos';

export interface LineaRecuadro { codigo: string; glosa: string; tipo: 'ingreso' | 'egreso' | 'total'; auto?: boolean }

/**
 * Recuadro N° 22 del F22. Fuente: formulario F22 publicado por el SII (recuadro 22, códigos 1600 a 1630).
 * Los códigos se revisan cada año tributario contra el F22 oficial antes de la Operación Renta.
 */
export const RECUADRO_22: LineaRecuadro[] = [
  { codigo: '1600', glosa: 'Ingresos percibidos', tipo: 'ingreso', auto: true },
  { codigo: '1819', glosa: 'Ingresos del giro devengados en ejercicios anteriores y percibidos en el ejercicio actual', tipo: 'ingreso', auto: true },
  { codigo: '1601', glosa: 'Rentas de fuente extranjera percibidas', tipo: 'ingreso' },
  { codigo: '1602', glosa: 'Intereses y reajustes percibidos por préstamos y otros', tipo: 'ingreso' },
  { codigo: '1603', glosa: 'Mayor valor percibido por rescate o enajenación de inversiones o bienes no depreciables', tipo: 'ingreso' },
  { codigo: '1604', glosa: 'Dividendos o retiros percibidos en el ejercicio, por participaciones en otras empresas', tipo: 'ingreso' },
  { codigo: '1605', glosa: 'Incremento por IDPC y crédito total disponible por impuestos soportados en el extranjero', tipo: 'ingreso' },
  { codigo: '1606', glosa: 'Ingresos percibidos o devengados por operaciones con empresas relacionadas del art. 14 letra A) LIR', tipo: 'ingreso' },
  { codigo: '1607', glosa: 'Otros ingresos percibidos o devengados', tipo: 'ingreso' },
  { codigo: '1608', glosa: 'Ingreso diferido imputado en el ejercicio', tipo: 'ingreso' },
  { codigo: '1609', glosa: 'Crédito por activos fijos adquiridos en el ejercicio (art. 33 bis LIR)', tipo: 'ingreso' },
  { codigo: '1610', glosa: 'Total de ingresos anuales', tipo: 'total' },
  { codigo: '1611', glosa: 'Gasto por saldo inicial de existencias o insumos del negocio en cambio de régimen, pagados', tipo: 'egreso' },
  { codigo: '1612', glosa: 'Gasto por saldo inicial de activos fijos depreciables en cambio de régimen, pagados', tipo: 'egreso' },
  { codigo: '1613', glosa: 'Gasto por pérdida tributaria en cambio de régimen', tipo: 'egreso' },
  { codigo: '1614', glosa: 'Existencias, insumos y servicios del negocio, pagados', tipo: 'egreso', auto: true },
  { codigo: '1820', glosa: 'Existencias, insumos y servicios del negocio adeudados en ejercicios anteriores y pagados en el ejercicio actual', tipo: 'egreso', auto: true },
  { codigo: '1615', glosa: 'Gastos de rentas de fuente extranjera, pagados', tipo: 'egreso' },
  { codigo: '1616', glosa: 'Remuneraciones pagadas', tipo: 'egreso', auto: true },
  { codigo: '1617', glosa: 'Honorarios pagados', tipo: 'egreso', auto: true },
  { codigo: '1618', glosa: 'Adquisición de bienes del activo fijo, pagados', tipo: 'egreso', auto: true },
  { codigo: '1619', glosa: 'Servicios pagados', tipo: 'egreso' },
  { codigo: '1620', glosa: 'Arriendos pagados', tipo: 'egreso' },
  { codigo: '1621', glosa: 'Gastos por exigencias medio ambientales, pagados', tipo: 'egreso' },
  { codigo: '1622', glosa: 'Intereses y reajustes pagados por préstamos y otros', tipo: 'egreso' },
  { codigo: '1623', glosa: 'Amortización de intangibles (art. 22° transitorio bis Ley N° 21.210)', tipo: 'egreso' },
  { codigo: '1624', glosa: 'Pérdida en rescate o enajenación de inversiones o bienes no depreciables', tipo: 'egreso' },
  { codigo: '1625', glosa: 'Otros gastos deducibles de los ingresos', tipo: 'egreso' },
  { codigo: '1626', glosa: 'Gastos o egresos pagados o adeudados por operaciones con empresas relacionadas del art. 14 letra A) LIR', tipo: 'egreso' },
  { codigo: '1627', glosa: 'Pérdidas tributarias de ejercicios anteriores', tipo: 'egreso', auto: true },
  { codigo: '1628', glosa: 'Créditos incobrables castigados en el ejercicio', tipo: 'egreso' },
  { codigo: '1629', glosa: 'Total de egresos anuales', tipo: 'total' },
  { codigo: '1630', glosa: 'Base imponible a asignar a propietarios, o pérdida tributaria del ejercicio', tipo: 'total' },
];

export interface RcvMin {
  id?: string;
  tipoRegistro: 'Compra' | 'Venta' | 'Honorarios' | string;
  tipoDoc: string;
  folio: string;
  fechaEmision?: string;
  period?: string;
  rutEmisor?: string;
  rutReceptor?: string;
  razonSocialEmisor?: string;
  montoNeto?: number;
  montoExento?: number;
  montoIva?: number;
  montoTotal?: number;
  montoIvaNoRecuperable?: number;
  montoOtrosImpuestos?: number;
  otrosImpuestos?: { codigo: string; nombre: string; valor: number; tasa?: number | null; sinDerecho?: boolean }[];
  tipoCompra?: string;
  estado?: string;
}

/** Saldo pendiente (cobro o pago) de un documento a una fecha de corte, tal como lo muestran las cuentas corrientes. */
export interface Pendiente { tipoRegistro: 'Venta' | 'Compra' | 'Honorarios'; tipoDoc: string; folio: string; rut: string; saldo: number }

export interface RemuneracionMin { period: string; costoTotalEmpresa?: number; totalHaberes?: number; totalAportesPatronales?: number }

export interface DetalleDoc { referencia: string; fecha: string; base: number; pendiente: number; computado: number; nota?: string }

export interface LineaPropuesta {
  codigo: string;
  glosa: string;
  tipo: 'ingreso' | 'egreso' | 'total';
  propuesto: number;
  ajuste: number;
  final: number;
  fuente: string;
  detalle?: DetalleDoc[];
}

export interface EntradaTransparente {
  anio: number;
  rcv: RcvMin[];
  /** Pendientes al 31-12 del año comercial. null = no hay cuentas corrientes configuradas (se asume todo pagado/cobrado). */
  pendientesCierre: Pendiente[] | null;
  /** Pendientes al 31-12 del año anterior. */
  pendientesCierreAnterior: Pendiente[] | null;
  remuneraciones: RemuneracionMin[];
  perdidaAnterior: number;
  ajustes: Record<string, number>;
  /** Supermercado y comercios similares: el SII no los incluye en su propuesta. Por defecto quedan fuera. */
  incluirSupermercado?: boolean;
  recuperaDiesel?: boolean;
}

export interface ResultadoTransparente {
  lineas: LineaPropuesta[];
  totalIngresos: number;
  totalEgresos: number;
  baseImponible: number; // positivo = base a asignar; negativo = pérdida tributaria
  avisos: string[];
  supermercadoExcluido: number;
}

const normRut = (r?: string) => String(r || '').replace(/[^0-9kK]/g, '').toUpperCase().replace(/^0+/, '');
const normFolio = (f?: string | number) => String(parseInt(String(f ?? '').replace(/\D/g, ''), 10) || String(f ?? '').trim());
const normTipo = (t?: string) => String(t || '').replace(/\D/g, '') || String(t || '').toUpperCase();
const clave = (reg: string, tipo: string, folio: string, rut: string) => `${reg}|${normTipo(tipo)}|${normFolio(folio)}|${normRut(rut)}`;

const ES_NOTA_CREDITO = new Set(['61', '112']);
const fechaDoc = (d: RcvMin) => d.fechaEmision || (d.period ? `${d.period}-01` : '');
const anioDe = (d: RcvMin) => Number((fechaDoc(d) || '0').slice(0, 4));
const contraparte = (d: RcvMin) => (d.tipoRegistro === 'Venta' ? d.rutReceptor : d.rutEmisor) || '';

/** Monto neto que forma parte de la base (sin IVA recuperable): ventas = neto + exento; compras agrega lo que es costo. */
export function baseDocumento(d: RcvMin, opciones: { recuperaDiesel?: boolean } = {}): number {
  const neto = (Number(d.montoNeto) || 0) + (Number(d.montoExento) || 0);
  let base = neto;
  if (d.tipoRegistro === 'Compra') {
    const rep = repartirOtrosImpuestos(d, opciones);
    base += (Number(d.montoIvaNoRecuperable) || 0) + rep.costo + rep.sinDetalle;
  }
  if (d.tipoRegistro === 'Honorarios') base = Number(d.montoNeto) || 0; // bruto
  return ES_NOTA_CREDITO.has(normTipo(d.tipoDoc)) ? -Math.abs(base) : base;
}

function fraccionPendiente(d: RcvMin, mapa: Map<string, number> | null): number {
  if (!mapa) return 0;
  const reg = d.tipoRegistro === 'Honorarios' ? 'Honorarios' : d.tipoRegistro;
  const saldo = mapa.get(clave(reg, d.tipoDoc, d.folio, contraparte(d)));
  if (!saldo) return 0;
  const total = Math.abs(Number(d.montoTotal) || 0);
  if (!total) return 0;
  return Math.max(0, Math.min(1, Math.abs(saldo) / total));
}

const mapaPendientes = (p: Pendiente[] | null) => (p ? new Map(p.map(x => [clave(x.tipoRegistro, x.tipoDoc, x.folio, x.rut), x.saldo])) : null);

type Grupo = '1600' | '1819' | '1614' | '1820' | '1617' | '1618' | 'SUPER';

/** Clasifica una compra del RCV en la línea del recuadro. */
function grupoCompra(d: RcvMin): '1614' | '1618' | 'SUPER' {
  const t = String(d.tipoCompra || '').toLowerCase();
  if (t.includes('activo') || t.includes('bienes ra')) return '1618';
  if (t.includes('supermercado')) return 'SUPER';
  return '1614';
}

export function propuestaTransparente(e: EntradaTransparente): ResultadoTransparente {
  const avisos: string[] = [];
  const cierre = mapaPendientes(e.pendientesCierre);
  const anterior = mapaPendientes(e.pendientesCierreAnterior);
  if (!cierre) avisos.push('No hay cuentas de clientes/proveedores configuradas en Parámetros RCV: se consideró todo lo del año como cobrado y pagado. Revisa los saldos al 31-12.');

  const acum: Record<Grupo, { monto: number; detalle: DetalleDoc[] }> = {
    '1600': { monto: 0, detalle: [] }, '1819': { monto: 0, detalle: [] }, '1614': { monto: 0, detalle: [] },
    '1820': { monto: 0, detalle: [] }, '1617': { monto: 0, detalle: [] }, '1618': { monto: 0, detalle: [] }, SUPER: { monto: 0, detalle: [] },
  };
  const ref = (d: RcvMin) => `${d.tipoRegistro} ${d.tipoDoc} N° ${d.folio} · ${d.razonSocialEmisor || contraparte(d)}`;

  for (const d of e.rcv) {
    if (/anulad/i.test(d.estado || '')) continue;
    const a = anioDe(d);
    if (!a || a > e.anio) continue;
    const base = baseDocumento(d, { recuperaDiesel: e.recuperaDiesel });
    if (!base) continue;

    if (a === e.anio) {
      const f = fraccionPendiente(d, cierre);
      const computado = Math.round(base * (1 - f));
      const pendiente = Math.round(base * f);
      let g: Grupo;
      if (d.tipoRegistro === 'Venta') g = '1600';
      else if (d.tipoRegistro === 'Honorarios') g = '1617';
      else g = grupoCompra(d);
      acum[g].monto += computado;
      acum[g].detalle.push({ referencia: ref(d), fecha: fechaDoc(d), base, pendiente, computado, nota: pendiente ? 'Saldo pendiente al 31-12: no se considera en el año' : undefined });
    } else if (anterior) {
      // Documentos de años anteriores: lo que se cobró o pagó durante este año (saldo al cierre anterior − saldo al cierre actual)
      const f0 = fraccionPendiente(d, anterior);
      if (!f0) continue;
      const f1 = fraccionPendiente(d, cierre);
      const computado = Math.round(base * Math.max(0, f0 - f1));
      if (!computado) continue;
      let g: Grupo;
      if (d.tipoRegistro === 'Venta') g = '1819';
      else if (d.tipoRegistro === 'Honorarios') g = '1617';
      else { const gc = grupoCompra(d); g = gc === '1614' ? '1820' : gc; }
      acum[g].monto += computado;
      acum[g].detalle.push({ referencia: ref(d), fecha: fechaDoc(d), base, pendiente: Math.round(base * f1), computado, nota: 'Documento de un año anterior pagado/cobrado en este año' });
    }
  }
  if (e.incluirSupermercado) {
    acum['1614'].monto += acum.SUPER.monto;
    acum['1614'].detalle.push(...acum.SUPER.detalle.map(x => ({ ...x, nota: 'Supermercado incluido por decisión del usuario' })));
  } else if (acum.SUPER.monto) {
    avisos.push(`Compras en supermercados y comercios similares por $${acum.SUPER.monto.toLocaleString('es-CL')} no se incluyeron (el SII tampoco las incluye en su propuesta). Si son gastos del giro y están respaldados, inclúyelas.`);
  }

  const remDelAnio = e.remuneraciones.filter(r => String(r.period || '').startsWith(`${e.anio}-`));
  const rem = remDelAnio.reduce((s, r) => s + (Number(r.costoTotalEmpresa) || ((Number(r.totalHaberes) || 0) + (Number(r.totalAportesPatronales) || 0))), 0);
  if (remDelAnio.length) avisos.push('Remuneraciones: se tomó el costo total empresa de las liquidaciones del año. Si las de diciembre se pagaron en enero, ajusta la línea 1616.');

  const auto: Record<string, { monto: number; fuente: string; detalle?: DetalleDoc[] }> = {
    '1600': { monto: acum['1600'].monto, fuente: 'Registro de Ventas del año (neto + exento), menos lo pendiente de cobro al 31-12 según cuentas corrientes', detalle: acum['1600'].detalle },
    '1819': { monto: acum['1819'].monto, fuente: 'Ventas de años anteriores cobradas en el año (cuentas corrientes de clientes)', detalle: acum['1819'].detalle },
    '1614': { monto: acum['1614'].monto, fuente: 'Registro de Compras del giro (neto + exento + IVA e impuestos sin derecho a crédito), menos lo adeudado al 31-12', detalle: acum['1614'].detalle },
    '1820': { monto: acum['1820'].monto, fuente: 'Compras de años anteriores pagadas en el año (cuentas corrientes de proveedores)', detalle: acum['1820'].detalle },
    '1616': { monto: Math.round(rem), fuente: remDelAnio.length ? `Liquidaciones de sueldo del año en Gest_OK (${remDelAnio.length}): costo total empresa` : 'Sin liquidaciones del año en Gest_OK: completar' },
    '1617': { monto: acum['1617'].monto, fuente: 'Boletas de honorarios recibidas (monto bruto), menos lo adeudado al 31-12', detalle: acum['1617'].detalle },
    '1618': { monto: acum['1618'].monto, fuente: 'Compras de activo fijo y bienes raíces del Registro de Compras, pagadas', detalle: acum['1618'].detalle },
    '1627': { monto: Math.max(0, Math.round(e.perdidaAnterior || 0)), fuente: 'Pérdida tributaria de arrastre (saldos de apertura o año anterior en Gest_Rta)' },
  };

  const lineas: LineaPropuesta[] = [];
  let totalIngresos = 0, totalEgresos = 0;
  for (const l of RECUADRO_22) {
    if (l.tipo === 'total') continue;
    const a = auto[l.codigo];
    const propuesto = a ? a.monto : 0;
    const ajuste = Math.round(Number(e.ajustes[l.codigo]) || 0);
    const final = propuesto + ajuste;
    if (l.tipo === 'ingreso') totalIngresos += final; else totalEgresos += final;
    lineas.push({ codigo: l.codigo, glosa: l.glosa, tipo: l.tipo, propuesto, ajuste, final, fuente: a ? a.fuente : 'Completar por el contador', detalle: a?.detalle });
  }
  const baseImponible = totalIngresos - totalEgresos;
  const totales: Record<string, number> = { '1610': totalIngresos, '1629': totalEgresos, '1630': baseImponible };
  const conTotales: LineaPropuesta[] = [];
  for (const l of RECUADRO_22) {
    if (l.tipo === 'total') conTotales.push({ codigo: l.codigo, glosa: l.glosa, tipo: 'total', propuesto: totales[l.codigo], ajuste: 0, final: totales[l.codigo], fuente: 'Cálculo' });
    else conTotales.push(lineas.find(x => x.codigo === l.codigo)!);
  }
  return { lineas: conTotales, totalIngresos, totalEgresos, baseImponible, avisos, supermercadoExcluido: e.incluirSupermercado ? 0 : acum.SUPER.monto };
}

export interface CptSimplificado {
  cptInicial: number;
  aumentosCapital: number;
  disminucionesCapital: number;
  retiros: number;
  otrasAgregar: number;
  otrasDeducir: number;
}

/** CPT simplificado: inicial + resultado tributario del ejercicio + aumentos − disminuciones − retiros ± otras partidas. */
export function calcularCptSimplificado(c: CptSimplificado, baseImponible: number) {
  const n = (x: number) => Math.round(Number(x) || 0);
  const final = n(c.cptInicial) + n(baseImponible) + n(c.aumentosCapital) - n(c.disminucionesCapital) - n(c.retiros) + n(c.otrasAgregar) - n(c.otrasDeducir);
  return { final, positivo: Math.max(final, 0), negativo: Math.max(-final, 0) };
}

export interface Propietario { rut: string; nombre: string; porcentaje: number }

/** Asignación a los propietarios (DJ 1947): base imponible y PPM según % de participación. */
export function asignarPropietarios(propietarios: Propietario[], baseImponible: number, ppm: number) {
  const suma = propietarios.reduce((s, p) => s + (Number(p.porcentaje) || 0), 0);
  const filas = propietarios.map(p => ({
    ...p,
    base: Math.round(Math.max(baseImponible, 0) * (Number(p.porcentaje) || 0) / 100),
    ppm: Math.round((Number(ppm) || 0) * (Number(p.porcentaje) || 0) / 100),
  }));
  return { filas, sumaPorcentajes: Math.round(suma * 10000) / 10000, cuadra: Math.abs(suma - 100) < 0.0001 };
}
