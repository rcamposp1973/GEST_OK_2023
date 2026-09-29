import React, { useState, useMemo, useEffect } from 'react';
import { Reorder } from 'motion/react';
import { 
  X, Search, Sparkles, ArrowRight
} from 'lucide-react';
import { COCKPIT_MODULE_CATALOG, CockpitModuleItem, CATEGORY_COLORS, ModuleCategory } from './cockpitTypes';
import { useUserPreferences } from '../../hooks/useUserPreferences';

interface NewTabModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectModule: (moduleId: string) => void;
  activeModuleIds: string[];
}

export const NewTabModal: React.FC<NewTabModalProps> = ({
  isOpen,
  onClose,
  onSelectModule,
  activeModuleIds
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const { moduleOrder, updateModuleOrder } = useUserPreferences();

  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setSelectedCategory('ALL');
    }
  }, [isOpen]);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const categories = useMemo(() => {
    const cats: ModuleCategory[] = ['FINANZAS', 'TESORERIA', 'OPERACIONES', 'CARGA (SII)', 'IMPUESTOS', 'PERSONAL', 'INDICADORES', 'CONFIGURACIONES'];
    return cats;
  }, []);

  const filteredModules = useMemo(() => {
    let list = COCKPIT_MODULE_CATALOG.filter(mod => {
      const matchCat = selectedCategory === 'ALL' || mod.category === selectedCategory;
      if (!matchCat) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        mod.label.toLowerCase().includes(q) ||
        mod.shortLabel.toLowerCase().includes(q) ||
        mod.description.toLowerCase().includes(q) ||
        mod.category.toLowerCase().includes(q)
      );
    });

    if (selectedCategory !== 'ALL' && moduleOrder[selectedCategory]) {
      const order = moduleOrder[selectedCategory];
      list = [...list].sort((a, b) => {
        const idxA = order.indexOf(a.id);
        const idxB = order.indexOf(b.id);
        if (idxA === -1 && idxB === -1) return 0;
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
      });
    }
    return list;
  }, [searchQuery, selectedCategory, moduleOrder]);

  const handleReorder = (newOrder: CockpitModuleItem[]) => {
    if (selectedCategory !== 'ALL') {
      updateModuleOrder(selectedCategory, newOrder.map(m => m.id));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-150">
      <div 
        className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden text-slate-100"
        onClick={e => e.stopPropagation()}
      >
        {/* Cabecera del Modal */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/30 border border-indigo-500/50 flex items-center justify-center text-indigo-400 shadow-inner">
              <Sparkles className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
                <span>Catálogo de Herramientas y Módulos</span>
                <span className="text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full uppercase">
                  Cabina Gest_OK
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Selecciona una herramienta para abrirla en una nueva pestaña. Arrastra para reordenar en tu categoría.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            title="Cerrar (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Barra de Búsqueda y Filtros de Categoría */}
        <div className="p-4 border-b border-slate-800/80 bg-slate-900/50 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar por módulo, función o descripción (ej: Mayor, Conciliación, F29, Balance)..."
              className="w-full bg-slate-800/90 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            />
          </div>

          {/* Pastillas de Categorías */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
            <button
              onClick={() => setSelectedCategory('ALL')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                selectedCategory === 'ALL'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-750 border border-slate-750'
              }`}
            >
              Todos ({COCKPIT_MODULE_CATALOG.length})
            </button>
            {categories.map(cat => {
              const count = COCKPIT_MODULE_CATALOG.filter(m => m.category === cat).length;
              const isSelected = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-750 border border-slate-750'
                  }`}
                >
                  <span>{cat}</span>
                  <span className={`text-[10px] font-mono px-1 rounded ${isSelected ? 'bg-white/20' : 'bg-slate-700/60'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Grilla de Módulos (Reorderable) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <Reorder.Group
            axis="y"
            values={filteredModules}
            onReorder={handleReorder}
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5"
          >
            {filteredModules.map(mod => {
              const Icon = mod.icon;
              const isAlreadyActive = activeModuleIds.includes(mod.id);
              const catColors = CATEGORY_COLORS[mod.category] || CATEGORY_COLORS.FINANZAS;

              return (
                <Reorder.Item
                  key={mod.id}
                  value={mod}
                  className="group relative rounded-xl border transition-all cursor-grab active:cursor-grabbing bg-gradient-to-b from-slate-850 to-slate-900 hover:from-slate-800 hover:to-slate-850"
                >
                  <div
                    onClick={() => {
                      onSelectModule(mod.id);
                      onClose();
                    }}
                    className={`p-3.5 h-full flex flex-col justify-between ${
                      isAlreadyActive
                        ? 'border-indigo-500/50 shadow-md shadow-indigo-500/10 ring-1 ring-indigo-500/30'
                        : 'border-slate-800 hover:border-slate-700 hover:shadow-lg'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center border shadow-inner ${catColors.bg} ${catColors.border} ${catColors.text}`}>
                            <Icon className="w-5 h-5 drop-shadow-sm" />
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-white group-hover:text-indigo-300 transition-colors line-clamp-1">
                              {mod.label}
                            </h4>
                            <span className={`text-[9px] font-mono font-bold tracking-wider uppercase px-1.5 py-0.5 rounded ${catColors.bg} ${catColors.text}`}>
                              {mod.category}
                            </span>
                          </div>
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                        {mod.description}
                      </p>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
                      <span className="text-indigo-400 group-hover:translate-x-0.5 transition-transform flex items-center gap-1 font-bold">
                        <span>{isAlreadyActive ? 'Ir a Pestaña' : 'Abrir Pestaña'}</span>
                        <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                </Reorder.Item>
              );
            })}
          </Reorder.Group>
          {filteredModules.length === 0 && (
            <div className="col-span-full py-12 text-center text-slate-500 text-xs space-y-2">
              <p className="font-medium text-slate-400">No se encontraron herramientas.</p>
            </div>
          )}
        </div>

        {/* Pie del modal con atajo */}
        <div className="px-6 py-2.5 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-2">
            <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded font-mono text-[10px] text-slate-300">
              Esc
            </kbd>
            <span>para cerrar</span>
          </div>
          <span className="text-slate-500 font-mono text-[10px]">
            {filteredModules.length} módulos disponibles
          </span>
        </div>
      </div>
    </div>
  );
};
