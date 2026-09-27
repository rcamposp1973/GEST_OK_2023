import { StudyModulePermissions, SystemAppFormat } from '../types';

export type StudyPlanCode = 
  | 'PLAN_ENTRADA' 
  | 'PLAN_ESTUDIO_10' 
  | 'PLAN_ESTUDIO_FULL' 
  | 'PLAN_CORPORATIVO' 
  | 'PLAN_ENTRADA_AGENTICO' 
  | 'PLAN_ESTUDIO_10_AGENTICO' 
  | 'PLAN_ESTUDIO_FULL_AGENTICO' 
  | 'PLAN_PYME_AGENTICO' 
  | 'CUSTOM';

export interface SubscriptionPlanDefinition {
  code: StudyPlanCode;
  name: string;
  appFormat?: SystemAppFormat;
  priceUF: number | null; // null = A Convenir
  priceText: string;
  period: string;
  popular?: boolean;
  badge?: string;
  subtitle: string;
  description: string;
  maxCompanies: number;
  maxUsers: number;
  features: string[];
  defaultModules: StudyModulePermissions;
  order: number;
}

export interface SystemModuleMetadata {
  key: keyof StudyModulePermissions;
  label: string;
  category: 'CONTABILIDAD' | 'TRIBUTARIO' | 'BANCOS_TESORERIA' | 'GESTION_COMERCIAL' | 'RECURSOS_HUMANOS' | 'AVANZADO';
  description: string;
  icon: string;
  isAddonForBasic?: boolean;
}

export const SYSTEM_MODULES_CATALOG: SystemModuleMetadata[] = [
  // 1. Contabilidad Base
  {
    key: 'contabilidadBase',
    label: 'Contabilidad Base & Libros Oficiales',
    category: 'CONTABILIDAD',
    description: 'Vouchers contables, Libro Diario, Libro Mayor, Auxiliares de Cuentas Corrientes y Balance 8 Columnas Tributario.',
    icon: '📚'
  },
  {
    key: 'ifrsAuditoria',
    label: 'Balance IFRS & Auditor de EEFF',
    category: 'CONTABILIDAD',
    description: 'Balance Clasificado IFRS, Estado de Resultados por Función/Naturaleza y Auditoría de Estados Financieros con dictamen.',
    icon: '⚖️',
    isAddonForBasic: true
  },
  // 2. Tributario
  {
    key: 'rcvSii',
    label: 'Registro de Compras y Ventas (RCV SII)',
    category: 'TRIBUTARIO',
    description: 'Sincronización e importación automática RCV (Compras, Ventas, Honorarios BHR), centralización contable en 1 click.',
    icon: '⚡'
  },
  {
    key: 'formulario29',
    label: 'Formulario 29 Mensual (F29 Oficial)',
    category: 'TRIBUTARIO',
    description: 'Propuesta automática F29 con Códigos SII oficiales (538, 537, 504, 151, 62), PPM dinámico y exportación.',
    icon: '📋'
  },
  // 3. Bancos y Tesorería
  {
    key: 'cartolasBancarias',
    label: 'Importación Masiva de Cartolas Bancarias',
    category: 'BANCOS_TESORERIA',
    description: 'Carga de extractos bancarios en Excel/CSV (Banco de Chile, Santander, BCI, BancoEstado, Scotiabank, Itaú, etc.).',
    icon: '🏦'
  },
  {
    key: 'conciliacionBancaria',
    label: 'Conciliación Bancaria Inteligente',
    category: 'BANCOS_TESORERIA',
    description: 'Cruce automático de movimientos bancarios contra comprobantes contables por monto, fecha y número de documento.',
    icon: '🔍',
    isAddonForBasic: true
  },
  {
    key: 'tesoreria',
    label: 'Tesorería, Nóminas de Pago & Cobranza',
    category: 'BANCOS_TESORERIA',
    description: 'Generación de nóminas bancarias para proveedores, seguimiento de cuentas por cobrar y gestión de cobranza.',
    icon: '💳',
    isAddonForBasic: true
  },
  // 4. Reportes & KPIs
  {
    key: 'kpisIndicadores',
    label: 'Indicadores Financieros (KPIs) & Flujo de Caja',
    category: 'AVANZADO',
    description: 'Tablero ejecutivo con ratios de liquidez, solvencia, rentabilidad, EBITDA y proyección de flujo de caja.',
    icon: '📊',
    isAddonForBasic: true
  },
  // 5. Comercial & Inventario
  {
    key: 'comercialInventario',
    label: 'Módulo Comercial, Emisión DTE & Kardex',
    category: 'GESTION_COMERCIAL',
    description: 'Facturación Electrónica DTE, catálogo de productos/servicios, cotizaciones, órdenes de compra e inventario Kardex PMP.',
    icon: '📦',
    isAddonForBasic: true
  },
  // 6. Personal & Remuneraciones
  {
    key: 'remuneraciones',
    label: 'Personal, Liquidaciones & Previred',
    category: 'RECURSOS_HUMANOS',
    description: 'Fichas de empleados, contratos, cálculo de liquidaciones de sueldo con topes legales, archivo Previred (105 campos) y LRD DT.',
    icon: '👥',
    isAddonForBasic: true
  },
  // 7. Visor para Clientes
  {
    key: 'visorClientes',
    label: 'Visor / Portal de Clientes',
    category: 'AVANZADO',
    description: 'Acceso seguro para que los clientes del estudio o empresa consulten sus balances, F29 y reportes en tiempo real.',
    icon: '🌐',
    isAddonForBasic: true
  },
  // 8. Copiloto IA
  {
    key: 'copilotoIA',
    label: 'Copiloto de Auditoría IA & Cuadernos',
    category: 'AVANZADO',
    description: 'Asistente de inteligencia artificial para detección preventiva de inconsistencias tributarias y cuadernos de análisis.',
    icon: '✨',
    isAddonForBasic: true
  }
];

