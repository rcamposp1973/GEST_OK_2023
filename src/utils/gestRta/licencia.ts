/**
 * Licencia del módulo pagado Gest_Rta. El precio se negocia directo con cada estudio: aquí sólo se registra lo acordado
 * y se controla el acceso (vigencia y cupo de empresas). No cobra ni factura.
 */
export type ModalidadGestRta = 'ESTUDIO' | 'POR_EMPRESA' | 'CUPO_EMPRESAS';

export interface LicenciaGestRta {
  modalidad: ModalidadGestRta;
  /** Sólo CUPO_EMPRESAS: cuántas empresas del estudio pueden tenerlo activo. */
  cupoEmpresas?: number;
  precioAcordado?: number;
  moneda?: 'UF' | 'CLP';
  periodicidad?: 'MENSUAL' | 'ANUAL' | 'TEMPORADA_RENTA' | 'PAGO_UNICO';
  vigenciaDesde?: string; // YYYY-MM-DD
  vigenciaHasta?: string; // YYYY-MM-DD (vacío = sin término)
  notas?: string;
}

export const NOMBRE_MODALIDAD: Record<ModalidadGestRta, string> = {
  ESTUDIO: 'Todo el estudio (todas sus empresas)',
  POR_EMPRESA: 'Por empresa (el estudio elige cuáles)',
  CUPO_EMPRESAS: 'Cupo de empresas (hasta N empresas)',
};

export const NOMBRE_PERIODICIDAD: Record<NonNullable<LicenciaGestRta['periodicidad']>, string> = {
  MENSUAL: 'Mensual', ANUAL: 'Anual', TEMPORADA_RENTA: 'Temporada de Renta', PAGO_UNICO: 'Pago único',
};

export function licenciaVigente(l: LicenciaGestRta | undefined | null, hoy: string = new Date().toISOString().slice(0, 10)): boolean {
  if (!l) return false;
  if (l.vigenciaDesde && hoy < l.vigenciaDesde) return false;
  if (l.vigenciaHasta && hoy > l.vigenciaHasta) return false;
  return true;
}

/** ¿La empresa puede usar Gest_Rta? El estudio debe tenerlo contratado y vigente; según la modalidad, la empresa debe estar marcada. */
export function gestRtaActivo(
  estudio: { modules?: Record<string, boolean | undefined>; gestRtaLicencia?: LicenciaGestRta | null } | null | undefined,
  empresa: { gestRtaHabilitado?: boolean } | null | undefined,
  hoy?: string,
): boolean {
  if (!estudio || estudio.modules?.gestRta !== true) return false;
  const l = estudio.gestRtaLicencia || { modalidad: 'POR_EMPRESA' as ModalidadGestRta };
  if (!licenciaVigente(l, hoy)) return false;
  if (l.modalidad === 'ESTUDIO') return true;
  return empresa?.gestRtaHabilitado === true;
}

/** ¿Se puede activar una empresa más? (modalidad cupo) */
export function quedaCupo(l: LicenciaGestRta | undefined | null, empresasActivas: number): boolean {
  if (!l || l.modalidad !== 'CUPO_EMPRESAS') return true;
  return empresasActivas < Math.max(0, Number(l.cupoEmpresas) || 0);
}
