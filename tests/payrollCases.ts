/**
 * Casos de prueba del cálculo de sueldos. Ejecutar con:  npx tsx tests/payrollCases.ts
 * Cada caso se calcula a mano con la norma (Ley 19.728, DL 3.500, tabla de Impuesto Único del SII).
 */
import { calculatePayrollSlip, getPrevisionalParametersForPeriod, tasasCesantia } from '../src/utils/payrollCalculator';

let fallos = 0;
const igual = (nombre: string, obtenido: any, esperado: any) => {
  const ok = JSON.stringify(obtenido) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log(`${ok ? 'OK ' : 'FALLA'} ${nombre}${ok ? '' : ` → obtenido ${JSON.stringify(obtenido)}, esperado ${JSON.stringify(esperado)}`}`);
};

const base: any = {
  id: 'e', companyId: 'c', rut: '1-9', name: 'Prueba', position: 'X', hireDate: '2026-01-01', contractType: 'INDEFINIDO',
  workHoursPerWeek: 44, baseSalary: 2200000, hasGratificacionLegal: false, gratificacionType: 'SIN_GRATIFICACION',
  pensionSystem: 'UNO', healthSystem: 'FONASA', healthPlanType: 'FONASA_7', healthPlanValue: 0, hasCesantiaAFC: true,
  cargasFamiliares: 0, tramoCargaFamiliar: 'SIN_TRAMO', active: true, createdAt: '',
};
const slip = (e: any, per: string) => calculatePayrollSlip(e, getPrevisionalParametersForPeriod(per), {}) as any;
const ces = (e: any, per = '2026-10') => tasasCesantia({ ...base, ...e }, per);

// Seguro de cesantía por contrato y antigüedad
igual('Indefinido', ces({}), { trabajador: 0.6, empleador: 2.4 });
igual('Part time (indefinido)', ces({ contractType: 'PART_TIME' }), { trabajador: 0.6, empleador: 2.4 });
igual('Plazo fijo', ces({ contractType: 'PLAZO_FIJO' }), { trabajador: 0, empleador: 3 });
igual('Obra o faena', ces({ contractType: 'OBRA_FAENA' }), { trabajador: 0, empleador: 3 });
igual('11 años cumplidos (132 meses)', ces({ hireDate: '2015-10-01' }), { trabajador: 0, empleador: 0.8 });
igual('Un mes antes de los 11 años', ces({ hireDate: '2015-11-01' }), { trabajador: 0.6, empleador: 2.4 });
igual('Sin seguro de cesantía', ces({ hasCesantiaAFC: false }), { trabajador: 0, empleador: 0 });
igual('Jubilado que cotiza', ces({ pensionSystem: 'JUBILADO_COTIZA' }), { trabajador: 0, empleador: 0 });
igual('Jubilado que no cotiza', ces({ pensionSystem: 'JUBILADO_NO_COTIZA' }), { trabajador: 0, empleador: 0 });

// AFP Uno: comisión oficial 0,46 % (10,46 % total); el 10,49 antiguo guardado en fichas se ignora
igual('AFP Uno oficial', slip(base, '2026-10').afpMonto, 230120);
igual('AFP Uno con 10,49 antiguo en ficha', slip({ ...base, pensionCommissionPercent: 10.49 }, '2026-10').afpMonto, 230120);

// Vigencias: Fonasa hasta septiembre, Isapre desde octubre, vuelta a Fonasa desde enero
const conCambios = {
  ...base,
  condiciones: [
    { id: '1', desde: '2026-10', healthSystem: 'CRUZ_BLANCA', healthPlanType: 'ISAPRE_UF', healthPlanValue: 3.881 },
    { id: '2', desde: '2027-01', healthSystem: 'FONASA', healthPlanType: 'FONASA_7', healthPlanValue: 0 },
  ],
};
igual('Septiembre en Fonasa', slip(conCambios, '2026-09').healthSystem, 'FONASA');
igual('Octubre en Isapre', slip(conCambios, '2026-10').healthSystem, 'CRUZ_BLANCA');
const uf = getPrevisionalParametersForPeriod('2026-10').uf;
igual('Plan Isapre con UF del último día del mes', slip(conCambios, '2026-10').saludMontoTotal, Math.max(Math.round(2200000 * 0.07), Math.round(3.881 * uf)));
igual('Enero de vuelta en Fonasa', slip(conCambios, '2027-01').healthSystem, 'FONASA');

// Bono temporal con "hasta"
const conBono = { ...base, condiciones: [{ id: 'b', desde: '2026-09', hasta: '2026-10', bonosPactados: 100000 }] };
igual('Bono rige en septiembre', slip(conBono, '2026-09').totalHaberes, 2300000);
igual('Bono rige en octubre (último mes)', slip(conBono, '2026-10').totalHaberes, 2300000);
igual('Bono ya no rige en noviembre', slip(conBono, '2026-11').totalHaberes, 2200000);

// Impuesto único: base = imponible - AFP - salud (hasta el tope) - cesantía; tramo 2: 4 % - 0,54 UTM
{
  const s = slip(base, '2026-10');
  const utm = getPrevisionalParametersForPeriod('2026-10').utm;
  const baseTrib = 2200000 - 230120 - 154000 - 13200;
  igual('Base tributable', s.rentaAfectaImpuesto, baseTrib);
  igual('Impuesto único (tramo 2)', s.impuestoUnicoSegundaCategoria, Math.round((baseTrib / utm * 0.04 - 0.54) * utm));
}

console.log(fallos ? `\n${fallos} caso(s) con falla` : '\nTodos los casos pasan');
process.exit(fallos ? 1 : 0);
