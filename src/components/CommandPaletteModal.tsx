import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Search, BookOpen, Users, FileText, Calculator, Building2, 
  ShieldCheck, Landmark, Sparkles, ArrowRight, X, ArrowDown, ArrowUp,
  TrendingUp, BarChart3, Calendar, Receipt, Download, ShoppingCart,
  Package, Boxes, FileSpreadsheet, Sliders, Table as TableIcon,
  CreditCard, Briefcase, Settings, Printer, Warehouse as WarehouseIcon
} from 'lucide-react';
import { ChartOfAccount, Auxiliary, Voucher } from '../types';
import { compareAccountCodes, compareRuts } from '../utils/sortingUtils';

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToView: (viewKey: string) => void;
  accounts?: ChartOfAccount[];
  auxiliaries?: Auxiliary[];
  vouchers?: Voucher[];
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  onNavigateToView,
  accounts = [],
  auxiliaries = [],
  vouchers = []
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Command items definition with all modules
  const navigationItems = [
    // FINANZAS
    { type: 'NAV', key: 'VOUCHERS', title: 'Vouchers / Asientos de Diario', subtitle: 'Ingreso, edición y anulación de comprobantes contables', icon: FileText },
    { type: 'NAV', key: 'LIBRO_DIARIO', title: 'Libro Diario Oficial', subtitle: 'Registro cronológico y asientos oficiales de contabilidad', icon: BookOpen },
    { type: 'NAV', key: 'LIBRO_MAYOR', title: 'Libro Mayor', subtitle: 'Movimientos, saldos débito y crédito por cuenta contable', icon: BookOpen },
    { type: 'NAV', key: 'BALANCE_8_COLUMNAS', title: 'Balance de 8 Columnas', subtitle: 'Balance Tributario oficial de 8 columnas y balance clasificado', icon: Calculator },
    { type: 'NAV', key: 'BALANCE_IFRS', title: 'Balance Clasificado IFRS / FECU', subtitle: 'Estados financieros bajo norma internacional IFRS / FECU', icon: BarChart3 },
    { type: 'NAV', key: 'ESTADO_RESULTADOS', title: 'Estado de Resultados IFRS', subtitle: 'Estado de resultados por función y matriz de 12 meses', icon: TrendingUp },
    { type: 'NAV', key: 'ANALISIS_AUXILIARES', title: 'Auxiliar Cuentas Corrientes', subtitle: 'Análisis de cuentas corrientes de clientes, proveedores y personal', icon: Users },
    { type: 'NAV', key: 'ANALISIS_CUENTAS', title: 'Análisis de Cuentas', subtitle: 'Control de partidas pendientes y calces de cuentas', icon: Sliders },
    { type: 'NAV', key: 'REPORTES_ANALITICOS', title: 'Reportes Analíticos', subtitle: 'Informes analíticos combinados y resúmenes gerenciales', icon: TableIcon },
    { type: 'NAV', key: 'ACTIVO_FIJO', title: 'Activo Fijo y Depreciación Dual', subtitle: 'Cuadro de activo fijo Art. 31 LIR e IFRS con corrección monetaria', icon: Building2 },
    { type: 'NAV', key: 'AUDITOR_ESTADOS_FINANCIEROS', title: 'Auditor Estados Financieros', subtitle: 'Diagnóstico de consistencia y validación contable de balances', icon: ShieldCheck },
    { type: 'NAV', key: 'CALCULADORA', title: 'Calculadora Táctica & Cinta', subtitle: 'Calculadora flotante con historial y cinta de memoria contable', icon: Calculator },
    { type: 'NAV', key: 'AGENTIC_STUDY', title: 'Auditoría Agéntica 2040', subtitle: 'Centro de control agéntico autónomo para estudios', icon: Sparkles },
    { type: 'NAV', key: 'AGENTIC_PYME', title: 'Hub Agéntico Pyme 2040', subtitle: 'Centro de control y supervisión agéntica para empresas Pyme', icon: Sparkles },

    // TESORERIA
    { type: 'NAV', key: 'CONCILIACION_BANCARIA', title: 'Conciliación Bancaria Inteligente', subtitle: 'Cuadratura de cartolas bancarias y calce automático', icon: Landmark },
    { type: 'NAV', key: 'LIBRO_BANCO_COLABORATIVO', title: 'Libro Banco - Cartola', subtitle: 'Control acumulado de cartola bancaria y contabilización de movimientos', icon: Landmark },
    { type: 'NAV', key: 'NOMINAS_PAGO', title: 'Nóminas de Pago', subtitle: 'Gestión y emisión de nóminas bancarias de pago', icon: CreditCard },
    { type: 'NAV', key: 'COBRANZA', title: 'Cobranza & Cartera', subtitle: 'Gestión de cobro a clientes y antigüedad de saldos', icon: TrendingUp },
    { type: 'NAV', key: 'FLUJO_CAJA', title: 'Flujo de Caja Real', subtitle: 'Proyección y control de ingresos y egresos de caja', icon: TrendingUp },

    // OPERACIONES
    { type: 'NAV', key: 'OPERATIVA_COMERCIAL', title: 'Gestión Comercial (Compras & Ventas)', subtitle: 'Emisión de notas de venta, órdenes de compra y facturación', icon: ShoppingCart },
    { type: 'NAV', key: 'EMISION_DTE', title: 'Emisión Directa DTE SII', subtitle: 'Facturador electrónico directo conectado con el SII', icon: FileSpreadsheet },
    { type: 'NAV', key: 'STOCK_KARDEX', title: 'Control de Stock & Kardex', subtitle: 'Movimientos de inventario valorizado por método PMP', icon: Package },
    { type: 'NAV', key: 'WAREHOUSES', title: 'Bodegas y Almacenes', subtitle: 'Gestión multi-bodega y control de existencias', icon: WarehouseIcon },
    { type: 'NAV', key: 'PRODUCTS_SERVICES', title: 'Catálogo de Productos & Servicios', subtitle: 'Catálogo comercial, listas de precio y códigos de barra', icon: Boxes },

    // CARGA SII
    { type: 'NAV', key: 'RCV_SII', title: 'Carga RCV Compra/Venta SII', subtitle: 'Sincronización oficial de compras y ventas SII', icon: Download },
    { type: 'NAV', key: 'RCV_PARAMS', title: 'Parámetros Contables RCV', subtitle: 'Reglas de contabilización automática de compras y ventas', icon: Settings },
    { type: 'NAV', key: 'CARGA_MASIVA', title: 'Carga Masiva de Comprobantes', subtitle: 'Importación por lote de vouchers desde Excel / CSV', icon: FileSpreadsheet },
    { type: 'NAV', key: 'PLANTILLAS_CARGA', title: 'Plantillas de Carga Masiva', subtitle: 'Formatos para plan de cuentas, auxiliares y asientos', icon: FileSpreadsheet },

    // IMPUESTOS
    { type: 'NAV', key: 'FORMULARIO_29', title: 'Impuestos F29 (IVA)', subtitle: 'Cálculo de IVA débito, crédito y propuesta Formulario 29', icon: Receipt },
    { type: 'NAV', key: 'F29_CODES', title: 'Parámetros y Códigos F.29', subtitle: 'Mapeo de códigos SII con cuentas contables', icon: Sliders },
    { type: 'NAV', key: 'DDJJ_SII', title: 'Declaraciones Juradas SII (DDJJ)', subtitle: 'DJ 1887, DJ 1879 y DJ 1847 para Operación Renta', icon: ShieldCheck },
    { type: 'NAV', key: 'CONTROL_FOLIOS', title: 'Timbraje y Control de Folios SII', subtitle: 'Administración de CAF y folios autorizados por el SII', icon: Printer },

    // PERSONAL
    { type: 'NAV', key: 'EMPLOYEES', title: 'Ficha de Empleados & Contratos', subtitle: 'Gestión de trabajadores, contratos y fichas de personal', icon: Briefcase },
    { type: 'NAV', key: 'REMUNERACIONES', title: 'Remuneraciones y LRD', subtitle: 'Liquidaciones de sueldo, Previred y LRD DT', icon: Users },

    // INDICADORES
    { type: 'NAV', key: 'INDICADORES_FINANCIEROS', title: 'Indicadores Financieros & KPIs', subtitle: 'Ratios de liquidez, solvencia, rentabilidad y apalancamiento', icon: TrendingUp },
    { type: 'NAV', key: 'INDICADORES_ECONOMICOS', title: 'Indicadores Económicos (UF / USD / UTM)', subtitle: 'Valores oficiales del Banco Central y SII', icon: Calendar },

    // CONFIGURACIONES
    { type: 'NAV', key: 'PLAN_CUENTAS', title: 'Plan de Cuentas Contable', subtitle: 'Ver, agregar y editar estructura de cuentas contables', icon: BookOpen },
    { type: 'NAV', key: 'AUXILIARES', title: 'Maestro de Auxiliares', subtitle: 'Catálogo de clientes, proveedores y otros auxiliares', icon: Users },
    { type: 'NAV', key: 'PERIODOS', title: 'Períodos Contables', subtitle: 'Apertura y cierre mensual de años contables', icon: Calendar },
    { type: 'NAV', key: 'TABLAS_ANALISIS', title: 'Catálogos de Análisis', subtitle: 'Centros de costo, ítems de gasto y proyectos', icon: Sliders },
  ];

  const results = useMemo(() => {
    if (!searchTerm.trim()) {
      return navigationItems;
    }
    const q = searchTerm.toLowerCase().trim();

    // 1. Navigation Matches
    const navMatches = navigationItems.filter(
      n => n.title.toLowerCase().includes(q) || n.subtitle.toLowerCase().includes(q)
    );

    // 2. Account Matches (Sorted numerically)
    const accMatches = [...accounts]
      .sort((a, b) => compareAccountCodes(a.code, b.code))
      .filter(a => a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q))
      .slice(0, 5)
      .map(a => ({
        type: 'ACCOUNT',
        key: 'PLAN_CUENTAS',
        title: `[${a.code}] ${a.name}`,
        subtitle: `Cuenta Contable (${a.type || 'Imputable'})`,
        icon: BookOpen,
        rawAccount: a
      }));

    // 3. Auxiliary Matches (Sorted numerically by RUT)
    const auxMatches = [...auxiliaries]
      .sort((a, b) => compareRuts(a.rut, b.rut))
      .filter(a => a.rut.toLowerCase().includes(q) || a.name.toLowerCase().includes(q))
      .slice(0, 5)
      .map(a => ({
        type: 'AUXILIARY',
        key: 'AUXILIARES',
        title: `${a.rut} - ${a.name}`,
        subtitle: `Auxiliar / Entidad (${a.role || 'General'})`,
        icon: Users,
        rawAuxiliary: a
      }));

    return [...navMatches, ...accMatches, ...auxMatches].slice(0, 12);
  }, [searchTerm, accounts, auxiliaries]);

  // Keyboard Navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % Math.max(1, results.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + results.length) % Math.max(1, results.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) {
        onNavigateToView(results[selectedIndex].key);
        onClose();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-start justify-center pt-20 p-4">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-300 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
        onKeyDown={handleKeyDown}
      >
        {/* Search Header */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center gap-3">
          <Search className="w-5 h-5 text-indigo-600 shrink-0 ml-1" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Buscar pantalla, cuenta contable, RUT de auxiliar o comprobante (Cmd+K)..."
            value={searchTerm}
            onChange={e => {
              setSearchTerm(e.target.value);
              setSelectedIndex(0);
            }}
            className="w-full bg-transparent border-none text-sm font-bold text-slate-900 focus:outline-none placeholder:text-slate-400 placeholder:font-normal"
          />
          <kbd className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-mono font-bold text-slate-500 bg-slate-200 rounded border border-slate-300">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="p-2 max-h-96 overflow-y-auto divide-y divide-slate-100">
          {results.length > 0 ? (
            results.map((item, idx) => {
              const IconComp = item.icon;
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={idx}
                  onClick={() => {
                    onNavigateToView(item.key);
                    onClose();
                  }}
                  className={`p-3 rounded-xl cursor-pointer flex items-center justify-between gap-3 transition-colors ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-sm font-bold'
                      : 'hover:bg-slate-100 text-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`p-2 rounded-lg shrink-0 ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-indigo-50 text-indigo-700'
                    }`}>
                      <IconComp className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs truncate font-bold">{item.title}</div>
                      <div className={`text-[11px] truncate ${isSelected ? 'text-indigo-100' : 'text-slate-500'}`}>
                        {item.subtitle}
                      </div>
                    </div>
                  </div>

                  <ArrowRight className={`w-4 h-4 shrink-0 ${isSelected ? 'text-white' : 'text-slate-400'}`} />
                </div>
              );
            })
          ) : (
            <div className="p-8 text-center text-xs text-slate-500">
              No se encontraron resultados para "{searchTerm}".
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="p-2.5 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-500 flex items-center justify-between">
          <span>Usa <kbd className="font-mono bg-slate-200 px-1 rounded">↑</kbd> <kbd className="font-mono bg-slate-200 px-1 rounded">↓</kbd> para navegar y <kbd className="font-mono bg-slate-200 px-1 rounded">Enter</kbd> para ir</span>
          <span className="font-bold text-indigo-600">Gest_OK v3.0 Omnisearch</span>
        </div>
      </div>
    </div>
  );
};
