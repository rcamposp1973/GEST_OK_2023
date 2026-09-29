import React, { useState, useEffect } from 'react';
import { 
  Keyboard, Search, X, Zap, Navigation, Laptop, 
  FileText, BookOpen, Calculator, ShieldCheck, 
  Landmark, Receipt, Users, TrendingUp, Sparkles, Check
} from 'lucide-react';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAction?: (actionKey: string) => void;
}

interface ShortcutItem {
  keys: string[];
  description: string;
  category: 'ACCIONES' | 'NAVEGACION' | 'PESTAÑAS' | 'SISTEMA';
  actionKey?: string;
  badge?: string;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  isOpen,
  onClose,
  onSelectAction
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('TODAS');

  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const cmdKey = isMac ? '⌘' : 'Ctrl';

  const shortcuts: ShortcutItem[] = [
    // ACCIONES RÁPIDAS
    {
      keys: [cmdKey, 'K'],
      description: 'Abrir Búsqueda Global & Paleta de Comandos (Omnisearch)',
      category: 'ACCIONES',
      actionKey: 'OPEN_COMMAND_PALETTE',
      badge: 'Principal'
    },
    {
      keys: ['F2'],
      description: 'Guardar / Grabar Comprobante Contable o Formulario Activo',
      category: 'ACCIONES',
      actionKey: 'SAVE_ACTIVE_FORM',
      badge: 'Rápido'
    },
    {
      keys: [cmdKey, 'S'],
      description: 'Guardar cambios del formulario actual (Alternativa a F2)',
      category: 'ACCIONES',
      actionKey: 'SAVE_ACTIVE_FORM'
    },
    {
      keys: ['Alt', 'N'],
      description: 'Crear Nuevo Comprobante / Asiento Contable',
      category: 'ACCIONES',
      actionKey: 'NEW_VOUCHER',
      badge: 'Nuevo'
    },
    {
      keys: ['Alt', 'C'],
      description: 'Abrir / Ocultar Calculadora Táctica Contable',
      category: 'ACCIONES',
      actionKey: 'TOGGLE_CALCULATOR'
    },
    {
      keys: ['F1'],
      description: 'Ver Guía de Atajos de Teclado (Esta ventana)',
      category: 'ACCIONES',
      badge: 'Ayuda'
    },
    {
      keys: ['Shift', '?'],
      description: 'Abrir Guía Rápida de Atajos de Teclado',
      category: 'ACCIONES',
      badge: 'Ayuda'
    },

    // NAVEGACIÓN DIRECTA DE MÓDULOS (ALT + NÚMERO)
    {
      keys: ['Alt', '1'],
      description: 'Ir a Vouchers / Asientos de Diario',
      category: 'NAVEGACION',
      actionKey: 'NAV_VOUCHERS'
    },
    {
      keys: ['Alt', '2'],
      description: 'Ir a Libro Diario Oficial',
      category: 'NAVEGACION',
      actionKey: 'NAV_LIBRO_DIARIO'
    },
    {
      keys: ['Alt', '3'],
      description: 'Ir a Libro Mayor Contable',
      category: 'NAVEGACION',
      actionKey: 'NAV_LIBRO_MAYOR'
    },
    {
      keys: ['Alt', '4'],
      description: 'Ir a Balance Tributario de 8 Columnas',
      category: 'NAVEGACION',
      actionKey: 'NAV_BALANCE_8'
    },
    {
      keys: ['Alt', '5'],
      description: 'Ir a Auxiliar de Cuentas Corrientes (Clientes/Proveedores)',
      category: 'NAVEGACION',
      actionKey: 'NAV_AUXILIARES'
    },
    {
      keys: ['Alt', '6'],
      description: 'Ir a Conciliación Bancaria Inteligente',
      category: 'NAVEGACION',
      actionKey: 'NAV_CONCILIACION'
    },
    {
      keys: ['Alt', '7'],
      description: 'Ir a RCV Compras y Ventas SII',
      category: 'NAVEGACION',
      actionKey: 'NAV_RCV'
    },
    {
      keys: ['Alt', '8'],
      description: 'Ir a Formulario 29 (IVA F29)',
      category: 'NAVEGACION',
      actionKey: 'NAV_F29'
    },
    {
      keys: ['Alt', '9'],
      description: 'Ir a Liquidaciones de Sueldo y Remuneraciones',
      category: 'NAVEGACION',
      actionKey: 'NAV_LIQUIDACIONES'
    },
    {
      keys: ['Alt', '0'],
      description: 'Ir a Estado de Resultados IFRS',
      category: 'NAVEGACION',
      actionKey: 'NAV_ESTADO_RESULTADOS'
    },

    // GESTIÓN DE PESTAÑAS (COCKPIT)
    {
      keys: [cmdKey, 'Tab'],
      description: 'Cambiar a la siguiente pestaña abierta del Cockpit',
      category: 'PESTAÑAS',
      actionKey: 'NEXT_TAB'
    },
    {
      keys: [cmdKey, 'Shift', 'Tab'],
      description: 'Cambiar a la pestaña anterior del Cockpit',
      category: 'PESTAÑAS',
      actionKey: 'PREV_TAB'
    },
    {
      keys: ['Alt', '→'],
      description: 'Avanzar a la pestaña siguiente (Alternativa rápida)',
      category: 'PESTAÑAS',
      actionKey: 'NEXT_TAB'
    },
    {
      keys: ['Alt', '←'],
      description: 'Retroceder a la pestaña anterior (Alternativa rápida)',
      category: 'PESTAÑAS',
      actionKey: 'PREV_TAB'
    },
    {
      keys: ['Alt', 'T'],
      description: 'Abrir selector de nueva pestaña de trabajo',
      category: 'PESTAÑAS',
      actionKey: 'NEW_TAB'
    },
    {
      keys: [cmdKey, 'W'],
      description: 'Cerrar la pestaña activa actual',
      category: 'PESTAÑAS',
      actionKey: 'CLOSE_TAB'
    },

    // ENTORNO Y SISTEMA
    {
      keys: ['F11'],
      description: 'Alternar Modo Zen / Pantalla Completa (Maximizar espacio)',
      category: 'SISTEMA',
      actionKey: 'TOGGLE_ZEN_MODE'
    },
    {
      keys: [cmdKey, 'B'],
      description: 'Alternar Modo Zen / Ocultar barras de navegación',
      category: 'SISTEMA',
      actionKey: 'TOGGLE_ZEN_MODE'
    },
    {
      keys: [cmdKey, 'D'],
      description: 'Alternar Posición del Dock (Izquierda, Abajo u Oculto)',
      category: 'SISTEMA',
      actionKey: 'TOGGLE_DOCK'
    },
    {
      keys: ['Esc'],
      description: 'Cerrar modal, ventana emergente o cancelar formulario activo',
      category: 'SISTEMA'
    }
  ];

