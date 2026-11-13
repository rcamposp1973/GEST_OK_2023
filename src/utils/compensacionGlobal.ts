// Compensación de partidas en todas las cuentas de activo y pasivo (proveedores, clientes, honorarios, anticipos, etc.).
// Una partida abierta (por pagar o por cobrar) queda compensada cuando se paga, se cobra o se cierra con una nota de crédito/débito,
// sin importar la cuenta del banco ni la fecha del pago. Este motor solo PROPONE; quien aplica los pareos es la pantalla.
//  - EXACTO: mismo RUT y mismo documento dentro de la misma cuenta, y el debe y el haber abiertos suman lo mismo.
//  - SUGERENCIA: coincidencia menos segura (mismo número de documento escrito distinto, partidas entre cuentas distintas del
//    mismo RUT, o un único cargo y un único abono del mismo monto) que el contador debe confirmar.
// Las cuentas que requieren conciliación bancaria quedan fuera: sus movimientos se concilian contra la cartola.
import type { Voucher, ChartOfAccount, AccountMatch } from '../types';
import { pareadoPorLinea } from './pareoParcial';

export type NivelCompensacion = 'EXACTO' | 'SUGERENCIA';

export interface LineaAbierta {
  key: string;
  voucherId: string;
  voucherNumber: number;
  voucherDate: string;
  voucherPeriod: string;
  voucherType: 'Ingreso' | 'Egreso' | 'Traspaso';
  lineIndex: number;
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: number;   // monto abierto (lo que aún no está pareado)
  credit: number;
  gloss: string;
  documentRef?: string;
  auxiliaryRut?: string;
  auxiliaryName?: string;
}

export interface PropuestaCompensacion {
  id: string;
  nivel: NivelCompensacion;
  regla: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  entreCuentas: boolean;
  debitLines: LineaAbierta[];
  creditLines: LineaAbierta[];
  totalAmount: number;
}

const TOL = 0.5;
const r2 = (n: number) => Math.round(n * 100) / 100;

export const normRut = (s?: string): string => (s || '').toUpperCase().replace(/[^0-9K]/g, '').replace(/^0+/, '');
const RUT_GENERICOS = new Set(['99K', '666666666', '555555555', '111111111']);

export function normDoc(s?: string): string {
  return (s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/N°|Nº|NRO\.?|NUMERO/g, '').replace(/[^A-Z0-9]/g, '');
}
/** Último número del documento sin ceros a la izquierda ("BHE 068" y "#68" → "68"). */
export function numeroDoc(s?: string): string {
  const m = (s || '').match(/(\d+)\s*$/);
  return m ? m[1].replace(/^0+/, '') : '';
}
// Documentos genéricos (aperturas, "otro 2025") no identifican una factura concreta
const docUtil = (d: string) => /\d/.test(d) && !d.startsWith('OTRO') && !d.startsWith('APERTURA');

