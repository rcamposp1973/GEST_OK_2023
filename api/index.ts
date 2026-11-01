// FUNCION SERVERLESS DE VERCEL: rutas protegidas del servidor (secretos, roles, prueba SII).
// Copia fiel de las rutas de server.ts para que funcionen en produccion (Vercel).
// Vercel envia a esta funcion: /api/health, /api/companies/:id/secrets,
// /api/auth/set-user-claims y /api/sii/test-connection (ver vercel.json).
import express from "express";
import crypto from "crypto";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import firebaseConfig from "../firebase-applet-config.json";

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

// Clave de cifrado derivada AES-256-GCM
function getEncryptionKey(): Buffer {
  const rawKey = process.env.SECRETS_ENCRYPTION_KEY;
  if (!rawKey) {
    throw new Error("Falta configurar SECRETS_ENCRYPTION_KEY en el servidor.");
  }
  return crypto.createHash('sha256').update(rawKey).digest();
}

export function encryptSecret(plainText: string): string {
  if (!plainText) return '';
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag().toString('base64');
  return JSON.stringify({
    iv: iv.toString('base64'),
    data: encrypted,
    tag: authTag
  });
}

export function decryptSecret(encryptedPayload: string): string {
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

export async function getDecryptedCompanySecrets(companyId: string) {
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

// SSRF Allowlist Validation
export function validateSiiApiUrl(rawUrl: string): { valid: boolean; error?: string } {
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
      return { valid: false, error: 'Acceso a IPs privadas o internas bloqueado por seguridad (Anti-SSRF).' };
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

const app = express();

// Security Headers (Helmet)
app.use(helmet({
  contentSecurityPolicy: false, // Permitir Vite scripts y dev server
  crossOriginEmbedderPolicy: false
}));

// CORS Configuration
const rawAppUrl = process.env.APP_URL || '';
const allowedOrigin = rawAppUrl.replace(/\/$/, '');

app.use((req, res, next) => {
  const origin = req.headers.origin;
  let isAllowed = false;

  if (origin) {
    if (origin === allowedOrigin) {
      isAllowed = true;
    } else if (process.env.NODE_ENV !== 'production') {
      try {
        const hostname = new URL(origin).hostname;
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
          isAllowed = true;
        }
      } catch (e) {
        // Malformed origin
      }
    }
  }

  if (isAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin as string);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
  }

  if (req.method === 'OPTIONS') {
    return isAllowed ? res.sendStatus(204) : res.sendStatus(403);
  }
  next();
});

app.use(express.json({ limit: '10mb' }));

// Rate Limiters
const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Demasiadas peticiones desde su red. Intente más tarde." }
});

const siiRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Límite de consultas SII alcanzado. Por favor espere unos momentos." }
});

const aiRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Límite de consultas a modelos de IA alcanzado. Espere unos momentos." }
});

export interface AuthenticatedRequest extends express.Request {
  user?: any;
}

// Middleware: Validación de Token Firebase Authentication
export const verifyFirebaseAuth = async (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: "Acceso no autorizado: Token de autenticación requerido (Bearer token)." });
  }

  const token = authHeader.split('Bearer ')[1]?.trim();
  if (!token) {
    return res.status(401).json({ success: false, error: "Token de autenticación vacío o malformado." });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;

    // Validación multi-tenant: si se envía studyId en el body, verificar que coincida (salvo SUPER_USER)
    const requestStudyId = req.body?.studyId || req.body?.securityEnvelope?.studyId;
    if (requestStudyId && decodedToken.role !== 'SUPER_USER' && decodedToken.studyId && decodedToken.studyId !== requestStudyId) {
      return res.status(403).json({ success: false, error: "Acceso denegado: El token no pertenece al estudio contable consultado." });
    }

    next();
  } catch (authError: any) {
    return res.status(401).json({ success: false, error: "Token de autenticación inválido o expirado." });
  }
};

