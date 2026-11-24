// Cálculo de finiquitos (Código del Trabajo de Chile). Lógica pura, sin pantalla, para poder probarla.

export interface DatosFiniquito {
  hireDate: string;          // YYYY-MM-DD (fecha de inicio del contrato)
  fechaCese: string;         // YYYY-MM-DD
  contractType?: string;     // 'OBRA_FAENA', 'INDEFINIDO', 'PLAZO_FIJO', ...
  requiereIAS: boolean;      // causal con indemnización por años de servicio (Art. 161)
  requiereAvisoPrevio: boolean;
  esConclusionObra: boolean; // causal Art. 159 N° 5
  conAvisoPrevio: boolean;
  baseMensual: number;       // última remuneración mensual (Art. 172)
  ufCese: number;            // UF del mes del cese (0 si no está cargada)
  diasVacacionesTomados: number; // días hábiles de feriado ya usados en el período que se liquida
  otrosHaberes?: number;
  descuentos?: number;
  /** Sueldo líquido del último mes trabajado (de la liquidación), si aún no se ha pagado */
  sueldoLiquidoPendiente?: number;
}

export interface ResultadoFiniquito {
  diffDays: number;
  anosCompletos: number;
  mesesRestantes: number;
  anosParaIAS: number;
  topeLegal: number;
  baseTopada: number;
  montoIAS: number;
  montoAvisoPrevio: number;
  // Obra o faena (Art. 163 inc. 3° y Art. 23 transitorio)
  diasPorMesObra: number;
  mesesObra: number;
  diasIndemnizacionObra: number;
  montoIndemnizacionObra: number;
  avisoObra?: string;
  avisoFeriado?: string;
  diasVacacionesPendientes: number;
  montoVacaciones: number;
  totalBruto: number;
  totalDescuentos: number;
  sueldoLiquidoPendiente: number;
  totalLiquido: number;
}

const d = (s: string) => new Date(`${(s || '').slice(0, 10)}T00:00:00Z`);

/** Días de indemnización por mes según la fecha de celebración del contrato (Art. 23 transitorio, Ley 21.122). */
export function diasPorMesObraFaena(fechaContrato: string): number {
  const f = (fechaContrato || '').slice(0, 10);
  if (!f || f < '2019-01-01') return 0;  // contratos anteriores a la ley: sin esta indemnización
  if (f <= '2020-06-30') return 1;
  if (f <= '2021-06-30') return 1.5;
  if (f <= '2021-12-31') return 2;
  return 2.5;
}

/** Meses completos de vigencia más la fracción superior a 15 días, que cuenta como mes. */
export function mesesTrabajadosObra(inicio: string, fin: string): { meses: number; vigenteUnMesOMas: boolean } {
  const a = d(inicio), b = d(fin);
  if (!(b > a)) return { meses: 0, vigenteUnMesOMas: false };
  let meses = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  // fecha de "aniversario" mensual tras los meses completos
  let ancla = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + meses, a.getUTCDate()));
  if (ancla > b) { meses -= 1; ancla = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + meses, a.getUTCDate())); }
  // días del período, contando el día de término
  const resto = Math.round((b.getTime() - ancla.getTime()) / 864e5) + 1;
  const vigenteUnMesOMas = meses >= 1 || resto >= 28;
  return { meses: meses + (resto > 15 ? 1 : 0), vigenteUnMesOMas };
}

