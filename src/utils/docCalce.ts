import { extractRutFromGloss, areRutsEqual } from './rutMatcher';
import { nameMatchesGloss, findDocSubset } from './bankMovementClassifier';
import type { OpenAccountItem } from './openAccountItems';

export const TOLERANCIA_REDONDEO = 2; // pesos de diferencia entre banco y factura

export interface CalceResult {
  /** documentos elegidos (vacío si solo hay un aviso) */
  items: OpenAccountItem[];
  /** monto a aplicar por documento (suma = monto del banco cuando hay calce) */
  amounts: { [id: string]: number };
  level: 'VERDE' | 'AMARILLO';
  text: string;
  /** diferencia de redondeo (banco - documentos, en pesos, |x| <= 2); va a la cuenta de ajuste por redondeo */
  ajuste: number;
  /** true cuando la contraparte se identificó por RUT válido de la glosa (señal fuerte) */
  porRut: boolean;
}

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CL');

export function formatFriendlyDocumentRef(docType?: string, docNumber?: string): string {
  const num = (docNumber || '').trim();
  if (!num) return 'S/N';
  const cleanType = String(docType || '').trim().toUpperCase();
  let prefix = 'Factura';
  if (cleanType === '33' || cleanType.includes('FACTURA') || cleanType === 'FAC') prefix = 'Factura';
  else if (cleanType === '34' || cleanType.includes('EXENTA') || cleanType === 'FE') prefix = 'Factura Exenta';
  else if (cleanType === '39' || cleanType.includes('BOLETA') || cleanType === 'BOL') prefix = 'Boleta';
  else if (cleanType === '41') prefix = 'Boleta Exenta';
  else if (cleanType === '46') prefix = 'Factura Compra';
  else if (cleanType === '56' || cleanType.includes('DEBITO') || cleanType.includes('DÉBITO')) prefix = 'Nota Débito';
  else if (cleanType === '61' || cleanType.includes('CREDITO') || cleanType.includes('CRÉDITO')) prefix = 'Nota Crédito';
  else if (cleanType === 'BHE' || cleanType === '70' || cleanType.includes('HONORAR')) prefix = 'BHE';
  else if (cleanType) prefix = cleanType;

  if (num.toUpperCase().includes(prefix.toUpperCase()) || num.toUpperCase().includes('FACTURA') || num.toUpperCase().includes('BHE')) {
    return num;
  }
  return `${prefix} N° ${num}`;
}

/**
 * Calza un movimiento del banco con documentos abiertos:
 * 1) un documento con el monto exacto (±$2), 2) varios del mismo proveedor/cliente que suman el monto,
 * 3) sin suma exacta: las facturas más antiguas sin pasarse (solo aviso amarillo).
 * Devuelve null si no hay nada que decir.
 */
