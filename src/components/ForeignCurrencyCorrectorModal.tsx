import React, { useState, useMemo } from 'react';
import { db } from '../lib/firebase';
import { doc, collection, writeBatch } from 'firebase/firestore';
import { 
  Voucher, 
  VoucherLine, 
  ChartOfAccount, 
  Company 
} from '../types';
import { getOfficialDolar, getOfficialUF } from '../utils/chileanEconomicIndicators';
import { 
  X, 
  DollarSign, 
  AlertTriangle, 
  CheckCircle2, 
  TrendingUp, 
  ArrowRight, 
  RefreshCw, 
  ShieldCheck, 
  Layers, 
  Check, 
  Search, 
  Filter,
  Sparkles,
  Info,
  Scale,
  AlertCircle
} from 'lucide-react';

const formatCLP = (val: number) => {
  return `$${Math.round(val || 0).toLocaleString('es-CL')}`;
};

export interface CurrencyCorrectionItem {
  id: string; // voucherId_lineIdx
  voucherId: string;
  voucherNumber: number;
  date: string;
  period: string;
  gloss: string;
  lineIdx: number;
  accountCode: string;
  accountName: string;
  accountMoneda: string; // 'USD', 'UF', 'EUR'
  currentDebit: number;
  currentCredit: number;
  currentRawAmount: number; // The amount currently in the line (e.g. 4000)
  detectedCurrency: 'USD' | 'UF' | 'EUR';
  originalForeignAmount: number; // e.g. 4000
  exchangeRate: number; // e.g. 931.57
  convertedCLPAmount: number; // e.g. 3726280
  selected: boolean;
  status: 'PENDING' | 'SUCCESS' | 'ERROR';
}

interface ForeignCurrencyCorrectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  studyId: string;
  companyId: string;
  companyName: string;
  companyRut: string;
  vouchers: Voucher[];
  accounts: ChartOfAccount[];
  onSuccess: () => Promise<void>;
}

