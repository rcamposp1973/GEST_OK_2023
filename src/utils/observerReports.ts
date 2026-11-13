// Informes recurrentes del panel del observador. Todo se calcula con los comprobantes y el RCV de la empresa:
// no usa inteligencia artificial, así que cada consulta es gratis, instantánea y con las mismas cifras del sistema.
import type { Voucher, ChartOfAccount, RCVDocument } from '../types';
import { normRut, normDoc } from './compensacionGlobal';
import { ivaCreditoCoherente } from './rcvIva';

const GENERIC_RUTS = ['99K', '666666666', '555555555', '111111111'];
export const sinTildes = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const voucherDate = (v: Voucher) => v.date || (v.period ? `${v.period}-01` : '');
const vigentes = (vs: Voucher[]) => vs.filter(v => v.status !== 'Anulado' && voucherDate(v));
const r0 = (n: number) => Math.round(n);

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
function diffDays(a: string, b: string): number {
  const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
  return Math.round((new Date(pa[0], pa[1] - 1, pa[2]).getTime() - new Date(pb[0], pb[1] - 1, pb[2]).getTime()) / 86400000);
}

const accountIndex = (accounts: ChartOfAccount[]) => {
  const byId = new Map<string, ChartOfAccount>();
  const byCode = new Map<string, ChartOfAccount>();
  accounts.forEach(a => { byId.set(a.id, a); byCode.set(a.code, a); });
  return (l: { accountId?: string; accountCode?: string }) => byId.get(l.accountId || '') || byCode.get(l.accountCode || '');
};

// ───────────────────────── Balance y resultados ─────────────────────────
export interface FilaSaldo { code: string; name: string; saldo: number }
export interface BalanceResultado {
  fecha: string;
  activos: FilaSaldo[]; pasivos: FilaSaldo[]; patrimonio: FilaSaldo[];
  totalActivo: number; totalPasivo: number; totalPatrimonio: number;
  resultadoEjercicio: number; resultadoAnterior: number;
  diferencia: number;
}
export interface ResultadosResultado {
  desde: string; hasta: string;
  ingresos: FilaSaldo[]; gastos: FilaSaldo[];
  totalIngresos: number; totalGastos: number; resultado: number;
}

export function balanceALaFecha(vouchers: Voucher[], accounts: ChartOfAccount[], fecha: string): BalanceResultado {
  const find = accountIndex(accounts);
  const anio = fecha.slice(0, 4);
  const inicioAnio = `${anio}-01-01`;
  const bs = new Map<string, { acc: ChartOfAccount; d: number; c: number }>();
  let resActual = 0, resAnterior = 0;
  for (const v of vigentes(vouchers)) {
    const dt = voucherDate(v);
    if (dt > fecha) continue;
    for (const l of v.lines || []) {
      const acc = find(l); if (!acc) continue;
      const d = Number(l.debit) || 0, c = Number(l.credit) || 0;
      if (acc.type === 'Ingreso' || acc.type === 'Gasto') {
        const neto = c - d; // utilidad: más haber que debe en cuentas de resultado
        if (dt >= inicioAnio) resActual += neto; else resAnterior += neto;
      } else {
        const e = bs.get(acc.id) || { acc, d: 0, c: 0 };
        e.d += d; e.c += c; bs.set(acc.id, e);
      }
    }
  }
  const filas = (tipo: ChartOfAccount['type'], deudor: boolean) =>
    [...bs.values()].filter(e => e.acc.type === tipo)
      .map(e => ({ code: e.acc.code, name: e.acc.name, saldo: r0(deudor ? e.d - e.c : e.c - e.d) }))
      .filter(f => f.saldo !== 0).sort((a, b) => a.code.localeCompare(b.code));
  const activos = filas('Activo', true), pasivos = filas('Pasivo', false), patrimonio = filas('Patrimonio', false);
  const sum = (a: FilaSaldo[]) => a.reduce((s, f) => s + f.saldo, 0);
  const totalActivo = sum(activos), totalPasivo = sum(pasivos), totalPatrimonio = sum(patrimonio);
  const resultadoEjercicio = r0(resActual), resultadoAnterior = r0(resAnterior);
  return {
    fecha, activos, pasivos, patrimonio, totalActivo, totalPasivo, totalPatrimonio,
    resultadoEjercicio, resultadoAnterior,
    diferencia: r0(totalActivo - (totalPasivo + totalPatrimonio + resultadoEjercicio + resultadoAnterior))
  };
}

