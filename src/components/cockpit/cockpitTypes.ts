import { 
  FileText, BookOpen, Layers, Users, Sliders, Scale, Printer, 
  FolderTree, CreditCard, Receipt, TrendingUp, Landmark, ShoppingCart, 
  BarChart3, Settings, Calendar, Download, FileSpreadsheet, 
  ShieldCheck, Boxes, Package, Briefcase, Calculator, Building2, 
  Sparkles, Table as TableIcon, Warehouse as WarehouseIcon
} from 'lucide-react';

export type DockPosition = 'left' | 'right' | 'bottom' | 'hidden';

export type ModuleCategory = 
  | 'FINANZAS' 
  | 'OPERACIONES' 
  | 'TESORERIA' 
  | 'PERSONAL' 
  | 'IMPORTACIONES' 
  | 'IMPUESTOS' 
  | 'INDICADORES' 
  | 'CONFIGURACIONES';

export interface CockpitModuleItem {
  id: string; // matches activeTab string in CompanyAccountingDashboard
  label: string;
  shortLabel: string;
  category: ModuleCategory;
  icon: any;
  colorScheme: 'indigo' | 'emerald' | 'amber' | 'rose' | 'cyan' | 'purple' | 'blue' | 'slate';
  shortcut?: string;
  description: string;
}

export interface WorkspaceTab {
  id: string; // unique tab instance ID
  moduleId: string; // id of the module
  title: string;
  category: ModuleCategory;
  colorScheme: string;
  closable: boolean;
}

