import React, { useState, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  Activity as ActivityIcon,
  FileSpreadsheet as FileSpreadsheetIcon,
  Maximize2 as Maximize2Icon,
  Minimize2 as Minimize2Icon,
  X as XIcon,
  Search as SearchIcon,
  Database as DatabaseIcon,
  Sun as SunIcon,
  Moon as MoonIcon,
  Sparkles,
  Layers,
  ArrowRight,
  TrendingUp,
  BarChart2
} from 'lucide-react';
import { Company, ChartOfAccount, Voucher, Auxiliary } from '../../types';
import { useOlapCube } from '../../hooks/useOlapCube';
import { OlapTreeNode, OlapFact, OlapDimensionKey } from '../../utils/olapCubeEngine';
import HudKpiPanel, { MonthlyKpiPoint } from './HudKpiPanel';
import HudOmniboxSearch from './HudOmniboxSearch';
import HudDimensionSlicers from './HudDimensionSlicers';
import HudPivotMatrix from './HudPivotMatrix';
import HudChartsPanel from './HudChartsPanel';
import { HudTheme } from './hudTheme';

interface AnalyticsHudDashboardProps {
  company: Company;
  accounts: ChartOfAccount[];
  vouchers: Voucher[];
  auxiliaries?: Auxiliary[];
  costCenters?: any[];
  onOpenVoucherDetail?: (voucherId: string) => void;
  onClose?: () => void;
}