export function resultadosAFecha(vouchers: Voucher[], accounts: ChartOfAccount[], hasta: string): ResultadosResultado {
  const find = accountIndex(accounts);
  const desde = `${hasta.slice(0, 4)}-01-01`;
  const m = new Map<string, { acc: ChartOfAccount; d: number; c: number }>();
  for (const v of vigentes(vouchers)) {
    const dt = voucherDate(v);
    if (dt < desde || dt > hasta) continue;
    for (const l of v.lines || []) {
      const acc = find(l);
      if (!acc || (acc.type !== 'Ingreso' && acc.type !== 'Gasto')) continue;
      const e = m.get(acc.id) || { acc, d: 0, c: 0 };
      e.d += Number(l.debit) || 0; e.c += Number(l.credit) || 0; m.set(acc.id, e);
    }
  }
  const filas = (tipo: 'Ingreso' | 'Gasto') => [...m.values()].filter(e => e.acc.type === tipo)
    .map(e => ({ code: e.acc.code, name: e.acc.name, saldo: r0(tipo === 'Ingreso' ? e.c - e.d : e.d - e.c) }))
    .filter(f => f.saldo !== 0).sort((a, b) => a.code.localeCompare(b.code));
  const ingresos = filas('Ingreso'), gastos = filas('Gasto');
  const totalIngresos = ingresos.reduce((s, f) => s + f.saldo, 0), totalGastos = gastos.reduce((s, f) => s + f.saldo, 0);
  return { desde, hasta, ingresos, gastos, totalIngresos, totalGastos, resultado: totalIngresos - totalGastos };
}

// ───────────────────────── Contrapartes (clientes y proveedores) ─────────────────────────
export interface Contraparte { rut: string; nombre: string; veces: number }

export function buscarContrapartes(query: string, vouchers: Voucher[], rcv: RCVDocument[], companyRut: string): Contraparte[] {
  const q = sinTildes(query).trim();
  if (!q) return [];
  const qRut = normRut(query);
  const esRut = /\d/.test(q) && qRut.length >= 6 && /^[0-9.\-kK\s]+$/.test(query.trim());
  const propio = normRut(companyRut);
  const m = new Map<string, Contraparte>();
  const add = (rutRaw?: string, nombre?: string) => {
    const rut = normRut(rutRaw);
    if (!rut || rut === propio || GENERIC_RUTS.includes(rut)) return;
    const e = m.get(rut) || { rut: rutRaw || rut, nombre: nombre || '', veces: 0 };
    if (!e.nombre && nombre) e.nombre = nombre;
    e.veces++; m.set(rut, e);
  };
  for (const v of vigentes(vouchers)) for (const l of v.lines || []) add(l.auxiliaryRut, l.auxiliaryName);
  for (const d of rcv) {
    if (d.tipoRegistro === 'Venta') add(d.rutReceptor, d.razonSocialReceptor);
    else add(d.rutEmisor, d.razonSocialEmisor);
  }
  const todos = [...m.values()];
  const res = esRut
    ? todos.filter(c => normRut(c.rut).includes(qRut))
    : todos.filter(c => q.split(/\s+/).every(w => sinTildes(c.nombre).includes(w)));
  return res.sort((a, b) => b.veces - a.veces).slice(0, 8);
}

