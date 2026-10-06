import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  ArrowRightLeft, 
  Landmark, 
  CheckCircle2, 
  AlertCircle, 
  Calendar, 
  Layers, 
  RefreshCw, 
  SlidersHorizontal, 
  ArrowRight, 
  CheckSquare, 
  Square, 
  ChevronDown, 
  ChevronUp, 
  FileText, 
  Sparkles,
  Info,
  Clock,
  ShieldCheck,
  Building2,
  ExternalLink
} from 'lucide-react';
import { useDraggableModal } from '../hooks/useDraggableModal';
import { 
  Company, 
  ChartOfAccount, 
  Voucher, 
  BankReconciliation, 
  FiscalPeriodYear 
} from '../types';
import { 
  findInterbankTransferProposals, 
  executeInterbankTransfers, 
  InterbankTransferProposal, 
  InterbankScanOptions,
  InterbankExecutionResult
} from '../utils/interbankTransferEngine';
import { notify } from '../context/ToastContext';

const MONTH_NAMES: { [key: string]: string } = {
  '01': 'Enero',
  '02': 'Febrero',
  '03': 'Marzo',
  '04': 'Abril',
  '05': 'Mayo',
  '06': 'Junio',
  '07': 'Julio',
  '08': 'Agosto',
  '09': 'Septiembre',
  '10': 'Octubre',
  '11': 'Noviembre',
  '12': 'Diciembre'
};

const ALL_MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];

interface InterbankTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  studyId: string;
  company: Company;
  accounts: ChartOfAccount[];
  vouchers: Voucher[];
  reconciliations: BankReconciliation[];
  fiscalYears: FiscalPeriodYear[];
  initialPeriod?: string;
  onSuccess?: () => void;
  onOpenVoucher?: (voucherRef: Voucher | string | number) => void;
}

