import React, { useState, useRef, useEffect } from 'react';
import { useSystemFormat } from '../context/SystemFormatContext';
import { SYSTEM_FORMATS, SystemFormatInfo } from '../constants/systemFormats';
import { SystemAppFormat, UserRole } from '../types';
import { Sparkles, ChevronDown, Check, Layers, Building2, Zap, Shield, HelpCircle, X } from 'lucide-react';

interface FormatSwitcherDropdownProps {
  currentUserRole?: UserRole | string | null;
  currentUserEmail?: string | null;
}

export default function FormatSwitcherDropdown({
  currentUserRole,
  currentUserEmail
}: FormatSwitcherDropdownProps) {
  const { currentFormat, formatInfo, setFormat, resetToAssigned, assignedFormat } = useSystemFormat();
  const [isOpen, setIsOpen] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isSuperUser = currentUserRole === UserRole.SUPER_USER || currentUserRole === 'SUPER_USER' || currentUserEmail === 'rcampos@pulsocontable.cl';

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getFormatBadgeClasses = (fmt: SystemAppFormat) => {
    switch (fmt) {
      case 'VERSION_A':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100';
      case 'VERSION_B':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100';
      case 'VERSION_C1':
        return 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white border-violet-400 shadow-xs shadow-violet-500/20';
      case 'VERSION_C2':
        return 'bg-gradient-to-r from-cyan-600 to-teal-600 text-white border-cyan-400 shadow-xs shadow-cyan-500/20';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Botón / Badge de la versión activa */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            if (isSuperUser) {
              setIsOpen(!isOpen);
            } else {
              setShowInfoModal(true);
            }
          }}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${getFormatBadgeClasses(currentFormat)}`}
          title={isSuperUser ? "Cambiar formato del sistema (Simulación / Soporte)" : "Ver detalles de tu versión contratada"}
        >
          {formatInfo.isAgentic ? (
            <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-spin" />
          ) : (
            <Layers className="w-3.5 h-3.5" />
          )}
          <span className="tracking-tight">{formatInfo.badgeTitle}</span>
          {isSuperUser && <ChevronDown className="w-3 h-3 opacity-70 ml-0.5" />}
        </button>
      </div>

      {/* DROPDOWN SELECTOR (SUPER ADMIN / SOPORTE) */}
      {isOpen && isSuperUser && (
        <div className="absolute right-0 mt-2 w-84 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 p-2.5 space-y-1.5 animate-in fade-in zoom-in-95 duration-100">
          <div className="px-2.5 py-1.5 border-b border-slate-100 flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-800 flex items-center gap-1">
              <Shield className="w-3.5 h-3.5 text-indigo-600" />
              <span>Conmutador de Formatos (Admin)</span>
            </span>
            <span className="text-[9px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
              Soporte & Demos
            </span>
          </div>

          <div className="space-y-1 pt-1">
            {(Object.keys(SYSTEM_FORMATS) as SystemAppFormat[]).map((fmtKey) => {
              const info = SYSTEM_FORMATS[fmtKey];
              const isSelected = currentFormat === fmtKey;
              return (
                <button
                  key={fmtKey}
                  type="button"
                  onClick={() => {
                    setFormat(fmtKey);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left p-2 rounded-xl transition-all flex items-start justify-between gap-2 cursor-pointer ${
                    isSelected 
                      ? 'bg-slate-900 text-white shadow-xs' 
                      : 'hover:bg-slate-100 text-slate-800'
                  }`}
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded font-mono ${
                        isSelected 
                          ? 'bg-white/20 text-white' 
                          : info.isAgentic 
                          ? 'bg-violet-100 text-violet-800' 
                          : 'bg-slate-100 text-slate-700'
                      }`}>
                        {info.letter}
                      </span>
                      <span className="text-xs font-bold">{info.title}</span>
                    </div>
                    <p className={`text-[10px] line-clamp-1 ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                      {info.subtitle}
                    </p>
                  </div>

                  {isSelected && (
                    <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] px-1">
            <button
              type="button"
              onClick={() => {
                resetToAssigned();
                setIsOpen(false);
              }}
              className="text-slate-500 hover:text-slate-800 font-medium cursor-pointer"
            >
              Restablecer asignado ({assignedFormat})
            </button>
            <button
              type="button"
              onClick={() => {
                setShowInfoModal(true);
                setIsOpen(false);
              }}
              className="text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer"
            >
              <HelpCircle className="w-3 h-3" />
              <span>Ver Matriz</span>
            </button>
          </div>
        </div>
      )}

      {/* MODAL INFORMATIVO DE LOS 4 FORMATOS */}
      {showInfoModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="space-y-0.5">
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-indigo-600" />
                  <span>Formatos Oficiales de la Plataforma Gest_OK</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Una plataforma unificada con 4 experiencias especializadas por segmento y avance tecnológico.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowInfoModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(Object.keys(SYSTEM_FORMATS) as SystemAppFormat[]).map((fmtKey) => {
                const info = SYSTEM_FORMATS[fmtKey];
                const isCurrent = currentFormat === fmtKey;
                return (
                  <div
                    key={fmtKey}
                    className={`p-4 rounded-2xl border transition-all space-y-2.5 ${
                      isCurrent 
                        ? 'border-indigo-600 bg-indigo-50/40 ring-2 ring-indigo-500/20' 
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase font-mono ${
                        info.isAgentic 
                          ? 'bg-violet-100 text-violet-800 border border-violet-200' 
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}>
                        Versión {info.letter}
                      </span>
                      {isCurrent && (
                        <span className="text-[10px] font-bold bg-indigo-600 text-white px-2 py-0.5 rounded-full">
                          En Uso Activo
                        </span>
                      )}
                    </div>

                    <div>
                      <h4 className="text-xs font-black text-slate-900">{info.title}</h4>
                      <p className="text-[11px] text-slate-500 font-medium">{info.subtitle}</p>
                    </div>

                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      {info.description}
                    </p>

                    <div className="pt-1 space-y-1">
                      <span className="text-[10px] font-bold text-slate-700 block">Capacidades Destacadas:</span>
                      <ul className="text-[10px] text-slate-600 space-y-0.5 list-disc pl-3">
                        {info.keyFeatures.slice(0, 3).map((feat, idx) => (
                          <li key={idx}>{feat}</li>
                        ))}
                      </ul>
                    </div>

                    {isSuperUser && !isCurrent && (
                      <button
                        type="button"
                        onClick={() => {
                          setFormat(fmtKey);
                          setShowInfoModal(false);
                        }}
                        className="w-full mt-2 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                      >
                        Activar y Simular Versión {info.letter}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
