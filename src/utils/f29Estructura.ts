/**
 * Estructura del Formulario 29 (líneas, códigos y signo), igual al F29 vigente del SII (versión internet V 1.10).
 * Gest_OK muestra la misma estructura con su propio diseño. En modo compacto se ven sólo las líneas con monto.
 */
export type Signo = '+' | '-' | '=' | '';
export interface CodigoF29 { cod: string; rol: 'cant' | 'monto' | 'info'; etiqueta?: string }
export interface LineaF29 { linea: number | null; glosa: string; codigos: CodigoF29[]; signo: Signo; total?: boolean }
export interface SeccionF29 { id: string; grupo: string; titulo?: string; columnas?: [string, string]; lineas: LineaF29[] }

type Info = [string, string];
const L = (linea: number | null, glosa: string, cant: string | null, monto: string | null, signo: Signo = '', extra: Info[] = [], total = false): LineaF29 => ({
  linea, glosa, signo, total,
  codigos: [
    ...extra.map(([cod, etiqueta]) => ({ cod, rol: 'info' as const, etiqueta })),
    ...(cant ? [{ cod: cant, rol: 'cant' as const }] : []),
    ...(monto ? [{ cod: monto, rol: 'monto' as const }] : []),
  ],
});
const T = (linea: number, glosa: string, monto: string) => L(linea, glosa, null, monto, '=', [], true);

const CANT_NETO: [string, string] = ['Cantidad de documentos', 'Monto neto'];

