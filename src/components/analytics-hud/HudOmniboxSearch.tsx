import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, X, Layers, Users, Building2, Tag, ArrowRight, CornerDownLeft, Sparkles, Filter } from 'lucide-react';
import { ChartOfAccount, Auxiliary } from '../../types';
import { HudTheme } from './hudTheme';

interface HudOmniboxSearchProps {
  accounts: ChartOfAccount[];
  auxiliaries?: Auxiliary[];
  costCenters?: any[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSelectDimension: (dimType: 'account' | 'costCenter' | 'auxiliary', value: string) => void;
  theme?: HudTheme;
}

export default function HudOmniboxSearch({
  accounts,
  auxiliaries = [],
  costCenters = [],
  searchQuery,
  onSearchChange,
  onSelectDimension,
  theme = 'light'
}: HudOmniboxSearchProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDark = theme === 'dark';

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter real suggestions based on user query (soporta código, glosa, o cruzado con /)
  const suggestions = useMemo(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) return [];
    const q = searchQuery.toLowerCase().trim();

    // Si es búsqueda combinada tipo "3-01 / Logística" o "31 / Ventas"
    const isCombined = q.includes('/') || q.includes('+');
    const terms = isCombined ? q.split(/[\/\+]/).map(t => t.trim()).filter(Boolean) : [q];

    const results: {
      type: 'account' | 'costCenter' | 'auxiliary';
      id: string;
      title: string;
      subtitle: string;
      tag: string;
      value: string;
    }[] = [];

    // 1. Coincidencias de Plan de Cuentas (por código exacto ej. 3-01 o glosa parcial ej. "Sueldos")
    accounts.forEach(acc => {
      const accCodeClean = acc.code.toLowerCase().replace(/[^0-9]/g, '');
      const accCodeFormatted = acc.code.toLowerCase();
      const accName = acc.name.toLowerCase();

      const matches = terms.some(t => {
        const cleanT = t.replace(/[^0-9]/g, '');
        return (
          accCodeFormatted.includes(t) ||
          (cleanT && accCodeClean.startsWith(cleanT)) ||
          accName.includes(t)
        );
      });

      if (matches && results.length < 8) {
        results.push({
          type: 'account',
          id: `acc_${acc.id}`,
          title: `Cuenta ${acc.code} — ${acc.name}`,
          subtitle: `${acc.type || 'Cuenta Contable'} • ${acc.isImputable ? 'Imputable' : 'Título'}`,
          tag: 'CUENTA',
          value: acc.code
        });
      }
    });

    // 2. Coincidencias de Centros de Costo
    costCenters.forEach(cc => {
      const ccName = typeof cc === 'string' ? cc : cc.name || cc.code || '';
      const ccCode = typeof cc === 'object' && cc.code ? `${cc.code}: ` : '';
      const matches = terms.some(t => ccName.toLowerCase().includes(t));

      if (matches && results.length < 12) {
        results.push({
          type: 'costCenter',
          id: `cc_${ccName}`,
          title: `Centro de Costo: ${ccCode}${ccName}`,
          subtitle: 'Dimensión Analítica de Costo',
          tag: 'C.COSTO',
          value: ccName
        });
      }
    });

    // 3. Coincidencias de Auxiliares (RUT o Razón Social)
    auxiliaries.forEach(aux => {
      const auxRut = aux.rut.toLowerCase();
      const auxName = aux.name.toLowerCase();
      const matches = terms.some(t => auxRut.includes(t) || auxName.includes(t));

      if (matches && results.length < 16) {
        results.push({
          type: 'auxiliary',
          id: `aux_${aux.id}`,
          title: `Auxiliar: ${aux.name}`,
          subtitle: `RUT: ${aux.rut}`,
          tag: 'AUXILIAR',
          value: aux.rut
        });
      }
    });

    return results;
  }, [searchQuery, accounts, costCenters, auxiliaries]);

  return (
    <div ref={containerRef} className="relative flex-1 max-w-2xl">
      <div
        className={`relative flex items-center rounded-xl border transition-all ${
          isDark
            ? 'bg-slate-900/90 border-slate-700/80 focus-within:border-cyan-400 focus-within:ring-2 focus-within:ring-cyan-500/20'
            : 'bg-white border-slate-300 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 shadow-xs'
        }`}
      >
        <div className="pl-3.5 pr-2 flex items-center pointer-events-none">
          <Search
            className={`w-4 h-4 ${
              isDark ? 'text-cyan-400' : 'text-indigo-600'
            }`}
          />
        </div>

        <input
          type="text"
          value={searchQuery}
          onChange={(e) => {
            onSearchChange(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder='Búsqueda universal rápida: ej. "3-01", "Sueldos", o cruzada "3-01 / Logística", RUT proveedor...'
          className={`w-full py-2 pr-10 text-xs font-mono bg-transparent outline-hidden placeholder:text-slate-400 ${
            isDark ? 'text-slate-100' : 'text-slate-800'
          }`}
        />

        {searchQuery ? (
          <button
            type="button"
            onClick={() => {
              onSearchChange('');
              setIsOpen(false);
            }}
            className="absolute right-3 p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
            title="Limpiar búsqueda"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <div className="absolute right-3 flex items-center gap-1 pointer-events-none opacity-50">
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500">
              ⌘K
            </kbd>
          </div>
        )}
      </div>

      {/* Autocomplete Dropdown List */}
      {isOpen && suggestions.length > 0 && (
        <div
          className={`absolute top-full left-0 right-0 mt-1.5 rounded-xl border shadow-2xl overflow-hidden z-50 backdrop-blur-md font-mono text-xs max-h-80 overflow-y-auto ${
            isDark
              ? 'bg-slate-900/95 border-slate-700 text-slate-200'
              : 'bg-white/95 border-slate-200 text-slate-800'
          }`}
        >
          <div
            className={`px-3 py-1.5 text-[10px] uppercase font-bold tracking-wider flex items-center justify-between border-b ${
              isDark ? 'border-slate-800 text-slate-400 bg-slate-950/40' : 'border-slate-100 text-slate-500 bg-slate-50'
            }`}
          >
            <span>Resultados encontrados ({suggestions.length})</span>
            <span className="text-[9px] lowercase font-normal">clic para aplicar como filtro activo</span>
          </div>

          <div className="p-1">
            {suggestions.map((item) => (
              <div
                key={item.id}
                onClick={() => {
                  onSelectDimension(item.type, item.value);
                  setIsOpen(false);
                }}
                className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                  isDark
                    ? 'hover:bg-slate-800/90 hover:text-cyan-300'
                    : 'hover:bg-indigo-50 hover:text-indigo-900'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <div
                    className={`p-1.5 rounded-md ${
                      item.type === 'account'
                        ? isDark
                          ? 'bg-cyan-500/10 text-cyan-400'
                          : 'bg-indigo-100 text-indigo-700'
                        : item.type === 'costCenter'
                        ? isDark
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-emerald-100 text-emerald-700'
                        : isDark
                        ? 'bg-amber-500/10 text-amber-400'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {item.type === 'account' ? (
                      <Layers className="w-3.5 h-3.5" />
                    ) : item.type === 'costCenter' ? (
                      <Building2 className="w-3.5 h-3.5" />
                    ) : (
                      <Users className="w-3.5 h-3.5" />
                    )}
                  </div>

                  <div className="truncate">
                    <div className="font-semibold truncate">{item.title}</div>
                    <div
                      className={`text-[10px] font-sans truncate ${
                        isDark ? 'text-slate-400' : 'text-slate-500'
                      }`}
                    >
                      {item.subtitle}
                    </div>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2 pl-2">
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                      item.type === 'account'
                        ? isDark
                          ? 'border-cyan-500/30 text-cyan-400 bg-cyan-950/40'
                          : 'border-indigo-200 text-indigo-700 bg-indigo-50'
                        : item.type === 'costCenter'
                        ? isDark
                          ? 'border-emerald-500/30 text-emerald-400 bg-emerald-950/40'
                          : 'border-emerald-200 text-emerald-700 bg-emerald-50'
                        : isDark
                        ? 'border-amber-500/30 text-amber-400 bg-amber-950/40'
                        : 'border-amber-200 text-amber-700 bg-amber-50'
                    }`}
                  >
                    {item.tag}
                  </span>
                  <CornerDownLeft className="w-3 h-3 text-slate-400" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
