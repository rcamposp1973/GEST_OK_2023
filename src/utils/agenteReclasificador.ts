// AGENTE DE RECLASIFICACIÓN.
// La IA solo TRADUCE la instrucción del usuario a un filtro estructurado. La selección de líneas, los montos y los asientos
// los calcula este módulo con reglas fijas (nada de números inventados por el modelo) y el usuario aprueba una vista previa.
import type { Voucher, VoucherLine } from '../types';
import { exigirCuadre } from './capaContable';

export interface FiltroReclasificacion {
  cuentaOrigen: string;          // código de cuenta (ej. 6101)
  cuentaDestino: string;         // código de cuenta (ej. 6205)
  desde?: string;                // AAAA-MM-DD
  hasta?: string;                // AAAA-MM-DD
  glosaContiene?: string;        // texto en la glosa del comprobante o de la línea
  auxiliarRut?: string;          // solo líneas de este auxiliar
}

export interface CuentaSimple { id: string; code: string; name: string; }

export interface LineaPropuesta {
  voucherId: string; voucherNumber: number; date: string; period: string; gloss: string;
  lineIndex: number; debit: number; credit: number; auxiliaryRut?: string; auxiliaryName?: string; documentRef?: string; documentType?: string;
}
export interface Propuesta {
  filtro: FiltroReclasificacion; origen: CuentaSimple; destino: CuentaSimple;
  lineas: LineaPropuesta[]; neto: number; totalLineas: number; comprobantes: number; periodos: string[];
}

const norm = (s?: string) => (s || '').trim().toLowerCase();

export function validarFiltro(f: any, cuentas: CuentaSimple[]): { ok: true; filtro: FiltroReclasificacion } | { ok: false; error: string } {
  if (!f || typeof f !== 'object') return { ok: false, error: 'No entendí la instrucción.' };
  const cuentaPorCodigo = (c: string) => cuentas.find(x => String(x.code) === String(c));
  if (!cuentaPorCodigo(f.cuentaOrigen)) return { ok: false, error: `La cuenta de origen "${f.cuentaOrigen}" no existe en el plan de cuentas.` };
  if (!cuentaPorCodigo(f.cuentaDestino)) return { ok: false, error: `La cuenta de destino "${f.cuentaDestino}" no existe en el plan de cuentas.` };
  if (String(f.cuentaOrigen) === String(f.cuentaDestino)) return { ok: false, error: 'La cuenta de origen y la de destino son la misma.' };
  const fecha = (x: any) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x);
  if (f.desde && !fecha(f.desde)) return { ok: false, error: 'La fecha "desde" no es válida.' };
  if (f.hasta && !fecha(f.hasta)) return { ok: false, error: 'La fecha "hasta" no es válida.' };
  if (f.desde && f.hasta && f.desde > f.hasta) return { ok: false, error: 'La fecha "desde" es posterior a "hasta".' };
  return { ok: true, filtro: {
    cuentaOrigen: String(f.cuentaOrigen), cuentaDestino: String(f.cuentaDestino),
    desde: f.desde || undefined, hasta: f.hasta || undefined,
    glosaContiene: f.glosaContiene ? String(f.glosaContiene) : undefined,
    auxiliarRut: f.auxiliarRut ? String(f.auxiliarRut) : undefined,
  } };
}

