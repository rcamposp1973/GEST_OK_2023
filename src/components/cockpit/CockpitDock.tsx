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
  onOpenQuickAccessConfig: () => void;
  pinnedModuleIds?: string[];
  onTogglePinModule?: (moduleId: string) => void;
}

const DEFAULT_DOCK_MODULE_IDS = [
  'calculator',
  'vouchers',
  'libroDiario',
  'libroMayor',
  'analisisAuxiliares',
  'balance8',
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
          className={`relative w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer select-none ${
            isActive
              ? 'bg-gradient-to-b from-indigo-500 to-indigo-700 text-white shadow-lg shadow-indigo-500/40 ring-2 ring-indigo-300 ring-offset-1 ring-offset-[#0D253D] scale-105 z-10'
              : isOpenInMemory
              ? 'bg-slate-800/90 hover:bg-slate-755 text-indigo-300 border border-indigo-400/40 shadow-sm'
              : 'bg-slate-850 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700/80 shadow-xs'
          }`}
          title={`${mod.label} (${mod.category})`}
        >
          {/* Top highlight reflection */}
          <div className="absolute inset-x-1.5 top-0.5 h-px bg-white/20 rounded-full pointer-events-none" />

          <Icon className={`w-4 h-4 transition-transform group-hover:scale-110 drop-shadow-sm ${
            isActive ? 'text-white' : isOpenInMemory ? 'text-indigo-300' : catColors.text
          }`} />

          {isOpenInMemory && !isActive && (
            <span 
              className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-400 ring-1.5 ring-[#0D253D] animate-pulse shadow-xs" 
              title="Pestaña abierta en memoria"
            />
          )}
        </button>

        {hoveredModuleId === mod.id && (
          <div 
            className={`absolute z-50 pointer-events-none whitespace-nowrap bg-slate-900 border border-slate-700 text-white text-[11px] font-medium py-1 px-2.5 rounded-lg shadow-2xl flex items-center gap-2 animate-in fade-in-50 duration-100 ${
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
      className="fixed z-50 bg-[#0D253D] border border-slate-600 rounded-xl shadow-2xl p-1.5 text-xs text-slate-100 min-w-[170px] space-y-0.5 animate-in fade-in zoom-in-95 duration-100"
      style={{ bottom: '60px', left: position === 'left' ? '60px' : position === 'right' ? 'auto' : '50%', right: position === 'right' ? '60px' : 'auto', transform: position === 'bottom' ? 'translateX(-50%)' : 'none' }}
    >
      <div className="px-2 py-1 text-[10px] font-bold text-indigo-300 uppercase tracking-wider border-b border-slate-700/80">
        Ubicación del Dock
      </div>
      <button
        onClick={() => { onChangePosition('left'); setShowPositionMenu(false); }}
        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer ${position === 'left' ? 'text-indigo-300 font-bold bg-indigo-500/20' : ''}`}
      >
        <span className="flex items-center gap-2">⬅️ Lateral Izquierdo</span>
        {position === 'left' && <span className="text-[10px] text-indigo-300">Activo</span>}
      </button>
      <button
        onClick={() => { onChangePosition('right'); setShowPositionMenu(false); }}
        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer ${position === 'right' ? 'text-indigo-300 font-bold bg-indigo-500/20' : ''}`}
      >
        <span className="flex items-center gap-2">➡️ Lateral Derecho</span>
        {position === 'right' && <span className="text-[10px] text-indigo-300">Activo</span>}
      </button>
      <button
        onClick={() => { onChangePosition('bottom'); setShowPositionMenu(false); }}
        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer ${position === 'bottom' ? 'text-indigo-300 font-bold bg-indigo-500/20' : ''}`}
      >
        <span className="flex items-center gap-2">⬇️ Flotante al Pie</span>
        {position === 'bottom' && <span className="text-[10px] text-indigo-300">Activo</span>}
      </button>
      <button
        onClick={() => { onChangePosition('hidden'); setShowPositionMenu(false); }}
        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-800 text-rose-300 hover:text-rose-200 transition-colors cursor-pointer border-t border-slate-700/80 mt-1"
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
        className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 bg-[#0D253D]/95 hover:bg-[#0D253D] backdrop-blur-md border border-slate-600 px-2.5 py-1.5 rounded-2xl shadow-2xl transition-all ring-1 ring-white/10"
      >
        <button
          onClick={onOpenNewTabModal}
          className="w-9 h-9 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 hover:text-white border border-indigo-400/50 flex items-center justify-center transition-all cursor-pointer shadow-sm group"
          title="Abrir Catálogo de Herramientas y Módulos"
        >
          <LayoutGrid className="w-4 h-4 group-hover:scale-110 transition-transform" />
        </button>

        <div className="h-5 w-px bg-slate-700 mx-0.5" />

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar max-w-[75vw]">
          {dockModules.map(mod => renderDockButton(mod))}
        </div>

        <div className="h-5 w-px bg-slate-700 mx-0.5" />

        <div className="relative">
          <button
            onClick={() => setShowPositionMenu(!showPositionMenu)}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-600 flex items-center justify-center transition-colors cursor-pointer"
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
      className={`relative shrink-0 w-[48px] bg-[#0D253D] border-slate-700/80 text-slate-100 flex flex-col items-center justify-between py-2.5 z-30 select-none shadow-md ${
        position === 'left' ? 'border-r' : 'border-l order-last'
      }`}
    >
      <div className="w-full flex flex-col items-center gap-2">
        <button
          onClick={onOpenNewTabModal}
          className="w-9 h-9 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 hover:text-white border border-indigo-400/40 flex items-center justify-center transition-all cursor-pointer shadow-sm group"
          title="Abrir Catálogo de Módulos (+)"
        >
          <LayoutGrid className="w-4 h-4 group-hover:scale-110 transition-transform" />
        </button>
        <div className="w-6 h-px bg-slate-700/80" />
      </div>

      <div className="flex-1 w-full flex flex-col items-center gap-1.5 overflow-y-auto no-scrollbar py-1">
        {dockModules.map(mod => renderDockButton(mod))}
      </div>

      <div className="w-full flex flex-col items-center gap-1 pt-2 border-t border-slate-700/80">
        <button
          onClick={onOpenQuickAccessConfig}
          className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-750 text-indigo-300 hover:text-white border border-slate-600 flex items-center justify-center transition-colors cursor-pointer"
          title="Personalizar Barra"
        >
          <Pin className="w-4 h-4" />
        </button>
        <div className="relative">
          <button
            onClick={() => setShowPositionMenu(!showPositionMenu)}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-600 flex items-center justify-center transition-colors cursor-pointer"
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
