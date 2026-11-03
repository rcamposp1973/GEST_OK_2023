import React, { useRef, useState, useEffect } from 'react';
import { 
  X, Plus, Maximize2, Minimize2, ArrowLeft, Lock, Unlock, 
  Search, Pin, LayoutGrid,
  ChevronLeft, ChevronRight, Keyboard,
  Activity, Settings, Key, LogOut, Check, Sparkles
} from 'lucide-react';
import { WorkspaceTab, DockPosition, CATEGORY_COLORS, COCKPIT_MODULE_CATALOG } from './cockpitTypes';
import { Company, FiscalPeriodYear, UserRole } from '../../types';
import { syncOnlineChileanIndicators, DailyIndicator } from '../../utils/chileanEconomicIndicators';
import { INDICATOR_LABELS } from '../ExecutiveHeader';
import { isDemoFerreteriaCompany } from '../../utils/demoFerreteriaGenerator';
import ChangePasswordModal from '../ChangePasswordModal';

interface CockpitTabBarProps {
  company: Company;
  studyName?: string;
  currentUserEmail?: string | null;
  currentUserRole?: UserRole | string | null;
  onLogout?: () => void;
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
  onOpenShortcutsModal?: () => void;
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
  studyName,
  currentUserEmail,
  currentUserRole,
  onLogout,
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
  onOpenShortcutsModal,
  onOpenCalculator,
  onOpenQuickAccessConfig,
  isZenMode,
  onToggleZenMode
}) => {
  const tabsScrollRef = useRef<HTMLDivElement>(null);

  // Pantalla Completa nativa del navegador
  const [isFullscreen, setIsFullscreen] = useState(() => {
    return typeof document !== 'undefined' ? !!document.fullscreenElement : false;
  });

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
      }
    } catch (err) {
      console.warn("Fullscreen toggle error:", err);
    }
  };

  // Indicadores Económicos Oficiales sincronizados
  const [selectedIndicators, setSelectedIndicators] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('gestok_pref_indicators');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === 2) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn("Could not load indicator preferences:", e);
    }
    return ['uf', 'dolar'];
  });

  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showChangePassModal, setShowChangePassModal] = useState(false);
  const [latestRate, setLatestRate] = useState<DailyIndicator | null>(null);

  useEffect(() => {
    const loadIndicators = async () => {
      const series = await syncOnlineChileanIndicators();
      if (series.length > 0) {
        const todayStr = new Date().toISOString().split('T')[0];
        const matchToday = series.find(s => s.date === todayStr);
        if (matchToday) {
          setLatestRate(matchToday);
        } else {
          const pastRecords = series.filter(s => s.date <= todayStr);
          if (pastRecords.length > 0) {
            setLatestRate(pastRecords[pastRecords.length - 1]);
          } else {
            setLatestRate(series[0]);
          }
        }
      }
    };
    loadIndicators();
  }, []);

  const handleSaveIndicators = (newSelection: string[]) => {
    if (newSelection.length === 2) {
      setSelectedIndicators(newSelection);
      localStorage.setItem('gestok_pref_indicators', JSON.stringify(newSelection));
      setShowConfigModal(false);
    }
  };

  const getRoleLabel = () => {
    if (currentUserRole === UserRole.SUPER_USER || currentUserRole === 'SUPER_USER') return 'Super Admin';
    if (currentUserRole === UserRole.STUDY_ADMIN || currentUserRole === 'STUDY_ADMIN') return 'Admin Estudio';
    if (currentUserRole === UserRole.ANALYST || currentUserRole === 'ANALYST') return 'Analista';
    if (currentUserRole === UserRole.OBSERVER || currentUserRole === 'OBSERVER') return 'Observador';
    return 'Contador';
  };

  const formatVal = (key: string, rateObj: DailyIndicator | null) => {
    if (!rateObj) return '...';
    const raw = (rateObj as any)[key];
    if (raw === undefined || raw === null) return 'N/A';
    if (key === 'ipc') {
      const num = Number(raw);
      return `${num > 0 ? '+' : ''}${num.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`;
    }
    if (key === 'utm') {
      return `$${Math.round(Number(raw)).toLocaleString('es-CL')}`;
    }
    return `$${Number(raw).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const scrollTabs = (direction: 'left' | 'right') => {
    if (tabsScrollRef.current) {
      tabsScrollRef.current.scrollBy({
        left: direction === 'left' ? -240 : 240,
        behavior: 'smooth'
      });
    }
  };

  const periodCheck = checkIsPeriodClosed(selectedPeriod);

  return (
    <>
      {/* CABECERA PRINCIPAL SINTETIZADA: BARRA EJECUTIVA ÚNICA + BARRA DE PESTAÑAS (ESTILO LINEAR / RAMP) */}
      <header className="bg-white border-b border-slate-200 text-slate-800 select-none shrink-0 z-50 sticky top-0 relative shadow-2xs">
        {/* FILA 1 (ÚNICA SINTETIZADA): IDENTIDAD, EMPRESA, PERÍODO, HERRAMIENTAS, INDICADORES Y USUARIO */}
        <div className="px-3 py-1 flex items-center justify-between gap-2.5 min-h-[46px] bg-white border-b border-slate-200/90 text-slate-800">
          
          {/* LADO IZQUIERDO: Marca Gest_OK + Volver a Empresas + Contexto (Estudio / Empresa Activa / RUT) */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Logomarca oficial */}
            <div className="flex items-center gap-1.5 mr-0.5 group">
              <div className="w-7 h-7 rounded-lg bg-slate-900 flex items-center justify-center text-white shadow-2xs">
                <Activity className="w-4 h-4 stroke-[2.2]" />
              </div>
              <div className="hidden 2xl:flex items-center gap-1">
                <span className="font-bold text-xs tracking-tight text-slate-900">Gest_OK</span>
                <span className="text-[9px] font-mono font-semibold bg-slate-100 text-slate-700 px-1 py-0.2 rounded border border-slate-200">ERP</span>
              </div>
            </div>

            {/* Botón Volver a la selección de Empresas Clientes */}
            <button
              onClick={onBackToCompanies}
              className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 rounded-lg text-xs font-semibold border border-slate-200 transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="Volver a la selección de empresas clientes"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-slate-500" />
              <span>VOLVER</span>
            </button>

            <div className="h-4 w-px bg-slate-200 hidden sm:block" />

            {/* Contexto: Estudio / Empresa Activa + RUT + Showroom */}
            <div className="flex items-center gap-1.5">
              {studyName && (
                <span className="text-[11px] text-slate-500 font-medium hidden 2xl:inline truncate max-w-[130px]" title={studyName}>
                  {studyName} /
                </span>
              )}
              <span className="text-xs font-semibold text-slate-900 tracking-tight truncate max-w-[150px] sm:max-w-[220px] lg:max-w-[280px]" title={company.name}>
                {company.name}
              </span>
              <span className="text-[10px] font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 hidden md:inline">
                {company.rut}
              </span>
              {isDemoFerreteriaCompany(company) && (
                <span className="text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded shadow-2xs flex items-center gap-0.5">
                  <Sparkles className="w-2.5 h-2.5" />
                  <span>SHOWROOM</span>
                </span>
              )}
            </div>
          </div>

          {/* CENTRO: SELECTORES OPERATIVOS (AÑO, MES), HERRAMIENTAS Y FORMATO */}
          <div className="flex items-center gap-1.5 shrink-0 text-xs">
            {/* Año */}
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-500">Año:</span>
              <select
                value={selectedYear}
                onChange={e => onChangeYear(parseInt(e.target.value, 10))}
                className="bg-transparent text-slate-900 font-bold font-mono focus:outline-none cursor-pointer text-xs"
              >
                {[2027, 2026, 2025].map(y => (
                  <option key={y} value={y} className="bg-white text-slate-900">{y}</option>
                ))}
              </select>
            </div>

            {/* Mes Operativo con Candado */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5 shadow-2xs">
              <span className="flex items-center gap-1" title={periodCheck.isClosed ? "Período Cerrado" : "Período Abierto"}>
                {periodCheck.isClosed ? (
                  <Lock className="w-3 h-3 text-rose-500" />
                ) : (
                  <Unlock className="w-3 h-3 text-emerald-600" />
                )}
              </span>
              <select
                value={selectedPeriod}
                onChange={e => onChangePeriod(e.target.value)}
                className="bg-transparent text-slate-900 font-bold font-mono focus:outline-none cursor-pointer text-xs"
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
                      label: `${monthNames[m]} ${selectedYear} ${isOpen ? '●' : ''}`,
                      isOpen
                    });
                  }
                  return monthOptions.map(opt => (
                    <option
                      key={opt.periodStr}
                      value={opt.periodStr}
                      className={opt.isOpen ? 'bg-white text-slate-900 font-bold' : 'bg-slate-50 text-slate-500'}
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
              className="px-2 py-1 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 rounded-lg border border-slate-200 transition-colors cursor-pointer hidden md:flex items-center gap-1.5 shadow-2xs"
              title="Buscar aplicación, cuenta o auxiliar (Ctrl+K)"
            >
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[11px] font-medium hidden lg:inline">Buscar</span>
              <kbd className="text-[10px] font-mono text-slate-500 px-1 py-0.2 rounded bg-slate-100 border border-slate-200">
                ⌘K
              </kbd>
            </button>

            {/* Keyboard Shortcuts Guide Trigger */}
            <button
              onClick={onOpenShortcutsModal}
              className="px-2 py-1 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 rounded-lg border border-slate-200 transition-colors cursor-pointer hidden lg:flex items-center gap-1.5 shadow-2xs"
              title="Guía de Atajos de Teclado (F1 o Shift+?)"
            >
              <Keyboard className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-[11px] font-medium hidden xl:inline">Atajos</span>
              <kbd className="text-[10px] font-mono text-slate-500 px-1 py-0.2 rounded bg-slate-100 border border-slate-200">
                F1
              </kbd>
            </button>

          </div>

          {/* LADO DERECHO: INDICADORES ECONÓMICOS, USUARIO Y ACCIONES DE VENTANA */}
          <div className="flex items-center gap-1.5 shrink-0 text-xs">
            {/* Widget de Indicadores Económicos Oficiales */}
            <div className="hidden lg:flex items-center gap-1.5 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-200 shadow-2xs">
              {selectedIndicators.map(key => {
                const info = INDICATOR_LABELS[key] || { label: key.toUpperCase(), symbol: key.toUpperCase(), prefix: '$' };
                const valStr = formatVal(key, latestRate);
                return (
                  <div key={key} className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
                    <span className="text-[9px] text-slate-400 font-bold uppercase">{info.label}:</span>
                    <span className="text-[11px] font-mono font-bold text-slate-900 tabular-nums">
                      {valStr}
                    </span>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => setShowConfigModal(true)}
                className="p-1 hover:bg-slate-200 text-slate-400 hover:text-slate-700 rounded transition-colors cursor-pointer"
                title="Configurar indicadores económicos visibles"
              >
                <Settings className="w-3 h-3" />
              </button>
            </div>

            {/* Bloque de Usuario Compacto */}
            <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200 shadow-2xs">
              <div className="text-right hidden sm:block">
                <div className="text-[11px] font-mono font-medium text-slate-700 truncate max-w-[110px] xl:max-w-[140px]" title={currentUserEmail || ''}>
                  {currentUserEmail ? currentUserEmail.split('@')[0] : 'usuario'}
                </div>
                <div className="text-[9px] font-bold uppercase text-slate-500 leading-none">
                  {getRoleLabel()}
                </div>
              </div>

              <div className="h-4 w-px bg-slate-200 hidden sm:block" />

              {/* Botón Cambiar Contraseña */}
              <button
                onClick={() => setShowChangePassModal(true)}
                className="p-1 hover:bg-slate-200 text-slate-500 hover:text-slate-800 rounded transition-colors cursor-pointer"
                title="Cambiar contraseña de acceso"
              >
                <Key className="w-3.5 h-3.5" />
              </button>

              {/* Botón Cerrar Sesión */}
              {onLogout && (
                <button
                  onClick={onLogout}
                  className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                  title="Cerrar sesión"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Personalizar Acceso Rápido */}
            <button
              onClick={onOpenQuickAccessConfig}
              className="p-1.5 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 rounded-lg border border-slate-200 transition-colors cursor-pointer shadow-2xs"
              title="Personalizar barra de acceso rápido"
            >
              <Pin className="w-3.5 h-3.5" />
            </button>

            {/* PANTALLA COMPLETA REAL (Navegador) */}
            <button
              onClick={toggleFullscreen}
              className={`p-1.5 rounded-lg border transition-all cursor-pointer flex items-center gap-1 shadow-2xs ${
                isFullscreen
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 border-slate-200'
              }`}
              title={isFullscreen ? 'Salir de Pantalla Completa (Esc)' : 'Pantalla Completa (Maximizar monitor)'}
            >
              {isFullscreen ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* FILA 2: BARRA DE PESTAÑAS DE TRABAJO (AMPLIA, DESTACADA Y 100% VISIBLE) */}
        <div className="px-2 py-1 flex items-center justify-between gap-2 h-[38px] bg-slate-50 border-b border-slate-200">
          
          {/* Scroll izquierda */}
          <button
            onClick={() => scrollTabs('left')}
            className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded transition-colors shrink-0 cursor-pointer"
            title="Desplazar pestañas a la izquierda"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Contenedor desplazable de pestañas */}
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
                  className={`group relative flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 border ${
                    isActive
                      ? 'bg-white text-slate-950 border-slate-300 shadow-xs font-bold ring-1 ring-slate-900/5'
                      : 'bg-white/80 text-slate-600 hover:text-slate-900 hover:bg-white border-slate-200 shadow-2xs'
                  }`}
                  title={`${tab.title} (${tab.category})`}
                >
                  {/* Borde superior en pestaña activa */}
                  {isActive && (
                    <div className="absolute inset-x-2 top-0 h-0.5 bg-slate-900 rounded-full" />
                  )}

                  {Icon && (
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-slate-900' : 'text-slate-400 group-hover:text-slate-600'}`} />
                  )}

                  <span className="truncate max-w-[160px] sm:max-w-[220px]">{tab.title}</span>

                  {/* Botón cerrar pestaña */}
                  {tab.closable && openTabs.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onCloseTab(tab.id);
                      }}
                      className="w-4 h-4 rounded-full hover:bg-rose-100 hover:text-rose-600 text-slate-400 flex items-center justify-center transition-colors ml-0.5 cursor-pointer"
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
              className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200 flex items-center gap-1.5 text-xs font-semibold transition-all shrink-0 cursor-pointer shadow-2xs group"
              title="Abrir nueva pestaña (+)"
            >
              <Plus className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
              <span>Nueva Pestaña</span>
            </button>
          </div>

          {/* Scroll derecha */}
          <button
            onClick={() => scrollTabs('right')}
            className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded transition-colors shrink-0 cursor-pointer"
            title="Desplazar pestañas a la derecha"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Botón Catálogo Completo */}
          <button
            onClick={onOpenNewTabModal}
            className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white border border-slate-900 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer hidden md:flex shadow-2xs"
            title="Ver catálogo de todas las aplicaciones del sistema"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Todas las Aplicaciones</span>
          </button>
        </div>
      </header>

      {/* MODAL DE CONFIGURACIÓN DE INDICADORES VISIBLES */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 text-white rounded-2xl shadow-2xl border border-slate-750 max-w-sm w-full p-5 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <Settings className="w-4 h-4 text-indigo-400" />
                <span>Indicadores en Cabecera</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Selecciona los <strong>2 indicadores económicos</strong> que deseas mantener visibles en la cabecera del sistema.
            </p>

            <div className="space-y-2">
              {Object.keys(INDICATOR_LABELS).map(key => {
                const info = INDICATOR_LABELS[key];
                const isSelected = selectedIndicators.includes(key);

                const toggleSelection = () => {
                  if (isSelected) {
                    if (selectedIndicators.length > 1) {
                      setSelectedIndicators(selectedIndicators.filter(k => k !== key));
                    }
                  } else {
                    if (selectedIndicators.length < 2) {
                      setSelectedIndicators([...selectedIndicators, key]);
                    } else {
                      setSelectedIndicators([selectedIndicators[0], key]);
                    }
                  }
                };

                return (
                  <div
                    key={key}
                    onClick={toggleSelection}
                    className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-between cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-indigo-600/20 border-indigo-500/60 text-white'
                        : 'bg-slate-800/80 border-slate-700/80 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                        isSelected ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-slate-600 bg-slate-800'
                      }`}>
                        {isSelected && <Check className="w-3 h-3 stroke-[2]" />}
                      </div>
                      <span>{info.label}</span>
                    </div>
                    <span className="font-mono text-slate-400 text-[11px] tabular-nums">
                      {formatVal(key, latestRate)}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-lg text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleSaveIndicators(selectedIndicators)}
                disabled={selectedIndicators.length !== 2}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-lg text-xs font-bold border border-indigo-500 transition-colors cursor-pointer"
              >
                Guardar Preferencias
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CAMBIO DE CONTRASEÑA */}
      {showChangePassModal && currentUserEmail && (
        <ChangePasswordModal
          userEmail={currentUserEmail}
          onClose={() => setShowChangePassModal(false)}
        />
      )}
    </>
  );
};
