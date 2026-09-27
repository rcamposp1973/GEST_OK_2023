import React, { useRef, useState } from 'react';
import { 
  X, Plus, Maximize2, Minimize2, ArrowLeft, Lock, Unlock, 
  Download, Search, Sparkles, Pin, LayoutGrid, MoreHorizontal,
  ChevronLeft, ChevronRight, Calculator
} from 'lucide-react';
import { WorkspaceTab, DockPosition, CATEGORY_COLORS, COCKPIT_MODULE_CATALOG } from './cockpitTypes';
import { Company, FiscalPeriodYear } from '../../types';

interface CockpitTabBarProps {
  company: Company;
  openTabs: WorkspaceTab[];
  activeTabId: string;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onOpenNewTabModal: () => void;
  onBackToCompanies: () => void;
  // Períodos y Años
  selectedYear: number;
  onChangeYear: (year: number) => void;
  selectedPeriod: string;
  onChangePeriod: (period: string) => void;
  fiscalYears: FiscalPeriodYear[];
  checkIsPeriodClosed: (period: string) => { isClosed: boolean };
  // Acciones globales
  onOpenExcelImport: () => void;
  onOpenCommandPalette: () => void;
  onOpenCalculator: () => void;
  onOpenQuickAccessConfig: () => void;
  // Zen Mode
  isZenMode: boolean;
  onToggleZenMode: () => void;
  // Dock Control
  dockPosition: DockPosition;
  onChangeDockPosition: (pos: DockPosition) => void;
}

