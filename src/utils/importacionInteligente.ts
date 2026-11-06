/**
 * Importación inteligente — motor de reglas (sin IA, resultados exactos y repetibles).
 *
 * v1: Libro de remuneraciones (formato Talana u otro con las mismas columnas base).
 * Lee la planilla, valida que cuadre contra sus propios totales, y arma el comprobante
 * de centralización con las reglas guardadas por empresa (centros de costo, cuentas, ítems).
 */

// ───────────────────────────── Tipos ─────────────────────────────

export interface ReglasImportacion {
  /** "codigoTalana|nombre centro" → código propio del centro de costo (ej: A101) */
  centros: Record<string, string>;
  /** Letra/prefijo del centro de costo → cuenta contable (ej: A → 4102001) */
  cuentaPorPrefijo: Record<string, { codigo: string; nombre: string }>;
  /** Concepto normalizado → código de ítem ('' = sin ítem) */
  items: Record<string, string>;
}

export type Seccion = 'haber' | 'legal' | 'impuesto' | 'descTrabajador' | 'empleador';

export interface Concepto {
  col: number;
  nombre: string;          // tal cual viene en el libro
  clave: string;           // normalizado
  seccion: Seccion;
  itemEnArchivo?: string;  // código de ítem si el archivo ya lo trae
  total: number;
}

export interface Trabajador {
  rut: string;
  nombre: string;          // nombre completo
  centroTalana: string;    // "cod|nombre"
  centroPropio?: string;   // columna C_COSTO si el archivo la trae
  valores: number[];       // por índice de concepto
}

export interface Libro {
  anio: number;
  mes: number;
  conceptos: Concepto[];
  trabajadores: Trabajador[];
  totales: {
    remuneracionTotal: number; descuentosLegales: number; otrosDescuentos: number;
    impuestos: number; liquidoMasAnticipo: number; liquidoAPago: number; anticipos: number;
  };
}

export interface Chequeo { ok: boolean; titulo: string; detalle: string; }

export interface LineaComprobante {
  cuenta?: string; nombreCuenta?: string;
  debe: number; haber: number;
  glosa: string;
  rut?: string; razonSocial?: string;
  centroCosto?: string; item?: string;
}

export interface Pendientes {
  centros: { clave: string; trabajadores: number; sugerido?: string }[];
  prefijos: string[];
  items: { concepto: string; sugerido: string }[];
}

export interface ResultadoImportacion {
  lineas: LineaComprobante[];
  debe: number; haber: number;
  pendientes: Pendientes;
}

// ───────────────────────────── Utilidades ─────────────────────────────

