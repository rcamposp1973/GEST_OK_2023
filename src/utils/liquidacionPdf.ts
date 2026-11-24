// Liquidación de sueldo en PDF real (texto nítido, no imagen), siempre en 1 hoja tamaño carta.
import { jsPDF } from 'jspdf';
import type { PayrollSlip } from '../types';

export interface EmpresaLiquidacion { nombre: string; rut: string; direccion?: string; giro?: string }

const $ = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-CL');
const NOMBRE_CONTRATO: Record<string, string> = {
  INDEFINIDO: 'Indefinido', PLAZO_FIJO: 'Plazo fijo', OBRA_FAENA: 'Obra o faena', HONORARIOS: 'Honorarios',
};

export function crearPdfLiquidacion(s: PayrollSlip, emp: EmpresaLiquidacion, periodoTexto: string, formatRut: (r: string) => string, docExistente?: jsPDF): jsPDF {
  const doc = docExistente || new jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait' });
  if (docExistente) doc.addPage('letter', 'portrait');
  const L = 14, R = 202, W = R - L;
  let y = 16;
  const gris = (g: number) => doc.setTextColor(g, g, g);
  const negro = () => doc.setTextColor(15, 23, 42);
  const font = (estilo: 'normal' | 'bold', tam: number) => { doc.setFont('helvetica', estilo); doc.setFontSize(tam); };

  // Membrete
  font('bold', 13); negro(); doc.text(emp.nombre.toUpperCase(), L, y);
  font('bold', 11); doc.text('LIQUIDACIÓN DE SUELDO', R, y, { align: 'right' });
  y += 5; font('normal', 8.5); gris(80);
  doc.text(`RUT: ${formatRut(emp.rut)}`, L, y);
  font('bold', 9); negro(); doc.text(`Período: ${periodoTexto}`, R, y, { align: 'right' });
  font('normal', 8.5); gris(80);
  if (emp.direccion) { y += 4; doc.text(emp.direccion, L, y); }
  if (emp.giro) { y += 4; doc.text(`Giro: ${emp.giro}`, L, y); }
  y += 4; doc.setDrawColor(15, 23, 42); doc.setLineWidth(0.6); doc.line(L, y, R, y);

  // Datos del trabajador (4 columnas x 2 filas)
  y += 4;
  doc.setFillColor(246, 247, 249); doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.2);
  doc.roundedRect(L, y, W, 22, 2, 2, 'FD');
  const datos: [string, string][] = [
    ['Nombre trabajador', s.employeeName], ['RUT', formatRut(s.employeeRut)],
    ['Cargo / función', s.employeePosition || '-'], ['Días trabajados', `${s.diasTrabajados} de 30`],
    ['Previsión (AFP)', `${s.pensionSystem} (${s.afpTasa}%)`], ['Salud', String(s.healthSystem)],
    ['Tipo de contrato', NOMBRE_CONTRATO[s.contractType] || String(s.contractType)], ['Sueldo base pactado', $(s.sueldoBasePactado)],
  ];
  const anchos = [0.36, 0.17, 0.27, 0.20].map(f => f * (W - 8));
  datos.forEach(([k, v], i) => {
    const c = i % 4;
    const cx = L + 4 + anchos.slice(0, c).reduce((a, b) => a + b, 0), cy = y + 6 + Math.floor(i / 4) * 10;
    font('bold', 6.5); gris(110); doc.text(k.toUpperCase(), cx, cy);
    let tam = 8.5; font('bold', tam);
    while (doc.getTextWidth(v) > anchos[c] - 3 && tam > 6.5) { tam -= 0.25; font('bold', tam); }
    negro(); doc.text(v, cx, cy + 4);
  });
  y += 28;

  // Dos columnas: Haberes | Descuentos
  const gap = 6, cw = (W - gap) / 2;
  const columna = (x0: number, titulo: string, grupos: { sub: string; filas: [string, number][]; total?: [string, number] }[], totalFinal: [string, number]) => {
    let yy = y;
    font('bold', 9.5); negro(); doc.text(titulo, x0, yy); yy += 2;
    doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.3); doc.line(x0, yy, x0 + cw, yy); yy += 5;
    for (const g of grupos) {
      font('bold', 7); gris(110); doc.text(g.sub, x0, yy); yy += 4.5;
      for (const [t, v] of g.filas) {
        font('normal', 8.2); negro();
        const lineas = doc.splitTextToSize(t, cw - 28);
        doc.text(lineas, x0, yy); doc.text($(v), x0 + cw, yy, { align: 'right' });
        yy += 4.4 * lineas.length;
        doc.setDrawColor(241, 245, 249); doc.line(x0, yy - 2.8, x0 + cw, yy - 2.8);
      }
      if (g.total) {
        doc.setFillColor(246, 247, 249); doc.rect(x0, yy - 3.5, cw, 5.5, 'F');
        font('bold', 8.2); negro(); doc.text(g.total[0], x0 + 1.5, yy); doc.text($(g.total[1]), x0 + cw - 1.5, yy, { align: 'right' });
        yy += 7;
      }
    }
    return { yy, totalFinal };
  };
  const nz = (f: [string, number][]) => f.filter(([, v]) => Math.round(v || 0) !== 0);
  const haberes = columna(L, 'I. HABERES', [
    { sub: 'A. Haberes imponibles y tributables', filas: [
      [`Sueldo base (${s.diasTrabajados} días)`, s.sueldoBaseProporcional] as [string, number],
      ...nz([
        [`Horas extraordinarias 50% (${s.horasExtras50Qty} hrs)`, s.montoHorasExtras50],
        ['Gratificación legal (Art. 50 Código del Trabajo)', s.gratificacionLegal],
        ['Bonos imponibles', s.bonosImponibles],
        ['Comisiones por ventas', s.comisionesVentas],
        ['Otros imponibles', s.otrosImponibles],
      ])], total: ['Total imponible', s.totalHaberesImponibles] },
    { sub: 'B. Haberes no imponibles', filas: nz([
        ['Asignación de colación', s.asignacionColacion],
        ['Asignación de movilización', s.asignacionMovilizacion],
        ['Asignación familiar', s.asignacionFamiliar],
        ['Viáticos', s.viaticos],
        ['Otros no imponibles', s.otrosNoImponibles],
      ]), total: ['Total no imponible', s.totalHaberesNoImponibles] },
  ], ['TOTAL HABERES', s.totalHaberes]);
  const descuentos = columna(L + cw + gap, 'II. DESCUENTOS', [
    { sub: 'A. Descuentos previsionales obligatorios', filas: [
      [`Cotización AFP (${s.pensionSystem} ${s.afpTasa}%)`, s.afpMonto] as [string, number],
      [`Cotización salud 7% (${s.healthSystem})`, s.saludLegal7] as [string, number],
      ...nz([
        ['Adicional Isapre (plan pactado)', s.saludAdicionalIsapre],
        [`Seguro de cesantía AFC (${s.afcTrabajadorTasa}%)`, s.afcTrabajadorMonto],
        ['Ahorro previsional voluntario (APV)', s.apvMonto],
      ])] },
    { sub: 'B. Impuesto y otros descuentos', filas: [
      [`Impuesto único 2ª categoría (${s.tramoImpuestoUnico || 'exento'})`, s.impuestoUnicoSegundaCategoria] as [string, number],
      ...nz([
        ['Anticipos de sueldo', s.anticipos],
        ['Cuota préstamo empresa', s.prestamosEmpresa],
        ['Retención judicial (pensión de alimentos)', s.descuentoJudicialPensionAlimentos || 0],
        ['Otros descuentos', s.otrosDescuentos],
      ])] },
  ], ['TOTAL DESCUENTOS', s.totalDescuentos]);

  // Totales de cada columna alineados a la misma altura
  y = Math.max(haberes.yy, descuentos.yy) + 1;
  for (const [x0, [t, v], neg] of [[L, haberes.totalFinal, false], [L + cw + gap, descuentos.totalFinal, true]] as [number, [string, number], boolean][]) {
    doc.setDrawColor(15, 23, 42); doc.setLineWidth(0.5); doc.line(x0, y - 4, x0 + cw, y - 4);
    font('bold', 9); negro(); doc.text(t, x0 + 1.5, y); doc.text((neg ? '-' : '') + $(v), x0 + cw - 1.5, y, { align: 'right' });
  }
  y += 7;

  // Líquido a pagar
  doc.setFillColor(15, 23, 42); doc.roundedRect(L, y, W, 16, 2, 2, 'F');
  doc.setTextColor(255, 255, 255); font('bold', 10); doc.text('LÍQUIDO A PAGAR', L + 5, y + 7);
  font('normal', 7.5); doc.setTextColor(203, 213, 225);
  doc.text(`Base tributable: ${$(s.rentaAfectaImpuesto)}     |     Base imponible AFP: ${$(s.baseImponibleAfp)}`, L + 5, y + 12);
  font('bold', 16); doc.setTextColor(255, 255, 255); doc.text($(s.liquidoAPagar), R - 5, y + 10.5, { align: 'right' });
  y += 24;

  // Declaración y firmas
  font('normal', 7.5); gris(90);
  const decl = doc.splitTextToSize(`Certifico que he recibido de mi empleador ${emp.nombre}, a mi total y entera satisfacción, la suma líquida señalada en esta liquidación, sin tener cargo ni reclamo alguno que formular, correspondiente a los servicios prestados durante el período señalado.`, W);
  doc.text(decl, L, y); y += decl.length * 3.4 + 18;
  if (y > 262) y = 262;
  doc.setDrawColor(15, 23, 42); doc.setLineWidth(0.3);
  const firma = (cx: number, titulo: string, l1: string, l2: string) => {
    doc.line(cx - 35, y, cx + 35, y);
    font('bold', 8); negro(); doc.text(titulo, cx, y + 4.5, { align: 'center' });
    font('normal', 7.5); gris(100); doc.text(l1, cx, y + 8.5, { align: 'center' }); doc.text(l2, cx, y + 12, { align: 'center' });
  };
  firma(L + W * 0.25, 'FIRMA DEL EMPLEADOR', emp.nombre, formatRut(emp.rut));
  firma(L + W * 0.75, 'FIRMA DEL TRABAJADOR', s.employeeName, `RUT: ${formatRut(s.employeeRut)}`);
  return doc;
}

export function nombreArchivoLiquidacion(s: PayrollSlip): string {
  const n = (s.employeeName || 'trabajador').split(/\s+/).filter(Boolean);
  const tit = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  const corto = [n[0], n.length > 2 ? n[n.length - 2] : n[1]].filter(Boolean).map(tit).join('_');
  return `${(s.period || '').replace('-', '')}_${corto.normalize('NFD').replace(/[̀-ͯ]/g, '')}.pdf`;
}
