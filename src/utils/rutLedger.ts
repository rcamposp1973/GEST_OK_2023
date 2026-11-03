import type { BankStatementLine, ChartOfAccount, Voucher } from '../types';
import type { MovementProposal } from './bankMovementClassifier';
import { extractRutFromGloss } from './rutMatcher';

/**
 * Clasificación por RUT de la glosa (típico del Santander, que escribe el RUT de la contraparte).
 * Usa lo que el sistema ya sabe de esa persona: en qué cuentas tiene movimientos y cuánto saldo
 * pendiente tiene en cada una. Sirve para proveedores y, sobre todo, para trabajadores
 * (remuneraciones por pagar, anticipos, préstamos, fondos por rendir), cuyos RUT llegan desde la
 * centralización de sueldos y otros comprobantes.
 * Nunca inventa cuentas: solo propone cuentas donde ese RUT ya tiene movimientos.
 */

interface RutEntry {
  accountId: string;
  debit: number;
  credit: number;
  docRef: string;
  date: string;
  name: string;
}

const indexCache = new WeakMap<Voucher[], Map<string, RutEntry[]>>();

const normRut = (r: any): string => String(r || '').replace(/[^0-9kK]/g, '').toUpperCase();

function indexFor(vouchers: Voucher[], bankAccountId: string): Map<string, RutEntry[]> {
  const cached = indexCache.get(vouchers);
  if (cached) return cached;
  const m = new Map<string, RutEntry[]>();
  for (const v of vouchers) {
    if ((v as any).status === 'Anulado') continue;
    for (const l of (v.lines || []) as any[]) {
      if (!l.auxiliaryRut || !l.accountId || l.accountId === bankAccountId) continue;
      const k = normRut(l.auxiliaryRut);
      if (!k) continue;
      const arr = m.get(k) || [];
      arr.push({
        accountId: l.accountId,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        docRef: String(l.documentRef || '').trim().toUpperCase(),
        date: v.date || '',
        name: l.auxiliaryName || ''
      });
      m.set(k, arr);
    }
  }
  indexCache.set(vouchers, m);
  return m;
}

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CL');

interface AccStat {
  acc: ChartOfAccount;
  debitLines: number;
  creditLines: number;
  net: number; // debe - haber acumulado de ese RUT en la cuenta
  lastDate: string;
  openItems: { id: string; amount: number }[]; // saldos abiertos por documento, en el sentido natural de la cuenta
  openTotal: number;
}

