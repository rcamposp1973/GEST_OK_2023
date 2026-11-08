// Motor de cierre de ejercicio y apertura del año siguiente.
// Funciones puras: calculan los comprobantes propuestos; no escriben nada.
import type { ChartOfAccount, Voucher, VoucherLine, AccountMatch } from '../types';
import { getNaturaleza } from './ifrsClassification';

export const ORIGEN_CIERRE = 'CIERRE_ANIO';
export const ORIGEN_APERTURA = 'APERTURA_ANIO';

export interface OpcionesCierre {
  anio: number;
  cuentaResultadoId: string;      // recibe el resultado del ejercicio en el comprobante de cierre
  cuentaUtilidadesId: string;     // recibe el resultado en la apertura (puede ser la misma)
}

export interface ComprobanteProp {
  fecha: string;
  periodo: string;
  glosa: string;
  origen: string;
  lineas: VoucherLine[];
  debe: number;
  haber: number;
}

export interface Chequeo { ok: boolean; titulo: string; detalle: string; grave: boolean }

export interface PropuestaCierre {
  cierre: ComprobanteProp;
  apertura: ComprobanteProp;
  resultado: number;            // utilidad (+) o pérdida (−)
  ingresos: number;
  gastos: number;
  chequeos: Chequeo[];
  yaGenerados: { cierre: Voucher[]; apertura: Voucher[] };
}

const r = (n: number) => Math.round(n);
const claveAux = (l: VoucherLine) =>
  [l.auxiliaryRut || '', l.documentType || '', l.documentRef || '', l.dueDate || ''].join('|');

function lineaDe(cta: ChartOfAccount, debe: number, haber: number, glosa: string, extra: Partial<VoucherLine> = {}): VoucherLine {
  return { accountId: cta.id, accountCode: cta.code, accountName: cta.name, debit: debe, credit: haber, gloss: glosa, ...extra };
}

/** Sugiere la cuenta de resultado del ejercicio y la de utilidades acumuladas a partir del plan. */
export function sugerirCuentas(accounts: ChartOfAccount[]): { resultadoId: string; utilidadesId: string } {
  const imput = accounts.filter(a => a.isImputable !== false);
  const buscar = (re: RegExp) => imput.find(a => re.test(a.name.toLowerCase()) && getNaturaleza(a) === 'PATRIMONIO');
  const util = buscar(/utilidades? acumulad|resultados? acumulad|ganancias? acumulad/);
  const res = buscar(/resultado del ejercicio|resultado ejercicio|p[eé]rdidas? y ganancias|utilidad del ejercicio/) || util;
  return { resultadoId: res?.id || '', utilidadesId: util?.id || res?.id || '' };
}

/** Primer día del ejercicio desde el cual se acumulan saldos cuando se pide "todo": la última apertura generada. */
export function inicioAcumuladoVigente(vouchers: Voucher[]): string {
  let inicio = '';
  vouchers.forEach(v => { if (v.origin === ORIGEN_APERTURA && v.status !== 'Anulado' && v.date && v.date > inicio) inicio = v.date; });
  return inicio;
}

