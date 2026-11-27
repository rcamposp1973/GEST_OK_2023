/**
 * Impuesto adicional Art. 42 D.L. 825 (ILA) y recuperación de impuesto específico al diésel en el F29,
 * a partir de los "otros impuestos" que el SII informa en el Registro de Compras y Ventas.
 *
 * Códigos del RCV → códigos del F29 (líneas 92-112 y 44):
 *   24 licores (31,5%)          → débito 577 · crédito recargado 575 / imputable 576
 *   25 vinos (20,5%)            → débito 32  · crédito 574 / 33
 *   26 cervezas (20,5%)         → débito 150 · crédito 580 / 149
 *   27 analcohólicas (10%)      → débito 146 · crédito 582 / 85
 *   271 alto en azúcar (18%)    → débito 752 · crédito 753 / 754
 *   28 diésel (si la empresa recupera) → 127
 */
export interface OtroImpuestoDoc { codigo: string; valor: number; sinDerecho?: boolean }
export interface DocIla { tipoRegistro?: string; tipoDoc?: string | number; otrosImpuestos?: OtroImpuestoDoc[] }

export const MAPA_ILA_F29: Record<string, { debito: string; recargado: string; imputable: string; nombre: string }> = {
  '24': { debito: '577', recargado: '575', imputable: '576', nombre: 'Pisco, licores, whisky y aguardiente' },
  '25': { debito: '32', recargado: '574', imputable: '33', nombre: 'Vinos, champaña, chichas' },
  '26': { debito: '150', recargado: '580', imputable: '149', nombre: 'Cervezas' },
  '27': { debito: '146', recargado: '582', imputable: '85', nombre: 'Bebidas analcohólicas' },
  '271': { debito: '752', recargado: '753', imputable: '754', nombre: 'Bebidas analcohólicas elevado contenido de azúcares' },
};

export interface ResultadoIla {
  codigos: Record<string, number>;
  /** Total débitos Art. 42 (602) */
  debitos602: number;
  /** Créditos del mes (sin remanente anterior) */
  creditosMes: number;
  /** Remanente crédito Art. 42 del mes anterior (508) */
  remanenteAnterior508: number;
  /** Total créditos Art. 42 (603) */
  creditos603: number;
  /** Impuesto adicional Art. 42 determinado (506) */
  determinado506: number;
  /** Remanente para el período siguiente (507) */
  remanente507: number;
  /** Recuperación impuesto específico diésel (127) */
  diesel127: number;
  hayIla: boolean;
}

const esNC = (t: any) => ['61', '112'].includes(String(t));
const esND = (t: any) => ['56', '111'].includes(String(t));

export function calcularIlaF29(docs: DocIla[], opciones: { recuperaDiesel?: boolean; remanenteAnterior?: number } = {}): ResultadoIla {
  const c: Record<string, number> = {};
  const sumar = (cod: string, v: number) => { c[cod] = Math.round((c[cod] || 0) + v); };
  let diesel = 0;
  let hayIla = false;
  for (const d of docs || []) {
    const venta = d.tipoRegistro === 'Venta';
    const compra = d.tipoRegistro === 'Compra';
    if (!venta && !compra) continue;
    for (const i of d.otrosImpuestos || []) {
      const v = Math.round(Number(i.valor) || 0);
      if (!v) continue;
      const cod = String(i.codigo || '').trim();
      if (cod === '28' && compra && opciones.recuperaDiesel && !i.sinDerecho) { diesel += esNC(d.tipoDoc) ? -v : v; continue; }
      const m = MAPA_ILA_F29[cod];
      if (!m) continue;
      hayIla = true;
      if (venta) {
        if (esNC(d.tipoDoc)) sumar('546', v);
        else if (esND(d.tipoDoc)) sumar('545', v);
        else sumar(m.debito, v);
      } else {
        if (esNC(d.tipoDoc)) { if (!i.sinDerecho) sumar('559', v); }
        else if (esND(d.tipoDoc)) { if (!i.sinDerecho) sumar('551', v); }
        else { sumar(m.recargado, v); if (!i.sinDerecho) sumar(m.imputable, v); }
      }
    }
  }
  const val = (k: string) => c[k] || 0;
  const debitos602 = Math.round(['577', '32', '150', '146', '752'].reduce((s, k) => s + val(k), 0) + val('545') - val('546') - val('710'));
  const remanenteAnterior508 = Math.max(0, Math.round(opciones.remanenteAnterior || 0));
  if (remanenteAnterior508) { c['508'] = remanenteAnterior508; hayIla = true; }
  const creditosMes = Math.round(['576', '33', '149', '85', '754'].reduce((s, k) => s + val(k), 0) + val('551') - val('559') - val('533') + val('552'));
  const creditos603 = creditosMes + remanenteAnterior508;
  const determinado506 = Math.max(0, debitos602 - creditos603);
  const remanente507 = Math.max(0, creditos603 - debitos602);
  if (hayIla) {
    c['602'] = debitos602;
    c['603'] = creditos603;
    if (determinado506) c['506'] = determinado506;
    if (remanente507) c['507'] = remanente507;
  }
  const diesel127 = Math.max(0, Math.round(diesel));
  if (diesel127) c['127'] = diesel127;
  return { codigos: c, debitos602, creditosMes, remanenteAnterior508, creditos603, determinado506, remanente507, diesel127, hayIla };
}