export const norm = (s: any): string =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const num = (v: any): number => {
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(String(v).replace(/[$\s]/g, '').replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
};

const esCodigoItem = (s: any) => typeof s === 'string' && /^A\d{4}$/i.test(s.trim());

/** Sugerencia de ítem según el nombre del concepto (reglas por palabra clave). */
export function sugerirItem(concepto: string): string {
  const n = norm(concepto);
  const reglas: [RegExp, string][] = [
    [/^(sueldo base|horas descuento|diferencia sueldo base|proporcion vacaciones|descuento horas sindicales)/, 'A1001'],
    [/gratificacion/, 'A1002'],
    [/semana corrida/, 'A1004'],
    [/comision|^ventas/, 'A1005'],
    [/^bono|^bonif/, 'A1006'],
    [/^premio/, 'A1007'],
    [/^colacion/, 'A1008'],
    [/^movilizacion/, 'A1009'],
    [/viatico/, 'A1010'],
    [/otras asignaciones no imponibles/, 'A1011'],
    [/asignacion maternal/, 'A1012'],
    [/^(capitalizacion individual|expectativa de vida|seguro accidentes|seguro cesantia|seguro invalidez)/, 'A1013'],
    [/desgaste materiales/, 'A1014'],
    [/teletrabajo/, 'A1016'],
    [/indemnizacion|mes de aviso/, 'A1018'],
  ];
  for (const [re, cod] of reglas) if (re.test(n)) return cod;
  return '';
}

export const REGLAS_VACIAS: ReglasImportacion = { centros: {}, cuentaPorPrefijo: {}, items: {} };

// ───────────────────────────── Lectura del libro ─────────────────────────────

/**
 * rows: matriz de la hoja (primera hoja con los datos del libro).
 * Devuelve el libro, o un error legible para el contador.
 */
export function leerLibroRemuneraciones(rows: any[][]): { libro?: Libro; error?: string } {
  // 1) fila de encabezados: la que contiene "rut del trabajador"
  let h = -1;
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    if ((rows[i] || []).some(c => norm(c) === 'rut del trabajador')) { h = i; break; }
  }
  if (h < 0) return { error: 'No encontré la columna "Rut del Trabajador". ¿Es el libro de remuneraciones?' };
  const head = rows[h] || [];
  const above = h > 0 ? rows[h - 1] || [] : [];
  const find = (...names: string[]) => head.findIndex(c => names.includes(norm(c)));

  const cRut = find('rut del trabajador');
  const cNom = find('nombre'), cAp1 = find('apellido paterno'), cAp2 = find('apellido materno');
  const cAnio = find('ano', 'año'), cMes = find('mes');
  const cRem = find('remuneracion total'), cLeg = find('descuentos legales'), cOtr = find('otros descuentos');
  const cImp = find('impuestos'), cLiqA = find('sueldo liquido mas anticipo'), cLiqP = find('sueldo liquido a pago');
  const cAnt = find('anticipos');
  const cCod = find('centro costo (cod)'), cCcN = find('centro costo');
  const cCC = find('c_costo');
  const faltan = [['Remuneración Total', cRem], ['Descuentos Legales', cLeg], ['Otros Descuentos', cOtr], ['Impuestos', cImp],
    ['Sueldo Líquido A Pago', cLiqP], ['Centro Costo', cCcN]].filter(x => x[1] < 0).map(x => x[0]);
  if (faltan.length) return { error: 'Faltan columnas esperadas en el libro: ' + faltan.join(', ') + '.' };

  // 2) primera columna de conceptos: después de las columnas fijas del libro
  const anclas = ['horas a pago por dias compensatorios vencidos', 'hhs. extra 100%', 'hhs. extra 50%', 'dias ausencia'];
  let fin = -1;
  for (const a of anclas) { const j = find(a); if (j >= 0) { fin = j; break; } }
  if (fin < 0) return { error: 'No pude ubicar dónde empiezan los conceptos (haberes y descuentos) en el libro.' };
  let ini = fin + 1;
  if (cCC >= 0 && cCC === ini) ini++;

  // 3) conceptos (acepta archivos con una fila extra de códigos de ítem)
  const conceptos: Concepto[] = [];
  const largo = Math.max(head.length, above.length);
  for (let j = ini; j < largo; j++) {
    const hv = head[j], av = above[j];
    const vacio = (x: any) => x === null || x === undefined || String(x).trim() === '';
    let nombre: any; let itemEnArchivo: string | undefined;
    if (esCodigoItem(hv)) { itemEnArchivo = String(hv).trim().toUpperCase(); nombre = av; }
    else nombre = !vacio(hv) ? hv : av;
    if (vacio(nombre)) { if (vacio(hv) && vacio(av)) break; continue; }
    conceptos.push({ col: j, nombre: String(nombre).trim(), clave: norm(nombre), seccion: 'haber', itemEnArchivo, total: 0 });
  }
  if (!conceptos.length) return { error: 'No encontré conceptos de remuneración en el libro.' };

  // 4) secciones por anclas
  const idx = (k: string) => conceptos.findIndex(c => c.clave === k);
  const iAfp = idx('afp'), iImp = idx('impuestos'), iEmp = idx('capitalizacion individual afp');
  if (iAfp < 0 || iImp < 0 || iEmp < 0)
    return { error: 'No pude separar haberes, descuentos y aportes del empleador: faltan las columnas AFP, Impuestos o Capitalización Individual AFP.' };
  conceptos.forEach((c, i) => {
    c.seccion = i < iAfp ? 'haber' : i < iImp ? 'legal' : i === iImp ? 'impuesto' : i < iEmp ? 'descTrabajador' : 'empleador';
  });

  // 5) trabajadores
  const trabajadores: Trabajador[] = [];
  let anio = 0, mes = 0;
  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const rut = String(r[cRut] ?? '').trim();
    if (!rut || !/^\d/.test(rut)) continue; // filas de totales o vacías
    if (!anio && cAnio >= 0) anio = num(r[cAnio]);
    if (!mes && cMes >= 0) mes = num(r[cMes]);
    const nombre = [r[cNom], r[cAp1], r[cAp2]].map(x => String(x ?? '').trim()).filter(Boolean).join(' ');
    const cc = cCod >= 0 ? String(r[cCod] ?? '').trim() : '';
    trabajadores.push({
      rut, nombre,
      centroTalana: `${cc}|${String(r[cCcN] ?? '').replace(/\s+/g, ' ').trim()}`,
      centroPropio: cCC >= 0 && String(r[cCC] ?? '').trim() ? String(r[cCC]).trim() : undefined,
      valores: conceptos.map(c => num(r[c.col])),
    });
  }
  if (!trabajadores.length) return { error: 'El libro no tiene trabajadores (filas con RUT).' };
  conceptos.forEach((c, i) => { c.total = trabajadores.reduce((s, t) => s + t.valores[i], 0); });

  const suma = (col: number) => col < 0 ? 0 : rows.slice(h + 1).filter(r => r && String(r[cRut] ?? '').trim() && /^\d/.test(String(r[cRut]))).reduce((s, r) => s + num(r[col]), 0);
  return {
    libro: {
      anio, mes, conceptos, trabajadores,
      totales: {
        remuneracionTotal: suma(cRem), descuentosLegales: suma(cLeg), otrosDescuentos: suma(cOtr),
        impuestos: suma(cImp), liquidoMasAnticipo: suma(cLiqA), liquidoAPago: suma(cLiqP), anticipos: suma(cAnt),
      },
    },
  };
}