export default function InterbankTransferModal({
  isOpen,
  onClose,
  studyId,
  company,
  accounts,
  vouchers,
  reconciliations,
  fiscalYears,
  initialPeriod,
  onSuccess,
  onOpenVoucher
}: InterbankTransferModalProps) {
  // Draggable Hook
  const { modalStyle, dragProps } = useDraggableModal({ isOpen });

  // Bank Accounts (only active bank accounts)
  const bankAccounts = useMemo(() => {
    return accounts.filter(acc => {
      if (acc.estado === 'Inactivo') return false;
      const code = (acc.code || '').replace(/-/g, '.');
      const name = (acc.name || '').toLowerCase();
      return (
        acc.requiereConciliacionBancaria ||
        (code.startsWith('1.1.01') && (name.includes('banco') || name.includes('cuenta corriente') || name.includes('caja') || name.includes('tesoreria') || name.includes('transbank')))
      );
    });
  }, [accounts]);

  // Available Fiscal Years
  const availableYears = useMemo(() => {
    const yearsSet = new Set<string>();
    (fiscalYears || []).forEach(fy => {
      if (fy.year) yearsSet.add(String(fy.year));
    });
    reconciliations.forEach(r => {
      if (r.period) yearsSet.add(r.period.slice(0, 4));
    });
    yearsSet.add(new Date().getFullYear().toString());
    return Array.from(yearsSet).sort().reverse();
  }, [fiscalYears, reconciliations]);

  const [selectedYear, setSelectedYear] = useState<string>(() => {
    if (initialPeriod && initialPeriod.length >= 4) {
      return initialPeriod.slice(0, 4);
    }
    return availableYears[0] || new Date().getFullYear().toString();
  });

  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    if (initialPeriod && initialPeriod.length >= 7) {
      return initialPeriod.slice(5, 7);
    }
    return 'TODOS';
  });

  // Filter state
  const [selectedOriginBankId, setSelectedOriginBankId] = useState<string>('TODOS');
  const [selectedDestBankId, setSelectedDestBankId] = useState<string>('TODOS');
  const [maxDayDiff, setMaxDayDiff] = useState<number>(1); // Default: 1 day tolerance
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  // Engine state
  const [proposals, setProposals] = useState<InterbankTransferProposal[]>([]);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [executionProgress, setExecutionProgress] = useState<{ current: number; total: number; msg: string }>({ current: 0, total: 0, msg: '' });
  const [executionResult, setExecutionResult] = useState<InterbankExecutionResult | null>(null);

  // Scan triggers
  const runScan = () => {
    setIsScanning(true);
    setExecutionResult(null);

    const scanPeriod = selectedMonth === 'TODOS' 
      ? 'TODOS' 
      : `${selectedYear}-${selectedMonth}`;

    const scanOptions: InterbankScanOptions = {
      periodFilter: scanPeriod,
      originBankAccountId: selectedOriginBankId,
      destinationBankAccountId: selectedDestBankId,
      maxDayDifference: maxDayDiff,
      allowNegativeDayDiff: true
    };

    // If 'TODOS' months in year, restrict to months of the selected year
    if (selectedMonth === 'TODOS') {
      scanOptions.selectedPeriods = ALL_MONTHS.map(m => `${selectedYear}-${m}`);
      scanOptions.periodFilter = 'TODOS';
    }

    try {
      const results = findInterbankTransferProposals(bankAccounts, reconciliations, scanOptions);
      setProposals(results);
    } catch (err: any) {
      console.error('Error scanning interbank transfers:', err);
      notify.error('Error al analizar movimientos interbancarios: ' + err.message);
    } finally {
      setIsScanning(false);
    }
  };

  // Run initial scan when modal opens or when main filters change
  useEffect(() => {
    if (isOpen) {
      runScan();
    }
  }, [isOpen, selectedYear, selectedMonth, selectedOriginBankId, selectedDestBankId, maxDayDiff, reconciliations, bankAccounts]);

  // Selection toggle handlers
  const toggleSelectAll = (select: boolean) => {
    setProposals(prev => prev.map(p => ({ ...p, selected: select })));
  };

  const toggleSelectProposal = (id: string) => {
    setProposals(prev => prev.map(p => p.id === id ? { ...p, selected: !p.selected } : p));
  };

  // Metrics
  const selectedCount = useMemo(() => proposals.filter(p => p.selected).length, [proposals]);
  const totalSelectedAmount = useMemo(() => {
    return proposals.filter(p => p.selected).reduce((sum, p) => sum + p.totalAmount, 0);
  }, [proposals]);

  const totalLinesToReconcile = useMemo(() => {
    return proposals.filter(p => p.selected).reduce((sum, p) => sum + p.originLines.length + p.destinationLines.length, 0);
  }, [proposals]);

  // Execute Batch Accounting & Reconciliation
  const handleExecute = async () => {
    const toExecute = proposals.filter(p => p.selected && p.status !== 'CONTABILIZADO');
    if (toExecute.length === 0) {
      notify.warning('No hay traspasos seleccionados para contabilizar.');
      return;
    }

    setIsExecuting(true);
    setExecutionProgress({ current: 0, total: toExecute.length, msg: 'Iniciando generación de comprobantes de traspaso...' });

    try {
      const res = await executeInterbankTransfers(
        studyId,
        company,
        toExecute,
        fiscalYears,
        (current, total, msg) => {
          setExecutionProgress({ current, total, msg });
        }
      );

      setExecutionResult(res);

      if (res.success && res.totalVouchersCreated > 0) {
        notify.success(
          `¡Éxito! Se crearon ${res.totalVouchersCreated} comprobante(s) de traspaso y se conciliaron ${res.totalOriginLinesReconciled + res.totalDestinationLinesReconciled} líneas de cartola por $${res.totalAmountTransferred.toLocaleString('es-CL')}.`,
          '✅ Traspasos Contabilizados y Conciliados',
          5000
        );

        // Update in-place proposal statuses
        setProposals(prev => prev.map(p => {
          const matchingResult = res.createdVouchers.find(v => v.amount === p.totalAmount && v.originBank === p.originBankAccountName);
          if (matchingResult && p.selected) {
            return {
              ...p,
              status: 'CONTABILIZADO',
              createdVoucherId: matchingResult.voucherId,
              createdVoucherNumber: matchingResult.voucherNumber
            };
          }
          return p;
        }));

        if (onSuccess) onSuccess();
      } else if (res.errors.length > 0) {
        notify.error('Se presentaron advertencias: ' + res.errors.join('; '));
      }
    } catch (err: any) {
      console.error('Error executing transfers:', err);
      notify.error('Error al ejecutar traspasos: ' + err.message);
    } finally {
      setIsExecuting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        style={modalStyle}
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden text-slate-800"
      >
        {/* Header (Draggable) */}
        <div 
          {...dragProps}
          className="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between border-b border-indigo-900/40 select-none cursor-move"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/30 border border-indigo-400/40 flex items-center justify-center shadow-inner">
              <ArrowRightLeft className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold tracking-tight text-white">Traspaso entre Cuentas Bancarias</h3>
                <span className="px-2 py-0.5 bg-indigo-500/30 border border-indigo-400/30 rounded-full text-[11px] font-semibold text-indigo-200">
                  Conciliación & Asiento Automático
                </span>
              </div>
              <p className="text-xs text-slate-300 flex items-center gap-1.5 mt-0.5">
                <span>{company.name}</span>
                <span className="text-slate-500">•</span>
                <span>{bankAccounts.length} cuenta(s) bancaria(s)</span>
                <span className="text-slate-500">•</span>
                <span className="text-emerald-300 font-medium">Margen hasta ±1 día (Corte bancario 14:00 hrs)</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={runScan}
              disabled={isScanning || isExecuting}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Volver a escanear cartolas"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin text-indigo-300' : ''}`} />
              <span>{isScanning ? 'Buscando...' : 'Re-analizar'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter & Parameters Bar */}
        <div className="px-6 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            {/* Year Selector */}
            <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 shadow-2xs">
              <Calendar className="w-3.5 h-3.5 text-indigo-600" />
              <span className="font-bold text-slate-600">Año:</span>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
              >
                {availableYears.map(yr => (
                  <option key={yr} value={yr}>{yr}</option>
                ))}
              </select>
            </div>

            {/* Month Filter */}
            <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 shadow-2xs">
              <span className="font-bold text-slate-600">Período:</span>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent font-bold text-indigo-700 focus:outline-none cursor-pointer"
              >
                <option value="TODOS">📅 Todo el Año {selectedYear} (Ene - Dic)</option>
                {ALL_MONTHS.map(m => (
                  <option key={m} value={m}>{MONTH_NAMES[m]} ({selectedYear}-{m})</option>
                ))}
              </select>
            </div>

            {/* Origin Bank Filter */}
            <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 shadow-2xs">
              <span className="font-bold text-slate-600">Banco Origen:</span>
              <select
                value={selectedOriginBankId}
                onChange={(e) => setSelectedOriginBankId(e.target.value)}
                className="bg-transparent font-semibold text-slate-800 focus:outline-none cursor-pointer max-w-[150px] truncate"
              >
                <option value="TODOS">Todos los Bancos</option>
                {bankAccounts.map(b => (
                  <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                ))}
              </select>
            </div>

            {/* Destination Bank Filter */}
            <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 shadow-2xs">
              <span className="font-bold text-slate-600">Banco Destino:</span>
              <select
                value={selectedDestBankId}
                onChange={(e) => setSelectedDestBankId(e.target.value)}
                className="bg-transparent font-semibold text-slate-800 focus:outline-none cursor-pointer max-w-[150px] truncate"
              >
                <option value="TODOS">Todos los Bancos</option>
                {bankAccounts.map(b => (
                  <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                ))}
              </select>
            </div>

            {/* Date Tolerance */}
            <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 shadow-2xs">
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              <span className="font-bold text-slate-600">Margen Fecha:</span>
              <select
                value={maxDayDiff}
                onChange={(e) => setMaxDayDiff(Number(e.target.value))}
                className="bg-transparent font-semibold text-amber-800 focus:outline-none cursor-pointer"
              >
                <option value={1}>± 1 día (Recomendado TEF / corte 14:00 hrs)</option>
                <option value={0}>Mismo día exacto (0 días)</option>
                <option value={2}>± 2 días (Fines de semana / Feriados)</option>
                <option value={3}>± 3 días (Fin de semana largo)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => toggleSelectAll(true)}
              className="text-[11px] font-bold text-indigo-700 hover:text-indigo-900 cursor-pointer"
            >
              Seleccionar Todos
            </button>
            <span className="text-slate-300">|</span>
            <button
              onClick={() => toggleSelectAll(false)}
              className="text-[11px] font-bold text-slate-500 hover:text-slate-700 cursor-pointer"
            >
              Deseleccionar
            </button>
          </div>
        </div>

        {/* Informational Guidance Bar */}
        <div className="px-6 py-2 bg-indigo-50/70 border-b border-indigo-100 flex items-center justify-between text-xs text-indigo-950">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>
              <strong>Algoritmo de Detección Inteligente:</strong> Cruza cargos en banco emisor con abonos en banco receptor (1 a 1, concentrado N a 1 ej: 10 transferencias de $7M = 1 abono de $70M, y fraccionado 1 a N).
            </span>
          </div>
          <span className="text-[11px] text-indigo-600 font-semibold shrink-0 ml-4">
            Genera comprobantes de tipo <strong>TRASPASO</strong>
          </span>
        </div>

        {/* Proposals List / Table */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {proposals.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-500 flex items-center justify-center mx-auto mb-3">
                <ArrowRightLeft className="w-8 h-8" />
              </div>
              <h4 className="text-sm font-bold text-slate-800">No se detectaron traspasos interbancarios pendientes</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                No hay movimientos no conciliados en el período que coincidan en montos y fechas entre cuentas de la misma sociedad, o ya fueron conciliados.
              </p>
              <div className="mt-4 flex items-center justify-center gap-2">
                <button
                  onClick={() => { setSelectedMonth('TODOS'); setMaxDayDiff(2); }}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  Buscar en Todo el Año con Margen ±2 días
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-500 px-1 font-semibold">
                <span>{proposals.length} propuesta(s) de traspaso encontrada(s)</span>
                <span>
                  Seleccionados: <strong>{selectedCount}</strong> | Total a Contabilizar: <strong className="text-emerald-700 text-sm">${totalSelectedAmount.toLocaleString('es-CL')}</strong>
                </span>
              </div>

              {proposals.map((prop) => {
                const isExpanded = expandedRowId === prop.id;
                const isContabilizado = prop.status === 'CONTABILIZADO';

                return (
                  <div
                    key={prop.id}
                    className={`rounded-xl border transition-all ${
                      isContabilizado
                        ? 'bg-emerald-50/40 border-emerald-300'
                        : prop.selected
                        ? 'bg-white border-indigo-300 shadow-sm hover:border-indigo-400'
                        : 'bg-slate-50/70 border-slate-200 opacity-75'
                    }`}
                  >
                    {/* Main Row Content */}
                    <div className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                      {/* Checkbox and Status */}
                      <div className="flex items-center gap-3">
                        {!isContabilizado ? (
                          <button
                            type="button"
                            onClick={() => toggleSelectProposal(prop.id)}
                            className="text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
                          >
                            {prop.selected ? (
                              <CheckSquare className="w-5 h-5 text-indigo-600 fill-indigo-50" />
                            ) : (
                              <Square className="w-5 h-5 text-slate-400" />
                            )}
                          </button>
                        ) : (
                          <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-xs">
                            ✓
                          </span>
                        )}

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-slate-800">
                              📅 {prop.suggestedVoucherDate}
                            </span>
                            {prop.daysDifference !== 0 && (
                              <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded-md text-[10px] font-bold">
                                {prop.daysDifference > 0 ? `+${prop.daysDifference} día (TEF)` : `${prop.daysDifference} día`}
                              </span>
                            )}
                            <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-200 rounded-md text-[10px] font-bold text-indigo-700">
                              {prop.matchType === 'ONE_TO_ONE' && '1 a 1'}
                              {prop.matchType === 'MANY_TO_ONE' && `${prop.originLines.length} a 1 (Concentrado)`}
                              {prop.matchType === 'ONE_TO_MANY' && `1 a ${prop.destinationLines.length} (Fraccionado)`}
                              {prop.matchType === 'MANY_TO_MANY' && `${prop.originLines.length} a ${prop.destinationLines.length} (Múltiple)`}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5">
                            <span className="text-emerald-600 font-bold">Confianza {prop.confidence}%:</span>
                            <span>{prop.confidenceReason}</span>
                          </div>
                        </div>
                      </div>

                      {/* Origin & Destination Banks Display */}
                      <div className="flex-1 flex items-center justify-center gap-4 w-full md:w-auto">
                        {/* Origin Bank (Cargo / Salida) */}
                        <div className="flex-1 bg-rose-50/70 border border-rose-200 rounded-lg p-2.5 text-xs text-left">
                          <div className="flex items-center justify-between font-bold text-rose-950">
                            <span className="flex items-center gap-1">
                              <span className="text-rose-600">📤 Cargo (Salida):</span>
                              <span className="truncate max-w-[140px]">{prop.originBankAccountName}</span>
                            </span>
                            <span className="text-rose-800 font-bold">${prop.totalAmount.toLocaleString('es-CL')}</span>
                          </div>
                          <div className="text-[11px] text-rose-700 mt-0.5 flex items-center justify-between">
                            <span>Cta: {prop.originBankAccountCode}</span>
                            <span>{prop.originLines.length} movimiento(s)</span>
                          </div>
                        </div>

                        {/* Transfer Arrow */}
                        <div className="shrink-0 flex flex-col items-center justify-center px-1 text-indigo-600">
                          <ArrowRight className="w-5 h-5 text-indigo-600 animate-pulse" />
                          <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-tighter">Traspaso</span>
                        </div>

                        {/* Destination Bank (Abono / Entrada) */}
                        <div className="flex-1 bg-emerald-50/70 border border-emerald-200 rounded-lg p-2.5 text-xs text-left">
                          <div className="flex items-center justify-between font-bold text-emerald-950">
                            <span className="flex items-center gap-1">
                              <span className="text-emerald-600">📥 Abono (Entrada):</span>
                              <span className="truncate max-w-[140px]">{prop.destinationBankAccountName}</span>
                            </span>
                            <span className="text-emerald-800 font-bold">${prop.totalAmount.toLocaleString('es-CL')}</span>
                          </div>
                          <div className="text-[11px] text-emerald-700 mt-0.5 flex items-center justify-between">
                            <span>Cta: {prop.destinationBankAccountCode}</span>
                            <span>{prop.destinationLines.length} movimiento(s)</span>
                          </div>
                        </div>
                      </div>

                      {/* Total Amount & Action Preview */}
                      <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
                        <div className="text-right">
                          <div className="text-sm font-extrabold text-slate-900">
                            ${prop.totalAmount.toLocaleString('es-CL')}
                          </div>
                          <div className="text-[10px] text-slate-400 font-semibold">
                            Total Traspaso
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setExpandedRowId(isExpanded ? null : prop.id)}
                          className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                          title="Ver detalle de líneas de cartola y asiento"
                        >
                          <span>{isExpanded ? 'Ocultar' : 'Detalle'}</span>
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {/* Expanded Detail Panel */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-1 border-t border-slate-200/80 bg-slate-50/50 space-y-3 text-xs animate-in fade-in duration-100">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                          {/* Origin Statement Lines */}
                          <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-2">
                            <div className="font-bold text-rose-900 flex items-center justify-between border-b border-slate-100 pb-1.5">
                              <span>Líneas de Cartola - {prop.originBankAccountName}</span>
                              <span className="text-rose-700">{prop.originLines.length} cargo(s)</span>
                            </div>
                            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                              {prop.originLines.map((item, idx) => (
                                <div key={idx} className="p-2 bg-rose-50/40 rounded border border-rose-100 flex items-center justify-between text-[11px]">
                                  <div>
                                    <div className="font-bold text-slate-800">{item.line.date} • {item.line.description}</div>
                                    {item.line.documentNumber && (
                                      <div className="text-slate-400 text-[10px]">Doc/Ref: {item.line.documentNumber}</div>
                                    )}
                                  </div>
                                  <span className="font-bold text-rose-700 ml-2">
                                    -${Number(item.line.charge || 0).toLocaleString('es-CL')}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Destination Statement Lines */}
                          <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-2">
                            <div className="font-bold text-emerald-900 flex items-center justify-between border-b border-slate-100 pb-1.5">
                              <span>Líneas de Cartola - {prop.destinationBankAccountName}</span>
                              <span className="text-emerald-700">{prop.destinationLines.length} abono(s)</span>
                            </div>
                            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                              {prop.destinationLines.map((item, idx) => (
                                <div key={idx} className="p-2 bg-emerald-50/40 rounded border border-emerald-100 flex items-center justify-between text-[11px]">
                                  <div>
                                    <div className="font-bold text-slate-800">{item.line.date} • {item.line.description}</div>
                                    {item.line.documentNumber && (
                                      <div className="text-slate-400 text-[10px]">Doc/Ref: {item.line.documentNumber}</div>
                                    )}
                                  </div>
                                  <span className="font-bold text-emerald-700 ml-2">
                                    +${Number(item.line.deposit || 0).toLocaleString('es-CL')}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Accounting Entry Preview */}
                        <div className="bg-white p-3 rounded-lg border border-indigo-200 shadow-2xs space-y-2">
                          <div className="font-bold text-indigo-950 flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Asiento Contable a Generar (Tipo: TRASPASO • Fecha: {prop.suggestedVoucherDate})</span>
                          </div>
                          <table className="w-full text-left text-[11px] border border-slate-100 rounded">
                            <thead className="bg-slate-100 text-slate-700 font-bold">
                              <tr>
                                <th className="p-2">Cuenta Contable</th>
                                <th className="p-2">Glosa</th>
                                <th className="p-2 text-right">Debe</th>
                                <th className="p-2 text-right">Haber</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              <tr>
                                <td className="p-2 font-semibold text-emerald-900">
                                  [{prop.destinationBankAccountCode}] {prop.destinationBankAccountName}
                                </td>
                                <td className="p-2 text-slate-500">
                                  Traspaso fondos desde {prop.originBankAccountName}
                                </td>
                                <td className="p-2 text-right font-bold text-emerald-700">
                                  ${prop.totalAmount.toLocaleString('es-CL')}
                                </td>
                                <td className="p-2 text-right text-slate-400">$0</td>
                              </tr>
                              <tr>
                                <td className="p-2 font-semibold text-rose-900">
                                  [{prop.originBankAccountCode}] {prop.originBankAccountName}
                                </td>
                                <td className="p-2 text-slate-500">
                                  Traspaso fondos hacia {prop.destinationBankAccountName}
                                </td>
                                <td className="p-2 text-right text-slate-400">$0</td>
                                <td className="p-2 text-right font-bold text-rose-700">
                                  ${prop.totalAmount.toLocaleString('es-CL')}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Execution Result Banner */}
          {executionResult && (
            <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-4 text-xs text-emerald-950 space-y-2">
              <div className="flex items-center gap-2 font-bold text-emerald-900 text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>Contabilización y Conciliación Completada Exitosamente</span>
              </div>
              <p>
                Se generaron <strong>{executionResult.totalVouchersCreated}</strong> comprobante(s) contable(s) de traspaso por un monto total de <strong>${executionResult.totalAmountTransferred.toLocaleString('es-CL')}</strong>, conciliando <strong>{executionResult.totalOriginLinesReconciled + executionResult.totalDestinationLinesReconciled}</strong> movimientos de cartola.
              </p>
              {executionResult.createdVouchers.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="font-semibold text-slate-600">Comprobantes creados:</span>
                  {executionResult.createdVouchers.map((v, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        if (onOpenVoucher) {
                          onOpenVoucher(v.voucherNumber);
                          onClose();
                        }
                      }}
                      className="px-2 py-1 bg-white hover:bg-emerald-100 text-emerald-800 font-bold rounded border border-emerald-300 flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <span>N° {v.voucherNumber} ({v.originBank} ➔ {v.destinationBank})</span>
                      <ExternalLink className="w-3 h-3 text-emerald-600" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
          <div className="text-slate-500 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>
              La contabilización es atómica y los saldos de cartola se actualizan de forma inmediata en Firestore.
            </span>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isExecuting}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            >
              Cerrar
            </button>

            <button
              type="button"
              disabled={selectedCount === 0 || isExecuting}
              onClick={handleExecute}
              className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:from-slate-400 disabled:to-slate-400 text-white font-bold rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed text-xs"
            >
              {isExecuting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  <span>{executionProgress.msg || 'Contabilizando...'}</span>
                </>
              ) : (
                <>
                  <ArrowRightLeft className="w-4 h-4 text-emerald-100" />
                  <span>
                    Confirmar y Contabilizar {selectedCount} Traspaso(s) (${totalSelectedAmount.toLocaleString('es-CL')})
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
