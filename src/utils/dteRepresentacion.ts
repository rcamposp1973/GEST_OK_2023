// Representación impresa de un DTE a partir de su XML (formato del SII): recuadro con RUT, tipo y folio,
// datos del emisor y receptor, detalle, referencias, totales y el Timbre Electrónico (PDF417 del <TED>).
// Incluye los campos propios de los documentos de exportación (110, 111, 112): aduana, transporte y otra moneda.
import { jsPDF } from 'jspdf';

// ─────────────── Lectura del XML ───────────────
const des = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const uno = (xml: string, n: string) => { const m = new RegExp(`<(?:\\w+:)?${n}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${n}>`).exec(xml); return m ? m[1].trim() : ''; };
const txt = (xml: string, n: string) => des(uno(xml, n));
const todos = (xml: string, n: string) => xml.match(new RegExp(`<(?:\\w+:)?${n}(?:\\s[^>]*)?>[\\s\\S]*?</(?:\\w+:)?${n}>`, 'g')) || [];
const nro = (s: string) => { const n = Number(s); return Number.isFinite(n) ? n : 0; };

export interface LineaDte { nro: number; codigo: string; nombre: string; descripcion: string; cantidad: number; unidad: string; precio: number; descuento: number; recargo: number; monto: number; exento: boolean }
export interface ReferenciaDte { tipo: string; folio: string; fecha: string; codigo: string; razon: string }
export interface DteLeido {
  tipo: string; folio: string; fecha: string; vencimiento: string; formaPago: string; terminoPago: string; indTraslado: string;
  emisor: { rut: string; razon: string; giro: string; direccion: string; comuna: string; ciudad: string; telefono: string; correo: string; sucursal: string };
  receptor: { rut: string; razon: string; giro: string; direccion: string; comuna: string; ciudad: string; contacto: string; idExtranjero: string; nacionalidad: string };
  lineas: LineaDte[]; referencias: ReferenciaDte[];
  descuentosGlobales: { tipo: 'D' | 'R'; glosa: string; valor: number; enPorcentaje: boolean }[];
  totales: { moneda: string; neto: number; exento: number; tasaIva: number; iva: number; otrosImpuestos: { tipo: string; tasa: number; monto: number }[]; total: number; noFacturable: number; saldoAnterior: number; valorPagar: number };
  otraMoneda: { moneda: string; tipoCambio: number; exento: number; total: number } | null;
  aduana: Record<string, string> | null;
  bultos: { tipo: string; cantidad: string; marcas: string }[];
  ted: string;
  esExportacion: boolean;
}

