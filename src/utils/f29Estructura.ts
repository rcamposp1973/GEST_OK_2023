/**
 * Estructura del Formulario 29 (líneas, códigos y signo), según el F29 vigente del SII.
 * Gest_OK muestra la misma estructura con su propio diseño. En modo compacto se ven sólo las líneas con monto.
 *
 * Numeración de líneas: la del formulario en línea del SII (2025). Si el SII agrega o mueve líneas, se actualiza aquí.
 */
export type Signo = '+' | '-' | '=' | '';
export interface CodigoF29 { cod: string; rol: 'cant' | 'monto' | 'info' }
export interface LineaF29 { linea: number; glosa: string; codigos: CodigoF29[]; signo: Signo; total?: boolean }
export interface SeccionF29 { id: string; titulo: string; subtitulo?: string; lineas: LineaF29[] }

const L = (linea: number, glosa: string, cant: string | null, monto: string | null, signo: Signo = '', extra: string[] = [], total = false): LineaF29 => ({
  linea, glosa, signo, total,
  codigos: [...(cant ? [{ cod: cant, rol: 'cant' as const }] : []), ...(monto ? [{ cod: monto, rol: 'monto' as const }] : []), ...extra.map(cod => ({ cod, rol: 'info' as const }))],
});

export const F29_ESTRUCTURA: SeccionF29[] = [
  {
    id: 'ventas_info', titulo: 'Débitos y ventas', subtitulo: 'Información de ingresos (monto neto)',
    lineas: [
      L(1, 'Exportaciones', '585', '20'),
      L(2, 'Ventas y/o servicios prestados exentos o no gravados del giro', '586', '142'),
      L(3, 'Ventas con retención sobre el margen de comercialización (contribuyentes retenidos)', '731', '732'),
      L(4, 'Ventas y/o servicios prestados exentos o no gravados que no son del giro', '714', '715'),
      L(5, 'Facturas de compra recibidas con retención total y factura de inicio emitida', '515', '587'),
      L(6, 'Facturas de compra recibidas con retención parcial (total neto)', null, '720'),
    ],
  },
  {
    id: 'debitos', titulo: 'Débitos y ventas', subtitulo: 'Genera débito',
    lineas: [
      L(7, 'Facturas emitidas por ventas y servicios del giro, o por cuenta de terceros', '503', '502', '+'),
      L(8, 'Facturas emitidas por la venta de bienes inmuebles afectas a IVA', '763', '764', '+'),
      L(9, 'Facturas y notas de débito por ventas y servicios que no son del giro (activo fijo y otros)', '716', '717', '+'),
      L(10, 'Boletas', '110', '111', '+'),
      L(11, 'Comprobantes o recibos de pago generados en transacciones pagadas por medios electrónicos', '758', '759', '+'),
      L(12, 'Notas de débito emitidas del giro y notas de débito recibidas con retención parcial', '512', '513', '+'),
      L(13, 'Notas de crédito emitidas asociadas al giro y recibidas con retención parcial', '509', '510', '-'),
      L(14, 'Notas de crédito emitidas por vales de máquinas autorizadas', '708', '709', '-'),
      L(15, 'Notas de crédito emitidas por ventas que no son del giro (activo fijo y otros)', '733', '734', '-'),
      L(16, 'Facturas de compra recibidas con retención parcial (contribuyentes retenidos)', '516', '517', '+'),
      L(17, 'Liquidación y liquidación factura recibidas (suma débito)', '500', '501', '+'),
      L(18, 'Liquidación y liquidación factura emitidas (resta débito)', '817', '818', '-'),
      L(19, 'Adicionales al débito fiscal por devoluciones excesivas de remanente (Art. 27 bis)', null, '154', '+'),
      L(20, 'Restitución adicional por proporción de operaciones exentas (Art. 27 bis inc. 2°)', null, '518', '+'),
      L(21, 'Reintegro del impuesto de timbres (Art. 3° Ley 20.259) e IVA por arriendo esporádico de BBRR amoblados', null, '713', '+'),
      L(22, 'Adiciones al débito por IEPD Ley 20.765 (M3, base, variable)', null, '741', '+', ['738', '739', '740']),
      L(23, 'Restitución adicional por reembolso de remanente CF IVA (Ley 21.256)', null, '791', '+'),
      L(24, 'TOTAL DÉBITOS', null, '538', '=', [], true),
    ],
  },
  {
    id: 'compras_sin', titulo: 'Créditos y compras', subtitulo: 'IVA por documentos electrónicos y compras sin derecho a crédito',
    lineas: [
      L(25, 'IVA por documentos electrónicos recibidos (con derecho a crédito / sin derecho a crédito)', null, '511', '', ['514']),
      L(26, 'Compras internas afectas sin derecho a crédito (monto neto)', '564', '521'),
      L(27, 'Importaciones sin derecho a crédito (monto neto)', '566', '560'),
      L(28, 'Compras internas exentas o no gravadas (monto neto)', '584', '562'),
    ],
  },
  {
    id: 'creditos', titulo: 'Créditos y compras', subtitulo: 'Con derecho a crédito fiscal',
    lineas: [
      L(29, 'Facturas recibidas del giro, facturas de compra emitidas y comisión por liquidación factura', '519', '520', '+'),
      L(30, 'Facturas recibidas de proveedores: supermercados y comercios similares', '761', '762', '+'),
      L(31, 'Facturas recibidas por adquisición o construcción de bienes inmuebles (Ley 20.780)', '765', '766', '+'),
      L(32, 'Facturas activo fijo', '524', '525', '+'),
      L(33, 'Notas de crédito recibidas', '527', '528', '-'),
      L(34, 'Notas de débito recibidas', '531', '532', '+'),
      L(35, 'Formulario de pago de importaciones del giro', '534', '535', '+'),
      L(36, 'Formulario de pago de importaciones de activo fijo', '536', '553', '+'),
      L(37, 'Remanente crédito fiscal mes anterior (reajustado)', null, '504', '+'),
      L(38, 'Devolución solicitud Art. 36 (exportadores)', null, '593', '-'),
      L(39, 'Devolución solicitud Art. 27 bis (activo fijo)', null, '594', '-'),
      L(40, 'Certificado imputación Art. 27 bis (activo fijo)', null, '592', '-'),
      L(41, 'Devolución solicitud Art. 3° (cambio de sujeto)', null, '539', '-'),
      L(42, 'Devolución solicitud Ley 20.258 (generadoras eléctricas)', null, '718', '-'),
      L(43, 'Devolución de remanente de crédito fiscal (Ley 21.256)', null, '790', '-'),
      L(44, 'Monto reintegrado por devolución indebida de crédito fiscal', null, '164', '+'),
      L(45, 'Recuperación impuesto específico al petróleo diésel (Art. 7 Ley 18.502)', '730', '127', '+', ['742', '743']),
      L(46, 'Recuperación impuesto específico diésel transportistas de carga (Art. 2 Ley 19.764)', '729', '544', '+', ['744', '745']),
      L(47, 'Crédito del Art. 11 Ley 18.211 (importaciones Zona Franca)', null, '523', '+'),
      L(48, 'Crédito por impuesto de timbres y estampillas (Art. 3° Ley 20.259)', null, '712', '+'),
      L(49, 'Crédito IVA por comisiones de administradoras de fondos (inversionistas no residentes)', null, '757', '+'),
      L(50, 'TOTAL CRÉDITOS', null, '537', '=', [], true),
    ],
  },
  {
    id: 'iva_resultado', titulo: 'Impuesto al Valor Agregado', subtitulo: 'Resultado',
    lineas: [
      L(51, 'Remanente de crédito fiscal para el período siguiente / IVA determinado', '77', '89', '+', ['756', '755']),
    ],
  },
  {
    id: 'renta', titulo: 'Impuesto a la Renta', subtitulo: 'Retenciones y pagos provisionales',
    lineas: [
      L(60, 'Retención impuesto primera categoría por rentas de capitales mobiliarios', null, '50', '+'),
      L(61, 'Retención impuesto único a los trabajadores (Art. 74 N° 1 LIR)', null, '48', '+', ['751', '735']),
      L(62, 'Retención sobre rentas del Art. 42 N° 2 LIR (boletas de honorarios)', null, '151', '+'),
      L(63, 'Retención sobre rentas del Art. 48 LIR (dietas de directores)', null, '153', '+'),
      L(64, 'Retención adicional préstamo solidario trabajadores dependientes (Art. 74 N° 1)', null, '49', '+'),
      L(65, 'Retención adicional préstamo solidario trabajadores independientes (Art. 42 N° 2)', null, '155', '+'),
      L(70, 'PPM primera categoría (base imponible, tasa y monto)', '563', '62', '+', ['115', '30', '68', '750']),
      L(71, 'PPM adicional Art. 84 (empresario individual, préstamo solidario)', null, '156', '+'),
      L(77, 'PPM rentas del Art. 42 N° 2 (profesionales independientes)', null, '152', '+'),
      L(81, 'SUB TOTAL IMPUESTO DETERMINADO ANVERSO', null, '595', '=', [], true),
    ],
  },
  {
    id: 'adicionales', titulo: 'Impuestos adicionales', subtitulo: 'Art. 37 y 42 D.L. 825 (ILA y otros)',
    lineas: [
      L(85, 'Débito impuesto adicional Art. 37 letras e, h, i, l', null, '522', '+'),
      L(87, 'Débito impuesto adicional Art. 37 letras a, b, c y Art. 40', null, '113', '+'),
      L(88, 'Crédito impuesto adicional Art. 37 letras a, b, c', null, '28', '-'),
      L(93, 'Débito impuesto adicional Art. 42 (ventas de bebidas alcohólicas y analcohólicas)', null, '577', '+', ['32', '150', '146', '752']),
      L(102, 'Crédito impuesto adicional Art. 42 por compras', null, '576', '-', ['33', '149', '85', '754']),
      L(113, 'Impuesto adicional Art. 42 determinado / remanente', '507', '506', '+'),
    ],
  },
  {
    id: 'cambio_sujeto', titulo: 'Cambio de sujeto', subtitulo: 'IVA retenido a terceros',
    lineas: [
      L(119, 'IVA total retenido a terceros (tasa Art. 14 D.L. 825)', null, '39', '+'),
      L(120, 'IVA parcial retenido a terceros (según tasa)', null, '554', '+'),
      L(121, 'IVA retenido por notas de crédito emitidas', null, '736', '-'),
      L(122, 'Retención del margen de comercialización', null, '597', '+'),
      L(123, 'Retención anticipo de cambio de sujeto', '555', '596', '+'),
    ],
  },
  {
    id: 'creditos_especiales', titulo: 'Créditos especiales', subtitulo: 'Crédito del mes + remanente mes anterior = total crédito',
    lineas: [
      L(135, 'Crédito por sistemas solares térmicos (Ley 20.365)', '725', '727', '-', ['737']),
      L(136, 'Imputación del pago patente aguas (Ley 20.017)', '704', '706', '-', ['705']),
      L(137, 'Cotización adicional (Ley 18.566)', '160', '570', '-', ['161']),
      L(138, 'Crédito especial empresas constructoras (Art. 21 D.L. 910)', '126', '571', '-', ['128']),
      L(139, 'Recuperación de peajes transportistas pasajeros (Ley 19.764)', '572', '590', '-', ['568']),
      L(140, 'Crédito por desembolsos directos trazabilidad', '768', '770', '-', ['769']),
      L(141, 'TOTAL DETERMINADO', null, '547', '=', [], true),
    ],
  },
  {
    id: 'remanentes_especiales', titulo: 'Remanente créditos especiales', subtitulo: 'Para el período siguiente',
    lineas: [
      L(142, 'Remanente crédito por sistemas solares térmicos', null, '728'),
      L(143, 'Remanente período siguiente patente aguas', null, '707'),
      L(144, 'Remanente cotización adicional Ley 18.566', null, '73'),
      L(145, 'Remanente crédito especial empresas constructoras', null, '130'),
      L(146, 'Remanente recuperación de peajes transportistas pasajeros', null, '591'),
      L(147, 'Remanente crédito por desembolsos directos trazabilidad', null, '771'),
    ],
  },
  {
    id: 'total', titulo: 'Total a pagar', lineas: [
      L(148, 'TOTAL A PAGAR DENTRO DEL PLAZO LEGAL', null, '91', '=', [], true),
      L(149, 'Más IPC', null, '92', '+'),
      L(150, 'Más intereses y multas', null, '93', '+'),
      L(151, 'TOTAL A PAGAR CON RECARGO', null, '94', '=', [], true),
    ],
  },
];

