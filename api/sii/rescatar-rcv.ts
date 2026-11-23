import type { IncomingMessage, ServerResponse } from 'http';
import crypto from 'crypto';
import * as adminImport from 'firebase-admin';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
// Configuracion fija del proyecto (en Vercel no se puede importar el .json sin atributo especial).
const firebaseConfig = {
  projectId: process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0478013396',
  firestoreDatabaseId: process.env.FIREBASE_DATABASE_ID || 'ai-studio-gestor-0fa27d4a-5ce2-4999-afdb-eb28b01c6d8d'
};

// Inicializacion de Firebase Admin (compartida con server.ts).
// En Vercel se necesita la variable FIREBASE_SERVICE_ACCOUNT (JSON de la cuenta de servicio).
// Se usa la base de datos con nombre del proyecto (no la "(default)").
function initAdmin() {
  if (getApps().length) return getApps()[0];
  const projectId = process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) {
    try {
      return initializeApp({ projectId, credential: cert(JSON.parse(raw)) });
    } catch (e) {
      console.error('FIREBASE_SERVICE_ACCOUNT invalida:', (e as Error).message);
    }
  }
  return initializeApp({ projectId });
}
const adminApp = initAdmin();
const adminDb = getFirestore(adminApp, (firebaseConfig as any).firestoreDatabaseId || undefined as any);
const adminAuth = getAuth(adminApp);
const admin: any = {
  apps: getApps(),
  getApps,
  initializeApp,
  firestore: Object.assign(() => adminDb, { FieldValue }),
  auth: () => adminAuth
};

// Misma clave que api/index.ts: SECRETS_ENCRYPTION_KEY o, si no existe, derivada de la cuenta de servicio de Firebase.
function getEncryptionKey(): Buffer {
  const rawKey = process.env.SECRETS_ENCRYPTION_KEY;
  if (rawKey) return crypto.createHash('sha256').update(rawKey).digest();
  try {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
    if (sa.private_key) {
      return crypto.createHash('sha256').update('gest_ok/secretos-empresa/v1|' + sa.private_key).digest();
    }
  } catch { /* sigue al error */ }
  throw new Error("Falta configurar SECRETS_ENCRYPTION_KEY en el servidor.");
}

function encryptSecret(plainText: string): string {
  if (!plainText) return '';
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return JSON.stringify({ iv: iv.toString('base64'), data: encrypted, tag: cipher.getAuthTag().toString('base64') });
}

function decryptSecret(encryptedPayload: string): string {
  if (!encryptedPayload) return '';
  const key = getEncryptionKey();
  try {
    const { iv, data, tag } = JSON.parse(encryptedPayload);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    let decrypted = decipher.update(data, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err: any) {
    if (err.message === "Falta configurar SECRETS_ENCRYPTION_KEY en el servidor.") {
      throw err;
    }
    return '';
  }
}

async function getDecryptedCompanySecrets(companyId: string) {
  if (!companyId) return null;
  try {
    const docSnap = await adminDb.collection('companySecrets').doc(companyId).get();
    if (!docSnap.exists) return null;
    const data = docSnap.data() || {};
    return {
      studyId: data.studyId || '',
      claveSii: data.claveSiiEncrypted ? decryptSecret(data.claveSiiEncrypted) : '',
      rutRepresentante: data.rutRepresentante || '',
      claveRepresentante: data.claveRepresentanteEncrypted ? decryptSecret(data.claveRepresentanteEncrypted) : '',
      claveCertificadoDigital: data.claveCertificadoEncrypted ? decryptSecret(data.claveCertificadoEncrypted) : '',
      certificadoB64: data.certificadoB64Encrypted ? decryptSecret(data.certificadoB64Encrypted) : '',
      siiApiKey: data.siiApiKeyEncrypted ? decryptSecret(data.siiApiKeyEncrypted) : '',
      hasCertificadoDigital: !!data.hasCertificadoDigital
    };
  } catch {
    return null;
  }
}

function validateSiiApiUrl(rawUrl: string): { valid: boolean; error?: string } {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') {
      return { valid: false, error: 'Protocolo no permitido. Solo se admite HTTPS seguro.' };
    }
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '0.0.0.0' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('169.254.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
    ) {
      return { valid: false, error: 'Acceso a IPs privadas bloqueado por seguridad (Anti-SSRF).' };
    }
    const allowedHostsEnv = process.env.ALLOWED_SII_HOSTS || 'simpleapi.cl,api.simpleapi.cl,servicios.simpleapi.cl,zeus.sii.cl,mpt.sii.cl';
    const allowedHosts = allowedHostsEnv.split(',').map(h => h.trim().toLowerCase());
    const isAllowed = allowedHosts.some(allowed => hostname === allowed || hostname.endsWith(`.${allowed}`));
    if (!isAllowed) {
      return { valid: false, error: `El host ${hostname} no está en la lista blanca de proveedores autorizados.` };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: 'URL malformada o inválida.' };
  }
}