export default function ForeignCurrencyCorrectorModal({
  isOpen,
  onClose,
  studyId,
  companyId,
  companyName,
  companyRut,
  vouchers,
  accounts,
  onSuccess
}: ForeignCurrencyCorrectorModalProps) {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [currencyFilter, setCurrencyFilter] = useState<'ALL' | 'USD' | 'UF'>('ALL');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [isCompleted, setIsCompleted] = useState<boolean>(false);

  // Build Account Map
  const accountMap = useMemo(() => {
    const map = new Map<string, ChartOfAccount>();
    accounts.forEach(a => {
      if (a.id) map.set(a.id, a);
      if (a.code) map.set(a.code.trim(), a);
    });
    return map;
  }, [accounts]);

  // Scan vouchers for foreign currency accounts that were loaded as pesos
  const initialItems = useMemo(() => {
    const list: CurrencyCorrectionItem[] = [];

    // Find all accounts marked as USD, UF or foreign currency
    const foreignAccounts = accounts.filter(a => 
      a.moneda === 'USD' || 
      a.moneda === 'Dolar' || 
      a.moneda === 'DOLAR' || 
      a.moneda === 'UF' || 
      a.moneda === 'EUR' ||
      a.requiereCMonetaria ||
      a.requiereDifCambio
    );
    const foreignAccCodes = new Set(foreignAccounts.map(a => a.code.trim()));
    const foreignAccIds = new Set(foreignAccounts.map(a => a.id));

    vouchers.forEach(v => {
      if (!v.lines || v.lines.length === 0) return;
      
      // Check if voucher contains foreign currency accounts
      const hasForeignAcc = v.lines.some(l => 
        foreignAccCodes.has(l.accountCode?.trim()) || foreignAccIds.has(l.accountId)
      );

      if (!hasForeignAcc) return;

      // Check date and official exchange rate
      const vDate = v.date || '2026-01-01';
      const officialUsdRate = getOfficialDolar(vDate, 931.57);
      const officialUfRate = getOfficialUF(vDate);

      // Analyze every line in this voucher
      v.lines.forEach((l, idx) => {
        const acc = accountMap.get(l.accountId) || accountMap.get(l.accountCode?.trim());
        const isForeign = acc && (
          acc.moneda === 'USD' || 
          acc.moneda === 'Dolar' || 
          acc.moneda === 'DOLAR' || 
          acc.moneda === 'UF' || 
          acc.moneda === 'EUR' ||
          acc.requiereDifCambio
        );

        if (!isForeign) return;

        const currentAmt = (l.debit || 0) + (l.credit || 0);
        if (currentAmt === 0) return;

        // If line is already converted (i.e. has tipoCambio and montoMonedaOriginal), skip or note
        if (l.tipoCambio && l.montoMonedaOriginal && l.tipoCambio > 1) {
          // Already converted
          return;
        }

        const currType: 'USD' | 'UF' | 'EUR' = acc.moneda === 'UF' ? 'UF' : 'USD';
        const rate = currType === 'UF' ? officialUfRate : officialUsdRate;

        // If amount looks like a foreign currency value (e.g. <= 150000) or was loaded directly as pesos
        const foreignAmount = l.montoMonedaOriginal || currentAmt;
        const converted = Math.round(foreignAmount * rate);

        list.push({
          id: `${v.id}_line_${idx}`,
          voucherId: v.id,
          voucherNumber: v.voucherNumber,
          date: v.date,
          period: v.period,
          gloss: v.gloss,
          lineIdx: idx,
          accountCode: l.accountCode,
          accountName: l.accountName || acc.name,
          accountMoneda: acc.moneda || 'USD',
          currentDebit: l.debit || 0,
          currentCredit: l.credit || 0,
          currentRawAmount: currentAmt,
          detectedCurrency: currType,
          originalForeignAmount: foreignAmount,
          exchangeRate: rate,
          convertedCLPAmount: converted,
          selected: true,
          status: 'PENDING'
        });
      });
    });

    return list;
  }, [vouchers, accounts, accountMap]);

  const [items, setItems] = useState<CurrencyCorrectionItem[]>([]);

  // Initialize items when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setItems(initialItems);
      setIsCompleted(false);
      setProgress(0);
      setStatusMessage('');
    }
  }, [isOpen, initialItems]);

  const handleToggleSelect = (id: string) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, selected: !item.selected } : item));
  };

  const handleSelectAll = (select: boolean) => {
    setItems(prev => prev.map(item => ({ ...item, selected: select })));
  };

  const handleRateChange = (id: string, newRate: number) => {
    setItems(prev => prev.map(item => {
      if (item.id === id) {
        const converted = Math.round(item.originalForeignAmount * newRate);
        return {
          ...item,
          exchangeRate: newRate,
          convertedCLPAmount: converted
        };
      }
      return item;
    }));
  };

  const handleForeignAmountChange = (id: string, newAmount: number) => {
    setItems(prev => prev.map(item => {
      if (item.id === id) {
        const converted = Math.round(newAmount * item.exchangeRate);
        return {
          ...item,
          originalForeignAmount: newAmount,
          convertedCLPAmount: converted
        };
      }
      return item;
    }));
  };

  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filter items
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (currencyFilter !== 'ALL' && item.detectedCurrency !== currencyFilter) return false;
      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        const match = 
          item.accountCode.toLowerCase().includes(s) ||
          item.accountName.toLowerCase().includes(s) ||
          item.gloss.toLowerCase().includes(s) ||
          String(item.voucherNumber).includes(s) ||
          item.date.includes(s);
        if (!match) return false;
      }
      return true;
    });
  }, [items, searchTerm, currencyFilter]);

  const selectedCount = items.filter(i => i.selected).length;

  // Execute Batch Reexpression
  const handleExecuteReexpression = async () => {
    const toUpdate = items.filter(i => i.selected);
    if (toUpdate.length === 0) {
      setErrorMessage('Seleccione al menos un comprobante / línea para reexpresar.');
      return;
    }

    setShowConfirmModal(false);
    setErrorMessage(null);
    setIsProcessing(true);
    setProgress(10);
    setStatusMessage('Agrupando comprobantes por folio...');

    try {
      // Group updates by voucherId
      const voucherUpdatesMap = new Map<string, CurrencyCorrectionItem[]>();
      toUpdate.forEach(item => {
        const list = voucherUpdatesMap.get(item.voucherId) || [];
        list.push(item);
        voucherUpdatesMap.set(item.voucherId, list);
      });

      const voucherMap = new Map(vouchers.map(v => [v.id, v]));
      const companyRef = doc(db, 'studies', studyId, 'companies', companyId);

      const voucherIds = Array.from(voucherUpdatesMap.keys());
      const BATCH_SIZE = 15;
      let processedCount = 0;

      for (let i = 0; i < voucherIds.length; i += BATCH_SIZE) {
        const slice = voucherIds.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);

        slice.forEach(vId => {
          const originalVoucher = voucherMap.get(vId);
          if (!originalVoucher) return;

          const lineUpdates = voucherUpdatesMap.get(vId) || [];
          const updatedLines = [...originalVoucher.lines];

          // Check if this voucher is a purely 2-line foreign currency entry (e.g. Ventas USD vs Factura Emitir USD, o Tecnología vs Proveedor USD)
          // If all active lines in the voucher are part of the transaction, we scale both lines to maintain double-entry!
          lineUpdates.forEach(updateItem => {
            const idx = updateItem.lineIdx;
            if (idx >= 0 && idx < updatedLines.length) {
              const currentL = updatedLines[idx];
              const isDebit = (currentL.debit || 0) > 0;
              
              updatedLines[idx] = {
                ...currentL,
                debit: isDebit ? updateItem.convertedCLPAmount : 0,
                credit: !isDebit ? updateItem.convertedCLPAmount : 0,
                moneda: updateItem.detectedCurrency,
                tipoCambio: updateItem.exchangeRate,
                montoMonedaOriginal: updateItem.originalForeignAmount
              };
            }
          });

          // Check if counterpart line also needs scaling if it had the identical foreign amount (e.g. 4000 = 4000)
          // For example in Voucher #2: Factura por Emitir = 4000, Ventas = 4000. If only one had USD account, both must balance!
          const newDebitTotal = updatedLines.reduce((s, l) => s + (l.debit || 0), 0);
          const newCreditTotal = updatedLines.reduce((s, l) => s + (l.credit || 0), 0);

          if (updatedLines.length === 2 && Math.abs(newDebitTotal - newCreditTotal) > 0.01) {
            // Re-balance counterpart line
            if (newDebitTotal > newCreditTotal && updatedLines[1].credit > 0) {
              updatedLines[1] = {
                ...updatedLines[1],
                credit: newDebitTotal,
                moneda: updatedLines[0].moneda || 'USD',
                tipoCambio: updatedLines[0].tipoCambio,
                montoMonedaOriginal: updatedLines[0].montoMonedaOriginal
              };
            } else if (newCreditTotal > newDebitTotal && updatedLines[0].debit > 0) {
              updatedLines[0] = {
                ...updatedLines[0],
                debit: newCreditTotal,
                moneda: updatedLines[1].moneda || 'USD',
                tipoCambio: updatedLines[1].tipoCambio,
                montoMonedaOriginal: updatedLines[1].montoMonedaOriginal
              };
            }
          }

          const finalDebit = updatedLines.reduce((s, l) => s + (l.debit || 0), 0);
          const finalCredit = updatedLines.reduce((s, l) => s + (l.credit || 0), 0);

          const vRef = doc(companyRef, 'vouchers', vId);
          batch.update(vRef, {
            lines: updatedLines,
            totalDebit: finalDebit,
            totalCredit: finalCredit,
            lastModifiedAt: new Date().toISOString()
          });
        });

        await batch.commit();
        processedCount += slice.length;
        setProgress(Math.round(20 + (processedCount / voucherIds.length) * 75));
        setStatusMessage(`Actualizados ${processedCount} de ${voucherIds.length} comprobantes...`);
      }

      setProgress(100);
      setStatusMessage('¡Reexpresión completada exitosamente!');
      setIsCompleted(true);
      await onSuccess();
    } catch (err: any) {
      console.error('Error in handleExecuteReexpression:', err);
      setErrorMessage('Error al reexpresar comprobantes: ' + (err?.message || 'Error desconocido'));
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col border border-slate-200 overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-emerald-600 text-white flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-sm border border-white/20">
              <DollarSign className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold tracking-tight">Reexpresador de Moneda Extranjera (USD / UF)</h2>
                <span className="px-2 py-0.5 text-xs font-semibold bg-emerald-500/40 border border-emerald-300/40 rounded-full text-emerald-100">
                  Banco Central / SII
                </span>
              </div>
              <p className="text-xs text-emerald-100">
                Detecta comprobantes cargados en Dólares/UF como pesos y reexpresa su valor en moneda funcional (CLP) con el Tipo de Cambio oficial a la fecha
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Company Info Alert */}
        <div className="bg-emerald-50 border-b border-emerald-100 px-6 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-emerald-950 font-medium">
            <span className="bg-emerald-200/60 text-emerald-800 px-2 py-0.5 rounded text-[11px] font-bold">
              {items.length} líneas en moneda extranjera detectadas
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-600">Filtrar por:</span>
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
              <button
                onClick={() => setCurrencyFilter('ALL')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${currencyFilter === 'ALL' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Todas
              </button>
              <button
                onClick={() => setCurrencyFilter('USD')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${currencyFilter === 'USD' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Dólar (USD)
              </button>
              <button
                onClick={() => setCurrencyFilter('UF')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${currencyFilter === 'UF' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}
              >
                UF
              </button>
            </div>
          </div>
        </div>

        {/* Search & Actions Toolbar */}
        <div className="px-6 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por comprobante, cuenta o glosa..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSelectAll(true)}
              className="px-2.5 py-1.5 text-xs text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg font-medium transition-colors"
            >
              Seleccionar Todos
            </button>
            <button
              onClick={() => handleSelectAll(false)}
              className="px-2.5 py-1.5 text-xs text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg font-medium transition-colors"
            >
              Deseleccionar
            </button>
            <span className="text-xs text-slate-500 font-mono pl-2">
              {selectedCount} seleccionados
            </span>
          </div>
        </div>

        {/* Main Table Content */}
        <div className="flex-1 overflow-auto p-6">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8">
              <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mb-3">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-base font-semibold text-slate-800">No se detectaron asientos pendientes de reexpresión</h3>
              <p className="text-xs text-slate-500 max-w-md mt-1">
                Todas las cuentas en moneda extranjera están expresadas correctamente en pesos chilenos (CLP) o no tienen movimientos pendientes.
              </p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                    <th className="py-2.5 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={items.length > 0 && items.every(i => i.selected)}
                        onChange={e => handleSelectAll(e.target.checked)}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                    </th>
                    <th className="py-2.5 px-3">Comp. #</th>
                    <th className="py-2.5 px-3">Fecha</th>
                    <th className="py-2.5 px-3">Cuenta Contable</th>
                    <th className="py-2.5 px-3">Glosa</th>
                    <th className="py-2.5 px-3 text-right">Monto Actual ($)</th>
                    <th className="py-2.5 px-3 text-center">Monto Divisa</th>
                    <th className="py-2.5 px-3 text-center">T/C Banco Central</th>
                    <th className="py-2.5 px-3 text-right font-bold text-emerald-700">Reexpresado (CLP)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredItems.map(item => (
                    <tr 
                      key={item.id}
                      className={`hover:bg-slate-50 transition-colors ${item.selected ? 'bg-emerald-50/30' : ''}`}
                    >
                      <td className="py-2.5 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={item.selected}
                          onChange={() => handleToggleSelect(item.id)}
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                      </td>
                      <td className="py-2.5 px-3 font-mono font-semibold text-slate-900">
                        #{item.voucherNumber}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">
                        {item.date}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900 font-mono">{item.accountCode}</div>
                        <div className="text-[11px] text-slate-500 truncate max-w-[200px]">{item.accountName}</div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 max-w-[220px] truncate" title={item.gloss}>
                        {item.gloss}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-amber-700 font-medium">
                        {formatCLP(item.currentRawAmount)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="inline-flex items-center gap-1 font-mono">
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                            {item.detectedCurrency}
                          </span>
                          <input
                            type="number"
                            value={item.originalForeignAmount}
                            onChange={e => handleForeignAmountChange(item.id, parseFloat(e.target.value) || 0)}
                            className="w-20 px-1.5 py-1 border border-slate-200 rounded text-center font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <input
                          type="number"
                          step="0.01"
                          value={item.exchangeRate}
                          onChange={e => handleRateChange(item.id, parseFloat(e.target.value) || 0)}
                          className="w-20 px-1.5 py-1 border border-slate-200 rounded text-center font-mono font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700 bg-emerald-50/50">
                        {formatCLP(item.convertedCLPAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Progress Bar & Status */}
        {isProcessing && (
          <div className="px-6 py-3 bg-emerald-50 border-t border-emerald-200">
            <div className="flex items-center justify-between text-xs text-emerald-800 mb-1 font-medium">
              <span>{statusMessage}</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full bg-emerald-200 rounded-full h-2 overflow-hidden">
              <div 
                className="bg-emerald-600 h-full transition-all duration-300 rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {isCompleted && (
          <div className="px-6 py-3 bg-emerald-100 border-t border-emerald-300 text-emerald-900 text-xs font-semibold flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
              <span>¡Los comprobantes han sido reexpresados en Pesos Chilenos (CLP) con éxito!</span>
            </div>
            <button
              onClick={onClose}
              className="px-3 py-1 bg-emerald-700 text-white rounded-lg text-xs font-bold hover:bg-emerald-800 transition-colors"
            >
              Entendido / Cerrar
            </button>
          </div>
        )}

        {/* Error message */}
        {errorMessage && (
          <div className="mx-6 my-2 p-3 bg-rose-50 border border-rose-300 rounded-xl text-rose-800 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button 
              type="button" 
              onClick={() => setErrorMessage(null)} 
              className="text-rose-500 hover:text-rose-700 font-bold ml-2 text-sm"
            >
              ✕
            </button>
          </div>
        )}

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            <span>Normativa Contable Chilena: Los libros contables deben llevarse en moneda funcional (CLP).</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 bg-slate-100 border border-slate-300 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                if (selectedCount === 0) {
                  setErrorMessage('Seleccione al menos un comprobante / línea para reexpresar.');
                  return;
                }
                setShowConfirmModal(true);
              }}
              disabled={isProcessing || selectedCount === 0 || isCompleted}
              className={`px-5 py-2 text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-2 ${
                isProcessing || selectedCount === 0 || isCompleted
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200'
              }`}
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Procesando Reexpresión...</span>
                </>
              ) : (
                <>
                  <Scale className="w-4 h-4" />
                  <span>Reexpresar {selectedCount} Asientos a Pesos (CLP)</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Confirmation Modal */}
        {showConfirmModal && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4 mx-auto">
                <Scale className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900 text-center mb-2">
                ¿Confirmar Reexpresión a Moneda Funcional (CLP)?
              </h3>
              <p className="text-xs text-slate-600 text-center mb-4 leading-relaxed">
                Se actualizarán <strong>{selectedCount} líneas contables</strong> multiplicando el monto en moneda extranjera (USD/UF) por el Tipo de Cambio Oficial del Banco Central a la fecha de cada comprobante.
              </p>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] text-slate-600 mb-5 space-y-1">
                <div className="flex justify-between">
                  <span>Líneas a reexpresar:</span>
                  <span className="font-bold text-slate-800">{selectedCount}</span>
                </div>
                <div className="flex justify-between">
                  <span>Moneda destino:</span>
                  <span className="font-bold text-emerald-700">Pesos Chilenos (CLP)</span>
                </div>
                <div className="flex justify-between">
                  <span>Registro histórico:</span>
                  <span className="font-bold text-slate-800">Se conserva divisa y tipo de cambio</span>
                </div>
              </div>
              <div className="flex items-center gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 border border-slate-300 rounded-xl transition-colors flex-1"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleExecuteReexpression}
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md transition-colors flex-1"
                >
                  Sí, Reexpresar
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
