import React, { useMemo, useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShieldAlert,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  PieChart,
  Scale,
  Percent,
  Clock,
  Layers,
  BarChart2
} from 'lucide-react';
import { FinancialKpiMetrics } from '../../utils/olapCubeEngine';
import { HudTheme } from './hudTheme';

export type KpiMetrics = FinancialKpiMetrics;

export interface MonthlyKpiPoint {
  period: string;
  assets: number;
  liabilities: number;
  income: number;
  expenses: number;
  margin: number;
}

interface HudKpiPanelProps {
  kpiMetrics: FinancialKpiMetrics;
  monthlySeries?: MonthlyKpiPoint[];
  activeClasses?: string[];
  onToggleClassFilter?: (classCode: string) => void;
  theme?: HudTheme;
}

// Generate smooth SVG polyline points
function generateSparklinePoints(data: number[], width = 56, height = 20): string {
  if (!data || data.length === 0) return '';
  if (data.length === 1) return `0,${height / 2} ${width},${height / 2}`;
  
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  return data
    .map((val, idx) => {
      const x = (idx / (data.length - 1)) * width;
      const y = height - ((val - min) / range) * (height - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export default function HudKpiPanel({
  kpiMetrics,
  monthlySeries = [],
  activeClasses = [],
  onToggleClassFilter,
  theme = 'light'
}: HudKpiPanelProps) {
  const isDark = theme === 'dark';
  const [activeTab, setActiveTab] = useState<'all' | 'liquidity' | 'profitability' | 'efficiency'>('all');

  const formatCLP = (val: number) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      maximumFractionDigits: 0
    }).format(Math.round(val));
  };

  const formatCompactCLP = (val: number) => {
    const absVal = Math.abs(val);
    if (absVal >= 1_000_000_000) {
      return `$${(val / 1_000_000_000).toFixed(1)}B`;
    }
    if (absVal >= 1_000_000) {
      return `$${(val / 1_000_000).toFixed(1)}M`;
    }
    if (absVal >= 1_000) {
      return `$${(val / 1_000).toFixed(0)}K`;
    }
    return `$${Math.round(val)}`;
  };

  // Sparkline data series from monthly evolution
  const assetSeries = useMemo(() => monthlySeries.map(m => m.assets), [monthlySeries]);
  const liabilitySeries = useMemo(() => monthlySeries.map(m => m.liabilities), [monthlySeries]);
  const incomeSeries = useMemo(() => monthlySeries.map(m => m.income), [monthlySeries]);
  const expenseSeries = useMemo(() => monthlySeries.map(m => m.expenses), [monthlySeries]);
  const marginSeries = useMemo(() => monthlySeries.map(m => m.margin), [monthlySeries]);

  // All KPI cards according to User Requirements:
  // 1. Liquidez y Solvencia: Prueba Ácida, Capital de Trabajo Neto, Ratio de Liquidez Corriente
  // 2. Rentabilidad y Resultados: Margen Bruto, EBITDA y EBIT, Resultado Neto, Rentabilidad s/Ingresos (Margen Neto)
  // 3. Eficiencia Operativa: Rotación CxC (DSO), Rotación CxP (DPO)
  const kpiCards = [
    // --- GRUPO 1: LIQUIDEZ Y SOLVENCIA ---
    {
      id: 'quick_ratio',
      group: 'liquidity',
      category: 'LIQUIDEZ',
      title: 'PRUEBA ÁCIDA',
      subtitle: '(Act. Cte - Inventario) / Pas. Cte',
      valueStr: `${kpiMetrics.quickRatio.toFixed(2)}x`,
      statusText: kpiMetrics.quickRatio >= 1.0 ? 'Óptima (≥1.0)' : 'Alerta (<1.0)',
      isGood: kpiMetrics.quickRatio >= 1.0,
      icon: Scale,
      accentColor: isDark ? 'text-cyan-400' : 'text-cyan-700',
      sparklineColor: isDark ? '#22d3ee' : '#0284c7',
      series: assetSeries,
      detail: `Act. Cte: ${formatCompactCLP(kpiMetrics.currentAssets)} | Inv: ${formatCompactCLP(kpiMetrics.inventories)}`
    },
    {
      id: 'working_capital',
      group: 'liquidity',
      category: 'LIQUIDEZ',
      title: 'CAPITAL TRABAJO NETO',
      subtitle: 'Activo Cte - Pasivo Cte',
      valueStr: formatCompactCLP(kpiMetrics.netWorkingCapital),
      fullValue: formatCLP(kpiMetrics.netWorkingCapital),
      statusText: kpiMetrics.netWorkingCapital >= 0 ? 'Fondo Maniobra +' : 'Déficit Circulante',
      isGood: kpiMetrics.netWorkingCapital >= 0,
      icon: DollarSign,
      accentColor: isDark ? 'text-teal-400' : 'text-teal-700',
      sparklineColor: isDark ? '#14b8a6' : '#0d9488',
      series: marginSeries,
      detail: `Pas. Cte: ${formatCompactCLP(kpiMetrics.currentLiabilities)}`
    },
    {
      id: 'current_ratio',
      group: 'liquidity',
      category: 'LIQUIDEZ',
      title: 'LIQUIDEZ CORRIENTE',
      subtitle: 'Activo Cte / Pasivo Cte',
      valueStr: `${kpiMetrics.currentRatio.toFixed(2)}x`,
      statusText: kpiMetrics.currentRatio >= 1.5 ? 'Solvente (≥1.5)' : kpiMetrics.currentRatio >= 1.0 ? 'Aceptable' : 'Tensión',
      isGood: kpiMetrics.currentRatio >= 1.2,
      icon: Activity,
      accentColor: isDark ? 'text-sky-400' : 'text-sky-700',
      sparklineColor: isDark ? '#38bdf8' : '#0284c7',
      series: assetSeries,
      detail: `Cobertura a corto plazo`
    },

    // --- GRUPO 2: RENTABILIDAD Y RESULTADOS ---
    {
      id: 'gross_margin',
      group: 'profitability',
      category: 'RENTABILIDAD',
      title: 'MARGEN BRUTO',
      subtitle: '(Ventas - Costos) / Ventas',
      valueStr: `${kpiMetrics.grossMarginPct.toFixed(1)}%`,
      statusText: `Utilidad: ${formatCompactCLP(kpiMetrics.grossProfit)}`,
      isGood: kpiMetrics.grossMarginPct >= 20,
      icon: Percent,
      accentColor: isDark ? 'text-emerald-400' : 'text-emerald-700',
      sparklineColor: isDark ? '#10b981' : '#059669',
      series: incomeSeries,
      detail: `Ventas: ${formatCompactCLP(kpiMetrics.grossRevenue)}`
    },
    {
      id: 'ebitda',
      group: 'profitability',
      category: 'RESULTADOS',
      title: 'EBITDA & EBIT',
      subtitle: `EBIT: ${formatCompactCLP(kpiMetrics.ebit)}`,
      valueStr: formatCompactCLP(kpiMetrics.ebitda),
      fullValue: formatCLP(kpiMetrics.ebitda),
      statusText: `Margen EBITDA: ${kpiMetrics.ebitdaMarginPct.toFixed(1)}%`,
      isGood: kpiMetrics.ebitda >= 0,
      icon: TrendingUp,
      accentColor: isDark ? 'text-indigo-400' : 'text-indigo-700',
      sparklineColor: isDark ? '#818cf8' : '#4f46e5',
      series: marginSeries,
      detail: `Deprec: ${formatCompactCLP(kpiMetrics.depreciationAmort)}`
    },
    {
      id: 'net_income',
      group: 'profitability',
      category: 'RESULTADOS',
      title: 'RESULTADO NETO',
      subtitle: `Margen Neto ${kpiMetrics.netMarginPct.toFixed(1)}%`,
      valueStr: formatCompactCLP(kpiMetrics.netIncome),
      fullValue: formatCLP(kpiMetrics.netIncome),
      statusText: kpiMetrics.netIncome >= 0 ? 'Utilidad Neta ✓' : 'Pérdida Neta ⚠️',
      isGood: kpiMetrics.netIncome >= 0,
      icon: kpiMetrics.netIncome >= 0 ? ArrowUpRight : ArrowDownRight,
      accentColor: kpiMetrics.netIncome >= 0 ? (isDark ? 'text-emerald-400' : 'text-emerald-700') : (isDark ? 'text-rose-400' : 'text-rose-700'),
      sparklineColor: kpiMetrics.netIncome >= 0 ? (isDark ? '#34d399' : '#059669') : (isDark ? '#fb7185' : '#e11d48'),
      series: marginSeries,
      detail: `Ingr: ${formatCompactCLP(kpiMetrics.totalIncome)} - Gast: ${formatCompactCLP(kpiMetrics.totalExpenses)}`
    },

    // --- GRUPO 3: EFICIENCIA OPERATIVA ---
    {
      id: 'dso',
      group: 'efficiency',
      category: 'EFICIENCIA',
      title: 'ROTACIÓN CxC (DSO)',
      subtitle: 'Días promedio cobro clientes',
      valueStr: `${kpiMetrics.dso} días`,
      statusText: kpiMetrics.dso <= 60 ? 'Cobranza Rápida' : 'Período Extendido',
      isGood: kpiMetrics.dso <= 60,
      icon: Clock,
      accentColor: isDark ? 'text-amber-400' : 'text-amber-700',
      sparklineColor: isDark ? '#fbbf24' : '#d97706',
      series: incomeSeries,
      detail: `CxC: ${formatCompactCLP(kpiMetrics.accountsReceivable)}`
    },
    {
      id: 'dpo',
      group: 'efficiency',
      category: 'EFICIENCIA',
      title: 'ROTACIÓN CxP (DPO)',
      subtitle: 'Días promedio pago prov.',
      valueStr: `${kpiMetrics.dpo} días`,
      statusText: kpiMetrics.dpo >= 30 ? 'Plazo Proveedor' : 'Pago Inmediato',
      isGood: true,
      icon: Clock,
      accentColor: isDark ? 'text-violet-400' : 'text-violet-700',
      sparklineColor: isDark ? '#a78bfa' : '#7c3aed',
      series: expenseSeries,
      detail: `CxP: ${formatCompactCLP(kpiMetrics.accountsPayable)}`
    }
  ];

  const displayedCards = useMemo(() => {
    if (activeTab === 'all') return kpiCards;
    return kpiCards.filter(c => c.group === activeTab);
  }, [kpiCards, activeTab]);

  return (
    <div className="space-y-2.5">
      {/* Sub-header de categorías de KPIs para filtrado rápido */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 font-mono text-[11px]">
          <span className={`font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
            PANEL DE INDICADORES CLAVE (KPIS FINANCIEROS):
          </span>
          <span className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            • Actualización instantánea en tiempo real
          </span>
        </div>

        {/* Tab Pills */}
        <div
          className={`inline-flex rounded-lg p-0.5 border text-[10px] font-mono ${
            isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-100 border-slate-200'
          }`}
        >
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`px-2 py-0.5 rounded transition-all ${
              activeTab === 'all'
                ? isDark
                  ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40'
                  : 'bg-white text-indigo-700 font-bold shadow-xs border border-slate-200'
                : isDark
                ? 'text-slate-400 hover:text-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Todos ({kpiCards.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('liquidity')}
            className={`px-2 py-0.5 rounded transition-all ${
              activeTab === 'liquidity'
                ? isDark
                  ? 'bg-teal-500/20 text-teal-300 font-bold border border-teal-500/40'
                  : 'bg-white text-teal-700 font-bold shadow-xs border border-slate-200'
                : isDark
                ? 'text-slate-400 hover:text-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Liquidez & Solvencia
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('profitability')}
            className={`px-2 py-0.5 rounded transition-all ${
              activeTab === 'profitability'
                ? isDark
                  ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40'
                  : 'bg-white text-emerald-700 font-bold shadow-xs border border-slate-200'
                : isDark
                ? 'text-slate-400 hover:text-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Rentabilidad & Resultados
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('efficiency')}
            className={`px-2 py-0.5 rounded transition-all ${
              activeTab === 'efficiency'
                ? isDark
                  ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40'
                  : 'bg-white text-amber-700 font-bold shadow-xs border border-slate-200'
                : isDark
                ? 'text-slate-400 hover:text-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Eficiencia (Rotación)
          </button>
        </div>
      </div>

      {/* Grid Dinámico Adaptable de Tarjetas Flotantes */}
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8 gap-2.5">
        {displayedCards.map((card) => {
          const Icon = card.icon;
          const sparkPoints = generateSparklinePoints(card.series);

          return (
            <div
              key={card.id}
              className={`relative group rounded-xl border p-3 transition-all duration-200 select-none overflow-hidden ${
                isDark
                  ? 'bg-slate-900/80 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                  : 'bg-white border-slate-200/90 hover:border-slate-300 shadow-xs hover:shadow-sm'
              }`}
            >
              {/* Top: Category & Status */}
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`text-[9px] font-mono tracking-wider font-bold uppercase truncate ${
                    isDark ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  {card.category}
                </span>
                <span
                  className={`text-[8.5px] font-mono font-semibold px-1 py-0.2 rounded border ${
                    card.isGood
                      ? isDark
                        ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : isDark
                      ? 'bg-amber-950/60 text-amber-400 border-amber-800/60'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}
                >
                  {card.statusText}
                </span>
              </div>

              {/* Title */}
              <div className="text-[11px] font-mono font-bold text-slate-800 dark:text-slate-200 truncate" title={card.title}>
                {card.title}
              </div>

              {/* Main Metric Value */}
              <div className="flex items-baseline justify-between mt-1">
                <div>
                  <div className={`text-base lg:text-lg font-mono font-black tracking-tight tabular-nums ${card.accentColor}`}>
                    {card.valueStr}
                  </div>
                  {card.fullValue && (
                    <div className="text-[9.5px] font-mono text-slate-400 dark:text-slate-500 tabular-nums truncate">
                      {card.fullValue}
                    </div>
                  )}
                </div>

                {/* Micro Sparkline */}
                {sparkPoints && (
                  <svg className="w-12 h-5 overflow-visible opacity-75 group-hover:opacity-100 transition-opacity" viewBox="0 0 56 20">
                    <polyline
                      fill="none"
                      stroke={card.sparklineColor}
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={sparkPoints}
                    />
                  </svg>
                )}
              </div>

              {/* Subtitle / Formula helper */}
              <div className="mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800/80 text-[9px] text-slate-500 dark:text-slate-400 truncate" title={card.subtitle}>
                {card.subtitle}
              </div>

              {/* Accent subtle bottom strip */}
              <div
                className="absolute bottom-0 left-0 right-0 h-[2px] opacity-40 group-hover:opacity-100 transition-opacity"
                style={{ backgroundColor: card.sparklineColor }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