export function leerDte(xml: string): DteLeido {
  const enc = uno(xml, 'Encabezado'), id = uno(enc, 'IdDoc'), em = uno(enc, 'Emisor'), re = uno(enc, 'Receptor'), tot = uno(enc, 'Totales');
  const tipo = txt(id, 'TipoDTE');
  const aduanaXml = uno(uno(enc, 'Transporte'), 'Aduana');
  const om = uno(enc, 'OtraMoneda');
  const aduana: Record<string, string> = {};
  for (const k of ['CodModVenta', 'CodClauVenta', 'TotClauVenta', 'CodViaTransp', 'NombreTransp', 'RUTCiaTransp', 'NomCiaTransp', 'IdAdicTransp', 'Booking', 'Operador',
    'CodPtoEmbarque', 'IdAdicPtoEmb', 'CodPtoDesemb', 'IdAdicPtoDesemb', 'Tara', 'CodUnidMedTara', 'PesoBruto', 'CodUnidPesoBruto', 'PesoNeto', 'CodUnidPesoNeto',
    'TotItems', 'TotBultos', 'MntFlete', 'MntSeguro', 'CodPaisRecep', 'CodPaisDestin']) {
    const v = txt(aduanaXml, k); if (v) aduana[k] = v;
  }
  const ted = (/<TED\b[\s\S]*?<\/TED>/.exec(xml)?.[0] || '');
  return {
    tipo, folio: txt(id, 'Folio'), fecha: txt(id, 'FchEmis'), vencimiento: txt(id, 'FchVenc'), formaPago: txt(id, 'FmaPago') || txt(id, 'FmaPagExp'),
    terminoPago: txt(id, 'TermPagoGlosa'), indTraslado: txt(id, 'IndTraslado'),
    emisor: { rut: txt(em, 'RUTEmisor'), razon: txt(em, 'RznSoc') || txt(em, 'RznSocEmisor'), giro: txt(em, 'GiroEmis') || txt(em, 'GiroEmisor'),
      direccion: txt(em, 'DirOrigen'), comuna: txt(em, 'CmnaOrigen'), ciudad: txt(em, 'CiudadOrigen'), telefono: txt(em, 'Telefono'), correo: txt(em, 'CorreoEmisor'), sucursal: txt(em, 'Sucursal') },
    receptor: { rut: txt(re, 'RUTRecep'), razon: txt(re, 'RznSocRecep'), giro: txt(re, 'GiroRecep'), direccion: txt(re, 'DirRecep'), comuna: txt(re, 'CmnaRecep'),
      ciudad: txt(re, 'CiudadRecep'), contacto: txt(re, 'Contacto'), idExtranjero: txt(uno(re, 'Extranjero'), 'NumId'), nacionalidad: txt(uno(re, 'Extranjero'), 'Nacionalidad') },
    lineas: todos(xml, 'Detalle').map(d => ({
      nro: nro(txt(d, 'NroLinDet')), codigo: txt(uno(d, 'CdgItem'), 'VlrCodigo'), nombre: txt(d, 'NmbItem'), descripcion: txt(d, 'DscItem'),
      cantidad: nro(txt(d, 'QtyItem')), unidad: txt(d, 'UnmdItem'), precio: nro(txt(d, 'PrcItem')), descuento: nro(txt(d, 'DescuentoMonto')),
      recargo: nro(txt(d, 'RecargoMonto')), monto: nro(txt(d, 'MontoItem')), exento: !!txt(d, 'IndExe'),
    })),
    referencias: todos(xml, 'Referencia').map(r => ({ tipo: txt(r, 'TpoDocRef'), folio: txt(r, 'FolioRef'), fecha: txt(r, 'FchRef'), codigo: txt(r, 'CodRef'), razon: txt(r, 'RazonRef') })),
    descuentosGlobales: todos(xml, 'DscRcgGlobal').map(g => ({ tipo: (txt(g, 'TpoMov') === 'R' ? 'R' : 'D') as 'D' | 'R', glosa: txt(g, 'GlosaDR'), valor: nro(txt(g, 'ValorDR')), enPorcentaje: txt(g, 'TpoValor') === '%' })),
    totales: { moneda: txt(tot, 'TpoMoneda'), neto: nro(txt(tot, 'MntNeto')), exento: nro(txt(tot, 'MntExe')), tasaIva: nro(txt(tot, 'TasaIVA')), iva: nro(txt(tot, 'IVA')),
      otrosImpuestos: todos(tot, 'ImptoReten').map(i => ({ tipo: txt(i, 'TipoImp'), tasa: nro(txt(i, 'TasaImp')), monto: nro(txt(i, 'MontoImp')) })),
      total: nro(txt(tot, 'MntTotal')), noFacturable: nro(txt(tot, 'MontoNF')), saldoAnterior: nro(txt(tot, 'SaldoAnterior')), valorPagar: nro(txt(tot, 'VlrPagar')) },
    otraMoneda: om ? { moneda: txt(om, 'TpoMoneda'), tipoCambio: nro(txt(om, 'TpoCambio')), exento: nro(txt(om, 'MntExeOtrMnda')), total: nro(txt(om, 'MntTotOtrMnda')) } : null,
    aduana: Object.keys(aduana).length ? aduana : null,
    bultos: todos(aduanaXml, 'TipoBultos').map(b => ({ tipo: txt(b, 'CodTpoBultos'), cantidad: txt(b, 'CantBultos'), marcas: txt(b, 'Marcas') })),
    ted, esExportacion: ['110', '111', '112'].includes(tipo),
  };
}

