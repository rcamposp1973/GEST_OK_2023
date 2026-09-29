import React, { useState, useMemo } from 'react';
import { db } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { ChartOfAccount, Company } from '../types';
import { isDefaultBankAccount, isFondoFijoOrCaja } from '../utils/paymentAccountUtils';

interface PaymentAccountsConfigModalProps {
  studyId: string;
  company: Company;
  accounts: ChartOfAccount[];
  isOpen: boolean;
  onClose: () => void;
  onAccountsUpdated?: (updatedCustomIds: string[]) => void;
}

export default function PaymentAccountsConfigModal({
  studyId,
  company,
  accounts,
  isOpen,
  onClose,
  onAccountsUpdated
}: PaymentAccountsConfigModalProps) {
  const [selectedCustomIds, setSelectedCustomIds] = useState<string[]>(
    company.customPaymentAccountIds || []
  );
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('TODAS');
  const [saving, setSaving] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  // Active imputable accounts from chart
  const imputableAccounts = useMemo(() => {
    return accounts.filter(acc => acc.estado !== 'Inactivo' && acc.isImputable !== false);
  }, [accounts]);

  // Filtered accounts for display
  const filteredAccounts = useMemo(() => {
    return imputableAccounts.filter(acc => {
      const matchesSearch =
        searchFilter.trim() === '' ||
        acc.code.toLowerCase().includes(searchFilter.toLowerCase()) ||
        acc.name.toLowerCase().includes(searchFilter.toLowerCase());

      const matchesType = typeFilter === 'TODAS' || acc.type === typeFilter;

      return matchesSearch && matchesType;
    });
  }, [imputableAccounts, searchFilter, typeFilter]);

  // Detected Fondos Fijos & Cajas for quick activation
  const fondoFijoAccounts = useMemo(() => {
    return imputableAccounts.filter(acc => isFondoFijoOrCaja(acc) && !isDefaultBankAccount(acc));
  }, [imputableAccounts]);

  const toggleAccount = (accountId: string) => {
    setSelectedCustomIds(prev => {
      if (prev.includes(accountId)) {
        return prev.filter(id => id !== accountId);
      } else {
        return [...prev, accountId];
      }
    });
  };

  const handleEnableAllFondosFijos = () => {
    const fondoIds = fondoFijoAccounts.map(a => a.id);
    setSelectedCustomIds(prev => {
      const set = new Set([...prev, ...fondoIds]);
      return Array.from(set);
    });
  };

  const handleClearCustom = () => {
    setSelectedCustomIds([]);
  };

  const handleSave = async () => {
    setSaving(true);
    setSavedSuccess(false);
    try {
      const companyRef = doc(db, 'studies', studyId, 'companies', company.id);
      await updateDoc(companyRef, {
        customPaymentAccountIds: selectedCustomIds,
        updatedAt: new Date().toISOString()
      });

      // Update in-memory company object if available
      company.customPaymentAccountIds = selectedCustomIds;

      setSavedSuccess(true);
      if (onAccountsUpdated) {
        onAccountsUpdated(selectedCustomIds);
      }

      setTimeout(() => {
        setSavedSuccess(false);
        onClose();
      }, 900);
    } catch (err: any) {
      console.error('Error updating custom payment accounts:', err);
      alert('Error al guardar configuración de cuentas: ' + (err.message || 'Intente nuevamente'));
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex justify-between items-center border-b border-indigo-900/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-xl shadow-inner">
              ⚙️
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                Habilitar Cuentas de Pago, Rendiciones y Recaudación
              </h3>
              <p className="text-xs text-indigo-200">
                Empresa: <strong className="text-white">{company.name || company.razonSocial}</strong> ({company.rut})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Informative Banner */}
        <div className="bg-amber-50 border-b border-amber-200 p-4 text-xs text-amber-900">
          <div className="flex items-start gap-2.5">
            <span className="text-lg">💡</span>
            <div className="space-y-1">
              <p className="font-semibold text-amber-950">
                Flexibilidad de Medios de Pago y Cancelación:
              </p>
              <p className="leading-relaxed">
                Todas las cuentas bancarias o con <strong>análisis de conciliación bancaria</strong> están siempre activas por defecto.
                Para pagos de facturas ingresadas por <strong>Rendiciones de Gastos</strong>, <strong>Fondos Fijos</strong>, <strong>Cajas Chicas</strong>, <strong>Tarjetas de Crédito</strong> o <strong>Préstamos de Socios</strong>, puedes marcar las cuentas adicionales aquí para que estén disponibles en el selector de nóminas y cobranzas.
              </p>
            </div>
          </div>
        </div>

        {/* Quick Actions & Filters Bar */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleEnableAllFondosFijos}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Habilitar automáticamente cuentas de Fondos Fijos, Cajas Chicas y Rendiciones detectadas"
            >
              <span>⚡</span> Habilitar Fondos Fijos & Cajas ({fondoFijoAccounts.length})
            </button>
            {selectedCustomIds.length > 0 && (
              <button
                onClick={handleClearCustom}
                className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-medium transition-colors cursor-pointer"
              >
                Desmarcar cuentas agregadas ({selectedCustomIds.length})
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-1 min-w-[280px] justify-end">
            <input
              type="text"
              placeholder="Buscar por código o nombre de cuenta..."
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none w-full max-w-xs"
            />
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="TODAS">Todos los Tipos</option>
              <option value="Activo">Activo</option>
              <option value="Pasivo">Pasivo</option>
              <option value="Patrimonio">Patrimonio</option>
              <option value="Gasto">Gasto</option>
              <option value="Ingreso">Ingreso</option>
            </select>
          </div>
        </div>

        {/* Accounts Table */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 sticky top-0 z-10">
                <th className="p-2.5 text-center w-12">Habilitar</th>
                <th className="p-2.5 w-28">Código</th>
                <th className="p-2.5">Nombre de Cuenta</th>
                <th className="p-2.5 w-24">Tipo</th>
                <th className="p-2.5 w-44">Estado / Rol en Pagos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAccounts.map(acc => {
                const isDefaultBank = isDefaultBankAccount(acc);
                const isFondo = isFondoFijoOrCaja(acc);
                const isCustomSelected = selectedCustomIds.includes(acc.id);
                const isEnabled = isDefaultBank || isCustomSelected;

                return (
                  <tr
                    key={acc.id}
                    onClick={() => {
                      if (!isDefaultBank) toggleAccount(acc.id);
                    }}
                    className={`transition-colors cursor-pointer ${
                      isDefaultBank
                        ? 'bg-blue-50/60 hover:bg-blue-50 cursor-default'
                        : isCustomSelected
                        ? 'bg-emerald-50/70 hover:bg-emerald-100/70'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="p-2.5 text-center" onClick={e => e.stopPropagation()}>
                      {isDefaultBank ? (
                        <input
                          type="checkbox"
                          checked={true}
                          disabled={true}
                          className="h-4 w-4 rounded text-blue-600 border-slate-300 focus:ring-0 opacity-70 cursor-not-allowed"
                          title="Cuenta bancaria predeterminada (siempre habilitada)"
                        />
                      ) : (
                        <input
                          type="checkbox"
                          checked={isCustomSelected}
                          onChange={() => toggleAccount(acc.id)}
                          className="h-4 w-4 rounded text-emerald-600 border-slate-300 focus:ring-emerald-500 cursor-pointer"
                        />
                      )}
                    </td>
                    <td className="p-2.5 font-mono font-bold text-slate-800">{acc.code}</td>
                    <td className="p-2.5">
                      <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                        {acc.name}
                        {isFondo && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            💼 Fondo / Caja
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-2.5 text-slate-600 font-medium">{acc.type}</td>
                    <td className="p-2.5">
                      {isDefaultBank ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                          🏦 Banco / Predeterminada
                        </span>
                      ) : isCustomSelected ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          ✅ Habilitada Manualmente
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px] italic">No seleccionada</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredAccounts.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400">
                    No se encontraron cuentas contables que coincidan con los filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-600">
            <strong>{selectedCustomIds.length}</strong> cuentas adicionales habilitadas para pagos y rendiciones.
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              {saving ? 'Guardando...' : savedSuccess ? '✅ Guardado' : '💾 Guardar Cuentas Habilitadas'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