// Credenciales que versiones anteriores dejaron sin cifrar en el documento de la empresa
function secretosEnClaro(compData: any) {
  const d = compData?.dteConfig || {};
  const v = (x: any) => (typeof x === 'string' && x.trim() && x !== '••••••••' ? x.trim() : '');
  return {
    claveRepresentante: v(d.claveRepLegalSii) || v(d.claveRepresentante) || v(compData?.claveRepresentante),
    claveSii: v(d.claveEmpresaSii) || v(d.claveSii) || v(compData?.claveSii) || v(compData?.claveTributaria),
    claveCertificadoDigital: v(d.claveCertificadoDigital) || v(compData?.claveCertificadoDigital),
    certificadoB64: (v(d.certificadoB64) || v(compData?.certificadoB64)).replace(/^data:[^;]+;base64,/, ''),
    siiApiKey: v(d.siiApiKey),
    rutRepresentante: v(d.rutRepresentante) || v(compData?.legalRepRut),
  };
}

/** Cifra lo que esté en claro, comprueba que se puede descifrar, y recién ahí lo borra de la empresa. Devuelve los valores en claro para usarlos ahora. */
async function migrarSiHayEnClaro(compRef: any, compData: any, studyId: string, companyId: string) {
  const e = secretosEnClaro(compData);
  if (!(e.claveRepresentante || e.claveSii || e.claveCertificadoDigital || e.certificadoB64 || e.siiApiKey)) return e;
  try {
    const enc: any = { companyId, studyId, updatedAt: new Date().toISOString() };
    if (e.rutRepresentante) enc.rutRepresentante = e.rutRepresentante;
    if (e.claveRepresentante) enc.claveRepresentanteEncrypted = encryptSecret(e.claveRepresentante);
    if (e.claveSii) enc.claveSiiEncrypted = encryptSecret(e.claveSii);
    if (e.claveCertificadoDigital) enc.claveCertificadoEncrypted = encryptSecret(e.claveCertificadoDigital);
    if (e.certificadoB64) { enc.certificadoB64Encrypted = encryptSecret(e.certificadoB64); enc.hasCertificadoDigital = true; }
    if (e.siiApiKey) enc.siiApiKeyEncrypted = encryptSecret(e.siiApiKey);
    for (const k of Object.keys(enc)) {
      if (k.endsWith('Encrypted') && !decryptSecret(enc[k])) throw new Error('verificación de cifrado');
    }
    await adminDb.collection('companySecrets').doc(companyId).set(enc, { merge: true });
    const del = FieldValue.delete();
    const upd: any = {
      claveSii: del, claveTributaria: del, claveRepresentante: del, claveCertificadoDigital: del, certificadoB64: del,
      'dteConfig.claveSii': del, 'dteConfig.claveRepresentante': del, 'dteConfig.claveCertificadoDigital': del,
      'dteConfig.certificadoB64': del, 'dteConfig.claveRepLegalSii': del, 'dteConfig.claveEmpresaSii': del, 'dteConfig.siiApiKey': del,
    };
    if (e.claveRepresentante) { upd['dteConfig.claveRepLegalSiiMasked'] = '••••••••'; upd['dteConfig.claveSiiMasked'] = '••••••••'; }
    if (e.claveSii) upd['dteConfig.claveEmpresaSiiMasked'] = '••••••••';
    if (e.claveCertificadoDigital) upd['dteConfig.claveCertificadoMasked'] = '••••••••';
    if (e.certificadoB64) upd['dteConfig.hasCertificadoDigital'] = true;
    if (e.siiApiKey) upd['dteConfig.siiApiKeyMasked'] = '••••••••';
    await compRef.update(upd);
  } catch (err: any) {
    // Si no se pudo cifrar, no se borra nada y la consulta sigue funcionando con los valores actuales.
    console.error('No se pudieron migrar credenciales de empresa:', err?.message || err);
  }
  return e;
}