/** Nombre del rol de un código "info" en líneas con varios casilleros. */
export const NOMBRE_CODIGO: Record<string, string> = {
  '514': 'Sin derecho a crédito', '756': 'IVA postergado', '755': 'Postergación', '751': 'Donaciones', '735': 'Crédito',
  '115': 'Tasa PPM %', '30': 'Pérdida Art. 90', '68': 'Crédito capacitación', '750': 'Suspensión PPM',
  '737': 'Remanente mes anterior', '705': 'Remanente mes anterior', '161': 'Remanente mes anterior', '128': 'Remanente mes anterior (reajustado)',
  '568': 'Remanente mes anterior', '769': 'Remanente mes anterior', '738': 'M3', '739': 'Base', '740': 'Variable', '742': 'Base', '743': 'Variable',
  '744': 'Base', '745': 'Variable', '32': 'Tasa 2', '150': 'Tasa 3', '146': 'Tasa 4', '752': 'Tasa 5', '33': 'Tasa 2', '149': 'Tasa 3', '85': 'Tasa 4', '754': 'Tasa 5',
};

export type ValoresF29 = Record<string, number | undefined>;

/** Una línea se muestra en modo compacto si alguno de sus casilleros tiene valor, o si es un total. */
export const lineaConValor = (l: LineaF29, v: ValoresF29) => l.total || l.codigos.some(c => Number(v[c.cod]) !== 0 && v[c.cod] !== undefined);
