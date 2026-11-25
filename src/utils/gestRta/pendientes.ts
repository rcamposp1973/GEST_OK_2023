import type { ChartOfAccount, RCVDocument, Voucher } from '../../types';
import { computeOpenItems, getAccountKind } from '../openAccountItems';
import type { Pendiente } from './transparente';

/**
 * Saldos pendientes de cobro/pago por documento a una fecha de corte, desde las cuentas corrientes de Gest_OK
 * (clientes, proveedores y honorarios por pagar configuradas en Parámetros RCV).
 * Devuelve null si no hay ninguna cuenta configurada: en ese caso no se puede saber qué quedó pendiente.
 */
export function pendientesAlCorte(
  corte: string, // YYYY-MM-DD
  cuentas: { clientes?: string; proveedores?: string; honorarios?: string },
  accounts: ChartOfAccount[],
  rcvDocuments: RCVDocument[],
  vouchers: Voucher[],
): Pendiente[] | null {
  const ids: [string | undefined, Pendiente['tipoRegistro']][] = [[cuentas.clientes, 'Venta'], [cuentas.proveedores, 'Compra'], [cuentas.honorarios, 'Honorarios']];
  if (!ids.some(([id]) => id && accounts.some(a => a.id === id))) return null;
  const rcvAlCorte = rcvDocuments.filter(d => (d.fechaEmision || (d.period ? `${d.period}-01` : '')) <= corte);
  const vouchersAlCorte = vouchers.filter(v => (v.date || (v.period ? `${v.period}-01` : '')) <= corte && v.status !== 'Anulado');
  const out: Pendiente[] = [];
  for (const [id, reg] of ids) {
    const cuenta = id ? accounts.find(a => a.id === id) : undefined;
    if (!cuenta) continue;
    const kind = getAccountKind(cuenta, reg !== 'Venta');
    const items = computeOpenItems(cuenta, { ...kind, isClientes: reg === 'Venta', isProveedores: reg === 'Compra', isHonorarios: reg === 'Honorarios', isAP: reg !== 'Venta' }, rcvAlCorte, vouchersAlCorte);
    for (const it of items) {
      if (!it.openBalance) continue;
      out.push({ tipoRegistro: reg, tipoDoc: it.docType, folio: it.docNumber, rut: it.auxiliaryRut, saldo: it.openBalance });
    }
  }
  return out;
}