export function proponerCompensaciones(
  vouchers: Voucher[],
  accounts: ChartOfAccount[],
  matches: AccountMatch[],
): PropuestaCompensacion[] {
  const elegibles = new Map<string, ChartOfAccount>();
  accounts.forEach(a => {
    if (a.isImputable === false) return;
    if (a.type !== 'Activo' && a.type !== 'Pasivo') return;
    if (a.requiereConciliacionBancaria) return;
    elegibles.set(a.id, a);
    elegibles.set(`code:${a.code}`, a);
  });
  const pareado = pareadoPorLinea(matches.filter(m => m.status !== 'DESCALZADO'));

  // 1) Partidas abiertas con RUT y documento
  const abiertas: (LineaAbierta & { rut: string; doc: string; num: string })[] = [];
  vouchers.forEach(v => {
    if (v.status === 'Anulado') return;
    v.lines.forEach((l, i) => {
      const acc = elegibles.get(l.accountId) || elegibles.get(`code:${l.accountCode}`);
      if (!acc) return;
      const rut = normRut(l.auxiliaryRut);
      if (!rut || RUT_GENERICOS.has(rut)) return;
      const key = `${v.id}_${i}`;
      const usado = pareado.get(key);
      const debit = r2(Math.max(0, (l.debit || 0) - (usado?.debit || 0)));
      const credit = r2(Math.max(0, (l.credit || 0) - (usado?.credit || 0)));
      if (debit < TOL && credit < TOL) return;
      abiertas.push({
        key, voucherId: v.id, voucherNumber: Number(v.voucherNumber || (v as any).number || 0), voucherDate: v.date,
        voucherPeriod: v.period || (v.date || '').slice(0, 7), voucherType: v.type, lineIndex: i,
        accountId: acc.id, accountCode: acc.code, accountName: acc.name,
        debit, credit, gloss: l.gloss || v.gloss || '', documentRef: l.documentRef,
        auxiliaryRut: l.auxiliaryRut, auxiliaryName: l.auxiliaryName,
        rut, doc: normDoc(l.documentRef), num: numeroDoc(l.documentRef),
      });
    });
  });

  const usadas = new Set<string>();
  const out: PropuestaCompensacion[] = [];
  let n = 0;

  const agrupar = (claveDe: (l: typeof abiertas[number]) => string | null) => {
    const g = new Map<string, typeof abiertas>();
    abiertas.forEach(l => {
      if (usadas.has(l.key)) return;
      const k = claveDe(l);
      if (!k) return;
      const arr = g.get(k) || [];
      arr.push(l);
      g.set(k, arr);
    });
    return g;
  };
  const sumas = (ls: typeof abiertas) => ({
    d: r2(ls.reduce((s, l) => s + l.debit, 0)),
    c: r2(ls.reduce((s, l) => s + l.credit, 0)),
  });
  const emitir = (ls: typeof abiertas, nivel: NivelCompensacion, regla: string, entreCuentas: boolean) => {
    const { d } = sumas(ls);
    const debitLines = ls.filter(l => l.debit >= TOL);
    const creditLines = ls.filter(l => l.credit >= TOL);
    ls.forEach(l => usadas.add(l.key));
    const p = [...debitLines, ...creditLines][0];
    out.push({
      id: `comp_${Date.now()}_${n++}`, nivel, regla, entreCuentas,
      accountId: p.accountId, accountCode: p.accountCode, accountName: p.accountName,
      debitLines, creditLines, totalAmount: d,
    });
  };
  const cuadra = (ls: typeof abiertas) => {
    const { d, c } = sumas(ls);
    return d >= TOL && c >= TOL && Math.abs(d - c) <= TOL;
  };

  // 2) EXACTO: misma cuenta + RUT + documento escrito igual
  agrupar(l => (docUtil(l.doc) ? `${l.accountId}|${l.rut}|${l.doc}` : null)).forEach(ls => {
    if (cuadra(ls)) emitir(ls, 'EXACTO', 'RUT + documento', false);
  });
  // 3) SUGERENCIA: misma cuenta + RUT + mismo número de documento (escrito distinto: "BHE 68" vs "Boleta 68")
  agrupar(l => (l.num ? `${l.accountId}|${l.rut}|${l.num}` : null)).forEach(ls => {
    if (cuadra(ls)) emitir(ls, 'SUGERENCIA', 'RUT + N° de documento', false);
  });
  // 4) SUGERENCIA entre cuentas: mismo RUT y documento en cuentas distintas (ej: anticipo contra factura)
  agrupar(l => (docUtil(l.doc) ? `${l.rut}|${l.doc}` : null)).forEach(ls => {
    if (new Set(ls.map(l => l.accountId)).size > 1 && cuadra(ls)) emitir(ls, 'SUGERENCIA', 'Entre cuentas: mismo RUT y documento', true);
  });
  // 5) SUGERENCIA: un único cargo y un único abono del mismo monto para el mismo RUT en la misma cuenta
  agrupar(l => `${l.accountId}|${l.rut}`).forEach(ls => {
    const ds = ls.filter(l => l.debit >= TOL), cs = ls.filter(l => l.credit >= TOL);
    ds.forEach(d => {
      const igualesD = ds.filter(x => Math.abs(x.debit - d.debit) <= TOL);
      const igualesC = cs.filter(x => Math.abs(x.credit - d.debit) <= TOL);
      if (igualesD.length === 1 && igualesC.length === 1 && !usadas.has(d.key) && !usadas.has(igualesC[0].key)) {
        emitir([d, igualesC[0]], 'SUGERENCIA', 'RUT + monto exacto (ej: nota de crédito contra su factura)', false);
      }
    });
  });

  return out.sort((a, b) => (a.nivel === b.nivel ? b.totalAmount - a.totalAmount : a.nivel === 'EXACTO' ? -1 : 1));
}
