/**
 * Archivo Previred estándar de 105 campos, largo variable separado por ";" (formato oficial, versión 58).
 * - generarArchivoPrevired105: arma el archivo desde las liquidaciones de Gest_OK.
 * - leerArchivoPrevired105: lee un archivo de 105 campos (el que se sube o descarga de Previred) y lo convierte en filas del libro.
 * Campos numéricos: enteros sin decimales ni separadores. Período en formato mmaaaa.
 */
import type { PayrollSlip, Employee, PensionSystem, HealthSystem } from '../types';

/** Tabla N° 10 Previred: códigos de AFP. */
export const AFP_PREVIRED: Record<string, string> = {
  CUPRUM: '03', HABITAT: '05', PROVIDA: '08', PLANVITAL: '29', CAPITAL: '33', MODELO: '34', UNO: '35',
};
/** Tabla N° 16 Previred: instituciones de salud. */
export const SALUD_PREVIRED: Record<string, string> = {
  FONASA: '07', BANMEDICA: '01', CONSALUD: '02', VIDA_TRES: '03', COLMENA: '04', CRUZ_BLANCA: '05', NUEVA_MASVIDA: '10', ISALUD: '11', ESENCIAL: '28',
};
export const NOMBRE_AFP_POR_CODIGO: Record<string, string> = { '00': 'Sin AFP', '03': 'Cuprum', '05': 'Habitat', '08': 'Provida', '29': 'PlanVital', '33': 'Capital', '34': 'Modelo', '35': 'Uno' };
export const NOMBRE_SALUD_POR_CODIGO: Record<string, string> = { '00': 'Sin Isapre', '07': 'Fonasa', '01': 'Banmédica', '02': 'Consalud', '03': 'Vida Tres', '04': 'Colmena', '05': 'Cruz Blanca', '10': 'Nueva Masvida', '11': 'Isalud (Codelco)', '12': 'Isapre Banco Estado', '25': 'Cruz del Norte', '28': 'Esencial' };
export const NOMBRE_MUTUAL: Record<string, string> = { '00': 'ISL', '01': 'ACHS', '02': 'Mutual de Seguridad CChC', '03': 'IST' };
export const NOMBRE_CCAF: Record<string, string> = { '00': 'Sin CCAF', '01': 'Los Andes', '02': 'La Araucana', '03': 'Los Héroes', '06': '18 de Septiembre' };

export interface OpcionesPrevired { codigoMutual?: string; codigoCcaf?: string }

