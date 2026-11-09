import { collection, doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

/** Respaldos (FUN de Isapre, carta de AFP, anexo de contrato, etc.) de cambios previsionales.
 *  Se guardan en la empresa: studies/{studyId}/companies/{companyId}/respaldosPrevisionales/{id}. */
export const MAX_RESPALDO_BYTES = 700 * 1024; // límite de un documento de Firestore (1 MiB) con margen

export const tamanoLegible = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

const leer = (file: File) => new Promise<string>((ok, mal) => {
  const r = new FileReader();
  r.onload = () => { const s = String(r.result || ''); ok(s.includes(',') ? s.split(',')[1] : s); };
  r.onerror = () => mal(new Error('No se pudo leer el archivo'));
  r.readAsDataURL(file);
});

export async function subirRespaldo(studyId: string, companyId: string, employeeId: string, file: File): Promise<{ id: string; nombre: string }> {
  if (file.size > MAX_RESPALDO_BYTES) throw new Error(`El archivo pesa ${tamanoLegible(file.size)}; el máximo es ${tamanoLegible(MAX_RESPALDO_BYTES)}. Comprímelo o súbelo reducido.`);
  const datosBase64 = await leer(file);
  const id = `resp_${Date.now()}`;
  await setDoc(doc(collection(db, 'studies', studyId, 'companies', companyId, 'respaldosPrevisionales'), id), {
    id, employeeId, nombre: file.name, tipo: file.type || 'application/octet-stream', tamano: file.size, datosBase64,
    subidoEn: new Date().toISOString(), subidoPor: auth.currentUser?.email || 'Usuario contable',
  });
  return { id, nombre: file.name };
}

export async function abrirRespaldo(studyId: string, companyId: string, id: string): Promise<void> {
  const s = await getDoc(doc(collection(db, 'studies', studyId, 'companies', companyId, 'respaldosPrevisionales'), id));
  if (!s.exists()) throw new Error('El respaldo no existe');
  const d: any = s.data();
  const bin = atob(d.datosBase64 || '');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: d.tipo || 'application/octet-stream' }));
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