export const CockpitTabBar: React.FC<CockpitTabBarProps> = ({
  company,
  openTabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onOpenNewTabModal,
  onBackToCompanies,
  selectedYear,
  onChangeYear,
  selectedPeriod,
  onChangePeriod,
  fiscalYears,
  checkIsPeriodClosed,
  onOpenExcelImport,
  onOpenCommandPalette,
  onOpenCalculator,
  onOpenQuickAccessConfig,
  isZenMode,
  onToggleZenMode,
  dockPosition,
  onChangeDockPosition
}) => {
  const tabsScrollRef = useRef<HTMLDivElement>(null);
  const [isHoveringZenHeader, setIsHoveringZenHeader] = useState(false);
  const [showDockMenu, setShowDockMenu] = useState(false);

  const scrollTabs = (direction: 'left' | 'right') => {
    if (tabsScrollRef.current) {
      tabsScrollRef.current.scrollBy({
        left: direction === 'left' ? -200 : 200,
        behavior: 'smooth'
      });
    }
  };

  const periodCheck = checkIsPeriodClosed(selectedPeriod);

  return (
    <>
      {/* TRIGGER BAR EN MODO ZEN (Línea interactiva superior cuando la cabecera está oculta) */}
      {isZenMode && (
        <div 
          onMouseEnter={() => setIsHoveringZenHeader(true)}
          className="fixed top-0 inset-x-0 h-2 z-50 hover:h-4 bg-indigo-500/20 hover:bg-indigo-500/40 transition-all cursor-pointer flex items-center justify-center group"
          title="Pasar el cursor para ver pestañas y herramientas (Modo Enfoque activo)"
        >
          <div className="w-16 h-1 rounded-full bg-indigo-400 group-hover:w-24 transition-all" />
        </div>
      )}

      {/* CABECERA PRINCIPAL Y BARRA DE PESTAÑAS */}
      <header
        onMouseEnter={() => isZenMode && setIsHoveringZenHeader(true)}
        onMouseLeave={() => isZenMode && setIsHoveringZenHeader(false)}
        className={`bg-slate-900 border-b border-slate-800 text-white select-none shrink-0 transition-transform duration-200 z-40 ${
          isZenMode 
            ? isHoveringZenHeader
              ? 'fixed top-0 inset-x-0 shadow-2xl translate-y-0 opacity-100'
              : 'fixed top-0 inset-x-0 -translate-y-full opacity-0 pointer-events-none'
            : 'relative'
        }`}
      >
        <div className="px-3 py-1.5 flex items-center justify-between gap-3 h-[46px]">
          
          {/* LADO IZQUIERDO: Volver + Empresa + RUT */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onBackToCompanies}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white rounded-lg text-xs font-semibold border border-slate-700/80 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="Volver a la selección de empresas"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden sm:inline">Empresas</span>
            </button>

            <div className="flex items-center gap-1.5 border-l border-slate-800 pl-2">
              <span className="text-xs font-bold text-white truncate max-w-[140px] sm:max-w-[190px]" title={company.name}>
                {company.name}
              </span>
              <span className="text-[10px] font-mono text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700/60 hidden md:inline">
                {company.rut}
              </span>
            </div>
          </div>

          {/* CENTRO: BARRA DE PESTAÑAS MULTI-TAREA */}
          <div className="flex-1 flex items-center gap-1 overflow-hidden min-w-0">
            {/* Botón scroll izquierda */}
            <button
              onClick={() => scrollTabs('left')}
              className="p-1 text-slate-500 hover:text-white hover:bg-slate-800 rounded transition-colors shrink-0 hidden sm:block"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            {/* Contenedor desplazable de pestañas abiertas */}
            <div
              ref={tabsScrollRef}
              className="flex-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth py-0.5"
            >
              {openTabs.map(tab => {
                const isActive = activeTabId === tab.id;
                const mod = COCKPIT_MODULE_CATALOG.find(m => m.id === tab.moduleId);
                const Icon = mod?.icon;
                const catColors = CATEGORY_COLORS[tab.category] || CATEGORY_COLORS.FINANZAS;

                return (
                  <div
                    key={tab.id}
                    onClick={() => onSelectTab(tab.id)}
                    className={`group relative flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 border ${
                      isActive
                        ? 'bg-slate-800 text-white border-indigo-500/60 shadow-md shadow-indigo-500/10 ring-1 ring-indigo-500/40'
                        : 'bg-slate-850/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 border-slate-800'
                    }`}
                  >
                    {/* Borde sutil superior en pestaña activa */}
                    {isActive && (
                      <div className="absolute inset-x-2 top-0 h-0.5 bg-indigo-400 rounded-full" />
                    )}

                    {Icon && (
                      <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-indigo-400' : catColors.text}`} />
                    )}

                    <span className="truncate max-w-[130px]">{tab.title}</span>

                    {/* Botón cerrar pestaña */}
                    {tab.closable && openTabs.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onCloseTab(tab.id);
                        }}
                        className="w-4 h-4 rounded-full hover:bg-slate-700/80 hover:text-white text-slate-500 flex items-center justify-center transition-colors ml-0.5 cursor-pointer"
                        title="Cerrar pestaña (Ctrl+W)"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}

              {/* Botón (+) Abrir nueva pestaña */}
              <button
                onClick={onOpenNewTabModal}
                className="w-7 h-7 rounded-lg bg-slate-800/80 hover:bg-indigo-600/40 text-slate-400 hover:text-white border border-slate-750 flex items-center justify-center transition-all shrink-0 cursor-pointer shadow-xs group"
                title="Abrir nueva pestaña de trabajo (+)"
              >
                <Plus className="w-4 h-4 group-hover:scale-110 transition-transform" />
              </button>
            </div>

            {/* Botón scroll derecha */}
            <button
              onClick={() => scrollTabs('right')}
              className="p-1 text-slate-500 hover:text-white hover:bg-slate-800 rounded transition-colors shrink-0 hidden sm:block"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* LADO DERECHO: SELECTORES OPERATIVOS Y ACCIONES */}
          <div className="flex items-center gap-1.5 shrink-0 text-xs">
            
            {/* Año */}
            <div className="flex items-center gap-1 bg-slate-800/90 border border-slate-700/80 rounded-lg px-2 py-0.5 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400">Año:</span>
              <select
                value={selectedYear}
                onChange={e => onChangeYear(parseInt(e.target.value, 10))}
                className="bg-transparent text-white font-bold font-mono focus:outline-none cursor-pointer text-xs"
              >
                {[2027, 2026, 2025].map(y => (
                  <option key={y} value={y} className="bg-slate-850 text-white">{y}</option>
                ))}
              </select>
            </div>

            {/* Mes Operativo con Indicador de Candado */}
            <div className="flex items-center gap-1.5 bg-slate-800/90 border border-slate-700/80 rounded-lg px-2 py-0.5 shadow-2xs">
              <span className="flex items-center gap-1" title={periodCheck.isClosed ? "Período Cerrado" : "Período Abierto"}>
                {periodCheck.isClosed ? (
                  <Lock className="w-3 h-3 text-rose-400" />
                ) : (
                  <Unlock className="w-3 h-3 text-emerald-400" />
                )}
              </span>
              <select
                value={selectedPeriod}
                onChange={e => onChangePeriod(e.target.value)}
                className="bg-transparent text-white font-bold font-mono focus:outline-none cursor-pointer text-xs"
              >
                {(() => {
                  const currFy = fiscalYears.find(f => f.id === String(selectedYear));
                  const monthNames = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
                  const monthOptions: { periodStr: string; label: string; isOpen: boolean }[] = [];
                  for (let m = 1; m <= 12; m++) {
                    const mStr = String(m).padStart(2, '0');
                    const periodStr = `${selectedYear}-${mStr}`;
                    const isOpen = currFy ? currFy.months[m] === 'Abierto' : false;
                    monthOptions.push({
                      periodStr,
                      label: `${monthNames[m]} ${selectedYear} ${isOpen ? '●' : '🔒'}`,
                      isOpen
                    });
                  }
                  return monthOptions.map(opt => (
                    <option
                      key={opt.periodStr}
                      value={opt.periodStr}
                      className={opt.isOpen ? 'bg-slate-850 text-white font-bold' : 'bg-slate-900 text-slate-400'}
                    >
                      {opt.label}
                    </option>
                  ));
                })()}
              </select>
            </div>

            {/* Command Palette Trigger */}
            <button
              onClick={onOpenCommandPalette}
              className="p-1.5 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white rounded-lg border border-slate-700/80 transition-colors cursor-pointer hidden lg:flex items-center gap-1"
              title="Paleta de Comandos (Ctrl+K)"
            >
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <kbd className="text-[10px] font-mono text-slate-400 px-1 py-0.2 rounded bg-slate-900 border border-slate-750">
                ⌘K
              </kbd>
            </button>

            {/* Calculadora Táctica */}
            <button
              onClick={onOpenCalculator}
              className="p-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-lg border border-amber-500/40 transition-colors cursor-pointer flex items-center gap-1.5"
              title="Calculadora Táctica y Cinta de Memoria"
            >
              <Calculator className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[10px] font-bold hidden md:inline">Calculadora</span>
            </button>

            {/* Personalizar Acceso Rápido */}
            <button
              onClick={onOpenQuickAccessConfig}
              className="p-1.5 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white rounded-lg border border-slate-700/80 transition-colors cursor-pointer flex items-center gap-1"
              title="Personalizar barra de acceso rápido (para cada usuario)"
            >
              <Pin className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-[10px] font-bold">Personalizar</span>
            </button>

            {/* Importar Excel */}
            <button
              onClick={onOpenExcelImport}
              className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs flex items-center gap-1 shadow-xs transition-colors cursor-pointer hidden xl:flex"
              title="Importar Excel / CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Importar</span>
            </button>

            {/* Selector de Dock */}
            <div className="relative">
              <button
                onClick={() => setShowDockMenu(!showDockMenu)}
                className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                  dockPosition !== 'hidden'
                    ? 'bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border-slate-700/80'
                    : 'bg-slate-850 text-slate-500 border-slate-800'
                }`}
                title="Configuración de ubicación del Dock de herramientas"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>

              {showDockMenu && (
                <div className="absolute right-0 top-full mt-1.5 z-50 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-1.5 text-xs text-slate-200 min-w-[170px] space-y-0.5">
                  <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                    Posición del Dock
                  </div>
                  <button
                    onClick={() => { onChangeDockPosition('left'); setShowDockMenu(false); }}
                    className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-slate-800 transition-colors ${dockPosition === 'left' ? 'text-indigo-400 font-bold bg-indigo-500/10' : ''}`}
                  >
                    <span>⬅️ Lateral Izquierdo</span>
                    {dockPosition === 'left' && <span className="text-[10px]">Activo</span>}
                  </button>
                  <button
                    onClick={() => { onChangeDockPosition('right'); setShowDockMenu(false); }}
                    className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-slate-800 transition-colors ${dockPosition === 'right' ? 'text-indigo-400 font-bold bg-indigo-500/10' : ''}`}
                  >
                    <span>➡️ Lateral Derecho</span>
                    {dockPosition === 'right' && <span className="text-[10px]">Activo</span>}
                  </button>
                  <button
                    onClick={() => { onChangeDockPosition('bottom'); setShowDockMenu(false); }}
                    className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-slate-800 transition-colors ${dockPosition === 'bottom' ? 'text-indigo-400 font-bold bg-indigo-500/10' : ''}`}
                  >
                    <span>⬇️ Flotante al Pie</span>
                    {dockPosition === 'bottom' && <span className="text-[10px]">Activo</span>}
                  </button>
                  <button
                    onClick={() => { onChangeDockPosition('hidden'); setShowDockMenu(false); }}
                    className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-slate-800 text-rose-300 transition-colors border-t border-slate-800 mt-1"
                  >
                    <span>👁️ Ocultar Dock</span>
                  </button>
                </div>
              )}
            </div>

            {/* MODO ZEN / PANTALLA COMPLETA */}
            <button
              onClick={onToggleZenMode}
              className={`p-1.5 rounded-lg border transition-all cursor-pointer flex items-center gap-1 ${
                isZenMode
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 hover:bg-amber-500/30'
                  : 'bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border-slate-700/80'
              }`}
              title={isZenMode ? 'Salir de Modo Enfoque / Fijar Pestañas' : 'Modo Enfoque Pantalla Completa (F11 / Zen)'}
            >
              {isZenMode ? (
                <>
                  <Pin className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-[10px] font-bold text-amber-300 hidden md:inline">Fijar</span>
                </>
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>

          </div>
        </div>
      </header>
    </>
  );
};