export const OFFICIAL_SUBSCRIPTION_PLANS: Record<StudyPlanCode, SubscriptionPlanDefinition> = {
  PLAN_ENTRADA: {
    code: 'PLAN_ENTRADA',
    name: 'Plan de Entrada',
    priceUF: 0.5,
    priceText: 'UF 0,5 + IVA',
    period: '/ mes + IVA',
    popular: false,
    badge: 'Individual / 1 Empresa',
    subtitle: 'Plan individual para una empresa, solo contabilidad.',
    description: 'Ideal para contadores con empresas individuales o pymes que requieren contabilidad tributaria esencial y RCV.',
    maxCompanies: 1,
    maxUsers: 1,
    features: [
      '1 Empresa / RUT Comercial',
      'Contabilidad Base y Libros Oficiales (Diario, Mayor, Auxiliares)',
      'Sincronización RCV Automática con SII (Compras, Ventas, BHR)',
      'Formulario 29 con Códigos SII oficiales',
      'Importación masiva de cartolas bancarias',
      'Actualizaciones tributarias automáticas'
    ],
    defaultModules: {
      contabilidadBase: true,
      rcvSii: true,
      formulario29: true,
      cartolasBancarias: true,
      conciliacionBancaria: false,
      kpisIndicadores: false,
      ifrsAuditoria: false,
      comercialInventario: false,
      tesoreria: false,
      remuneraciones: false,
      visorClientes: false,
      copilotoIA: false
    },
    order: 1
  },
  PLAN_ESTUDIO_10: {
    code: 'PLAN_ESTUDIO_10',
    name: 'Plan Estudio 10',
    priceUF: 1.2,
    priceText: 'UF 1,2 + IVA',
    period: '/ mes + IVA',
    popular: false,
    badge: '10 Empresas / 2 Usuarios',
    subtitle: 'Plan para 2 usuarios y 10 empresas.',
    description: 'Diseñado para contadores independientes y pequeños estudios contables con cartera en expansión.',
    maxCompanies: 10,
    maxUsers: 2,
    features: [
      '10 Empresas / Clientes',
      '2 Usuarios: 1 Administrador + 1 Analista Contable',
      'Balance 8 Columnas e IFRS Auditado',
      'Conciliación Bancaria Inteligente',
      'Libros Diario, Mayor y Auxiliares analíticos con exportación Excel',
      'Indicadores Financieros (KPIs) y Ratios',
      'Asistencia en la Implementación y puesta en marcha de 5 empresas',
      'Sincronización RCV y Formulario 29 SII'
    ],
    defaultModules: {
      contabilidadBase: true,
      rcvSii: true,
      formulario29: true,
      cartolasBancarias: true,
      conciliacionBancaria: true,
      kpisIndicadores: true,
      ifrsAuditoria: true,
      comercialInventario: false,
      tesoreria: true,
      remuneraciones: false,
      visorClientes: false,
      copilotoIA: false
    },
    order: 2
  },
  PLAN_ESTUDIO_FULL: {
    code: 'PLAN_ESTUDIO_FULL',
    name: 'Plan Estudio Full',
    priceUF: 2.4,
    priceText: 'UF 2,4 + IVA',
    period: '/ mes + IVA',
    popular: true,
    badge: 'Más Popular / 100 Empresas',
    subtitle: 'Plan para 4 usuarios y 100 empresas.',
    description: 'La solución definitiva para estudios contables medianos y consolidados que buscan máxima productividad y servicio al cliente.',
    maxCompanies: 100,
    maxUsers: 4,
    features: [
      '100 Empresas / Clientes',
      '4 Usuarios: 1 Administrador + 3 Analistas',
      'Balance 8 Columnas e IFRS con Dictamen',
      'Conciliación Bancaria Inteligente',
      'Libros Diario, Mayor y Auxiliares analíticos con exportación Excel',
      'Indicadores Financieros (KPIs) y Flujo de Caja',
      'Asistencia en la Implementación y puesta en marcha de 5 empresas',
      'Visor para Clientes (Portal de consulta online)',
      'Todos los módulos contables y tributarios activos'
    ],
    defaultModules: {
      contabilidadBase: true,
      rcvSii: true,
      formulario29: true,
      cartolasBancarias: true,
      conciliacionBancaria: true,
      kpisIndicadores: true,
      ifrsAuditoria: true,
      comercialInventario: true,
      tesoreria: true,
      remuneraciones: true,
      visorClientes: true,
      copilotoIA: true
    },
    order: 3
  },
  PLAN_CORPORATIVO: {
    code: 'PLAN_CORPORATIVO',
    name: 'Plan Corporativo / PYMES',
    appFormat: 'VERSION_B',
    priceUF: 4.0,
    priceText: 'Desde UF 4,0 + IVA',
    period: '/ mes + IVA',
    popular: false,
    badge: 'Pyme Clásica / Versión B',
    subtitle: 'Módulos y Usuarios a convenir según requerimientos.',
    description: 'Solución integral para pymes y empresas comerciales tradicionales con facturación DTE y tesorería.',
    maxCompanies: 500,
    maxUsers: 20,
    features: [
      'Empresas y Usuarios a convenir (escalable)',
      'Facturación Electrónica DTE y Gestión Comercial',
      'Tesorería, Cobranzas y Cartolas Bancarias',
      'Libros Diario, Mayor y Auxiliares',
      'Soporte prioritario y puesta en marcha'
    ],
    defaultModules: {
      contabilidadBase: true,
      rcvSii: true,
      formulario29: true,
      cartolasBancarias: true,
      conciliacionBancaria: true,
      kpisIndicadores: true,
      ifrsAuditoria: true,
      comercialInventario: true,
      tesoreria: true,
      remuneraciones: true,
      visorClientes: true,
      copilotoIA: false
    },
    order: 4
  },
  PLAN_ENTRADA_AGENTICO: {
    code: 'PLAN_ENTRADA_AGENTICO',
    name: 'Plan de Entrada Agéntico',
    appFormat: 'VERSION_C1',
    priceUF: 0.7,
    priceText: 'UF 0,7 + IVA',
    period: '/ mes + IVA',
    popular: false,
    badge: 'Agéntico 2040 ⚡ / 1 Empresa',
    subtitle: '1 empresa con Auditor Autónomo de Cuadraturas 2040.',
    description: 'Ideal para contadores individuales que desean auditar en tiempo real con agentes autónomos.',
    maxCompanies: 1,
    maxUsers: 1,
    features: [
      '1 Empresa / RUT Comercial',
      '🤖 Agente Auditor Autónomo 2040 en tiempo real',
      '⚡ Copiloto Tributario F29 con alertas preventivas SII',
      'Contabilidad Base y Libros Oficiales',
      'Sincronización RCV Automática con SII'
    ],
    defaultModules: {
      contabilidadBase: true,
      rcvSii: true,
      formulario29: true,
      cartolasBancarias: true,
      conciliacionBancaria: true,
      kpisIndicadores: false,
      ifrsAuditoria: false,
      comercialInventario: false,
      tesoreria: false,
      remuneraciones: false,
      visorClientes: false,
      copilotoIA: true
    },
    order: 5
  },
  PLAN_ESTUDIO_10_AGENTICO: {
    code: 'PLAN_ESTUDIO_10_AGENTICO',
    name: 'Plan Estudio 10 Agéntico',
    appFormat: 'VERSION_C1',
    priceUF: 1.6,
    priceText: 'UF 1,6 + IVA',
    period: '/ mes + IVA',
    popular: false,
    badge: 'Agéntico 2040 ⚡ / 10 Empresas',
    subtitle: 'Plan para 2 usuarios y 10 empresas con Agentes Autónomos.',
    description: 'Estudios contables que automatizan conciliaciones, detección de descuadraturas y reportes ejecutivos.',
    maxCompanies: 10,
    maxUsers: 2,
    features: [
      '10 Empresas / Clientes',
      '2 Usuarios: 1 Administrador + 1 Analista',
      '🤖 Agente Auditor Autónomo 2040 continuo',
      '⚡ Copiloto Tributario F29 y Cruce RCV',
      'Conciliación Bancaria Agéntica Inteligente',
      'Balance 8 Columnas e IFRS Auditado'
    ],
    defaultModules: {
      contabilidadBase: true,
      rcvSii: true,
      formulario29: true,
      cartolasBancarias: true,
      conciliacionBancaria: true,
      kpisIndicadores: true,
      ifrsAuditoria: true,
      comercialInventario: false,
      tesoreria: true,
      remuneraciones: false,
      visorClientes: false,
      copilotoIA: true
    },
    order: 6
  },
  PLAN_ESTUDIO_FULL_AGENTICO: {
    code: 'PLAN_ESTUDIO_FULL_AGENTICO',
    name: 'Plan Estudio Full Agéntico',
    appFormat: 'VERSION_C1',
    priceUF: 3.2,
    priceText: 'UF 3,2 + IVA',
    period: '/ mes + IVA',
    popular: true,
    badge: 'Agéntico 2040 ⚡ / 100 Empresas',
    subtitle: 'El estándar del 2040 para 4 usuarios y 100 empresas.',
    description: 'Máximo rendimiento para firmas contables con auditoría autónoma 24/7 y generación automática de dictámenes.',
    maxCompanies: 100,
    maxUsers: 4,
    features: [
      '100 Empresas / Clientes',
      '4 Usuarios: 1 Administrador + 3 Analistas',
      '🤖 Centro de Mando Agéntico 2040 Completo',
      '⚡ Copiloto SII 24/7 y Auditor Preventivo F29',
      'Conciliación Bancaria Automática con IA',
      'Balance 8 Columnas e IFRS con Dictamen',
      'Visor para Clientes con Asistente Virtual'
    ],
    defaultModules: {
      contabilidadBase: true,
      rcvSii: true,
      formulario29: true,
      cartolasBancarias: true,
      conciliacionBancaria: true,
      kpisIndicadores: true,
      ifrsAuditoria: true,
      comercialInventario: true,
      tesoreria: true,
      remuneraciones: true,
      visorClientes: true,
      copilotoIA: true
    },
    order: 7
  },
  PLAN_PYME_AGENTICO: {
    code: 'PLAN_PYME_AGENTICO',
    name: 'Plan Pyme Agéntico',
    appFormat: 'VERSION_C2',
    priceUF: 5.3,
    priceText: 'Desde UF 5,3 + IVA',
    period: '/ mes + IVA',
    popular: false,
    badge: 'Pyme Agéntica 2040 ⚡',
    subtitle: 'CFO Virtual Autónomo, Cobranza Inteligente y Cazador de Fugas.',
    description: 'Para empresas y pymes que desean automatizar cobranzas WhatsApp, detectar fugas de dinero y proyectar flujo de caja.',
    maxCompanies: 50,
    maxUsers: 10,
    features: [
      '🤖 Agente de Cobranza Inteligente WhatsApp',
      '🛡️ Cazador de Fugas de Dinero y Gastos Fantasma',
      '💬 Asistente Financiero Ejecutivo CFO 2040 en vivo',
      '📈 Proyección de Flujo de Caja Predictivo a 30/60/90 días',
      'Facturación DTE, Inventario Kardex y Tesorería',
      'Soporte prioritario y configuración personalizada'
    ],
    defaultModules: {
      contabilidadBase: true,
      rcvSii: true,
      formulario29: true,
      cartolasBancarias: true,
      conciliacionBancaria: true,
      kpisIndicadores: true,
      ifrsAuditoria: true,
      comercialInventario: true,
      tesoreria: true,
      remuneraciones: true,
      visorClientes: true,
      copilotoIA: true
    },
    order: 8
  },
  CUSTOM: {
    code: 'CUSTOM',
    name: 'Plan Personalizado',
    priceUF: null,
    priceText: 'Tarifa a la Medida',
    period: '/ personalizado',
    popular: false,
    badge: 'A Medida',
    subtitle: 'Configuración personalizada de empresas, usuarios y módulos.',
    description: 'Ajuste granular de capacidades y módulos adicionales para clientes con necesidades específicas.',
    maxCompanies: 10,
    maxUsers: 2,
    features: [
      'Capacidades y módulos configurables a medida',
      'Activación de módulos individuales por cobro adicional'
    ],
    defaultModules: {
      contabilidadBase: true,
      rcvSii: true,
      formulario29: true,
      cartolasBancarias: true,
      conciliacionBancaria: false,
      kpisIndicadores: false,
      ifrsAuditoria: false,
      comercialInventario: false,
      tesoreria: false,
      remuneraciones: false,
      visorClientes: false,
      copilotoIA: false
    },
    order: 5
  }
};