// ───────────────────────────── Validaciones del libro ─────────────────────────────

export function chequearLibro(l: Libro): Chequeo[] {
  const fmt = (n: number) => Math.round(n).toLocaleString('es-CL');
  const sum = (s: Seccion[]) => l.conceptos.filter(c => s.includes(c.seccion)).reduce((a, c) => a + c.total, 0);
  const haberes = sum(['haber']);
  const desc = sum(['legal', 'impuesto', 'descTrabajador']);
  const t = l.totales;
  const out: Chequeo[] = [];
  out.push({
    ok: Math.abs(haberes - t.remuneracionTotal) < 1,
    titulo: 'Haberes = Remuneración Total',
    detalle: `Conceptos $${fmt(haberes)} · Libro $${fmt(t.remuneracionTotal)}`,
  });
  const descLibro = t.descuentosLegales + t.otrosDescuentos + t.impuestos;
  out.push({
    ok: Math.abs(desc - descLibro) < 1,
    titulo: 'Descuentos = Legales + Otros + Impuestos',
    detalle: `Conceptos $${fmt(desc)} · Libro $${fmt(descLibro)}`,
  });
  out.push({
    ok: Math.abs(t.remuneracionTotal - descLibro - t.liquidoAPago) < 1,
    titulo: 'Líquido a pago = Remuneración − Descuentos',
    detalle: `Calculado $${fmt(t.remuneracionTotal - descLibro)} · Libro $${fmt(t.liquidoAPago)}`,
  });
  if (t.liquidoMasAnticipo || t.anticipos) {
    out.push({
      ok: Math.abs(t.liquidoMasAnticipo - t.anticipos - t.liquidoAPago) < 1,
      titulo: 'Líquido más anticipo − Anticipos = Líquido a pago',
      detalle: `$${fmt(t.liquidoMasAnticipo)} − $${fmt(t.anticipos)} = $${fmt(t.liquidoMasAnticipo - t.anticipos)} · Líquido $${fmt(t.liquidoAPago)}`,
    });
  }
  return out;
}

