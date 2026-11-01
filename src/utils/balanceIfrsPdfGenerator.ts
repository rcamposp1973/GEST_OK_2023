import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Company } from '../types';

export interface IFRSPrintAccountLine {
  id: string;
  code: string;
  name: string;
  balance: number;
}

export interface IFRSPrintParentRubro {
  id: string;
  code: string;
  name: string;
  total: number;
  accounts: IFRSPrintAccountLine[];
}

export interface GenerateBalanceIFRSPDFOptions {
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

export function generateBalanceIFRSPDF(options: GenerateBalanceIFRSPDFOptions): { fileName: string; doc: jsPDF } {
  const {
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
  } = options;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const formatCLP = (num: number): string => {
    if (!num || num === 0) return '$0';
    return '$' + Math.round(num).toLocaleString('es-CL');
  };

  const periodLabel = periodFilter === 'Todos' ? 'Ejercicio Completo (Acumulado)' : `Acumulado al período ${periodFilter}`;
  const rangeStr = dateFrom && dateTo ? `Desde ${dateFrom} Hasta ${dateTo}` : 'Acumulado al corte';
  const emissionDate = new Date().toLocaleString('es-CL');

  // Encabezado Corporativo
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text('ESTADO DE SITUACIÓN FINANCIERA (BALANCE CLASIFICADO IFRS / FECU)', 14, 15);

  // Columna Izquierda: Datos de la Empresa (ancho máximo 105 mm para evitar colisiones)
  let yLeft = 21;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  const nameLines = doc.splitTextToSize(`RAZÓN SOCIAL: ${(company.name || '').toUpperCase()}`, 105);
  doc.text(nameLines, 14, yLeft);
  yLeft += nameLines.length * 3.8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text(`RUT: ${company.rut}`, 14, yLeft);
  yLeft += 3.8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  const giroLines = doc.splitTextToSize(`GIRO: ${company.giro || 'Servicios y Comercio General'}`, 105);
  doc.text(giroLines, 14, yLeft);
  yLeft += giroLines.length * 3.4;

  const dirLines = doc.splitTextToSize(`DIRECCIÓN: ${company.address || 'Chile'}${company.comuna ? ', ' + company.comuna : ''}`, 105);
  doc.text(dirLines, 14, yLeft);
  yLeft += dirLines.length * 3.4;

  // Columna Derecha: Parámetros del Reporte (ancho reservado en la derecha)
  let yRight = 21;
  const rightX = pageWidth - 14;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text(`PERÍODO: ${periodLabel}`, rightX, yRight, { align: 'right' });
  yRight += 3.8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`RANGO: ${rangeStr}`, rightX, yRight, { align: 'right' });
  yRight += 3.5;

  doc.text(`FECHA EMISIÓN: ${emissionDate}`, rightX, yRight, { align: 'right' });
  yRight += 3.5;

  doc.text(`MONEDA: CLP ($) - NORMATIVA IFRS / CMF`, rightX, yRight, { align: 'right' });
  yRight += 3.5;

  // Estado de cuadratura
  doc.setFont('helvetica', 'bold');
  if (isBalanced) {
    doc.setTextColor(16, 149, 193);
    doc.text('✓ Ecuación IFRS Cuadrada: Activo = Pasivo + Patrimonio', rightX, yRight, { align: 'right' });
  } else {
    doc.setTextColor(225, 29, 72);
    doc.text('⚠️ Descuadre Patrimonial Detectado', rightX, yRight, { align: 'right' });
  }
  yRight += 4;

