// Pareo parcial: cuando cargos y abonos seleccionados no suman lo mismo (aportes y rescates parciales de un fondo mutuo,
// pagos parciales de una factura), se parea hasta el monto menor y el resto queda abierto.
// El lado que suma menos se consume completo; el lado mayor se reparte de la partida más antigua a la más nueva (FIFO).
import type { MatchedLineRef } from '../types';

export interface LineaPareable {
  key: string;
  voucherDate: string;
  voucherNumber: number;
  debit: number;
  credit: number;
}
export interface AsignacionParcial { key: string; monto: number; completa: boolean }
export interface RepartoParcial { monto: number; debitos: AsignacionParcial[]; creditos: AsignacionParcial[]; restoDebitos: number; restoCreditos: number }

const r2 = (n: number) => Math.round(n * 100) / 100;
const porAntiguedad = (a: LineaPareable, b: LineaPareable) =>
  (a.voucherDate || '').localeCompare(b.voucherDate || '') || (a.voucherNumber - b.voucherNumber);

function asignar(lineas: LineaPareable[], valor: (l: LineaPareable) => number, tope: number): AsignacionParcial[] {
  const out: AsignacionParcial[] = [];
  let falta = tope;
  [...lineas].sort(porAntiguedad).forEach(l => {
    if (falta <= 0.004) return;
    const v = valor(l);
    if (v <= 0) return;
    const usar = Math.min(v, falta);
    out.push({ key: l.key, monto: r2(usar), completa: usar >= v - 0.004 });
    falta = r2(falta - usar);
  });
  return out;
}

export function repartoParcial(debitos: LineaPareable[], creditos: LineaPareable[]): RepartoParcial {
  const sumD = r2(debitos.reduce((s, l) => s + (l.debit || 0), 0));
  const sumC = r2(creditos.reduce((s, l) => s + (l.credit || 0), 0));
  const monto = Math.min(sumD, sumC);
  if (monto <= 0) return { monto: 0, debitos: [], creditos: [], restoDebitos: sumD, restoCreditos: sumC };
  return {
    monto,
    debitos: asignar(debitos, l => l.debit || 0, monto),
    creditos: asignar(creditos, l => l.credit || 0, monto),
    restoDebitos: r2(sumD - monto),
    restoCreditos: r2(sumC - monto),
  };
}

/** Cuánto de cada línea ya está pareado, por clave `voucherId_lineIndex` (suma de los pareos vigentes). */
export function pareadoPorLinea(matches: { status?: string; matchedLines: MatchedLineRef[] }[]): Map<string, { debit: number; credit: number }> {
  const m = new Map<string, { debit: number; credit: number }>();
  matches.forEach(g => {
    if (g.status === 'DESCALZADO') return;
    g.matchedLines.forEach(l => {
      const k = `${l.voucherId}_${l.lineIndex}`;
      const e = m.get(k) || { debit: 0, credit: 0 };
      e.debit += l.debit || 0; e.credit += l.credit || 0;
      m.set(k, e);
    });
  });
  return m;
}