// ───────────────────────────── Generación del comprobante ─────────────────────────────

const esSinCentro = (clave: string) => clave.startsWith('sobregiro') || clave.startsWith('asignacion familiar');

export function itemDe(c: Concepto, reglas: ReglasImportacion): string {
  if (Object.prototype.hasOwnProperty.call(reglas.items, c.clave)) return reglas.items[c.clave];
  if (c.itemEnArchivo) return c.itemEnArchivo;
  return sugerirItem(c.nombre);
}

export function centroDe(t: Trabajador, reglas: ReglasImportacion): string | undefined {
  return t.centroPropio || reglas.centros[t.centroTalana];
}

export function prefijo(centro: string): string { return (centro.match(/^[A-Za-z]+/)?.[0] || '').toUpperCase(); }

export function generarComprobante(l: Libro, reglas: ReglasImportacion): ResultadoImportacion {
  const lineas: LineaComprobante[] = [];
  const pend: Pendientes = { centros: [], prefijos: [], items: [] };

  // pendientes: centros sin código propio
  const cuentaCentros = new Map<string, number>();
  for (const t of l.trabajadores) {
    if (!centroDe(t, reglas)) cuentaCentros.set(t.centroTalana, (cuentaCentros.get(t.centroTalana) || 0) + 1);
  }
  cuentaCentros.forEach((n, clave) => pend.centros.push({ clave, trabajadores: n }));

  // pendientes: ítems sin regla propia (el sugerido igual se usa en el borrador)
  for (const c of l.conceptos) {
    if ((c.seccion === 'haber' || c.seccion === 'empleador') && !esSinCentro(c.clave)
        && !Object.prototype.hasOwnProperty.call(reglas.items, c.clave) && c.total !== 0) {
      pend.items.push({ concepto: c.nombre, sugerido: itemDe(c, reglas) });
    }
  }

  // Debe/Haber por centro e ítem (haberes y costo empleador)
  const agg = new Map<string, number>(); // "centro\u0000idxConcepto"
  const prefijosFaltan = new Set<string>();
  l.conceptos.forEach((c, i) => {
    if (!(c.seccion === 'haber' || c.seccion === 'empleador') || esSinCentro(c.clave)) return;
    for (const t of l.trabajadores) {
      const v = t.valores[i];
      if (!v) continue;
      const cc = centroDe(t, reglas);
      if (!cc) continue;
      const k = cc + '\u0000' + i;
      agg.set(k, (agg.get(k) || 0) + v);
    }
  });
  const centrosOrden = Array.from(new Set(Array.from(agg.keys()).map(k => k.split('\u0000')[0]))).sort();
  for (const cc of centrosOrden) {
    const pf = prefijo(cc);
    const cta = reglas.cuentaPorPrefijo[pf];
    if (!cta) prefijosFaltan.add(pf);
    l.conceptos.forEach((c, i) => {
      const v = agg.get(cc + '\u0000' + i);
      if (!v) return;
      const base = { cuenta: cta?.codigo, nombreCuenta: cta?.nombre, glosa: c.nombre, centroCosto: cc, item: itemDe(c, reglas) || undefined };
      if (v > 0) lineas.push({ ...base, debe: v, haber: 0 }); else lineas.push({ ...base, debe: 0, haber: -v });
    });
  }
  pend.prefijos = Array.from(prefijosFaltan);

  // Sobregiro por trabajador (Debe) y asignación familiar (total, Debe)
  l.conceptos.forEach((c, i) => {
    if (!esSinCentro(c.clave) || c.seccion !== 'haber') return;
    if (c.clave.startsWith('sobregiro')) {
      for (const t of l.trabajadores) if (t.valores[i]) lineas.push({ debe: t.valores[i], haber: 0, glosa: c.nombre, rut: t.rut, razonSocial: t.nombre });
    } else if (c.total) {
      lineas.push({ debe: c.total, haber: 0, glosa: c.nombre });
    }
  });

  // Haber: descuentos legales e impuestos (totales)
  l.conceptos.forEach(c => {
    if ((c.seccion === 'legal' || c.seccion === 'impuesto') && c.total) lineas.push({ debe: 0, haber: c.total, glosa: c.nombre });
  });
  // Haber: descuentos por trabajador (con RUT como auxiliar)
  l.conceptos.forEach((c, i) => {
    if (c.seccion !== 'descTrabajador') return;
    for (const t of l.trabajadores) if (t.valores[i]) lineas.push({ debe: 0, haber: t.valores[i], glosa: c.nombre, rut: t.rut, razonSocial: t.nombre });
  });
  // Haber: aportes del empleador (total) y líquido a pagar
  l.conceptos.forEach(c => { if (c.seccion === 'empleador' && c.total) lineas.push({ debe: 0, haber: c.total, glosa: c.nombre }); });
  lineas.push({ debe: 0, haber: l.totales.liquidoAPago, glosa: 'Sueldo líquido a pago' });

  const debe = lineas.reduce((s, x) => s + x.debe, 0);
  const haber = lineas.reduce((s, x) => s + x.haber, 0);
  return { lineas, debe, haber, pendientes: pend };
}

