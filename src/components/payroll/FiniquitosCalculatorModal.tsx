import { formatearRut } from '../../utils/rutFormato';
import React, { useState, useMemo, useEffect } from 'react';
import { 
  FileText, Calculator, Download, Printer, X, CheckCircle2, 
  AlertCircle, DollarSign, Calendar, User, ShieldCheck, ArrowRight, Building2
} from 'lucide-react';
import { Employee, FiniquitoRecord, ChartOfAccount, ProjectMaster, PayrollSlip } from '../../types';
import { formatRut } from '../../utils/rutMatcher';
import { getPrevisionalParametersForPeriod } from '../../utils/payrollCalculator';
import { calcularFiniquito, baseArt172, cuadroDePago } from '../../utils/finiquito';
import FiniquitoMasivoObra from './FiniquitoMasivoObra';
import { escribirFiniquito } from '../../utils/finiquitoPdf';
import { contratoActual } from '../../utils/contratosLaborales';
import jsPDF from 'jspdf';
import { guardarFiniquito, escucharFiniquitos, cambiarEstadoFiniquito, FiniquitoGuardado } from '../../utils/finiquitosGuardados';
import type { DatosDocumentoFiniquito } from '../../utils/finiquitoPdf';

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
  /** Para guardar los finiquitos generados */
  studyId?: string;
  companyId?: string;
}

