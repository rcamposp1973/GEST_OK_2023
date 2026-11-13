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
