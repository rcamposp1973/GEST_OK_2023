import type {
  SalesOrder, SalesOrderLine, SalesConfig, SalesOrderStatus, SalesDeliveryLine
} from '../types';

export const TASA_IVA = 0.19;

export const CONFIG_VENTAS_INICIAL: SalesConfig = {
  approvalRequired: true,
  level1Emails: [],
  level2Emails: [],
  level2MinAmount: 0,
  defaultPaymentTerms: '30 días',
  defaultDeliveryPlace: '',
  footerNotes: ''
};

export const ESTADOS_OV: Record<SalesOrderStatus, { label: string; tono: string }> = {
  BORRADOR: { label: 'Borrador', tono: 'bg-slate-100 text-slate-700' },
  PENDIENTE_N1: { label: 'Esperando aprobación nivel 1', tono: 'bg-amber-100 text-amber-800' },
  PENDIENTE_N2: { label: 'Esperando aprobación nivel 2', tono: 'bg-orange-100 text-orange-800' },
  APROBADA: { label: 'Aprobada', tono: 'bg-blue-100 text-blue-800' },
  RECHAZADA: { label: 'Rechazada', tono: 'bg-rose-100 text-rose-800' },
  ENTREGADA_PARCIAL: { label: 'Entregada parcial', tono: 'bg-cyan-100 text-cyan-800' },
  ENTREGADA: { label: 'Entregada completa', tono: 'bg-emerald-100 text-emerald-800' },
  CERRADA: { label: 'Cerrada', tono: 'bg-slate-200 text-slate-700' },
  ANULADA: { label: 'Anulada', tono: 'bg-slate-100 text-slate-400 line-through' },
};

const r0 = (n: number) => Math.round(Number(n) || 0);

export function importeLinea(l: Pick<SalesOrderLine, 'quantity' | 'unitPriceNeto'>): number {
  return r0((Number(l.quantity) || 0) * (Number(l.unitPriceNeto) || 0));
}

export function calcularTotales(lines: SalesOrderLine[]) {
  let neto = 0, exento = 0;
  for (const l of lines) {
    if (l.exento) exento += importeLinea(l); else neto += importeLinea(l);
  }
  const iva = r0(neto * TASA_IVA);
  return { neto, exento, iva, total: neto + exento + iva };
}

const norm = (e: string) => (e || '').trim().toLowerCase();

export function requiereNivel2(total: number, cfg: SalesConfig): boolean {
  return (cfg.level2Emails || []).length > 0 && total >= (Number(cfg.level2MinAmount) || 0);
}

/** Estado al que pasa una O/C cuando se envía a aprobación. */
export function estadoAlEnviar(cfg: SalesConfig): SalesOrderStatus {
  if (!cfg.approvalRequired || (cfg.level1Emails || []).length === 0) return 'APROBADA';
  return 'PENDIENTE_N1';
}

/** Estado después de aprobar el nivel indicado. */
export function estadoTrasAprobar(level: 1 | 2, total: number, cfg: SalesConfig): SalesOrderStatus {
  if (level === 1 && requiereNivel2(total, cfg)) return 'PENDIENTE_N2';
  return 'APROBADA';
}

export function puedeAprobar(email: string, status: SalesOrderStatus, cfg: SalesConfig, esAdmin = false): boolean {
  if (status === 'PENDIENTE_N1') return esAdmin || (cfg.level1Emails || []).map(norm).includes(norm(email));
  if (status === 'PENDIENTE_N2') return esAdmin || (cfg.level2Emails || []).map(norm).includes(norm(email));
  return false;
}

export function cantidadPendiente(l: SalesOrderLine): number {
  return Math.max(0, (Number(l.quantity) || 0) - (Number(l.deliveredQty) || 0));
}

export function montoEntregaLinea(l: SalesOrderLine, qty: number): number {
  return l.contabilizaEnEntrega ? r0(qty * (Number(l.unitPriceNeto) || 0)) : 0;
}

export function estadoSegunEntrega(lines: SalesOrderLine[]): SalesOrderStatus {
  const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
  const entregado = lines.reduce((s, l) => s + Math.min(Number(l.deliveredQty) || 0, Number(l.quantity) || 0), 0);
  if (entregado <= 0) return 'APROBADA';
  return entregado >= total ? 'ENTREGADA' : 'ENTREGADA_PARCIAL';
}

export function fxeContabilizado(oc: SalesOrder): number {
  return (oc.deliveries || []).filter(r => !r.anulada).reduce((s, r) => s + (r.totalNeto || 0), 0);
}
export function fxeFacturado(oc: SalesOrder): number {
  return (oc.invoices || []).reduce((s, i) => s + (i.fxeNeto || 0), 0);
}
/** Saldo abierto de Facturas por Emitir de la O/V: positivo = entregado sin facturar; negativo = facturado de más. */
export function fxeAbierto(oc: SalesOrder): number {
  return fxeContabilizado(oc) - fxeFacturado(oc);
}

/** Neto de la factura que va contra Facturas por Emitir; el resto (líneas que solo se contabilizan con la factura) va directo a ingreso. */
export function sugerirFxeNeto(oc: SalesOrder, netoFactura: number): number {
  const neto = Math.max(0, r0(netoFactura));
  const sinContabilizar = oc.lines.filter(l => !l.contabilizaEnEntrega).reduce((s, l) => s + importeLinea(l), 0);
  // Todas las líneas se contabilizan al entregar: toda la factura va contra la cuenta puente y la diferencia queda abierta.
  if (sinContabilizar === 0) return neto;
  // Orden mixta: solo se aplica lo que está pendiente en la cuenta puente; el resto va directo a ingreso.
  return Math.min(neto, Math.max(0, fxeAbierto(oc)));
}

export function referenciaOV(numero: number): string {
  return `OV-${numero}`;
}

export interface BorradorLineaAsiento {
  accountId: string;
  debit: number;
  credit: number;
  gloss: string;
  conAuxiliar?: boolean;
}

/** Asiento de una entrega: Debe Facturas por Emitir (con auxiliar cliente), Haber cuentas de ingreso (solo neto; el IVA se registra con la factura). */
export function armarAsientoEntrega(
  oc: SalesOrder,
  lineas: SalesDeliveryLine[],
  cuentaPorLinea: (l: SalesOrderLine) => string | undefined,
  cuentaFxe: string
): { lines: BorradorLineaAsiento[]; total: number; sinCuenta: string[] } {
  const porCuenta = new Map<string, number>();
  const sinCuenta: string[] = [];
  let total = 0;
  for (const rl of lineas) {
    const l = oc.lines.find(x => x.id === rl.lineId);
    if (!l || !rl.amountNeto) continue;
    const cta = cuentaPorLinea(l);
    if (!cta) { sinCuenta.push(l.name); continue; }
    porCuenta.set(cta, (porCuenta.get(cta) || 0) + rl.amountNeto);
    total += rl.amountNeto;
  }
  const ref = referenciaOV(oc.number);
  const out: BorradorLineaAsiento[] = [];
  if (total > 0) out.push({ accountId: cuentaFxe, debit: total, credit: 0, gloss: `Factura por emitir ${ref} - ${oc.customerName}`, conAuxiliar: true });
  porCuenta.forEach((monto, accountId) => out.push({ accountId, debit: 0, credit: monto, gloss: `Entrega ${ref} - ${oc.customerName}` }));
  return { lines: out, total, sinCuenta };
}
