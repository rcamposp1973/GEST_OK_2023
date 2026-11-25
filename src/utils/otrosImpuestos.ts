/**
 * "Otros impuestos" del Registro de Compras del SII (ILA, impuestos específicos a combustibles, Art. 37, etc.).
 *
 * Regla: el detalle se toma TAL COMO lo informa el Registro de Compras (código, valor, tasa y si va en la columna
 * "Impto. Sin Derecho a Crédito"). El sistema no deduce impuestos por diferencias de montos.
 * La tabla de abajo sólo sirve para poner NOMBRE al código y decidir su tratamiento cuando la ley es clara;
 * un código que no está en la tabla queda "sin catalogar" y NO se contabiliza hasta que el usuario lo revise.
 */

export type TratamientoOtroImpuesto =
  | 'credito'          // da derecho a crédito (ILA Art. 42, Art. 37): va a la cuenta de impuestos adicionales
  | 'costo'            // no da derecho a crédito: es mayor costo/gasto del documento
  | 'diesel'           // impuesto específico diésel: crédito sólo si la empresa tiene derecho a recuperarlo (F29 [127])
  | 'sin_catalogar';   // código desconocido: no se contabiliza sin revisión

export interface OtroImpuestoRcv {
  codigo: string;
  nombre: string;
  valor: number;
  tasa?: number | null;
  /** true si el SII lo informó en la columna "Impto. Sin Derecho a Crédito". */
  sinDerecho?: boolean;
}

interface FichaImpuesto { nombre: string; tratamiento: TratamientoOtroImpuesto }

/** Códigos de impuestos adicionales y específicos usados en los DTE y en el Registro de Compras. */
export const CODIGOS_OTROS_IMPUESTOS: Record<string, FichaImpuesto> = {
  '23': { nombre: 'Impuesto adicional Art. 37 letras a, b, c (oro, joyas, pieles...)', tratamiento: 'credito' },
  '44': { nombre: 'Impuesto adicional Art. 37 letras e, h, i, l (alfombras, casas rodantes, caviar, armas)', tratamiento: 'credito' },
  '45': { nombre: 'Impuesto adicional Art. 37 letra j (pirotecnia)', tratamiento: 'credito' },
  '24': { nombre: 'ILA licores, piscos, whisky, aguardientes y destilados', tratamiento: 'credito' },
  '25': { nombre: 'ILA vinos', tratamiento: 'credito' },
  '26': { nombre: 'ILA cervezas y bebidas alcohólicas', tratamiento: 'credito' },
  '27': { nombre: 'ILA bebidas analcohólicas y aguas minerales', tratamiento: 'credito' },
  '271': { nombre: 'ILA bebidas analcohólicas con elevado contenido de azúcar', tratamiento: 'credito' },
  '28': { nombre: 'Impuesto específico al petróleo diésel', tratamiento: 'diesel' },
  '35': { nombre: 'Impuesto específico a la gasolina', tratamiento: 'costo' },
};

export function fichaOtroImpuesto(codigo: string | number | null | undefined): FichaImpuesto {
  const c = String(codigo ?? '').trim();
  return CODIGOS_OTROS_IMPUESTOS[c] || { nombre: c ? `Impuesto código ${c} (sin catalogar)` : 'Impuesto sin código', tratamiento: 'sin_catalogar' };
}

/** Tratamiento de un impuesto del registro. "Sin derecho" del SII siempre manda: es costo. */
export function tratamientoOtroImpuesto(i: OtroImpuestoRcv, opciones: { recuperaDiesel?: boolean } = {}): TratamientoOtroImpuesto {
  if (i.sinDerecho) return 'costo';
  const t = fichaOtroImpuesto(i.codigo).tratamiento;
  if (t === 'diesel') return opciones.recuperaDiesel ? 'credito' : 'costo';
  return t;
}

/** Agrega un impuesto al detalle del documento sin duplicar (mismo código y misma columna). */
export function agregarOtroImpuesto(lista: OtroImpuestoRcv[] | undefined, nuevo: OtroImpuestoRcv): OtroImpuestoRcv[] {
  const base = [...(lista || [])];
  if (!(Number(nuevo.valor) > 0)) return base;
  const i = base.findIndex(x => x.codigo === nuevo.codigo && Boolean(x.sinDerecho) === Boolean(nuevo.sinDerecho));
  if (i >= 0) base[i] = { ...base[i], valor: Math.max(base[i].valor, nuevo.valor), tasa: base[i].tasa ?? nuevo.tasa ?? null };
  else base.push({ ...nuevo, tasa: nuevo.tasa ?? null });
  return base;
}

