// Finiquitos guardados: todo finiquito que se genera queda registrado (se puede volver a descargar, marcar firmado/pagado
// o corregir; cada corrección guarda la versión anterior en el historial).
import { collection, doc, getDoc, setDoc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import type { DatosDocumentoFiniquito } from './finiquitoPdf';
import type { Cuadro } from './finiquito';

export interface FiniquitoGuardado {
  id: string;
  employeeId: string;
  employeeRut: string;
  employeeName: string;
  causalCodigo: string;
  causalNombre: string;
  fechaInicio: string;
  fechaCese: string;
  obra?: string;
  total: number;
  documento: DatosDocumentoFiniquito;   // todo lo necesario para volver a generar el PDF idéntico
  cuadro?: Cuadro;
  estado: 'GENERADO' | 'FIRMADO' | 'PAGADO' | 'ANULADO';
  origen: 'INDIVIDUAL' | 'MASIVO_OBRA';
  createdAt: string;
  updatedAt: string;
  usuario?: string;
  historial?: Omit<FiniquitoGuardado, 'historial'>[];
}

const col = (studyId: string, companyId: string) => collection(db, 'studies', studyId, 'companies', companyId, 'finiquitos');
const idDe = (employeeId: string, fechaCese: string) => `${employeeId}_${fechaCese}`;
// Firestore no acepta undefined
const limpio = <T,>(o: T): T => JSON.parse(JSON.stringify(o));

export async function guardarFiniquito(studyId: string, companyId: string,
  f: Omit<FiniquitoGuardado, 'id' | 'createdAt' | 'updatedAt' | 'estado' | 'historial'> & { estado?: FiniquitoGuardado['estado'] }): Promise<string> {
  const id = idDe(f.employeeId, f.fechaCese);
  const ref = doc(col(studyId, companyId), id);
  const ahora = new Date().toISOString();
  const prev = await getDoc(ref);
  let historial: FiniquitoGuardado['historial'] = [];
  let createdAt = ahora, estado: FiniquitoGuardado['estado'] = f.estado || 'GENERADO';
  if (prev.exists()) {
    const p = prev.data() as FiniquitoGuardado;
    createdAt = p.createdAt || ahora;
    if (!f.estado && p.estado && p.estado !== 'ANULADO') estado = p.estado;
    const { historial: h, ...anterior } = p;
    // solo se guarda versión anterior si cambió algo del cálculo
    const cambio = JSON.stringify(anterior.documento) !== JSON.stringify(limpio(f.documento)) || anterior.causalCodigo !== f.causalCodigo;
    historial = [...(h || []), ...(cambio ? [anterior] : [])].slice(-10);
  }
  await setDoc(ref, limpio({ ...f, id, estado, createdAt, updatedAt: ahora, usuario: auth.currentUser?.email || '', historial }));
  return id;
}

export async function cambiarEstadoFiniquito(studyId: string, companyId: string, id: string, estado: FiniquitoGuardado['estado']) {
  await setDoc(doc(col(studyId, companyId), id), { estado, updatedAt: new Date().toISOString() }, { merge: true });
}

export function escucharFiniquitos(studyId: string, companyId: string, cb: (l: FiniquitoGuardado[]) => void) {
  return onSnapshot(query(col(studyId, companyId), orderBy('fechaCese', 'desc')), s => cb(s.docs.map(d => d.data() as FiniquitoGuardado)), () => cb([]));
}
