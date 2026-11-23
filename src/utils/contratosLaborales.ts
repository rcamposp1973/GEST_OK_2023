// Historial de contratos de un trabajador. Cada recontratación es un contrato nuevo con su propia fecha de inicio:
// el finiquito y la antigüedad se calculan solo sobre el contrato que termina, sin acumular contratos anteriores ya finiquitados.
import type { ContratoLaboral, ContractType, Employee } from '../types';

export const NOMBRE_TIPO_CONTRATO: Record<ContractType, string> = {
  INDEFINIDO: 'Indefinido', PLAZO_FIJO: 'Plazo fijo', OBRA_FAENA: 'Por obra o faena', PART_TIME: 'Part time',
};

const ordenar = (cs: ContratoLaboral[]) => [...cs].sort((a, b) => (a.fechaInicio || '').localeCompare(b.fechaInicio || ''));

/** Contratos del trabajador; si es una ficha antigua sin historial, se arma uno con la fecha de ingreso. */
export function contratosDe(e: Pick<Employee, 'contratos' | 'hireDate' | 'terminationDate' | 'contractType'>): ContratoLaboral[] {
  if (e.contratos && e.contratos.length) return ordenar(e.contratos);
  if (!e.hireDate) return [];
  return [{ id: 'c1', tipo: e.contractType || 'INDEFINIDO', fechaInicio: e.hireDate, fechaTermino: e.terminationDate || undefined }];
}

/** El contrato actual: el último iniciado. */
export function contratoActual(e: Pick<Employee, 'contratos' | 'hireDate' | 'terminationDate' | 'contractType'>): ContratoLaboral | null {
  const cs = contratosDe(e);
  return cs.length ? cs[cs.length - 1] : null;
}

/** Deja la ficha coherente: los campos de ingreso, término y tipo reflejan el contrato actual. */
export function sincronizarFicha<T extends Pick<Employee, 'contratos' | 'hireDate' | 'terminationDate' | 'contractType'>>(e: T): T {
  let cs = e.contratos && e.contratos.length ? ordenar(e.contratos) : contratosDe(e);
  if (!cs.length) return e;
  // Lo que se edite en los campos de la ficha corresponde al contrato actual
  const ult = { ...cs[cs.length - 1] };
  if (e.hireDate) ult.fechaInicio = e.hireDate;
  if (e.contractType) ult.tipo = e.contractType;
  ult.fechaTermino = e.terminationDate || undefined;
  cs = [...cs.slice(0, -1), ult];
  // '' (y no undefined) para que al guardar con merge se borre un término anterior
  return { ...e, contratos: cs.map(limpiar), hireDate: ult.fechaInicio, contractType: ult.tipo, terminationDate: ult.fechaTermino || '' };
}

/** Firestore no acepta campos undefined */
const limpiar = (c: ContratoLaboral): ContratoLaboral => {
  const o: any = { ...c };
  Object.keys(o).forEach(k => { if (o[k] === undefined || o[k] === '') delete o[k]; });
  return o;
};

/** Registra el término del contrato actual. */
export function terminarContrato<T extends Pick<Employee, 'contratos' | 'hireDate' | 'terminationDate' | 'contractType'>>(e: T, fecha: string, causal?: string): T {
  const cs = contratosDe(e);
  if (!cs.length) return e;
  const ult = { ...cs[cs.length - 1], fechaTermino: fecha, causalTermino: causal || cs[cs.length - 1].causalTermino };
  if (fecha < ult.fechaInicio) throw new Error('La fecha de término no puede ser anterior al inicio del contrato.');
  const nuevos = [...cs.slice(0, -1), ult].map(limpiar);
  return { ...e, contratos: nuevos, terminationDate: fecha };
}

/** Agrega un contrato nuevo (recontratación). El anterior debe estar terminado antes del nuevo inicio. */
export function nuevoContrato<T extends Pick<Employee, 'contratos' | 'hireDate' | 'terminationDate' | 'contractType'>>(
  e: T, datos: { tipo: ContractType; fechaInicio: string; obraFaena?: string; fechaTerminoPactada?: string }
): T {
  const cs = contratosDe(e);
  const ult = cs[cs.length - 1];
  if (ult && !ult.fechaTermino) throw new Error('Primero registra el término del contrato vigente.');
  if (ult && ult.fechaTermino && datos.fechaInicio <= ult.fechaTermino) throw new Error('El nuevo contrato debe empezar después del término del anterior.');
  const c: ContratoLaboral = limpiar({ id: `c${Date.now()}`, tipo: datos.tipo, fechaInicio: datos.fechaInicio, obraFaena: datos.obraFaena });
  return { ...e, contratos: [...cs.map(limpiar), c], hireDate: c.fechaInicio, contractType: c.tipo, terminationDate: '' };
}

/**
 * Cierre (o corrección del cierre) de una obra: ajusta el contrato por obra o faena asociado a esa obra.
 * - Contrato vigente de la obra → se termina en la fecha de la obra (Art. 159 N° 5).
 * - Contrato ya cerrado por la obra con la fecha anterior → se corrige a la nueva fecha, o se reabre si la obra se reabre.
 * Devuelve la ficha cambiada, o null si este trabajador no se ve afectado.
 * Solo toca fechas del contrato: la liquidación del mes sigue editable (bonos, ausencias, licencias, vacaciones).
 */
export function aplicarCierreObra<T extends Pick<Employee, 'contratos' | 'hireDate' | 'terminationDate' | 'contractType'>>(
  e: T, obraId: string, fechaNueva: string, fechaAnterior?: string
): T | null {
  const cs = contratosDe(e);
  const ult = cs[cs.length - 1];
  if (!ult || ult.tipo !== 'OBRA_FAENA' || ult.obraId !== obraId) return null;
  const cerradoPorObra = !!ult.fechaTermino && !!fechaAnterior && ult.fechaTermino === fechaAnterior && (!ult.causalTermino || ult.causalTermino === 'ART_159_CONCLUSION');
  if (fechaNueva) {
    if (ult.fechaTermino && !cerradoPorObra) return null;       // terminado antes por otro motivo: no se toca
    if (ult.fechaTermino === fechaNueva) return null;
    if (fechaNueva < ult.fechaInicio) return null;               // la obra cierra antes de que empezara este contrato
    return terminarContrato(e, fechaNueva, 'ART_159_CONCLUSION');
  }
  // la obra se reabrió: se reabre el contrato que había cerrado
  if (!cerradoPorObra) return null;
  const abierto = { ...ult } as any; delete abierto.fechaTermino; delete abierto.causalTermino;
  return { ...e, contratos: [...cs.slice(0, -1), abierto], terminationDate: '' };
}
