import React, { useState, useMemo } from 'react';
import { getNextVoucherNumber } from '../utils/voucherCounter';
import { 
  X, 
  Sparkles, 
  Bot, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowRight, 
  Building2, 
  CreditCard, 
  Receipt, 
  Layers, 
  RefreshCw, 
  Play, 
  ShieldCheck, 
  HelpCircle,
  TrendingDown,
  TrendingUp,
  FileSpreadsheet,
  Lock
} from 'lucide-react';
import { 
  Company, 
  ChartOfAccount, 
  Voucher, 
  BankStatementLine, 
  FiscalPeriodYear, 
  Auxiliary 
} from '../types';
import { runAgent1Conciliador, Agent1ClassificationResult } from '../services/agentConciliadorService';
import { notify } from '../context/ToastContext';
import { db } from '../lib/firebase';
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore';

interface Agent1ConciliadorModalProps {
  isOpen: boolean;
  onClose: () => void;
  studyId: string;
  company: Company;
  bankAccount?: ChartOfAccount;
  period: string;
  statementLines: BankStatementLine[];
  accounts: ChartOfAccount[];
  vouchers: Voucher[];
  auxiliaries?: Auxiliary[];
  fiscalYears: FiscalPeriodYear[];
  onSuccess: () => Promise<void> | void;
}