  // Línea separadora ajustada dinámicamente según la altura máxima
  const headerBottomY = Math.max(yLeft, yRight) + 1;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.4);
  doc.line(14, headerBottomY, pageWidth - 14, headerBottomY);

  const tableStartY = headerBottomY + 3;

  // Filas para la tabla estructurada IFRS
  const tableRows: Array<[string, string, string]> = [];

  // Helper para insertar sección
  const addHeaderSection = (title: string, amount: number) => {
    tableRows.push([title, '', formatCLP(amount)]);
  };

  const addRubro = (code: string, name: string, total: number, accounts: IFRSPrintAccountLine[]) => {
    tableRows.push([`  ${code} - ${name}`, '', formatCLP(total)]);
    accounts.forEach(acc => {
      tableRows.push([`      ${acc.code} ${acc.name}`, formatCLP(acc.balance), '']);
    });
  };

  // 1. ACTIVOS
  addHeaderSection('1. TOTAL ACTIVOS', totalActivos);
  addHeaderSection('  1.1. ACTIVOS CORRIENTES (CIRCULANTES)', totalActivosCorrientes);
  activosCorrientes.forEach(r => addRubro(r.code, r.name, r.total, r.accounts));

  addHeaderSection('  1.2. ACTIVOS NO CORRIENTES (FIJOS E INTANGIBLES)', totalActivosNoCorrientes);
  activosNoCorrientes.forEach(r => addRubro(r.code, r.name, r.total, r.accounts));

  // Espacio
  tableRows.push(['', '', '']);

  // 2. PASIVOS
  addHeaderSection('2. TOTAL PASIVOS', totalPasivos);
  addHeaderSection('  2.1. PASIVOS CORRIENTES (CORTO PLAZO)', totalPasivosCorrientes);
  pasivosCorrientes.forEach(r => addRubro(r.code, r.name, r.total, r.accounts));

  addHeaderSection('  2.2. PASIVOS NO CORRIENTES (LARGO PLAZO)', totalPasivosNoCorrientes);
  pasivosNoCorrientes.forEach(r => addRubro(r.code, r.name, r.total, r.accounts));

  // Espacio
  tableRows.push(['', '', '']);

  // 3. PATRIMONIO NETO
  addHeaderSection('3. TOTAL PATRIMONIO NETO', totalPatrimonioNeto);
  patrimonioRubros.forEach(r => addRubro(r.code, r.name, r.total, r.accounts));
  tableRows.push(['  2304000 - Resultado del Ejercicio (Ganancia / Pérdida)', '', formatCLP(resultadoEjercicio)]);

  // Espacio
  tableRows.push(['', '', '']);

  // RESUMEN ECUACIÓN PATRIMONIAL
  tableRows.push(['TOTAL PASIVO + PATRIMONIO NETO (2 + 3)', '', formatCLP(totalPasivoMasPatrimonio)]);
  tableRows.push([isBalanced ? 'ESTADO DE CUADRATURA: ACTIVO = PASIVO + PATRIMONIO (CUADRADO)' : 'ESTADO DE CUADRATURA: DESCUADRADO', '', isBalanced ? '✓ OK' : 'DESCUADRE']);

  autoTable(doc, {
    startY: tableStartY,
    head: [['RUBRO / CONCEPTO IFRS', 'SALDO CUENTA ($)', 'TOTAL RUBRO ($)']],
    body: tableRows,
    theme: 'plain',
    styles: {
      fontSize: 7.5,
      cellPadding: 1.5,
      textColor: [30, 41, 59],
      lineColor: [241, 245, 249],
      lineWidth: 0.1
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'left'
    },
    columnStyles: {
      0: { cellWidth: 115 },
      1: { cellWidth: 35, halign: 'right', fontStyle: 'normal' },
      2: { cellWidth: 35, halign: 'right', fontStyle: 'bold' }
    },
    didParseCell: (data) => {
      const rowText = String(data.row.raw[0] || '');
      // Destacar títulos principales
      if (
        rowText.startsWith('1. TOTAL') ||
        rowText.startsWith('2. TOTAL') ||
        rowText.startsWith('3. TOTAL') ||
        rowText.startsWith('TOTAL PASIVO')
      ) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [241, 245, 249];
        data.cell.styles.textColor = [15, 23, 42];
      } else if (rowText.startsWith('  1.1.') || rowText.startsWith('  1.2.') || rowText.startsWith('  2.1.') || rowText.startsWith('  2.2.')) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.textColor = [51, 65, 85];
      } else if (rowText.startsWith('ESTADO DE CUADRATURA')) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = isBalanced ? [236, 253, 245] : [255, 241, 242];
        data.cell.styles.textColor = isBalanced ? [6, 95, 70] : [159, 18, 57];
      }
    },
    margin: { left: 14, right: 14, bottom: 25 }
  });

  // Firmas al pie
  const finalY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 14 : pageHeight - 35;
  const signatureY = finalY > pageHeight - 35 ? pageHeight - 25 : finalY;

  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.3);

  // Firma Representante Legal
  doc.line(25, signatureY, 85, signatureY);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('REPRESENTANTE LEGAL', 55, signatureY + 4, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(`RUT: ${company.rut}`, 55, signatureY + 8, { align: 'center' });

  // Firma Contador General
  doc.line(pageWidth - 85, signatureY, pageWidth - 25, signatureY);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('CONTADOR GENERAL', pageWidth - 55, signatureY + 4, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Colegio de Contadores de Chile', pageWidth - 55, signatureY + 8, { align: 'center' });

  // Numeración de páginas
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Página ${i} de ${totalPages} - GEST_OK Software Contable Tributario IFRS`,
      pageWidth / 2,
      pageHeight - 6,
      { align: 'center' }
    );
  }

  const cleanRut = company.rut.replace(/[^0-9kK]/g, '');
  const fileName = `Balance_IFRS_${cleanRut}_${periodFilter !== 'Todos' ? periodFilter : 'Acumulado'}.pdf`;

  return { fileName, doc };
}