export const CHILEAN_TERMINATION_CAUSALS = [
  { code: 'ART_161_NECESIDADES', name: 'Art. 161 - Necesidades de la Empresa', requiereIAS: true, requiereAvisoPrevio: true },
  { code: 'ART_159_MUTUO_ACUERDO', name: 'Art. 159 N° 1 - Mutuo Acuerdo de las Partes', requiereIAS: false, requiereAvisoPrevio: false },
  { code: 'ART_159_RENUNCIA', name: 'Art. 159 N° 2 - Renuncia Voluntaria del Trabajador', requiereIAS: false, requiereAvisoPrevio: false },
  { code: 'ART_159_MUERTE', name: 'Art. 159 N° 3 - Muerte del Trabajador', requiereIAS: false, requiereAvisoPrevio: false },
  { code: 'ART_159_VENCIMIENTO', name: 'Art. 159 N° 4 - Vencimiento del Plazo del Contrato', requiereIAS: false, requiereAvisoPrevio: false },
  { code: 'ART_159_CONCLUSION', name: 'Art. 159 N° 5 - Conclusión del Trabajo o Servicio', requiereIAS: false, requiereAvisoPrevio: false },
  { code: 'ART_159_FUERZA_MAYOR', name: 'Art. 159 N° 6 - Caso Fortuito o Fuerza Mayor', requiereIAS: false, requiereAvisoPrevio: false },
  { code: 'ART_160_GRAVE', name: 'Art. 160 - Incumplimiento Grave / Conducta Indebida', requiereIAS: false, requiereAvisoPrevio: false },
  { code: 'ART_163_BIS', name: 'Art. 163 bis - Liquidación Concursal del Empleador', requiereIAS: true, requiereAvisoPrevio: true },
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
  embebido = false,
  studyId,
  companyId
}) => {
  const [modo, setModo] = useState<'individual' | 'masivo' | 'guardados'>('individual');
  const [guardados, setGuardados] = useState<FiniquitoGuardado[]>([]);
  const [avisoGuardado, setAvisoGuardado] = useState<string>('');
  useEffect(() => {
    if (!studyId || !companyId) return;
    return escucharFiniquitos(studyId, companyId, setGuardados);
  }, [studyId, companyId]);
  const descargarGuardado = (g: FiniquitoGuardado) => {
    const d = new jsPDF();
    escribirFiniquito(d, g.documento, formatRut);
    d.save(`Finiquito_${formatearRut(g.employeeRut)}_${g.fechaCese}.pdf`);
  };
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
  const [descuentoAfc, setDescuentoAfc] = useState<number>(0);

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
    const datos = {
      hireDate: contratoActual(selectedEmployee)?.fechaInicio || selectedEmployee.hireDate, fechaCese, contractType: selectedEmployee.contractType,
      requiereIAS: causalConfig.requiereIAS, requiereAvisoPrevio: causalConfig.requiereAvisoPrevio,
      esConclusionObra: causalConfig.code === 'ART_159_CONCLUSION', conAvisoPrevio,
      baseMensual: baseSueldo, ufCese, diasVacacionesTomados: diasVacacionesHabiles,
      otrosHaberes, descuentos: descuentosPrestamos + otrosDescuentos,
      sueldoLiquidoPendiente: incluirSueldo && slipMesCese ? (slipMesCese.liquidoAPagar || 0) : 0,
    };
    const r0 = calcularFiniquito(datos);
    // El aporte AFC del empleador solo se imputa a la indemnización por años de servicio (Art. 13 Ley 19.728)
    const afcAplicado = causalConfig.requiereIAS ? Math.min(descuentoAfc || 0, r0.montoIAS) : 0;
    const r = afcAplicado ? calcularFiniquito({ ...datos, descuentos: datos.descuentos + afcAplicado }) : r0;
    const cuadro = cuadroDePago(r, incluirSueldo ? slipMesCese : null, { otrosHaberes, prestamos: descuentosPrestamos, otrosDescuentos, descuentoAfc: afcAplicado });
    return { ...r, cuadro, baseSueldo, ufCese, sinIAS: causalConfig.requiereIAS && r.anosParaIAS === 0, diasPendientesReal: r.diasVacacionesPendientes };
  }, [selectedEmployee, fechaCese, causalConfig, conAvisoPrevio, diasVacacionesHabiles, descuentosPrestamos, otrosHaberes, otrosDescuentos, incluirSueldo, slipMesCese, descuentoAfc]);
  const esObra = selectedEmployee?.contractType === 'OBRA_FAENA';

  // Al elegir un trabajador con contrato por obra o faena, se propone la causal de conclusión de la obra
  const elegirTrabajador = (id: string) => {
    setSelectedEmployeeId(id);
    const emp = employees.find(e => e.id === id || e.rut === id);
    if (emp?.contractType === 'OBRA_FAENA') setCausalCode('ART_159_CONCLUSION');
  };

  // Generar PDF Oficial del Finiquito
  const handleDownloadPDF = async () => {
    if (!selectedEmployee || !finiquitoCalculated) return;
    const contrato = contratoActual(selectedEmployee);
    const obra = obras.find(o => o.id === contrato?.obraId);
    const { cuadro, ...r } = finiquitoCalculated as any;
    const documento: DatosDocumentoFiniquito = {
      empresa: { nombre: companyName, rut: companyRut, domicilio: companyAddress },
      trabajador: { nombre: selectedEmployee.name, rut: selectedEmployee.rut, cargo: selectedEmployee.position },
      fechaInicio: contrato?.fechaInicio || selectedEmployee.hireDate, fechaCese,
      causal: causalConfig.name, esObra: !!esObra,
      obra: obra ? obra.name : contrato?.obraFaena,
      r, otrosHaberes, periodoSueldo: slipMesCese?.period,
    };
    const doc = new jsPDF();
    escribirFiniquito(doc, documento, formatRut);
    // Todo finiquito generado queda guardado (si se vuelve a generar, la versión anterior pasa al historial)
    if (studyId && companyId) {
      try {
        await guardarFiniquito(studyId, companyId, {
          employeeId: selectedEmployee.id, employeeRut: selectedEmployee.rut, employeeName: selectedEmployee.name,
          causalCodigo: causalConfig.code, causalNombre: causalConfig.name,
          fechaInicio: documento.fechaInicio, fechaCese, obra: documento.obra,
          total: finiquitoCalculated.totalLiquido, documento, cuadro, origen: 'INDIVIDUAL',
        });
        setAvisoGuardado(`Guardado en "Finiquitos generados" (${selectedEmployee.name}, término ${fechaCese}).`);
      } catch (e: any) {
        setAvisoGuardado('No se pudo guardar el finiquito: ' + (e?.message || e) + '. El PDF igual se descargó.');
      }
    }
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
          {studyId && companyId && (
            <button onClick={() => setModo('guardados')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${modo === 'guardados' ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-300 text-slate-700'}`}>Finiquitos generados ({guardados.filter(g => g.estado !== 'ANULADO').length})</button>
          )}
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
              onFiniquitoGenerado={studyId && companyId ? (f) => guardarFiniquito(studyId, companyId, f).then(() => undefined) : undefined}
              onVerIndividual={(id, fecha) => { setModo('individual'); setSelectedEmployeeId(id); setCausalCode('ART_159_CONCLUSION'); setFechaCese(fecha); }}
            />
          </div>
        )}

        {/* Body */}
        {modo === 'guardados' && (
          <div className="p-6 max-h-[80vh] overflow-y-auto">
            {guardados.length === 0 ? (
              <p className="text-xs text-slate-500">Aún no hay finiquitos generados. Cada vez que descargues un finiquito (individual o masivo) quedará guardado aquí.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="p-2">Trabajador</th><th className="p-2">Término</th><th className="p-2">Causal</th><th className="p-2 text-right">Total</th><th className="p-2">Estado</th><th className="p-2"></th>
                  </tr></thead>
                  <tbody>
                    {guardados.map(g => (
                      <tr key={g.id} className={`border-b border-slate-100 ${g.estado === 'ANULADO' ? 'opacity-50 line-through' : ''}`}>
                        <td className="p-2"><span className="font-semibold text-slate-900">{g.employeeName}</span><span className="block text-[10px] text-slate-500">{formatearRut(g.employeeRut)}{g.obra ? ` · ${g.obra}` : ''}</span></td>
                        <td className="p-2 font-mono">{g.fechaCese}</td>
                        <td className="p-2">{g.causalNombre}</td>
                        <td className="p-2 text-right font-mono font-bold">$ {Math.round(g.total || 0).toLocaleString('es-CL')}</td>
                        <td className="p-2">
                          <select value={g.estado} onChange={e => studyId && companyId && cambiarEstadoFiniquito(studyId, companyId, g.id, e.target.value as any)}
                            className="border border-slate-300 rounded-md px-1.5 py-1 text-xs bg-white">
                            <option value="GENERADO">Generado</option><option value="FIRMADO">Firmado</option><option value="PAGADO">Pagado</option><option value="ANULADO">Anulado</option>
                          </select>
                          {(g.historial?.length || 0) > 0 && <span className="block text-[10px] text-slate-500 mt-0.5">{g.historial!.length} versión(es) anterior(es)</span>}
                        </td>
                        <td className="p-2 whitespace-nowrap">
                          <button onClick={() => descargarGuardado(g)} className="px-2 py-1 rounded-md bg-indigo-600 text-white font-semibold mr-1">PDF</button>
                          <button onClick={() => { setModo('individual'); setSelectedEmployeeId(g.employeeId); setCausalCode(g.causalCodigo); setFechaCese(g.fechaCese); }}
                            className="px-2 py-1 rounded-md border border-slate-300 text-slate-700 font-semibold">Corregir</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className={`p-6 space-y-6 max-h-[80vh] overflow-y-auto ${modo !== 'individual' ? 'hidden' : ''}`}>
          {avisoGuardado && <p className="text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{avisoGuardado}</p>}
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

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[11px] font-bold text-slate-700 block">Sueldo del mes de término:</span>
                  {slipMesCese ? (
                    <label className="flex items-center gap-2 mt-1 cursor-pointer">
                      <input type="checkbox" checked={incluirSueldo} onChange={e => setIncluirSueldo(e.target.checked)} className="w-4 h-4 text-indigo-600 rounded" />
                      <span className="text-xs text-slate-800 font-medium">Incluir liquidación {slipMesCese.period} (líquido $ {(slipMesCese.liquidoAPagar || 0).toLocaleString('es-CL')})</span>
                    </label>
                  ) : (
                    <span className="text-xs text-amber-700 block">No hay liquidación guardada de {(fechaCese || '').slice(0, 7)}. Genérala primero (hasta la fecha de término) y vuelve aquí.</span>
                  )}
                </div>

                {causalConfig.requiereAvisoPrevio && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[11px] font-bold text-slate-700 block">Aviso previo dado (30 días):</span>
                  <label className="flex items-center gap-2 mt-1 cursor-pointer">
                    <input type="checkbox" checked={conAvisoPrevio} onChange={e => setConAvisoPrevio(e.target.checked)} className="w-4 h-4 text-indigo-600 rounded" />
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
                {([
                  ['Otros haberes del finiquito ($)', otrosHaberes, setOtrosHaberes, true],
                  ['Préstamos de la empresa a descontar ($)', descuentosPrestamos, setDescuentosPrestamos, true],
                  ['Otros descuentos ($)', otrosDescuentos, setOtrosDescuentos, true],
                  ['Aporte AFC empleador a imputar ($, Art. 13 Ley 19.728)', descuentoAfc, setDescuentoAfc, causalConfig.requiereIAS && finiquitoCalculated.montoIAS > 0],
                ] as [string, number, (n: number) => void, boolean][]).filter(c => c[3]).map(([label, val, set]) => (
                  <div key={label} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                    <span className="text-[11px] font-bold text-slate-700 block">{label}</span>
                    <input type="number" min={0} value={val || ''} onChange={e => set(Number(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-bold text-slate-900" />
                  </div>
                ))}
              </div>

              {/* Cuadro de pago: liquidación del mes + finiquito, solo lo que corresponde */}
              {(() => {
                const c = finiquitoCalculated.cuadro;
                const pesos = (n: number) => (n < 0 ? '- $ ' : '$ ') + Math.abs(n).toLocaleString('es-CL');
                const bloque = (sec: 'LIQUIDACION' | 'FINIQUITO' | 'DESCUENTOS', titulo: string, subtotal: number | null) => {
                  const filas = c.filas.filter(f => f.seccion === sec);
                  if (!filas.length && sec !== 'FINIQUITO') return null;
                  return (
                    <tbody>
                      <tr className="bg-slate-50"><td colSpan={2} className="px-3 py-2 text-xs font-bold text-slate-700">{titulo}</td></tr>
                      {filas.map(f => (
                        <tr key={f.concepto} className="border-t border-slate-100">
                          <td className="px-3 py-1.5 text-xs text-slate-700">{f.concepto}</td>
                          <td className={`px-3 py-1.5 text-xs text-right font-mono ${f.monto < 0 ? 'text-rose-700' : 'text-slate-900'}`}>{pesos(f.monto)}</td>
                        </tr>
                      ))}
                      {sec === 'FINIQUITO' && !filas.length && (
                        <tr className="border-t border-slate-100"><td colSpan={2} className="px-3 py-1.5 text-xs text-slate-500">No corresponden pagos por finiquito con esta causal y antigüedad.</td></tr>
                      )}
                      {subtotal !== null && (
                        <tr className="border-t border-slate-200"><td className="px-3 py-1.5 text-xs font-bold text-slate-800">Subtotal</td><td className="px-3 py-1.5 text-xs text-right font-mono font-bold">{pesos(subtotal)}</td></tr>
                      )}
                    </tbody>
                  );
                };
                return (
                  <div className="rounded-2xl border border-indigo-200 overflow-hidden">
                    <div className="bg-indigo-900 text-white px-4 py-3 flex flex-wrap justify-between gap-2">
                      <span className="font-bold text-sm">Cuadro de pago: {selectedEmployee.name}</span>
                      <span className="text-xs text-indigo-200">{causalConfig.name} · término {fechaCese}</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        {incluirSueldo && slipMesCese
                          ? bloque('LIQUIDACION', `A. Liquidación de remuneraciones ${slipMesCese.period}`, c.totalLiquidacion)
                          : null}
                        {bloque('FINIQUITO', 'B. Pagos por término de contrato', c.totalFiniquito)}
                        {bloque('DESCUENTOS', 'C. Descuentos del finiquito', c.totalDescuentos)}
                        <tbody>
                          <tr className="bg-emerald-50 border-t-2 border-emerald-300">
                            <td className="px-3 py-3 text-sm font-black text-emerald-900">TOTAL A PAGAR AL TRABAJADOR</td>
                            <td className="px-3 py-3 text-right font-mono text-lg font-black text-emerald-900">{pesos(c.total)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    {(c.sinFiniquito.length > 0 || finiquitoCalculated.sinIAS || !slipMesCese) && (
                      <ul className="px-4 py-3 bg-amber-50 text-[11px] text-amber-800 space-y-1 list-disc list-inside">
                        {!slipMesCese && <li>Falta la liquidación de {(fechaCese || '').slice(0, 7)}: el cuadro no incluye el sueldo del mes.</li>}
                        {finiquitoCalculated.sinIAS && <li>Menos de 1 año de antigüedad: no corresponde indemnización por años de servicio (Art. 163).</li>}
                        {c.sinFiniquito.map(t => <li key={t}>{t}</li>)}
                      </ul>
                    )}
                  </div>
                );
              })()}
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

          {modo === 'individual' && selectedEmployee && finiquitoCalculated && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleDownloadPDF}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Generar y guardar finiquito (PDF)</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