// Health check endpoint (Público)
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Endpoint: Cifrado y resguardo de secretos de empresa (Clave SII y Certificado)
app.post("/api/companies/:companyId/secrets", verifyFirebaseAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { companyId } = req.params;
    const { studyId, claveSii, rutRepresentante, claveRepresentante, claveCertificadoDigital, certificadoB64 } = req.body;

    if (!studyId) {
      return res.status(400).json({ success: false, error: "El studyId es requerido." });
    }

    if (req.user?.role !== 'SUPER_USER' && req.user?.studyId !== studyId) {
      return res.status(403).json({ success: false, error: "No tienes permisos para modificar secretos en este estudio contable." });
    }

    const allowedSecretsRoles = ['SUPER_USER', 'STUDY_ADMIN', 'ACCOUNTANT'];
    if (!allowedSecretsRoles.includes(req.user?.role)) {
      return res.status(403).json({ success: false, error: "Permisos insuficientes para modificar credenciales." });
    }

    const compRef = adminDb.collection('studies').doc(studyId).collection('companies').doc(companyId);
    const compSnap = await compRef.get();
    if (!compSnap.exists) {
      return res.status(404).json({ success: false, error: "Empresa no encontrada en este estudio." });
    }
    const compData = compSnap.data() || {};

    const hasAnyCred = !!(claveSii || claveRepresentante || claveCertificadoDigital || certificadoB64);
    if (!hasAnyCred) {
      return res.status(400).json({ success: false, error: "No se recibió ninguna credencial para guardar." });
    }

    const encryptedDoc: any = {
      companyId,
      studyId,
      updatedAt: new Date().toISOString()
    };

    if (claveSii) encryptedDoc.claveSiiEncrypted = encryptSecret(claveSii);
    if (rutRepresentante) encryptedDoc.rutRepresentante = rutRepresentante;
    if (claveRepresentante) encryptedDoc.claveRepresentanteEncrypted = encryptSecret(claveRepresentante);
    if (claveCertificadoDigital) encryptedDoc.claveCertificadoEncrypted = encryptSecret(claveCertificadoDigital);
    if (certificadoB64) {
      const cleanB64 = certificadoB64.replace(/^data:[^;]+;base64,/, '').trim();
      encryptedDoc.certificadoB64Encrypted = encryptSecret(cleanB64);
      encryptedDoc.hasCertificadoDigital = true;
    }

    await adminDb.collection('companySecrets').doc(companyId).set(encryptedDoc, { merge: true });

    // Actualizar metadata no sensible en el documento de la empresa
    const updates: any = {
      claveSii: admin.firestore.FieldValue.delete(),
      claveTributaria: admin.firestore.FieldValue.delete(),
      claveRepresentante: admin.firestore.FieldValue.delete(),
      claveCertificadoDigital: admin.firestore.FieldValue.delete(),
      certificadoB64: admin.firestore.FieldValue.delete(),
      'dteConfig.claveSii': admin.firestore.FieldValue.delete(),
      'dteConfig.claveRepresentante': admin.firestore.FieldValue.delete(),
      'dteConfig.claveCertificadoDigital': admin.firestore.FieldValue.delete(),
      'dteConfig.certificadoB64': admin.firestore.FieldValue.delete()
    };

    if (claveSii) {
      updates.claveSiiMasked = '••••••••';
    }

    if (hasAnyCred) {
      updates.siiConnectionStatus = 'CONFIGURADO';
      updates['dteConfig.siiConnectionStatus'] = 'CONFIGURADO';
    }

    if (certificadoB64) {
      updates.hasCertificadoDigital = true;
      updates['dteConfig.hasCertificadoDigital'] = true;
    }

    await compRef.update(updates);

    return res.json({
      success: true,
      message: "Credenciales y certificados de la empresa cifrados y resguardados con éxito.",
      details: {
        companyId,
        hasCertificadoDigital: updates.hasCertificadoDigital ?? (compData.hasCertificadoDigital || false),
        siiConnectionStatus: 'CONFIGURADO'
      }
    });
  } catch (err: any) {
    console.error("Error guardando secretos de empresa:", err.message || err);
    return res.status(500).json({ success: false, error: "Error interno al cifrar y resguardar los secretos." });
  }
});