/** Texto del Timbre Electrónico para el PDF417: el <TED> tal cual, sin saltos ni sangrías entre etiquetas. */
export const textoTimbre = (ted: string) => ted.replace(/>\s+</g, '><').trim();

// ─────────────── Catálogos ───────────────
export const NOMBRE_DTE: Record<string, string> = {
  '33': 'FACTURA ELECTRÓNICA', '34': 'FACTURA NO AFECTA O EXENTA ELECTRÓNICA', '39': 'BOLETA ELECTRÓNICA', '41': 'BOLETA NO AFECTA O EXENTA ELECTRÓNICA',
  '43': 'LIQUIDACIÓN FACTURA ELECTRÓNICA', '46': 'FACTURA DE COMPRA ELECTRÓNICA', '52': 'GUÍA DE DESPACHO ELECTRÓNICA', '56': 'NOTA DE DÉBITO ELECTRÓNICA',
  '61': 'NOTA DE CRÉDITO ELECTRÓNICA', '110': 'FACTURA DE EXPORTACIÓN ELECTRÓNICA', '111': 'NOTA DE DÉBITO DE EXPORTACIÓN ELECTRÓNICA', '112': 'NOTA DE CRÉDITO DE EXPORTACIÓN ELECTRÓNICA',
};
const NOMBRE_REF: Record<string, string> = {
  ...Object.fromEntries(Object.entries(NOMBRE_DTE).map(([k, v]) => [k, v.toLowerCase().replace(/^./, c => c.toUpperCase())])),
  '30': 'Factura', '32': 'Factura no afecta o exenta', '35': 'Boleta', '50': 'Guía de despacho', '55': 'Nota de débito', '60': 'Nota de crédito',
  '801': 'Orden de compra', '802': 'Nota de pedido', '803': 'Contrato', '804': 'Resolución', 'HES': 'Hoja de entrada de servicios',
  '807': 'DUS', '808': 'B/L (conocimiento de embarque)', '809': 'AWB (guía aérea)', '810': 'MIC/DTA', '811': 'Carta de porte', '812': 'Resolución SNA', '813': 'Pasaporte',
};
const COD_REF: Record<string, string> = { '1': 'Anula documento', '2': 'Corrige texto', '3': 'Corrige montos' };
const FORMA_PAGO: Record<string, string> = { '1': 'Contado', '2': 'Crédito', '3': 'Sin costo (entrega gratuita)' };
const MOD_VENTA: Record<string, string> = { '1': 'A firme', '2': 'Bajo condición', '3': 'En consignación libre', '4': 'En consignación con mínimo a firme', '9': 'Sin pago' };
const CLAUSULA: Record<string, string> = { '1': 'CIF', '2': 'CFR', '3': 'EXW', '4': 'FAS', '5': 'FOB', '6': 'S/CL', '7': 'FCA', '8': 'CPT', '9': 'CIP' };
const VIA: Record<string, string> = { '1': 'Marítima, fluvial y lacustre', '4': 'Aérea', '5': 'Postal', '6': 'Ferroviaria', '7': 'Carretera / terrestre', '8': 'Oleoductos, gasoductos', '9': 'Tendido eléctrico', '10': 'Otra', '11': 'Courier / aéreo' };
const conNombre = (tabla: Record<string, string>, c: string) => c ? (tabla[c] ? `${tabla[c]} (${c})` : `código ${c}`) : '';

// ─────────────── Formatos ───────────────
const rutPuntos = (r: string) => { const l = (r || '').replace(/[^0-9kK]/g, '').toUpperCase(); return l ? l.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + l.slice(-1) : ''; };
const fechaCl = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${m[3]}-${m[2]}-${m[1]}` : iso; };
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fechaLarga = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${Number(m[3])} de ${MESES[Number(m[2]) - 1]} de ${m[1]}` : iso; };

