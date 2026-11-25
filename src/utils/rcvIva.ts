/**
 * Un documento de compra no puede tener, a la vez, IVA crédito y IVA sin derecho a crédito
 * por el mismo impuesto: la suma neto + exento + IVA crédito + IVA sin derecho debe ser el total.
 * Si la suma lo supera, lo que está "sin derecho" ya no es crédito, así que se descuenta del IVA crédito.
 */
export function ivaCreditoCoherente(d: {
  tipoRegistro?: string;
  montoNeto?: number;
  montoIva?: number;
  montoExento?: number;
  montoTotal?: number;
  montoIvaNoRecuperable?: number;
}): number {
  const iva = Number(d.montoIva) || 0;
  const noRec = Number(d.montoIvaNoRecuperable) || 0;
  const total = Number(d.montoTotal) || 0;
  if (d.tipoRegistro !== 'Compra' || noRec <= 0 || total <= 0) return iva;
  const suma = (Number(d.montoNeto) || 0) + (Number(d.montoExento) || 0) + iva + noRec;
  if (suma <= total + 1) return iva;
  return Math.max(0, total - (Number(d.montoNeto) || 0) - (Number(d.montoExento) || 0) - noRec);
}

export function normalizarIvaDocRcv<T extends { tipoRegistro?: string; montoIva?: number }>(d: T): T {
  const iva = ivaCreditoCoherente(d as any);
  return iva === (Number(d.montoIva) || 0) ? d : { ...d, montoIva: iva };
}

/**
 * Boletas de honorarios traídas desde el SII por la API (antes de la v1.33.1) quedaban con tipoRegistro 'Honorario'
 * (sin "s") y con los montos al revés (neto = líquido, total = bruto). Así no aparecían en la pestaña Honorarios.
 * Se corrigen al leer: tipoRegistro 'Honorarios', montoNeto = bruto, montoIva = retención, montoTotal = líquido.
 */
export function normalizarHonorario<T extends Record<string, any>>(d: T): T {
  if (d.tipoRegistro !== 'Honorario') return d;
  const bruto = Math.max(Number(d.montoTotal) || 0, Number(d.montoNeto) || 0);
  const ret = Number(d.montoIva) || 0;
  const liquido = bruto - ret;
  return { ...d, tipoRegistro: 'Honorarios', montoNeto: bruto, montoIva: ret, montoTotal: liquido, montoBruto: bruto, montoRetencion: ret, montoLiquido: liquido };
}

/** Tipo de compra del RCV del SII ("Del Giro", "Supermercados", "Activo Fijo", "IVA Uso Común", "Bienes Raíces"...). */
export function normalizarTipoCompra(s: any): '' | 'Giro' | 'Supermercado' | 'Activo Fijo' | 'Uso Común' | 'Bienes Raíces' | 'No Recuperable' {
  const t = String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  if (!t) return '';
  if (t.includes('supermerc') || t === '2') return 'Supermercado';
  if (t.includes('activo fijo') || t === '4') return 'Activo Fijo';
  if (t.includes('uso comun') || t === '3') return 'Uso Común';
  if (t.includes('bienes raices') || t.includes('inmueble')) return 'Bienes Raíces';
  if (t.includes('no rec') || t.includes('sin derecho') || t.includes('no acredit') || t === '5') return 'No Recuperable';
  if (t.includes('giro') || t === '1') return 'Giro';
  return '';
}

/**
 * Corrige compras guardadas donde un "otro impuesto" (impuesto específico a combustibles, ILA, etc.) quedó como
 * "IVA sin derecho a crédito" por la detección antigua (total > neto + IVA + exento). Si el IVA recuperable del
 * documento ya es el 19% del neto, la diferencia NO es IVA: es otro impuesto. El IVA no recuperable real del SII
 * viene con el IVA recuperable en 0.
 */
export function corregirIvaNoRecFalso<T extends Record<string, any>>(d: T): T {
  if (d.tipoRegistro !== 'Compra') return d;
  const noRec = Number(d.montoIvaNoRecuperable) || 0, iva = Number(d.montoIva) || 0, neto = Number(d.montoNeto) || 0;
  if (noRec <= 0 || iva <= 0 || neto <= 0 || Math.abs(iva - Math.round(neto * 0.19)) > 2) return d;
  return { ...d, montoIvaNoRecuperable: 0, codigoIvaNoRec: null, montoOtrosImpuestos: (Number(d.montoOtrosImpuestos) || 0) + noRec };
}
