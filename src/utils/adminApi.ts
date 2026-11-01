// Llamadas al servidor para administrar cuentas de acceso (Firebase Auth + rol/estudio).
import { auth } from '../lib/firebase';

export interface ProvisionUserInput {
  email: string;
  password?: string;
  name?: string;
  role: string;
  studyId?: string | null;
}

export async function provisionAuthUser(input: ProvisionUserInput) {
  const user = auth.currentUser;
  if (!user) throw new Error('Tu sesión no es válida. Vuelve a iniciar sesión.');
  const token = await user.getIdToken();
  const res = await fetch('/api/auth/create-user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(input)
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* respuesta no JSON */ }
  if (!res.ok || !data || !data.success) {
    throw new Error((data && data.error) || `No se pudo crear la cuenta de acceso (código ${res.status}).`);
  }
  return data as { success: true; created: boolean; uid: string };
}