const ent = (n: any) => String(Math.max(0, Math.round(Number(n) || 0)));
const alfa = (t: any) => String(t ?? '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[;\r\n]/g, ' ').replace(/\s+/g, ' ').trim();

/** Separa "Nombres ApellidoPaterno ApellidoMaterno" (con 3 o más palabras toma las dos últimas como apellidos). */
export function separarNombre(nombre: string): { paterno: string; materno: string; nombres: string } {
  const p = alfa(nombre).split(' ').filter(Boolean);
  if (p.length >= 3) return { nombres: p.slice(0, -2).join(' '), paterno: p[p.length - 2], materno: p[p.length - 1] };
  if (p.length === 2) return { nombres: p[0], paterno: p[1], materno: '' };
  return { nombres: p[0] || '', paterno: '', materno: '' };
}

export function generarArchivoPrevired105(slips: PayrollSlip[], employees: Employee[], periodo: string, op: OpcionesPrevired = {}): { texto: string; avisos: string[] } {
  const [y, m] = periodo.split('-');
  const mmaaaa = `${m}${y}`;
  const mutual = op.codigoMutual || '00';
  const ccaf = op.codigoCcaf || '00';
  const avisos: string[] = [];
  const lineas = slips.map(s => {
    const e = employees.find(x => x.id === s.employeeId || x.rut === s.employeeRut);
    const rut = String(s.employeeRut || '').replace(/[^0-9kK]/g, '').toUpperCase();
    const n = separarNombre(s.employeeName || e?.name || '');
    const ps = s.pensionSystem as PensionSystem;
    const esIps = ps === 'INP';
    const jubNo = ps === 'JUBILADO_NO_COTIZA';
    const regimen = esIps ? 'INP' : jubNo ? 'SIP' : 'AFP';
    const tipoTrab = ps === 'JUBILADO_COTIZA' ? '1' : jubNo ? '2' : '0';
    const codAfp = regimen === 'AFP' ? (AFP_PREVIRED[(e as any)?.pensionSystem] || AFP_PREVIRED[ps] || '00') : '00';
    if (regimen === 'AFP' && codAfp === '00') avisos.push(`${s.employeeName}: AFP sin código Previred.`);
    const hs = s.healthSystem as HealthSystem;
    const fonasa = hs === 'FONASA';
    const codSalud = SALUD_PREVIRED[hs] || (fonasa ? '07' : '00');
    const base = Math.round(s.baseImponibleAfp || 0);
    // Ley 21.735: 0,1% del empleador a la cuenta individual (campo 28) y el resto del aporte al Seguro Social (campo 94)
    const ley = Math.round(Number(s.cotizacionEmpleadorLey21735) || 0);
    const ci = ley > 0 && regimen === 'AFP' && tipoTrab === '0' ? Math.round(base * 0.001) : 0;
    const seguroSocial = Math.max(0, ley - ci);
    const salud7 = Math.round(s.saludLegal7 || 0);
    const ccafSalud = fonasa && ccaf !== '00' ? Math.round(base * 0.042) : 0; // Previred: con CCAF, 4,2% a la CCAF y 2,8% a Fonasa
    const f: string[] = Array(105).fill('');
    const set = (i: number, v: string) => { f[i - 1] = v; };
    for (const i of [7, 15, 19, 20, 21, 22, 23, 24, 27, 28, 29, 30, 31, 32, 33, 34, 38, 39, 40, 42, 43, 44, 45, 47, 48, 49, 50, 55, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 96, 97, 98, 99, 100, 101, 102, 103]) set(i, '0');
    set(1, rut.slice(0, -1)); set(2, rut.slice(-1));
    set(3, n.paterno); set(4, n.materno); set(5, n.nombres);
    set(6, (e as any)?.gender === 'F' ? 'F' : 'M');
    set(7, '0'); set(8, '01'); set(9, mmaaaa); set(10, '0');
    set(11, regimen); set(12, tipoTrab); set(13, ent(s.diasTrabajados)); set(14, '00');
    set(18, String((e as any)?.tramoCargaFamiliar || 'D').replace('SIN_TRAMO', 'D'));
    set(19, ent((e as any)?.cargasFamiliares)); set(22, ent(s.asignacionFamiliar));
    set(25, 'N');
    set(26, codAfp);
    if (regimen === 'AFP') { set(27, ent(base)); set(28, ent((s.afpMonto || 0) + ci)); set(29, ent(s.sisMonto)); }
    if (s.apvMonto > 0 && regimen === 'AFP') { set(40, codAfp); set(42, '1'); set(43, ent(s.apvMonto)); }
    if (esIps) { set(64, ent(base)); set(65, ent(s.afpMonto)); }
    if (fonasa) set(70, ent(salud7 - ccafSalud));
    if (mutual === '00') set(71, ent(s.mutualMonto));
    set(75, codSalud);
    if (!fonasa) { set(77, ent(base)); set(78, '1'); set(79, ent(s.saludMontoTotal)); set(80, ent(salud7)); set(81, ent(s.saludAdicionalIsapre)); }
    set(83, ccaf); if (ccaf !== '00') { set(84, ent(base)); set(90, ent(ccafSalud)); }
    set(94, ent(seguroSocial));
    set(96, mutual); if (mutual !== '00') { set(97, ent(base)); set(98, ent(s.mutualMonto)); }
    set(100, ent(s.baseImponibleAfc)); set(101, ent(s.afcTrabajadorMonto)); set(102, ent(s.afcEmpleadorMonto));
    set(105, alfa((s as any).employeeDepartment || ''));
    return f.join(';');
  });
  return { texto: lineas.join('\r\n'), avisos };
}

/** Fila del libro a partir de una línea Previred (montos por institución). */
export interface FilaPrevired {
  rut: string; nombre: string; periodo: string; dias: number; tipoLinea: string;
  afp: string; imponibleAfp: number; cotizacionAfp: number; sis: number; apv: number;
  ips: number; salud: string; fonasa: number; isapreObligatoria: number; isapreAdicional: number; isapreTotal: number;
  ccaf: number; isl: number; mutual: number; imponibleAfc: number; afcTrabajador: number; afcEmpleador: number;
  seguroSocial: number; asignacionFamiliar: number;
}

/** Lee un archivo de 105 campos separado por ";". Ignora líneas que no tengan el largo del formato. */
export function leerArchivoPrevired105(texto: string): { filas: FilaPrevired[]; errores: string[] } {
  const filas: FilaPrevired[] = [];
  const errores: string[] = [];
  const n = (v?: string) => Number(String(v ?? '').replace(/[^0-9-]/g, '')) || 0;
  String(texto || '').split(/\r?\n/).forEach((l, i) => {
    if (!l.trim()) return;
    const c = l.split(';');
    if (c.length < 100) { errores.push(`Línea ${i + 1}: tiene ${c.length} campos (se esperaban 105).`); return; }
    const per = String(c[8] || '');
    const periodo = per.length === 6 ? `${per.slice(2)}-${per.slice(0, 2)}` : '';
    const isapreTotal = n(c[78]) || (n(c[79]) + n(c[80]));
    filas.push({
      rut: `${n(c[0])}-${String(c[1] || '').toUpperCase()}`,
      nombre: [c[4], c[2], c[3]].map(x => String(x || '').trim()).filter(Boolean).join(' '),
      periodo, dias: n(c[12]), tipoLinea: String(c[13] || '00'),
      afp: String(c[25] || '00').padStart(2, '0'), imponibleAfp: n(c[26]), cotizacionAfp: n(c[27]), sis: n(c[28]), apv: n(c[42]) + n(c[43]),
      ips: n(c[64]), salud: String(c[74] || '00').padStart(2, '0'), fonasa: n(c[69]),
      isapreObligatoria: n(c[79]), isapreAdicional: n(c[80]), isapreTotal: String(c[74] || '') === '07' ? 0 : isapreTotal,
      ccaf: n(c[89]) + n(c[84]) + n(c[85]) + n(c[86]) + n(c[87]) + n(c[88]) + n(c[90]),
      isl: n(c[70]), mutual: n(c[97]), imponibleAfc: n(c[99]), afcTrabajador: n(c[100]), afcEmpleador: n(c[101]),
      seguroSocial: n(c[93]), asignacionFamiliar: n(c[21]),
    });
  });
  return { filas, errores };
}

/** Totales a pagar por institución (para el asiento y el control contra lo pagado en Previred). */
export function totalesPorInstitucion(filas: FilaPrevired[]) {
  const t = new Map<string, number>();
  const add = (k: string, v: number) => { if (v) t.set(k, (t.get(k) || 0) + v); };
  for (const f of filas) {
    add(`AFP ${NOMBRE_AFP_POR_CODIGO[f.afp] || f.afp}`, f.cotizacionAfp + f.apv);
    add('SIS', f.sis);
    add('IPS', f.ips);
    add(f.salud === '07' ? 'Fonasa' : `Isapre ${NOMBRE_SALUD_POR_CODIGO[f.salud] || f.salud}`, f.salud === '07' ? f.fonasa : f.isapreTotal);
    add('CCAF', f.ccaf);
    add('ISL (accidentes del trabajo)', f.isl);
    add('Mutual', f.mutual);
    add('AFC seguro de cesantía', f.afcTrabajador + f.afcEmpleador);
    add('Seguro Social (Ley 21.735)', f.seguroSocial);
  }
  return [...t.entries()].map(([institucion, monto]) => ({ institucion, monto })).sort((a, b) => b.monto - a.monto);
}
