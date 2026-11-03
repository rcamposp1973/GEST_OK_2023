import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Company } from '../types';

export interface BalancePrintRow {
  code: string;
  name: string;
  type: string;
  sumDebit: number;
  sumCredit: number;
  balDebit: number;
  balCredit: number;
  invAsset: number;
  invLiability: number;
  resLoss: number;
  resGain: number;
}

export interface BalanceTotals {
  sumDebit: number;
  sumCredit: number;
  balDebit: number;
  balCredit: number;
  invAsset: number;
  invLiability: number;
  resLoss: number;
  resGain: number;
}

export interface BalanceResult {
  amount: number;
  isUtilidad: boolean;
  invAsset: number;
  invLiability: number;
  resLoss: number;
  resGain: number;
}

export interface GenerateBalancePDFOptions {
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

export function generateBalance8ColumnasPDF(options: GenerateBalancePDFOptions): { fileName: string; doc: jsPDF } {
  const { company, rows, subtotals, result, finalTotals, periodFilter, dateFrom, dateTo, isFullyBalanced } = options;

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'letter' // 279.4 x 215.9 mm
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const formatNumber = (num: number): string => {
    if (!num || num === 0) return '-';
    return Math.round(num).toLocaleString('es-CL');
  };

  const cleanPeriod = periodFilter === 'Todos' ? 'Ejercicio Completo 2026' : `Período ${periodFilter}`;
  const rangeStr = dateFrom && dateTo ? `Desde ${dateFrom} Hasta ${dateTo}` : 'Todo el Ejercicio';
  const emissionDate = new Date().toLocaleString('es-CL');

  // Columns definition
  const headers = [
    'Código',
    'Cuenta Contable',
    'Débitos ($)',
    'Créditos ($)',
    'S. Deudor ($)',
    'S. Acreedor ($)',
    'Activo ($)',
    'Pasivo ($)',
    'Pérdida ($)',
    'Ganancia ($)'
  ];

  // Body rows
  const bodyData: string[][] = rows.map(r => [
    r.code,
    r.name,
    formatNumber(r.sumDebit),
    formatNumber(r.sumCredit),
    formatNumber(r.balDebit),
    formatNumber(r.balCredit),
    formatNumber(r.invAsset),
    formatNumber(r.invLiability),
    formatNumber(r.resLoss),
    formatNumber(r.resGain)
  ]);

  // Subtotals row
  bodyData.push([
    '',
    'SUBTOTALES',
    formatNumber(subtotals.sumDebit),
    formatNumber(subtotals.sumCredit),
    formatNumber(subtotals.balDebit),
    formatNumber(subtotals.balCredit),
    formatNumber(subtotals.invAsset),
    formatNumber(subtotals.invLiability),
    formatNumber(subtotals.resLoss),
    formatNumber(subtotals.resGain)
  ]);

  // Resultado del Ejercicio row
  bodyData.push([
    '',
    `RESULTADO DEL EJERCICIO (${result.isUtilidad ? 'UTILIDAD' : 'PÉRDIDA'})`,
    '',
    '',
    '',
    '',
    result.invAsset > 0 ? formatNumber(result.invAsset) : '-',
    result.invLiability > 0 ? formatNumber(result.invLiability) : '-',
    result.resLoss > 0 ? formatNumber(result.resLoss) : '-',
    result.resGain > 0 ? formatNumber(result.resGain) : '-'
  ]);

  // Totales Iguales row
  bodyData.push([
    '',
    'TOTALES IGUALES',
    formatNumber(finalTotals.sumDebit),
    formatNumber(finalTotals.sumCredit),
    formatNumber(finalTotals.balDebit),
    formatNumber(finalTotals.balCredit),
    formatNumber(finalTotals.invAsset),
    formatNumber(finalTotals.invLiability),
    formatNumber(finalTotals.resLoss),
    formatNumber(finalTotals.resGain)
  ]);

  const totalRowCount = bodyData.length;
  const subtotalsIndex = totalRowCount - 3;
  const resultIndex = totalRowCount - 2;
  const totalsIndex = totalRowCount - 1;

  autoTable(doc, {
    head: [headers],
    body: bodyData,
    startY: 40,
    margin: { top: 40, bottom: 25, left: 10, right: 10 },
    theme: 'grid',
    styles: {
      fontSize: 7.5,
      font: 'courier',
      cellPadding: 1.5,
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.15
    },
    headStyles: {
      fillColor: [15, 23, 42], // Slate 900
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
      fontSize: 7.5
    },
    columnStyles: {
      0: { cellWidth: 22, halign: 'left' },
      1: { cellWidth: 'auto', halign: 'left' },
      2: { cellWidth: 23, halign: 'right' },
      3: { cellWidth: 23, halign: 'right' },
      4: { cellWidth: 23, halign: 'right' },
      5: { cellWidth: 23, halign: 'right' },
      6: { cellWidth: 23, halign: 'right' },
      7: { cellWidth: 23, halign: 'right' },
      8: { cellWidth: 23, halign: 'right' },
      9: { cellWidth: 23, halign: 'right' }
    },
    didParseCell: (data) => {
      // Style special summary rows
      if (data.section === 'body') {
        if (data.row.index === subtotalsIndex) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [241, 245, 249]; // Slate 100
        } else if (data.row.index === resultIndex) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = result.isUtilidad ? [236, 253, 245] : [255, 241, 242]; // Emerald 50 or Rose 50
          if (data.column.index === 1) {
            data.cell.styles.textColor = result.isUtilidad ? [5, 150, 105] : [225, 29, 72];
          }
        } else if (data.row.index === totalsIndex) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [226, 232, 240]; // Slate 200
          data.cell.styles.textColor = [15, 23, 42];
        }
      }
    },
    didDrawPage: (data) => {
      // Header on every page
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(company.name || 'EMPRESA REGISTRADA', 10, 12);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text(`RUT: ${company.rut || '-'} | Giro: ${(company.giro || 'Comercial').substring(0, 70)}`, 10, 17);
      doc.text(`Dirección: ${company.address || '-'}, ${company.comuna || ''}`, 10, 21);

      // Title & Period on top right
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text('BALANCE TRIBUTARIO DE 8 COLUMNAS', pageWidth - 10, 12, { align: 'right' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text(`${cleanPeriod} | ${rangeStr}`, pageWidth - 10, 17, { align: 'right' });

      // Cuadre status badge
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      if (isFullyBalanced) {
        doc.setTextColor(16, 149, 193); // Emerald
        doc.text('✓ Balance Cuadrado', pageWidth - 10, 22, { align: 'right' });
      } else {
        doc.setTextColor(225, 29, 72); // Rose
        doc.text('Balance Descuadrado', pageWidth - 10, 22, { align: 'right' });
      }

      // Separator line
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.4);
      doc.line(10, 26, pageWidth - 10, 26);

      // Footer
      const pageNum = data.pageNumber;
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(`Emitido vía GEST_OK Software Contable el ${emissionDate}`, 10, pageHeight - 8);
      doc.text(`Página ${pageNum}`, pageWidth - 10, pageHeight - 8, { align: 'right' });
    }
  });

  // Final Signatures block on last page
  const finalY = (doc as any).lastAutoTable?.finalY || 160;
  if (finalY + 30 <= pageHeight - 15) {
    // Fits on last page
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);

    const sigY = pageHeight - 18;
    const col1X = 50;
    const col2X = pageWidth - 90;

    doc.line(col1X - 25, sigY - 5, col1X + 45, sigY - 5);
    doc.text('FIRMA REPRESENTANTE LEGAL', col1X + 10, sigY, { align: 'center' });
    doc.text(`RUT: ${company.legalRepRut || company.rut || '-'}`, col1X + 10, sigY + 4, { align: 'center' });

    doc.line(col2X - 25, sigY - 5, col2X + 45, sigY - 5);
    doc.text('FIRMA CONTADOR GENERAL', col2X + 10, sigY, { align: 'center' });
    doc.text('REGISTRO COLEGIO DE CONTADORES DE CHILE', col2X + 10, sigY + 4, { align: 'center' });
  }

  const cleanRut = (company.rut || 'EMPRESA').replace(/[^0-9kK]/g, '');
  const cleanPeriodFile = periodFilter.replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = `Balance_8_Columnas_${cleanRut}_${cleanPeriodFile}.pdf`;

  // Trigger client-side browser download
  doc.save(fileName);

  return { fileName, doc };
}
