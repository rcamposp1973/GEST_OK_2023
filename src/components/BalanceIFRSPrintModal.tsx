import React, { useState } from 'react';
import { Company } from '../types';
import { IFRSPrintParentRubro, generateBalanceIFRSPDF } from '../utils/balanceIfrsPdfGenerator';
import { triggerIframePrint } from '../utils/printUtils';
import { Printer, Download, X, CheckCircle2, Scale, AlertCircle } from 'lucide-react';

interface BalanceIFRSPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  company: Company;
  activosCorrientes: IFRSPrintParentRubro[];
  activosNoCorrientes: IFRSPrintParentRubro[];
  totalActivosCorrientes: number;
  totalActivosNoCorrientes: number;
  totalActivos: number;
  pasivosCorrientes: IFRSPrintParentRubro[];
  pasivosNoCorrientes: IFRSPrintParentRubro[];
  totalPasivosCorrientes: number;
  totalPasivosNoCorrientes: number;
  totalPasivos: number;
  patrimonioRubros: IFRSPrintParentRubro[];
  resultadoEjercicio: number;
  totalPatrimonioNeto: number;
  totalPasivoMasPatrimonio: number;
  periodFilter: string;
  dateFrom?: string;
  dateTo?: string;
  isBalanced: boolean;
}

