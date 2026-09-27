import { SystemAppFormat } from '../types';

export interface SystemFormatInfo {
  code: SystemAppFormat;
  letter: 'A' | 'B' | 'C1' | 'C2';
  title: string;
  badgeTitle: string;
  subtitle: string;
  audience: 'Estudios Contables' | 'Pymes y Empresas' | 'Estudios Contables (Agéntico 2040)' | 'Pymes y Empresas (Agéntica 2040)';
  isAgentic: boolean;
  targetSegment: 'STUDY' | 'PYME';
  accentColor: string; // Tailwind color name
  bgGradient: string;
  description: string;
  keyFeatures: string[];
}

export const SYSTEM_FORMATS: Record<SystemAppFormat, SystemFormatInfo> = {
  VERSION_A: {
    code: 'VERSION_A',
    letter: 'A',
    title: 'Versión A: Estudio Contable Clásico',
    badgeTitle: 'Versión A · Estudio Clásico',
    subtitle: 'ERP Contable & Tributario Multi-Empresa Profesional',
    audience: 'Estudios Contables',
    isAgentic: false,
    targetSegment: 'STUDY',
    accentColor: 'indigo',
    bgGradient: 'from-slate-900 via-indigo-950 to-slate-900',
    description: 'Diseñado exclusivamente para estudios contables, contadores auditores e independientes que gestionan múltiples clientes y sociedades con rigor técnico contable, tributario y normativo chileno.',
    keyFeatures: [
      'Plan de Cuentas estándar y personalizable por empresa',
      'Comprobantes contables (Vouchers) de Ingreso, Egreso, Traspaso y Apertura',
      'Libro Diario Oficial, Libro Mayor y Auxiliares de Cuentas Corrientes',
      'Balance Tributario de 8 Columnas y Balance Clasificado IFRS / FECU',
      'Sincronización RCV SII (Compras, Ventas y Honorarios BHR)',
      'Formulario 29 con códigos SII oficiales y cálculo de PPM dinámico',
      'Conciliación Bancaria con importación de cartolas masivas',
      'Declaraciones Juradas SII (DDJJ 1887, 1879, etc.) y Remuneraciones LRD DT'
    ]
  },
  VERSION_B: {
    code: 'VERSION_B',
    letter: 'B',
    title: 'Versión B: Pyme & Empresa Clásica',
    badgeTitle: 'Versión B · Pyme Clásica',
    subtitle: 'Gestión Comercial, Facturación Electrónica & Tesorería',
    audience: 'Pymes y Empresas',
    isAgentic: false,
    targetSegment: 'PYME',
    accentColor: 'emerald',
    bgGradient: 'from-slate-900 via-emerald-950 to-slate-900',
    description: 'Orientado a dueños de empresas, gerentes de administración, tesoreros y equipos comerciales de Pymes. Centraliza facturación, compras, cobranza a clientes, pagos y control de inventario sin jerga técnica compleja.',
    keyFeatures: [
      'Emisión de Facturación Electrónica DTE (Facturas afectas/exentas, Boletas, Guías, NC/ND)',
      'Registro y Clasificación de Compras y Ventas (RCV SII en tiempo real)',
      'Control de Cuentas por Cobrar (Clientes) y Cuentas por Pagar (Proveedores)',
      'Nóminas de Pago bancarias masivas para proveedores',
      'Control de Inventario Kardex PMP y catálogo de Productos/Servicios',
      'Fichas de Trabajadores y Liquidaciones de Sueldo individuales/masivas',
      'Flujo de Caja Proyectado a 30/60/90 días y KPIs de Rentabilidad',
      'Resumen tributario ejecutivo de IVA F29'
    ]
  },
  VERSION_C1: {
    code: 'VERSION_C1',
    letter: 'C1',
    title: 'Versión C1: Estudio Contable Agéntico (2040)',
    badgeTitle: 'Versión C1 · Estudio Agéntico 2040 ⚡',
    subtitle: 'ERP Contable Autónomo con Copiloto & Auditoría Continua',
    audience: 'Estudios Contables (Agéntico 2040)',
    isAgentic: true,
    targetSegment: 'STUDY',
    accentColor: 'violet',
    bgGradient: 'from-slate-950 via-violet-950 to-slate-900',
    description: 'El sistema contable del futuro hoy. Potencia todas las herramientas de la Versión A con un conjunto de Agentes Autónomos que auditan la contabilidad 24/7, concilian bancos y anticipan inconsistencias ante el SII.',
    keyFeatures: [
      '🤖 Agente Auditor Autónomo 2040: Detección continua en vivo de descuadres, cuentas huérfanas y errores en retenciones BHR',
      '⚡ Agente Copiloto Tributario F29: Cruce automático RCV vs Asientos con advertencias previas a vencimientos SII',
      '🔮 Conciliador Bancario Autónomo: Emparejamiento inteligente de cartolas contra comprobantes con 1 solo clic',
      '📊 Asesor Ejecutivo de Balances: Generación de informes financieros en lenguaje humano para los clientes del estudio',
      '🛡️ Control de Riesgos Fiscales: Verificación automática de causales de observaciones SII',
      '🚀 Todas las herramientas contables, tributarias y normativas de la Versión A incluidas'
    ]
  },
  VERSION_C2: {
    code: 'VERSION_C2',
    letter: 'C2',
    title: 'Versión C2: Pyme & Empresa Agéntica (2040)',
    badgeTitle: 'Versión C2 · Pyme Agéntica 2040 ⚡',
    subtitle: 'Gestión Empresarial Autónoma, Cobranza Inteligente & CFO Virtual',
    audience: 'Pymes y Empresas (Agéntica 2040)',
    isAgentic: true,
    targetSegment: 'PYME',
    accentColor: 'cyan',
    bgGradient: 'from-slate-950 via-cyan-950 to-slate-900',
    description: 'La gestión empresarial del futuro para Pymes de alto rendimiento. Automatiza la cobranza a clientes, detecta fugas de costos ocultos y entrega respuestas financieras en tiempo real.',
    keyFeatures: [
      '🤖 Agente de Cobranza Inteligente 2040: Scoring de morosidad y generación automática de mensajes de cobro por WhatsApp/Email',
      '🛡️ Agente Cazador de Fugas de Dinero: Alertas de incrementos de costos en proveedores y suscripciones duplicadas',
      '💡 Agente Predictor de Liquidez: Proyección inteligente de caja cruzando DTE emitidos, recibidos y planillas de sueldos',
      '💬 Asistente Financiero Ejecutivo en Vivo: Resuelve al instante dudas como "¿Cuánto IVA pagaré?", "¿Cuáles son mis 3 mayores deudores?"',
      '⚡ Emisión de DTE acelerada y catálogo comercial inteligente con sugerencias de margen',
      '🚀 Todas las herramientas comerciales, operativas y de tesorería de la Versión B incluidas'
    ]
  }
};

export function getSystemFormat(formatKey?: string | null): SystemFormatInfo {
  if (!formatKey) return SYSTEM_FORMATS.VERSION_A;
  const normalized = formatKey.toUpperCase().trim();
  if (normalized === 'VERSION_A' || normalized === 'A') return SYSTEM_FORMATS.VERSION_A;
  if (normalized === 'VERSION_B' || normalized === 'B') return SYSTEM_FORMATS.VERSION_B;
  if (normalized === 'VERSION_C1' || normalized === 'C1') return SYSTEM_FORMATS.VERSION_C1;
  if (normalized === 'VERSION_C2' || normalized === 'C2') return SYSTEM_FORMATS.VERSION_C2;
  return SYSTEM_FORMATS.VERSION_A;
}

export function isFormatAgentic(formatKey?: string | null): boolean {
  const f = getSystemFormat(formatKey);
  return f.isAgentic;
}

export function isFormatPyme(formatKey?: string | null): boolean {
  const f = getSystemFormat(formatKey);
  return f.targetSegment === 'PYME';
}

export function isFormatStudy(formatKey?: string | null): boolean {
  const f = getSystemFormat(formatKey);
  return f.targetSegment === 'STUDY';
}