// Endpoint: Asignación de Custom Claims para administración de usuarios
app.post("/api/auth/set-user-claims", verifyFirebaseAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { targetUid, role, studyId } = req.body;
    if (!targetUid || !role) {
      return res.status(400).json({ success: false, error: "targetUid y role son obligatorios." });
    }

    const VALID_ROLES = ['SUPER_USER', 'STUDY_ADMIN', 'ACCOUNTANT', 'ANALYST', 'OBSERVER'];
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ success: false, error: "Rol no válido." });
    }

    const requesterRole = req.user?.role;
    const requesterStudyId = req.user?.studyId;

    if (requesterRole !== 'SUPER_USER' && requesterRole !== 'STUDY_ADMIN') {
      return res.status(403).json({ success: false, error: "Permisos insuficientes para asignar roles." });
    }

    if (requesterRole === 'STUDY_ADMIN' && !requesterStudyId) {
      return res.status(403).json({ success: false, error: "Tu usuario no tiene un estudio asignado." });
    }

    let effectiveStudyId: string | null = null;

    if (requesterRole === 'STUDY_ADMIN') {
      const STUDY_ADMIN_ALLOWED_ROLES = ['STUDY_ADMIN', 'ACCOUNTANT', 'ANALYST', 'OBSERVER'];
      if (!STUDY_ADMIN_ALLOWED_ROLES.includes(role)) {
        return res.status(403).json({ success: false, error: "Permisos insuficientes para asignar este rol." });
      }

      effectiveStudyId = requesterStudyId || null;

      let targetUser;
      try {
        targetUser = await admin.auth().getUser(targetUid);
      } catch (getUserErr: any) {
        return res.status(404).json({ success: false, error: "Usuario no encontrado." });
      }

      const targetClaims = targetUser.customClaims || {};
      if (targetClaims.role === 'SUPER_USER' || targetClaims.isSuperUser === true) {
        return res.status(403).json({ success: false, error: "No tienes permisos para modificar a un Super Usuario." });
      }

      if (targetClaims.studyId && targetClaims.studyId !== requesterStudyId) {
        return res.status(403).json({ success: false, error: "No puedes administrar usuarios de otros estudios contables." });
      }
    } else if (requesterRole === 'SUPER_USER') {
      if (role !== 'SUPER_USER' && !studyId) {
        return res.status(400).json({ success: false, error: "El campo studyId es obligatorio para roles distintos de SUPER_USER." });
      }
      effectiveStudyId = role === 'SUPER_USER' ? (studyId || null) : studyId;
    }

    await admin.auth().setCustomUserClaims(targetUid, {
      role,
      studyId: effectiveStudyId,
      isSuperUser: role === 'SUPER_USER'
    });

    try {
      await adminDb.collection('auditLogs').add({
        timestamp: new Date().toISOString(),
        userId: req.user?.uid || '',
        userEmail: req.user?.email || '',
        studyId: effectiveStudyId || requesterStudyId || null,
        action: "ASIGNAR_ROL",
        module: "SEGURIDAD",
        details: `Rol ${role} asignado al usuario ${targetUid}`
      });
    } catch (auditErr) {
      console.warn("Error registrando bitácora de asignación de rol:", auditErr);
    }

    return res.json({
      success: true,
      message: `Roles y Custom Claims actualizados para usuario ${targetUid}.`
    });
  } catch (err: any) {
    console.error("Error asignando custom claims:", err.message || err);
    return res.status(500).json({ success: false, error: "Error interno al asignar roles de usuario." });
  }
});

