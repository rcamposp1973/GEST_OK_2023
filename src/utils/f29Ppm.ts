/**
 * Tasa de PPM sugerida por régimen. Es sólo una propuesta: el contador siempre puede fijar otra tasa
 * (por ejemplo la que el SII informa para la empresa, o una tasa rebajada/aumentada voluntariamente).
 */
export type RegimenF29 = '14_D3_PROPYME_GENERAL' | '14_D8_PROPYME_TRANSPARENTE' | '14_A_SEMI_INTEGRADO' | 'RENTA_PRESUNTA';

export const tasaPpmSugerida = (regimen?: string, anio: number = new Date().getFullYear()): { tasa: number | null; nota: string } => {
  switch (regimen) {
    case '14_D3_PROPYME_GENERAL':
      // Ley 21.755 / Circular SII N° 53 de 2025: tasa transitoria para los años comerciales 2025, 2026 y 2027
      if (anio >= 2025 && anio <= 2027) return { tasa: 0.125, nota: `Pro Pyme General, tasa transitoria ${anio} (Ley 21.755): 0,125% (0,25% si los ingresos del año anterior superan 50.000 UF).` };
      return { tasa: 0.25, nota: 'Pro Pyme General: 0,25% (0,5% si los ingresos del año anterior superan 50.000 UF).' };
    case '14_D8_PROPYME_TRANSPARENTE': return { tasa: 0.2, nota: 'Pro Pyme Transparente: 0,2% (0,5% si los ingresos del año anterior superan 50.000 UF).' };
    case '14_A_SEMI_INTEGRADO': return { tasa: null, nota: 'Régimen General (14 A): la tasa se calcula con el impuesto y los ingresos del año anterior (inicio: 1%).' };
    case 'RENTA_PRESUNTA': return { tasa: null, nota: 'Renta presunta: según la actividad (ej. transportistas 0,3%).' };
    default: return { tasa: null, nota: '' };
  }
};

/** Lee un número escrito por el usuario aceptando coma o punto decimal y separador de miles. */
export const leerNumero = (texto: string): number | null => {
  const t = String(texto ?? '').trim().replace(/\s|\$/g, '');
  if (!t) return null;
  // "1.234.567" (miles) o "1.234,5" → quitar puntos de miles; "0.25" (un solo punto con ≤3 decimales y parte entera corta) se respeta
  let n: string;
  if (t.includes(',')) n = t.replace(/\./g, '').replace(',', '.');
  else if ((t.match(/\./g) || []).length > 1 || /^\d{1,3}\.\d{3}$/.test(t) && !/^0\./.test(t)) n = t.replace(/\./g, '');
  else n = t;
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
};
