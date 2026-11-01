import React from 'react';
import { Filter, X, RotateCcw, Columns, BarChart3, Calendar, Layers, Building2, User, Tag, FolderKanban } from 'lucide-react';
import { OlapDimensionKey, OlapFilterState, OlapPivotConfig } from '../../utils/olapCubeEngine';
import { HudTheme } from './hudTheme';

interface HudDimensionSlicersProps {
  filters: OlapFilterState;
  pivotConfig: OlapPivotConfig;
  factCount: number;
  availableYears: string[];
  availablePeriods: string[];
  availableCostCenters: string[];
  onRemoveFilter: (dimension: keyof OlapFilterState, value?: string) => void;
  onClearAllFilters: () => void;
  onChangeColumnDimension: (dim: OlapDimensionKey) => void;
  onChangeMeasure: (measure: 'net' | 'debit' | 'credit' | 'both') => void;
  onAddFilter: (dimension: keyof OlapFilterState, value: string) => void;
  theme?: HudTheme;
}

export default function HudDimensionSlicers({
  filters,
  pivotConfig,
  factCount,
  availableYears,
  availablePeriods,
  availableCostCenters,
  onRemoveFilter,
  onClearAllFilters,
  onChangeColumnDimension,
  onChangeMeasure,
  onAddFilter,
  theme = 'light'
}: HudDimensionSlicersProps) {
  const isDark = theme === 'dark';

  // Count total active filters as Chips (Requerimiento 3: Chips de Filtros Activos / Slicers con botón X)
  const activeChips: { key: keyof OlapFilterState; label: string; value: string; type: string }[] = [];

  if (filters.searchQuery) {
    activeChips.push({ key: 'searchQuery', label: `Texto: "${filters.searchQuery}"`, value: filters.searchQuery, type: 'search' });
  }
  filters.accountClasses?.forEach(c => {
    const classNames: Record<string, string> = { '1': 'Activo', '2': 'Pasivo', '3': 'Patrimonio', '4': 'Gastos / Costos', '5': 'Ingresos' };
    activeChips.push({ key: 'accountClasses', label: `Clase: ${classNames[c] || c}`, value: c, type: 'class' });
  });
  filters.accountCodes?.forEach(c => {
    activeChips.push({ key: 'accountCodes', label: `Cuenta: ${c}`, value: c, type: 'account' });
  });
  filters.years?.forEach(y => {
    activeChips.push({ key: 'years', label: `Año: ${y}`, value: y, type: 'year' });
  });
  filters.periods?.forEach(p => {
    activeChips.push({ key: 'periods', label: `Período: ${p}`, value: p, type: 'period' });
  });
  filters.costCenters?.forEach(cc => {
    activeChips.push({ key: 'costCenters', label: `Centro de Costo: ${cc}`, value: cc, type: 'costCenter' });
  });
  filters.auxiliaries?.forEach(aux => {
    activeChips.push({ key: 'auxiliaries', label: `Auxiliar: ${aux}`, value: aux, type: 'auxiliary' });
  });
  filters.expenseItems?.forEach(item => {
    activeChips.push({ key: 'expenseItems', label: `Ítem Gasto: ${item}`, value: item, type: 'expense' });
  });
  filters.projects?.forEach(proj => {
    activeChips.push({ key: 'projects', label: `Proyecto: ${proj}`, value: proj, type: 'project' });
  });
  filters.voucherTypes?.forEach(vt => {
    activeChips.push({ key: 'voucherTypes', label: `Tipo: ${vt}`, value: vt, type: 'voucher' });
  });

  const columnOptions: { key: OlapDimensionKey; label: string }[] = [
    { key: 'period', label: 'Períodos (Meses)' },
    { key: 'costCenter', label: 'Centros de Costo' },
    { key: 'project', label: 'Proyectos / Órdenes' },
    { key: 'auxiliaryName', label: 'Auxiliares (Terceros)' },
    { key: 'quarter', label: 'Trimestres (Q1-Q4)' },
    { key: 'voucherType', label: 'Tipo Comprobante' }
  ];

  const measureOptions: { key: 'net' | 'debit' | 'credit' | 'both'; label: string }[] = [
    { key: 'net', label: 'Saldo Neto' },
    { key: 'debit', label: 'Débitos (Debe)' },
    { key: 'credit', label: 'Créditos (Haber)' },
    { key: 'both', label: 'Debe y Haber' }
  ];

  return (
    <div
      className={`rounded-xl p-3 transition-colors space-y-2.5 ${
        isDark
          ? 'bg-slate-900/70 border border-slate-800 backdrop-blur-md'
          : 'bg-white border border-slate-200/90 shadow-xs'
      }`}
    >
      {/* Top Bar: Slicer Controls & Quick selectors */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Column Dimension Switcher */}
        <div className="flex items-center gap-2">
          <div
            className={`flex items-center gap-1.5 font-mono text-[11px] ${
              isDark ? 'text-slate-400' : 'text-slate-500'
            }`}
          >
            <Columns className={`w-3.5 h-3.5 ${isDark ? 'text-cyan-400' : 'text-indigo-600'}`} />
            <span className="font-semibold">COLUMNAS DINÁMICAS:</span>
          </div>
          <div
            className={`inline-flex rounded-lg p-0.5 border ${
              isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
            }`}
          >
            {columnOptions.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => onChangeColumnDimension(opt.key)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                  pivotConfig.columnDimension === opt.key
                    ? isDark
                      ? 'bg-cyan-500/20 text-cyan-300 font-semibold shadow-xs border border-cyan-500/40'
                      : 'bg-white text-indigo-700 font-semibold shadow-xs border border-slate-200'
                    : isDark
                    ? 'text-slate-400 hover:text-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Measure Switcher */}
        <div className="flex items-center gap-2">
          <div
            className={`flex items-center gap-1.5 font-mono text-[11px] ${
              isDark ? 'text-slate-400' : 'text-slate-500'
            }`}
          >
            <BarChart3 className={`w-3.5 h-3.5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
            <span className="font-semibold">MÉTRICA:</span>
          </div>
          <div
            className={`inline-flex rounded-lg p-0.5 border ${
              isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
            }`}
          >
            {measureOptions.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => onChangeMeasure(m.key)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                  pivotConfig.measure === m.key
                    ? isDark
                      ? 'bg-emerald-500/20 text-emerald-300 font-semibold shadow-xs border border-emerald-500/40'
                      : 'bg-white text-emerald-700 font-semibold shadow-xs border border-slate-200'
                    : isDark
                    ? 'text-slate-400 hover:text-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Total Facts Counter */}
        <div
          className={`font-mono text-[11px] px-2.5 py-1 rounded-lg border ${
            isDark
              ? 'bg-slate-950/70 border-slate-800 text-slate-300'
              : 'bg-slate-50 border-slate-200 text-slate-700'
          }`}
        >
          <span className="text-slate-400">Hechos procesados:</span>{' '}
          <strong className="text-indigo-600 dark:text-cyan-400">{factCount.toLocaleString('es-CL')}</strong>
        </div>
      </div>

      {/* Bottom Bar: Active Filter Chips (Slicers) */}
      <div
        className={`pt-2 border-t flex flex-wrap items-center gap-2 ${
          isDark ? 'border-slate-800' : 'border-slate-100'
        }`}
      >
        <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-500">
          <Filter className="w-3.5 h-3.5" />
          <span className="font-semibold">FILTROS ACTIVOS:</span>
        </div>

        {activeChips.length === 0 ? (
          <span className="text-[11px] font-mono text-slate-400 italic">
            Sin filtros aplicados (Mostrando universo contable completo del ejercicio)
          </span>
        ) : (
          <>
            {activeChips.map((chip, idx) => (
              <span
                key={`${chip.key}_${chip.value}_${idx}`}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition-all border ${
                  isDark
                    ? 'bg-slate-800/80 text-cyan-300 border-cyan-500/30 hover:border-cyan-400'
                    : 'bg-indigo-50 text-indigo-800 border-indigo-200 hover:border-indigo-300'
                }`}
              >
                <span>{chip.label}</span>
                <button
                  type="button"
                  onClick={() => onRemoveFilter(chip.key, chip.value)}
                  className="p-0.5 rounded-full hover:bg-rose-200 hover:text-rose-800 dark:hover:bg-rose-950 dark:hover:text-rose-300 transition-colors cursor-pointer"
                  title="Remover filtro"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}

            <button
              type="button"
              onClick={onClearAllFilters}
              className={`ml-2 px-2 py-0.5 rounded text-[11px] font-mono flex items-center gap-1 transition-colors cursor-pointer ${
                isDark
                  ? 'text-rose-400 hover:bg-rose-950/40 hover:text-rose-300'
                  : 'text-rose-600 hover:bg-rose-50 hover:text-rose-800'
              }`}
              title="Limpiar todos los filtros cruzados"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Limpiar Todos</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
