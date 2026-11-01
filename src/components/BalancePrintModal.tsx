import React, { useState } from 'react';
import { Company } from '../types';
import { BalancePrintRow, BalanceTotals, BalanceResult, generateBalance8ColumnasPDF } from '../utils/balancePdfGenerator';
import { Printer, Download, X, CheckCircle2, Scale, AlertCircle } from 'lucide-react';

interface BalancePrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  company: Company;
  rows: BalancePrintRow[];
  subtotals: BalanceTotals;
  result: BalanceResult;
  finalTotals: BalanceTotals;
  periodFilter: string;
  dateFrom?: string;
  dateTo?: string;
  isFullyBalanced: boolean;
}

export const BalancePrintModal: React.FC<BalancePrintModalProps> = ({
  isOpen,
  onClose,
  company,
  rows,
  subtotals,
  result,
  finalTotals,
  periodFilter,
  dateFrom,
  dateTo,
  isFullyBalanced
}) => {
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  if (!isOpen) return null;

  const formatCLP = (num: number): string => {
    if (!num || num === 0) return '-';
    return '$' + Math.round(num).toLocaleString('es-CL');
  };

  const handleDownloadPDF = () => {
    try {
      setIsGenerating(true);
      const { fileName } = generateBalance8ColumnasPDF({
        company,
        rows,
        subtotals,
        result,
        finalTotals,
        periodFilter,
        dateFrom,
        dateTo,
        isFullyBalanced
      });

      setDownloadSuccess(`Se descargó exitosamente "${fileName}". Listo para imprimir en cualquier impresora física o guardar en digital.`);
      setTimeout(() => setDownloadSuccess(null), 5000);
    } catch (err: any) {
      console.error('Error generating PDF:', err);
      alert('Error al generar PDF: ' + (err.message || err));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleTriggerPrint = () => {
    // Generate PDF first as guaranteed output
    handleDownloadPDF();

    // Also attempt print via hidden iframe to bypass browser iframe sandbox limitations
    const printArea = document.getElementById('printable-balance-sheet');
    if (!printArea) return;

    try {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Balance 8 Columnas - ${company.name}</title>
              <style>
                @page { size: landscape; margin: 8mm; }
                body {
                  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                  font-size: 8px;
                  color: #0f172a;
                  margin: 0;
                  padding: 8px;
                }
                table { width: 100%; border-collapse: collapse; font-size: 8px; margin-top: 8px; }
                th, td { border: 1px solid #cbd5e1; padding: 3px 5px; }
                th { background-color: #0f172a; color: #ffffff; font-weight: bold; text-align: center; }
                .text-right { text-align: right; }
                .text-left { text-align: left; }
                .font-bold { font-weight: bold; }
                .bg-subtotals { background-color: #f1f5f9; font-weight: bold; }
                .bg-result { background-color: #ecfdf5; font-weight: bold; }
                .bg-totals { background-color: #e2e8f0; font-weight: bold; }
                .header-container { display: flex; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 6px; margin-bottom: 6px; }
                .signatures { margin-top: 30px; display: flex; justify-content: space-around; text-align: center; font-size: 8px; }
                .sig-line { width: 180px; border-top: 1px solid #0f172a; margin: 0 auto 4px auto; }
              </style>
            </head>
            <body>
              ${printArea.innerHTML}
              <script>
                window.onload = function() { window.print(); }
              </script>
            </body>
          </html>
        `);
        printWindow.document.close();
      } else {
        handleDownloadPDF();
      }
    } catch (e) {
      console.warn('Print window error:', e);
      handleDownloadPDF();
    }
  };

  const cleanPeriod = periodFilter === 'Todos' ? 'Ejercicio Completo 2026' : `Período ${periodFilter}`;
  const rangeStr = dateFrom && dateTo ? `Desde ${dateFrom} Hasta ${dateTo}` : 'Todo el Ejercicio';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-7xl max-h-[94vh] flex flex-col overflow-hidden text-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm leading-tight text-white flex items-center gap-2">
                <span>Impresión de Balance Tributario de 8 Columnas</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  isFullyBalanced ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                }`}>
                  {isFullyBalanced ? '✓ Cuadrado' : '⚠️ Descuadrado'}
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                {company.name} ({company.rut}) • {cleanPeriod}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadPDF}
              disabled={isGenerating}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
              title="Descargar archivo PDF oficial listo para imprimir en formato horizontal"
            >
              <Download className="w-4 h-4" />
              <span>{isGenerating ? 'Generando PDF...' : 'Descargar PDF (Horizontal)'}</span>
            </button>

            <button
              onClick={handleTriggerPrint}
              disabled={isGenerating}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
              title="Enviar a impresora o guardar mediante el diálogo de impresión"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir / Diálogo</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors ml-2 cursor-pointer"
              title="Cerrar ventana"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Feedback Banner */}
        {downloadSuccess && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-2.5 flex items-center gap-2 text-xs text-emerald-800 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-medium">{downloadSuccess}</span>
          </div>
        )}

        {/* Sheet Preview Area */}
        <div className="p-6 overflow-y-auto flex-1 bg-slate-100 flex justify-center">
          <div 
            id="printable-balance-sheet"
            className="w-full max-w-6xl bg-white rounded-xl shadow-md border border-slate-200/90 p-8 text-[11px] text-slate-800 space-y-4"
          >
            {/* Header Documento */}
            <div className="flex flex-col sm:flex-row justify-between items-start border-b-2 border-slate-900 pb-4 gap-3">
              <div>
                <h2 className="text-base font-extrabold text-slate-900 uppercase tracking-tight">{company.name}</h2>
                <p className="text-xs font-semibold text-slate-700">RUT: <span className="font-mono">{company.rut}</span></p>
                <p className="text-[11px] text-slate-500">Giro: {company.giro || 'Comercial'}</p>
                <p className="text-[11px] text-slate-500">Dirección: {company.address || '-'}, {company.comuna || ''}</p>
              </div>

              <div className="text-left sm:text-right space-y-0.5 shrink-0">
                <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">BALANCE TRIBUTARIO DE 8 COLUMNAS</h3>
                <p className="text-xs font-medium text-slate-600">{cleanPeriod}</p>
                <p className="text-[11px] text-slate-500">{rangeStr}</p>
                <p className="text-[11px] text-slate-400">Emisión: {new Date().toLocaleString('es-CL')}</p>
              </div>
            </div>

            {/* Tabla de 8 Columnas */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-slate-300 text-[10px]">
                <thead>
                  <tr className="bg-slate-900 text-white font-bold uppercase text-[9px] tracking-tight">
                    <th rowSpan={2} className="border border-slate-700 p-1.5 text-left w-20">Código</th>
                    <th rowSpan={2} className="border border-slate-700 p-1.5 text-left min-w-[180px]">Cuenta Contable</th>
                    <th colSpan={2} className="border border-slate-700 p-1 text-center bg-slate-800">1. Sumas ($)</th>
                    <th colSpan={2} className="border border-slate-700 p-1 text-center bg-slate-800">2. Saldos ($)</th>
                    <th colSpan={2} className="border border-slate-700 p-1 text-center bg-slate-800">3. Inventario ($)</th>
                    <th colSpan={2} className="border border-slate-700 p-1 text-center bg-slate-800">4. Resultados ($)</th>
                  </tr>
                  <tr className="bg-slate-800 text-slate-200 font-semibold text-[9px]">
                    <th className="border border-slate-700 p-1 text-right w-24">Débito</th>
                    <th className="border border-slate-700 p-1 text-right w-24">Crédito</th>
                    <th className="border border-slate-700 p-1 text-right w-24">Deudor</th>
                    <th className="border border-slate-700 p-1 text-right w-24">Acreedor</th>
                    <th className="border border-slate-700 p-1 text-right w-24">Activo</th>
                    <th className="border border-slate-700 p-1 text-right w-24">Pasivo</th>
                    <th className="border border-slate-700 p-1 text-right w-24">Pérdida</th>
                    <th className="border border-slate-700 p-1 text-right w-24">Ganancia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {rows.map((row, idx) => (
                    <tr key={row.code || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'}>
                      <td className="border border-slate-300 p-1 font-mono text-slate-600 font-medium">{row.code}</td>
                      <td className="border border-slate-300 p-1 text-slate-800 font-medium truncate max-w-[220px]" title={row.name}>{row.name}</td>
                      <td className="border border-slate-300 p-1 text-right font-mono">{row.sumDebit > 0 ? formatCLP(row.sumDebit) : '-'}</td>
                      <td className="border border-slate-300 p-1 text-right font-mono">{row.sumCredit > 0 ? formatCLP(row.sumCredit) : '-'}</td>
                      <td className="border border-slate-300 p-1 text-right font-mono">{row.balDebit > 0 ? formatCLP(row.balDebit) : '-'}</td>
                      <td className="border border-slate-300 p-1 text-right font-mono">{row.balCredit > 0 ? formatCLP(row.balCredit) : '-'}</td>
                      <td className="border border-slate-300 p-1 text-right font-mono">{row.invAsset > 0 ? formatCLP(row.invAsset) : '-'}</td>
                      <td className="border border-slate-300 p-1 text-right font-mono">{row.invLiability > 0 ? formatCLP(row.invLiability) : '-'}</td>
                      <td className="border border-slate-300 p-1 text-right font-mono">{row.resLoss > 0 ? formatCLP(row.resLoss) : '-'}</td>
                      <td className="border border-slate-300 p-1 text-right font-mono">{row.resGain > 0 ? formatCLP(row.resGain) : '-'}</td>
                    </tr>
                  ))}

                  {/* Fila Subtotales */}
                  <tr className="bg-slate-100 font-bold border-t-2 border-slate-400">
                    <td colSpan={2} className="border border-slate-300 p-1.5 text-left uppercase text-slate-900">
                      SUBTOTALES
                    </td>
                    <td className="border border-slate-300 p-1.5 text-right font-mono text-slate-900">{formatCLP(subtotals.sumDebit)}</td>
                    <td className="border border-slate-300 p-1.5 text-right font-mono text-slate-900">{formatCLP(subtotals.sumCredit)}</td>
                    <td className="border border-slate-300 p-1.5 text-right font-mono text-slate-900">{formatCLP(subtotals.balDebit)}</td>
                    <td className="border border-slate-300 p-1.5 text-right font-mono text-slate-900">{formatCLP(subtotals.balCredit)}</td>
                    <td className="border border-slate-300 p-1.5 text-right font-mono text-slate-900">{formatCLP(subtotals.invAsset)}</td>
                    <td className="border border-slate-300 p-1.5 text-right font-mono text-slate-900">{formatCLP(subtotals.invLiability)}</td>
                    <td className="border border-slate-300 p-1.5 text-right font-mono text-slate-900">{formatCLP(subtotals.resLoss)}</td>
                    <td className="border border-slate-300 p-1.5 text-right font-mono text-slate-900">{formatCLP(subtotals.resGain)}</td>
                  </tr>

                  {/* Fila Resultado del Ejercicio */}
                  <tr className={result.isUtilidad ? 'bg-emerald-50/80 font-bold' : 'bg-rose-50/80 font-bold'}>
                    <td colSpan={2} className={`border border-slate-300 p-1.5 text-left uppercase ${result.isUtilidad ? 'text-emerald-800' : 'text-rose-800'}`}>
                      RESULTADO DEL EJERCICIO ({result.isUtilidad ? 'UTILIDAD' : 'PÉRDIDA'})
                    </td>
                    <td className="border border-slate-300 p-1.5 text-right font-mono">-</td>
                    <td className="border border-slate-300 p-1.5 text-right font-mono">-</td>
                    <td className="border border-slate-300 p-1.5 text-right font-mono">-</td>
                    <td className="border border-slate-300 p-1.5 text-right font-mono">-</td>
                    <td className="border border-slate-300 p-1.5 text-right font-mono">{result.invAsset > 0 ? formatCLP(result.invAsset) : '-'}</td>
                    <td className="border border-slate-300 p-1.5 text-right font-mono">{result.invLiability > 0 ? formatCLP(result.invLiability) : '-'}</td>
                    <td className="border border-slate-300 p-1.5 text-right font-mono">{result.resLoss > 0 ? formatCLP(result.resLoss) : '-'}</td>
                    <td className="border border-slate-300 p-1.5 text-right font-mono">{result.resGain > 0 ? formatCLP(result.resGain) : '-'}</td>
                  </tr>

                  {/* Fila Totales Iguales */}
                  <tr className="bg-slate-200 font-extrabold border-t border-b-2 border-slate-500">
                    <td colSpan={2} className="border border-slate-400 p-1.5 text-left uppercase text-slate-900">
                      TOTALES IGUALES
                    </td>
                    <td className="border border-slate-400 p-1.5 text-right font-mono text-slate-900">{formatCLP(finalTotals.sumDebit)}</td>
                    <td className="border border-slate-400 p-1.5 text-right font-mono text-slate-900">{formatCLP(finalTotals.sumCredit)}</td>
                    <td className="border border-slate-400 p-1.5 text-right font-mono text-slate-900">{formatCLP(finalTotals.balDebit)}</td>
                    <td className="border border-slate-400 p-1.5 text-right font-mono text-slate-900">{formatCLP(finalTotals.balCredit)}</td>
                    <td className="border border-slate-400 p-1.5 text-right font-mono text-slate-900">{formatCLP(finalTotals.invAsset)}</td>
                    <td className="border border-slate-400 p-1.5 text-right font-mono text-slate-900">{formatCLP(finalTotals.invLiability)}</td>
                    <td className="border border-slate-400 p-1.5 text-right font-mono text-slate-900">{formatCLP(finalTotals.resLoss)}</td>
                    <td className="border border-slate-400 p-1.5 text-right font-mono text-slate-900">{formatCLP(finalTotals.resGain)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Firmas Oficiales */}
            <div className="pt-8 flex flex-col sm:flex-row justify-around items-center text-center gap-6 text-[10px] text-slate-600">
              <div className="space-y-1">
                <div className="w-48 border-t border-slate-800 mx-auto"></div>
                <div className="font-bold text-slate-900 uppercase">FIRMA REPRESENTANTE LEGAL</div>
                <div>RUT: {company.legalRepRut || company.rut || '-'}</div>
              </div>

              <div className="space-y-1">
                <div className="w-48 border-t border-slate-800 mx-auto"></div>
                <div className="font-bold text-slate-900 uppercase">FIRMA CONTADOR GENERAL</div>
                <div>REGISTRO COLEGIO DE CONTADORES DE CHILE</div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-white border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <div>
            Mostrando <strong>{rows.length}</strong> cuentas contables con saldos procesados.
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadPDF}
              disabled={isGenerating}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Descargar PDF</span>
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg transition-colors cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