/**
 * Obtener la lista ordenada de planes oficiales (Clásicos y Agénticos 2040)
 */
export function getOfficialPlansList(): SubscriptionPlanDefinition[] {
  return [
    // Formato A: Estudio Clásico
    OFFICIAL_SUBSCRIPTION_PLANS.PLAN_ENTRADA,
    OFFICIAL_SUBSCRIPTION_PLANS.PLAN_ESTUDIO_10,
    OFFICIAL_SUBSCRIPTION_PLANS.PLAN_ESTUDIO_FULL,
    // Formato B: Pyme Clásica
    OFFICIAL_SUBSCRIPTION_PLANS.PLAN_CORPORATIVO,
    // Formato C1: Estudio Agéntico 2040
    OFFICIAL_SUBSCRIPTION_PLANS.PLAN_ENTRADA_AGENTICO,
    OFFICIAL_SUBSCRIPTION_PLANS.PLAN_ESTUDIO_10_AGENTICO,
    OFFICIAL_SUBSCRIPTION_PLANS.PLAN_ESTUDIO_FULL_AGENTICO,
    // Formato C2: Pyme Agéntica 2040
    OFFICIAL_SUBSCRIPTION_PLANS.PLAN_PYME_AGENTICO
  ];
}

/**
 * Obtener los módulos por defecto según código de plan
 */
