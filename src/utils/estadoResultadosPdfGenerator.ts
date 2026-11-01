import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Company } from '../types';

export interface EstadoResultadosPDFOptions {
  company: Company;
  selectedYear: number;
  cutoffMonth: number;
  showAccountDetails: boolean;
  statementData: {
    cutoffLimit: number;
    rubros: {
      ingresosOperacionales: any;
      costosVentas: any;
      gastosRemuneraciones: any;
      gastosAdministracion: any;
      depreciacionAmort: any;
      ingresosFinancieros: any;
      costosFinancieros: any;
      otrosIngresosOp: any;
      otrosGastosNoOp: any;
      impuestoRenta: any;
    };
    totals: {
      opRevenues: number;
      costOfSales: number;
      grossMargin: number;
      grossMarginPercent: string;
      opExpenses: number;
      operatingResult: number;
      operatingMarginPercent: string;
      finInc: number;
      finCosts: number;
      otherInc: number;
      otherExp: number;
      profitBeforeTax: number;
      incomeTax: number;
      netIncome: number;
      netMarginPercent: string;
      isProfit: boolean;
    };
  };
}

export function generateEstadoResultadosPDF(options: EstadoResultadosPDFOptions): { fileName: string; doc: jsPDF } {
  const { company, selectedYear, cutoffMonth, showAccountDetails, statementData } = options;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  const cutoffMonthName = monthNames[cutoffMonth - 1] || 'Diciembre';
  const periodLabel = `Período: Acumulado al ${cutoffMonthName} de ${selectedYear} (Ene - ${cutoffMonthName.slice(0, 3)})`;
  const emissionDate = new Date().toLocaleString('es-CL');

  // Encabezado principal
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('ESTADO DE RESULTADOS POR FUNCIÓN (IFRS / NIC 1)', 14, 15);

  // Datos Empresa (Límite 105 mm)
  let yLeft = 21;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  const nameLines = doc.splitTextToSize(`RAZÓN SOCIAL: ${(company.name || '').toUpperCase()}`, 105);
  doc.text(nameLines, 14, yLeft);
  yLeft += nameLines.length * 3.8;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text(`RUT: ${company.rut || 'S/R'}`, 14, yLeft);
  yLeft += 3.8;

  if (company.giro) {
    const giroLines = doc.splitTextToSize(`GIRO: ${company.giro.toUpperCase()}`, 105);
    doc.setFont('helvetica', 'normal');
    doc.text(giroLines, 14, yLeft);
    yLeft += giroLines.length * 3.8;
  }

  // Datos Derecha (Período y Emisión)
  const xRight = pageWidth - 14;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text(periodLabel, xRight, 21, { align: 'right' });

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(`MONEDA: PESOS CHILENOS (CLP)`, xRight, 25.8, { align: 'right' });
  doc.text(`FECHA EMISIÓN: ${emissionDate}`, xRight, 29.6, { align: 'right' });
  doc.text(`RÉGIMEN: ${company.regimenTributario || '14 D3 PROPYME GENERAL'}`, xRight, 33.4, { align: 'right' });

  const tableStartY = Math.max(yLeft + 4, 38);

  const formatCLP = (num: number): string => {
    if (num === undefined || num === null) return '$0';
    if (num === 0) return '$0';
    return (num < 0 ? '-$' : '$') + Math.abs(Math.round(num)).toLocaleString('es-CL');
  };

  const tableBody: (string | { content: string; styles?: any })[][] = [];

  const addRubroRows = (rubroName: string, rubroData: any, isExpense = false) => {
    const totalVal = isExpense ? -Math.abs(rubroData.total) : rubroData.total;
    tableBody.push([
      { content: rubroName, styles: { fontStyle: 'bold', textColor: [15, 23, 42] } },
      { content: formatCLP(totalVal), styles: { fontStyle: 'bold', halign: 'right', textColor: totalVal < 0 ? [185, 28, 28] : [15, 23, 42] } }
    ]);

    if (showAccountDetails && rubroData.accounts && rubroData.accounts.length > 0) {
      rubroData.accounts.forEach((acc: any) => {
        const accVal = isExpense ? -Math.abs(acc.total) : acc.total;
        tableBody.push([
          { content: `   └ ${acc.code} - ${acc.name}`, styles: { textColor: [71, 85, 105], fontSize: 7.5 } },
          { content: formatCLP(accVal), styles: { halign: 'right', textColor: accVal < 0 ? [185, 28, 28] : [71, 85, 105], fontSize: 7.5 } }
        ]);
      });
    }
  };

  const addTotalSectionRow = (label: string, value: number, isSubtotal = false) => {
    tableBody.push([
      {
        content: label,
        styles: {
          fontStyle: 'bold',
          textColor: isSubtotal ? [30, 41, 59] : (value >= 0 ? [22, 101, 52] : [153, 27, 27]),
          fillColor: isSubtotal ? [241, 245, 249] : (value >= 0 ? [240, 253, 244] : [254, 242, 242])
        }
      },
      {
        content: formatCLP(value),
        styles: {
          fontStyle: 'bold',
          halign: 'right',
          textColor: value >= 0 ? [22, 101, 52] : [153, 27, 27],
          fillColor: isSubtotal ? [241, 245, 249] : (value >= 0 ? [240, 253, 244] : [254, 242, 242])
        }
      }
    ]);
  };

  // 1. Ingresos Operacionales
  addRubroRows('1. Ingresos de Actividades Ordinarias', statementData.rubros.ingresosOperacionales);
  
  // 2. Costo de Ventas
  addRubroRows('2. Costos de Ventas / Explotación', statementData.rubros.costosVentas, true);

  // (=) MARGEN OPERACIONAL BRUTO
  addTotalSectionRow('(=) MARGEN OPERACIONAL (BRUTO)', statementData.totals.grossMargin, true);

  // 3. Gastos Operacionales
  addRubroRows('3. Gastos de Remuneraciones y Personal', statementData.rubros.gastosRemuneraciones, true);
  addRubroRows('4. Gastos de Administración y Ventas', statementData.rubros.gastosAdministracion, true);
  addRubroRows('5. Depreciación y Amortización del Ejercicio', statementData.rubros.depreciacionAmort, true);

  // (=) RESULTADO OPERACIONAL (EBIT)
  addTotalSectionRow('(=) RESULTADO OPERACIONAL (EBIT)', statementData.totals.operatingResult, true);

  // 4. Resultados Fuera de Explotación / Financieros
  addRubroRows('6. Ingresos Financieros', statementData.rubros.ingresosFinancieros);
  addRubroRows('7. Gastos Financieros', statementData.rubros.costosFinancieros, true);
  addRubroRows('8. Otros Ingresos Operacionales / No Operacionales', statementData.rubros.otrosIngresosOp);
  addRubroRows('9. Otros Gastos No Operacionales', statementData.rubros.otrosGastosNoOp, true);

  // (=) RESULTADO ANTES DE IMPUESTOS
  addTotalSectionRow('(=) GANANCIA (PÉRDIDA) ANTES DE IMPUESTOS', statementData.totals.profitBeforeTax, true);

  // Impuesto a la Renta
  addRubroRows('10. Gasto por Impuesto a la Renta (F29 / F22)', statementData.rubros.impuestoRenta, true);

  // (=) RESULTADO NETO DEL EJERCICIO
  addTotalSectionRow(
    `(=) RESULTADO NETO DEL EJERCICIO (${statementData.totals.isProfit ? 'UTILIDAD NETA' : 'PÉRDIDA NETA'})`,
    statementData.totals.netIncome
  );

  autoTable(doc, {
    head: [['CONCEPTO / RUBRO IFRS (NIC 1)', 'MONTO ACUMULADO ($)']],
    body: tableBody,
    startY: tableStartY,
    margin: { top: tableStartY, bottom: 20, left: 14, right: 14 },
    theme: 'grid',
    styles: {
      fontSize: 8.5,
      cellPadding: 2,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.15
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'left',
      fontSize: 8.5
    },
    columnStyles: {
      0: { cellWidth: 'auto', halign: 'left' },
      1: { cellWidth: 50, halign: 'right' }
    }
  });

  // Pies de página con Firmas Reglamentarias
  const finalY = (doc as any).lastAutoTable?.finalY || 180;

  if (finalY + 35 < pageHeight) {
    const signY = finalY + 22;
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);

    doc.line(25, signY, 85, signY);
    doc.line(125, signY, 185, signY);

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(51, 65, 85);
    doc.text('REPRESENTANTE LEGAL', 55, signY + 4, { align: 'center' });
    doc.text('CONTADOR GENERAL / AUDITOR', 155, signY + 4, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(`RUT: ${company.legalRepRut || company.rut}`, 55, signY + 7.5, { align: 'center' });
    doc.text('Reg. Colegio de Contadores de Chile', 155, signY + 7.5, { align: 'center' });
  }

  const fileName = `Estado_de_Resultados_${company.rut}_${selectedYear}_hasta_${cutoffMonthName}.pdf`;
  return { fileName, doc };
}