export interface OpcionesPdfDte { timbrePng?: string; resolucion?: { numero: string; fecha: string }; unidadSii?: string; cedible?: boolean }

/** Genera la representación impresa en PDF (hoja carta). `timbrePng` es la imagen del PDF417 del timbre. */
export function crearPdfDte(d: DteLeido, o: OpcionesPdfDte = {}): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const L = 12, R = 204, W = R - L;
  const exp = d.esExportacion;
  const dec = exp ? 2 : 0;
  const m = (n: number) => (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('es-CL', { minimumFractionDigits: dec, maximumFractionDigits: exp ? 4 : 0 });
  const moneda = exp ? (d.totales.moneda || 'MONEDA EXTRANJERA') : '$';
  const f = (est: 'normal' | 'bold', t: number) => { doc.setFont('helvetica', est); doc.setFontSize(t); };
  const negro = () => doc.setTextColor(20, 20, 20);
  let y = 14;

  // Recuadro del SII (rojo): RUT, tipo de documento y folio
  const bx = 138, bw = R - bx;
  doc.setDrawColor(220, 0, 0); doc.setLineWidth(0.8); doc.rect(bx, y, bw, 30);
  doc.setTextColor(220, 0, 0);
  f('bold', 11); doc.text(`R.U.T.: ${rutPuntos(d.emisor.rut)}`, bx + bw / 2, y + 8, { align: 'center' });
  f('bold', 10); const nombreDoc = doc.splitTextToSize(NOMBRE_DTE[d.tipo] || `DOCUMENTO TRIBUTARIO ELECTRÓNICO ${d.tipo}`, bw - 6);
  doc.text(nombreDoc, bx + bw / 2, y + 15, { align: 'center' });
  f('bold', 11); doc.text(`N° ${d.folio}`, bx + bw / 2, y + 15 + nombreDoc.length * 4.5 + 2, { align: 'center' });
  f('bold', 9); doc.text(o.unidadSii || `S.I.I. - ${(d.emisor.comuna || '').toUpperCase()}`, bx + bw / 2, y + 36, { align: 'center' });

  // Emisor
  negro(); f('bold', 12);
  const razon = doc.splitTextToSize(d.emisor.razon.toUpperCase(), bx - L - 4); doc.text(razon, L, y + 4); let ye = y + 4 + razon.length * 5;
  f('normal', 8.5);
  for (const l of [d.emisor.giro, [d.emisor.direccion, d.emisor.comuna, d.emisor.ciudad].filter(Boolean).join(', '), d.emisor.sucursal && `Sucursal: ${d.emisor.sucursal}`,
    [d.emisor.telefono && `Teléfono: ${d.emisor.telefono}`, d.emisor.correo].filter(Boolean).join('  ·  ')].filter(Boolean) as string[]) {
    const t = doc.splitTextToSize(l, bx - L - 4); doc.text(t, L, ye); ye += t.length * 3.8;
  }
  y = Math.max(ye, y + 40) + 3;

  // Receptor
  doc.setDrawColor(150, 150, 150); doc.setLineWidth(0.2);
  const filasR: [string, string][] = [
    ['Señor(es)', d.receptor.razon], [exp ? 'Identificación' : 'R.U.T.', exp && d.receptor.idExtranjero ? d.receptor.idExtranjero : rutPuntos(d.receptor.rut)],
    ['Giro', d.receptor.giro], ['Dirección', [d.receptor.direccion, d.receptor.comuna, d.receptor.ciudad].filter(Boolean).join(', ')],
    ...(d.receptor.contacto ? [['Contacto', d.receptor.contacto] as [string, string]] : []),
    ['Fecha de emisión', fechaLarga(d.fecha)],
    ...(d.vencimiento ? [['Vencimiento', fechaCl(d.vencimiento)] as [string, string]] : []),
    ...(d.formaPago ? [['Forma de pago', FORMA_PAGO[d.formaPago] || d.formaPago] as [string, string]] : []),
    ...(d.terminoPago ? [['Condición', d.terminoPago] as [string, string]] : []),
  ].filter(([, v]) => v) as [string, string][];
  const yR0 = y; y += 5;
  for (const [k, v] of filasR) {
    f('bold', 8.5); doc.text(`${k}:`, L + 3, y); f('normal', 8.5);
    const t = doc.splitTextToSize(v, W - 40); doc.text(t, L + 36, y); y += t.length * 4.2;
  }
  doc.rect(L, yR0, W, y - yR0 - 1);
  y += 3;

  // Exportación: aduana y transporte
  if (exp && (d.aduana || d.otraMoneda)) {
    const a = d.aduana || {};
    const datos: [string, string][] = ([
      ['Modalidad de venta', conNombre(MOD_VENTA, a.CodModVenta)], ['Cláusula de venta', conNombre(CLAUSULA, a.CodClauVenta)],
      ['Total cláusula', a.TotClauVenta ? `${moneda} ${m(Number(a.TotClauVenta))}` : ''], ['Vía de transporte', conNombre(VIA, a.CodViaTransp)],
      ['Nave / transporte', a.NombreTransp || ''], ['Cía. transportista', [a.NomCiaTransp, a.RUTCiaTransp && rutPuntos(a.RUTCiaTransp)].filter(Boolean).join(' ')],
      ['Booking', a.Booking || ''], ['Puerto de embarque', a.CodPtoEmbarque ? `código ${a.CodPtoEmbarque}${a.IdAdicPtoEmb ? ` (${a.IdAdicPtoEmb})` : ''}` : ''],
      ['Puerto de desembarque', a.CodPtoDesemb ? `código ${a.CodPtoDesemb}${a.IdAdicPtoDesemb ? ` (${a.IdAdicPtoDesemb})` : ''}` : ''],
      ['País receptor', a.CodPaisRecep ? `código ${a.CodPaisRecep}` : ''], ['País destino', a.CodPaisDestin ? `código ${a.CodPaisDestin}` : ''],
      ['Peso bruto', a.PesoBruto ? `${a.PesoBruto}${a.CodUnidPesoBruto ? ` (unidad ${a.CodUnidPesoBruto})` : ''}` : ''],
      ['Peso neto', a.PesoNeto ? `${a.PesoNeto}${a.CodUnidPesoNeto ? ` (unidad ${a.CodUnidPesoNeto})` : ''}` : ''],
      ['Tara', a.Tara || ''], ['Total ítems', a.TotItems || ''], ['Total bultos', a.TotBultos || ''],
      ...d.bultos.map(b => ['Bultos', `${b.cantidad} (tipo ${b.tipo})${b.marcas ? ` · Marcas: ${b.marcas}` : ''}`] as [string, string]),
      ['Flete', a.MntFlete ? `${moneda} ${m(Number(a.MntFlete))}` : ''], ['Seguro', a.MntSeguro ? `${moneda} ${m(Number(a.MntSeguro))}` : ''],
      ['Moneda', d.totales.moneda], ...(d.otraMoneda ? [['Tipo de cambio', `${d.otraMoneda.moneda}: ${d.otraMoneda.tipoCambio.toLocaleString('es-CL')}`] as [string, string]] : []),
    ] as [string, string][]).filter(([, v]) => v);
    const y0 = y; f('bold', 8.5); doc.text('DATOS DE EXPORTACIÓN', L + 3, y + 4.5); y += 8;
    const colW = W / 2;
    datos.forEach(([k, v], i) => {
      const cx = L + 3 + (i % 2) * colW, cy = y + Math.floor(i / 2) * 4.3;
      f('bold', 7.5); doc.text(`${k}:`, cx, cy); f('normal', 7.5); doc.text(doc.splitTextToSize(v, colW - 40)[0] || '', cx + 34, cy);
    });
    y += Math.ceil(datos.length / 2) * 4.3 + 1;
    doc.rect(L, y0, W, y - y0); y += 3;
  }

  // Detalle
  const cols = [
    { t: 'Código', w: 20, a: 'left' as const }, { t: 'Descripción', w: 78, a: 'left' as const }, { t: 'Cant.', w: 16, a: 'right' as const },
    { t: 'Unid.', w: 12, a: 'left' as const }, { t: exp ? 'P. unitario' : 'Precio', w: 24, a: 'right' as const }, { t: 'Desc.', w: 18, a: 'right' as const }, { t: 'Total', w: 24, a: 'right' as const },
  ];
  const xs: number[] = []; cols.reduce((x, c) => { xs.push(x); return x + c.w; }, L);
  doc.setFillColor(235, 235, 235); doc.rect(L, y, W, 6, 'F'); f('bold', 8);
  cols.forEach((c, i) => doc.text(c.t, c.a === 'right' ? xs[i] + c.w - 1.5 : xs[i] + 1.5, y + 4.2, { align: c.a }));
  y += 9; f('normal', 8);
  const fin = 236;
  for (const l of d.lineas) {
    const desc = doc.splitTextToSize([l.nombre, l.descripcion].filter(Boolean).join(' — ') + (l.exento ? ' (exento)' : ''), cols[1].w - 3);
    if (y + desc.length * 3.6 > fin) { doc.addPage(); y = 16; }
    const v = [l.codigo, '', l.cantidad ? l.cantidad.toLocaleString('es-CL', { maximumFractionDigits: 6 }) : '', l.unidad, l.precio ? m(l.precio) : '', l.descuento ? m(l.descuento) : '', m(l.monto)];
    cols.forEach((c, i) => { if (i !== 1) doc.text(String(v[i]), c.a === 'right' ? xs[i] + c.w - 1.5 : xs[i] + 1.5, y, { align: c.a }); });
    doc.text(desc, xs[1] + 1.5, y);
    y += desc.length * 3.6 + 1.2;
  }
  for (const g of d.descuentosGlobales) {
    doc.text(`${g.tipo === 'D' ? 'Descuento' : 'Recargo'} global${g.glosa ? `: ${g.glosa}` : ''}`, xs[1] + 1.5, y);
    doc.text(g.enPorcentaje ? `${g.valor}%` : m(g.valor), R - 1.5, y, { align: 'right' }); y += 4.8;
  }
  doc.setDrawColor(150, 150, 150); doc.line(L, y, R, y); y += 4;

  // Referencias
  if (d.referencias.length) {
    f('bold', 8); doc.text('Referencias', L, y); y += 4; f('normal', 7.8);
    for (const r of d.referencias) {
      const t = doc.splitTextToSize(`${NOMBRE_REF[r.tipo] || `Tipo ${r.tipo}`} N° ${r.folio}${r.fecha ? ` del ${fechaCl(r.fecha)}` : ''}${r.codigo ? ` · ${COD_REF[r.codigo] || r.codigo}` : ''}${r.razon ? ` · ${r.razon}` : ''}`, W);
      doc.text(t, L, y); y += t.length * 3.6;
    }
    y += 2;
  }

  // Pie: timbre a la izquierda, totales a la derecha
  const conAcuse = !!o.cedible && ['33', '34', '46', '52'].includes(d.tipo);
  const pieMax = conAcuse ? 184 : 222;
  if (y > pieMax) { doc.addPage(); y = 16; }
  const yPie = Math.max(y, pieMax - 8);
  const totales: [string, string][] = ([
    ['Monto neto', d.totales.neto ? m(d.totales.neto) : ''], ['Monto exento', d.totales.exento ? m(d.totales.exento) : ''],
    [`IVA ${d.totales.tasaIva || 19}%`, d.totales.iva ? m(d.totales.iva) : ''],
    ...d.totales.otrosImpuestos.map(i => [`Impuesto código ${i.tipo}${i.tasa ? ` (${i.tasa}%)` : ''}`, m(i.monto)] as [string, string]),
    ['Monto no facturable', d.totales.noFacturable ? m(d.totales.noFacturable) : ''], ['Saldo anterior', d.totales.saldoAnterior ? m(d.totales.saldoAnterior) : ''],
  ] as [string, string][]).filter(([, v]) => v);
  let yt = yPie; const tx = 140;
  f('normal', 8.5); negro();
  for (const [k, v] of totales) { doc.text(k, tx, yt); doc.text(`${moneda} ${v}`, R, yt, { align: 'right' }); yt += 4.8; }
  doc.setFillColor(235, 235, 235); doc.rect(tx - 2, yt - 3.6, R - tx + 2, 6.5, 'F'); f('bold', 10);
  doc.text('TOTAL', tx, yt + 0.8); doc.text(`${moneda} ${m(d.totales.total)}`, R, yt + 0.8, { align: 'right' }); yt += 7;
  if (d.totales.valorPagar && d.totales.valorPagar !== d.totales.total) { f('bold', 8.5); doc.text('Valor a pagar', tx, yt); doc.text(`${moneda} ${m(d.totales.valorPagar)}`, R, yt, { align: 'right' }); yt += 5; }
  if (exp && d.otraMoneda?.total) { f('normal', 8); doc.text(`Total en ${d.otraMoneda.moneda}: ${d.otraMoneda.total.toLocaleString('es-CL')}`, R, yt, { align: 'right' }); yt += 4.5; }

  // Timbre electrónico (PDF417) con su leyenda
  const tw = 76, th = 30;
  if (o.timbrePng) doc.addImage(o.timbrePng, 'PNG', L, yPie - 2, tw, th);
  else { doc.setDrawColor(180, 180, 180); doc.rect(L, yPie - 2, tw, th); f('normal', 7); doc.text('Timbre no disponible en el XML', L + tw / 2, yPie + th / 2 - 2, { align: 'center' }); }
  f('bold', 7.5); negro();
  doc.text('Timbre Electrónico SII', L + tw / 2, yPie + th + 2.5, { align: 'center' });
  f('normal', 7);
  const res = o.resolucion?.numero ? `Res. N° ${o.resolucion.numero} de ${(o.resolucion.fecha || '').slice(0, 4)}` : 'Res. SII';
  doc.text(`${res} - Verifique documento: www.sii.cl`, L + tw / 2, yPie + th + 6, { align: 'center' });

  // Acuse de recibo (copia cedible de facturas y guías)
  if (conAcuse) {
    const ya = Math.max(yt, yPie + th + 9) + 4;
    doc.setDrawColor(60, 60, 60); doc.rect(L, ya, W, 30);
    f('bold', 8); doc.text('ACUSE DE RECIBO', L + 3, ya + 5);
    f('normal', 7.5);
    [['Nombre:', 'R.U.T.:'], ['Fecha:', 'Recinto:'], ['Firma:', '']].forEach(([a, b], i) => {
      doc.text(`${a} ________________________________________`, L + 3, ya + 11 + i * 5.5);
      if (b) doc.text(`${b} ________________________________`, L + W / 2 + 3, ya + 11 + i * 5.5);
    });
    f('normal', 6.3);
    doc.text(doc.splitTextToSize('El acuse de recibo que se declara en este acto, de acuerdo a lo dispuesto en la letra b) del Art. 4°, y la letra c) del Art. 5° de la Ley 19.983, acredita que la entrega de mercaderías o servicio(s) prestado(s) ha(n) sido recibido(s).', W - 40), L + 3, ya + 26);
    f('bold', 12); doc.setTextColor(220, 0, 0); doc.text('CEDIBLE', R - 3, ya + 27, { align: 'right' }); negro();
  }
  return doc;
}
