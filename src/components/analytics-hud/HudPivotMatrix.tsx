import React, { useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Maximize2,
  Minimize2,
  Layers,
  ArrowRight,
  PlusSquare,
  MinusSquare,
  FileSpreadsheet,
  Download,
  Calendar,
  Building2,
  FolderKanban,
  Users
} from 'lucide-react';
import { OlapTreeNode, OlapDimensionKey } from '../../utils/olapCubeEngine';
import { HudTheme } from './hudTheme';

interface HudPivotMatrixProps {
  rootNodes: OlapTreeNode[];
  columnKeys: string[];
  grandTotals: {
    debit: number;
    credit: number;
    net: number;
    count: number;
    columns: Record<string, number>;
  };
  expandedNodeIds: Set<string>;
  onToggleExpand: (nodeId: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onSelectNodeFactDetail?: (node: OlapTreeNode) => void;
  measure: 'net' | 'debit' | 'credit' | 'both';
  columnDimension: OlapDimensionKey;
  onChangeColumnDimension?: (dim: OlapDimensionKey) => void;
  theme?: HudTheme;
}

// Generate mini row sparkline
function generateRowSparkline(data: number[], width = 48, height = 16): string {
  if (!data || data.length === 0) return '';
  if (data.length === 1) return `0,${height / 2} ${width},${height / 2}`;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  return data
    .map((val, idx) => {
      const x = (idx / (data.length - 1)) * width;
      const y = height - ((val - min) / range) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export default function HudPivotMatrix({
  rootNodes,
  columnKeys,
  grandTotals,
  expandedNodeIds,
  onToggleExpand,
  onExpandAll,
  onCollapseAll,
  onSelectNodeFactDetail,
  measure,
  columnDimension,
  onChangeColumnDimension,
  theme = 'light'
}: HudPivotMatrixProps) {
  const isDark = theme === 'dark';

  const formatCLP = (val: number, isCurrency = true) => {
    if (val === 0) return '$0';
    const formatted = new Intl.NumberFormat('es-CL', {
      maximumFractionDigits: 0
    }).format(Math.abs(Math.round(val)));
    const sign = val > 0 ? '+ ' : '- ';
    return `${sign}$${formatted}`;
  };

  const formatCLPTotal = (val: number) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      maximumFractionDigits: 0
    }).format(Math.round(val));
  };

  const formatHeaderColumn = (key: string) => {
    if (columnDimension === 'period') {
      const parts = key.split('-');
      if (parts.length === 2) {
        const monthNames = ['', 'ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
        const mIdx = parseInt(parts[1], 10);
        return monthNames[mIdx] ? `${monthNames[mIdx]} '${parts[0].slice(2)}` : parts[1];
      }
    }
    return key.toUpperCase();
  };

  // Dimension Switcher Buttons Bar above the matrix (Requerimiento 2: intercambiables con un clic)
  const dimensionButtons: { key: OlapDimensionKey; label: string; icon: any }[] = [
    { key: 'period', label: 'Por Períodos (Meses)', icon: Calendar },
    { key: 'costCenter', label: 'Por Centros de Costo', icon: Building2 },
    { key: 'project', label: 'Por Proyectos / Órdenes', icon: FolderKanban },
    { key: 'auxiliaryName', label: 'Por Auxiliares (Terceros)', icon: Users }
  ];

  // Render a node and its children recursively with tree guides
  const renderRow = (node: OlapTreeNode, level: number = 0, isLastChild = false): React.ReactNode => {
    const isExpanded = expandedNodeIds.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const isLeaf = node.isLeaf || !hasChildren;

    const isClassNode = level === 0;
    const isGroupNode = level === 1;

    // Collect array of values for row sparkline
    const rowValues = columnKeys.map(k => (node.columnsData[k] ? node.columnsData[k].net : 0));
    const sparkPoints = generateRowSparkline(rowValues);
    const rowNet = node.net;

    // Calcular variación respecto al último período/columna visible vs anterior
    let variationPct: number | null = null;
    if (columnKeys.length >= 2) {
      const lastColVal = node.columnsData[columnKeys[columnKeys.length - 1]]?.net || 0;
      const prevColVal = node.columnsData[columnKeys[columnKeys.length - 2]]?.net || 0;
      if (prevColVal !== 0) {
        variationPct = ((lastColVal - prevColVal) / Math.abs(prevColVal)) * 100;
      }
    }

    // Visual tree indentation
    const indentPadding = level * 20;

    return (
      <React.Fragment key={node.id}>
        <tr
          className={`border-b font-mono text-xs transition-colors group ${
            isDark
              ? isClassNode
                ? 'bg-slate-900/90 font-bold text-slate-100 hover:bg-slate-800/80 border-slate-800'
                : isGroupNode
                ? 'bg-slate-900/40 font-semibold text-slate-300 hover:bg-slate-800/60 border-slate-800/80'
                : 'text-slate-400 hover:bg-cyan-950/20 hover:text-slate-200 border-slate-800/60'
              : isClassNode
              ? 'bg-slate-100 font-bold text-slate-900 hover:bg-slate-200/70 border-slate-200'
              : isGroupNode
              ? 'bg-slate-50/70 font-semibold text-slate-800 hover:bg-slate-100/60 border-slate-200/70'
              : 'text-slate-600 hover:bg-indigo-50/50 hover:text-slate-900 border-slate-100'
          }`}
        >
          {/* Dimension Label Cell with Hierarchical Tree Indentation */}
          <td className="py-2.5 pr-3 whitespace-nowrap">
            <div className="flex items-center gap-1.5" style={{ paddingLeft: `${indentPadding + 8}px` }}>
              {/* Tree Branch Symbol */}
              {level > 0 && (
                <span
                  className={`select-none mr-1 ${
                    isDark ? 'text-cyan-500/60' : 'text-indigo-400'
                  }`}
                >
                  {isLastChild ? '└──' : '├──'}
                </span>
              )}

              {/* Expand / Collapse Button [+] / [-] */}
              {!isLeaf ? (
                <button
                  type="button"
                  onClick={() => onToggleExpand(node.id)}
                  className={`p-0.5 rounded transition-colors cursor-pointer flex items-center justify-center ${
                    isDark
                      ? 'text-cyan-400 hover:bg-cyan-950/60 hover:text-cyan-300'
                      : 'text-indigo-600 hover:bg-indigo-100'
                  }`}
                  title={isExpanded ? 'Colapsar [-]' : 'Expandir [+]'}
                >
                  {isExpanded ? (
                    <MinusSquare className="w-3.5 h-3.5" />
                  ) : (
                    <PlusSquare className="w-3.5 h-3.5" />
                  )}
                </button>
              ) : (
                <span className="w-3.5 inline-block text-center text-slate-400 text-[10px] select-none">•</span>
              )}

              {/* Title & Drill-down Action */}
              <div
                className={`flex items-center gap-2 cursor-pointer ${
                  isLeaf ? 'hover:underline' : ''
                }`}
                onClick={() => {
                  if (!isLeaf) {
                    onToggleExpand(node.id);
                  } else if (onSelectNodeFactDetail) {
                    onSelectNodeFactDetail(node);
                  }
                }}
              >
                <span
                  className={`${
                    isClassNode
                      ? isDark
                        ? 'text-cyan-300 font-bold'
                        : 'text-indigo-900 font-bold'
                      : isGroupNode
                      ? isDark
                        ? 'text-slate-200 font-semibold'
                        : 'text-slate-800 font-semibold'
                      : ''
                  }`}
                >
                  {node.label}
                </span>

                {node.sublabel && (
                  <span
                    className={`text-[10px] font-sans truncate max-w-xs ${
                      isDark ? 'text-slate-500' : 'text-slate-400'
                    }`}
                  >
                    {node.sublabel}
                  </span>
                )}

                {isLeaf && onSelectNodeFactDetail && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectNodeFactDetail(node);
                    }}
                    className={`opacity-0 group-hover:opacity-100 text-[9px] font-mono px-1.5 py-0.5 rounded transition-opacity flex items-center gap-0.5 cursor-pointer ${
                      isDark
                        ? 'bg-cyan-950 text-cyan-400 border border-cyan-800/60'
                        : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                    }`}
                    title="Inspeccionar comprobantes atómicos"
                  >
                    <span>{node.transactionCount} movs</span>
                    <ArrowRight className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            </div>
          </td>

          {/* Dynamic Columns */}
          {columnKeys.map((colKey) => {
            const colData = node.columnsData[colKey];
            const netVal = colData ? colData.net : 0;
            const debitVal = colData ? colData.debit : 0;
            const creditVal = colData ? colData.credit : 0;

            const isNegative = netVal < 0;
            const hasData = colData && (colData.debit !== 0 || colData.credit !== 0);

            return (
              <td
                key={colKey}
                className="py-2.5 px-3 text-right whitespace-nowrap tabular-nums"
              >
                {measure === 'both' ? (
                  <div className="flex flex-col text-[10px] leading-tight">
                    <span className="text-emerald-500">{debitVal ? formatCLP(debitVal, false) : '-'}</span>
                    <span className="text-rose-500">{creditVal ? formatCLP(creditVal, false) : '-'}</span>
                  </div>
                ) : measure === 'debit' ? (
                  <span className={debitVal ? 'text-emerald-500' : isDark ? 'text-slate-600' : 'text-slate-300'}>
                    {debitVal ? formatCLP(debitVal, false) : '$0'}
                  </span>
                ) : measure === 'credit' ? (
                  <span className={creditVal ? 'text-rose-500' : isDark ? 'text-slate-600' : 'text-slate-300'}>
                    {creditVal ? formatCLP(creditVal, false) : '$0'}
                  </span>
                ) : (
                  <span
                    className={
                      !hasData
                        ? isDark
                          ? 'text-slate-600'
                          : 'text-slate-300'
                        : isNegative
                        ? 'text-rose-500 font-semibold'
                        : isClassNode
                        ? isDark
                          ? 'text-cyan-300 font-bold'
                          : 'text-indigo-800 font-bold'
                        : isDark
                        ? 'text-emerald-400'
                        : 'text-emerald-600 font-medium'
                    }
                  >
                    {formatCLP(netVal)}
                  </span>
                )}
              </td>
            );
          })}

          {/* Debe Acumulado */}
          {(measure === 'both' || measure === 'debit') && (
            <td className="py-2.5 px-3 text-right whitespace-nowrap tabular-nums text-emerald-500 font-medium">
              {formatCLPTotal(node.debit)}
            </td>
          )}

          {/* Haber Acumulado */}
          {(measure === 'both' || measure === 'credit') && (
            <td className="py-2.5 px-3 text-right whitespace-nowrap tabular-nums text-rose-500 font-medium">
              {formatCLPTotal(node.credit)}
            </td>
          )}

          {/* Saldo Neto Dinámico (Débito - Crédito) */}
          <td
            className={`py-2.5 px-3 text-right whitespace-nowrap tabular-nums font-bold ${
              node.net < 0
                ? 'text-rose-500'
                : node.net > 0
                ? isDark
                  ? 'text-slate-100'
                  : 'text-slate-900'
                : 'text-slate-400'
            }`}
          >
            {formatCLPTotal(node.net)}
          </td>

          {/* Variación Porcentual (%) respecto al período anterior */}
          <td className="py-2.5 px-2 text-right whitespace-nowrap tabular-nums font-mono text-[11px]">
            {variationPct !== null ? (
              <span
                className={`inline-flex items-center gap-0.5 px-1 rounded ${
                  variationPct > 0
                    ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40'
                    : variationPct < 0
                    ? 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40'
                    : 'text-slate-400'
                }`}
              >
                {variationPct > 0 ? `+${variationPct.toFixed(1)}%` : `${variationPct.toFixed(1)}%`}
              </span>
            ) : (
              <span className="text-slate-400 text-[10px]">-</span>
            )}
          </td>

          {/* Mini Sparkline Column on Right */}
          <td className="py-2.5 px-2 text-center whitespace-nowrap">
            {rowValues.some(v => v !== 0) ? (
              <svg className="w-12 h-4 overflow-visible inline-block opacity-75 group-hover:opacity-100" viewBox="0 0 48 16">
                <polyline
                  fill="none"
                  stroke={rowNet >= 0 ? (isDark ? '#22d3ee' : '#059669') : (isDark ? '#fb7185' : '#e11d48')}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={sparkPoints}
                />
              </svg>
            ) : (
              <span className="text-slate-400 text-[9px]">-</span>
            )}
          </td>
        </tr>

        {/* Recursively render child rows when expanded */}
        {isExpanded &&
          hasChildren &&
          node.children.map((childNode, cIdx) =>
            renderRow(childNode, level + 1, cIdx === node.children.length - 1)
          )}
      </React.Fragment>
    );
  };

  return (
    <div
      className={`rounded-xl border overflow-hidden flex flex-col transition-colors ${
        isDark
          ? 'bg-slate-950/80 border-slate-800/90 shadow-2xl'
          : 'bg-white border-slate-200/90 shadow-sm'
      }`}
    >
      {/* Header Bar with Column Dimension Switcher (Requerimiento 2: Columnas Dinámicas Intercambiables con un clic) */}
      <div
        className={`px-4 py-3 border-b flex flex-wrap items-center justify-between gap-3 ${
          isDark
            ? 'bg-slate-900/60 border-slate-800/90'
            : 'bg-slate-50/80 border-slate-200'
        }`}
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-mono font-bold tracking-wider ${
                isDark ? 'text-cyan-400' : 'text-indigo-900'
              }`}
            >
              MATRIZ DINÁMICA PRINCIPAL (PIVOT MATRIX)
            </span>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                isDark
                  ? 'border-slate-700 bg-slate-900 text-slate-400'
                  : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              Nivel 1 (Clases) → Nivel 2 (Grupos) → Nivel 3 (Cuentas)
            </span>
          </div>

          {/* Quick Dimension Pill Buttons (Meses, C.Costo, Proyectos, Auxiliares) */}
          {onChangeColumnDimension && (
            <div
              className={`inline-flex rounded-lg p-0.5 border ${
                isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'
              }`}
            >
              {dimensionButtons.map((btn) => {
                const Icon = btn.icon;
                const isSelected = columnDimension === btn.key;
                return (
                  <button
                    key={btn.key}
                    type="button"
                    onClick={() => onChangeColumnDimension(btn.key)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                      isSelected
                        ? isDark
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-xs'
                          : 'bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-xs'
                        : isDark
                        ? 'text-slate-400 hover:text-slate-200'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    <span>{btn.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Global Expand / Collapse All Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onExpandAll}
            className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors cursor-pointer flex items-center gap-1 ${
              isDark
                ? 'bg-slate-900 hover:bg-slate-800 text-cyan-400 border border-slate-800'
                : 'bg-white hover:bg-slate-100 text-indigo-700 border border-slate-200 shadow-2xs'
            }`}
            title="Expandir todas las cuentas"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Expandir Todo</span>
          </button>

          <button
            type="button"
            onClick={onCollapseAll}
            className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors cursor-pointer flex items-center gap-1 ${
              isDark
                ? 'bg-slate-900 hover:bg-slate-800 text-slate-400 border border-slate-800'
                : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs'
            }`}
            title="Colapsar todo a nivel de Clases"
          >
            <Minimize2 className="w-3.5 h-3.5" />
            <span>Colapsar Todo</span>
          </button>
        </div>
      </div>

      {/* Scrollable Matrix Table */}
      <div className="overflow-x-auto overflow-y-auto max-h-[640px]">
        <table className="w-full border-collapse text-left">
          {/* Table Header */}
          <thead
            className={`sticky top-0 z-20 font-mono text-[11px] tracking-wider uppercase border-b backdrop-blur-md ${
              isDark
                ? 'bg-slate-950/95 border-slate-800 text-slate-400'
                : 'bg-slate-100/95 border-slate-300 text-slate-600'
            }`}
          >
            <tr>
              <th className="py-3 px-4 font-bold min-w-[280px]">
                Plan de Cuentas / Jerarquía Analítica
              </th>

              {columnKeys.map((colKey) => (
                <th
                  key={colKey}
                  className="py-3 px-3 text-right font-bold whitespace-nowrap min-w-[100px]"
                >
                  {formatHeaderColumn(colKey)}
                </th>
              ))}

              {(measure === 'both' || measure === 'debit') && (
                <th className="py-3 px-3 text-right font-bold text-emerald-500 whitespace-nowrap min-w-[100px]">
                  Debe Acum.
                </th>
              )}

              {(measure === 'both' || measure === 'credit') && (
                <th className="py-3 px-3 text-right font-bold text-rose-500 whitespace-nowrap min-w-[100px]">
                  Haber Acum.
                </th>
              )}

              <th className="py-3 px-3 text-right font-bold whitespace-nowrap min-w-[110px]">
                Saldo Neto
              </th>

              <th className="py-3 px-2 text-right font-bold whitespace-nowrap min-w-[80px]">
                Var. %
              </th>

              <th className="py-3 px-2 text-center font-bold whitespace-nowrap min-w-[65px]">
                Tendencia
              </th>
            </tr>
          </thead>

          {/* Table Body */}
          <tbody>
            {rootNodes.length === 0 ? (
              <tr>
                <td
                  colSpan={columnKeys.length + 5}
                  className="py-12 text-center text-slate-400 font-mono text-xs"
                >
                  No se encontraron cuentas o movimientos que coincidan con los filtros seleccionados.
                </td>
              </tr>
            ) : (
              rootNodes.map((node, idx) =>
                renderRow(node, 0, idx === rootNodes.length - 1)
              )
            )}
          </tbody>

          {/* Table Footer: Totales Generales */}
          {rootNodes.length > 0 && (
            <tfoot
              className={`sticky bottom-0 z-20 font-mono text-xs font-bold border-t backdrop-blur-md ${
                isDark
                  ? 'bg-slate-950/95 border-slate-800 text-slate-200'
                  : 'bg-slate-100/95 border-slate-300 text-slate-900'
              }`}
            >
              <tr>
                <td className="py-3 px-4 uppercase tracking-wider">
                  TOTALES GENERALES
                </td>

                {columnKeys.map((colKey) => {
                  const val = grandTotals.columns[colKey] || 0;
                  return (
                    <td
                      key={colKey}
                      className="py-3 px-3 text-right tabular-nums whitespace-nowrap font-bold"
                    >
                      <span
                        className={
                          val < 0
                            ? 'text-rose-500'
                            : val > 0
                            ? isDark
                              ? 'text-cyan-300'
                              : 'text-indigo-800'
                            : 'text-slate-400'
                        }
                      >
                        {formatCLP(val)}
                      </span>
                    </td>
                  );
                })}

                {(measure === 'both' || measure === 'debit') && (
                  <td className="py-3 px-3 text-right text-emerald-500 tabular-nums whitespace-nowrap">
                    {formatCLPTotal(grandTotals.debit)}
                  </td>
                )}

                {(measure === 'both' || measure === 'credit') && (
                  <td className="py-3 px-3 text-right text-rose-500 tabular-nums whitespace-nowrap">
                    {formatCLPTotal(grandTotals.credit)}
                  </td>
                )}

                <td
                  className={`py-3 px-3 text-right tabular-nums whitespace-nowrap font-black ${
                    grandTotals.net < 0
                      ? 'text-rose-500'
                      : grandTotals.net > 0
                      ? isDark
                        ? 'text-cyan-400'
                        : 'text-indigo-900'
                      : 'text-slate-400'
                  }`}
                >
                  {formatCLPTotal(grandTotals.net)}
                </td>

                <td className="py-3 px-2 text-right font-mono text-[11px] text-slate-400">
                  -
                </td>

                <td className="py-3 px-2 text-center text-slate-400">
                  •
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
