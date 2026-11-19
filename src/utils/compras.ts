import type {
  PurchaseOrder, PurchaseOrderLine, PurchasesConfig, PurchaseOrderStatus, PurchaseReceiptLine
} from '../types';

export const TASA_IVA = 0.19;

export const CONFIG_COMPRAS_INICIAL: PurchasesConfig = {
  approvalRequired: true,
  level1Emails: [],
  level2Emails: [],
  level2MinAmount: 0,
  defaultPaymentTerms: '30 días',
  defaultDeliveryPlace: '',
  footerNotes: ''
};

export const ESTADOS_OC: Record<PurchaseOrderStatus, { label: string; tono: string }> = {
  BORRADOR: { label: 'Borrador', tono: 'bg-slate-100 text-slate-700' },
  PENDIENTE_N1: { label: 'Esperando aprobación nivel 1', tono: 'bg-amber-100 text-amber-800' },
  PENDIENTE_N2: { label: 'Esperando aprobación nivel 2', tono: 'bg-orange-100 text-orange-800' },
  APROBADA: { label: 'Aprobada', tono: 'bg-blue-100 text-blue-800' },
  RECHAZADA: { label: 'Rechazada', tono: 'bg-rose-100 text-rose-800' },
  RECIBIDA_PARCIAL: { label: 'Recibida parcial', tono: 'bg-cyan-100 text-cyan-800' },
  RECIBIDA: { label: 'Recibida completa', tono: 'bg-emerald-100 text-emerald-800' },
  CERRADA: { label: 'Cerrada', tono: 'bg-slate-200 text-slate-700' },
  ANULADA: { label: 'Anulada', tono: 'bg-slate-100 text-slate-400 line-through' },
};

const r0 = (n: number) => Math.round(Number(n) || 0);

export function importeLinea(l: Pick<PurchaseOrderLine, 'quantity' | 'unitPriceNeto'>): number {
  return r0((Number(l.quantity) || 0) * (Number(l.unitPriceNeto) || 0));
}

export function calcularTotales(lines: PurchaseOrderLine[]) {
  let neto = 0, exento = 0;
  for (const l of lines) {
    if (l.exento) exento += importeLinea(l); else neto += importeLinea(l);
  }
  const iva = r0(neto * TASA_IVA);
  return { neto, exento, iva, total: neto + exento + iva };
}

const norm = (e: string) => (e || '').trim().toLowerCase();

export function requiereNivel2(total: number, cfg: PurchasesConfig): boolean {
  return (cfg.level2Emails || []).length > 0 && total >= (Number(cfg.level2MinAmount) || 0);
}

/** Estado al que pasa una O/C cuando se envía a aprobación. */
export function estadoAlEnviar(cfg: PurchasesConfig): PurchaseOrderStatus {
  if (!cfg.approvalRequired || (cfg.level1Emails || []).length === 0) return 'APROBADA';
  return 'PENDIENTE_N1';
}

/** Estado después de aprobar el nivel indicado. */
export function estadoTrasAprobar(level: 1 | 2, total: number, cfg: PurchasesConfig): PurchaseOrderStatus {
  if (level === 1 && requiereNivel2(total, cfg)) return 'PENDIENTE_N2';
  return 'APROBADA';
}

export function puedeAprobar(email: string, status: PurchaseOrderStatus, cfg: PurchasesConfig, esAdmin = false): boolean {
  if (status === 'PENDIENTE_N1') return esAdmin || (cfg.level1Emails || []).map(norm).includes(norm(email));
  if (status === 'PENDIENTE_N2') return esAdmin || (cfg.level2Emails || []).map(norm).includes(norm(email));
  return false;
}

export function cantidadPendiente(l: PurchaseOrderLine): number {
  return Math.max(0, (Number(l.quantity) || 0) - (Number(l.receivedQty) || 0));
}

export function montoRecepcionLinea(l: PurchaseOrderLine, qty: number): number {
  return l.contabilizaEnRecepcion ? r0(qty * (Number(l.unitPriceNeto) || 0)) : 0;
}

export function estadoSegunRecepcion(lines: PurchaseOrderLine[]): PurchaseOrderStatus {
  const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
  const recibido = lines.reduce((s, l) => s + Math.min(Number(l.receivedQty) || 0, Number(l.quantity) || 0), 0);
  if (recibido <= 0) return 'APROBADA';
  return recibido >= total ? 'RECIBIDA' : 'RECIBIDA_PARCIAL';
}

export function fxrContabilizado(oc: PurchaseOrder): number {
  return (oc.receipts || []).filter(r => !r.anulada).reduce((s, r) => s + (r.totalNeto || 0), 0);
}
export function fxrFacturado(oc: PurchaseOrder): number {
  return (oc.invoices || []).reduce((s, i) => s + (i.fxrNeto || 0), 0);
}
/** Saldo abierto de Facturas por Recibir de la O/C: positivo = recibido sin facturar; negativo = facturado de más. */
export function fxrAbierto(oc: PurchaseOrder): number {
  return fxrContabilizado(oc) - fxrFacturado(oc);
}

/** Neto de la factura que va contra Facturas por Recibir; el resto (líneas que solo contabilizan con la factura) va a gasto. */
export function sugerirFxrNeto(oc: PurchaseOrder, netoFactura: number): number {
  const neto = Math.max(0, r0(netoFactura));
  const sinContabilizar = oc.lines.filter(l => !l.contabilizaEnRecepcion).reduce((s, l) => s + importeLinea(l), 0);
  // Todas las líneas se contabilizan al recibir: toda la factura va contra la cuenta puente y la diferencia queda abierta.
  if (sinContabilizar === 0) return neto;
  // Orden mixta: solo se aplica lo que está pendiente en la cuenta puente; el resto va directo a gasto.
  return Math.min(neto, Math.max(0, fxrAbierto(oc)));
}

export function referenciaOC(numero: number): string {
  return `OC-${numero}`;
}

export interface BorradorLineaAsiento {
  accountId: string;
  debit: number;
  credit: number;
  gloss: string;
  conAuxiliar?: boolean;
}

/** Asiento de una recepción: Debe cuentas de gasto/inventario, Haber Facturas por Recibir (solo neto; el IVA llega con la factura). */
export function armarAsientoRecepcion(
  oc: PurchaseOrder,
  lineas: PurchaseReceiptLine[],
  cuentaPorLinea: (l: PurchaseOrderLine) => string | undefined,
  cuentaFxr: string
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
  const ref = referenciaOC(oc.number);
  const out: BorradorLineaAsiento[] = [];
  porCuenta.forEach((monto, accountId) => out.push({ accountId, debit: monto, credit: 0, gloss: `Recepción ${ref} - ${oc.supplierName}` }));
  if (total > 0) out.push({ accountId: cuentaFxr, debit: 0, credit: total, gloss: `Factura por recibir ${ref} - ${oc.supplierName}`, conAuxiliar: true });
  return { lines: out, total, sinCuenta };
}