export const COCKPIT_MODULE_CATALOG: CockpitModuleItem[] = [
  // --- FINANZAS ---
  {
    id: 'calculator',
    label: 'Calculadora Táctica & Cinta',
    shortLabel: 'Calculadora',
    category: 'FINANZAS',
    icon: Calculator,
    colorScheme: 'amber',
    shortcut: 'Alt+C',
    description: 'Calculadora flotante con historial y cinta de memoria contable'
  },
  {
    id: 'vouchers',
    label: 'Vouchers / Asientos',
    shortLabel: 'Vouchers',
    category: 'FINANZAS',
    icon: FileText,
    colorScheme: 'indigo',
    shortcut: 'Alt+1',
    description: 'Gestión y registro de comprobantes de diario, egreso e ingreso'
  },
  {
    id: 'libroDiario',
    label: 'Libro Diario Oficial',
    shortLabel: 'Diario',
    category: 'FINANZAS',
    icon: BookOpen,
    colorScheme: 'indigo',
    shortcut: 'Alt+2',
    description: 'Registro cronológico y asientos oficiales de contabilidad'
  },
  {
    id: 'libroMayor',
    label: 'Libro Mayor',
    shortLabel: 'Mayor',
    category: 'FINANZAS',
    icon: Layers,
    colorScheme: 'indigo',
    shortcut: 'Alt+3',
    description: 'Movimientos, saldos débito y crédito por cuenta contable'
  },
  {
    id: 'analisisAuxiliares',
    label: 'Auxiliar Cuentas Corrientes',
    shortLabel: 'Auxiliares',
    category: 'FINANZAS',
    icon: Users,
    colorScheme: 'indigo',
    shortcut: 'Alt+4',
    description: 'Análisis de cuentas corrientes de clientes, proveedores y personal'
  },
  {
    id: 'analisisCuentas',
    label: 'Análisis de Cuentas',
    shortLabel: 'Cuentas',
    category: 'FINANZAS',
    icon: Sliders,
    colorScheme: 'indigo',
    description: 'Control de partidas pendientes y calces de cuentas'
  },
  {
    id: 'balance8',
    label: 'Balance 8 Columnas',
    shortLabel: 'Balance 8',
    category: 'FINANZAS',
    icon: Scale,
    colorScheme: 'indigo',
    shortcut: 'Alt+5',
    description: 'Balance tributario oficial de 8 columnas y balance clasificado'
  },
  {
    id: 'balanceIFRS',
    label: 'Balance IFRS / FECU',
    shortLabel: 'IFRS',
    category: 'FINANZAS',
    icon: BarChart3,
    colorScheme: 'indigo',
    description: 'Estados financieros bajo norma internacional IFRS / FECU'
  },
  {
    id: 'reportesAnaliticos',
    label: 'Reportes Analíticos',
    shortLabel: 'Analítica',
    category: 'FINANZAS',
    icon: TableIcon,
    colorScheme: 'indigo',
    description: 'Informes analíticos combinados y resúmenes gerenciales'
  },
  {
    id: 'activoFijo',
    label: 'Activo Fijo & Depreciación',
    shortLabel: 'Activo Fijo',
    category: 'FINANZAS',
    icon: Building2,
    colorScheme: 'indigo',
    description: 'Fichas de bienes, depreciación lineal y corrección monetaria'
  },
  {
    id: 'auditorEstadosFinancieros',
    label: 'Auditor Estados Financieros',
    shortLabel: 'Auditor',
    category: 'FINANZAS',
    icon: ShieldCheck,
    colorScheme: 'purple',
    description: 'Diagnóstico de consistencia y validación contable de balances'
  },
  {
    id: 'smartNotebooks',
    label: 'Cuadernos Inteligentes IA',
    shortLabel: 'IA Notebooks',
    category: 'FINANZAS',
    icon: Sparkles,
    colorScheme: 'purple',
    description: 'Análisis y resúmenes contables asistidos'
  },

  // --- TESORERÍA ---
  {
    id: 'conciliacionBancaria',
    label: 'Conciliación Bancaria',
    shortLabel: 'Conciliación',
    category: 'TESORERIA',
    icon: CreditCard,
    colorScheme: 'cyan',
    shortcut: 'Alt+C',
    description: 'Conciliación inteligente en pantalla completa de cartolas vs libros'
  },
  {
    id: 'libroBancoColaborativo',
    label: 'Libro Banco (Aclaraciones)',
    shortLabel: 'Libro Banco',
    category: 'TESORERIA',
    icon: Landmark,
    colorScheme: 'cyan',
    description: 'Cartola de movimientos bancarios y aclaración colaborativa'
  },
  {
    id: 'nominasPago',
    label: 'Nóminas de Pago',
    shortLabel: 'Nóminas Pago',
    category: 'TESORERIA',
    icon: Landmark,
    colorScheme: 'cyan',
    description: 'Generación de archivos bancarios para transferencias a proveedores'
  },
  {
    id: 'cobranza',
    label: 'Cobranza & Cartera',
    shortLabel: 'Cobranza',
    category: 'TESORERIA',
    icon: TrendingUp,
    colorScheme: 'cyan',
    description: 'Gestión de cartera vencida, morosidad y compromisos de pago'
  },
  {
    id: 'flujoDeCaja',
    label: 'Flujo de Caja Real',
    shortLabel: 'Flujo Caja',
    category: 'TESORERIA',
    icon: TrendingUp,
    colorScheme: 'cyan',
    description: 'Proyección y control de ingresos y egresos efectivos'
  },

  // --- OPERACIONES ---
  {
    id: 'operativaComercial',
    label: 'Gestión Comercial',
    shortLabel: 'Comercial',
    category: 'OPERACIONES',
    icon: ShoppingCart,
    colorScheme: 'emerald',
    description: 'Cotizaciones, órdenes de venta y notas de pedido'
  },
  {
    id: 'emisionDte',
    label: 'Emisión DTE / Facturas',
    shortLabel: 'Emisión DTE',
    category: 'OPERACIONES',
    icon: FileSpreadsheet,
    colorScheme: 'emerald',
    description: 'Generación y timbraje de facturas electrónicas y notas de crédito'
  },
  {
    id: 'stockKardex',
    label: 'Control de Stock & Kardex',
    shortLabel: 'Kardex',
    category: 'OPERACIONES',
    icon: Package,
    colorScheme: 'emerald',
    description: 'Movimientos de entrada/salida y costo promedio ponderado'
  },
  {
    id: 'warehouses',
    label: 'Bodegas y Almacenes',
    shortLabel: 'Bodegas',
    category: 'OPERACIONES',
    icon: WarehouseIcon,
    colorScheme: 'emerald',
    description: 'Ubicaciones físicas y transferencias entre bodegas'
  },
  {
    id: 'productsServices',
    label: 'Catálogo Productos / Servicios',
    shortLabel: 'Productos',
    category: 'OPERACIONES',
    icon: Boxes,
    colorScheme: 'emerald',
    description: 'Maestro de ítems, precios y codificación comercial'
  },

  // --- IMPORTACIONES / SII ---
  {
    id: 'rcv',
    label: 'Carga RCV Compra/Venta',
    shortLabel: 'RCV SII',
    category: 'IMPORTACIONES',
    icon: Download,
    colorScheme: 'amber',
    shortcut: 'Alt+R',
    description: 'Sincronización directa y contabilización de compras y ventas SII'
  },
  {
    id: 'cargaMasiva',
    label: 'Carga Masiva Comprobantes',
    shortLabel: 'Carga Masiva',
    category: 'IMPORTACIONES',
    icon: FileSpreadsheet,
    colorScheme: 'amber',
    description: 'Importación masiva de asientos desde plantillas Excel'
  },
  {
    id: 'plantillasCarga',
    label: 'Plantillas de Carga',
    shortLabel: 'Plantillas',
    category: 'IMPORTACIONES',
    icon: FileSpreadsheet,
    colorScheme: 'amber',
    description: 'Estructuras y modelos descargables para importaciones'
  },

  // --- IMPUESTOS ---
  {
    id: 'formulario29',
    label: 'Impuestos F29 (IVA)',
    shortLabel: 'Form. 29',
    category: 'IMPUESTOS',
    icon: Receipt,
    colorScheme: 'rose',
    shortcut: 'Alt+F',
    description: 'Cálculo de débito, crédito fiscal, PPM y propuesta Formulario 29'
  },
  {
    id: 'ddjj',
    label: 'Declaraciones Juradas SII',
    shortLabel: 'DDJJ SII',
    category: 'IMPUESTOS',
    icon: ShieldCheck,
    colorScheme: 'rose',
    description: 'Generación de DJ 1887, 1879 y declaraciones de renta anual'
  },
  {
    id: 'controlFolios',
    label: 'Timbraje y Folios SII',
    shortLabel: 'Folios SII',
    category: 'IMPUESTOS',
    icon: Printer,
    colorScheme: 'rose',
    description: 'Control de CAF y disponibilidad de folios electrónicos'
  },

  // --- PERSONAL ---
  {
    id: 'employees',
    label: 'Ficha de Empleados',
    shortLabel: 'Empleados',
    category: 'PERSONAL',
    icon: Briefcase,
    colorScheme: 'blue',
    description: 'Contratos, fichas previsionales y datos del personal'
  },
  {
    id: 'liquidaciones',
    label: 'Liquidaciones de Sueldos',
    shortLabel: 'Sueldos',
    category: 'PERSONAL',
    icon: Calculator,
    colorScheme: 'blue',
    description: 'Cálculo de remuneraciones, LRD y centralización contable'
  },

  // --- INDICADORES ---
  {
    id: 'indicadoresFinancieros',
    label: 'Indicadores & KPIs',
    shortLabel: 'KPIs',
    category: 'INDICADORES',
    icon: TrendingUp,
    colorScheme: 'cyan',
    description: 'Ratios de liquidez, solvencia, rentabilidad y endeudamiento'
  },

  // --- CONFIGURACIONES ---
  {
    id: 'accounts',
    label: 'Plan de Cuentas',
    shortLabel: 'Plan Cuentas',
    category: 'CONFIGURACIONES',
    icon: FolderTree,
    colorScheme: 'slate',
    description: 'Estructura contable, codificación y atributos de cuentas'
  },
  {
    id: 'auxiliaries',
    label: 'Maestro de Auxiliares',
    shortLabel: 'Clientes/Prov',
    category: 'CONFIGURACIONES',
    icon: Users,
    colorScheme: 'slate',
    description: 'Catálogo de clientes, proveedores y otros auxiliares'
  },
  {
    id: 'periods',
    label: 'Períodos Contables',
    shortLabel: 'Períodos',
    category: 'CONFIGURACIONES',
    icon: Calendar,
    colorScheme: 'slate',
    description: 'Apertura y cierre mensual de años contables'
  },
  {
    id: 'tablasAnalisis',
    label: 'Catálogos de Análisis',
    shortLabel: 'Centros Costo',
    category: 'CONFIGURACIONES',
    icon: FolderTree,
    colorScheme: 'slate',
    description: 'Centros de costo, ítems de gasto y proyectos'
  },
  {
    id: 'agenticStudy2040',
    label: 'Auditoría Agéntica 2040',
    shortLabel: 'Agéntico 2040',
    category: 'FINANZAS',
    icon: Sparkles,
    colorScheme: 'purple',
    description: 'Centro de control agéntico autónomo'
  }
];

export const CATEGORY_COLORS: Record<ModuleCategory, { bg: string; text: string; border: string; glow: string }> = {
  FINANZAS: { bg: 'bg-indigo-500/15', text: 'text-indigo-400', border: 'border-indigo-500/30', glow: 'shadow-indigo-500/20' },
  OPERACIONES: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30', glow: 'shadow-emerald-500/20' },
  TESORERIA: { bg: 'bg-cyan-500/15', text: 'text-cyan-400', border: 'border-cyan-500/30', glow: 'shadow-cyan-500/20' },
  PERSONAL: { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30', glow: 'shadow-blue-500/20' },
  IMPORTACIONES: { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30', glow: 'shadow-amber-500/20' },
  IMPUESTOS: { bg: 'bg-rose-500/15', text: 'text-rose-400', border: 'border-rose-500/30', glow: 'shadow-rose-500/20' },
  INDICADORES: { bg: 'bg-teal-500/15', text: 'text-teal-400', border: 'border-teal-500/30', glow: 'shadow-teal-500/20' },
  CONFIGURACIONES: { bg: 'bg-slate-500/15', text: 'text-slate-400', border: 'border-slate-500/30', glow: 'shadow-slate-500/20' },
};