export function getDefaultModulesForPlan(planCode?: string | null): StudyModulePermissions {
  if (!planCode) return { ...OFFICIAL_SUBSCRIPTION_PLANS.PLAN_ESTUDIO_10.defaultModules };
  const plan = OFFICIAL_SUBSCRIPTION_PLANS[planCode as StudyPlanCode];
  if (plan) {
    return { ...plan.defaultModules };
  }
  return { ...OFFICIAL_SUBSCRIPTION_PLANS.PLAN_ESTUDIO_10.defaultModules };
}

/**
 * Validador de acceso a un módulo específico
 */
export function hasModuleAccess(
  entity: { modules?: StudyModulePermissions; planCode?: string } | null | undefined,
  moduleKey: keyof StudyModulePermissions
): boolean {
  if (!entity) return true; // Por defecto permitir si no hay restricciones explícitas
  if (entity.modules && typeof entity.modules[moduleKey] === 'boolean') {
    return entity.modules[moduleKey] === true;
  }
  // Si no tiene matriz explícita, consultar módulos del plan
  if (entity.planCode && OFFICIAL_SUBSCRIPTION_PLANS[entity.planCode as StudyPlanCode]) {
    const plan = OFFICIAL_SUBSCRIPTION_PLANS[entity.planCode as StudyPlanCode];
    return Boolean(plan.defaultModules[moduleKey]);
  }
  return true;
}
