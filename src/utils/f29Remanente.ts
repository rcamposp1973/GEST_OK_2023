/**
 * Remanente de crédito fiscal que se arrastra al F29 de un período (Cód. 504), expresado en UTM.
 * Regla: el remanente de un mes es el que dejó el F29 del mes anterior (Cód. 77 convertido a UTM);
 * en pesos se actualiza con la UTM del mes que se declara (Art. 27 DL 825).
 */
export interface DeclF29Min { period: string; status?: string; resumen?: { remanenteParaSiguienteMesUTM?: number; remanenteParaSiguienteMes?: number } }

export interface RemanenteArrastrado {
  utm: number;
  origen: 'mes_anterior' | 'ultimo_guardado' | 'inicial' | 'sin_datos';
  periodoOrigen?: string;
  /** Pesos con que quedó registrado el remanente en el F29 de origen (Cód. 77). */
  pesosOrigen?: number;
  advertencia?: string;
}

export const periodoAnterior = (p: string) => {
  const [y, m] = p.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};

export function remanenteArrastrado(declaraciones: DeclF29Min[], periodo: string, inicial: { utm?: number } = {}): RemanenteArrastrado {
  const ant = periodoAnterior(periodo);
  const previo = declaraciones.find(d => d.period === ant);
  if (previo) return { utm: Number(previo.resumen?.remanenteParaSiguienteMesUTM) || 0, origen: 'mes_anterior', periodoOrigen: ant, pesosOrigen: Math.round(Number(previo.resumen?.remanenteParaSiguienteMes) || 0) };
  const anteriores = declaraciones.filter(d => d.period < periodo).sort((a, b) => b.period.localeCompare(a.period));
  if (anteriores.length) {
    const u = anteriores[0];
    return {
      utm: Number(u.resumen?.remanenteParaSiguienteMesUTM) || 0, origen: 'ultimo_guardado', periodoOrigen: u.period, pesosOrigen: Math.round(Number(u.resumen?.remanenteParaSiguienteMes) || 0),
      advertencia: `No está guardado el F29 de ${ant}: el remanente viene del F29 de ${u.period}. Guarda los meses intermedios para que el arrastre sea exacto.`,
    };
  }
  if (inicial.utm) return { utm: inicial.utm, origen: 'inicial' };
  return { utm: 0, origen: 'sin_datos' };
}

/** Pesos del remanente actualizado con la UTM del período que se declara. */
export const remanenteEnPesos = (utm: number, utmPeriodo: number) => Math.round((Number(utm) || 0) * (Number(utmPeriodo) || 0));

/**
 * Reajuste del remanente (Art. 27 DL 825): UTMs que se arrastran × variación de la UTM entre el mes de origen y el mes
 * que se declara. Se calcula con decimales y se REDONDEA a pesos. El remanente del mes = pesos registrados en el
 * origen + reajuste (así la cuenta contable queda exactamente con lo que se usa).
 */
export function reajusteRemanente(p: { utm: number; utmOrigen: number; utmActual: number; pesosOrigen?: number }) {
  const utm = Number(p.utm) || 0;
  const pesosOrigen = p.pesosOrigen && p.pesosOrigen > 0 ? Math.round(p.pesosOrigen) : Math.round(utm * (Number(p.utmOrigen) || 0));
  const reajuste = Math.max(0, Math.round(utm * ((Number(p.utmActual) || 0) - (Number(p.utmOrigen) || 0))));
  return { pesosOrigen, reajuste, remanenteMes: pesosOrigen + reajuste };
}

/**
 * Remanente del Crédito Especial Empresas Constructoras (Cód. 130 del mes anterior → Cód. 128, reajustado Art. 27).
 * El remanente de diciembre NO pasa a enero: se recupera en la Declaración Anual de Renta (F22 Cód. 83).
 */
export function remanenteCeecArrastrado(declaraciones: { period: string; resumen?: any }[], periodo: string) {
  if (periodo.endsWith('-01')) return { utm: 0, pesosOrigen: 0, periodoOrigen: undefined as string | undefined, nota: 'El remanente CEEC de diciembre se recupera en la Renta (F22), no pasa a enero.' };
  const ant = periodoAnterior(periodo);
  const previo = declaraciones.find(d => d.period === ant);
  if (!previo) return { utm: 0, pesosOrigen: 0, periodoOrigen: undefined as string | undefined, nota: undefined as string | undefined };
  return { utm: Number(previo.resumen?.remanenteCeecUTM) || 0, pesosOrigen: Math.round(Number(previo.resumen?.remanenteCeec) || 0), periodoOrigen: ant, nota: undefined as string | undefined };
}

/**
 * Créditos especiales contra el impuesto determinado (Cód. 595): el CEEC del mes (126) + remanente reajustado (128)
 * = 571, se rebaja de PPM, retenciones e IVA. Si sobra, es remanente (130); si no, el saldo es el total a pagar (91).
 */
export function aplicarCreditosEspeciales(p: { determinado595: number; ceecMes: number; ceecRemanenteAnterior: number }) {
  const d595 = Math.round(p.determinado595 || 0);
  const c571 = Math.round((p.ceecMes || 0) + (p.ceecRemanenteAnterior || 0));
  const t547 = d595 - c571;
  return { c571, total547: t547, remanente130: t547 < 0 ? -t547 : 0, pagar91: Math.max(t547, 0), ceecImputado: Math.min(c571, Math.max(d595, 0)) };
}