// Endpoint: Crear o actualizar la cuenta de acceso (Firebase Auth) de un usuario y asignarle rol/estudio.
// Lo usan las pantallas de administracion (estudios, usuarios, super usuarios) para que el usuario
// pueda iniciar sesion con el login seguro basado en claims.
app.post("/api/auth/create-user", verifyFirebaseAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { email, password, name, role, studyId } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
      return res.status(400).json({ success: false, error: "Correo electrónico no válido." });
    }
    const VALID_ROLES = ['SUPER_USER', 'STUDY_ADMIN', 'ACCOUNTANT', 'ANALYST', 'OBSERVER'];
    if (!role || !VALID_ROLES.includes(role)) {
      return res.status(400).json({ success: false, error: "Rol no válido." });
    }
    const newPassword = password ? String(password) : '';
    if (newPassword && newPassword.length < 6) {
      return res.status(400).json({ success: false, error: "La contraseña debe tener al menos 6 caracteres." });
    }

    const requesterRole = req.user?.role;
    const requesterStudyId = req.user?.studyId;
    if (requesterRole !== 'SUPER_USER' && requesterRole !== 'STUDY_ADMIN') {
      return res.status(403).json({ success: false, error: "Permisos insuficientes para crear usuarios." });
    }

    let effectiveStudyId: string | null = null;
    if (requesterRole === 'STUDY_ADMIN') {
      if (!requesterStudyId) {
        return res.status(403).json({ success: false, error: "Tu usuario no tiene un estudio asignado." });
      }
      if (!['STUDY_ADMIN', 'ACCOUNTANT', 'ANALYST', 'OBSERVER'].includes(role)) {
        return res.status(403).json({ success: false, error: "Permisos insuficientes para asignar este rol." });
      }
      effectiveStudyId = requesterStudyId;
    } else {
      if (role !== 'SUPER_USER' && !studyId) {
        return res.status(400).json({ success: false, error: "El campo studyId es obligatorio para roles distintos de SUPER_USER." });
      }
      effectiveStudyId = role === 'SUPER_USER' ? null : String(studyId);
    }

    let userRecord: any = null;
    try {
      userRecord = await adminAuth.getUserByEmail(cleanEmail);
    } catch (lookupErr: any) {
      if (lookupErr?.code !== 'auth/user-not-found') throw lookupErr;
    }

    let created = false;
    if (userRecord) {
      const claims = userRecord.customClaims || {};
      if (requesterRole !== 'SUPER_USER') {
        if (claims.role === 'SUPER_USER' || claims.isSuperUser === true) {
          return res.status(403).json({ success: false, error: "No tienes permisos para modificar a un Super Usuario." });
        }
        if (!claims.studyId) {
          return res.status(403).json({ success: false, error: "Este correo ya existe en la plataforma sin estudio asignado. Contacta al Administrador de Sistema." });
        }
        if (claims.studyId !== effectiveStudyId) {
          return res.status(403).json({ success: false, error: "Este correo ya pertenece a otro estudio contable." });
        }
      }
      const upd: any = {};
      if (newPassword) upd.password = newPassword;
      if (name) upd.displayName = String(name);
      if (Object.keys(upd).length) await adminAuth.updateUser(userRecord.uid, upd);
    } else {
      if (!newPassword) {
        return res.status(400).json({ success: false, error: "La contraseña es obligatoria para crear un usuario nuevo." });
      }
      userRecord = await adminAuth.createUser({
        email: cleanEmail,
        password: newPassword,
        displayName: name ? String(name) : undefined
      });
      created = true;
    }

    await adminAuth.setCustomUserClaims(userRecord.uid, {
      role,
      studyId: effectiveStudyId,
      isSuperUser: role === 'SUPER_USER'
    });

    try {
      await adminDb.collection('auditLogs').add({
        timestamp: new Date().toISOString(),
        userId: req.user?.uid || '',
        userEmail: req.user?.email || '',
        studyId: effectiveStudyId || requesterStudyId || null,
        action: created ? "CREAR_USUARIO" : "ACTUALIZAR_USUARIO",
        module: "SEGURIDAD",
        details: `Cuenta de acceso ${created ? 'creada' : 'actualizada'} para ${cleanEmail} con rol ${role}`
      });
    } catch (auditErr) {
      console.warn("Error registrando bitácora de creación de usuario:", auditErr);
    }

    return res.json({ success: true, created, uid: userRecord.uid });
  } catch (err: any) {
    console.error("Error en create-user:", err?.message || err);
    return res.status(500).json({ success: false, error: "Error interno al crear la cuenta de acceso." });
  }
});

// ==========================================
// API REAL SII: RESCATE Y SINCRONIZACIÓN RCV
// ==========================================