/**
 * Clave de SimpleAPI. Es UNA sola para todo el sistema (la cuenta de Gest_OK en SimpleAPI):
 * variable SII_API_KEY > clave general guardada cifrada > clave propia de la empresa > la del navegador.
 * Si aún no hay clave general y el Super Admin sincroniza con una empresa (o un navegador) que sí la tiene,
 * esa clave se guarda cifrada como general y desde ahí sirve para todas las empresas de todos los estudios.
 */
async function resolverApiKey(deEmpresa: string, deNavegador: string, esSuperAdmin: boolean): Promise<string> {
  if (process.env.SII_API_KEY) return process.env.SII_API_KEY.trim();
  const ref = adminDb.collection('systemSecrets').doc('simpleApi');
  try {
    const snap = await ref.get();
    const guardada = snap.exists ? decryptSecret((snap.data() as any)?.apiKeyEncrypted || '') : '';
    if (guardada) return guardada;
    // La API guardada en la configuración de una empresa la ingresó un administrador: se adopta como general.
    // La que viene solo del navegador se adopta únicamente si sincroniza el Super Admin.
    const candidata = deEmpresa || (esSuperAdmin ? deNavegador : '');
    if (candidata) {
      const enc = encryptSecret(candidata);
      if (decryptSecret(enc) === candidata) await ref.set({ apiKeyEncrypted: enc, updatedAt: new Date().toISOString() });
    }
  } catch (err: any) {
    console.error('Clave general de SimpleAPI:', err?.message || err);
  }
  return deEmpresa || deNavegador;
}