export function totalOtrosImpuestos(lista: OtroImpuestoRcv[] | undefined): number {
  return (lista || []).reduce((s, x) => s + (Number(x.valor) || 0), 0);
}

/**
 * Reparte los otros impuestos de un documento según su tratamiento.
 * Documentos antiguos sin detalle: todo el monto queda como "sinDetalle" (se trata como antes).
 */
export function repartirOtrosImpuestos(d: { otrosImpuestos?: OtroImpuestoRcv[]; montoOtrosImpuestos?: number }, opciones: { recuperaDiesel?: boolean } = {}) {
  const r = { credito: 0, costo: 0, sinCatalogar: 0, sinDetalle: 0, codigosSinCatalogar: [] as string[] };
  const lista = d.otrosImpuestos || [];
  if (!lista.length) { r.sinDetalle = Number(d.montoOtrosImpuestos) || 0; return r; }
  for (const i of lista) {
    const t = tratamientoOtroImpuesto(i, opciones);
    if (t === 'credito') r.credito += i.valor;
    else if (t === 'costo') r.costo += i.valor;
    else { r.sinCatalogar += i.valor; r.codigosSinCatalogar.push(i.codigo || '(sin código)'); }
  }
  return r;
}

/** Resumen del período por código (para el F29 y la revisión del registro). */
export function resumenOtrosImpuestos(docs: { tipoRegistro?: string; tipoDoc?: string; otrosImpuestos?: OtroImpuestoRcv[] }[], opciones: { recuperaDiesel?: boolean } = {}) {
  const filas = new Map<string, { codigo: string; nombre: string; sinDerecho: boolean; tratamiento: TratamientoOtroImpuesto; documentos: number; monto: number }>();
  for (const d of docs) {
    if (d.tipoRegistro !== 'Compra') continue;
    const signo = String(d.tipoDoc) === '61' || String(d.tipoDoc) === '112' ? -1 : 1;
    for (const i of d.otrosImpuestos || []) {
      const k = `${i.codigo}|${i.sinDerecho ? 1 : 0}`;
      const f = filas.get(k) || { codigo: i.codigo, nombre: i.nombre || fichaOtroImpuesto(i.codigo).nombre, sinDerecho: Boolean(i.sinDerecho), tratamiento: tratamientoOtroImpuesto(i, opciones), documentos: 0, monto: 0 };
      f.documentos += 1;
      f.monto += signo * (Number(i.valor) || 0);
      filas.set(k, f);
    }
  }
  return [...filas.values()].sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }));
}

function normalizarEncabezado(s: string) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Columnas del Registro de Compras (CSV del SII) que traen impuestos. Devuelve índices o -1. */
export function columnasImpuestosRcv(encabezado: string[]) {
  const h = encabezado.map(normalizarEncabezado);
  const buscar = (f: (c: string) => boolean) => h.findIndex(f);
  return {
    codigoOtro: buscar(c => c.includes('otro impuesto') && (c.startsWith('codigo') || c.startsWith('cod'))),
    valorOtro: buscar(c => c.includes('otro impuesto') && (c.startsWith('valor') || c.startsWith('monto'))),
    tasaOtro: buscar(c => c.includes('otro impuesto') && c.startsWith('tasa')),
    sinDerecho: buscar(c => (c.startsWith('impto') || c.startsWith('impuesto')) && c.includes('sin derecho')),
    ivaNoRetenido: buscar(c => c === 'iva no retenido'),
    tabacoPuros: buscar(c => c.includes('tabaco') && c.includes('puro')),
    tabacoCigarrillos: buscar(c => c.includes('tabaco') && c.includes('cigarr')),
    tabacoElaborado: buscar(c => c.includes('tabaco') && c.includes('elabor')),
  };
}