export const BalanceIFRSPrintModal: React.FC<BalanceIFRSPrintModalProps> = ({
  isOpen,
  onClose,
  company,
  activosCorrientes,
  activosNoCorrientes,
  totalActivosCorrientes,
  totalActivosNoCorrientes,
  totalActivos,
  pasivosCorrientes,
  pasivosNoCorrientes,
  totalPasivosCorrientes,
  totalPasivosNoCorrientes,
  totalPasivos,
  patrimonioRubros,
  resultadoEjercicio,
  totalPatrimonioNeto,
  totalPasivoMasPatrimonio,
  periodFilter,
  dateFrom,
  dateTo,
  isBalanced
}) => {
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  if (!isOpen) return null;

  const formatCLP = (num: number): string => {
    if (!num || num === 0) return '$0';
    return '$' + Math.round(num).toLocaleString('es-CL');
  };

  const handleDownloadPDF = () => {
    try {
      setIsGenerating(true);
      const { fileName, doc } = generateBalanceIFRSPDF({
        company,
        activosCorrientes,
        activosNoCorrientes,
        totalActivosCorrientes,
        totalActivosNoCorrientes,
        totalActivos,
        pasivosCorrientes,
        pasivosNoCorrientes,
        totalPasivosCorrientes,
        totalPasivosNoCorrientes,
        totalPasivos,
        patrimonioRubros,
        resultadoEjercicio,
        totalPatrimonioNeto,
        totalPasivoMasPatrimonio,
        periodFilter,
        dateFrom,
        dateTo,
        isBalanced
      });
      doc.save(fileName);
      setDownloadSuccess(`Documento descargado con éxito: ${fileName}`);
      setTimeout(() => setDownloadSuccess(null), 4000);
    } catch (err) {
      console.error('Error generando PDF IFRS:', err);
      alert('Hubo un error al generar el PDF del Balance IFRS.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrintBrowser = () => {
    handleDownloadPDF();
    const printElement = document.getElementById('printable-ifrs-balance');
    if (printElement) {
      triggerIframePrint({
        title: `Balance IFRS - ${company.name}`,
        htmlContent: printElement.innerHTML
      });
    }
  };

  const periodLabel = periodFilter === 'Todos' ? 'Ejercicio Completo (Acumulado)' : `Período ${periodFilter} (Acumulado a la fecha)`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in duration-150">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center text-white shadow-2xs">
              <Scale className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>Estado de Situación Financiera Clasificado IFRS / FECU</span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold border ${
                  isBalanced
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : 'bg-rose-50 text-rose-800 border-rose-300'
                }`}>
                  {isBalanced ? '✓ Cuadrado' : '⚠️ Descuadrado'}
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                {company.name} • RUT: {company.rut} • {periodLabel}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadPDF}
              disabled={isGenerating}
              className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
              title="Descargar Balance Clasificado en formato PDF oficial"
            >
              <Download className="w-3.5 h-3.5 text-indigo-300" />
              <span>{isGenerating ? 'Generando...' : 'Descargar PDF'}</span>
            </button>

            <button
              onClick={handlePrintBrowser}
              className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
              title="Imprimir"
            >
              <Printer className="w-3.5 h-3.5 text-slate-600" />
              <span>Imprimir</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
              title="Cerrar vista preliminar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {downloadSuccess && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-2 flex items-center gap-2 text-xs font-semibold text-emerald-800">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{downloadSuccess}</span>
          </div>
        )}

        {/* Printable Preview Sheet */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-100/60 font-sans">
          <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm max-w-3xl mx-auto text-slate-800">
            
            {/* Sheet Header */}
            <div className="border-b border-slate-200 pb-4 mb-4 flex justify-between items-start">
              <div>
                <h1 className="text-sm font-black text-slate-900 tracking-tight uppercase">
                  ESTADO DE SITUACIÓN FINANCIERA (BALANCE CLASIFICADO IFRS)
                </h1>
                <p className="text-xs font-bold text-slate-700 mt-1">{company.name}</p>
                <p className="text-[11px] text-slate-500">RUT: {company.rut} • {company.giro || 'Servicios'}</p>
                <p className="text-[11px] text-slate-500">{company.address || 'Chile'}</p>
              </div>
              <div className="text-right text-[11px] text-slate-500">
                <p className="font-bold text-slate-800">{periodLabel}</p>
                <p>{dateFrom && dateTo ? `${dateFrom} al ${dateTo}` : 'Corte acumulado'}</p>
                <p className="text-[10px] text-slate-400 mt-1">Valores expresados en Pesos Chilenos ($)</p>
              </div>
            </div>

            {/* Activos Section */}
            <div className="mb-6">
              <div className="bg-slate-900 text-white px-3 py-1.5 rounded text-xs font-bold flex justify-between items-center mb-2">
                <span>1. TOTAL ACTIVOS</span>
                <span className="font-mono text-amber-300">{formatCLP(totalActivos)}</span>
              </div>

              {/* 1.1 Activos Corrientes */}
              <div className="mb-3 pl-2">
                <div className="flex justify-between items-center text-xs font-bold text-indigo-950 border-b border-indigo-100 pb-1 mb-1.5">
                  <span>1.1. ACTIVOS CORRIENTES (CIRCULANTES)</span>
                  <span className="font-mono">{formatCLP(totalActivosCorrientes)}</span>
                </div>
                {activosCorrientes.map(rubro => (
                  <div key={rubro.id} className="text-xs pl-3 py-1">
                    <div className="flex justify-between items-center font-medium text-slate-800">
                      <span>{rubro.code} - {rubro.name}</span>
                      <span className="font-mono font-semibold">{formatCLP(rubro.total)}</span>
                    </div>
                    {rubro.accounts.map(acc => (
                      <div key={acc.id} className="flex justify-between items-center text-[11px] text-slate-500 pl-4 py-0.5">
                        <span>{acc.code} {acc.name}</span>
                        <span className="font-mono">{formatCLP(acc.balance)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* 1.2 Activos No Corrientes */}
              <div className="pl-2">
                <div className="flex justify-between items-center text-xs font-bold text-indigo-950 border-b border-indigo-100 pb-1 mb-1.5">
                  <span>1.2. ACTIVOS NO CORRIENTES (FIJOS E INTANGIBLES)</span>
                  <span className="font-mono">{formatCLP(totalActivosNoCorrientes)}</span>
                </div>
                {activosNoCorrientes.map(rubro => (
                  <div key={rubro.id} className="text-xs pl-3 py-1">
                    <div className="flex justify-between items-center font-medium text-slate-800">
                      <span>{rubro.code} - {rubro.name}</span>
                      <span className="font-mono font-semibold">{formatCLP(rubro.total)}</span>
                    </div>
                    {rubro.accounts.map(acc => (
                      <div key={acc.id} className="flex justify-between items-center text-[11px] text-slate-500 pl-4 py-0.5">
                        <span>{acc.code} {acc.name}</span>
                        <span className="font-mono">{formatCLP(acc.balance)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* Pasivos Section */}
            <div className="mb-6">
              <div className="bg-slate-900 text-white px-3 py-1.5 rounded text-xs font-bold flex justify-between items-center mb-2">
                <span>2. TOTAL PASIVOS</span>
                <span className="font-mono text-amber-300">{formatCLP(totalPasivos)}</span>
              </div>

              {/* 2.1 Pasivos Corrientes */}
              <div className="mb-3 pl-2">
                <div className="flex justify-between items-center text-xs font-bold text-rose-950 border-b border-rose-100 pb-1 mb-1.5">
                  <span>2.1. PASIVOS CORRIENTES (CORTO PLAZO)</span>
                  <span className="font-mono">{formatCLP(totalPasivosCorrientes)}</span>
                </div>
                {pasivosCorrientes.map(rubro => (
                  <div key={rubro.id} className="text-xs pl-3 py-1">
                    <div className="flex justify-between items-center font-medium text-slate-800">
                      <span>{rubro.code} - {rubro.name}</span>
                      <span className="font-mono font-semibold">{formatCLP(rubro.total)}</span>
                    </div>
                    {rubro.accounts.map(acc => (
                      <div key={acc.id} className="flex justify-between items-center text-[11px] text-slate-500 pl-4 py-0.5">
                        <span>{acc.code} {acc.name}</span>
                        <span className="font-mono">{formatCLP(acc.balance)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* 2.2 Pasivos No Corrientes */}
              <div className="pl-2">
                <div className="flex justify-between items-center text-xs font-bold text-rose-950 border-b border-rose-100 pb-1 mb-1.5">
                  <span>2.2. PASIVOS NO CORRIENTES (LARGO PLAZO)</span>
                  <span className="font-mono">{formatCLP(totalPasivosNoCorrientes)}</span>
                </div>
                {pasivosNoCorrientes.map(rubro => (
                  <div key={rubro.id} className="text-xs pl-3 py-1">
                    <div className="flex justify-between items-center font-medium text-slate-800">
                      <span>{rubro.code} - {rubro.name}</span>
                      <span className="font-mono font-semibold">{formatCLP(rubro.total)}</span>
                    </div>
                    {rubro.accounts.map(acc => (
                      <div key={acc.id} className="flex justify-between items-center text-[11px] text-slate-500 pl-4 py-0.5">
                        <span>{acc.code} {acc.name}</span>
                        <span className="font-mono">{formatCLP(acc.balance)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* Patrimonio Section */}
            <div className="mb-6">
              <div className="bg-slate-900 text-white px-3 py-1.5 rounded text-xs font-bold flex justify-between items-center mb-2">
                <span>3. TOTAL PATRIMONIO NETO</span>
                <span className="font-mono text-emerald-300">{formatCLP(totalPatrimonioNeto)}</span>
              </div>

              <div className="pl-2">
                {patrimonioRubros.map(rubro => (
                  <div key={rubro.id} className="text-xs pl-3 py-1">
                    <div className="flex justify-between items-center font-medium text-slate-800">
                      <span>{rubro.code} - {rubro.name}</span>
                      <span className="font-mono font-semibold">{formatCLP(rubro.total)}</span>
                    </div>
                    {rubro.accounts.map(acc => (
                      <div key={acc.id} className="flex justify-between items-center text-[11px] text-slate-500 pl-4 py-0.5">
                        <span>{acc.code} {acc.name}</span>
                        <span className="font-mono">{formatCLP(acc.balance)}</span>
                      </div>
                    ))}
                  </div>
                ))}

                <div className="flex justify-between items-center text-xs font-bold text-emerald-950 pl-3 py-1.5 mt-1 border-t border-emerald-100 bg-emerald-50/50 rounded">
                  <span>2304000 - Resultado del Ejercicio (Ganancia / Pérdida Acumulada)</span>
                  <span className={`font-mono ${resultadoEjercicio >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {formatCLP(resultadoEjercicio)}
                  </span>
                </div>
              </div>
            </div>

            {/* Total Pasivo + Patrimonio Neto */}
            <div className="bg-slate-950 text-white px-4 py-2.5 rounded-lg text-xs font-black flex justify-between items-center mb-6">
              <span>TOTAL PASIVO + PATRIMONIO NETO (2 + 3)</span>
              <span className="font-mono text-amber-300 text-sm">{formatCLP(totalPasivoMasPatrimonio)}</span>
            </div>

            {/* Cuadratura Indicator */}
            <div className={`p-2.5 rounded-lg border text-xs font-bold flex items-center gap-2 mb-8 ${
              isBalanced ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-rose-50 border-rose-300 text-rose-900'
            }`}>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>
                {isBalanced
                  ? 'ECUACIÓN PATRIMONIAL CUADRADA: TOTAL ACTIVOS ES IDÉNTICO A TOTAL PASIVOS MÁS PATRIMONIO NETO.'
                  : 'ADVERTENCIA: DESCUADRE EN ECUACIÓN PATRIMONIAL.'}
              </span>
            </div>

            {/* Signature Area */}
            <div className="grid grid-cols-2 gap-8 pt-8 border-t border-slate-300 text-center text-xs">
              <div>
                <div className="border-b border-slate-400 w-3/4 mx-auto mb-2"></div>
                <p className="font-bold text-slate-800">REPRESENTANTE LEGAL</p>
                <p className="text-[11px] text-slate-500">RUT: {company.rut}</p>
              </div>
              <div>
                <div className="border-b border-slate-400 w-3/4 mx-auto mb-2"></div>
                <p className="font-bold text-slate-800">CONTADOR GENERAL</p>
                <p className="text-[11px] text-slate-500">Colegio de Contadores de Chile</p>
              </div>
            </div>

          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span>Formato Oficial IFRS / NIC 1 - Cumplimiento Normativo CMF & SII</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-semibold rounded-lg border border-slate-300 transition-colors shadow-2xs cursor-pointer"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
};
