import { auth } from '../lib/firebase';

// Consulta del RCV del SII. Todo ocurre en el servidor: el navegador solo dice qué empresa y qué período.
// Las claves y el certificado se leen cifrados en el servidor; nunca viajan desde ni hacia el navegador.

export interface FetchRcvParams {
  studyId: string;
  companyId: string;
  year: number;
  month: string;
  tipo?: string;
  /** Solo transición: clave de SimpleAPI guardada en este navegador. El servidor la guarda cifrada si la necesita. */
  apiKeyNavegador?: string;
}

export interface FetchRcvResult {
  success: boolean;
  needsCertificate?: boolean;
  count?: number;
  documents?: any[];
  period?: string;
  error?: string;
  message?: string;
  source?: string;
  periodoCerrado?: boolean;
  /** Consultas a SimpleAPI usadas en el mes (todas las empresas) */
  consumoMes?: { usadas: number; limite: number; mes: string };
}

export async function fetchRcvFromSii(params: FetchRcvParams): Promise<FetchRcvResult> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) return { success: false, error: 'Sesión expirada. Vuelve a iniciar sesión.' };
  try {
    const response = await fetch('/api/sii/rescatar-rcv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({
        studyId: params.studyId,
        companyId: params.companyId,
        year: params.year,
        month: params.month,
        tipo: params.tipo || 'ALL',
        apiKey: params.apiKeyNavegador || '',
      }),
    });
    const data = await response.json().catch(() => null);
    if (!data) return { success: false, error: `El servidor no respondió correctamente (HTTP ${response.status}).` };
    return data;
  } catch (e: any) {
    return { success: false, error: `No se pudo conectar con el servidor: ${e?.message || e}` };
  }
}

/** Clave de SimpleAPI que algunos navegadores tienen guardada de la versión anterior. */
export const apiKeyGuardadaEnNavegador = (): string => {
  try { return (typeof window !== 'undefined' && localStorage.getItem('gest_ok_master_api_key')) || ''; } catch { return ''; }
};

/** API propia de Gest_OK contra el SII (sin SimpleAPI). Acciones: datos, rcv, f29. */
export async function consultarSiiDirecto(params: { studyId: string; companyId: string; accion: 'datos' | 'rcv' | 'f29'; year?: number; month?: number }): Promise<any> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) return { success: false, error: 'Sesión expirada. Vuelve a iniciar sesión.' };
  try {
    const r = await fetch('/api/sii/portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(params),
    });
    const data = await r.json().catch(() => null);
    return data || { success: false, error: `El servidor no respondió correctamente (HTTP ${r.status}).` };
  } catch (e: any) {
    return { success: false, error: `No se pudo conectar con el servidor: ${e?.message || e}` };
  }
}