/** Selecciona, con reglas fijas, las líneas que se reclasificarían. No toca nada. */
export function armarPropuesta(filtro: FiltroReclasificacion, vouchers: Voucher[], cuentas: CuentaSimple[]): Propuesta {
  const origen = cuentas.find(c => String(c.code) === filtro.cuentaOrigen)!;
  const destino = cuentas.find(c => String(c.code) === filtro.cuentaDestino)!;
  const rutLimpio = (r?: string) => (r || '').replace(/[^0-9kK]/g, '').toUpperCase();
  const lineas: LineaPropuesta[] = [];
  // Líneas que el agente ya reclasificó antes (así una misma instrucción no se aplica dos veces).
  const yaReclasificadas = new Set<string>();
  vouchers.forEach(v => ((v as any).reclasificadas || []).forEach((k: string) => yaReclasificadas.add(k)));
  for (const v of vouchers) {
    if (!v.id || (v as any).status === 'Anulado' || (v.origin as string) === 'AGENTE_RECLASIFICACION') continue;
    if (filtro.desde && v.date < filtro.desde) continue;
    if (filtro.hasta && v.date > filtro.hasta) continue;
    (v.lines || []).forEach((l, i) => {
      if (l.accountId !== origen.id && String(l.accountCode) !== origen.code) return;
      if (yaReclasificadas.has(`${v.id}_${i}`)) return;
      if (filtro.glosaContiene) {
        const g = norm(filtro.glosaContiene);
        if (!norm(v.gloss).includes(g) && !norm(l.gloss).includes(g)) return;
      }
      if (filtro.auxiliarRut && rutLimpio(l.auxiliaryRut) !== rutLimpio(filtro.auxiliarRut)) return;
      lineas.push({ voucherId: v.id!, voucherNumber: v.voucherNumber, date: v.date, period: v.date.slice(0, 7), gloss: v.gloss,
        lineIndex: i, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0,
        auxiliaryRut: l.auxiliaryRut, auxiliaryName: l.auxiliaryName, documentRef: l.documentRef, documentType: l.documentType });
    });
  }
  const neto = Math.round((lineas.reduce((s, l) => s + l.debit - l.credit, 0)) * 100) / 100;
  return { filtro, origen, destino, lineas, neto, totalLineas: lineas.length,
    comprobantes: new Set(lineas.map(l => l.voucherId)).size, periodos: Array.from(new Set(lineas.map(l => l.period))).sort() };
}

/** Un comprobante de reclasificación por período: lo que estaba en la cuenta de origen pasa a la de destino. */
export function armarComprobantesDeReclasificacion(p: Propuesta, idsExcluidos: Set<string> = new Set()) {
  const out: { date: string; period: string; gloss: string; lines: VoucherLine[]; reclasificadas: string[] }[] = [];
  for (const periodo of p.periodos) {
    const ls = p.lineas.filter(l => l.period === periodo && !idsExcluidos.has(`${l.voucherId}_${l.lineIndex}`));
    if (ls.length === 0) continue;
    const lines: VoucherLine[] = [];
    for (const l of ls) {
      const comun = { auxiliaryRut: l.auxiliaryRut, auxiliaryName: l.auxiliaryName, documentRef: l.documentRef, documentType: l.documentType,
        gloss: `Reclasificación de comprobante N° ${l.voucherNumber}` };
      const o = { accountId: p.origen.id, accountCode: p.origen.code, accountName: p.origen.name, ...comun } as VoucherLine;
      const d = { accountId: p.destino.id, accountCode: p.destino.code, accountName: p.destino.name, ...comun } as VoucherLine;
      // Lo que estaba al Debe en origen: Haber en origen y Debe en destino (y al revés).
      if (l.debit > 0) { lines.push({ ...o, debit: 0, credit: l.debit }, { ...d, debit: l.debit, credit: 0 }); }
      if (l.credit > 0) { lines.push({ ...o, debit: l.credit, credit: 0 }, { ...d, debit: 0, credit: l.credit }); }
    }
    exigirCuadre(lines);
    const [y, m] = periodo.split('-').map(Number);
    const ultimo = new Date(y, m, 0).getDate();
    out.push({ date: `${periodo}-${String(ultimo).padStart(2, '0')}`, period: periodo,
      gloss: `Reclasificación de ${p.origen.code} ${p.origen.name} a ${p.destino.code} ${p.destino.name} (agente, aprobado por el usuario)`, lines,
      reclasificadas: ls.map(l => `${l.voucherId}_${l.lineIndex}`) });
  }
  return out;
}
