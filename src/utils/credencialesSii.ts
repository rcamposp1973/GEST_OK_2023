import { auth } from '../lib/firebase';

// Las credenciales del SII (claves, certificado digital y clave de SimpleAPI) NO se guardan en el documento de la empresa.
// Se envían al servidor, que las guarda cifradas (AES-256-GCM) en una colección que el navegador no puede leer.
// En el documento de la empresa solo quedan marcas sin valor ("hay clave guardada").

export const CAMPOS_SECRETOS = ['claveRepLegalSii', 'claveEmpresaSii', 'claveCertificadoDigital', 'certificadoB64', 'siiApiKey'] as const;

export interface SecretosSii {
  rutRepresentante?: string;
  claveRepresentante?: string;
  claveSii?: string;
  claveCertificadoDigital?: string;
  certificadoB64?: string;
  siiApiKey?: string;
}

const MASCARA = '••••••••';
const real = (v: any) => (typeof v === 'string' && v.trim() && v !== MASCARA ? v.trim() : '');

/** Separa una configuración DTE en la parte que se puede guardar en la empresa y los secretos que van cifrados al servidor. */
export function separarCredenciales<T extends Record<string, any>>(config: T): { limpio: T; secretos: SecretosSii; haySecretos: boolean } {
  const c: any = { ...config };
  const secretos: SecretosSii = {
    rutRepresentante: c.rutRepresentante || '',
    claveRepresentante: real(c.claveRepLegalSii),
    claveSii: real(c.claveEmpresaSii),
    claveCertificadoDigital: real(c.claveCertificadoDigital),
    certificadoB64: real(c.certificadoB64),
    siiApiKey: real(c.siiApiKey),
  };
  // Marcas sin valor, para que las pantallas sepan que hay algo guardado
  if (secretos.claveRepresentante) { c.claveRepLegalSiiMasked = MASCARA; c.claveSiiMasked = MASCARA; }
  if (secretos.claveSii) c.claveEmpresaSiiMasked = MASCARA;
  if (secretos.claveCertificadoDigital) c.claveCertificadoMasked = MASCARA;
  if (secretos.certificadoB64) c.hasCertificadoDigital = true;
  if (secretos.siiApiKey) c.siiApiKeyMasked = MASCARA;
  for (const k of CAMPOS_SECRETOS) delete c[k];
  const haySecretos = !!(secretos.claveRepresentante || secretos.claveSii || secretos.claveCertificadoDigital || secretos.certificadoB64 || secretos.siiApiKey);
  return { limpio: c, secretos, haySecretos };
}

/** Envía los secretos al servidor para guardarlos cifrados. Lanza error si el servidor no los pudo guardar. */
export async function guardarSecretosSii(studyId: string, companyId: string, secretos: SecretosSii): Promise<void> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Sesión expirada. Vuelve a iniciar sesión.');
  const r = await fetch(`/api/companies/${encodeURIComponent(companyId)}/secrets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ studyId, ...secretos }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.success) throw new Error(data.error || `No se pudieron guardar las credenciales (HTTP ${r.status}).`);
}

/** Indica si la empresa tiene alguna credencial del SII guardada (cifrada o, en empresas antiguas, aún sin cifrar). */
export const tieneCredencialSii = (dte: any): boolean =>
  !!(dte && (dte.claveRepLegalSiiMasked || dte.claveSiiMasked || dte.hasCertificadoDigital || dte.claveRepLegalSii || dte.siiConnectionStatus === 'Conectado' || dte.siiConnectionStatus === 'CONFIGURADO'));