const esCuentaDeTerceros = (a?: ChartOfAccount) =>
  !!a && (a.type === 'Activo' || a.type === 'Pasivo') && !a.requiereConciliacionBancaria;

export interface DocAbierto {
  accountCode: string; accountName: string; tipo: 'Activo' | 'Pasivo';
  documento: string; fecha: string; vence: string; saldo: number; // saldo con signo: + nos deben / − les debemos
  rut: string; nombre: string;
}

function documentosAbiertos(vouchers: Voucher[], accounts: ChartOfAccount[], fecha: string, filtroRut?: string): DocAbierto[] {
  const find = accountIndex(accounts);
  const m = new Map<string, DocAbierto & { net: number }>();
  for (const v of vigentes(vouchers)) {
    const dt = voucherDate(v);
    if (dt > fecha) continue;
    for (const l of v.lines || []) {
      const acc = find(l);
      if (!esCuentaDeTerceros(acc)) continue;
      const rut = normRut(l.auxiliaryRut);
      if (!rut || GENERIC_RUTS.includes(rut)) continue;
      if (filtroRut && rut !== filtroRut) continue;
      const doc = normDoc(l.documentRef) || 'SIN DOCUMENTO';
      const key = `${acc!.id}|${rut}|${doc}`;
      const e = m.get(key) || {
        accountCode: acc!.code, accountName: acc!.name, tipo: acc!.type as 'Activo' | 'Pasivo',
        documento: l.documentRef || 'Sin documento', fecha: dt, vence: '', saldo: 0, net: 0,
        rut: l.auxiliaryRut || rut, nombre: l.auxiliaryName || ''
      };
      e.net += (Number(l.debit) || 0) - (Number(l.credit) || 0);
      if (dt < e.fecha) e.fecha = dt;
      if (l.dueDate && (!e.vence || l.dueDate < e.vence)) e.vence = l.dueDate;
      if (!e.nombre && l.auxiliaryName) e.nombre = l.auxiliaryName;
      m.set(key, e);
    }
  }
  return [...m.values()].filter(e => Math.abs(e.net) > 0.5).map(e => ({ ...e, saldo: r0(e.net) }));
}

export interface CuentaCorrienteResultado {
  contraparte: Contraparte; fecha: string;
  porCuenta: { code: string; name: string; saldo: number }[];
  documentos: DocAbierto[];
  saldoNeto: number; // + nos debe / − le debemos
}
export function cuentaCorriente(c: Contraparte, vouchers: Voucher[], accounts: ChartOfAccount[], fecha: string): CuentaCorrienteResultado {
  const docs = documentosAbiertos(vouchers, accounts, fecha, normRut(c.rut));
  const porCuenta = new Map<string, { code: string; name: string; saldo: number }>();
  docs.forEach(d => {
    const e = porCuenta.get(d.accountCode) || { code: d.accountCode, name: d.accountName, saldo: 0 };
    e.saldo += d.saldo; porCuenta.set(d.accountCode, e);
  });
  return {
    contraparte: c, fecha,
    porCuenta: [...porCuenta.values()].sort((a, b) => a.code.localeCompare(b.code)),
    documentos: docs.sort((a, b) => a.fecha.localeCompare(b.fecha)),
    saldoNeto: docs.reduce((s, d) => s + d.saldo, 0)
  };
}

// ───────────────────────── Saldos por cobrar y por pagar ─────────────────────────
export interface SaldosPorContraparte { tipo: 'cobrar' | 'pagar'; fecha: string; filas: { rut: string; nombre: string; saldo: number }[]; total: number }
export function saldosPorContraparte(tipo: 'cobrar' | 'pagar', vouchers: Voucher[], accounts: ChartOfAccount[], fecha: string): SaldosPorContraparte {
  const docs = documentosAbiertos(vouchers, accounts, fecha);
  const m = new Map<string, { rut: string; nombre: string; saldo: number }>();
  docs.forEach(d => {
    const esCobrar = tipo === 'cobrar';
    if ((esCobrar && d.tipo !== 'Activo') || (!esCobrar && d.tipo !== 'Pasivo')) return;
    const key = normRut(d.rut);
    const e = m.get(key) || { rut: d.rut, nombre: d.nombre, saldo: 0 };
    e.saldo += esCobrar ? d.saldo : -d.saldo; m.set(key, e);
  });
  const filas = [...m.values()].filter(f => f.saldo > 0.5).map(f => ({ ...f, saldo: r0(f.saldo) })).sort((a, b) => b.saldo - a.saldo);
  return { tipo, fecha, filas, total: filas.reduce((s, f) => s + f.saldo, 0) };
}