export function generarPropuesta(accounts: ChartOfAccount[], vouchers: Voucher[], op: OpcionesCierre, matches: AccountMatch[] = []): PropuestaCierre {
  const anio = op.anio;
  const ctaRes = accounts.find(a => a.id === op.cuentaResultadoId);
  const ctaUtil = accounts.find(a => a.id === op.cuentaUtilidadesId);
  const porId = new Map(accounts.map(a => [a.id, a] as const));
  const porCodigo = new Map(accounts.map(a => [a.code, a] as const));
  const cuentaDe = (l: VoucherLine) => porId.get(l.accountId) || porCodigo.get(l.accountCode);

  const validos = vouchers.filter(v => v.status !== 'Anulado');
  const cierresPrevios = validos.filter(v => v.origin === ORIGEN_CIERRE && v.date?.startsWith(String(anio)));
  const aperturasPrevias = validos.filter(v => v.origin === ORIGEN_APERTURA && v.date?.startsWith(String(anio + 1)));

  // Base: sin los comprobantes de cierre/apertura generados antes por esta función (para poder recalcular)
  const base = validos.filter(v => v.origin !== ORIGEN_CIERRE && v.origin !== ORIGEN_APERTURA);
  const hasta = `${anio}-12-31`;

  // Saldos por cuenta: resultados solo del año; balance acumulado hasta el cierre
  // Pareos vigentes al 31-12 (análisis de cuentas): las líneas pareadas no se arrastran a la apertura
  const hastaStr = `${anio}-12-31`;
  // Monto ya pareado por línea (un pareo parcial compensa solo una parte; el resto sigue abierto y se arrastra)
  const pareado = new Map<string, { debit: number; credit: number }>();
  const cuentasConPareo = new Set<string>();
  matches.forEach(m => {
    if (m.status === 'DESCALZADO') return;
    const fp = m.fechaPareo || m.matchedLines.reduce((mx, l) => ((l.voucherDate || '') > mx ? (l.voucherDate || '') : mx), '');
    if (fp > hastaStr) return;
    cuentasConPareo.add(m.accountId);
    m.matchedLines.forEach(l => {
      const k = `${l.voucherId}_${l.lineIndex}`;
      const e = pareado.get(k) || { debit: 0, credit: 0 };
      e.debit += l.debit || 0; e.credit += l.credit || 0;
      pareado.set(k, e);
    });
  });
  const abiertasSinAux = new Map<string, VoucherLine[]>();  // cuenta con pareos -> líneas aún abiertas
  const saldo = new Map<string, number>();                 // cuenta -> debe - haber
  const partidas = new Map<string, Map<string, VoucherLine>>(); // cuenta -> clave aux -> línea neta
  base.forEach(v => {
    if (!v.date || v.date > hasta) return;
    v.lines.forEach((l, idx) => {
      const cta = cuentaDe(l);
      if (!cta) return;
      const nat = getNaturaleza(cta);
      const esResultado = nat === 'INGRESO' || nat === 'GASTO';
      if (esResultado && !v.date.startsWith(String(anio))) return;
      const neto = (l.debit || 0) - (l.credit || 0);
      saldo.set(cta.id, (saldo.get(cta.id) || 0) + neto);
      if (!esResultado && !(cta.requiereAuxiliarRUT || cta.requiereDocumento) && cuentasConPareo.has(cta.id) && neto !== 0) {
        const par = pareado.get(`${v.id}_${idx}`);
        const restoD = Math.max(0, (l.debit || 0) - (par?.debit || 0));
        const restoC = Math.max(0, (l.credit || 0) - (par?.credit || 0));
        if (restoD > 0.5 || restoC > 0.5) {
          const arr = abiertasSinAux.get(cta.id) || [];
          arr.push({ ...l, debit: restoD, credit: restoC, gloss: `${v.date} Vch #${v.voucherNumber} ${l.gloss || v.gloss || ''}`.trim() });
          abiertasSinAux.set(cta.id, arr);
        }
      }
      if (!esResultado && (cta.requiereAuxiliarRUT || cta.requiereDocumento)) {
        const mapa = partidas.get(cta.id) || new Map<string, VoucherLine>();
        const k = claveAux(l);
        const prev = mapa.get(k);
        const nuevoNeto = (prev ? prev.debit - prev.credit : 0) + neto;
        mapa.set(k, {
          ...(prev || l),
          debit: nuevoNeto > 0 ? nuevoNeto : 0,
          credit: nuevoNeto < 0 ? -nuevoNeto : 0,
        });
        partidas.set(cta.id, mapa);
      }
    });
  });

  // ---- Comprobante de cierre de resultados
  const glosaCierre = `Cierre de ejercicio ${anio}`;
  const lineasCierre: VoucherLine[] = [];
  let ingresos = 0, gastos = 0;
  accounts.filter(a => a.isImputable !== false).sort((a, b) => a.code.localeCompare(b.code)).forEach(cta => {
    const nat = getNaturaleza(cta);
    if (nat !== 'INGRESO' && nat !== 'GASTO') return;
    const s = r(saldo.get(cta.id) || 0);
    if (s === 0) return;
    if (nat === 'INGRESO') ingresos += -s; else gastos += s;
    lineasCierre.push(lineaDe(cta, s < 0 ? -s : 0, s > 0 ? s : 0, glosaCierre));
  });
  const resultado = r(ingresos - gastos);
  if (ctaRes && resultado !== 0) {
    lineasCierre.push(lineaDe(ctaRes, resultado < 0 ? -resultado : 0, resultado > 0 ? resultado : 0, `Resultado del ejercicio ${anio}`));
  }
  const sum = (ls: VoucherLine[], k: 'debit' | 'credit') => ls.reduce((a, l) => a + (l[k] || 0), 0);
  const cierre: ComprobanteProp = {
    fecha: hasta, periodo: `${anio}-12`, glosa: glosaCierre, origen: ORIGEN_CIERRE,
    lineas: lineasCierre, debe: sum(lineasCierre, 'debit'), haber: sum(lineasCierre, 'credit'),
  };

  // ---- Comprobante de apertura del año siguiente
  const glosaApertura = `Apertura ejercicio ${anio + 1}`;
  const saldoFinal = new Map(saldo);
  if (ctaRes) saldoFinal.set(ctaRes.id, (saldoFinal.get(ctaRes.id) || 0) - resultado); // el cierre acredita utilidad
  // Traspaso del resultado a utilidades acumuladas
  const traspaso = ctaRes && ctaUtil && ctaRes.id !== ctaUtil.id ? (saldoFinal.get(ctaRes.id) || 0) : 0;
  const lineasApertura: VoucherLine[] = [];
  const g = (cta: ChartOfAccount) => saldoFinal.get(cta.id) || 0;
  accounts.filter(a => a.isImputable !== false).sort((a, b) => a.code.localeCompare(b.code)).forEach(cta => {
    const nat = getNaturaleza(cta);
    if (nat === 'INGRESO' || nat === 'GASTO') return;
    let s = r(g(cta));
    if (ctaRes && ctaUtil && ctaRes.id !== ctaUtil.id) {
      if (cta.id === ctaRes.id) s = 0;
      if (cta.id === ctaUtil.id) s = r(g(cta) + traspaso);
    }
    if (s === 0) return;
    const mapa = partidas.get(cta.id);
    if (mapa && mapa.size > 0) {
      // Cuentas con auxiliar/documento: se arrastran las partidas abiertas una a una
      let acumulado = 0;
      mapa.forEach(p => {
        const neto = r(p.debit - p.credit);
        if (neto === 0) return;
        acumulado += neto;
        lineasApertura.push(lineaDe(cta, neto > 0 ? neto : 0, neto < 0 ? -neto : 0, glosaApertura, {
          auxiliaryRut: p.auxiliaryRut, auxiliaryName: p.auxiliaryName,
          documentType: p.documentType, documentRef: p.documentRef, dueDate: p.dueDate,
        }));
      });
      const resto = s - acumulado; // saldo sin detalle de auxiliar (si lo hubiera)
      if (resto !== 0) lineasApertura.push(lineaDe(cta, resto > 0 ? resto : 0, resto < 0 ? -resto : 0, glosaApertura));
    } else {
      const abiertas = abiertasSinAux.get(cta.id);
      const sumaAbiertas = abiertas ? abiertas.reduce((a, l) => a + (l.debit || 0) - (l.credit || 0), 0) : 0;
      if (abiertas && abiertas.length > 0 && r(sumaAbiertas) === s) {
        // Cuenta analizada con pareos: se arrastran solo las partidas que siguen abiertas
        abiertas.forEach(l => lineasApertura.push(lineaDe(cta, l.debit || 0, l.credit || 0, l.gloss || glosaApertura)));
      } else {
        lineasApertura.push(lineaDe(cta, s > 0 ? s : 0, s < 0 ? -s : 0, glosaApertura));
      }
    }
  });
  const apertura: ComprobanteProp = {
    fecha: `${anio + 1}-01-01`, periodo: `${anio + 1}-01`, glosa: glosaApertura, origen: ORIGEN_APERTURA,
    lineas: lineasApertura, debe: sum(lineasApertura, 'debit'), haber: sum(lineasApertura, 'credit'),
  };

  // ---- Chequeos
  const chequeos: Chequeo[] = [];
  const delAnio = base.filter(v => v.date?.startsWith(String(anio)));
  chequeos.push({
    ok: delAnio.length > 0, grave: true, titulo: 'Movimientos del año',
    detalle: delAnio.length > 0 ? `${delAnio.length} comprobantes en ${anio}.` : `No hay comprobantes en ${anio}.`,
  });
  const desc = delAnio.filter(v => r(v.totalDebit || sum(v.lines, 'debit')) !== r(v.totalCredit || sum(v.lines, 'credit')) || v.status === 'Descuadrado');
  chequeos.push({
    ok: desc.length === 0, grave: true, titulo: 'Comprobantes cuadrados',
    detalle: desc.length === 0 ? 'Todos los comprobantes del año cuadran.' : `${desc.length} comprobante(s) descuadrado(s): #${desc.slice(0, 8).map(v => v.voucherNumber).join(', #')}.`,
  });
  const sinCuenta = delAnio.some(v => v.lines.some(l => !cuentaDe(l)));
  chequeos.push({
    ok: !sinCuenta, grave: true, titulo: 'Cuentas del plan',
    detalle: sinCuenta ? 'Hay líneas con cuentas que no están en el plan de cuentas.' : 'Todas las cuentas usadas existen en el plan.',
  });
  chequeos.push({
    ok: !!ctaRes && !!ctaUtil, grave: true, titulo: 'Cuentas de resultado',
    detalle: ctaRes && ctaUtil ? `Resultado en ${ctaRes.code} ${ctaRes.name}; utilidades acumuladas en ${ctaUtil.code} ${ctaUtil.name}.` : 'Elige la cuenta de resultado del ejercicio y la de utilidades acumuladas.',
  });
  chequeos.push({
    ok: cierre.debe === cierre.haber, grave: true, titulo: 'Cierre cuadrado',
    detalle: `Debe ${cierre.debe.toLocaleString('es-CL')} · Haber ${cierre.haber.toLocaleString('es-CL')}.`,
  });
  chequeos.push({
    ok: apertura.debe === apertura.haber, grave: true, titulo: 'Apertura cuadrada',
    detalle: `Debe ${apertura.debe.toLocaleString('es-CL')} · Haber ${apertura.haber.toLocaleString('es-CL')}.`,
  });
  const yaCerrado = cierresPrevios.length > 0 || aperturasPrevias.length > 0;
  chequeos.push({
    ok: !yaCerrado, grave: false, titulo: 'Cierre previo',
    detalle: yaCerrado ? 'Ya existen comprobantes de cierre/apertura generados para este año: revísalos o revierte antes de generar de nuevo.' : 'Aún no se ha generado el cierre de este año.',
  });

  return { cierre, apertura, resultado, ingresos: r(ingresos), gastos: r(gastos), chequeos, yaGenerados: { cierre: cierresPrevios, apertura: aperturasPrevias } };
}
