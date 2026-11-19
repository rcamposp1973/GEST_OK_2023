// CAPA CONTABLE ÚNICA (etapa 2 del orden técnico).
// Todo comprobante nuevo que nace de un módulo (compras, ventas, kardex, activo fijo, rendición...) debe pasar por aquí:
// valida que cuadre, calcula totales y período, y pide el número al contador único. Así existe UNA sola regla
// que también cumplirán los agentes de IA de la 2.0.0.
// Parte pura (sin Firestore) = `armarComprobante`, `reversarLineas`; parte con base de datos = `crearComprobante`.
import type { Voucher, VoucherLine } from '../types';

export interface EntradaComprobante {
  date: string;                       // AAAA-MM-DD
  gloss: string;
  lines: VoucherLine[];
  type?: Voucher['type'];
  origin?: string;
  /** Campos adicionales propios del módulo (se conservan tal cual; los de la capa contable prevalecen). */
  extra?: Partial<Voucher>;
}
export interface UsuarioComprobante { uid: string; email?: string; }

const TOLERANCIA = 0.01; // diferencia máxima aceptada entre Debe y Haber (redondeo)
const r2 = (n: number) => Math.round(n * 100) / 100;

export function sumasComprobante(lines: VoucherLine[]) {
  const totalDebit = r2(lines.reduce((s, l) => s + (Number(l.debit) || 0), 0));
  const totalCredit = r2(lines.reduce((s, l) => s + (Number(l.credit) || 0), 0));
  return { totalDebit, totalCredit };
}

/** Valida y arma el comprobante listo para guardar. Lanza Error en español si no cumple. */
export function armarComprobante(
  e: EntradaComprobante, numero: number, usuario: UsuarioComprobante, ahoraIso: string = new Date().toISOString()
): Omit<Voucher, 'id'> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date || '')) throw new Error('El comprobante necesita una fecha válida (AAAA-MM-DD).');
  if (!e.lines || e.lines.length === 0) throw new Error('El comprobante no tiene líneas.');
  if (!(numero > 0)) throw new Error('El comprobante no tiene número asignado.');
  const { totalDebit, totalCredit } = sumasComprobante(e.lines);
  if (totalDebit <= 0) throw new Error('El comprobante no tiene montos.');
  if (Math.abs(totalDebit - totalCredit) >= TOLERANCIA) {
    throw new Error(`El comprobante no cuadra: Debe ${totalDebit} y Haber ${totalCredit}.`);
  }
  return {
    ...(e.extra || {}),
    voucherNumber: numero, date: e.date, period: e.date.slice(0, 7), type: e.type || 'Traspaso', gloss: e.gloss,
    lines: e.lines, totalDebit, totalCredit, status: 'Valido', origin: e.origin as any,
    createdBy: usuario.uid, createdByUserEmail: usuario.email || '', creationMode: 'SISTEMA',
    createdAt: ahoraIso, lastModifiedBy: usuario.uid, lastModifiedAt: ahoraIso,
  } as Omit<Voucher, 'id'>;
}

/** Líneas de un reverso: Debe y Haber invertidos. */
export function reversarLineas(lines: VoucherLine[]): VoucherLine[] {
  return lines.map(l => ({ ...l, debit: l.credit || 0, credit: l.debit || 0, gloss: `Reverso: ${l.gloss || ''}` }));
}

export interface ContextoContable {
  /** Falla (lanza) si el período está cerrado. */
  verificarPeriodo: (periodo: string) => void;
  /** Contador único de la empresa. */
  siguienteNumero: () => Promise<number>;
  /** Escribe el comprobante y devuelve su id. */
  guardar: (v: Omit<Voucher, 'id'>) => Promise<string>;
  usuario: () => UsuarioComprobante;
}

export async function crearComprobante(ctx: ContextoContable, e: EntradaComprobante): Promise<{ id: string; voucherNumber: number }> {
  ctx.verificarPeriodo(e.date.slice(0, 7));
  const numero = await ctx.siguienteNumero();
  const v = armarComprobante(e, numero, ctx.usuario());
  const id = await ctx.guardar(v);
  return { id, voucherNumber: numero };
}