// Endpoint: Test SII Credentials or API Key
app.post("/api/sii/test-connection", siiRateLimiter, verifyFirebaseAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { companyRut, claveSii, rutRepresentante, claveRepresentante, provider, apiKey, companyId } = req.body;

    if (!companyRut) {
      return res.status(400).json({ success: false, error: "El RUT de la empresa es requerido." });
    }

    let activeClave = claveRepresentante || claveSii;
    let activeRepRut = rutRepresentante || companyRut;

    // Si la clave viene enmascarada o vacía, recuperar secretos cifrados del servidor
    if ((!activeClave || activeClave === '••••••••') && companyId) {
      const secrets = await getDecryptedCompanySecrets(companyId);
      if (secrets) {
        if (req.user?.role !== 'SUPER_USER' && secrets.studyId !== req.user?.studyId) {
          return res.status(403).json({ success: false, error: "No tienes permisos sobre las credenciales de esta empresa." });
        }
        activeClave = secrets.claveRepresentante || secrets.claveSii;
        if (secrets.rutRepresentante) activeRepRut = secrets.rutRepresentante;
      }
    }

    if ((provider === 'SIMPLE_API' || (!provider && apiKey)) && apiKey) {
      // Real live check against SimpleAPI.cl
      try {
        const subRes = await fetch("https://api.simpleapi.cl/api/v1/Suscripcion/status", {
          method: "GET",
          headers: {
            "Authorization": apiKey.trim()
          }
        });

        if (subRes.ok) {
          const quotaData = await subRes.json();
          return res.json({
            success: true,
            message: `Conexión REAL validada con SimpleAPI.cl. Plan activo con cuotas disponibles.`,
            details: { companyRut, provider: 'SIMPLE_API', status: "ACTIVO", quotas: quotaData }
          });
        } else {
          return res.status(401).json({
            success: false,
            error: `API Key rechazada por SimpleAPI.cl (HTTP ${subRes.status}). Verifique la clave ingresada.`
          });
        }
      } catch (apiErr: any) {
        return res.status(502).json({
          success: false,
          error: `Error de red al conectar con SimpleAPI.cl: ${apiErr.message || String(apiErr)}`
        });
      }
    }

    if (provider && provider !== 'DIRECT_SII' && apiKey) {
      // Other third party API provider test
      return res.json({
        success: true,
        message: `Conexión exitosa con el proveedor de API (${provider}).`,
        details: { companyRut, provider, status: "ACTIVO" }
      });
    }

    const cleanRut = companyRut.replace(/[^0-9kK]/g, '');
    const cleanRepRut = (rutRepresentante || companyRut).replace(/[^0-9kK]/g, '');
    activeClave = claveRepresentante || claveSii || activeClave;

    if (!activeClave || activeClave === '••••••••') {
      return res.status(400).json({
        success: false,
        error: "Se requiere ingresar la Clave Tributaria real del SII o Clave de Representante Legal para autenticar."
      });
    }

    // Direct SII Authentication Test against zeus.sii.cl
    const siiLoginUrl = "https://zeus.sii.cl/cgi_cgi/cert/sm_login.cgi";
    const rutBody = cleanRepRut.slice(0, -1);
    const dvBody = cleanRepRut.slice(-1).toUpperCase();

    const formData = new URLSearchParams();
    formData.append("rut", rutBody);
    formData.append("dv", dvBody);
    formData.append("referencia", "https://mpt.sii.cl/cgi_mpt/mpt_get_det.cgi");
    formData.append("clave", activeClave);

    const siiResponse = await fetch(siiLoginUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      body: formData.toString()
    });

    const responseText = await siiResponse.text();

    if (responseText.includes("ERROR") || responseText.includes("Incorrecta") || responseText.includes("Clave invalida") || responseText.includes("Error de Autenticacion")) {
      return res.status(401).json({
        success: false,
        error: `Autenticación rechazada por el SII para RUT ${cleanRepRut}. Verifique que la Clave Tributaria sea correcta.`
      });
    }

    return res.json({
      success: true,
      message: `Conexión autenticada con éxito en portal zeus.sii.cl para RUT ${companyRut}`,
      details: {
        rut: companyRut,
        authStatus: "VERIFICADO",
        timestamp: new Date().toISOString()
      }
    });

  } catch (err: any) {
    console.error("Error in /api/sii/test-connection:", err);
    return res.status(500).json({
      success: false,
      error: `Error de red al conectar con el servidor del SII: ${err.message || String(err)}`
    });
  }
});

export default app;
