import React from 'react';
import {
  LucideIcon,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Sparkles
} from 'lucide-react';

export interface ModuleKPICardProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon?: LucideIcon;
  variant?: 'default' | 'success' | 'warning' | 'info' | 'purple' | 'danger';
}

export interface StandardModuleHeaderProps {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  iconBgColor?: string; // e.g. 'bg-indigo-600'
  layerBadge?: {
    layer: 1 | 2 | 3 | 4;
    label?: string; // e.g. 'Capa 1: Módulo Operativo'
  };
  period?: {
    selectedPeriod: string; // e.g. '2026-10'
    onPrevPeriod?: () => void;
    onNextPeriod?: () => void;
    onChangePeriod?: (period: string) => void;
    availablePeriods?: string[];
    isClosed?: boolean;
    isBlocked?: boolean;
  };
  centralizationStatus?: {
    isCentralized: boolean;
    voucherId?: string;
    voucherNumber?: number | string;
    voucherDate?: string;
    onViewVoucher?: (voucherId: string) => void;
    onQuickCentralize?: () => void;
    isCentralizing?: boolean;
    disabled?: boolean;
    disabledTooltip?: string;
    pendingCount?: number;
    pendingAmount?: number;
  };
  kpis?: ModuleKPICardProps[];
  actions?: React.ReactNode;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const StandardModuleHeader: React.FC<StandardModuleHeaderProps> = ({
  title,
  subtitle,
  icon: Icon,
  iconBgColor = 'bg-indigo-600',
  layerBadge = { layer: 1, label: 'Capa 1: Módulo Operativo' },
  period,
  centralizationStatus,
  kpis,
  actions,
  onRefresh,
  isRefreshing = false
}) => {
  const layerColors: Record<number, string> = {
    1: 'bg-blue-50 text-blue-700 border-blue-200',
    2: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    3: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    4: 'bg-purple-50 text-purple-700 border-purple-200'
  };

  const kpiVariantStyles: Record<string, { bg: string; border: string; text: string; iconColor: string }> = {
    default: { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-900', iconColor: 'text-slate-500' },
    success: { bg: 'bg-emerald-50/60', border: 'border-emerald-200', text: 'text-emerald-900', iconColor: 'text-emerald-600' },
    warning: { bg: 'bg-amber-50/60', border: 'border-amber-200', text: 'text-amber-900', iconColor: 'text-amber-600' },
    info: { bg: 'bg-blue-50/60', border: 'border-blue-200', text: 'text-blue-900', iconColor: 'text-blue-600' },
    purple: { bg: 'bg-indigo-50/60', border: 'border-indigo-200', text: 'text-indigo-900', iconColor: 'text-indigo-600' },
    danger: { bg: 'bg-rose-50/60', border: 'border-rose-200', text: 'text-rose-900', iconColor: 'text-rose-600' }
  };

  return (
    <div className="space-y-4">
      {/* TARJETA PRINCIPAL DEL ENCABEZADO */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 transition-all">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* LADO IZQUIERDO: Identidad del Módulo */}
          <div className="flex items-start sm:items-center gap-3.5">
            <div className={`p-3 ${iconBgColor} text-white rounded-xl shadow-xs shrink-0 flex items-center justify-center`}>
              <Icon className="w-6 h-6" />
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold text-slate-900 tracking-tight leading-snug">
                  {title}
                </h1>

                {/* Badge de Capa ERP */}
                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${layerColors[layerBadge.layer] || layerColors[1]}`}>
                  {layerBadge.label || `Capa ${layerBadge.layer}`}
                </span>

                {/* Badge de Período si aplica */}
                {period && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-slate-100 text-slate-800 border border-slate-200">
                    {period.selectedPeriod}
                  </span>
                )}
              </div>

              {subtitle && (
                <p className="text-xs text-slate-500 mt-1 max-w-2xl">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          {/* LADO DERECHO: Control de Período y Estado de Centralización */}
          <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-center">
            {/* Navegación de Período */}
            {period && (
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-2xs">
                {period.onPrevPeriod && (
                  <button
                    type="button"
                    onClick={period.onPrevPeriod}
                    className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg transition-colors cursor-pointer"
                    title="Período anterior"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                )}

                <span className="px-2.5 py-1 text-xs font-bold font-mono text-slate-800 bg-white rounded-lg shadow-2xs border border-slate-200/80">
                  {period.selectedPeriod}
                </span>

                {period.onNextPeriod && (
                  <button
                    type="button"
                    onClick={period.onNextPeriod}
                    className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg transition-colors cursor-pointer"
                    title="Período siguiente"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}

            {/* Badge de Estado de Centralización (Capa 1 ➔ Capa 2) */}
            {centralizationStatus && (
              <div className="flex items-center gap-1.5">
                {centralizationStatus.isCentralized ? (
                  <div className="flex items-center gap-2 bg-emerald-50 text-emerald-800 border border-emerald-300 px-3 py-1.5 rounded-xl shadow-2xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div className="flex items-center gap-1.5 text-xs font-bold">
                      <span>Centralizado</span>
                      {centralizationStatus.voucherNumber && (
                        <span className="bg-emerald-200/70 text-emerald-900 px-1.5 py-0.5 rounded text-[11px] font-mono">
                          Folio #{centralizationStatus.voucherNumber}
                        </span>
                      )}
                    </div>
                    {centralizationStatus.onViewVoucher && centralizationStatus.voucherId && (
                      <button
                        type="button"
                        onClick={() => centralizationStatus.onViewVoucher?.(centralizationStatus.voucherId!)}
                        className="ml-1 p-0.5 text-emerald-700 hover:text-emerald-950 hover:bg-emerald-200 rounded transition-colors cursor-pointer"
                        title="Ver comprobante en el Libro Diario"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 bg-amber-50 text-amber-800 border border-amber-300 px-3 py-1.5 rounded-xl text-xs font-bold shadow-2xs">
                      <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>Pendiente Centralizar</span>
                    </div>

                    {/* Botón Acción Rápida Centralizar */}
                    {centralizationStatus.onQuickCentralize && (
                      <button
                        type="button"
                        onClick={centralizationStatus.onQuickCentralize}
                        disabled={centralizationStatus.disabled || centralizationStatus.isCentralizing}
                        title={centralizationStatus.disabledTooltip || 'Enviar y generar asiento en el Libro Diario'}
                        className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold shadow-2xs transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        {centralizationStatus.isCentralizing ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5 text-emerald-200" />
                        )}
                        <span>{centralizationStatus.isCentralizing ? 'Centralizando...' : 'Centralizar Mes'}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Botón de Actualizar si aplica */}
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors cursor-pointer"
                title="Actualizar datos"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
            )}

            {/* Acciones Adicionales Inyectadas */}
            {actions}
          </div>
        </div>
      </div>

      {/* FILA DE TARJETAS KPI ESTANDARIZADAS */}
      {kpis && kpis.length > 0 && (
        <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-${Math.min(kpis.length, 5)} gap-3.5`}>
          {kpis.map((kpi, idx) => {
            const style = kpiVariantStyles[kpi.variant || 'default'];
            const KpiIcon = kpi.icon;

            return (
              <div
                key={idx}
                className={`${style.bg} p-4 rounded-xl border ${style.border} shadow-2xs transition-all hover:shadow-xs flex flex-col justify-between`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider line-clamp-1">
                    {kpi.label}
                  </span>
                  {KpiIcon && (
                    <KpiIcon className={`w-4 h-4 ${style.iconColor} shrink-0`} />
                  )}
                </div>

                <div className="mt-2">
                  <div className={`text-xl font-bold font-mono tracking-tight ${style.text}`}>
                    {typeof kpi.value === 'number'
                      ? kpi.value.toLocaleString('es-CL')
                      : kpi.value}
                  </div>
                  {kpi.subtext && (
                    <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                      {kpi.subtext}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
