// Redacción del documento de finiquito (PDF). Lo usan el finiquito individual y el masivo por obra.
import jsPDF from 'jspdf';
import type { ResultadoFiniquito } from './finiquito';

export interface DatosDocumentoFiniquito {
  empresa: { nombre: string; rut: string; domicilio?: string; representante?: string };
  trabajador: { nombre: string; rut: string; cargo?: string };
  fechaInicio: string;
  fechaCese: string;
  causal: string;            // texto completo de la causal
  esObra: boolean;
  obra?: string;             // nombre de la obra o faena
  r: ResultadoFiniquito;
  otrosHaberes?: number;
  periodoSueldo?: string;    // YYYY-MM de la liquidación incluida
  ciudad?: string;
}

const $ = (n: number) => `$ ${Math.round(n || 0).toLocaleString('es-CL')}`;
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const fechaLarga = (iso: string) => {
  const [a, m, d] = (iso || '').slice(0, 10).split('-').map(Number);
  return a ? `${d} de ${MESES[m - 1]} de ${a}` : iso;
};

/** Escribe un finiquito en el documento (en la página actual). */
export function escribirFiniquito(doc: jsPDF, x: DatosDocumentoFiniquito, formatRut: (r: string) => string) {
  const L = 18, R = 192, W = R - L;
  let y = 20;
  const parrafo = (t: string, salto = 4.6) => {
    const lineas = doc.splitTextToSize(t, W);
    if (y + lineas.length * salto > 280) { doc.addPage(); y = 20; }
    doc.text(lineas, L, y); y += lineas.length * salto + 2;
  };
  const titulo = (t: string) => { doc.setFont('helvetica', 'bold'); parrafo(t); doc.setFont('helvetica', 'normal'); };
  const fila = (t: string, v: number, negrita = false) => {
    if (y > 275) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', negrita ? 'bold' : 'normal');
    doc.text(t, L + 4, y); doc.text(v < 0 ? `- ${$(-v)}` : $(v), R, y, { align: 'right' }); y += 5.5;
    doc.setFont('helvetica', 'normal');
  };

  doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text('FINIQUITO DE CONTRATO DE TRABAJO', 105, y, { align: 'center' }); y += 10;
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');

  const ciudad = x.ciudad || 'Santiago';
  parrafo(`En ${ciudad}, a ${fechaLarga(x.fechaCese)}, entre ${x.empresa.nombre.toUpperCase()}, RUT ${formatRut(x.empresa.rut)}` +
    `${x.empresa.domicilio ? `, con domicilio en ${x.empresa.domicilio}` : ''}` +
    `${x.empresa.representante ? `, representada por ${x.empresa.representante}` : ''}, en adelante "el empleador", y ` +
    `don(ña) ${x.trabajador.nombre.toUpperCase()}, RUT ${formatRut(x.trabajador.rut)}, en adelante "el trabajador", se deja constancia de lo siguiente:`);

  titulo('PRIMERO: Término del contrato');
  parrafo(`El trabajador prestó servicios para el empleador como ${x.trabajador.cargo || 'trabajador'}` +
    (x.esObra ? `, bajo contrato por obra o faena${x.obra ? ` para la obra "${x.obra}"` : ''}` : '') +
    `, desde el ${fechaLarga(x.fechaInicio)} hasta el ${fechaLarga(x.fechaCese)}, fecha en que el contrato terminó por la causal del ${x.causal}.`);
  if (x.esObra) parrafo('Por tratarse de un contrato por obra o faena terminado por la conclusión del trabajo, no procede aviso previo ni indemnización sustitutiva de éste.');

  titulo('SEGUNDO: Liquidación');
  parrafo('El empleador paga al trabajador los siguientes conceptos:');
  const r = x.r;
  if (r.sueldoLiquidoPendiente > 0) fila(`Remuneración líquida del período ${x.periodoSueldo || ''} (según liquidación)`, r.sueldoLiquidoPendiente);
  if (r.montoVacaciones > 0) fila(`Feriado proporcional (${r.diasVacacionesPendientes} días hábiles)`, r.montoVacaciones);
  if (r.montoIndemnizacionObra > 0) fila(`Indemnización Art. 163 inc. 3° (${r.diasIndemnizacionObra} días)`, r.montoIndemnizacionObra);
  if (r.montoIAS > 0) fila(`Indemnización por años de servicio (${r.anosParaIAS} años)`, r.montoIAS);
  if (r.montoAvisoPrevio > 0) fila('Indemnización sustitutiva del aviso previo', r.montoAvisoPrevio);
  if ((x.otrosHaberes || 0) > 0) fila('Otros haberes', x.otrosHaberes || 0);
  if (r.totalDescuentos > 0) fila('Descuentos (préstamos, anticipos u otros)', -r.totalDescuentos);
  y += 1; doc.line(L + 4, y - 4, R, y - 4);
  fila('TOTAL A PAGAR', r.totalLiquido, true);
  if (r.avisoFeriado) parrafo(r.avisoFeriado);
  parrafo('El feriado proporcional y las indemnizaciones no son imponibles ni tributables.');

  titulo('TERCERO: Cotizaciones');
  parrafo('El empleador declara que las cotizaciones previsionales y de seguridad social del trabajador se encuentran íntegramente pagadas hasta el último día del mes anterior al término, y que las del mes de término se pagarán dentro del plazo legal, lo que se acredita con los certificados correspondientes (Art. 162 inc. 5° del Código del Trabajo).');

  titulo('CUARTO: Declaración del trabajador');
  parrafo(`El trabajador declara recibir en este acto, a su entera satisfacción, la suma de ${$(r.totalLiquido)}, y que no tiene cargo ni cobro alguno que formular al empleador por remuneraciones, feriados, indemnizaciones u otro concepto derivado de la relación laboral o de su término, otorgándole el más amplio y total finiquito.`);

  titulo('QUINTO: Ratificación');
  parrafo('El presente finiquito se firma en tres ejemplares y se ratifica ante ministro de fe (inspector del trabajo, notario u otro autorizado por el Art. 177 del Código del Trabajo), o se suscribe electrónicamente en el portal de la Dirección del Trabajo.');

  if (y > 240) { doc.addPage(); y = 30; } else y += 22;
  doc.line(22, y, 92, y); doc.line(118, y, 188, y);
  doc.setFontSize(9);
  doc.text('EMPLEADOR', 57, y + 5, { align: 'center' });
  doc.text(formatRut(x.empresa.rut), 57, y + 10, { align: 'center' });
  doc.text('TRABAJADOR', 153, y + 5, { align: 'center' });
  doc.text(formatRut(x.trabajador.rut), 153, y + 10, { align: 'center' });
  y += 28;
  doc.line(70, y, 140, y);
  doc.text('MINISTRO DE FE', 105, y + 5, { align: 'center' });
  doc.setFontSize(10);
}