export const F29_ESTRUCTURA: SeccionF29[] = [
  // ───────────── DÉBITOS Y VENTAS ─────────────
  {
    id: 'ventas_info', grupo: 'Débitos y ventas', titulo: 'Ventas y/o servicios prestados · Información de ingresos', columnas: CANT_NETO,
    lineas: [
      L(1, 'Exportaciones', '585', '20'),
      L(2, 'Ventas y/o servicios prestados exentos, o no gravados del giro', '586', '142'),
      L(3, 'Ventas con retención sobre el margen de comercialización (contribuyentes retenidos)', '731', '732'),
      L(4, 'Ventas y/o servicios prestados exentos o no gravados que no son del giro', '714', '715'),
      L(5, 'Facturas de compra recibidas con retención total (contribuyentes retenidos) y factura de inicio emitida', '515', '587'),
      L(6, 'Facturas de compras recibidas con retención parcial (total neto)', null, '720'),
    ],
  },
  {
    id: 'debitos', grupo: 'Débitos y ventas', titulo: 'Genera débito', columnas: ['Cantidad de documentos', 'Débito'],
    lineas: [
      L(7, 'Facturas emitidas por ventas y servicios del giro, o por cuenta de terceros', '503', '502', '+'),
      L(8, 'Facturas emitidas por la venta de bienes inmuebles afectas a IVA', '763', '764', '+'),
      L(9, 'Facturas y notas de débito por ventas y servicios que no son del giro (activo fijo y otros)', '716', '717', '+'),
      L(10, 'Boletas', '110', '111', '+'),
      L(11, 'Comprobantes o recibos de pago generados en transacciones pagadas a través de medios electrónicos', '758', '759', '+'),
      L(12, 'Notas de débito emitidas asociadas al giro y notas de débito recibidas de terceros por retención parcial de cambio de sujeto', '512', '513', '+'),
      L(13, 'Notas de crédito emitidas por facturas asociadas al giro y notas de crédito recibidas de terceros por retención parcial de cambio de sujeto', '509', '510', '-'),
      L(14, 'Notas de crédito emitidas por vales de máquinas autorizadas por el Servicio', '708', '709', '-'),
      L(15, 'Notas de crédito emitidas por ventas y servicios que no son del giro (activo fijo y otros)', '733', '734', '-'),
      L(16, 'Facturas de compra recibidas con retención parcial (contribuyentes retenidos)', '516', '517', '+'),
      L(17, 'Liquidación y liquidación factura', '500', '501', '+'),
      L(18, 'Adiciones al débito fiscal del mes, originadas en devoluciones excesivas registradas en otros períodos por Art. 27 bis', null, '154', '+'),
      L(19, 'Restitución adicional por proporción de operaciones exentas y/o no gravadas por concepto Art. 27 bis, inc. 2° (Ley 19.738/01)', null, '518', '+'),
      L(20, 'Reintegro del impuesto de timbres y estampillas, Art. 3° Ley N° 20.259 e IVA determinado en el arrendamiento esporádico de BBRR amoblados', null, '713', '+'),
      L(21, 'Adiciones al débito por IEPD, Ley 20.765', null, '741', '+', [['738', 'M3'], ['739', 'Base'], ['740', 'Variable']]),
      L(22, 'Restitución adicional por proporción de operaciones exentas y/o no gravadas por concepto reembolso remanente CF IVA (Ley 21.256)', null, '791', '+'),
      T(23, 'TOTAL DÉBITOS', '538'),
    ],
  },
  // ───────────── CRÉDITOS Y COMPRAS ─────────────
  {
    id: 'compras', grupo: 'Créditos y compras', titulo: 'Compras y/o servicios utilizados · IVA D.L. 825/74', columnas: ['Con derecho a crédito', 'Sin derecho a crédito'],
    lineas: [L(24, 'IVA por documentos electrónicos recibidos', '511', '514')],
  },
  {
    id: 'sin_derecho', grupo: 'Créditos y compras', titulo: 'Sin derecho a crédito fiscal', columnas: CANT_NETO,
    lineas: [
      L(25, 'Internas afectas', '564', '521'),
      L(26, 'Importaciones', '566', '560'),
      L(27, 'Internas exentas, o no gravadas', '584', '562'),
    ],
  },
  {
    id: 'internas', grupo: 'Créditos y compras', titulo: 'Con derecho a crédito fiscal · Internas', columnas: ['Cantidad de documentos', 'Crédito, recuperación y reintegro'],
    lineas: [
      L(28, 'Facturas recibidas del giro y facturas de compra emitidas', '519', '520', '+'),
      L(29, 'Facturas recibidas de proveedores: supermercados y comercios similares, Art. 23 N° 4 D.L. 825, de 1974 (Ley N° 20.780)', '761', '762', '+'),
      L(30, 'Facturas recibidas por adquisición o construcción de bienes inmuebles, Art. 8° transitorio (Ley N° 20.780)', '765', '766', '+'),
      L(31, 'Facturas activo fijo', '524', '525', '+'),
      L(32, 'Notas de crédito recibidas y notas de crédito emitidas por retención de cambio de sujeto', '527', '528', '-'),
      L(33, 'Notas de débito recibidas y notas de débito emitidas por retención de cambio de sujeto', '531', '532', '+'),
    ],
  },
  {
    id: 'importaciones', grupo: 'Créditos y compras', titulo: 'Importaciones', columnas: ['Cantidad de documentos', 'Crédito, recuperación y reintegro'],
    lineas: [
      L(34, 'Declaraciones de ingreso (DIN) importaciones del giro', '534', '535', '+'),
      L(35, 'Declaraciones de ingreso (DIN) importaciones de activo fijo', '536', '553', '+'),
      L(36, 'Remanente crédito fiscal mes anterior', null, '504', '+'),
      L(37, 'Devolución solicitud Art. 36 (exportadores)', null, '593', '-'),
      L(38, 'Devolución solicitud Art. 27 bis (activo fijo)', null, '594', '-'),
      L(39, 'Certificado imputación Art. 27 bis (activo fijo)', null, '592', '-'),
      L(40, 'Devolución solicitud Art. 3° (cambio de sujeto)', null, '539', '-'),
      L(41, 'Devolución solicitud Ley N° 20.258, por remanente CF IVA, originado en impuesto específico petróleo diésel (generadoras eléctricas)', null, '718', '-'),
      L(42, 'Devolución solicitud reembolso remanente de crédito fiscal IVA', null, '790', '-'),
      L(43, 'Monto reintegrado por devolución indebida de crédito fiscal D.S. 348 (exportadores)', null, '164', '+'),
    ],
  },
  {
    id: 'ley20765', grupo: 'Créditos y compras', titulo: 'Ley 20.765', columnas: ['M3 comprados con derecho a crédito', 'Componentes del impuesto'],
    lineas: [
      L(44, 'Recuperación de impuesto específico al petróleo diésel (Art. 7° Ley 18.502, Arts. 1° y 3° D.S. N° 311/86)', '730', '127', '+', [['742', 'Base'], ['743', 'Variable']]),
      L(45, 'Recuperación impuesto específico petróleo diésel soportado por transportistas de carga (Art. 2° Ley N° 19.764)', '729', '544', '+', [['744', 'Base'], ['745', 'Variable']]),
      L(46, 'Crédito del Art. 11° Ley 18.211 (correspondiente a Zona Franca de Extensión)', null, '523', '+'),
      L(47, 'Crédito por impuesto de timbres y estampillas, Art. 3° Ley N° 20.259', null, '712', '+'),
      L(48, 'Crédito por IVA restituido a aportantes sin domicilio ni residencia en Chile (Art. 83, del artículo primero Ley 20.712)', null, '757', '+'),
      T(49, 'TOTAL CRÉDITOS', '537'),
    ],
  },
  {
    id: 'postergacion', grupo: 'Créditos y compras', titulo: 'Postergación de IVA (Ley 20.780 y 21.210)', columnas: ['', 'Impuesto determinado'],
    lineas: [L(50, 'Remanente de crédito fiscal para el período siguiente · IVA determinado', null, '89', '+', [['77', 'Remanente período siguiente'], ['756', 'Postergación pago del IVA'], ['755', 'Monto postergado']])],
  },
  {
    id: 'postergacion12', grupo: 'Créditos y compras', titulo: 'Postergación de IVA en 12 cuotas (Ley 21.207)', columnas: ['', 'Impuesto determinado'],
    lineas: [L(51, 'Saldo de IVA postergado en 12 cuotas', null, '775', '+', [['772', 'Saldo'], ['773', 'Monto IVA postergado en 12 cuotas (0%)'], ['774', 'Monto cuota a pagar']])],
  },
  {
    id: 'postergacion_ds', grupo: 'Créditos y compras', titulo: 'Postergación de IVA en 6 o 12 cuotas (D.S. 420 MH y D.S. 997 MH)', columnas: ['', 'Monto cuota a pagar'],
    lineas: [
      L(52, 'Monto total de IVA postergado (cuotas)', null, '780', '+', [['777', 'Monto total IVA postergado'], ['778', 'IVA postergado cód. 89'], ['779', 'Pendiente de cobro'], ['792', 'Cuota postergada'], ['793', 'Postergar cuota']]),
      L(53, 'Monto total IVA postergado (Ley 20.780)', null, '783', '+', [['782', 'Monto total'], ['794', 'Pendiente de cobro (Ley 21.210)'], ['796', 'Cuota postergada'], ['797', 'Postergar cuota']]),
      L(54, 'Monto total IVA postergado (Ley 21.207)', null, '785', '+', [['784', 'Monto total'], ['798', 'Cuota postergada'], ['799', 'Postergar cuota']]),
      L(55, 'Monto total IVA postergado (DIN)', null, '787', '+', [['786', 'Monto total'], ['800', 'Pendiente de cobro (DIN)'], ['801', 'Cuota postergada'], ['802', 'Postergar cuota']]),
      L(56, 'Monto total IVA postergado (tributación simplificada)', null, '789', '+', [['788', 'Monto total'], ['803', 'Pendiente de cobro (trib. simpl.)'], ['804', 'Cuota postergada'], ['805', 'Postergar cuota']]),
      L(57, 'Restitución de devolución por concepto de Art. 27 ter D.L. 825, de 1974, inc. 2° (Ley N° 20.720)', null, '760', '+'),
      L(58, 'Certificado imputación Art. 27 ter D.L. 825, de 1974, inc. 1° (Ley N° 20.720)', null, '767', '-'),
    ],
  },
  // ───────────── IMPUESTO A LA RENTA ─────────────
  {
    id: 'retenciones', grupo: 'Impuesto a la Renta D.L. 824/74', titulo: 'Retenciones', columnas: ['', 'Impuesto'],
    lineas: [
      L(59, 'Retención impuesto primera categoría por rentas de capitales mobiliarios, según Art. 73 LIR', null, '50', '+'),
      L(60, 'Retención impuesto único a los trabajadores, según Art. 74 N° 1 LIR', null, '48', '+', [['751', 'Créditos donación Art. 8° Ley 18.984'], ['735', 'Donación Ley 20.444']]),
      L(61, 'Retención de impuesto con tasa del 11,5% sobre las rentas del Art. 42 N° 2, según Art. 74 N° 2 LIR', null, '151', '+'),
      L(62, 'Retención de impuesto con tasa del 10% sobre las rentas del Art. 48, según Art. 74 N° 3 LIR', null, '153', '+'),
      L(63, 'Retención sobre rentas del Art. 42 N° 1 LIR con tasa del 3%, por reintegro del préstamo tasa 0%, según art. 9° letra a) Ley N° 21.252', null, '49', '+'),
      L(64, 'Retención sobre rentas del Art. 42 N° 2 LIR con tasa del 3%, por reintegro del préstamo tasa 0%, según art. 7° Ley N° 21.242 y art. 9° letra b) Ley N° 21.252', null, '155', '+'),
      L(65, 'Retención a suplementeros, según Art. 74 N° 5 (tasa 0,5%) LIR', null, '54', '+'),
      L(66, 'Retención por compra de productos mineros, según Art. 74 N° 6 LIR', null, '56', '+'),
      L(67, 'Retención sobre rescates y otras cantidades pagadas en cumplimiento de seguros dotales y seguros de vida con ahorro del N° 3 del artículo 17 de la LIR (tasa 15%)', null, '588', '+'),
      L(68, 'Retención sobre retiros de ahorro previsional voluntario del Art. 42 bis LIR (tasa 15%)', null, '589', '+'),
    ],
  },
  {
    id: 'ppm', grupo: 'Impuesto a la Renta D.L. 824/74', titulo: 'PPM', columnas: ['', 'PPM neto determinado'],
    lineas: [
      L(69, '1ra categoría Art. 84 a) y 14 D N° 3 letra (k) y 8 letra (a) numeral (viii)', null, '62', '+', [['750', 'Acogido a suspensión PPM'], ['30', 'Monto pérdida Art. 90'], ['563', 'Base imponible'], ['115', 'Tasa'], ['68', 'Crédito / tope suspensión PPM']]),
      L(70, '1ra categoría, con tasa 3%, por reintegro de préstamo tasa 0%, según art. 9° letra c) Ley N° 21.252', null, '156', '+'),
      L(71, 'Mineros, Art. 84 a)', null, '123', '+', [['565', 'Pérdida Art. 90'], ['120', 'Base imponible'], ['542', 'Tasa'], ['122', 'Crédito / tope']]),
      L(72, 'Explotador minero Art. 84 h)', null, '703', '+', [['700', 'Pérdida Art. 90'], ['701', 'Base imponible'], ['702', 'Tasa'], ['711', 'Crédito / tope']]),
      L(73, 'Explotador minero royalty Ley 21.591', null, '810', '+', [['806', 'Pérdida Art. 90'], ['807', 'Base imponible'], ['808', 'Tasa'], ['809', 'Crédito / tope']]),
      L(74, 'Transportistas acogidos a renta presunta, Art. 84, e) y f) (tasa de 0,3%)', null, '66', '+'),
      L(75, 'Crédito capacitación, Ley 19.518/97', null, '723', '-', [['721', 'Crédito del mes'], ['722', 'Remanente mes anterior'], ['724', 'Remanente período siguiente']]),
      L(76, '2da. categoría Art. 84, b) (tasa 11,5%)', null, '152', '+'),
      L(77, '2da. categoría Art. 84 letra b) LIR con tasa 3%, por reintegro de préstamo tasa 0%, según art. 7° Ley N° 21.242 y art. 9° letra b) Ley N° 21.252', null, '157', '+'),
      L(78, 'Taller artesanal Art. 84, c) (tasa de 1,5% o 3%)', null, '70', '+'),
      L(79, 'Renta líquida provisional inciso final de la letra a) del art. 84 de la LIR, Ley N° 21.210', null, '776'),
      T(80, 'SUB TOTAL IMPUESTO DETERMINADO ANVERSO', '595'),
    ],
  },
  // ───────────── TRIBUTACIÓN SIMPLIFICADA ─────────────
  {
    id: 'simplificada', grupo: 'Sistema de tributación simplificada del IVA, Art. 29 D.L. 825', columnas: ['', 'Impuesto determinado'],
    lineas: [
      L(81, 'Ventas del período', null, '529'),
      L(82, 'Crédito del período', null, '530'),
      L(83, 'IVA determinado por concepto de tributación simplificada', null, '409', '+'),
    ],
  },
  // ───────────── ADICIONAL ART. 37 ─────────────
  {
    id: 'art37', grupo: 'Impuesto adicional Art. 37 D.L. 825', columnas: ['', 'Impuesto'],
    lineas: [
      L(84, 'Letras e), h), i), l) (tasa 15%)', null, '522', '+'),
      L(85, 'Letra j) (tasa 50%)', null, '526', '+'),
      L(86, 'Débito de impuesto adicional ventas Art. 37 letras a), b) y c) y Art. 40 D.L. 825 (tasa 15%)', null, '113', '+'),
      L(87, 'Crédito de impuesto adicional Art. 37 letras a), b) y c) D.L. 825', null, '28', '-'),
      L(88, 'Monto reintegrado por devolución indebida de crédito por exportadores D.L. 825', null, '548', '-'),
      L(89, 'Remanente crédito Art. 37 mes anterior D.L. 825', null, '540', '-'),
      L(90, 'Devolución solicitud Art. 36 relativa al impuesto adicional Art. 37 letras a), b) y c) D.L. 825', null, '541', '+'),
      L(91, 'Impuesto adicional Art. 37 y Art. 40 determinado', null, '550', '+', [['549', 'Remanente crédito Art. 37 período siguiente']]),
    ],
  },
  // ───────────── ADICIONAL ART. 42 ─────────────
  {
    id: 'art42_deb', grupo: 'Impuesto adicional Art. 42 D.L. 825', titulo: 'Débitos', columnas: ['', 'Débitos'],
    lineas: [
      L(92, 'Pisco, licores, whisky y aguardiente (tasa 31,5%)', null, '577', '+'),
      L(93, 'Vinos, champaña, chichas (tasa 20,5%)', null, '32', '+'),
      L(94, 'Cervezas (tasa 20,5%)', null, '150', '+'),
      L(95, 'Bebidas analcohólicas (tasa 10%)', null, '146', '+'),
      L(96, 'Bebidas analcohólicas elevado contenido azúcares (tasa 18%)', null, '752', '+'),
      L(97, 'Notas de débito emitidas', null, '545', '+'),
      L(98, 'Notas de crédito emitidas por facturas', null, '546', '-'),
      L(99, 'Notas de crédito emitidas por vales de máquinas autorizadas por el Servicio', null, '710', '-'),
      T(100, 'Total débitos Art. 42 D.L. 825', '602'),
    ],
  },
  {
    id: 'art42_cre', grupo: 'Impuesto adicional Art. 42 D.L. 825', titulo: 'Créditos', columnas: ['Total crédito recargado en facturas recibidas', 'Crédito imputable del período'],
    lineas: [
      L(101, 'Pisco, licores, whisky y aguardiente (tasa 31,5%)', '575', '576', '+'),
      L(102, 'Vinos, champaña, chichas (tasa 20,5%)', '574', '33', '+'),
      L(103, 'Cervezas (tasa 20,5%)', '580', '149', '+'),
      L(104, 'Bebidas analcohólicas (tasa 10%)', '582', '85', '+'),
      L(105, 'Bebidas analcohólicas elevado contenido azúcares (tasa 18%)', '753', '754', '+'),
      L(106, 'Notas de débito recibidas', null, '551', '+'),
      L(107, 'Notas de crédito recibidas', null, '559', '-'),
      L(108, 'Remanente crédito Art. 42 mes anterior', null, '508', '+'),
      L(109, 'Devolución Art. 36 D.L. 825 relativas impuesto Art. 42', null, '533', '-'),
      L(110, 'Monto reintegrado devoluciones indebidas de crédito por exportaciones', null, '552', '+'),
      T(111, 'Total créditos Art. 42 D.L. 825', '603'),
      L(112, 'Impuesto adicional Art. 42 determinado', null, '506', '+', [['507', 'Remanente crédito Art. 42 período siguiente']]),
    ],
  },
  // ───────────── CAMBIO DE SUJETO ─────────────
  {
    id: 'anticipo_cs', grupo: 'Cambio de sujeto D.L. 825', titulo: 'Anticipo cambio de sujeto (contribuyentes retenidos)', columnas: ['', 'Monto'],
    lineas: [
      L(113, 'IVA anticipado del período', null, '556', '+'),
      L(114, 'Remanente del mes anterior', null, '557', '+'),
      L(115, 'Devolución del mes anterior', null, '558', '-'),
      T(116, 'Total de anticipo', '543'),
      L(117, 'Anticipo a imputar', null, '598', '-', [['573', 'Remanente anticipos cambio de sujeto período siguiente']]),
    ],
  },
  {
    id: 'agente_cs', grupo: 'Cambio de sujeto D.L. 825', titulo: 'Cambio de sujeto (agente retenedor)', columnas: ['', 'Monto'],
    lineas: [
      L(118, 'IVA total retenido a terceros (tasa Art. 14 D.L. 825)', null, '39', '+'),
      L(119, 'IVA parcial retenido a terceros (según tasa)', null, '554', '+'),
      L(120, 'IVA retenido por notas de crédito emitidas', null, '736', '-'),
      L(121, 'Retención de margen de comercialización', null, '597', '+'),
      L(122, 'Retención anticipo de cambio de sujeto · Retención cambio de sujeto', null, '596', '+', [['555', 'Retención anticipo de cambio de sujeto']]),
    ],
  },
  {
    id: 'especial_cs', grupo: 'Cambio de sujeto D.L. 825', titulo: 'Cambio especial de sujeto (inciso 7°, Art. 3° D.L. 825)', columnas: ['', 'Monto'],
    lineas: [
      L(123, 'IVA retenido a terceros con retención total en el período (inciso 7° del Art. 3° del D.L. 825)', null, '100', '+'),
      L(124, 'Ajustes por concepto de IVA asociado a reversiones y contracargos (disputas) solucionadas en el período', null, '101', '-'),
      L(125, 'Valor nominal del remanente de ajuste (código 104 del período anterior)', null, '102', '-'),
      T(126, 'Monto neto de IVA retenido en el período', '103'),
      T(127, 'Remanente de ajuste para el próximo período', '104'),
    ],
  },
  // ───────────── CRÉDITOS ESPECIALES ─────────────
  {
    id: 'creditos_especiales', grupo: 'Créditos especiales', columnas: ['Crédito del mes', 'Total crédito'],
    lineas: [
      L(128, 'Crédito por sistemas solares térmicos, Ley 20.365', '725', '727', '-', [['737', 'Remanente mes anterior']]),
      L(129, 'Imputación del pago patente aguas Ley 20.017', '704', '706', '-', [['705', 'Remanente mes anterior']]),
      L(130, 'Cotización adicional Ley 18.566', '160', '570', '-', [['161', 'Remanente mes anterior']]),
      L(131, 'Crédito especial empresas constructoras', '126', '571', '-', [['128', 'Remanente mes anterior']]),
      L(132, 'Recup. peajes transportistas pasajeros, Ley 19.764', '572', '590', '-', [['568', 'Remanente mes anterior']]),
      L(133, 'Crédito por desembolsos directos trazabilidad', '768', '770', '-', [['769', 'Remanente mes anterior']]),
      T(134, 'TOTAL DETERMINADO', '547'),
    ],
  },
  {
    id: 'remanentes_especiales', grupo: 'Remanente créditos especiales', columnas: ['', 'Monto'],
    lineas: [
      L(135, 'Remanente crédito por sistemas solares térmicos, Ley 20.365', null, '728'),
      L(136, 'Remanente período siguiente patente aguas, Ley 20.017', null, '707'),
      L(137, 'Remanente de cotización adicional Ley 18.566', null, '73'),
      L(138, 'Remanente crédito especial empresas constructoras', null, '130'),
      L(139, 'Remanente recup. de peajes trans. pasajeros Ley 19.764', null, '591'),
      L(140, 'Remanente crédito por desembolsos directos trazabilidad', null, '771'),
    ],
  },
  // ───────────── TOTAL ─────────────
  {
    id: 'total', grupo: 'Total a pagar', columnas: ['', 'Monto'],
    lineas: [
      T(141, 'TOTAL A PAGAR EN PLAZO LEGAL', '91'),
      L(142, 'Más IPC', null, '92', '+'),
      L(143, 'Más intereses y multas', null, '93', '+'),
      L(null, 'Condonación', null, '795', '-', [['922', 'N° resolución'], ['915', 'Vigencia'], ['60', 'Porcentaje']]),
      T(144, 'TOTAL A PAGAR CON RECARGO', '94'),
    ],
  },
];

export type ValoresF29 = Record<string, number | undefined>;

/** Códigos que no son montos en pesos (se muestran sin formato de moneda). */
export const CODIGOS_NO_PESOS = new Set(['115', '542', '702', '808', '60', '922', '915', '750', '738', '730', '729']);

/** Una línea se muestra en modo compacto si alguno de sus casilleros tiene valor, o si es un total. */
export const lineaConValor = (l: LineaF29, v: ValoresF29, siempre: Set<string> = new Set()) =>
  Boolean(l.total) || l.codigos.some(c => siempre.has(c.cod) || (v[c.cod] !== undefined && Number(v[c.cod]) !== 0));