export function calzarFacturas(
  openItems: OpenAccountItem[],
  glosa: string,
  montoBanco: number
): CalceResult | null {
  const monto = Math.round(montoBanco);
  const rutGlosa = extractRutFromGloss(glosa || '');
  const rutValido = rutGlosa && rutGlosa.isValidModulo11 ? rutGlosa : null;
  const delProveedor = (i: { auxiliaryRut: string; auxiliaryName: string }) =>
    rutValido ? areRutsEqual(i.auxiliaryRut, rutValido.rutFormatted) : nameMatchesGloss(i.auxiliaryName, glosa || '');
  const origen = rutValido ? `RUT ${rutValido.rutFormatted} de la glosa` : 'nombre de la glosa';
  const porRut = !!rutValido;

  const armar = (items: OpenAccountItem[], texto: string, level: 'VERDE' | 'AMARILLO'): CalceResult => {
    const amounts: { [id: string]: number } = {};
    items.forEach(i => { amounts[i.id] = Math.round(i.openBalance); });
    const suma = Object.values(amounts).reduce((s, v) => s + v, 0);
    const dif = monto - suma;
    let ajuste = 0;
    if (dif !== 0 && Math.abs(dif) <= TOLERANCIA_REDONDEO) {
      ajuste = dif;
      texto += ` Diferencia de ${fmt(Math.abs(dif))} por redondeo: irá a la cuenta Ajuste por redondeo.`;
    }
    return { items, amounts, level, text: texto, porRut, ajuste };
  };
  const aviso = (texto: string): CalceResult => ({ items: [], amounts: {}, level: 'AMARILLO', text: texto, porRut, ajuste: 0 });

  // 1) Una sola factura con el saldo exacto
  const exactos = openItems.filter(i => Math.abs(Math.round(i.openBalance) - monto) <= TOLERANCIA_REDONDEO);
  if (exactos.length === 1) {
    const d = exactos[0];
    const ok = delProveedor(d);
    return armar([d],
      `Calce exacto: documento ${d.docNumber} de ${d.auxiliaryName || d.auxiliaryRut} por ${fmt(d.openBalance)}.` + (ok ? ` Coincide el ${origen}.` : ''),
      ok ? 'VERDE' : 'AMARILLO');
  }
  if (exactos.length > 1) {
    const conNombre = exactos.filter(d => delProveedor(d));
    if (conNombre.length === 1) {
      const d = conNombre[0];
      return armar([d], `Calce exacto por monto y ${rutValido ? 'RUT' : 'nombre'}: documento ${d.docNumber} de ${d.auxiliaryName} por ${fmt(d.openBalance)}.`, 'VERDE');
    }
    return aviso(`Hay ${exactos.length} documentos pendientes por ${fmt(monto)}. Elige el correcto.`);
  }

  // 2) Suma exacta de varios documentos de la misma contraparte
  const candidatos = openItems.filter(i => delProveedor(i));
  const ruts = Array.from(new Set(candidatos.map(i => (i.auxiliaryRut || '').toUpperCase())));
  for (const rut of ruts) {
    const grupo = candidatos.filter(i => (i.auxiliaryRut || '').toUpperCase() === rut);
    const pool = grupo.map(i => ({ id: i.id, amount: Math.round(i.openBalance) }));
    const ids = findDocSubset(pool, monto, 32, TOLERANCIA_REDONDEO);
    if (ids && ids.length > 0) {
      const sel = ids;
      const elegidos = grupo.filter(i => sel.includes(i.id));
      return armar(elegidos, `Calce exacto con ${elegidos.length} documentos de ${elegidos[0].auxiliaryName || rut} que suman ${fmt(monto)}. Coincide el ${origen}.`, 'VERDE');
    }
  }

  if (candidatos.length > 0) {
    // 3) Sin suma exacta: las más antiguas sin pasarse del monto
    const ordenados = [...candidatos]
      .filter(i => i.openBalance > 0)
      .sort((a, b) => String(a.issueDate || '').localeCompare(String(b.issueDate || '')));
    const elegidos: OpenAccountItem[] = [];
    let acum = 0;
    for (const d of ordenados) {
      const s = Math.round(d.openBalance);
      if (acum + s <= monto) { elegidos.push(d); acum += s; }
    }
    if (elegidos.length > 0) {
      const r = armar(elegidos,
        `No hay una combinación que sume exacto ${fmt(monto)}. Marqué las ${elegidos.length} facturas más antiguas de ${elegidos[0].auxiliaryName || 'esa contraparte'} (${fmt(acum)}); quedan ${fmt(monto - acum)} sin asignar. Ajusta si hubo descuento, retención o pago parcial.`,
        'AMARILLO');
      return r;
    }
    return aviso(`Encontré documentos de ${candidatos[0].auxiliaryName || 'esa contraparte'}, pero ninguno cabe en ${fmt(monto)}. Revisa descuentos, retenciones o pagos parciales.`);
  }
  if (rutValido) {
    return aviso(`La glosa trae el RUT ${rutValido.rutFormatted}, pero no tiene documentos pendientes en esta cuenta. Puede ser un anticipo, otra cuenta (honorarios, préstamos) o una factura aún no contabilizada.`);
  }
  return null;
}

/** Busca la cuenta de ajuste por redondeo en el plan de cuentas de la empresa. */
export function buscarCuentaRedondeo<T extends { name: string; estado?: string; isImputable?: boolean }>(accounts: T[]): T | undefined {
  const norm = (x: string) => (x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return accounts.find(a => norm(a.name).includes('redondeo') && a.estado !== 'Inactivo' && a.isImputable !== false);
}

/** Código y datos sugeridos para crear la cuenta: hermana de las cuentas de gasto bancario/financiero, con el siguiente código libre. */
export function proponerCuentaRedondeo<T extends { code: string; name: string; type: string; blce8Columnas?: any; codigoIFRS?: string; rubroBalance?: string; rubroResultado?: string; parentCode?: string }>(
  accounts: T[]
): { code: string; base?: T } | null {
  const gastos = accounts.filter(a => a.type === 'Gasto' && /^\d+$/.test((a.code || '').replace(/\./g, '')));
  if (gastos.length === 0) return null;
  const norm = (x: string) => (x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const base = gastos.find(a => /comision|bancari|financier|interes/.test(norm(a.name))) || gastos[0];
  const baseCode = base.code.replace(/\./g, '');
  const cut = baseCode.length >= 6 ? 3 : 2;
  const prefix = baseCode.slice(0, baseCode.length - cut);
  const usados = new Set(accounts.map(a => (a.code || '').replace(/\./g, '')));
  let max = 0;
  accounts.forEach(a => {
    const c = (a.code || '').replace(/\./g, '');
    if (c.length === baseCode.length && c.startsWith(prefix)) max = Math.max(max, parseInt(c.slice(prefix.length), 10) || 0);
  });
  let n = max + 1;
  let code = prefix + String(n).padStart(cut, '0');
  while (usados.has(code) && n < 10 ** cut) { n++; code = prefix + String(n).padStart(cut, '0'); }
  if (usados.has(code)) return null;
  return { code, base };
}
