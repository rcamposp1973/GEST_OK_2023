// API propia de Gest_OK para el SII (sin intermediarios): entra al portal del SII con el RUT y la clave
// tributaria de la empresa (guardada cifrada) y lee:
//   - datos: los datos de la empresa en Mi SII (razón social, inicio de actividades, régimen, direcciones)
//   - rcv:   Registro de Compras y Ventas del mes (resumen + detalle) y boletas de honorarios recibidas
//   - f29:   F29 presentados del año (folio, fecha, monto, estado)
//
// Contratos del portal tomados de proyectos de código abierto con licencia MIT que los observaron en vivo:
// albertomarturelo/sii (docs/sii-contract: auth-login, rcv, bte, f29) y crilam/mcp-sii. Solo lectura:
// nunca declara, firma ni emite nada.
import type { IncomingMessage, ServerResponse } from 'http';
import crypto from 'crypto';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

// ─────────────────────────── Firebase (igual que rescatar-rcv) ───────────────────────────
const firebaseConfig = {
  projectId: process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0478013396',
  firestoreDatabaseId: process.env.FIREBASE_DATABASE_ID || 'ai-studio-gestor-0fa27d4a-5ce2-4999-afdb-eb28b01c6d8d'
};
function initAdmin() {
  if (getApps().length) return getApps()[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) {
    try { return initializeApp({ projectId: firebaseConfig.projectId, credential: cert(JSON.parse(raw)) }); }
    catch (e) { console.error('FIREBASE_SERVICE_ACCOUNT invalida:', (e as Error).message); }
  }
  return initializeApp({ projectId: firebaseConfig.projectId });
}
const adminApp = initAdmin();
const adminDb = getFirestore(adminApp, firebaseConfig.firestoreDatabaseId as any);
const adminAuth = getAuth(adminApp);

function getEncryptionKey(): Buffer {
  const rawKey = process.env.SECRETS_ENCRYPTION_KEY;
  if (rawKey) return crypto.createHash('sha256').update(rawKey).digest();
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  if (sa.private_key) return crypto.createHash('sha256').update('gest_ok/secretos-empresa/v1|' + sa.private_key).digest();
  throw new Error('Falta configurar SECRETS_ENCRYPTION_KEY en el servidor.');
}
function decryptSecret(payload: string): string {
  if (!payload) return '';
  try {
    const { iv, data, tag } = JSON.parse(payload);
    const d = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return d.update(data, 'base64', 'utf8') + d.final('utf8');
  } catch { return ''; }
}

// ─────────────────────────── Utilidades RUT ───────────────────────────
export function partirRut(rut: string): { cuerpo: string; dv: string; conPuntos: string; conGuion: string } {
  const limpio = (rut || '').replace(/[^0-9kK]/g, '').toUpperCase();
  const cuerpo = limpio.slice(0, -1).replace(/^0+/, '');
  const dv = limpio.slice(-1);
  const conPuntos = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + dv;
  return { cuerpo, dv, conPuntos, conGuion: `${cuerpo}-${dv}` };
}

// ─────────────────────────── Cookies ───────────────────────────
interface Galleta { nombre: string; valor: string; dominio: string; soloHost: boolean; ruta: string; expira: number }
export class Frasco {
  private g = new Map<string, Galleta>();
  aplicar(url: string, lineas: string[]) {
    const u = new URL(url);
    for (const linea of lineas) {
      const [par, ...attrs] = linea.split(';');
      const eq = par.indexOf('=');
      if (eq < 1) continue;
      const nombre = par.slice(0, eq).trim(), valor = par.slice(eq + 1).trim();
      let dominio = u.hostname.toLowerCase(), soloHost = true, ruta = '/', expira = -1, borrar = false;
      for (const a of attrs) {
        const i = a.indexOf('='); const k = (i < 0 ? a : a.slice(0, i)).trim().toLowerCase(); const v = i < 0 ? '' : a.slice(i + 1).trim();
        if (k === 'domain' && v) { dominio = v.replace(/^\./, '').toLowerCase(); soloHost = false; }
        else if (k === 'path' && v.startsWith('/')) ruta = v;
        else if (k === 'max-age') { const s = Number(v); if (Number.isFinite(s)) { if (s <= 0) borrar = true; else expira = Date.now() + s * 1000; } }
        else if (k === 'expires') { const ms = Date.parse(v); if (!Number.isNaN(ms)) { if (ms <= Date.now()) borrar = true; else expira = ms; } }
      }
      const id = `${nombre}|${dominio}|${ruta}`;
      if (!valor || borrar) { this.g.delete(id); continue; }
      this.g.set(id, { nombre, valor, dominio, soloHost, ruta, expira });
    }
  }
  cabecera(url: string): string {
    const u = new URL(url); const host = u.hostname.toLowerCase();
    return [...this.g.values()].filter(c =>
      (c.expira < 0 || c.expira > Date.now())
      && (c.soloHost ? host === c.dominio : (host === c.dominio || host.endsWith('.' + c.dominio)))
      && u.pathname.startsWith(c.ruta)
    ).map(c => `${c.nombre}=${c.valor}`).join('; ');
  }
  valor(nombre: string): string { for (const c of this.g.values()) if (c.nombre === nombre) return c.valor; return ''; }
}

