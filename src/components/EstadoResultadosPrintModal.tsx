import React, { useState } from 'react';
import { Company } from '../types';
import { generateEstadoResultadosPDF, EstadoResultadosPDFOptions } from '../utils/estadoResultadosPdfGenerator';
import { triggerIframePrint } from '../utils/printUtils';
import { Printer, Download, X, FileText, CheckCircle2 } from 'lucide-react';

interface EstadoResultadosPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  company: Company;
  selectedYear: number;
  cutoffMonth: number;
  showAccountDetails: boolean;
  statementData: EstadoResultadosPDFOptions['statementData'];
}

export const EstadoResultadosPrintModal: React.FC<EstadoResultadosPrintModalProps> = ({
  isOpen,
  onClose,
  company,
  selectedYear,
  cutoffMonth,
  showAccountDetails,
  statementData
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  const cutoffMonthName = monthNames[cutoffMonth - 1] || 'Diciembre';
  const periodLabel = `Acumulado al ${cutoffMonthName} de ${selectedYear} (Ene - ${cutoffMonthName.slice(0, 3)})`;

  const formatCLP = (num: number): string => {
    if (num === undefined || num === null || num === 0) return '$0';
    return (num < 0 ? '-$' : '$') + Math.abs(Math.round(num)).toLocaleString('es-CL');
  };

  const handleDownloadPDF = () => {
    try {
      setIsGenerating(true);
      const { fileName, doc } = generateEstadoResultadosPDF({
        company,
        selectedYear,
        cutoffMonth,
        showAccountDetails,
        statementData
      });
      doc.save(fileName);
      setDownloadSuccess(`Se descargó con éxito "${fileName}".`);
      setTimeout(() => setDownloadSuccess(null), 4000);
    } catch (err: any) {
      console.error('Error generando PDF de Estado de Resultados:', err);
      alert('Error al generar PDF: ' + (err.message || err));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleIframePrint = () => {
    const htmlContent = `
      <div class="header-box">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <h2 style="font-size: 14px; margin: 0; color: #0f172a;">ESTADO DE RESULTADOS POR FUNCIÓN (IFRS / NIC 1)</h2>
            <p style="font-weight: bold; font-size: 11px; margin-top: 4px; color: #1e293b;">${(company.name || '').toUpperCase()}</p>
            <p style="font-size: 10px; color: #475569;">RUT: ${company.rut || 'S/R'} &bull; GIRO: ${company.giro || 'S/G'}</p>
          </div>
          <div style="text-align: right; font-size: 10px; color: #334155;">
            <p style="font-weight: bold;">${periodLabel}</p>
            <p>Moneda: CLP &bull; Régimen: ${company.regimenTributario || '14 D3 PROPYME'}</p>
            <p>Fecha Emisión: ${new Date().toLocaleString('es-CL')}</p>
          </div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>CONCEPTO / RUBRO IFRS (NIC 1)</th>
            <th class="text-right" style="width: 140px;">MONTO ACUMULADO ($)</th>
          </tr>
        </thead>
        <tbody>
          <tr style="font-weight: bold; background-color: #f8fafc;">
            <td>1. Ingresos de Actividades Ordinarias</td>
            <td class="text-right">${formatCLP(statementData.rubros.ingresosOperacionales.total)}</td>
          </tr>
          <tr style="font-weight: bold; background-color: #f8fafc;">
            <td>2. Costos de Ventas / Explotación</td>
            <td class="text-right" style="color: #b91c1c;">${formatCLP(-Math.abs(statementData.rubros.costosVentas.total))}</td>
          </tr>
          <tr style="font-weight: bold; background-color: #f1f5f9;">
            <td>(=) MARGEN OPERACIONAL (BRUTO)</td>
            <td class="text-right">${formatCLP(statementData.totals.grossMargin)}</td>
          </tr>
          <tr>
            <td>3. Gastos de Remuneraciones y Personal</td>
            <td class="text-right" style="color: #b91c1c;">${formatCLP(-Math.abs(statementData.rubros.gastosRemuneraciones.total))}</td>
          </tr>
          <tr>
            <td>4. Gastos de Administración y Ventas</td>
            <td class="text-right" style="color: #b91c1c;">${formatCLP(-Math.abs(statementData.rubros.gastosAdministracion.total))}</td>
          </tr>
          <tr>
            <td>5. Depreciación y Amortización del Ejercicio</td>
            <td class="text-right" style="color: #b91c1c;">${formatCLP(-Math.abs(statementData.rubros.depreciacionAmort.total))}</td>
          </tr>
          <tr style="font-weight: bold; background-color: #f1f5f9;">
            <td>(=) RESULTADO OPERACIONAL (EBIT)</td>
            <td class="text-right">${formatCLP(statementData.totals.operatingResult)}</td>
          </tr>
          <tr>
            <td>6. Ingresos Financieros</td>
            <td class="text-right">${formatCLP(statementData.rubros.ingresosFinancieros.total)}</td>
          </tr>
          <tr>
            <td>7. Gastos Financieros</td>
            <td class="text-right" style="color: #b91c1c;">${formatCLP(-Math.abs(statementData.rubros.costosFinancieros.total))}</td>
          </tr>
          <tr>
            <td>8. Otros Ingresos Operacionales / No Operacionales</td>
            <td class="text-right">${formatCLP(statementData.rubros.otrosIngresosOp.total)}</td>
          </tr>
          <tr>
            <td>9. Otros Gastos No Operacionales</td>
            <td class="text-right" style="color: #b91c1c;">${formatCLP(-Math.abs(statementData.rubros.otrosGastosNoOp.total))}</td>
          </tr>
          <tr style="font-weight: bold; background-color: #f1f5f9;">
            <td>(=) GANANCIA (PÉRDIDA) ANTES DE IMPUESTOS</td>
            <td class="text-right">${formatCLP(statementData.totals.profitBeforeTax)}</td>
          </tr>
          <tr>
            <td>10. Gasto por Impuesto a la Renta</td>
            <td class="text-right" style="color: #b91c1c;">${formatCLP(-Math.abs(statementData.rubros.impuestoRenta.total))}</td>
          </tr>
          <tr style="font-weight: bold; background-color: ${statementData.totals.isProfit ? '#f0fdf4' : '#fef2f2'}; font-size: 11px;">
            <td>(=) RESULTADO NETO DEL EJERCICIO (${statementData.totals.isProfit ? 'UTILIDAD NETA' : 'PÉRDIDA NETA'})</td>
            <td class="text-right" style="color: ${statementData.totals.isProfit ? '#15803d' : '#b91c1c'};">${formatCLP(statementData.totals.netIncome)}</td>
          </tr>
        </tbody>
      </table>

      <div class="footer-box" style="margin-top: 40px; display: flex; justify-content: space-around;">
        <div style="text-align: center; width: 40%; border-top: 1px solid #cbd5e1; padding-top: 6px;">
          <p style="font-weight: bold; margin: 0;">REPRESENTANTE LEGAL</p>
          <p style="font-size: 8px; color: #64748b; margin: 2px 0 0 0;">RUT: ${company.legalRepRut || company.rut}</p>
        </div>
        <div style="text-align: center; width: 40%; border-top: 1px solid #cbd5e1; padding-top: 6px;">
          <p style="font-weight: bold; margin: 0;">CONTADOR GENERAL / AUDITOR</p>
          <p style="font-size: 8px; color: #64748b; margin: 2px 0 0 0;">Reg. Colegio de Contadores de Chile</p>
        </div>
      </div>
    `;

    triggerIframePrint({
      title: `Estado de Resultados - ${company.name}`,
      htmlContent
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in duration-150">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-2xs">
              <FileText className="w-5 h-5 text-indigo-100" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Estado de Resultados IFRS / NIC 1 (Vista de Impresión)
              </h2>
              <p className="text-xs text-slate-500">
                {company.name} &bull; RUT: {company.rut} &bull; {periodLabel}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadPDF}
              disabled={isGenerating}
              className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
              title="Descargar PDF Oficial de Estado de Resultados"
            >
              <Download className="w-3.5 h-3.5 text-indigo-300" />
              <span>{isGenerating ? 'Generando...' : 'Descargar PDF'}</span>
            </button>

            <button
              onClick={handleIframePrint}
              className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-xs font-semibold rounded-lg border border-indigo-300 flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
              title="Imprimir documento"
            >
              <Printer className="w-3.5 h-3.5 text-indigo-700" />
              <span>Imprimir / Diálogo</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {downloadSuccess && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-2.5 text-xs font-semibold text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{downloadSuccess}</span>
          </div>
        )}

        {/* Content Preview */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4 text-xs font-mono">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
              <span className="font-bold text-slate-900">1. INGRESOS DE ACTIVIDADES ORDINARIAS</span>
              <span className="font-bold text-slate-900">{formatCLP(statementData.rubros.ingresosOperacionales.total)}</span>
            </div>
            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
              <span className="font-bold text-slate-900">2. COSTO DE VENTAS / EXPLOTACIÓN</span>
              <span className="font-bold text-rose-700">{formatCLP(-Math.abs(statementData.rubros.costosVentas.total))}</span>
            </div>
            <div className="flex justify-between items-center bg-indigo-50/80 p-2 rounded-lg font-bold text-indigo-950">
              <span>(=) MARGEN OPERACIONAL (BRUTO)</span>
              <span>{formatCLP(statementData.totals.grossMargin)}</span>
            </div>
            <div className="flex justify-between items-center border-b border-slate-200 pb-2 pt-2">
              <span className="font-bold text-slate-900">(=) RESULTADO OPERACIONAL (EBIT)</span>
              <span className="font-bold text-slate-900">{formatCLP(statementData.totals.operatingResult)}</span>
            </div>
            <div className="flex justify-between items-center bg-emerald-50 p-3 rounded-lg font-bold text-emerald-950 text-sm">
              <span>(=) RESULTADO NETO DEL EJERCICIO</span>
              <span>{formatCLP(statementData.totals.netIncome)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