export function calcularFiniquito(x: DatosFiniquito): ResultadoFiniquito {
  const fIngreso = d(x.hireDate || '2025-01-01');
  const fCese = d(x.fechaCese);
  const diffDays = Math.max(0, Math.round((fCese.getTime() - fIngreso.getTime()) / 864e5) + 1);

  let totalMeses = (fCese.getUTCFullYear() - fIngreso.getUTCFullYear()) * 12 + (fCese.getUTCMonth() - fIngreso.getUTCMonth());
  if (fCese.getUTCDate() < fIngreso.getUTCDate()) totalMeses -= 1;
  totalMeses = Math.max(0, totalMeses);
  const anosCompletos = Math.floor(totalMeses / 12);
  const mesesRestantes = totalMeses % 12;

  // Art. 163: 1 mes por año y fracción superior a 6 meses, desde 1 año de servicio, máximo 11 años
  let anosParaIAS = 0;
  if (anosCompletos >= 1) {
    anosParaIAS = anosCompletos + ((mesesRestantes > 6 || (mesesRestantes === 6 && fCese.getUTCDate() !== fIngreso.getUTCDate())) ? 1 : 0);
  }
  anosParaIAS = Math.min(11, anosParaIAS);

  // Art. 172: tope de 90 UF
  const topeLegal = x.ufCese > 0 ? Math.round(90 * x.ufCese) : Number.POSITIVE_INFINITY;
  const baseTopada = Math.min(x.baseMensual, topeLegal);

  const montoIAS = x.requiereIAS ? anosParaIAS * baseTopada : 0;
  const montoAvisoPrevio = x.requiereAvisoPrevio && !x.conAvisoPrevio ? baseTopada : 0;

  // Obra o faena terminada por conclusión del trabajo (Art. 159 N° 5): días por mes trabajado
  let diasPorMesObra = 0, mesesObra = 0, diasIndemnizacionObra = 0, montoIndemnizacionObra = 0;
  let avisoObra: string | undefined;
  if (x.esConclusionObra) {
    if (x.contractType !== 'OBRA_FAENA') {
      avisoObra = 'El contrato no está registrado como "Por obra o faena": no se calcula la indemnización del Art. 163 inc. 3°.';
    } else {
      diasPorMesObra = diasPorMesObraFaena(x.hireDate);
      const m = mesesTrabajadosObra(x.hireDate, x.fechaCese);
      if (diasPorMesObra === 0) avisoObra = 'Contrato celebrado antes del 1-1-2019: no le aplica la indemnización de la Ley 21.122.';
      else if (!m.vigenteUnMesOMas) avisoObra = 'El contrato estuvo vigente menos de un mes: no corresponde indemnización.';
      else {
        mesesObra = m.meses;
        diasIndemnizacionObra = Math.round(mesesObra * diasPorMesObra * 10) / 10;
        montoIndemnizacionObra = Math.round(diasIndemnizacionObra * baseTopada / 30);
      }
    }
  }

  // Feriado proporcional: 1,25 días hábiles por mes; se pagan como corridos (factor aproximado 1,4).
  // Contratos de 30 días o menos: no corresponde, se entiende incluido en la remuneración (Art. 44 inc. 4°).
  const contratoCorto = diffDays <= 30;
  const devengados = contratoCorto ? 0 : (diffDays / 30) * 1.25;
  const diasVacacionesPendientes = Math.max(0, devengados - (x.diasVacacionesTomados || 0));
  const montoVacaciones = Math.round(diasVacacionesPendientes * 1.4 * (x.baseMensual / 30));
  const avisoFeriado = contratoCorto ? 'Contrato de 30 días o menos: no corresponde feriado proporcional (Art. 44 inc. 4°).' : undefined;

  const totalBruto = montoIAS + montoAvisoPrevio + montoIndemnizacionObra + montoVacaciones + (x.otrosHaberes || 0);
  const totalDescuentos = x.descuentos || 0;
  return {
    diffDays, anosCompletos, mesesRestantes, anosParaIAS, topeLegal, baseTopada, montoIAS, montoAvisoPrevio,
    diasPorMesObra, mesesObra, diasIndemnizacionObra, montoIndemnizacionObra, avisoObra, avisoFeriado,
    diasVacacionesPendientes: Math.round(diasVacacionesPendientes * 10) / 10, montoVacaciones,
    totalBruto, totalDescuentos, sueldoLiquidoPendiente: x.sueldoLiquidoPendiente || 0,
    // el sueldo del mes ya viene líquido (con sus descuentos legales hechos): se suma directo
    totalLiquido: Math.max(0, totalBruto - totalDescuentos) + (x.sueldoLiquidoPendiente || 0),
  };
}

/** Última remuneración mensual (Art. 172): sueldo, bonos y haberes mensuales pactados, colación y movilización. */
export const baseArt172 = (e: { baseSalary?: number; bonosPactados?: number; otrosImponiblesPactados?: number; colacionPactada?: number; movilizacionPactada?: number }) =>
  (e.baseSalary || 0) + (e.bonosPactados || 0) + (e.otrosImponiblesPactados || 0) + (e.colacionPactada || 0) + (e.movilizacionPactada || 0);
