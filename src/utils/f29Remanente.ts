/**
 * Remanente de crédito fiscal que se arrastra al F29 de un período (Cód. 504), expresado en UTM.
 * Regla: el remanente de un mes es el que dejó el F29 del mes anterior (Cód. 77 convertido a UTM);
 * en pesos se actualiza con la UTM del mes que se declara (Art. 27 DL 825).
 */
export interface DeclF29Min { period: string; status?: string; resumen?: { remanenteParaSiguienteMesUTM?: number } }

export interface RemanenteArrastrado {
  utm: number;
  origen: 'mes_anterior' | 'ultimo_guardado' | 'inicial' | 'sin_datos';
  periodoOrigen?: string;
  advertencia?: string;
}

export const periodoAnterior = (p: string) => {
  const [y, m] = p.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};

export function remanenteArrastrado(declaraciones: DeclF29Min[], periodo: string, inicial: { utm?: number } = {}): RemanenteArrastrado {
  const ant = periodoAnterior(periodo);
  const previo = declaraciones.find(d => d.period === ant);
  if (previo) return { utm: Number(previo.resumen?.remanenteParaSiguienteMesUTM) || 0, origen: 'mes_anterior', periodoOrigen: ant };
  const anteriores = declaraciones.filter(d => d.period < periodo).sort((a, b) => b.period.localeCompare(a.period));
  if (anteriores.length) {
    const u = anteriores[0];
    return {
      utm: Number(u.resumen?.remanenteParaSiguienteMesUTM) || 0, origen: 'ultimo_guardado', periodoOrigen: u.period,
      advertencia: `No está guardado el F29 de ${ant}: el remanente viene del F29 de ${u.period}. Guarda los meses intermedios para que el arrastre sea exacto.`,
    };
  }
  if (inicial.utm) return { utm: inicial.utm, origen: 'inicial' };
  return { utm: 0, origen: 'sin_datos' };
}

/** Pesos del remanente actualizado con la UTM del período que se declara. */
export const remanenteEnPesos = (utm: number, utmPeriodo: number) => Math.round((Number(utm) || 0) * (Number(utmPeriodo) || 0));