export default function Agent1ConciliadorModal({
  isOpen,
  onClose,
  studyId,
  company,
  bankAccount,
  period,
  statementLines,
  accounts,
  vouchers,
  auxiliaries = [],
  fiscalYears,
  onSuccess
}: Agent1ConciliadorModalProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<Agent1ClassificationResult[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<'TODOS' | 'FINANCIAL_OPERATION' | 'CLIENT_PAYMENT' | 'VENDOR_PAYMENT' | 'TAX_OR_PAYROLL' | 'INTERNAL_TRANSFER'>('TODOS');
  const [isCommitting, setIsCommitting] = useState<string | null>(null);
  const [aiSource, setAiSource] = useState<string | null>(null);

  // Filtrar sólo líneas pendientes de conciliar
  const pendingLines = useMemo(() => {
    return statementLines.filter(l => l.matchedStatus !== 'Conciliado');
  }, [statementLines]);

  // Ejecutar el Agente 1
  const handleExecuteAgent1 = async () => {
    if (pendingLines.length === 0) {
      notify.info('No hay transacciones bancarias pendientes de conciliar en este período.');
      return;
    }

    setIsRunning(true);
    try {
      const response = await runAgent1Conciliador({
        studyId,
        company,
        transactions: pendingLines,
        accounts,
        auxiliaries
      });

      setResults(response.results || []);
      setAiSource(response.source);
      notify.success(`Agente 1 completó el análisis de ${response.classifiedCount} transacciones bancarias.`);
    } catch (err: any) {
      notify.error(`Error al invocar Agente 1: ${err.message || String(err)}`);
    } finally {
      setIsRunning(false);
    }
  };

  // Contabilizar Gasto Bancario Directo (Comisión / Mantención)
  const handleCreateBankExpenseVoucher = async (result: Agent1ClassificationResult) => {
    const originalLine = pendingLines.find(l => l.id === result.transactionId);
    if (!originalLine || !bankAccount) {
      notify.error('No se encontró la línea original o la cuenta bancaria.');
      return;
    }

    setIsCommitting(result.transactionId);
    try {
      // Buscar o sugerir cuenta de gastos bancarios
      let expenseAccount = accounts.find(a => 
        (a.code && a.code.replace(/-/g, '.').startsWith('4.1.02.05')) ||
        (a.name && a.name.toLowerCase().includes('comisiones bancarias')) ||
        (a.name && a.name.toLowerCase().includes('gastos bancarios'))
      );

      if (!expenseAccount) {
        expenseAccount = accounts.find(a => a.type === 'Gasto' || (a as any).tipo === 'Gasto' || (a as any).tipo === 'Pérdida') || accounts[0];
      }

      const amount = Number(originalLine.charge) || 0;
      if (amount <= 0) {
        notify.error('El monto del cargo debe ser mayor a 0.');
        setIsCommitting(null);
        return;
      }

      // Siguiente número de comprobante
      const nextVoucherNum = await getNextVoucherNumber(
        studyId, company.id, 0,
        vouchers.reduce((max, v) => Math.max(max, Number(v.voucherNumber) || 0), 0)
      );

      // Partida Doble Perfecta: Debe Gasto Bancario / Haber Banco
      const newVoucher = {
        voucherNumber: nextVoucherNum,
        date: originalLine.date,
        period: period,
        type: 'Egreso',
        gloss: `CARGO BANCARIO - ${originalLine.description}`.toUpperCase(),
        lines: [
          {
            id: 'l1',
            accountId: expenseAccount.id,
            accountCode: expenseAccount.code,
            accountName: expenseAccount.name,
            debit: amount,
            credit: 0,
            documentRef: originalLine.documentNumber || 'BANCO',
            gloss: originalLine.description
          },
          {
            id: 'l2',
            accountId: bankAccount.id,
            accountCode: bankAccount.code,
            accountName: bankAccount.name,
            debit: 0,
            credit: amount,
            documentRef: originalLine.documentNumber || 'BANCO',
            gloss: originalLine.description
          }
        ],
        createdAt: new Date().toISOString(),
        createdBy: 'Agente 1 (Conciliador IA)',
        status: 'Centralizado'
      };

      // Guardar comprobante en Firestore
      const companyRef = doc(db, 'studies', studyId, 'companies', company.id);
      await addDoc(collection(companyRef, 'vouchers'), newVoucher);

      // Remover el resultado de la lista analizada
      setResults(prev => prev.filter(r => r.transactionId !== result.transactionId));

      notify.success(`Comprobante de Egreso N° ${nextVoucherNum} generado exitosamente por $${amount.toLocaleString('es-CL')}.`);
      await onSuccess();
    } catch (err: any) {
      notify.error(`Error al crear comprobante: ${err.message || String(err)}`);
    } finally {
      setIsCommitting(null);
    }
  };

  // Resumen métrico
  const stats = useMemo(() => {
    const total = results.length;
    const clientPayments = results.filter(r => r.classification === 'CLIENT_PAYMENT').length;
    const vendorPayments = results.filter(r => r.classification === 'VENDOR_PAYMENT').length;
    const financialOps = results.filter(r => r.classification === 'FINANCIAL_OPERATION').length;
    const taxesPayroll = results.filter(r => r.classification === 'TAX_OR_PAYROLL').length;
    const internalTransfers = results.filter(r => r.classification === 'INTERNAL_TRANSFER').length;
    const avgConfidence = total > 0 ? (results.reduce((acc, r) => acc + r.confidence, 0) / total) * 100 : 0;

    return { total, clientPayments, vendorPayments, financialOps, taxesPayroll, internalTransfers, avgConfidence };
  }, [results]);

  const filteredResults = useMemo(() => {
    if (selectedFilter === 'TODOS') return results;
    return results.filter(r => r.classification === selectedFilter);
  }, [results, selectedFilter]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* HEADER */}
        <div className="bg-linear-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-4 sm:p-5 flex items-center justify-between border-b border-indigo-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600/30 border border-indigo-400/40 rounded-xl text-indigo-300">
              <Bot className="w-6 h-6 text-indigo-400 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  Agente 1: Conciliador Bancario Autónomo
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 rounded-full">
                  Gemini 3.8 Flash
                </span>
                <span className="hidden sm:inline-flex px-2 py-0.5 text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 rounded-full">
                  Multi-Tenant Seguro
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Clasifica glosas bancarias complejas, detecta clientes, proveedores y comisiones sin riesgo de alucinación matemática.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CONTENEDOR PRINCIPAL */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-slate-50/70">
          
          {/* BANNER DE AISLAMIENTO MULTI-TENANT */}
          <div className="bg-indigo-50/80 border border-indigo-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-indigo-900">
              <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>
                <strong>Contexto Aislado:</strong> {company.name} (RUT: {company.rut}) | Cuenta: <strong>{bankAccount?.name || 'Banco'}</strong> ({bankAccount?.code}) | Período: <strong>{period}</strong>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-600">
                Líneas pendientes en cartola: <strong>{pendingLines.length}</strong>
              </span>
            </div>
          </div>

          {/* ACCIÓN PRINCIPAL DE DISPARO */}
          {results.length === 0 && (
            <div className="bg-white border-2 border-dashed border-indigo-200 rounded-2xl p-8 text-center space-y-4">
              <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto text-indigo-600">
                <Sparkles className="w-7 h-7" />
              </div>
              <div className="max-w-md mx-auto">
                <h3 className="text-sm font-bold text-slate-800">
                  ¿Listo para analizar las glosas con el Agente 1?
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  El Agente 1 escaneará las {pendingLines.length} líneas de la cartola bancaria, descifrando abreviaturas crípticas, cargos de Transbank, gastos bancarios e impuestos.
                </p>
              </div>

              <button
                onClick={handleExecuteAgent1}
                disabled={isRunning || pendingLines.length === 0}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                {isRunning ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Analizando cartola...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    <span>Analizar cartola</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* RESULTADOS OBTENIDOS */}
          {results.length > 0 && (
            <div className="space-y-4">
              
              {/* TARJETAS DE ESTADÍSTICAS */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 text-xs">
                <div 
                  onClick={() => setSelectedFilter('TODOS')}
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    selectedFilter === 'TODOS' ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
                  }`}
                >
                  <div className="text-[10px] font-bold opacity-80 uppercase">Total Analizadas</div>
                  <div className="text-lg font-extrabold mt-0.5">{stats.total}</div>
                </div>

                <div 
                  onClick={() => setSelectedFilter('CLIENT_PAYMENT')}
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    selectedFilter === 'CLIENT_PAYMENT' ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-300'
                  }`}
                >
                  <div className="text-[10px] font-bold opacity-80 uppercase">Cobranzas (Clientes)</div>
                  <div className="text-lg font-extrabold mt-0.5 text-emerald-600 group-hover:text-emerald-700">{stats.clientPayments}</div>
                </div>

                <div 
                  onClick={() => setSelectedFilter('VENDOR_PAYMENT')}
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    selectedFilter === 'VENDOR_PAYMENT' ? 'bg-amber-600 text-white border-amber-600 shadow-sm' : 'bg-white text-slate-700 border-slate-200 hover:border-amber-300'
                  }`}
                >
                  <div className="text-[10px] font-bold opacity-80 uppercase">Proveedores</div>
                  <div className="text-lg font-extrabold mt-0.5">{stats.vendorPayments}</div>
                </div>

                <div 
                  onClick={() => setSelectedFilter('FINANCIAL_OPERATION')}
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    selectedFilter === 'FINANCIAL_OPERATION' ? 'bg-rose-600 text-white border-rose-600 shadow-sm' : 'bg-white text-slate-700 border-slate-200 hover:border-rose-300'
                  }`}
                >
                  <div className="text-[10px] font-bold opacity-80 uppercase">Comisiones Banco</div>
                  <div className="text-lg font-extrabold mt-0.5">{stats.financialOps}</div>
                </div>

                <div 
                  onClick={() => setSelectedFilter('TAX_OR_PAYROLL')}
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    selectedFilter === 'TAX_OR_PAYROLL' ? 'bg-purple-600 text-white border-purple-600 shadow-sm' : 'bg-white text-slate-700 border-slate-200 hover:border-purple-300'
                  }`}
                >
                  <div className="text-[10px] font-bold opacity-80 uppercase">F29 / Previred</div>
                  <div className="text-lg font-extrabold mt-0.5">{stats.taxesPayroll}</div>
                </div>

                <div className="p-3 rounded-xl border bg-slate-900 text-white border-slate-800">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Confianza IA</div>
                  <div className="text-lg font-extrabold mt-0.5 text-emerald-400">{stats.avgConfidence.toFixed(0)}%</div>
                </div>
              </div>

              {/* RE-EJECUTAR / FUENTE */}
              <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  Motor activo: <strong>{aiSource || 'Gemini 3.8 Flash'}</strong>
                </span>

                <button
                  onClick={handleExecuteAgent1}
                  disabled={isRunning}
                  className="text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
                  <span>Re-analizar pendientes</span>
                </button>
              </div>

              {/* TABLA DE RESULTADOS */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100/90 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2.5">Fecha</th>
                        <th className="px-3 py-2.5">Glosa Cruda Cartola</th>
                        <th className="px-3 py-2.5 text-right">Monto</th>
                        <th className="px-3 py-2.5">Clasificación IA</th>
                        <th className="px-3 py-2.5">Entidad / Contraparte</th>
                        <th className="px-3 py-2.5">Explicación & Destino</th>
                        <th className="px-3 py-2.5 text-center">Acción Directa</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredResults.map(result => {
                        const originalLine = pendingLines.find(l => l.id === result.transactionId);
                        const isDeposit = Number(originalLine?.deposit || 0) > 0;
                        const amount = isDeposit ? Number(originalLine?.deposit || 0) : Number(originalLine?.charge || 0);

                        return (
                          <tr key={result.transactionId} className="hover:bg-indigo-50/40 transition-colors">
                            <td className="px-3 py-2.5 whitespace-nowrap text-slate-600 font-medium">
                              {originalLine?.date || '-'}
                            </td>

                            <td className="px-3 py-2.5 font-mono text-[11px] text-slate-800 max-w-xs truncate" title={originalLine?.description}>
                              {originalLine?.description || '-'}
                            </td>

                            <td className="px-3 py-2.5 whitespace-nowrap text-right font-extrabold">
                              <span className={isDeposit ? 'text-emerald-700' : 'text-slate-800'}>
                                {isDeposit ? '+ ' : '- '}${amount.toLocaleString('es-CL')}
                              </span>
                            </td>

                            <td className="px-3 py-2.5 whitespace-nowrap">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                                result.classification === 'CLIENT_PAYMENT' 
                                  ? 'bg-emerald-100 text-emerald-800' 
                                  : result.classification === 'FINANCIAL_OPERATION'
                                  ? 'bg-rose-100 text-rose-800'
                                  : result.classification === 'TAX_OR_PAYROLL'
                                  ? 'bg-purple-100 text-purple-800'
                                  : result.classification === 'INTERNAL_TRANSFER'
                                  ? 'bg-teal-100 text-teal-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}>
                                {result.classification} ({Math.round(result.confidence * 100)}%)
                              </span>
                            </td>

                            <td className="px-3 py-2.5 text-slate-800">
                              <div className="font-bold truncate max-w-[150px]">
                                {result.detectedEntity?.name || 'No identificada'}
                              </div>
                              {result.detectedEntity?.rut && (
                                <div className="text-[10px] text-slate-500 font-mono">
                                  RUT: {result.detectedEntity.rut}
                                </div>
                              )}
                            </td>

                            <td className="px-3 py-2.5 text-slate-600 max-w-xs">
                              <div className="text-[11px] leading-tight">
                                {result.explanation}
                              </div>
                              <div className="text-[10px] font-bold text-indigo-700 mt-0.5 flex items-center gap-1">
                                <ArrowRight className="w-3 h-3" />
                                <span>Ruta: {result.routingTarget}</span>
                              </div>
                            </td>

                            <td className="px-3 py-2.5 text-center whitespace-nowrap">
                              {result.classification === 'FINANCIAL_OPERATION' ? (
                                <button
                                  onClick={() => handleCreateBankExpenseVoucher(result)}
                                  disabled={isCommitting === result.transactionId}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-[11px] shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                                  title="Crear Asiento de Gasto Bancario Directo (Debe Gastos Bancarios / Haber Banco)"
                                >
                                  {isCommitting === result.transactionId ? (
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Receipt className="w-3 h-3" />
                                  )}
                                  <span>Asentar Gasto</span>
                                </button>
                              ) : result.classification === 'CLIENT_PAYMENT' ? (
                                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200">
                                  Listo p/ Cobranza
                                </span>
                              ) : result.classification === 'TAX_OR_PAYROLL' ? (
                                <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-1 rounded-md border border-purple-200">
                                  Impuestos / Previred
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded-md border border-amber-200">
                                  Listo p/ Proveedores
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* FOOTER */}
        <div className="bg-slate-100 p-3 sm:p-4 border-t border-slate-200 flex items-center justify-between">
          <div className="text-[11px] text-slate-500">
            <strong>Human-in-the-Loop:</strong> Ningún asiento oficial se publica sin tu confirmación manual.
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
}
