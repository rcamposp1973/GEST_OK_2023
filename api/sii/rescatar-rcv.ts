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

function getEncryptionKey(): Buffer {
  const rawKey = process.env.SECRETS_ENCRYPTION_KEY;
  if (!rawKey) {
    throw new Error("Falta configurar SECRETS_ENCRYPTION_KEY en el servidor.");
  }
  return crypto.createHash('sha256').update(rawKey).digest();
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
    const {
      year,
      month,
      tipo = 'ALL',
      apiKey,
      provider = 'SIMPLE_API',
      rutEmpresa,
      rutRepresentante,
      claveRepresentante,
      claveCertificadoDigital,
      certificadoB64,
      companyRut,
      companyName,
      companyId,
      siiApiUrl
    } = body;

    // SSRF Check
    if (siiApiUrl && typeof siiApiUrl === 'string' && siiApiUrl.trim().length > 0) {
      const urlCheck = validateSiiApiUrl(siiApiUrl.trim());
      if (!urlCheck.valid) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: `URL rechazada: ${urlCheck.error}` }));
        return;
      }
    }

    // Cargar secretos de servidor si no se envían
    let activeCertB64 = certificadoB64;
    let activeCertPass = claveCertificadoDigital || claveRepresentante;
    let activeRepRut = rutRepresentante;

    if ((!activeCertB64 || !activeCertPass) && companyId) {
      const secrets = await getDecryptedCompanySecrets(companyId);
      if (secrets) {
        if (decodedToken?.role !== 'SUPER_USER' && secrets.studyId !== decodedToken?.studyId) {
          res.statusCode = 403;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: "No tienes permisos sobre las credenciales de esta empresa." }));
          return;
        }
        if (!activeCertB64) activeCertB64 = secrets.certificadoB64;
        if (!activeCertPass) activeCertPass = secrets.claveCertificadoDigital || secrets.claveRepresentante;
        if (!activeRepRut) activeRepRut = secrets.rutRepresentante;
      }
    }

    const cleanCompanyRut = (rutEmpresa || companyRut || '').replace(/[^0-9kK]/g, '').toUpperCase();
    const cleanRepRut = (activeRepRut || '').replace(/[^0-9kK]/g, '').toUpperCase();
    const yearNum = Number(year) || new Date().getFullYear();

    const formatRut = (raw: string) => {
      if (!raw || raw.length < 2) return '';
      const bodyPart = raw.slice(0, -1);
      const dvPart = raw.slice(-1);
      return `${bodyPart}-${dvPart}`;
    };

    const cleanCompanyRutWithDash = formatRut(cleanCompanyRut);
    const cleanRepRutWithDash = formatRut(cleanRepRut);

    const MASTER_SII_API_KEY = process.env.SII_API_KEY || '';
    const effectiveApiKey = (apiKey || MASTER_SII_API_KEY).trim();

    if (!effectiveApiKey) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: false,
        error: "Error de configuración: Variable de entorno SII_API_KEY no configurada en el servidor."
      }));
      return;
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
    const ambienteNum = (body.ambiente === 'SANDBOX' || body.ambiente === 'Certificación' || body.ambiente === 0) ? 0 : 1;
    const headers = { 'Authorization': effectiveApiKey };

    const rcvInputPayload = {
      RutEmpresa: cleanCompanyRutWithDash,
      RutCertificado: cleanRepRutWithDash || cleanCompanyRutWithDash,
      Ambiente: ambienteNum,
      Password: certPass,
      CertificadoB64: cleanCertB64
    };

    let apiErrors: string[] = [];

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
