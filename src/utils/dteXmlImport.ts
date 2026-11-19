// Importa DTE (facturas, notas, boletas) desde archivos XML que entrega cualquier facturador autorizado por el SII
// (Bsale, Nubox, Haulmer, SimpleFactura, el portal gratuito del SII, etc.). Sirve el sobre <EnvioDTE> con uno o varios <DTE>.
// No firma ni emite nada: solo LEE documentos ya emitidos y los deja listos para el Registro de Compras y Ventas.
import type { RCVDocument } from '../types';

const tag = (xml: string, name: string): string => {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${name}>([\\s\\S]*?)</(?:\\w+:)?${name}>`));
  return m ? m[1].trim().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'") : '';
};
const num = (s: string) => { const n = Number(s); return Number.isFinite(n) ? Math.round(n) : 0; };
const limpiaRut = (r: string) => (r || '').replace(/[^0-9kK]/g, '').toUpperCase();

export interface ResultadoImportXml {
  documentos: Omit<RCVDocument, 'id'>[];
  omitidos: { folio: string; motivo: string }[];
}

/** `rutEmpresa` es el RUT de la empresa dueña de la contabilidad: decide si el documento es Venta (emitido) o Compra (recibido). */
export function leerDtesXml(xmlTexto: string, rutEmpresa: string, facturadorNombre?: string): ResultadoImportXml {
  const out: ResultadoImportXml = { documentos: [], omitidos: [] };
  const bloques = xmlTexto.match(/<(?:\w+:)?DTE\b[\s\S]*?<\/(?:\w+:)?DTE>/g) || [];
  const yo = limpiaRut(rutEmpresa);
  for (const b of bloques) {
    const tipoDoc = tag(b, 'TipoDTE'); const folio = tag(b, 'Folio'); const fecha = tag(b, 'FchEmis');
    const rutEmisor = tag(b, 'RUTEmisor'); const rutReceptor = tag(b, 'RUTRecep');
    if (!tipoDoc || !folio || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) { out.omitidos.push({ folio: folio || '?', motivo: 'Faltan tipo, folio o fecha válidos' }); continue; }
    const esVenta = limpiaRut(rutEmisor) === yo; const esCompra = limpiaRut(rutReceptor) === yo;
    if (!esVenta && !esCompra) { out.omitidos.push({ folio, motivo: 'El documento no pertenece a esta empresa (ni emisor ni receptor)' }); continue; }
    const neto = num(tag(b, 'MntNeto')); const exento = num(tag(b, 'MntExe')); const iva = num(tag(b, 'IVA')); const total = num(tag(b, 'MntTotal'));
    if (Math.abs(neto + exento + iva - total) > 1) { out.omitidos.push({ folio, motivo: `Los montos no cuadran (neto ${neto} + exento ${exento} + IVA ${iva} ≠ total ${total})` }); continue; }
    out.documentos.push({
      tipoRegistro: esVenta ? 'Venta' : 'Compra', period: fecha.slice(0, 7),
      rutEmisor, razonSocialEmisor: tag(b, 'RznSoc'), rutReceptor, razonSocialReceptor: tag(b, 'RznSocRecep'),
      tipoDoc, folio, fechaEmision: fecha,
      montoNeto: neto, montoIva: iva, montoExento: exento, montoTotal: total, // montos positivos: la nota de crédito (61) se invierte al contabilizar
      estadoContabilizado: false, origenDocumento: 'FACTURADOR_EXTERNO', ...(facturadorNombre ? { facturadorNombre } : {}),
    } as Omit<RCVDocument, 'id'>);
  }
  return out;
}