  const filteredShortcuts = shortcuts.filter(s => {
    const matchesCategory = selectedCategory === 'TODAS' || s.category === selectedCategory;
    const q = searchTerm.toLowerCase().trim();
    const matchesSearch =
      q === '' ||
      s.description.toLowerCase().includes(q) ||
      s.keys.some(k => k.toLowerCase().includes(q)) ||
      s.category.toLowerCase().includes(q);

    return matchesCategory && matchesSearch;
  });

  const categories = [
    { id: 'TODAS', label: 'Todos los Atajos' },
    { id: 'ACCIONES', label: '⚡ Acciones Rápidas' },
    { id: 'NAVEGACION', label: '🚀 Módulos (Alt+1..0)' },
    { id: 'PESTAÑAS', label: '📑 Pestañas Cockpit' },
    { id: 'SISTEMA', label: '⚙️ Sistema & Vistas' }
  ];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex justify-between items-center border-b border-indigo-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-xl shadow-inner">
              ⌨️
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Atajos de Teclado Globales (Hotkeys)
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono border border-emerald-400/30">
                  Power User
                </span>
              </h3>
              <p className="text-xs text-indigo-200">
                Navega y opera a máxima velocidad sin depender exclusivamente del mouse.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Category Filter Bar */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  selectedCategory === cat.id
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar atajo o tecla..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Shortcuts Grid / List */}
        <div className="flex-1 overflow-y-auto p-4 divide-y divide-slate-100">
          {filteredShortcuts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {filteredShortcuts.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    if (item.actionKey && onSelectAction) {
                      onSelectAction(item.actionKey);
                      onClose();
                    }
                  }}
                  className={`p-3 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-indigo-50/60 hover:border-indigo-200 transition-all flex items-center justify-between gap-3 ${
                    item.actionKey ? 'cursor-pointer' : ''
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                      {item.description}
                      {item.badge && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-700 border border-indigo-200">
                          {item.badge}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {item.keys.map((k, kIdx) => (
                      <kbd
                        key={kIdx}
                        className="px-2 py-1 text-xs font-mono font-black text-slate-800 bg-white rounded-md border border-slate-300 shadow-xs"
                      >
                        {k}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-slate-500">
              No se encontraron atajos de teclado para "{searchTerm}".
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
          <span>💡 Presiona <kbd className="font-mono font-bold bg-white px-1.5 py-0.5 rounded border border-slate-300">F1</kbd> o <kbd className="font-mono font-bold bg-white px-1.5 py-0.5 rounded border border-slate-300">Shift + ?</kbd> en cualquier momento para ver esta guía.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-bold text-xs transition-colors"
          >
            Entendido
          </button>
        </div>

      </div>
    </div>
  );
};