export default function AnalyticsHudDashboard({
  company,
  accounts,
  vouchers,
  auxiliaries = [],
  costCenters = [],
  onOpenVoucherDetail,
  onClose
}: AnalyticsHudDashboardProps) {
  // Theme state: defaults to 'light' (clean executive mode as requested), toggleable to 'dark' (HUD cyberpunk mode)
  const [theme, setTheme] = useState<HudTheme>('light');
  const isDark = theme === 'dark';

  // Inicialización del motor reactivo OLAP Cube en memoria
  const {
    cube,
    filters,
    setFilters,
    filteredFacts,
    pivotConfig,
    setPivotConfig,
    expandedNodeIds,
    toggleNodeExpand,
    expandAll,
    collapseAll,
    crossFilterBy,
    clearAllFilters,
    pivotResult,
    kpiMetrics
  } = useOlapCube({
    vouchers,
    accounts,
    auxiliaries
  });

  // Modal de inspección de transacciones atómicas
  const [selectedNodeForDetail, setSelectedNodeForDetail] = useState<OlapTreeNode | null>(null);
  const [detailFilterQuery, setDetailFilterQuery] = useState('');

  // Modo pantalla completa
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Extraer valores disponibles para slicers
  const availableYears = useMemo(() => {
    const set = new Set<string>();
    vouchers.forEach(v => {
      if (v.date) set.add(v.date.slice(0, 4));
    });
    return Array.from(set).sort().reverse();
  }, [vouchers]);

  const availablePeriods = useMemo(() => {
    const set = new Set<string>();
    vouchers.forEach(v => {
      if (v.period) set.add(v.period);
      else if (v.date) set.add(v.date.slice(0, 7));
    });
    return Array.from(set).sort().reverse();
  }, [vouchers]);

  const availableCostCenterNames = useMemo(() => {
    const set = new Set<string>();
    vouchers.forEach(v => {
      v.lines?.forEach(l => {
        if (l.costCenter?.trim()) set.add(l.costCenter.trim());
      });
    });
    return Array.from(set).sort();
  }, [vouchers]);

  // Serie temporal mensual calculada a partir de datos reales para sparklines
  const monthlySeries: MonthlyKpiPoint[] = useMemo(() => {
    const map = new Map<string, { period: string; assets: number; liabilities: number; income: number; expenses: number; margin: number }>();
    filteredFacts.forEach(f => {
      const p = f.period || 'S/P';
      let entry = map.get(p);
      if (!entry) {
        entry = { period: p, assets: 0, liabilities: 0, income: 0, expenses: 0, margin: 0 };
        map.set(p, entry);
      }
      if (f.accountClass === '1') entry.assets += f.net;
      else if (f.accountClass === '2') entry.liabilities += Math.abs(f.net);
      else if (f.accountClass === '5') entry.income += Math.abs(f.net);
      else if (f.accountClass === '4') entry.expenses += Math.abs(f.net);
    });
    const list = Array.from(map.values());
    list.sort((a, b) => a.period.localeCompare(b.period));
    return list.map(item => ({
      ...item,
      margin: item.income - item.expenses
    }));
  }, [filteredFacts]);

  // Manejador del Omnibox Search
  const handleSelectDimensionFromOmnibox = useCallback(
    (dimType: 'account' | 'costCenter' | 'auxiliary', value: string) => {
      if (dimType === 'account') {
        crossFilterBy('accountCodes', value);
      } else if (dimType === 'costCenter') {
        crossFilterBy('costCenters', value);
      } else if (dimType === 'auxiliary') {
        crossFilterBy('auxiliaries', value);
      }
    },
    [crossFilterBy]
  );

  // Expansión recursiva de todos los IDs
  const handleExpandAll = useCallback(() => {
    const allIds: string[] = [];
    const collectIds = (nodes: OlapTreeNode[]) => {
      nodes.forEach(n => {
        allIds.push(n.id);
        if (n.children && n.children.length > 0) {
          collectIds(n.children);
        }
      });
    };
    collectIds(pivotResult.rootNodes);
    expandAll(allIds);
  }, [pivotResult.rootNodes, expandAll]);

  // Remover un filtro individual
  const handleRemoveFilter = useCallback(
    (dim: keyof typeof filters, val?: string) => {
      setFilters(prev => {
        const next = { ...prev };
        if (dim === 'searchQuery') {
          delete next.searchQuery;
        } else if (Array.isArray(next[dim])) {
          const arr = (next[dim] as string[]).filter(item => item !== val);
          if (arr.length === 0) {
            delete next[dim];
          } else {
            (next as any)[dim] = arr;
          }
        }
        return next;
      });
    },
    [setFilters]
  );

  // Agregar filtro individual
  const handleAddFilter = useCallback(
    (dim: keyof typeof filters, val: string) => {
      crossFilterBy(dim, val);
    },
    [crossFilterBy]
  );

  // Cambiar dimensión de columna
  const handleChangeColumnDimension = useCallback(
    (dim: OlapDimensionKey) => {
      setPivotConfig(prev => ({
        ...prev,
        columnDimension: dim
      }));
    },
    [setPivotConfig]
  );

  // Cambiar medida numérica
  const handleChangeMeasure = useCallback(
    (measure: 'net' | 'debit' | 'credit' | 'both') => {
      setPivotConfig(prev => ({
        ...prev,
        measure
      }));
    },
    [setPivotConfig]
  );

  // Exportar matriz activa a Excel
  const handleExportMatrixToExcel = () => {
    const wsData: any[][] = [];

    // Header 1: Metadata
    wsData.push([`TABLERO ANALÍTICO MULTIDIMENSIONAL - ${company.name}`]);
    wsData.push([`RUT: ${company.rut} | Fecha Exportación: ${new Date().toLocaleDateString('es-CL')}`]);
    wsData.push([]);

    // Table Header
    const headers = [
      'Jerarquía / Código',
      'Nombre / Descripción',
      ...pivotResult.columnKeys,
      'Total Débitos',
      'Total Créditos',
      'Saldo Neto',
      'Movimientos'
    ];
    wsData.push(headers);

    // Recursively flatten tree nodes
    const flattenNodes = (nodes: OlapTreeNode[], indent = 0) => {
      nodes.forEach(n => {
        const prefix = '  '.repeat(indent);
        const row: any[] = [
          `${prefix}${n.key}`,
          n.label,
          ...pivotResult.columnKeys.map(k => n.columnsData[k]?.net || 0),
          n.debit,
          n.credit,
          n.net,
          n.transactionCount
        ];
        wsData.push(row);
        if (n.children && n.children.length > 0) {
          flattenNodes(n.children, indent + 1);
        }
      });
    };

    flattenNodes(pivotResult.rootNodes);

    // Totales
    wsData.push([]);
    wsData.push([
      'TOTALES GENERALES',
      '',
      ...pivotResult.columnKeys.map(k => pivotResult.grandTotals.columns[k] || 0),
      pivotResult.grandTotals.debit,
      pivotResult.grandTotals.credit,
      pivotResult.grandTotals.net,
      pivotResult.grandTotals.count
    ]);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Matriz_BI');
    XLSX.writeFile(wb, `GestOK_AnalyticsHUD_${company.rut}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Hechos correspondientes al nodo seleccionado para inspección atómica
  const selectedNodeFacts = useMemo(() => {
    if (!selectedNodeForDetail) return [];
    const factIdSet = new Set(selectedNodeForDetail.factIds);
    let list = filteredFacts.filter(f => factIdSet.has(f.id));

    if (detailFilterQuery.trim()) {
      const q = detailFilterQuery.toLowerCase().trim();
      list = list.filter(
        f =>
          f.voucherNumber.toString().includes(q) ||
          f.gloss.toLowerCase().includes(q) ||
          f.auxiliaryName.toLowerCase().includes(q) ||
          f.auxiliaryRut.toLowerCase().includes(q) ||
          f.documentRef.toLowerCase().includes(q) ||
          f.costCenter.toLowerCase().includes(q)
      );
    }

    return list;
  }, [selectedNodeForDetail, filteredFacts, detailFilterQuery]);

  return (
    <div
      className={`min-h-screen transition-colors duration-300 font-sans ${
        isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
      } ${isFullScreen ? 'fixed inset-0 z-50 overflow-y-auto' : ''}`}
    >
      {/* Top HUD Header Bar */}
      <header
        className={`sticky top-0 z-30 border-b backdrop-blur-md transition-colors ${
          isDark
            ? 'bg-slate-950/90 border-slate-800'
            : 'bg-white/95 border-slate-200 shadow-2xs'
        }`}
      >
        <div className="max-w-[1720px] mx-auto px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
          {/* Left Brand & Company Info */}
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-xl border flex items-center justify-center ${
                isDark
                  ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.15)]'
                  : 'bg-indigo-600 border-indigo-700 text-white shadow-xs'
              }`}
            >
              <ActivityIcon className="w-5 h-5 animate-pulse" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-mono font-bold tracking-wider">
                  ANALYTICS HUD
                </h1>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-bold ${
                    isDark
                      ? 'bg-cyan-950 text-cyan-400 border border-cyan-800/80'
                      : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                  }`}
                >
                  POWER PIVOT BI
                </span>
                <span
                  className={`hidden sm:inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full ${
                    isDark
                      ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  }`}
                >
                  <DatabaseIcon className="w-3 h-3" />
                  <span>Motor OLAP Activo</span>
                </span>
              </div>

              <div
                className={`text-xs flex items-center gap-2 ${
                  isDark ? 'text-slate-400' : 'text-slate-600'
                }`}
              >
                <span className="font-semibold text-slate-900 dark:text-slate-200">{company.name}</span>
                <span className="font-mono text-[11px] opacity-75">RUT: {company.rut}</span>
                <span className="text-[11px] opacity-50">•</span>
                <span className="text-[11px] opacity-80">{vouchers.length} comprobantes cargados</span>
              </div>
            </div>
          </div>

          {/* Center: Omnibox Smart Search with combined search */}
          <div className="flex-1 max-w-xl mx-2">
            <HudOmniboxSearch
              accounts={accounts}
              auxiliaries={auxiliaries}
              costCenters={costCenters}
              searchQuery={filters.searchQuery || ''}
              onSearchChange={(q) => setFilters(prev => ({ ...prev, searchQuery: q }))}
              onSelectDimension={handleSelectDimensionFromOmnibox}
              theme={theme}
            />
          </div>

          {/* Right Action Controls: Theme Switcher, Fullscreen, Export, Close */}
          <div className="flex items-center gap-2">
            {/* Theme Toggle (Light / Dark) */}
            <button
              type="button"
              onClick={() => setTheme(prev => (prev === 'light' ? 'dark' : 'light'))}
              className={`p-2 rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 text-xs font-mono font-medium ${
                isDark
                  ? 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-amber-300'
                  : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
              }`}
              title={isDark ? 'Cambiar a Modo Claro Ejecutivo' : 'Cambiar a Modo Oscuro HUD Terminal'}
            >
              {isDark ? (
                <>
                  <SunIcon className="w-4 h-4 text-amber-400" />
                  <span className="hidden md:inline">Claro</span>
                </>
              ) : (
                <>
                  <MoonIcon className="w-4 h-4 text-indigo-600" />
                  <span className="hidden md:inline">Oscuro</span>
                </>
              )}
            </button>

            {/* Export Matrix to Excel */}
            <button
              type="button"
              onClick={handleExportMatrixToExcel}
              className={`px-3 py-1.5 rounded-xl border text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                isDark
                  ? 'bg-emerald-950/60 hover:bg-emerald-900 border-emerald-800 text-emerald-300'
                  : 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-700 shadow-2xs'
              }`}
              title="Exportar la matriz actual a Excel"
            >
              <FileSpreadsheetIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Exportar Excel</span>
            </button>

            {/* Fullscreen Toggle */}
            <button
              type="button"
              onClick={() => setIsFullScreen(prev => !prev)}
              className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                isDark
                  ? 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300'
                  : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
              }`}
              title={isFullScreen ? 'Salir de Pantalla Completa' : 'Modo Pantalla Completa'}
            >
              {isFullScreen ? (
                <Minimize2Icon className="w-4 h-4" />
              ) : (
                <Maximize2Icon className="w-4 h-4" />
              )}
            </button>

            {/* Close Button (if provided) */}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-rose-100 dark:hover:bg-rose-950 hover:text-rose-600 transition-colors cursor-pointer"
                title="Cerrar Analytics HUD"
              >
                <XIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-[1720px] mx-auto p-4 space-y-4">
        {/* SECCIÓN 1: PANEL DE INDICADORES CLAVE (KPIS FLOTANTES SUPERIORES) */}
        <section>
          <HudKpiPanel
            kpiMetrics={kpiMetrics}
            monthlySeries={monthlySeries}
            activeClasses={filters.accountClasses || []}
            onToggleClassFilter={(cls) => crossFilterBy('accountClasses', cls)}
            theme={theme}
          />
        </section>

        {/* SECCIÓN 2: BUSCADOR INTELIGENTE Y SLICERS (FILTROS CRUZADOS) */}
        <section>
          <HudDimensionSlicers
            filters={filters}
            pivotConfig={pivotConfig}
            factCount={filteredFacts.length}
            availableYears={availableYears}
            availablePeriods={availablePeriods}
            availableCostCenters={availableCostCenterNames}
            onRemoveFilter={handleRemoveFilter}
            onClearAllFilters={clearAllFilters}
            onChangeColumnDimension={handleChangeColumnDimension}
            onChangeMeasure={handleChangeMeasure}
            onAddFilter={handleAddFilter}
            theme={theme}
          />
        </section>

        {/* SECCIÓN 3 Y 4: MATRIZ DINÁMICA PRINCIPAL + PANEL DE TENDENCIAS SINCRONIZADO */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
          {/* Matriz Dinámica Principal (Pivot Matrix) - 8 de 12 columnas en pantallas anchas */}
          <section className="xl:col-span-8">
            <HudPivotMatrix
              rootNodes={pivotResult.rootNodes}
              columnKeys={pivotResult.columnKeys}
              grandTotals={pivotResult.grandTotals}
              expandedNodeIds={expandedNodeIds}
              onToggleExpand={toggleNodeExpand}
              onExpandAll={handleExpandAll}
              onCollapseAll={collapseAll}
              onSelectNodeFactDetail={(node) => setSelectedNodeForDetail(node)}
              measure={pivotConfig.measure}
              columnDimension={pivotConfig.columnDimension}
              onChangeColumnDimension={handleChangeColumnDimension}
              theme={theme}
            />
          </section>

          {/* Panel de Tendencias y Micro-gráficos Sincronizados - 4 de 12 columnas */}
          <section className="xl:col-span-4">
            <HudChartsPanel
              facts={filteredFacts}
              onFilterPeriod={(p) => crossFilterBy('periods', p)}
              onFilterCostCenter={(cc) => crossFilterBy('costCenters', cc)}
              onFilterAuxiliary={(aux) => crossFilterBy('auxiliaries', aux)}
              theme={theme}
            />
          </section>
        </div>
      </main>

      {/* Modal de Detalle Atómico de Comprobantes al hacer Drill-down en Cuenta Imputable */}
      {selectedNodeForDetail && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            className={`w-full max-w-5xl max-h-[85vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden font-mono text-xs ${
              isDark
                ? 'bg-slate-900 border-slate-700 text-slate-100'
                : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            {/* Modal Header */}
            <div
              className={`p-4 border-b flex items-center justify-between ${
                isDark ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-slate-50'
              }`}
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 dark:bg-cyan-950 dark:text-cyan-400">
                    INSPECCIÓN ATÓMICA
                  </span>
                  <h3 className="font-bold text-sm">
                    {selectedNodeForDetail.label}
                  </h3>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Mostrando {selectedNodeFacts.length} movimientos de comprobantes que componen el saldo de esta cuenta
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedNodeForDetail(null)}
                className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Filter Bar */}
            <div className="p-3 border-b border-inherit flex items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <SearchIcon className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={detailFilterQuery}
                  onChange={(e) => setDetailFilterQuery(e.target.value)}
                  placeholder="Buscar en estos movimientos (Glosa, Folio, RUT, etc)..."
                  className="w-full pl-9 pr-3 py-1.5 rounded-lg border text-xs bg-transparent outline-hidden border-slate-300 dark:border-slate-700"
                />
              </div>

              <div className="text-right">
                <span className="text-[11px] text-slate-400">Saldo acumulado del nodo:</span>{' '}
                <strong
                  className={`text-sm ${
                    selectedNodeForDetail.net >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  ${Math.round(selectedNodeForDetail.net).toLocaleString('es-CL')}
                </strong>
              </div>
            </div>

            {/* Modal Table Content */}
            <div className="flex-1 overflow-y-auto p-4">
              <table className="w-full border-collapse text-left">
                <thead
                  className={`border-b text-[10px] uppercase font-bold tracking-wider ${
                    isDark ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-600'
                  }`}
                >
                  <tr>
                    <th className="py-2 px-2">Fecha</th>
                    <th className="py-2 px-2">Comp. N°</th>
                    <th className="py-2 px-2">Tipo</th>
                    <th className="py-2 px-2">Glosa</th>
                    <th className="py-2 px-2">Auxiliar / RUT</th>
                    <th className="py-2 px-2">C.Costo</th>
                    <th className="py-2 px-2 text-right">Debe</th>
                    <th className="py-2 px-2 text-right">Haber</th>
                    <th className="py-2 px-2 text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {selectedNodeFacts.map((fact) => (
                    <tr
                      key={fact.id}
                      className="hover:bg-indigo-50/50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-2 px-2 whitespace-nowrap text-slate-500">{fact.date}</td>
                      <td className="py-2 px-2 whitespace-nowrap font-bold text-indigo-600 dark:text-cyan-400">
                        {onOpenVoucherDetail ? (
                          <button
                            type="button"
                            onClick={() => onOpenVoucherDetail(fact.voucherId)}
                            className="hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <span>N° {fact.voucherNumber}</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        ) : (
                          <span>N° {fact.voucherNumber}</span>
                        )}
                      </td>
                      <td className="py-2 px-2 whitespace-nowrap">
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {fact.voucherType}
                        </span>
                      </td>
                      <td className="py-2 px-2 max-w-xs truncate" title={fact.gloss}>
                        {fact.gloss}
                      </td>
                      <td className="py-2 px-2 truncate max-w-[150px]" title={fact.auxiliaryName}>
                        {fact.auxiliaryName || fact.auxiliaryRut || '-'}
                      </td>
                      <td className="py-2 px-2 text-slate-500">{fact.costCenter}</td>
                      <td className="py-2 px-2 text-right text-emerald-600 font-medium">
                        {fact.debit > 0 ? `$${fact.debit.toLocaleString('es-CL')}` : '-'}
                      </td>
                      <td className="py-2 px-2 text-right text-rose-600 font-medium">
                        {fact.credit > 0 ? `$${fact.credit.toLocaleString('es-CL')}` : '-'}
                      </td>
                      <td
                        className={`py-2 px-2 text-right font-bold ${
                          fact.net >= 0 ? 'text-slate-800 dark:text-slate-200' : 'text-rose-500'
                        }`}
                      >
                        ${fact.net.toLocaleString('es-CL')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div
              className={`p-3 border-t flex items-center justify-between ${
                isDark ? 'border-slate-800 bg-slate-950/40' : 'border-slate-200 bg-slate-50'
              }`}
            >
              <span className="text-[11px] text-slate-400">
                Mostrando {selectedNodeFacts.length} transacciones
              </span>
              <button
                type="button"
                onClick={() => setSelectedNodeForDetail(null)}
                className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