export function proponerPorRut(
  line: BankStatementLine,
  isCharge: boolean,
  ctx: { accounts: ChartOfAccount[]; vouchers: Voucher[]; bankAccountId: string },
  subset: (items: { id: string; amount: number }[], target: number, maxItems?: number, tol?: number) => string[] | null
): MovementProposal | null {
  const rutInfo = extractRutFromGloss(line.description || '');
  if (!rutInfo || !rutInfo.isValidModulo11) return null;
  const key = normRut(rutInfo.rutFormatted);
  const entries = indexFor(ctx.vouchers, ctx.bankAccountId).get(key);
  if (!entries || entries.length === 0) return null;

  const amount = Math.round(isCharge ? line.charge : line.deposit);
  if (!amount || amount <= 0) return null;

  // Estadísticas por cuenta
  const byAcc = new Map<string, RutEntry[]>();
  entries.forEach(e => { const a = byAcc.get(e.accountId) || []; a.push(e); byAcc.set(e.accountId, a); });
  const stats: AccStat[] = [];
  byAcc.forEach((list, accountId) => {
    const acc = ctx.accounts.find(a => a.id === accountId);
    if (!acc || acc.estado === 'Inactivo') return;
    if (acc.type !== 'Activo' && acc.type !== 'Pasivo') return; // anticipos, préstamos, remuneraciones por pagar...
    const isLiability = acc.type === 'Pasivo';
    const docs = new Map<string, number>();
    let net = 0, dl = 0, cl = 0, last = '';
    list.forEach(e => {
      net += e.debit - e.credit;
      if (e.debit > 0) dl++;
      if (e.credit > 0) cl++;
      if (e.date > last) last = e.date;
      const natural = isLiability ? e.credit - e.debit : e.debit - e.credit;
      docs.set(e.docRef, (docs.get(e.docRef) || 0) + natural);
    });
    const openItems = [...docs.entries()].filter(([, v]) => Math.round(v) > 0).map(([id, v]) => ({ id, amount: Math.round(v) }));
    stats.push({ acc, debitLines: dl, creditLines: cl, net, lastDate: last, openItems, openTotal: openItems.reduce((s, x) => s + x.amount, 0) });
  });
  if (stats.length === 0) return null;

  const name = (entries.find(e => e.name)?.name || '').toUpperCase();
  const quien = `${name || 'esta persona'} (${rutInfo.rutFormatted})`;
  const base = {
    voucherType: (isCharge ? 'Egreso' : 'Ingreso') as 'Egreso' | 'Ingreso',
    source: 'RUT' as const,
    auxiliaryRut: rutInfo.rutFormatted,
    auxiliaryName: name || undefined
  };
  const mk = (s: AccStat, confidence: number, category: string, reason: string): MovementProposal => ({
    ...base,
    accountId: s.acc.id, accountCode: s.acc.code, accountName: s.acc.name,
    confidence,
    level: confidence >= 0.9 ? 'VERDE' : confidence >= 0.6 ? 'AMARILLO' : 'ROJO',
    category, reason
  });

  // Cargo = el banco paga: se salda una obligación (pasivo con saldo a favor del tercero).
  // Abono = el banco recibe: se cobra un saldo (activo: anticipo, préstamo, cuenta por cobrar).
  const natural = stats.filter(s => (isCharge ? s.acc.type === 'Pasivo' : s.acc.type === 'Activo') && s.openTotal > 0);

  // 1) Saldo pendiente que calza exacto con el monto (un documento, varios, o el total)
  const exactos: AccStat[] = [];
  const itemsDe = new Map<string, { docRef: string; amount: number }[]>();
  natural.forEach(s => {
    const unico = s.openItems.filter(i => Math.abs(i.amount - amount) <= 2);
    const total = Math.abs(s.openTotal - amount) <= 2;
    const sub = unico.length === 0 && !total ? subset(s.openItems, amount, 32, 2) : null;
    if (unico.length > 0) {
      // un solo documento (si hay varios iguales se toma el más antiguo por orden de aparición)
      itemsDe.set(s.acc.id, [{ docRef: unico[0].id, amount }]);
      exactos.push(s);
    } else if (total) {
      itemsDe.set(s.acc.id, s.openItems.map(i => ({ docRef: i.id, amount: i.amount })));
      exactos.push(s);
    } else if (sub && sub.length > 0) {
      itemsDe.set(s.acc.id, s.openItems.filter(i => sub.includes(i.id)).map(i => ({ docRef: i.id, amount: i.amount })));
      exactos.push(s);
    }
  });
  if (exactos.length >= 1) {
    exactos.sort((a, b) => b.lastDate.localeCompare(a.lastDate));
    const s = exactos[0];
    const distintos = exactos.length > 1;
    const prop = mk(s, distintos ? 0.8 : 0.93,
      isCharge ? 'Pago de obligación con RUT conocido' : 'Cobro de saldo con RUT conocido',
      `${quien} tiene en "${s.acc.name}" un saldo pendiente de ${fmt(s.openTotal)} y el monto calza exacto.` +
      (distintos ? ' También tiene saldos calzables en otras cuentas: revisa.' : ''));
    prop.rutItems = itemsDe.get(s.acc.id);
    return prop;
  }

  // 2) Hay saldo pendiente pero no calza: pago parcial u otro concepto
  if (natural.length > 0) {
    natural.sort((a, b) => b.openTotal - a.openTotal);
    const s = natural[0];
    return mk(s, 0.7, 'Tercero con saldo pendiente',
      `${quien} tiene ${fmt(s.openTotal)} pendiente en "${s.acc.name}", pero el monto ${fmt(amount)} no calza exacto. ` +
      'Puede ser un pago parcial, un descuento o un concepto distinto (anticipo, préstamo, fondo por rendir).');
  }

  // 3) Sin saldo que cobrar o pagar: se mira cómo se movió antes ese RUT en el mismo sentido
  //    (por ejemplo, anticipos o préstamos entregados antes → un nuevo cargo a esa cuenta)
  const mismoSentido = stats
    .map(s => ({ s, n: isCharge ? s.debitLines : s.creditLines }))
    .filter(x => x.n > 0)
    .sort((a, b) => b.n - a.n || b.s.lastDate.localeCompare(a.s.lastDate));
  if (mismoSentido.length > 0) {
    const top = mismoSentido[0];
    const tot = mismoSentido.reduce((s, x) => s + x.n, 0);
    const conf = Math.min(0.85, 0.55 + 0.08 * top.n) * (0.6 + 0.4 * (top.n / tot));
    return mk(top.s, conf, 'Según movimientos anteriores del RUT',
      `${quien} ya tiene ${top.n} movimiento(s) de este tipo en "${top.s.acc.name}". ` +
      'Confirma que corresponde (por ejemplo, un nuevo anticipo o préstamo) y la regla quedará aprendida.');
  }
  return null;
}
