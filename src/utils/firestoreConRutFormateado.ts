/**
 * Capa única de escritura a Firestore (Vite reemplaza 'firebase/firestore' por este archivo).
 * Antes de guardar cualquier dato, deja todo campo de RUT en el formato 11.111.111-1.
 * Así la regla se cumple en TODA la aplicación sin importar quién escriba el dato
 * (formularios, importaciones del SII, cargas masivas, etc.).
 * Si algo falla al normalizar, se guarda el dato original (nunca se bloquea un guardado).
 */
import {
  setDoc as _setDoc,
  addDoc as _addDoc,
  updateDoc as _updateDoc,
  writeBatch as _writeBatch,
  runTransaction as _runTransaction,
} from '@firebase/firestore';
import { normalizarRutsProfundo, formatearRut, CAMPOS_RUT } from './rutFormato';

export * from '@firebase/firestore';

const seguro = <T,>(d: T): T => { try { return normalizarRutsProfundo(d); } catch { return d; } };

// updateDoc(ref, objeto)  ó  updateDoc(ref, 'campo', valor, 'campo2', valor2…)
function normalizarArgsUpdate(args: any[]): any[] {
  try {
    if (args.length === 1) return [seguro(args[0])];
    const salida = args.slice();
    for (let i = 0; i + 1 < salida.length; i += 2) {
      const campo = salida[i];
      const v = salida[i + 1];
      const ultimo = typeof campo === 'string' ? (campo.split('.').pop() as string) : '';
      salida[i + 1] = CAMPOS_RUT.has(ultimo) && typeof v === 'string' ? formatearRut(v) : seguro(v);
    }
    return salida;
  } catch { return args; }
}

export const setDoc: typeof _setDoc = ((ref: any, data: any, ...resto: any[]) =>
  (_setDoc as any)(ref, seguro(data), ...resto)) as any;

export const addDoc: typeof _addDoc = ((ref: any, data: any) =>
  (_addDoc as any)(ref, seguro(data))) as any;

export const updateDoc: typeof _updateDoc = ((ref: any, ...args: any[]) =>
  (_updateDoc as any)(ref, ...normalizarArgsUpdate(args))) as any;

// Escritor por lotes / transacción: set y update pasan por la normalización.
function envolver<T extends object>(w: T): T {
  const proxy: any = new Proxy(w, {
    get(t: any, p: string | symbol) {
      const v = t[p];
      if (typeof v !== 'function') return v;
      if (p === 'set') return (ref: any, data: any, ...r: any[]) => { t.set(ref, seguro(data), ...r); return proxy; };
      if (p === 'update') return (ref: any, ...a: any[]) => { t.update(ref, ...normalizarArgsUpdate(a)); return proxy; };
      return v.bind(t);
    },
  });
  return proxy;
}

export const writeBatch: typeof _writeBatch = ((db: any) => envolver((_writeBatch as any)(db))) as any;

export const runTransaction: typeof _runTransaction = ((db: any, fn: any, opts?: any) =>
  (_runTransaction as any)(db, (tx: any) => fn(envolver(tx)), opts)) as any;
