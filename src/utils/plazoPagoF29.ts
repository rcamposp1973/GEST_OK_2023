// Plazo de pago del F29: día 20 del mes siguiente al período declarado.
// Si el 20 cae sábado, domingo o feriado, se corre al siguiente día hábil.

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const mk = (y: number, m: number, d: number) => new Date(y, m - 1, d);

function pascua(y: number): Date {
  // Algoritmo de Meeus/Jones/Butcher
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return mk(y, mes, dia);
}
const sumar = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

/** Feriados legales de Chile del año (reglas vigentes de traslado). No incluye feriados por elecciones u otros decretos especiales. */
export function feriadosChile(y: number): Set<string> {
  const f = new Set<string>();
  const add = (d: Date) => f.add(iso(d));
  const p = pascua(y);
  add(mk(y, 1, 1)); add(sumar(p, -2)); add(sumar(p, -1));
  add(mk(y, 5, 1)); add(mk(y, 5, 21));
  const solsticio: Record<number, number> = { 2024: 20, 2025: 20, 2026: 21, 2027: 21, 2028: 20 };
  add(mk(y, 6, solsticio[y] || 21));
  // San Pedro y San Pablo (29 jun): al lunes más cercano
  const sp = mk(y, 6, 29), dsp = sp.getDay();
  if (dsp >= 2 && dsp <= 4) add(sumar(sp, -(dsp - 1))); else if (dsp === 5) add(sumar(sp, 3)); else add(sp);
  add(mk(y, 7, 16)); add(mk(y, 8, 15));
  add(mk(y, 9, 18)); add(mk(y, 9, 19));
  if (mk(y, 9, 18).getDay() === 2) add(mk(y, 9, 17));
  if (mk(y, 9, 19).getDay() === 3) add(mk(y, 9, 20));
  // Encuentro de Dos Mundos (12 oct): martes/miércoles al lunes anterior; jueves/viernes al lunes siguiente
  const o = mk(y, 10, 12), dob = o.getDay();
  if (dob === 2 || dob === 3) add(sumar(o, -(dob - 1))); else if (dob === 4 || dob === 5) add(sumar(o, 8 - dob)); else add(o);
  // Iglesias Evangélicas (31 oct): martes al viernes anterior; miércoles al viernes siguiente
  const e = mk(y, 10, 31), de = e.getDay();
  add(de === 2 ? sumar(e, -4) : de === 3 ? sumar(e, 2) : e);
  add(mk(y, 11, 1)); add(mk(y, 12, 8)); add(mk(y, 12, 25));
  return f;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export interface PlazoPago { fecha: string; texto: string; nota: string }

export function plazoPagoF29(periodo: string): PlazoPago {
  const [y, m] = periodo.split('-').map(Number);
  const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
  const base = mk(ny, nm, 20);
  let d = new Date(base);
  const esInhabil = (x: Date) => x.getDay() === 0 || x.getDay() === 6 || feriadosChile(x.getFullYear()).has(iso(x));
  let guard = 0;
  while (esInhabil(d) && guard++ < 10) d = sumar(d, 1);
  const txt = (x: Date) => `${DIAS[x.getDay()]} ${x.getDate()} de ${MESES[x.getMonth()]} de ${x.getFullYear()}`;
  const nota = d.getTime() === base.getTime()
    ? ''
    : `El 20 de ${MESES[nm - 1]} cae ${feriadosChile(base.getFullYear()).has(iso(base)) ? 'en feriado' : DIAS[base.getDay()]}, por eso pasa al siguiente día hábil.`;
  return { fecha: iso(d), texto: txt(d), nota };
}
