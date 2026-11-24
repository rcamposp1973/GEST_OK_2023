import { formatearRut } from '../../utils/rutFormato';
import React, { useState, useMemo } from 'react';
import { 
  FileText, Calculator, Download, Printer, X, CheckCircle2, 
  AlertCircle, DollarSign, Calendar, User, ShieldCheck, ArrowRight, Building2
} from 'lucide-react';
import { Employee, FiniquitoRecord, ChartOfAccount, ProjectMaster, PayrollSlip } from '../../types';
import { formatRut } from '../../utils/rutMatcher';
import { getPrevisionalParametersForPeriod } from '../../utils/payrollCalculator';
import { calcularFiniquito, baseArt172 } from '../../utils/finiquito';
import FiniquitoMasivoObra from './FiniquitoMasivoObra';
import { escribirFiniquito } from '../../utils/finiquitoPdf';
import { contratoActual } from '../../utils/contratosLaborales';
import jsPDF from 'jspdf';

interface FiniquitosCalculatorModalProps {
  companyName: string;
  companyRut: string;
  companyAddress?: string;
  employees: Employee[];
  accounts: ChartOfAccount[];
  onClose: () => void;
  onSaveFiniquito?: (record: FiniquitoRecord) => void;
  /** Si se entrega, el término masivo puede quedar registrado en la ficha de cada trabajador */
  onGuardarTrabajador?: (emp: Employee) => Promise<void>;
  obras?: ProjectMaster[];
  /** Liquidaciones guardadas: para sumar el sueldo líquido del último mes al finiquito */
  payrollSlips?: PayrollSlip[];
  /** Mostrar dentro de una página (sin ventana flotante ni botón cerrar) */
  embebido?: boolean;
}

export const CHILEAN_TERMINATION_CAUSALS = [
  { code: 'ART_161_NECESIDADES', name: 'Art. 161 - Necesidades de la Empresa', requiereIAS: true, requiereAvisoPrevio: true },
  { code: 'ART_159_MUTUO_ACUERDO', name: 'Art. 159 N° 1 - Mutuo Acuerdo de las Partes', requiereIAS: false, requiereAvisoPrevio: false },
  { code: 'ART_159_RENUNCIA', name: 'Art. 159 N° 2 - Renuncia Voluntaria del Trabajador', requiereIAS: false, requiereAvisoPrevio: false },
  { code: 'ART_159_VENCIMIENTO', name: 'Art. 159 N° 4 - Vencimiento del Plazo del Contrato', requiereIAS: false, requiereAvisoPrevio: false },
  { code: 'ART_159_CONCLUSION', name: 'Art. 159 N° 5 - Conclusión del Trabajo o Servicio', requiereIAS: false, requiereAvisoPrevio: false },
  { code: 'ART_160_GRAVE', name: 'Art. 160 - Incumplimiento Grave / Conducta Indebida', requiereIAS: false, requiereAvisoPrevio: false },
  { code: 'ART_161_DESAHUCIO', name: 'Art. 161 inc. 2° - Desahucio Escrito del Empleador (Cargos de Confianza)', requiereIAS: true, requiereAvisoPrevio: true }
];

