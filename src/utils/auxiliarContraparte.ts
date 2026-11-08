// En contabilidad el RUT del cliente/proveedor vive en la línea de la contrapartida (Clientes, Proveedores, Honorarios por pagar...),
// no en la línea de ingreso o gasto. Para analizar resultados por auxiliar, cada línea de resultado sin RUT propio
// se atribuye al/los auxiliar(es) de las otras líneas del MISMO comprobante (en proporción a su monto).
import type { VoucherLine } from '../types';

export interface AuxPeso { rut: string; name: string; peso: number }
export interface AuxParte { rut: string; name: string; parte: number } // rut '' = sin auxiliar

/** Auxiliares de las líneas que NO son de resultado (contrapartida) de un comprobante. */
export function contrapartes(lines: VoucherLine[], esResultado: (l: VoucherLine) => boolean): AuxPeso[] {
  const m = new Map<string, AuxPeso>();
  lines.forEach(l => {
    if (esResultado(l)) return;
    const rut = (l.auxiliaryRut || '').trim();
    if (!rut) return;
    const peso = Math.max(Number(l.debit) || 0, Number(l.credit) || 0);
    if (!peso) return;
    const e = m.get(rut) || { rut, name: (l.auxiliaryName || '').trim(), peso: 0 };
    e.peso += peso;
    if (!e.name) e.name = (l.auxiliaryName || '').trim();
    m.set(rut, e);
  });
  return Array.from(m.values());
}

/** A quién se atribuye una línea de resultado: su propio RUT, o la contrapartida del comprobante, o nadie. */
export function repartirAuxiliar(l: VoucherLine, contra: AuxPeso[]): AuxParte[] {
  const propio = (l.auxiliaryRut || '').trim();
  if (propio) return [{ rut: propio, name: (l.auxiliaryName || '').trim(), parte: 1 }];
  const total = contra.reduce((s, c) => s + c.peso, 0);
  if (!contra.length || total <= 0) return [{ rut: '', name: '', parte: 1 }];
  return contra.map(c => ({ rut: c.rut, name: c.name, parte: c.peso / total }));
}