export function numeroRcv(v: any): number {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const s = String(v ?? '').trim().replace(/\$/g, '');
  if (!s || s === '-') return 0;
  // El SII entrega enteros sin separador; si viene con miles chilenos (1.234.567) o decimal con coma, se respeta
  const limpio = /,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/\./g, '').replace(',', '.');
  const n = Number(limpio);
  return isFinite(n) ? n : 0;
}

/** Lee los impuestos de UNA fila del Registro de Compras ya separada en columnas. */
export function impuestosDeFila(cols: string[], idx: ReturnType<typeof columnasImpuestosRcv>): OtroImpuestoRcv[] {
  const out: OtroImpuestoRcv[] = [];
  const val = (i: number) => (i >= 0 ? numeroRcv(cols[i]) : 0);
  const otro = val(idx.valorOtro);
  if (otro > 0) {
    const codigo = idx.codigoOtro >= 0 ? String(cols[idx.codigoOtro] ?? '').trim() : '';
    const tasa = idx.tasaOtro >= 0 && String(cols[idx.tasaOtro] ?? '').trim() !== '' ? numeroRcv(cols[idx.tasaOtro]) : null;
    out.push({ codigo, nombre: fichaOtroImpuesto(codigo).nombre, valor: otro, tasa });
  }
  const sd = val(idx.sinDerecho);
  if (sd > 0) out.push({ codigo: 'SD', nombre: 'Impuesto sin derecho a crédito (informado por el SII)', valor: sd, tasa: null, sinDerecho: true });
  const tab: [number, string, string][] = [[idx.tabacoPuros, 'TAB-PUROS', 'Impuesto tabacos: puros'], [idx.tabacoCigarrillos, 'TAB-CIG', 'Impuesto tabacos: cigarrillos'], [idx.tabacoElaborado, 'TAB-ELAB', 'Impuesto tabacos: tabaco elaborado']];
  for (const [i, codigo, nombre] of tab) { const v = val(i); if (v > 0) out.push({ codigo, nombre, valor: v, tasa: null, sinDerecho: true }); }
  return out;
}

/**
 * Al volver a cargar o sincronizar un documento que ya existe: completa el detalle de otros impuestos que informa el
 * Registro de Compras. Si el documento NO está contabilizado se corrigen también sus montos de impuestos; si ya está
 * contabilizado sólo se agrega el detalle (la contabilidad manda: no se tocan montos ya registrados).
 * Devuelve los campos a actualizar, o null si no hay nada que cambiar.
 */
export function completarImpuestosExistente(
  existente: { tipoRegistro?: string; estadoContabilizado?: boolean; voucherId?: string; otrosImpuestos?: OtroImpuestoRcv[]; montoOtrosImpuestos?: number; montoIvaNoRecuperable?: number; montoIva?: number },
  nuevo: { otrosImpuestos?: OtroImpuestoRcv[]; montoOtrosImpuestos?: number; montoIvaNoRecuperable?: number; codigoIvaNoRec?: any; montoIva?: number },
): Record<string, any> | null {
  if (existente.tipoRegistro !== 'Compra' || !nuevo.otrosImpuestos?.length) return null;
  const igual = JSON.stringify(existente.otrosImpuestos || []) === JSON.stringify(nuevo.otrosImpuestos);
  const contabilizado = Boolean(existente.estadoContabilizado || existente.voucherId);
  if (contabilizado) return igual ? null : { otrosImpuestos: nuevo.otrosImpuestos };
  const cambios: Record<string, any> = {};
  if (!igual) cambios.otrosImpuestos = nuevo.otrosImpuestos;
  const total = totalOtrosImpuestos(nuevo.otrosImpuestos);
  if ((Number(existente.montoOtrosImpuestos) || 0) !== total) cambios.montoOtrosImpuestos = total;
  if ((Number(existente.montoIvaNoRecuperable) || 0) !== (Number(nuevo.montoIvaNoRecuperable) || 0)) {
    cambios.montoIvaNoRecuperable = Number(nuevo.montoIvaNoRecuperable) || 0;
    cambios.codigoIvaNoRec = nuevo.codigoIvaNoRec ?? null;
  }
  if (nuevo.montoIva !== undefined && (Number(existente.montoIva) || 0) !== (Number(nuevo.montoIva) || 0)) cambios.montoIva = Number(nuevo.montoIva) || 0;
  return Object.keys(cambios).length ? cambios : null;
}