// ───────────────────────── Vencimientos ─────────────────────────
export interface VencimientosResultado {
  hoy: string;
  grupos: { tipo: 'cobrar' | 'pagar'; vencidas: DocAbierto[]; semana: DocAbierto[]; mes: DocAbierto[]; totalVencido: number; totalSemana: number; totalMes: number }[];
}
export function vencimientos(vouchers: Voucher[], accounts: ChartOfAccount[], hoy: string): VencimientosResultado {
  const docs = documentosAbiertos(vouchers, accounts, hoy);
  const grupo = (tipo: 'cobrar' | 'pagar') => {
    const lista = docs
      .filter(d => tipo === 'cobrar' ? (d.tipo === 'Activo' && d.saldo > 0) : (d.tipo === 'Pasivo' && d.saldo < 0))
      .map(d => ({ ...d, saldo: Math.abs(d.saldo), vence: d.vence || addDays(d.fecha, 30) }));
    const vencidas = lista.filter(d => d.vence < hoy).sort((a, b) => a.vence.localeCompare(b.vence));
    const semana = lista.filter(d => d.vence >= hoy && diffDays(d.vence, hoy) <= 7).sort((a, b) => a.vence.localeCompare(b.vence));
    const mes = lista.filter(d => diffDays(d.vence, hoy) > 7 && diffDays(d.vence, hoy) <= 30).sort((a, b) => a.vence.localeCompare(b.vence));
    const t = (a: DocAbierto[]) => a.reduce((s, d) => s + d.saldo, 0);
    return { tipo, vencidas, semana, mes, totalVencido: t(vencidas), totalSemana: t(semana), totalMes: t(mes) };
  };
  return { hoy, grupos: [grupo('cobrar'), grupo('pagar')] };
}

// ───────────────────────── IVA del período (referencial, según RCV) ─────────────────────────
export interface IvaResultado { period: string; debito: number; credito: number; sinDerecho: number; aPagar: number; docsVenta: number; docsCompra: number }
export function ivaDelPeriodo(rcv: RCVDocument[], period: string): IvaResultado {
  let debito = 0, credito = 0, sinDerecho = 0, dv = 0, dc = 0;
  for (const d of rcv.filter(x => x.period === period)) {
    const nc = d.tipoDoc === '61' || String(d.tipoDoc).includes('61');
    const f = nc ? -1 : 1;
    if (d.tipoRegistro === 'Venta') { debito += (Number(d.montoIva) || 0) * f; dv++; }
    else if (d.tipoRegistro === 'Compra') {
      credito += ivaCreditoCoherente(d as any) * f;
      sinDerecho += (Number(d.montoIvaNoRecuperable) || 0) * f; dc++;
    }
  }
  return { period, debito: r0(debito), credito: r0(credito), sinDerecho: r0(sinDerecho), aPagar: r0(debito - credito), docsVenta: dv, docsCompra: dc };
}

// ───────────────────────── Fechas ─────────────────────────
export function parseFechaTexto(t: string): string | null {
  const s = t.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return s;
  m = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}
export function finDeMes(period: string): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, m, 0);
  return `${y}-${String(m).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const clp = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString('es-CL')}`;
export const fechaCL = (iso: string) => iso ? iso.split('-').reverse().join('-') : '';
