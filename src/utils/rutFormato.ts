/**
 * REGLA DEL SISTEMA: todo RUT se guarda y se muestra como 11.111.111-1
 * (puntos de miles, guion y dígito verificador; la K en mayúscula),
 * sin importar cómo se haya digitado: 111111111, 11111111-1, 11.111.111-1…
 *
 * Esta utilidad no depende de nada del navegador: la usan tanto la
 * aplicación como el servidor (migración de datos).
 */

/** Nombres de campo que contienen un RUT (en cualquier nivel de un documento). */
export const CAMPOS_RUT = new Set([
  'rut', 'rutEmisor', 'rutReceptor', 'rutRepresentante', 'rutRepresentanteSii', 'rutEmpresaSii',
  'rutContraparte', 'companyRut', 'legalRepRut', 'adminRut', 'auxiliaryRut', 'employeeRut',
  'supplierRut', 'responsibleRut',
]);

/**
 * Devuelve el RUT en formato 11.111.111-1.
 * Si el texto no parece un RUT (vacío, con letras, largo imposible) lo devuelve igual, sin tocarlo.
 */
export function formatearRut(valor: any): any {
  if (typeof valor !== 'string') return valor;
  const t = valor.trim();
  if (!t) return valor;
  if (/[^0-9kK.\-\s]/.test(t)) return valor;            // contiene otras letras o símbolos: no es un RUT
  const limpio = t.replace(/[^0-9kK]/g, '').toUpperCase();
  if (!/^\d+[0-9K]$/.test(limpio)) return valor;         // la K solo puede ir al final
  const cuerpo = limpio.slice(0, -1).replace(/^0+/, '');
  const dv = limpio.slice(-1);
  if (cuerpo.length < 6 || cuerpo.length > 8) return valor;
  return `${cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`;
}

/** true si es un objeto simple (no Timestamp, FieldValue, referencias, etc.). */
function esObjetoSimple(v: any): boolean {
  if (v === null || typeof v !== 'object') return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
}

/**
 * Recorre un dato (objeto/arreglo) y deja en formato 11.111.111-1 todos los campos
 * cuyo nombre es de RUT. Devuelve el mismo objeto si nada cambió.
 * `cambios` (opcional) recibe una nota por cada valor corregido.
 */
export function normalizarRutsProfundo<T>(dato: T, cambios?: { ruta: string; antes: string; despues: string }[], ruta = ''): T {
  if (Array.isArray(dato)) {
    let copia: any[] | null = null;
    dato.forEach((x, i) => {
      const n = normalizarRutsProfundo(x, cambios, `${ruta}[${i}]`);
      if (n !== x) { if (!copia) copia = dato.slice(); copia[i] = n; }
    });
    return (copia ?? dato) as any;
  }
  if (esObjetoSimple(dato)) {
    let copia: any = null;
    for (const k of Object.keys(dato as any)) {
      const v = (dato as any)[k];
      let n = v;
      if (CAMPOS_RUT.has(k) && typeof v === 'string') {
        n = formatearRut(v);
        if (n !== v) cambios?.push({ ruta: ruta ? `${ruta}.${k}` : k, antes: v, despues: n });
      } else if (v && typeof v === 'object') {
        n = normalizarRutsProfundo(v, cambios, ruta ? `${ruta}.${k}` : k);
      }
      if (n !== v) { if (!copia) copia = { ...(dato as any) }; copia[k] = n; }
    }
    return (copia ?? dato) as any;
  }
  return dato;
}

/** Valores de campos de RUT que NO se pudieron convertir (para avisar al usuario). */
export function rutsNoConvertibles(dato: any, salida: string[] = []): string[] {
  if (Array.isArray(dato)) { dato.forEach(x => rutsNoConvertibles(x, salida)); return salida; }
  if (esObjetoSimple(dato)) {
    for (const k of Object.keys(dato)) {
      const v = dato[k];
      if (CAMPOS_RUT.has(k) && typeof v === 'string' && v.trim() && formatearRut(v) === v && !/^\d{1,3}(\.\d{3}){1,2}-[0-9K]$/.test(v)) salida.push(v);
      else if (v && typeof v === 'object') rutsNoConvertibles(v, salida);
    }
  }
  return salida;
}
