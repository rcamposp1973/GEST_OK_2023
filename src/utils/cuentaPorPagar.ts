import type { ChartOfAccount } from '../types';

/**
 * Cuenta por pagar con la que se debe cancelar un documento de compra u honorarios al pagarlo.
 * Orden: 1) la cuenta donde el documento quedó registrado en la contabilidad (su abono al proveedor),
 *        2) la cuenta de acreedor del auxiliar, 3) la cuenta por defecto de Parámetros RCV.
 * Si no hay ninguna, devuelve null: el sistema NO adivina por nombre ni inventa.
 */
export interface DocPago { rut: string; tipoDoc: string; folio: string; esHonorario?: boolean; esNotaCredito?: boolean }

const normRut = (r?: string) => String(r || '').toUpperCase().replace(/[^0-9K]/g, '').replace(/^0+/, '');
const normFolio = (f?: string | number) => String(f ?? '').replace(/\D/g, '').replace(/^0+/, '');

/** ¿La referencia de la línea corresponde a este folio? (ej. "33 #930867", "FAC 33 N° 930867", "930867") */
export function refEsDelFolio(ref: string | undefined, folio: string): boolean {
  const f = normFolio(folio);
  if (!f || !ref) return false;
  const numeros: string[] = String(ref).match(/\d+/g) || [];
  return numeros.some(n => n.replace(/^0+/, '') === f);
}

export function cuentaPorPagarDocumento(
  d: DocPago,
  ctx: {
    accounts: ChartOfAccount[];
    vouchers: { status?: string; lines?: any[] }[];
    cuentaAcreedorAuxiliar?: string;
    defaultProveedores?: string;
    defaultHonorarios?: string;
  },
): { cuenta: ChartOfAccount; origen: 'registro' | 'auxiliar' | 'parametros' } | null {
  const existe = (id?: string) => (id ? ctx.accounts.find(a => a.id === id) : undefined);
  const rut = normRut(d.rut);
  // 1) Registro contable del documento: línea de pasivo del mismo proveedor y folio, al haber (o al debe si es NC)
  for (const v of ctx.vouchers) {
    if (/anulad/i.test(String(v.status || ''))) continue;
    for (const l of v.lines || []) {
      if (normRut(l.auxiliaryRut) !== rut || !refEsDelFolio(l.documentRef, d.folio)) continue;
      const lado = d.esNotaCredito ? Number(l.debit) || 0 : Number(l.credit) || 0;
      if (lado <= 0) continue;
      const c = existe(l.accountId);
      if (c && String(c.type || '').toLowerCase().startsWith('pasivo')) return { cuenta: c, origen: 'registro' };
    }
  }
  // 2) Cuenta de acreedor del auxiliar
  const aux = existe(ctx.cuentaAcreedorAuxiliar);
  if (aux) return { cuenta: aux, origen: 'auxiliar' };
  // 3) Parámetros RCV
  const par = existe(d.esHonorario ? (ctx.defaultHonorarios || ctx.defaultProveedores) : ctx.defaultProveedores);
  if (par) return { cuenta: par, origen: 'parametros' };
  return null;
}