// ─────────────────────────── Sesión HTTP con el SII ───────────────────────────
const NAVEGADOR = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  'accept-language': 'es-CL,es;q=0.9',
};
const LOGIN_HOST = 'zeusr.sii.cl';
const MI_SII = 'https://misiir.sii.cl/cgi_misii/siihome.cgi';
const LOGIN_PAGINA = `https://${LOGIN_HOST}/AUT2000/InicioAutenticacion/IngresoRutClave.html`;
const LOGIN_POST = `https://${LOGIN_HOST}/cgi_AUT2000/CAutInicio.cgi`;

export class ErrorSii extends Error { constructor(msg: string, public tipo: 'CLAVE' | 'SESION' | 'ESPERA' | 'PORTAL' = 'PORTAL') { super(msg); } }

interface Respuesta { url: string; status: number; tipo: string; texto: string }

function decodificar(buf: ArrayBuffer, tipo: string): string {
  const bytes = new Uint8Array(buf);
  let charset = /charset=([\w-]+)/i.exec(tipo)?.[1];
  if (!charset) {
    const cabeza = new TextDecoder('latin1').decode(bytes.slice(0, 2048));
    charset = /<meta[^>]+charset=["']?([\w-]+)/i.exec(cabeza)?.[1] || /<\?xml[^>]+encoding=["']([\w-]+)/i.exec(cabeza)?.[1] || 'utf-8';
  }
  try { return new TextDecoder(charset.toLowerCase()).decode(bytes); } catch { return new TextDecoder('utf-8').decode(bytes); }
}

export class SesionSii {
  frasco = new Frasco();
  async pedir(url: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<Respuesta> {
    let actual = url, metodo = init.method || 'GET', cuerpo = init.body, cab = { ...(init.headers || {}) };
    for (let salto = 0; salto <= 10; salto++) {
      const h = new Headers();
      for (const [k, v] of Object.entries({ ...NAVEGADOR, ...cab })) h.set(k, v);
      const galletas = this.frasco.cabecera(actual);
      if (galletas) h.set('cookie', galletas);
      const r = await fetch(actual, { method: metodo, headers: h, body: cuerpo, redirect: 'manual', signal: AbortSignal.timeout(45000) });
      this.frasco.aplicar(actual, (r.headers as any).getSetCookie?.() || []);
      const loc = r.headers.get('location');
      if (r.status >= 300 && r.status < 400 && loc) {
        const sig = new URL(loc, actual).toString();
        if (r.status === 303 || ((r.status === 301 || r.status === 302) && metodo === 'POST')) {
          metodo = 'GET'; cuerpo = undefined;
          cab = Object.fromEntries(Object.entries(cab).filter(([k]) => k.toLowerCase() !== 'content-type'));
        }
        actual = sig;
        continue;
      }
      const tipo = r.headers.get('content-type') || '';
      const texto = decodificar(await r.arrayBuffer(), tipo);
      // Sesión vencida: el SII responde una página chica que solo redirige por JS al login
      const stub = texto.length < 1500 && /location\.(replace|href)\s*\(?\s*['"]https?:\/\/zeusr\.sii\.cl/i.test(texto);
      return { url: stub ? LOGIN_PAGINA : actual, status: r.status, tipo, texto };
    }
    throw new ErrorSii('Demasiadas redirecciones del SII.');
  }
  private exigirSesion(r: Respuesta) {
    const h = new URL(r.url).hostname;
    if (h === LOGIN_HOST) throw new ErrorSii('La sesión del SII no quedó abierta (el SII pidió volver a ingresar).', 'SESION');
    if (h === 'salaespera.sii.cl') throw new ErrorSii('El SII está con alta demanda (sala de espera). Intenta en unos minutos.', 'ESPERA');
  }
  async json(url: string, body: any, referer: string): Promise<any> {
    const r = await this.pedir(url, { method: 'POST', body: JSON.stringify(body), headers: {
      'content-type': 'application/json', accept: 'application/json, text/plain, */*', origin: 'https://www4.sii.cl', referer } });
    this.exigirSesion(r);
    try { return JSON.parse(r.texto); }
    catch { throw new ErrorSii(`El SII respondió algo inesperado (${r.status}) en ${new URL(url).pathname.split('/').pop()}.`); }
  }
  async html(url: string): Promise<string> {
    const r = await this.pedir(url);
    this.exigirSesion(r);
    return r.texto;
  }
  get token() { return this.frasco.valor('TOKEN'); }

  /** Ingreso con RUT + clave tributaria (formulario clásico del SII, sin captcha). Un solo intento. */
  async ingresar(rut: string, clave: string): Promise<void> {
    const p = partirRut(rut);
    const destino = MI_SII;
    await this.pedir(`${LOGIN_PAGINA}?${destino}`);
    const form = new URLSearchParams({ rut: p.cuerpo, dv: p.dv, referencia: destino, '411': '', rutcntr: p.conPuntos, clave });
    const r = await this.pedir(LOGIN_POST, { method: 'POST', body: form.toString(), headers: {
      'content-type': 'application/x-www-form-urlencoded', origin: `https://${LOGIN_HOST}`, referer: `${LOGIN_PAGINA}?${destino}` } });
    if (new URL(r.url).hostname === 'salaespera.sii.cl') throw new ErrorSii('El SII está con alta demanda (sala de espera). Intenta en unos minutos.', 'ESPERA');
    const plano = r.texto.replace(/<[^>]+>/g, '\n').split('\n').map(l => l.trim()).filter(Boolean);
    const i = plano.findIndex(l => /El c[oó]digo de este mensaje/i.test(l));
    if (i > 0) throw new ErrorSii(`El SII rechazó el ingreso: ${plano[i - 1]}`, 'CLAVE');
    if (!this.token) throw new ErrorSii('El SII no abrió la sesión (no entregó el TOKEN). Revisa el RUT y la clave tributaria de la empresa.', 'CLAVE');
  }
}

// ─────────────────────────── Lectores ───────────────────────────
/** Extrae un objeto literal JS (`nombre = {...}`) del HTML, respetando llaves dentro de strings. */
export function extraerObjeto(html: string, nombre: string): any | null {
  const i = html.indexOf(nombre);
  if (i < 0) return null;
  const ini = html.indexOf('{', html.indexOf('=', i));
  if (ini < 0) return null;
  let prof = 0, enStr: string | null = null;
  for (let j = ini; j < html.length; j++) {
    const c = html[j];
    if (enStr) { if (c === '\\') j++; else if (c === enStr) enStr = null; continue; }
    if (c === '"' || c === "'") enStr = c;
    else if (c === '{') prof++;
    else if (c === '}' && --prof === 0) { try { return JSON.parse(html.slice(ini, j + 1)); } catch { return null; } }
  }
  return null;
}

/** Lee mapas JS en línea de las páginas antiguas del SII (`arr['k'] = "v";`, `formatMiles('123','.')`, `+= n`). */
export function leerMapa(html: string, nombre: string): Record<string, string> | null {
  const declarado = new RegExp(`\\b${nombre}\\s*=\\s*new\\s+Array\\s*\\(`).test(html);
  const re = new RegExp(`\\b${nombre}\\s*\\[\\s*(['"])([^'"]*)\\1\\s*\\]\\s*(\\+?)=(?!=)\\s*`, 'g');
  const fin = String.raw`[ \t]*(?:;|\r?\n|$)`;
  const COMILLAS = new RegExp(String.raw`^(['"])((?:\\.|(?!\1)[^\\])*)\1` + fin);
  const MILES = new RegExp(String.raw`^formatMiles\(\s*(['"])(-?\d+)\1\s*(?:,[^()]*)?\)` + fin);
  const NUM = new RegExp(String.raw`^(-?\d+(?:\.\d+)?)` + fin);
  const out: Record<string, string> = {}; let asignado = false;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    asignado = true;
    const resto = html.slice(re.lastIndex, re.lastIndex + 2048);
    const v = COMILLAS.exec(resto)?.[2]?.replace(/\\(.)/g, '$1') ?? MILES.exec(resto)?.[2] ?? NUM.exec(resto)?.[1];
    const k = m[2];
    if (m[3] !== '+') { if (v === undefined) delete out[k]; else out[k] = v; continue; }
    if (/^-?\d+$/.test(out[k] || '') && /^-?\d+$/.test(v || '')) out[k] = String(Number(out[k]) + Number(v)); else delete out[k];
  }
  return declarado || asignado ? out : null;
}

const fechaIso = (s: string) => { const m = /^(\d{2})[/-](\d{2})[/-](\d{4})/.exec(s || ''); return m ? `${m[3]}-${m[2]}-${m[1]}` : (s || '').slice(0, 10); };
const num = (v: any) => { const n = Number(String(v ?? '0').replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const uuid = () => crypto.randomUUID();
const NOMBRE_DTE: Record<string, string> = { '33': 'Factura Electrónica', '34': 'Factura Exenta Electrónica', '39': 'Boleta Electrónica', '41': 'Boleta Exenta Electrónica', '46': 'Factura de Compra Electrónica', '52': 'Guía de Despacho', '56': 'Nota de Débito Electrónica', '61': 'Nota de Crédito Electrónica', '110': 'Factura de Exportación', '914': 'Declaración de Ingreso (DIN)' };

/** Datos de la empresa desde Mi SII. */
export async function leerDatosEmpresa(s: SesionSii) {
  const html = await s.html(MI_SII);
  const d = extraerObjeto(html, 'DatosCntrNow');
  if (!d?.contribuyente) throw new ErrorSii('Mi SII no entregó los datos del contribuyente.');
  const c = d.contribuyente;
  return {
    rut: `${c.rut}-${c.dv}`,
    razonSocial: c.razonSocial || [c.nombres, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(' '),
    email: c.eMail || '',
    inicioActividades: (c.fechaInicioActividades || '').slice(0, 10),
    terminoGiro: c.fechaTerminoGiro ? String(c.fechaTerminoGiro).slice(0, 10) : '',
    fechaConstitucion: c.fechaConstitucion ? String(c.fechaConstitucion).slice(0, 10) : '',
    tipoContribuyente: c.tipoContribuyenteDescripcion || '',
    glosaActividad: c.glosaActividad || '',
    unidadOperativa: c.unidadOperativaDescripcion || '',
    f29Dia20: c.autorizadoDeclararDia20 === 'S',
    direcciones: (d.direcciones || []).map((x: any) => [x.calle, x.numero, x.bloque, x.departamento, x.villaPoblacion, x.comunaDescripcion, x.regionDescripcion].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()).filter(Boolean),
    atributos: (d.atributos || []).filter((a: any) => !a.fechaTermino && !a.eliminado && a.atrCodigo !== 'NOTI')
      .map((a: any) => ({ codigo: a.atrCodigo, descripcion: a.descAtrCodigo || '', desde: a.fechaInicio || '' })),
  };
}

const RCV_BASE = 'https://www4.sii.cl/consdcvinternetui/services/data/facadeService';
const RCV_NS = 'cl.sii.sdi.lob.diii.consdcv.data.api.interfaces.FacadeService';
const RCV_REF = 'https://www4.sii.cl/consdcvinternetui/';

async function rcvPedir(s: SesionSii, op: string, data: any) {
  const r = await s.json(`${RCV_BASE}/${op}`, { metaData: { namespace: `${RCV_NS}/${op}`, conversationId: s.token, transactionId: uuid(), page: null }, data }, RCV_REF);
  const cod = r?.respEstado?.codRespuesta;
  if (cod === 3) return [];                     // consulta válida sin movimientos
  if (cod !== undefined && cod !== 0) throw new ErrorSii(`El SII rechazó la consulta del RCV: ${r?.respEstado?.msgeRespuesta || r?.respEstado?.codError || cod}`);
  return Array.isArray(r?.data) ? r.data : Array.isArray(r?.datos) ? r.datos : [];
}

/** RCV de un mes (compras y ventas) en el mismo formato que usa la importación de Gest_OK. */
export async function leerRcv(s: SesionSii, rutEmpresa: string, nombreEmpresa: string, anio: number, mes: number, lado: 'COMPRA' | 'VENTA') {
  const p = partirRut(rutEmpresa);
  const periodo = `${anio}-${String(mes).padStart(2, '0')}`;
  const base = { rutEmisor: p.cuerpo, dvEmisor: p.dv, ptributario: `${anio}${String(mes).padStart(2, '0')}`, estadoContab: 'REGISTRO', operacion: lado, busquedaInicial: true };
  const resumen = await rcvPedir(s, 'getResumen', base);
  const docs: any[] = [];
  for (const fila of resumen) {
    const tipo = String(fila.rsmnTipoDocInteger ?? fila.codTipoDoc ?? fila.tipoDoc ?? '');
    const totalDocs = num(fila.rsmnTotDoc ?? fila.totDoctos);
    if (!tipo || totalDocs === 0) continue;
    let detalle: any[] = [];
    // Boletas (39/41) y algunos resúmenes no tienen detalle por documento: se registran como resumen del mes
    if (!['39', '41', '48'].includes(tipo)) {
      detalle = await rcvPedir(s, lado === 'COMPRA' ? 'getDetalleCompra' : 'getDetalleVenta',
        { ...base, codTipoDoc: Number(tipo), accionRecaptcha: lado === 'COMPRA' ? 'RCV_DETC' : 'RCV_DETV', tokenRecaptcha: 't-o-k-e-n-web' });
    }
    if (detalle.length) {
      for (const d of detalle) {
        const contra = d.detRutDoc ? `${d.detRutDoc}-${d.detDvDoc}` : '';
        const neto = num(d.detMntNeto), iva = num(d.detMntIVA), exe = num(d.detMntExe);
        docs.push({
          tipoRegistro: lado === 'COMPRA' ? 'Compra' : 'Venta',
          tipoDocumento: tipo, tipoDoc: tipo, nombreTipoDoc: fila.dcvNombreTipoDoc || NOMBRE_DTE[tipo] || `DTE ${tipo}`,
          folio: String(d.detNroDoc ?? d.nroDoc ?? ''),
          rutEmisor: lado === 'COMPRA' ? contra : p.conGuion,
          razonSocialEmisor: lado === 'COMPRA' ? (d.detRznSoc || '') : nombreEmpresa,
          rutReceptor: lado === 'COMPRA' ? p.conGuion : contra,
          razonSocialReceptor: lado === 'COMPRA' ? nombreEmpresa : (d.detRznSoc || ''),
          fechaEmision: fechaIso(d.detFchDoc), montoNeto: neto, montoIva: iva, montoExento: exe,
          montoTotal: num(d.detMntTotal) || neto + iva + exe, period: periodo, origenDocumento: 'RCV_SII_PROPIO',
        });
      }
    } else {
      const neto = num(fila.rsmnMntNeto), iva = num(fila.rsmnMntIVA), exe = num(fila.rsmnMntExe);
      docs.push({
        tipoRegistro: lado === 'COMPRA' ? 'Compra' : 'Venta',
        tipoDocumento: tipo, tipoDoc: tipo, nombreTipoDoc: `${fila.dcvNombreTipoDoc || NOMBRE_DTE[tipo] || 'DTE'} (resumen mensual)`,
        folio: `RESUMEN-${totalDocs}DOCS`,
        rutEmisor: lado === 'VENTA' ? p.conGuion : '66666666-6', razonSocialEmisor: lado === 'VENTA' ? nombreEmpresa : 'Varios',
        rutReceptor: lado === 'VENTA' ? '66666666-6' : p.conGuion, razonSocialReceptor: lado === 'VENTA' ? `Clientes varios (${totalDocs} documentos)` : nombreEmpresa,
        fechaEmision: `${periodo}-${new Date(anio, mes, 0).getDate()}`, montoNeto: neto, montoIva: iva, montoExento: exe,
        montoTotal: num(fila.rsmnMntTotal) || neto + iva + exe, period: periodo, origenDocumento: 'RCV_SII_PROPIO',
      });
    }
  }
  return docs;
}

/** Boletas de honorarios recibidas del mes (requiere sesión de la propia empresa). */
export async function leerHonorariosRecibidos(s: SesionSii, rutEmpresa: string, nombreEmpresa: string, anio: number, mes: number) {
  const p = partirRut(rutEmpresa);
  const mm = String(mes).padStart(2, '0');
  const docs: any[] = []; const vistos = new Set<string>();
  for (let pagina = 0; pagina < 30; pagina++) {
    const html = await s.html(`https://loa.sii.cl/cgi_IMT/TMBCOC_InformeMensualBheRec.cgi?cbanoinformemensual=${anio}&cbmesinformemensual=${mm}&rut_arrastre=${p.cuerpo}&dv_arrastre=${p.dv}&pagina_solicitada=${pagina}`);
    const filas = leerMapa(html, 'arr_informe_mensual');
    const meta = leerMapa(html, 'xml_values');
    if (!filas && !meta) throw new ErrorSii('El SII no entregó el informe de boletas de honorarios recibidas.');
    const porIndice: Record<string, Record<string, string>> = {};
    for (const [k, v] of Object.entries(filas || {})) {
      const m = /^(.*)_(\d+)$/.exec(k); if (!m) continue;
      (porIndice[m[2]] ||= {})[m[1]] = v;
    }
    let nuevos = 0;
    for (const f of Object.values(porIndice)) {
      const rut = f.rutemisor ? `${f.rutemisor}-${f.dvemisor}` : '';
      const clave = `${f.nroboleta}|${rut}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave); nuevos++;
      if (f.estado === 'S') continue; // anulada
      const bruto = num(f.totalhonorarios), ret = num(f.retencion_receptor), liq = num(f.honorariosliquidos) || bruto - ret;
      docs.push({
        tipoRegistro: 'Honorarios', tipoDocumento: 'BH', tipoDoc: 'BH', nombreTipoDoc: 'Boleta de Honorarios Electrónica',
        folio: String(f.nroboleta || ''), rutEmisor: rut, razonSocialEmisor: f.nombre_emisor || '',
        rutReceptor: p.conGuion, razonSocialReceptor: nombreEmpresa, fechaEmision: fechaIso(f.fecha_boleta),
        // Convención de Gest_OK para honorarios: neto = bruto, IVA = retención, total = líquido
        montoNeto: bruto, montoIva: ret, montoExento: 0, montoTotal: liq, montoBruto: bruto, montoRetencion: ret, montoLiquido: liq,
        period: `${anio}-${mm}`, origenDocumento: 'BHE_SII_PROPIO',
      });
    }
    const total = num(meta?.total_boletas);
    console.log(`[sii-portal] honorarios ${p.conGuion} ${anio}-${mm} página ${pagina}: informe=${meta ? 'sí' : 'no'} total_boletas=${meta?.total_boletas ?? '-'} filas=${Object.keys(porIndice).length}`);
    if (nuevos === 0 || vistos.size >= total) break;
  }
  return docs;
}

const F29_BASE = 'https://www4.sii.cl/propuestaf29ui/services/data/facadeAdapterService';
const F29_NS = 'cl.sii.sdi.lob.iva.propuestaf29.data.api.interfaces.FacadeAdapterService';
const ESTADO_F29: Record<string, string> = { '1': 'Vigente', '10': 'Guardada (no presentada)', '70': 'Rechazada por pago inconcluso' };

/** F29 presentados de un año (por mes: folio, fecha, monto a pagar, estado). Requiere sesión de la propia empresa. */
export async function leerF29Anio(s: SesionSii, rutEmpresa: string, anio: number, hastaMes = 12) {
  const p = partirRut(rutEmpresa);
  const meses = Array.from({ length: hastaMes }, (_, i) => i + 1);
  const out: any[] = [];
  for (const mes of meses) {
    const op = 'getDeclaracionConEstados';
    const r = await s.json(`${F29_BASE}/${op}`, { metaData: { namespace: `${F29_NS}/${op}`, conversationId: s.token, transactionId: uuid() },
      data: { rut: p.cuerpo, dv: p.dv, formId: '2', mes: String(mes).padStart(2, '0'), anno: String(anio) } }, 'https://www4.sii.cl/propuestaf29ui/');
    const errores = r?.metaData?.errors;
    if (Array.isArray(errores) && errores.length) {
      out.push({ periodo: `${anio}-${String(mes).padStart(2, '0')}`, error: errores.map((e: any) => e.descripcion || e.id).join('; ') });
      continue;
    }
    for (const d of (Array.isArray(r?.data) ? r.data : [])) {
      out.push({
        periodo: `${anio}-${String(mes).padStart(2, '0')}`, folio: String(d.folio ?? ''), fecha: String(d.declFechaCreacion ?? '').slice(0, 10),
        total: num(d.monto), estadoCodigo: String(d.estadoDeclaracionId ?? d.estado ?? ''),
        estado: ESTADO_F29[String(d.estadoDeclaracionId ?? '')] || String(d.estado ?? ''),
      });
    }
  }
  return out;
}

/** Un F29 por mes: el vigente si existe; si no, el último rechazado por pago inconcluso; si no hay nada y el
 *  mes ya venció (día 12 o 20 del mes siguiente), PENDIENTE. Meses sin vencer o fuera de actividades no se muestran. */
export function consolidarF29(todos: any[], anio: number, hastaMes: number, o: { dia20: boolean; inicio: string; termino: string; hoy?: Date }) {
  const hoy = o.hoy || new Date(Date.now() - 3 * 3600 * 1000);
  const hoyIso = hoy.toISOString().slice(0, 10);
  const out: any[] = [];
  for (let mes = 1; mes <= hastaMes; mes++) {
    const periodo = `${anio}-${String(mes).padStart(2, '0')}`;
    const delMes = todos.filter(f => f.periodo === periodo && !f.error);
    const orden = (a: any, b: any) => (a.fecha || '').localeCompare(b.fecha || '') || (a.folio || '').localeCompare(b.folio || '');
    const vigentes = delMes.filter(f => f.estadoCodigo === '1').sort(orden);
    if (vigentes.length) { out.push(vigentes[vigentes.length - 1]); continue; }
    const otros = delMes.sort(orden);
    if (otros.length) { out.push(otros[otros.length - 1]); continue; }
    const vence = new Date(Date.UTC(anio, mes, o.dia20 ? 20 : 12)).toISOString().slice(0, 10);
    const finMes = new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10);
    if (o.inicio && finMes < o.inicio) continue;            // antes del inicio de actividades
    if (o.termino && `${periodo}-01` > o.termino) continue;  // después del término de giro
    if (vence >= hoyIso) continue;                           // aún no vence
    const error = todos.find(f => f.periodo === periodo && f.error)?.error;
    out.push({ periodo, folio: '', fecha: '', total: 0, estadoCodigo: 'PENDIENTE', estado: 'PENDIENTE', vence, ...(error ? { error } : {}) });
  }
  return out;
}

// ─────────────────────────── XML de ventas del facturador gratuito (Portal MIPYME) ───────────────────────────
// Respaldo de DTE: auth.cgi → lista_documentos.cgi → download.cgi. El SII entrega como máximo 20 documentos por descarga
// y trunca sin avisar en rangos anchos: se pide de a 7 días como máximo y se parte por día y por tipo si se excede.
const MIPE = 'https://www1.sii.cl/cgi-bin/Portal001';
const TIPOS_DTE_VENTA = ['33', '34', '39', '41', '43', '46', '52', '56', '61', '110', '111', '112'];

/** Selecciona la empresa en el portal de facturación gratuita. Devuelve false si la cuenta no está autorizada para ella. */
export async function seleccionarEmpresaMipyme(s: SesionSii, rutEmpresa: string): Promise<boolean> {
  const html = await s.html(`${MIPE}/mipeSelEmpresa.cgi?DESDE_DONDE_URL=OPCION%3D33%26TIPO%3D4`);
  const opciones = [...html.matchAll(/<option value="([^"]+)"[^>]*>/g)].map(m => m[1].trim()).filter(r => /^\d{5,}-[\dkK]$/.test(r));
  const objetivo = partirRut(rutEmpresa).conGuion.toUpperCase();
  if (!/<select[^>]+RUT_EMP/i.test(html)) return true;                 // una sola empresa: el portal ya quedó en ella
  if (!opciones.some(o => o.toUpperCase() === objetivo)) return false;  // la cuenta no opera esta empresa
  await s.pedir(`${MIPE}/mipeSelEmpresa.cgi`, { method: 'POST', body: new URLSearchParams({ DESDE_DONDE_URL: 'OPCION=33&TIPO=4', RUT_EMP: objetivo }).toString(),
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://www1.sii.cl', referer: `${MIPE}/mipeSelEmpresa.cgi` } });
  return true;
}

/** Separa un SetDTE en documentos individuales y lee la resolución del SII de la carátula. */
export function separarSetDte(xml: string) {
  const nroResol = /<NroResol>\s*(\d+)\s*<\/NroResol>/.exec(xml)?.[1] || '';
  const fchResol = /<FchResol>\s*([\d-]+)\s*<\/FchResol>/.exec(xml)?.[1] || '';
  const dtes = xml.match(/<DTE\b[\s\S]*?<\/DTE>/g) || [];
  return dtes.map(d => {
    const t = (n: string) => new RegExp(`<${n}>([\\s\\S]*?)</${n}>`).exec(d)?.[1]?.trim() || '';
    return { xml: d, tipo: t('TipoDTE'), folio: t('Folio'), fecha: t('FchEmis'), rutEmisor: t('RUTEmisor'), rutReceptor: t('RUTRecep'),
      razonReceptor: t('RznSocRecep'), total: Number(t('MntTotal')) || 0, nroResol, fchResol };
  }).filter(d => d.tipo && d.folio);
}

const isoDia = (d: Date) => d.toISOString().slice(0, 10);
function partirEnTramos(desde: string, hasta: string, maxDias: number): [string, string][] {
  const out: [string, string][] = [];
  let a = new Date(`${desde}T00:00:00Z`); const fin = new Date(`${hasta}T00:00:00Z`);
  while (a <= fin) {
    const b = new Date(Math.min(fin.getTime(), a.getTime() + (maxDias - 1) * 86400000));
    out.push([isoDia(a), isoDia(b)]);
    a = new Date(b.getTime() + 86400000);
  }
  return out;
}

/** Cantidad de documentos que informa el listado del portal (campo oculto cant_reg, o el aviso "No hay resultados"). */
export function cantidadListado(html: string): number | null {
  const input = /<input\b[^>]*\bcant_reg\b[^>]*>/i.exec(html)?.[0];
  const v = input ? /\bvalue\s*=\s*["']?(\d+)/i.exec(input)?.[1] : undefined;
  if (v !== undefined) return Number(v);
  if (/No hay resultados/i.test(html)) return 0;
  return null;
}

async function descargarTramoXml(s: SesionSii, rut: { cuerpo: string; dv: string }, desde: string, hasta: string, tipo = '') {
  const comunes: Record<string, string> = { RUT_EMP: rut.cuerpo, DV_EMP: rut.dv, RUT_RECP: '', FOLIO: '', RZN_SOC: '', FEC_DESDE: desde, FEC_HASTA: hasta,
    TPO_DOC: tipo, ESTADO: '', ORDEN: '', FOLIOHASTA: '' };
  const listado = await s.pedir(`${MIPE}/lista_documentos.cgi`, { method: 'POST', body: new URLSearchParams({ ...comunes, TPO_ARCHIVO: 'dte', ORIGEN: 'ENV', NUM_PAG: '1' }).toString(),
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://www1.sii.cl', referer: `${MIPE}/auth.cgi` } });
  const cant = cantidadListado(listado.texto);
  const r = await s.pedir(`${MIPE}/download.cgi?${new URLSearchParams({ ...comunes, ORIGEN: 'ENV', DOWNLOAD: 'XML' }).toString()}`);
  if (new URL(r.url).hostname === LOGIN_HOST) throw new ErrorSii('La sesión del SII se cerró durante la descarga de XML.', 'SESION');
  // El SII responde "demasiados documentos" también cuando el filtro no trae nada: se mira el listado para distinguir
  if (/demasiados Documentos electr/i.test(r.texto)) {
    if (cant === null) console.warn(`[sii-portal] xml ${desde}..${hasta} tipo=${tipo || '-'}: listado sin conteo legible`);
    return cant === 0 || (cant === null && !!tipo) ? { vacio: true as const } : { excede: true as const };
  }
  if (!/<SetDTE/i.test(r.texto)) {
    if (cant === 0) return { vacio: true as const };
    const cod = /CODIGO:\s*([\d.\-]+)/.exec(r.texto)?.[1];
    throw new ErrorSii(`El SII no entregó el XML del ${desde} al ${hasta}${cod ? ` (código ${cod})` : ''}.`);
  }
  return { xml: r.texto };
}

/** XML de todos los documentos emitidos en el facturador gratuito durante el mes. */
export async function leerXmlEmitidos(s: SesionSii, rutEmpresa: string, anio: number, mes: number, limiteMs = 240000) {
  const t0 = Date.now();
  await s.pedir(`${MIPE}/auth.cgi`);
  const rut = partirRut(rutEmpresa);
  const desde = `${anio}-${String(mes).padStart(2, '0')}-01`;
  const hasta = isoDia(new Date(Date.UTC(anio, mes, 0)));
  const documentos: ReturnType<typeof separarSetDte> = [];
  const pendientes: string[] = [];
  const procesar = async (a: string, b: string, tipo = ''): Promise<void> => {
    if (Date.now() - t0 > limiteMs) { pendientes.push(`${a}${a !== b ? ` al ${b}` : ''}${tipo ? ` (tipo ${tipo})` : ''}: falta tiempo, vuelve a descargar`); return; }
    const r = await descargarTramoXml(s, rut, a, b, tipo);
    if ('xml' in r) { documentos.push(...separarSetDte(r.xml as string)); return; }
    if ('vacio' in r) return;
    if (a !== b) { for (const [x, y] of partirEnTramos(a, b, 1)) await procesar(x, y, tipo); return; }
    if (!tipo) { for (const t of TIPOS_DTE_VENTA) await procesar(a, b, t); return; }
    pendientes.push(`${a} tipo ${tipo}`);
  };
  for (const [a, b] of partirEnTramos(desde, hasta, 7)) await procesar(a, b);
  const unicos = new Map(documentos.map(d => [`${d.tipo}_${d.folio}`, d]));
  return { documentos: [...unicos.values()], pendientes };
}

// ─────────────────────────── Endpoint ───────────────────────────
async function leerCuerpo(req: IncomingMessage): Promise<any> {
  return new Promise(resolve => { let b = ''; req.on('data', c => (b += c)); req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch { resolve({}); } }); });
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const responder = (code: number, payload: any) => {
    if (!payload?.success) console.warn(`[sii-portal] respuesta ${code}: ${payload?.error || ''}`);
    res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(payload));
  };
  console.log('[sii-portal] solicitud recibida');
  if (req.method !== 'POST') return responder(405, { error: 'Method Not Allowed' });
  const token = String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (!token) return responder(401, { success: false, error: 'Falta iniciar sesión.' });
  let usuario: any;
  try { usuario = await adminAuth.verifyIdToken(token); } catch { return responder(401, { success: false, error: 'Sesión inválida o vencida.' }); }

  const inicio = Date.now();
  const b: any = await leerCuerpo(req);
  const { accion, studyId, companyId } = b;
  try {
    if (!['datos', 'rcv', 'f29', 'xml'].includes(accion)) return responder(400, { success: false, error: 'Acción no reconocida.' });
    if (!studyId || !companyId) return responder(400, { success: false, error: 'Falta indicar el estudio y la empresa.' });
    if (usuario.role !== 'SUPER_USER' && usuario.studyId !== studyId) return responder(403, { success: false, error: 'No tienes permisos sobre esta empresa.' });
    const comp = await adminDb.collection('studies').doc(String(studyId)).collection('companies').doc(String(companyId)).get();
    if (!comp.exists) return responder(404, { success: false, error: 'Empresa no encontrada.' });
    const c: any = comp.data() || {};
    const sec: any = (await adminDb.collection('companySecrets').doc(String(companyId)).get()).data() || {};
    if (sec.studyId && sec.studyId !== studyId) return responder(403, { success: false, error: 'No tienes permisos sobre las credenciales de esta empresa.' });
    const clave = decryptSecret(sec.claveSiiEncrypted || '');
    if (!c.rut || !clave) return responder(200, { success: false, error: 'La empresa no tiene guardada su clave tributaria del SII (Configuración de la empresa).' });

    let s = new SesionSii();
    await s.ingresar(c.rut, clave);
    const nombre = c.name || '';
    let resultado: any;
    if (accion === 'datos') {
      resultado = { datos: await leerDatosEmpresa(s) };
    } else if (accion === 'rcv') {
      const anio = Number(b.year), mes = Number(b.month);
      if (!anio || !mes) return responder(400, { success: false, error: 'Falta el período.' });
      // Mes cerrado: no se vuelve a descargar (misma regla que la sincronización actual)
      const fy: any = (await comp.ref.collection('fiscalPeriods').doc(String(anio)).get()).data();
      if (fy?.months?.[mes] !== 'Abierto' && !b.ignorarCierre) {
        return responder(200, { success: false, periodoCerrado: true, error: `El período ${anio}-${String(mes).padStart(2, '0')} está cerrado. Para actualizarlo, ábrelo en Configuraciones > Períodos Contables.` });
      }
      const errores: string[] = [];
      const intento = async (nombreParte: string, f: () => Promise<any[]>) => { try { return await f(); } catch (e: any) { errores.push(`${nombreParte}: ${e?.message || e}`); return []; } };
      const [ventas, compras, honorarios] = await Promise.all([
        intento('Ventas', () => leerRcv(s, c.rut, nombre, anio, mes, 'VENTA')),
        intento('Compras', () => leerRcv(s, c.rut, nombre, anio, mes, 'COMPRA')),
        intento('Honorarios', () => leerHonorariosRecibidos(s, c.rut, nombre, anio, mes)),
      ]);
      const documents = [...ventas, ...compras, ...honorarios];
      resultado = { documents, count: documents.length, source: 'SII_DIRECTO', period: `${anio}-${String(mes).padStart(2, '0')}`,
        resumen: { ventas: ventas.length, compras: compras.length, honorarios: honorarios.length }, apiErrors: errores.length ? errores : undefined };
    } else if (accion === 'xml') {
      const anio = Number(b.year), mes = Number(b.month);
      if (!anio || !mes) return responder(400, { success: false, error: 'Falta el período.' });
      // Unidad del SII de la empresa (va bajo el recuadro de la representación impresa)
      try {
        const de = await leerDatosEmpresa(s);
        if (de.unidadOperativa) await comp.ref.set({ siiUnidadOperativa: de.unidadOperativa }, { merge: true });
      } catch { /* no es indispensable */ }
      // El portal de facturación gratuita lo opera normalmente la persona autorizada, no la cuenta de la empresa
      let cuenta = 'empresa';
      if (!(await seleccionarEmpresaMipyme(s, c.rut))) {
        const rutRep = sec.rutRepresentante || c.dteConfig?.rutRepresentante || c.legalRepRut || '';
        const claveRep = decryptSecret(sec.claveRepresentanteEncrypted || '');
        if (!rutRep || !claveRep) return responder(200, { success: false, error: 'La cuenta SII de la empresa no está autorizada en el facturador gratuito. Guarda el RUT y la clave tributaria del representante (usuario autorizado) en la configuración de la empresa.' });
        s = new SesionSii();
        await s.ingresar(rutRep, claveRep);
        if (!(await seleccionarEmpresaMipyme(s, c.rut))) return responder(200, { success: false, error: 'Ni la empresa ni su representante están autorizados para esta empresa en el facturador gratuito del SII.' });
        cuenta = 'representante';
      }
      const { documentos, pendientes } = await leerXmlEmitidos(s, c.rut, anio, mes);
      const col = comp.ref.collection('dteXml');
      let nuevos = 0;
      for (let i = 0; i < documentos.length; i += 400) {
        const lote = adminDb.batch();
        for (const d of documentos.slice(i, i + 400)) {
          const id = `${partirRut(d.rutEmisor || c.rut).cuerpo}_${d.tipo}_${d.folio}`;
          lote.set(col.doc(id), { ...d, period: d.fecha.slice(0, 7), origen: 'SII_FACTURADOR_GRATUITO', descargadoEn: new Date().toISOString() }, { merge: true });
          nuevos++;
        }
        await lote.commit();
      }
      resultado = { cantidad: nuevos, pendientes, cuenta, period: `${anio}-${String(mes).padStart(2, '0')}` };
    } else {
      const anio = Number(b.year) || new Date().getFullYear();
      const hasta = anio === new Date().getFullYear() ? new Date().getMonth() + 1 : 12;
      const todos = await leerF29Anio(s, c.rut, anio, hasta);
      let datos: any = null;
      try { datos = await leerDatosEmpresa(s); } catch { /* sin datos: se asume día 20 */ }
      resultado = { f29: consolidarF29(todos, anio, hasta, { dia20: datos ? datos.f29Dia20 : true, inicio: datos?.inicioActividades || '', termino: datos?.terminoGiro || '' }), todos, anio };
    }
    console.log(`[sii-portal] ${accion} empresa=${companyId} ok en ${Date.now() - inicio} ms`);
    return responder(200, { success: true, ...resultado });
  } catch (e: any) {
    console.warn(`[sii-portal] ${accion} empresa=${companyId} error en ${Date.now() - inicio} ms: ${e?.message}`);
    return responder(200, { success: false, tipoError: e instanceof ErrorSii ? e.tipo : 'INTERNO', error: e?.message || String(e) });
  }
}