// Helper to parse JSON body in Vercel Serverless Function
async function parseBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });
  });
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // CORS & Options handling
  const allowedOrigin = process.env.APP_URL || '*';
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  // 1. Verificación de Autenticación Firebase ID Token
  const authHeader = (req.headers['authorization'] || req.headers['Authorization']) as string | undefined;
  const token = (authHeader && authHeader.startsWith('Bearer ')) ? authHeader.split('Bearer ')[1].trim() : null;
  if (!token) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: 'Acceso no autorizado: Token de autenticación requerido.' }));
    return;
  }

  let decodedToken: any = null;
  try {
    decodedToken = await admin.auth().verifyIdToken(token);
  } catch (tokenErr) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: 'Token de autenticación inválido o expirado.' }));
    return;
  }

  try {
    const body = await parseBody(req);
    // El navegador solo indica empresa y período. Las credenciales se leen aquí, cifradas; nunca vienen del navegador.
    const { year, month, tipo = 'ALL', studyId, companyId } = body;
    const apiKeyNavegador = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
    const responder = (code: number, payload: any) => {
      res.statusCode = code;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(payload));
    };

    console.log(`[rescatar-rcv] inicio empresa=${companyId} periodo=${year}-${month}`);
    if (!studyId || !companyId) return responder(400, { success: false, error: 'Falta indicar el estudio y la empresa.' });
    if (decodedToken?.role !== 'SUPER_USER' && decodedToken?.studyId !== studyId) {
      return responder(403, { success: false, error: 'No tienes permisos sobre esta empresa.' });
    }
    const compRef = adminDb.collection('studies').doc(String(studyId)).collection('companies').doc(String(companyId));
    const compSnap = await compRef.get();
    if (!compSnap.exists) return responder(404, { success: false, error: 'Empresa no encontrada en este estudio.' });
    const compData: any = compSnap.data() || {};
    const dte: any = compData.dteConfig || {};

    const secrets = await getDecryptedCompanySecrets(String(companyId));
    if (secrets && secrets.studyId && secrets.studyId !== studyId) {
      return responder(403, { success: false, error: 'No tienes permisos sobre las credenciales de esta empresa.' });
    }

    // Empresas antiguas: credenciales aún en claro en la empresa. Se cifran y se retiran en este mismo paso.
    const enClaro = await migrarSiHayEnClaro(compRef, compData, String(studyId), String(companyId));

    const activeCertB64 = secrets?.certificadoB64 || enClaro.certificadoB64;
    const activeCertPass = secrets?.claveCertificadoDigital || secrets?.claveRepresentante || enClaro.claveCertificadoDigital || enClaro.claveRepresentante;
    const activeRepRut = secrets?.rutRepresentante || enClaro.rutRepresentante || dte.rutRepresentante || compData.legalRepRut || '';

    const cleanCompanyRut = (compData.rut || '').replace(/[^0-9kK]/g, '').toUpperCase();
    const companyName = compData.name || '';
    const cleanRepRut = (activeRepRut || '').replace(/[^0-9kK]/g, '').toUpperCase();
    const yearNum = Number(year) || new Date().getFullYear();

    const formatRut = (raw: string) => {
      if (!raw || raw.length < 2) return '';
      return `${raw.slice(0, -1)}-${raw.slice(-1)}`;
    };

    const cleanCompanyRutWithDash = formatRut(cleanCompanyRut);
    const cleanRepRutWithDash = formatRut(cleanRepRut);

    // Clave de SimpleAPI: variable del servidor > la de la empresa > la general guardada cifrada > la del navegador (transición)
    const effectiveApiKey = await resolverApiKey(secrets?.siiApiKey || enClaro.siiApiKey || '', apiKeyNavegador, decodedToken?.role === 'SUPER_USER');

    if (!effectiveApiKey) {
      return responder(200, {
        success: false,
        error: 'Falta la clave del servicio SimpleAPI en el servidor. El Super Admin debe sincronizar una vez desde su equipo, o configurarla en Vercel como SII_API_KEY.'
      });
    }

    const cleanCertB64 = (activeCertB64 || '').replace(/^data:[^;]+;base64,/, '').trim();
    const certPass = (activeCertPass || '').trim();
    const formattedMonth = String(month === 'ALL' ? '01' : month).padStart(2, '0');

    // 1. Si no tiene certificado digital, avisar claramente
    if (!cleanCertB64 || !certPass) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: false,
        needsCertificate: true,
        error: `Para consultar automáticamente el RCV de ${cleanCompanyRutWithDash || 'la empresa'} desde el SII, se requiere cargar el Certificado Digital (.pfx) en la sección Facturador SII / Configuración.`
      }));
      return;
    }

    // 2. Ejecutar rescate oficial RCV directamente contra SimpleAPI
    let docs: any[] = [];
    const ambienteNum = (dte.ambiente === 'SANDBOX' || dte.ambiente === 'Certificación') ? 0 : 1;
    const headers = { 'Authorization': effectiveApiKey };

    const rcvInputPayload = {
      RutEmpresa: cleanCompanyRutWithDash,
      RutCertificado: cleanRepRutWithDash || cleanCompanyRutWithDash,
      Ambiente: ambienteNum,
      Password: certPass,
      CertificadoB64: cleanCertB64
    };

    let apiErrors: string[] = [];

    const inicio = Date.now();
    const tareas: Promise<void>[] = [];
    tareas.push((async () => {
    // A. Ventas
    if (tipo === 'ALL' || tipo === 'VENTAS' || tipo === 'VENTA') {
      try {
        const formDataVentas = new FormData();
        formDataVentas.append('input', JSON.stringify(rcvInputPayload));

        const ventasRes = await fetch(`https://servicios.simpleapi.cl/api/RCV/ventas/${formattedMonth}/${yearNum}`, {
          method: 'POST',
          headers,
          body: formDataVentas,
          signal: AbortSignal.timeout(60000)
        });

        if (ventasRes.ok) {
          const dataVentas: any = await ventasRes.json();
          const detalleVentas = dataVentas?.ventas?.detalleVentas || dataVentas?.detalleVentas || [];
          for (const item of detalleVentas) {
            const tipoDte = String(item.tipoDTE || item.tipoDte || item.tipoDoc || '33');
            const folio = String(item.folio || '0');
            const fechaEmisionRaw = item.fechaEmision || item.fecha || `${yearNum}-${formattedMonth}-01`;
            const fechaEmision = fechaEmisionRaw.includes('T') ? fechaEmisionRaw.split('T')[0] : fechaEmisionRaw;
            const montoNeto = Number(item.montoNeto || 0);
            const montoIva = Number(item.montoIvaRecuperable ?? item.montoIva ?? 0);
            const montoExento = Number(item.montoExento || 0);
            const montoTotal = Number(item.montoTotal || (montoNeto + montoIva + montoExento));

            // Normalize client RUT and Razon Social - ensure emitting company is NOT set as client
            const rawClientRut = (
              item.rutCliente ||
              item.rutReceptor ||
              item.rutRecep ||
              (item.rutRecep && item.dvRecep ? `${item.rutRecep}-${item.dvRecep}` : '') ||
              item.rutComprador ||
              (item.rut && item.rut.replace(/[^0-9kK]/g, '').toUpperCase() !== cleanCompanyRut ? item.rut : '') ||
              ''
            );
            const clientRutWithDash = rawClientRut.length > 1
              ? `${rawClientRut.replace(/[^0-9kK]/g, '').slice(0, -1)}-${rawClientRut.replace(/[^0-9kK]/g, '').slice(-1)}`
              : (rawClientRut || '76.000.000-0');

            const clientName = (
              item.razonSocialReceptor ||
              item.razonSocialCliente ||
              item.rznSocRecep ||
              item.razonSocial ||
              item.rznSoc ||
              item.nombreReceptor ||
              item.cliente ||
              'CLIENTE FACTURA'
            );

            docs.push({
              tipoRegistro: 'Venta',
              tipoDocumento: tipoDte,
              tipoDoc: tipoDte,
              nombreTipoDoc: item.tipoDTEString || item.tipoDocString || (tipoDte === '33' ? 'Factura Electrónica' : tipoDte === '34' ? 'Factura Exenta' : tipoDte === '61' ? 'Nota de Crédito' : 'DTE Venta'),
              folio,
              rutEmisor: cleanCompanyRutWithDash,
              razonSocialEmisor: companyName || 'EMPRESA EMISORA',
              rutReceptor: clientRutWithDash,
              razonSocialReceptor: clientName,
              fechaEmision,
              montoNeto,
              montoIva,
              montoExento,
              montoTotal,
              period: `${yearNum}-${formattedMonth}`
            });
          }

          // B: Resúmenes de Ventas (Boletas Electrónicas Tipo 39 o 41 del mes)
          const resumenesVentas = dataVentas?.ventas?.resumenes || dataVentas?.resumenes || dataVentas?.ventas?.resumen || [];
          for (const resItem of resumenesVentas) {
            const tipoDte = Number(resItem.tipoDte || resItem.tipoDTE || 0);
            const totalDocs = Number(resItem.totalDocumentos || resItem.totalDocs || resItem.cantidadDocumentos || 0);
            const montoTotal = Number(resItem.montoTotal || resItem.total || 0);
            if (totalDocs > 0 || montoTotal > 0) {
              const hasIndividualDocs = detalleVentas.some((d: any) => Number(d.tipoDTE || d.tipoDte) === tipoDte);
              if (!hasIndividualDocs) {
                const montoNeto = Number(resItem.montoNeto || resItem.neto || 0);
                const montoIva = Number(resItem.ivaRecuperable ?? resItem.montoIva ?? resItem.iva ?? 0);
                const montoExento = Number(resItem.montoExento || resItem.exento || 0);
                docs.push({
                  tipoRegistro: 'Venta',
                  tipoDocumento: String(tipoDte || '39'),
                  tipoDoc: String(tipoDte || '39'),
                  nombreTipoDoc: resItem.tipoDteString || (tipoDte === 39 ? 'Boleta Electrónica (Resumen Mensual)' : tipoDte === 41 ? 'Boleta Exenta Electrónica' : 'Resumen DTE'),
                  folio: `RESUMEN-${totalDocs}DOCS`,
                  rutEmisor: cleanCompanyRutWithDash,
                  razonSocialEmisor: companyName || 'EMPRESA EMISORA',
                  rutReceptor: '66.666.666-6',
                  razonSocialReceptor: `Clientes Varios (${totalDocs} Boletas)`,
                  fechaEmision: `${yearNum}-${formattedMonth}-28`,
                  montoNeto,
                  montoIva,
                  montoExento,
                  montoTotal,
                  period: `${yearNum}-${formattedMonth}`,
                  isBoletaResumen: true,
                  totalDocumentos: totalDocs
                });
              }
            }
          }
        } else {
          const errTxt = await ventasRes.text();
          apiErrors.push(`Ventas (${ventasRes.status}): ${errTxt.slice(0, 120)}`);
        }
      } catch (errV: any) {
        apiErrors.push(`Ventas error: ${errV.message}`);
      }
    }

    })());
    tareas.push((async () => {
    // B. Compras
    if (tipo === 'ALL' || tipo === 'COMPRAS' || tipo === 'COMPRA') {
      try {
        const formDataCompras = new FormData();
        formDataCompras.append('input', JSON.stringify(rcvInputPayload));

        const comprasRes = await fetch(`https://servicios.simpleapi.cl/api/RCV/compras/${formattedMonth}/${yearNum}`, {
          method: 'POST',
          headers,
          body: formDataCompras,
          signal: AbortSignal.timeout(60000)
        });

        if (comprasRes.ok) {
          const dataCompras: any = await comprasRes.json();
          const detalleCompras = dataCompras?.compras?.detalleCompras || dataCompras?.detalleCompras || [];
          for (const item of detalleCompras) {
            const tipoDte = String(item.tipoDTE || item.tipoDte || item.tipoDoc || '33');
            const folio = String(item.folio || '0');
            const fechaEmisionRaw = item.fechaEmision || item.fecha || `${yearNum}-${formattedMonth}-01`;
            const fechaEmision = fechaEmisionRaw.includes('T') ? fechaEmisionRaw.split('T')[0] : fechaEmisionRaw;
            const montoNeto = Number(item.montoNeto || 0);
            const montoIva = Number(item.montoIvaRecuperable ?? item.montoIva ?? 0);
            const montoExento = Number(item.montoExento || 0);
            const montoTotal = Number(item.montoTotal || (montoNeto + montoIva + montoExento));

            docs.push({
              tipoRegistro: 'Compra',
              tipoDocumento: tipoDte,
              tipoDoc: tipoDte,
              nombreTipoDoc: item.tipoDTEString || item.tipoDocString || (tipoDte === '33' ? 'Factura Electrónica' : tipoDte === '34' ? 'Factura Exenta' : tipoDte === '61' ? 'Nota de Crédito' : 'DTE Compra'),
              folio,
              rutEmisor: item.rutProveedor || item.rutEmisor || '76.000.000-0',
              razonSocialEmisor: item.razonSocial || item.razonSocialEmisor || item.razonSocialProveedor || 'PROVEEDOR DTE',
              rutReceptor: cleanCompanyRutWithDash,
              razonSocialReceptor: companyName || 'EMPRESA RECEPTORA',
              fechaEmision,
              montoNeto,
              montoIva,
              montoExento,
              montoTotal,
              period: `${yearNum}-${formattedMonth}`
            });
          }
        } else {
          const errTxt = await comprasRes.text();
          apiErrors.push(`Compras (${comprasRes.status}): ${errTxt.slice(0, 120)}`);
        }
      } catch (errC: any) {
        apiErrors.push(`Compras error: ${errC.message}`);
      }
    }

    })());
    tareas.push((async () => {
    // C. Boletas de Honorarios (BHR)
    if (tipo === 'ALL' || tipo === 'HONORARIOS' || tipo === 'HONORARIO') {
      try {
        const formDataBhr = new FormData();
        formDataBhr.append('input', JSON.stringify(rcvInputPayload));

        const bhrRes = await fetch(`https://servicios.simpleapi.cl/api/RCV/honorarios/${formattedMonth}/${yearNum}`, {
          method: 'POST',
          headers,
          body: formDataBhr,
          signal: AbortSignal.timeout(60000)
        });

        if (bhrRes.ok) {
          const dataBhr: any = await bhrRes.json();
          const detalleBhr = dataBhr?.honorarios?.detalleHonorarios || dataBhr?.detalleHonorarios || [];
          for (const item of detalleBhr) {
            const folio = String(item.folio || '0');
            const fechaEmisionRaw = item.fechaEmision || item.fecha || `${yearNum}-${formattedMonth}-01`;
            const fechaEmision = fechaEmisionRaw.includes('T') ? fechaEmisionRaw.split('T')[0] : fechaEmisionRaw;
            const montoBruto = Number(item.montoBruto || item.bruto || 0);
            const retencion = Number(item.retencion || item.montoRetencion || 0);
            const montoLiquido = Number(item.montoLiquido || item.liquido || (montoBruto - retencion));

            docs.push({
              tipoRegistro: 'Honorario',
              tipoDocumento: 'BH',
              tipoDoc: 'BH',
              nombreTipoDoc: 'Boleta de Honorarios Electrónica',
              folio,
              rutEmisor: item.rutEmisor || item.rutPrestador || '12.345.678-9',
              razonSocialEmisor: item.razonSocialEmisor || item.nombrePrestador || 'PROFESIONAL INDEPENDIENTE',
              rutReceptor: cleanCompanyRutWithDash,
              razonSocialReceptor: companyName || 'EMPRESA RECEPTORA',
              fechaEmision,
              montoNeto: montoLiquido,
              montoIva: retencion,
              montoExento: 0,
              montoTotal: montoBruto,
              period: `${yearNum}-${formattedMonth}`
            });
          }
        }
      } catch (errH: any) {
        console.warn("Honorarios error:", errH);
      }
    }
    })());

    // Las tres consultas van en paralelo: el tiempo total es el de la más lenta, no la suma.
    await Promise.all(tareas);
    console.log(`[rescatar-rcv] ${cleanCompanyRutWithDash} ${yearNum}-${formattedMonth}: ${docs.length} docs en ${Date.now() - inicio} ms`);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: true,
      count: docs.length,
      documents: docs,
      source: 'SIMPLE_API_SII_LIVE',
      period: `${yearNum}-${formattedMonth}`,
      apiErrors: apiErrors.length > 0 ? apiErrors : undefined
    }));
  } catch (error: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: false,
      error: `Error interno al procesar rescate SII: ${error.message}`
    }));
  }
}