// ───────────────────────────── Salida (plantilla de carga masiva) ─────────────────────────────

export const ENCABEZADOS_PLANTILLA = [
  'NumeroComprobante', 'Fecha', 'Periodo', 'TipoComprobante', 'GlosaComprobante', 'CodigoCuenta', 'NombreCuenta',
  'Debe', 'Haber', 'GlosaLinea', 'RUTAuxiliar', 'RazonSocialAuxiliar', 'TipoDocumento', 'FolioDocumento',
  'FechaVencimiento', 'CentroCosto', 'ItemGasto', 'Proyecto', 'Producto', 'RefBancaria',
];

export const NOMBRES_MES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export function datosComprobante(anio: number, mes: number) {
  const ultimo = new Date(anio, mes, 0).getDate();
  const mm = String(mes).padStart(2, '0');
  return {
    fecha: `${anio}-${mm}-${String(ultimo).padStart(2, '0')}`,
    periodo: `${anio}-${mm}`,
    glosa: `Remuneraciones ${NOMBRES_MES[mes] || mm} ${anio}`,
  };
}

export function filasPlantilla(lineas: LineaComprobante[], meta: { fecha: string; periodo: string; glosa: string; numero?: number; tipo?: string }): any[][] {
  const filas: any[][] = [ENCABEZADOS_PLANTILLA];
  for (const x of lineas) {
    filas.push([
      meta.numero ?? 1, meta.fecha, meta.periodo, meta.tipo || 'Traspaso', meta.glosa,
      x.cuenta ?? '', x.nombreCuenta ?? '', x.debe || 0, x.haber || 0, x.glosa,
      x.rut ?? '', x.razonSocial ?? '', '', '', '', x.centroCosto ?? '', x.item ?? '', '', '', '',
    ]);
  }
  return filas;
}

/** Reglas nuevas tras confirmar el contador: se guardan por empresa para el mes siguiente. */
export function aprender(reglas: ReglasImportacion, l: Libro, confirmadas: {
  centros?: Record<string, string>; cuentas?: Record<string, { codigo: string; nombre: string }>; items?: Record<string, string>;
}): ReglasImportacion {
  const out: ReglasImportacion = {
    centros: { ...reglas.centros, ...(confirmadas.centros || {}) },
    cuentaPorPrefijo: { ...reglas.cuentaPorPrefijo, ...(confirmadas.cuentas || {}) },
    items: { ...reglas.items, ...(confirmadas.items || {}) },
  };
  return out;
}
