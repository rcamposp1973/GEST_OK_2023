import React, { useState } from 'react';
import { 
  Pin, ChevronLeft, ChevronRight, ChevronDown, 
  LayoutGrid, ArrowLeftRight, Monitor, EyeOff, MoreHorizontal
} from 'lucide-react';
import { CockpitModuleItem, DockPosition, COCKPIT_MODULE_CATALOG, CATEGORY_COLORS } from './cockpitTypes';

interface CockpitDockProps {
  position: DockPosition;
  onChangePosition: (pos: DockPosition) => void;
  activeModuleId: string;
  openModuleIds: string[];
  onOpenModule: (moduleId: string) => void;
  onOpenNewTabModal: () => void;
  onOpenQuickAccessConfig?: () => void;
  pinnedModuleIds?: string[];
  onTogglePinModule?: (moduleId: string) => void;
}

const DEFAULT_DOCK_MODULE_IDS = [
  'calculator',
  'centralizaciones',
  'vouchers',
  'libroDiario',
  'libroMayor',
  'analisisAuxiliares',
  'balance8',
  'balanceIFRS',
  'estadoResultados',
  'conciliacionBancaria',
  'rcv',
  'operativaComercial',
  'formulario29',
  'liquidaciones',
  'accounts'
];

export const CockpitDock: React.FC<CockpitDockProps> = ({
  position,
  onChangePosition,
  activeModuleId,
  openModuleIds,
  onOpenModule,
  onOpenNewTabModal,
  onOpenQuickAccessConfig,
  pinnedModuleIds = DEFAULT_DOCK_MODULE_IDS,
}) => {
  const [showPositionMenu, setShowPositionMenu] = useState(false);
  const [hoveredModuleId, setHoveredModuleId] = useState<string | null>(null);

  if (position === 'hidden') {
    return null;
  }

  const dockModules: CockpitModuleItem[] = (pinnedModuleIds.length > 0 ? pinnedModuleIds : DEFAULT_DOCK_MODULE_IDS)
    .map(id => COCKPIT_MODULE_CATALOG.find(m => m.id === id))
    .filter((m): m is CockpitModuleItem => Boolean(m));

  const renderDockButton = (mod: CockpitModuleItem) => {
    const Icon = mod.icon;
    const isActive = activeModuleId === mod.id;
    const isOpenInMemory = openModuleIds.includes(mod.id);
    const catColors = CATEGORY_COLORS[mod.category] || CATEGORY_COLORS.FINANZAS;

    return (
      <div key={mod.id} className="relative group flex items-center justify-center">
        <button
          type="button"
          onClick={() => onOpenModule(mod.id)}
          onMouseEnter={() => setHoveredModuleId(mod.id)}
          onMouseLeave={() => setHoveredModuleId(null)}
          className={`relative w-9 h-9 rounded-lg flex items-center justify-center transition-all cursor-pointer select-none ${
            isActive
              ? 'bg-slate-900 text-white border border-slate-900 shadow-xs scale-105 z-10'
              : isOpenInMemory
              ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 shadow-2xs'
              : 'bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-900 border border-slate-200 shadow-2xs'
          }`}
          title={`${mod.label} (${mod.category})`}
        >
          <Icon className={`w-4 h-4 transition-transform group-hover:scale-110 ${
            isActive ? 'text-white' : isOpenInMemory ? 'text-slate-900' : 'text-slate-600'
          }`} />

          {isOpenInMemory && !isActive && (
            <span 
              className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500 ring-1.5 ring-white animate-pulse shadow-xs" 
              title="Pestaña abierta en memoria"
            />
          )}
        </button>

        {hoveredModuleId === mod.id && (
          <div 
            className={`absolute z-50 pointer-events-none whitespace-nowrap bg-slate-900 border border-slate-800 text-white text-[11px] font-medium py-1 px-2.5 rounded-lg shadow-xl flex items-center gap-2 animate-in fade-in-50 duration-100 ${
              position === 'left' 
                ? 'left-full ml-2 top-1/2 -translate-y-1/2' 
                : position === 'right' 
                ? 'right-full mr-2 top-1/2 -translate-y-1/2' 
                : 'bottom-full mb-2.5 left-1/2 -translate-x-1/2'
            }`}
          >
            <span className="font-bold text-white">{mod.label}</span>
            <span className={`text-[9px] font-mono uppercase px-1 py-0.2 rounded font-bold ${catColors.bg} ${catColors.text}`}>
              {mod.category}
            </span>
            {mod.shortcut && (
              <span className="text-[9px] font-mono text-slate-400 bg-slate-800 px-1 rounded">
                {mod.shortcut}
              </span>
            )}
            {isOpenInMemory && (
              <span className="text-[9px] text-emerald-300 font-mono">● Abierta</span>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderPositionMenu = () => (
    <div 
      className="fixed z-50 bg-white border border-slate-200 rounded-xl shadow-xl p-1.5 text-xs text-slate-800 min-w-[170px] space-y-0.5 animate-in fade-in zoom-in-95 duration-100"
      style={{ bottom: '60px', left: position === 'left' ? '60px' : position === 'right' ? 'auto' : '50%', right: position === 'right' ? '60px' : 'auto', transform: position === 'bottom' ? 'translateX(-50%)' : 'none' }}
    >
      <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
        Ubicación del Dock
      </div>
      <button
        onClick={() => { onChangePosition('left'); setShowPositionMenu(false); }}
        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer ${position === 'left' ? 'text-slate-900 font-bold bg-slate-100' : ''}`}
      >
        <span className="flex items-center gap-2">⬅️ Lateral Izquierdo</span>
        {position === 'left' && <span className="text-[10px] text-slate-600 font-bold">Activo</span>}
      </button>
      <button
        onClick={() => { onChangePosition('right'); setShowPositionMenu(false); }}
        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer ${position === 'right' ? 'text-slate-900 font-bold bg-slate-100' : ''}`}
      >
        <span className="flex items-center gap-2">➡️ Lateral Derecho</span>
        {position === 'right' && <span className="text-[10px] text-slate-600 font-bold">Activo</span>}
      </button>
      <button
        onClick={() => { onChangePosition('bottom'); setShowPositionMenu(false); }}
        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer ${position === 'bottom' ? 'text-slate-900 font-bold bg-slate-100' : ''}`}
      >
        <span className="flex items-center gap-2">⬇️ Flotante al Pie</span>
        {position === 'bottom' && <span className="text-[10px] text-slate-600 font-bold">Activo</span>}
      </button>
      <button
        onClick={() => { onChangePosition('hidden'); setShowPositionMenu(false); }}
        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-rose-50 text-rose-600 transition-colors cursor-pointer border-t border-slate-100 mt-1"
      >
        <span className="flex items-center gap-2">👁️ Ocultar Dock</span>
        <span className="text-[9px] font-mono text-slate-400">Ctrl+D</span>
      </button>
    </div>
  );

  if (position === 'bottom') {
    return (
      <aside 
        aria-label="Barra de herramientas flotante al pie"
        className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 bg-white/95 hover:bg-white backdrop-blur-md border border-slate-200 px-2.5 py-1.5 rounded-2xl shadow-xl transition-all"
      >
        <button
          onClick={onOpenNewTabModal}
          className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 flex items-center justify-center transition-all cursor-pointer shadow-2xs group"
          title="Abrir Catálogo de Herramientas y Módulos"
        >
          <LayoutGrid className="w-4 h-4 group-hover:scale-110 transition-transform text-slate-700" />
        </button>

        <div className="h-5 w-px bg-slate-200 mx-0.5" />

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar max-w-[75vw]">
          {dockModules.map(mod => renderDockButton(mod))}
        </div>

        <div className="h-5 w-px bg-slate-200 mx-0.5" />

        <div className="relative">
          <button
            onClick={() => setShowPositionMenu(!showPositionMenu)}
            className="w-8 h-8 rounded-lg bg-white hover:bg-slate-100 text-slate-500 hover:text-slate-800 border border-slate-200 flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
            title="Cambiar posición del Dock"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {showPositionMenu && renderPositionMenu()}
        </div>
      </aside>
    );
  }

  return (
    <aside 
      aria-label={position === 'left' ? 'Barra lateral de herramientas izquierda' : 'Barra lateral de herramientas derecha'}
      className={`relative shrink-0 w-[48px] bg-white border-slate-200 text-slate-700 flex flex-col items-center justify-between py-2.5 z-40 select-none shadow-2xs ${
        position === 'left' ? 'border-r' : 'border-l order-last'
      }`}
    >
      <div className="w-full flex flex-col items-center gap-2">
        <button
          onClick={onOpenNewTabModal}
          className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 flex items-center justify-center transition-all cursor-pointer shadow-2xs group"
          title="Abrir Catálogo de Módulos (+)"
        >
          <LayoutGrid className="w-4 h-4 group-hover:scale-110 transition-transform text-slate-700" />
        </button>
        <div className="w-6 h-px bg-slate-200" />
      </div>

      <div className="flex-1 w-full flex flex-col items-center gap-1.5 overflow-y-auto no-scrollbar py-1">
        {dockModules.map(mod => renderDockButton(mod))}
      </div>

      <div className="w-full flex flex-col items-center gap-1 pt-2 border-t border-slate-200">
        <button
          onClick={onOpenQuickAccessConfig}
          className="w-8 h-8 rounded-lg bg-white hover:bg-slate-100 text-slate-500 hover:text-slate-800 border border-slate-200 flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
          title="Personalizar Barra"
        >
          <Pin className="w-4 h-4" />
        </button>
        <div className="relative">
          <button
            onClick={() => setShowPositionMenu(!showPositionMenu)}
            className="w-8 h-8 rounded-lg bg-white hover:bg-slate-100 text-slate-500 hover:text-slate-800 border border-slate-200 flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
            title="Ubicación del Dock"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
          </button>
          {showPositionMenu && renderPositionMenu()}
        </div>
      </div>
    </aside>
  );
};