export const FiniquitosCalculatorModal: React.FC<FiniquitosCalculatorModalProps> = ({
  companyName,
  companyRut,
  companyAddress = 'Santiago, Chile',
  employees,
  accounts,
  onClose,
  onSaveFiniquito,
  onGuardarTrabajador,
  obras = [],
  payrollSlips = [],
  embebido = false
}) => {
  const [modo, setModo] = useState<'individual' | 'masivo'>('individual');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [causalCode, setCausalCode] = useState<string>('ART_161_NECESIDADES');
  const [fechaCese, setFechaCese] = useState<string>(new Date().toISOString().slice(0, 10));
  const [conAvisoPrevio, setConAvisoPrevio] = useState<boolean>(false);
  
  // Días de vacaciones consumidos o pendientes
  const [diasVacacionesHabiles, setDiasVacacionesHabiles] = useState<number>(0);
  const [descuentosPrestamos, setDescuentosPrestamos] = useState<number>(0);
  const [otrosHaberes, setOtrosHaberes] = useState<number>(0);
  const [otrosDescuentos, setOtrosDescuentos] = useState<number>(0);
  const [incluirSueldo, setIncluirSueldo] = useState<boolean>(true);

  const selectedEmployee = useMemo(() => {
    return employees.find(e => e.id === selectedEmployeeId || e.rut === selectedEmployeeId) || null;
  }, [employees, selectedEmployeeId]);

  const causalConfig = useMemo(() => {
    return CHILEAN_TERMINATION_CAUSALS.find(c => c.code === causalCode) || CHILEAN_TERMINATION_CAUSALS[0];
  }, [causalCode]);

  // Cálculos según Código del Trabajo (lógica en utils/finiquito, con pruebas automáticas)
  // Liquidación del mes del término (sueldo líquido aún no pagado)
  const slipMesCese = useMemo(() => {
    if (!selectedEmployee) return null;
    const per = (fechaCese || '').slice(0, 7);
    return payrollSlips.find(p => p.period === per && (p.employeeId === selectedEmployee.id || p.employeeRut === selectedEmployee.rut)) || null;
  }, [payrollSlips, selectedEmployee, fechaCese]);

  const finiquitoCalculated = useMemo(() => {
    if (!selectedEmployee) return null;
    const baseSueldo = baseArt172(selectedEmployee);
    const ufCese = getPrevisionalParametersForPeriod((fechaCese || '').slice(0, 7)).uf || 0;
    const r = calcularFiniquito({
      hireDate: selectedEmployee.hireDate, fechaCese, contractType: selectedEmployee.contractType,
      requiereIAS: causalConfig.requiereIAS, requiereAvisoPrevio: causalConfig.requiereAvisoPrevio,
      esConclusionObra: causalConfig.code === 'ART_159_CONCLUSION', conAvisoPrevio,
      baseMensual: baseSueldo, ufCese, diasVacacionesTomados: diasVacacionesHabiles,
      otrosHaberes, descuentos: descuentosPrestamos + otrosDescuentos,
      sueldoLiquidoPendiente: incluirSueldo && slipMesCese ? (slipMesCese.liquidoAPagar || 0) : 0,
    });
    return { ...r, baseSueldo, ufCese, sinIAS: causalConfig.requiereIAS && r.anosParaIAS === 0, diasPendientesReal: r.diasVacacionesPendientes };
  }, [selectedEmployee, fechaCese, causalConfig, conAvisoPrevio, diasVacacionesHabiles, descuentosPrestamos, otrosHaberes, otrosDescuentos, incluirSueldo, slipMesCese]);
  const esObra = selectedEmployee?.contractType === 'OBRA_FAENA';

  // Al elegir un trabajador con contrato por obra o faena, se propone la causal de conclusión de la obra
  const elegirTrabajador = (id: string) => {
    setSelectedEmployeeId(id);
    const emp = employees.find(e => e.id === id || e.rut === id);
    if (emp?.contractType === 'OBRA_FAENA') setCausalCode('ART_159_CONCLUSION');
  };

  // Generar PDF Oficial del Finiquito
  const handleDownloadPDF = () => {
    if (!selectedEmployee || !finiquitoCalculated) return;

    const doc = new jsPDF();
    const contrato = contratoActual(selectedEmployee);
    const obra = obras.find(o => o.id === contrato?.obraId);
    escribirFiniquito(doc, {
      empresa: { nombre: companyName, rut: companyRut, domicilio: companyAddress },
      trabajador: { nombre: selectedEmployee.name, rut: selectedEmployee.rut, cargo: selectedEmployee.position },
      fechaInicio: contrato?.fechaInicio || selectedEmployee.hireDate, fechaCese,
      causal: causalConfig.name, esObra: !!esObra,
      obra: obra ? obra.name : contrato?.obraFaena,
      r: finiquitoCalculated, otrosHaberes, periodoSueldo: slipMesCese?.period,
    }, formatRut);
    doc.save(`Finiquito_${formatearRut(selectedEmployee.rut)}_${fechaCese}.pdf`);
  };

  return (
    <div className={embebido ? "" : "fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"}>
      <div className={embebido ? "bg-white rounded-2xl border border-slate-200 w-full overflow-hidden" : "bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150"}>
        
        {/* Header */}
        <div className="bg-indigo-900 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/30 border border-indigo-400/40 flex items-center justify-center text-indigo-200 shadow-xs">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-base tracking-tight flex items-center gap-2">
                <span>Calculadora Legal de Finiquito de Contrato (Código del Trabajo Chile)</span>
                <span className="text-[10px] bg-emerald-500/30 border border-emerald-400/50 text-emerald-200 px-2 py-0.5 rounded-full uppercase font-bold">
                  v3.0 Tier-1
                </span>
              </h3>
              <p className="text-xs text-indigo-200 mt-0.5">
                Cálculo de Años de Servicio (Art. 161), Aviso Previo y Vacaciones Proporcionales
              </p>
            </div>
          </div>
          {!embebido && <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-indigo-200 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>}
        </div>

        <div className="px-6 pt-4 flex gap-2">
          <button onClick={() => setModo('individual')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${modo === 'individual' ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-300 text-slate-700'}`}>Un trabajador</button>
          <button onClick={() => setModo('masivo')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${modo === 'masivo' ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-300 text-slate-700'}`}>Término de obra o faena (varios)</button>
        </div>

        {modo === 'masivo' && (
          <div className="p-6 max-h-[80vh] overflow-y-auto">
            <FiniquitoMasivoObra
              employees={employees}
              payrollSlips={payrollSlips}
              companyName={companyName}
              companyRut={companyRut}
              companyAddress={companyAddress}
              onGuardarTrabajador={onGuardarTrabajador}
              obras={obras}
              onVerIndividual={(id, fecha) => { setModo('individual'); setSelectedEmployeeId(id); setCausalCode('ART_159_CONCLUSION'); setFechaCese(fecha); }}
            />
          </div>
        )}

        {/* Body */}
        <div className={`p-6 space-y-6 max-h-[80vh] overflow-y-auto ${modo === 'masivo' ? 'hidden' : ''}`}>
          {/* Employee Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                1. Seleccionar Colaborador / Trabajador:
              </label>
              <select
                value={selectedEmployeeId}
                onChange={e => elegirTrabajador(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">-- Seleccionar Trabajador Activo --</option>
                {employees.map(emp => (
                  <option key={emp.id || emp.rut} value={emp.id || emp.rut}>
                    {emp.name} ({formatRut(emp.rut)}) - Sueldo: ${emp.baseSalary?.toLocaleString('es-CL')}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                2. Causal de Término de Contrato (Código del Trabajo):
              </label>
              <select
                value={causalCode}
                onChange={e => setCausalCode(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500"
              >
                {CHILEAN_TERMINATION_CAUSALS.map(c => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedEmployee && finiquitoCalculated && (
            <>
              {/* Parameters Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-200 space-y-1">
                  <span className="text-[11px] font-bold text-indigo-900 block">Fecha de Cese de Funciones:</span>
                  <input
                    type="date"
                    value={fechaCese}
                    onChange={e => setFechaCese(e.target.value)}
                    className="w-full bg-white border border-indigo-300 rounded-lg p-2 text-xs font-mono font-bold text-slate-900"
                  />
                </div>

                {esObra ? (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[11px] font-bold text-slate-700 block">Sueldo del mes de término:</span>
                  {slipMesCese ? (
                    <label className="flex items-center gap-2 mt-1 cursor-pointer">
                      <input type="checkbox" checked={incluirSueldo} onChange={e => setIncluirSueldo(e.target.checked)} className="w-4 h-4 text-indigo-600 rounded" />
                      <span className="text-xs text-slate-800 font-medium">Incluir líquido de la liquidación {slipMesCese.period}: $ {(slipMesCese.liquidoAPagar || 0).toLocaleString('es-CL')}</span>
                    </label>
                  ) : (
                    <span className="text-xs text-amber-700 block">No hay liquidación guardada de {(fechaCese || '').slice(0, 7)}. Genérala primero (hasta la fecha de término) y vuelve aquí.</span>
                  )}
                  <span className="text-[10px] text-slate-500 block">Obra o faena: no hay aviso previo ni indemnización sustitutiva.</span>
                </div>
                ) : (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[11px] font-bold text-slate-700 block">Aviso Previo Dado (30 días):</span>
                  <label className="flex items-center gap-2 mt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={conAvisoPrevio}
                      onChange={e => setConAvisoPrevio(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded"
                    />
                    <span className="text-xs text-slate-800 font-medium">Sí, se notificó con 30 días de anticipación</span>
                  </label>
                </div>
                )}

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[11px] font-bold text-slate-700 block">Días Vacaciones Ya Tomadas:</span>
                  <input
                    type="number"
                    value={diasVacacionesHabiles}
                    onChange={e => setDiasVacacionesHabiles(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-bold text-slate-900"
                  />
                </div>
              </div>

              {/* Summary Calculation Display */}
              <div className="bg-slate-900 text-white rounded-2xl p-5 space-y-4 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-indigo-400" />
                    <span className="font-bold text-sm text-slate-200">
                      Resumen del Finiquito: {selectedEmployee.name}
                    </span>
                  </div>
                  <span className="font-mono text-xs text-indigo-300 bg-indigo-900/50 px-2.5 py-1 rounded-full border border-indigo-700/50">
                    Antigüedad: {finiquitoCalculated.anosCompletos} años, {finiquitoCalculated.mesesRestantes} meses
                  </span>
                </div>

                {finiquitoCalculated.sinIAS && (
                  <div className="text-[11px] text-amber-300 bg-amber-900/30 border border-amber-700/50 rounded-lg px-3 py-2">
                    No corresponde indemnización por años de servicio: el trabajador tiene menos de 1 año de antigüedad (Art. 163).
                  </div>
                )}
                {finiquitoCalculated.avisoFeriado && (
                  <div className="text-[11px] text-amber-300 bg-amber-900/30 border border-amber-700/50 rounded-lg px-3 py-2">
                    {finiquitoCalculated.avisoFeriado}
                  </div>
                )}
                {finiquitoCalculated.avisoObra && (
                  <div className="text-[11px] text-amber-300 bg-amber-900/30 border border-amber-700/50 rounded-lg px-3 py-2">
                    {finiquitoCalculated.avisoObra}
                  </div>
                )}
                {finiquitoCalculated.montoIndemnizacionObra > 0 && (
                  <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700 text-xs flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-slate-300">
                      Indemnización por obra o faena (Art. 163 inc. 3°): {finiquitoCalculated.mesesObra} meses × {finiquitoCalculated.diasPorMesObra} días = {finiquitoCalculated.diasIndemnizacionObra} días
                    </span>
                    <span className="text-lg font-mono font-black text-emerald-400">$ {finiquitoCalculated.montoIndemnizacionObra.toLocaleString('es-CL')}</span>
                  </div>
                )}
                {!Number.isFinite(finiquitoCalculated.topeLegal) && (
                  <div className="text-[11px] text-amber-300 bg-amber-900/30 border border-amber-700/50 rounded-lg px-3 py-2">
                    La UF del mes del cese no está cargada: no se pudo aplicar el tope de 90 UF. Revisa el monto.
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700">
                    <span className="text-slate-400 text-[10px] uppercase block font-bold">Años de Servicio (Art. 161)</span>
                    <span className="text-lg font-mono font-black text-emerald-400 mt-1 block">
                      $ {finiquitoCalculated.montoIAS.toLocaleString('es-CL')}
                    </span>
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      {finiquitoCalculated.anosParaIAS} años computables
                    </span>
                  </div>

                  {esObra ? (
                  <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700">
                    <span className="text-slate-400 text-[10px] uppercase block font-bold">Sueldo líquido del mes</span>
                    <span className="text-lg font-mono font-black text-indigo-400 mt-1 block">
                      $ {finiquitoCalculated.sueldoLiquidoPendiente.toLocaleString('es-CL')}
                    </span>
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      {slipMesCese ? `Liquidación ${slipMesCese.period}` : 'Falta la liquidación del mes'}
                    </span>
                  </div>
                  ) : (
                  <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700">
                    <span className="text-slate-400 text-[10px] uppercase block font-bold">Sustitutiva Aviso Previo</span>
                    <span className="text-lg font-mono font-black text-indigo-400 mt-1 block">
                      $ {finiquitoCalculated.montoAvisoPrevio.toLocaleString('es-CL')}
                    </span>
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      {finiquitoCalculated.montoAvisoPrevio > 0 ? '1 mes de sueldo' : 'Sin indemnización'}
                    </span>
                  </div>
                  )}

                  <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700">
                    <span className="text-slate-400 text-[10px] uppercase block font-bold">Vacaciones Proporcionales</span>
                    <span className="text-lg font-mono font-black text-amber-400 mt-1 block">
                      $ {finiquitoCalculated.montoVacaciones.toLocaleString('es-CL')}
                    </span>
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      {finiquitoCalculated.diasPendientesReal} días pend.
                    </span>
                  </div>

                  <div className="bg-emerald-950/80 p-3 rounded-xl border border-emerald-600/50">
                    <span className="text-emerald-300 text-[10px] uppercase block font-bold">Total Líquido Finiquito</span>
                    <span className="text-xl font-mono font-black text-emerald-300 mt-1 block">
                      $ {finiquitoCalculated.totalLiquido.toLocaleString('es-CL')}
                    </span>
                    <span className="text-[10px] text-emerald-400 mt-0.5 block">
                      Monto a pago al trabajador
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          {embebido ? <span /> : <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            Cerrar
          </button>}

          {selectedEmployee && finiquitoCalculated && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleDownloadPDF}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Descargar Finiquito Oficial (PDF)</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
