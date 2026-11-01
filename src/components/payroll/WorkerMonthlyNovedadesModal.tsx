import React, { useState } from 'react';
import { Employee, PayrollParameters } from '../../types';
import { MonthPayrollInput } from '../../utils/payrollCalculator';
import { 
  X, Save, Calendar, DollarSign, Clock, ShieldAlert, 
  Briefcase, AlertCircle, CheckCircle2, UserCheck, HeartPulse
} from 'lucide-react';

interface WorkerMonthlyNovedadesModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: Employee;
  periodStr: string;
  currentInput: MonthPayrollInput;
  params: PayrollParameters;
  onSave: (employeeId: string, updatedInput: MonthPayrollInput) => Promise<void> | void;
}

export const WorkerMonthlyNovedadesModal: React.FC<WorkerMonthlyNovedadesModalProps> = ({
  isOpen,
  onClose,
  employee,
  periodStr,
  currentInput,
  params,
  onSave
}) => {
  const [formData, setFormData] = useState<MonthPayrollInput>(() => ({
    ...currentInput,
    sueldoBaseOverride: currentInput.sueldoBaseOverride !== undefined ? currentInput.sueldoBaseOverride : employee.baseSalary,
    diasTrabajados: currentInput.diasTrabajados ?? 30,
    diasLicencia: currentInput.diasLicencia ?? 0,
    diasInasistencia: currentInput.diasInasistencia ?? 0,
    horasExtras50Qty: currentInput.horasExtras50Qty ?? 0,
    bonosImponibles: currentInput.bonosImponibles ?? (employee.bonosPactados || 0),
    comisionesVentas: currentInput.comisionesVentas ?? 0,
    asignacionColacion: currentInput.asignacionColacion ?? (employee.colacionPactada || 0),
    asignacionMovilizacion: currentInput.asignacionMovilizacion ?? (employee.movilizacionPactada || 0),
    viaticos: currentInput.viaticos ?? (employee.viaticosPactados || 0),
    anticipos: currentInput.anticipos ?? 0,
    prestamosEmpresa: currentInput.prestamosEmpresa ?? (employee.descuentoPrestamoCuota || 0),
    descuentoJudicialPensionAlimentos: currentInput.descuentoJudicialPensionAlimentos ?? (employee.descuentoJudicialPensionAlimentos || 0)
  }));

  const [isSaving, setIsSaving] = useState(false);
  const [successNotice, setSuccessNotice] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSave(employee.id, formData);
      setSuccessNotice(true);
      setTimeout(() => {
        setSuccessNotice(false);
        onClose();
      }, 700);
    } catch (err) {
      console.error('Error guardando novedades del mes:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-xl text-white">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white leading-tight">
                  Novedades y Ajuste Salarial del Mes
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-indigo-800 text-indigo-200 rounded-md">
                  {periodStr}
                </span>
              </div>
              <p className="text-xs text-slate-300">
                {employee.name} &bull; RUT: <span className="font-mono font-bold text-amber-300">{employee.rut}</span> &bull; {employee.position}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Security / Integrity Notice */}
        <div className="bg-indigo-50/80 border-b border-indigo-100 px-6 py-2.5 text-xs text-indigo-900 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>
            <strong>Integridad Histórica Garantizada:</strong> Los cambios realizados en este formulario afectan <u>exclusivamente</u> al mes <strong>{periodStr}</strong>. Las liquidaciones de períodos anteriores no se alteran.
          </span>
        </div>

        {successNotice && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-2.5 text-xs text-emerald-900 font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Novedades y sueldo del mes actualizados exitosamente.</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          
          {/* Sección 1: Sueldo Base y Régimen del Mes */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-emerald-600" />
                1. Renta / Sueldo Base del Mes ({periodStr})
              </span>
              {employee.isSueldoEmpresarial && (
                <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-900 rounded-md border border-amber-300">
                  Régimen Sueldo Empresarial (Socio)
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Sueldo Base a Liquidar este Mes ($ CLP) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">$</span>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={formData.sueldoBaseOverride ?? employee.baseSalary}
                    onChange={(e) => setFormData({ ...formData, sueldoBaseOverride: Number(e.target.value) })}
                    className="w-full pl-8 pr-3 py-2 text-sm font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Sueldo pactado en ficha: ${employee.baseSalary?.toLocaleString('es-CL')} | Puedes variarlo libremente este mes sin alterar meses pasados.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Jornada Pactada
                </label>
                <div className="p-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 flex items-center justify-between">
                  <span>{employee.workHoursPerWeek || 44} hrs semanales</span>
                  <span className="text-[11px] text-slate-400">
                    {(employee.workHoursPerWeek || 45) < 40 ? 'Medio Tiempo / Parcial' : 'Jornada Ordinaria'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Sección 2: Días Trabajados, Licencias Médicas e Inasistencias */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <span className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-indigo-600" />
              2. Asistencia, Licencias Médicas (SIL) y Horas Extras
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Días Trabajados (0 a 30)
                </label>
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={formData.diasTrabajados ?? 30}
                  onChange={(e) => setFormData({ ...formData, diasTrabajados: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs font-bold text-center text-slate-900 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                  <HeartPulse className="w-3.5 h-3.5 text-rose-500" />
                  Días Licencia Médica
                </label>
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={formData.diasLicencia ?? 0}
                  onChange={(e) => {
                    const lic = Number(e.target.value);
                    setFormData(prev => ({
                      ...prev,
                      diasLicencia: lic,
                      diasTrabajados: Math.max(0, 30 - lic - (prev.diasInasistencia || 0))
                    }));
                  }}
                  className="w-full px-3 py-2 text-xs font-bold text-center text-rose-800 bg-white border border-rose-300 rounded-xl focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Días Inasistencia
                </label>
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={formData.diasInasistencia ?? 0}
                  onChange={(e) => {
                    const inas = Number(e.target.value);
                    setFormData(prev => ({
                      ...prev,
                      diasInasistencia: inas,
                      diasTrabajados: Math.max(0, 30 - (prev.diasLicencia || 0) - inas)
                    }));
                  }}
                  className="w-full px-3 py-2 text-xs font-bold text-center text-slate-800 bg-white border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Horas Extras al 50%
                </label>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={formData.horasExtras50Qty ?? 0}
                  onChange={(e) => setFormData({ ...formData, horasExtras50Qty: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs font-bold text-center text-slate-900 bg-white border border-slate-300 rounded-xl"
                />
              </div>
            </div>
          </div>

          {/* Sección 3: Haberes Variables (Bonos, Comisiones, Asignaciones) */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <span className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <Briefcase className="w-4 h-4 text-purple-600" />
              3. Haberes Variables y Asignaciones del Mes
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Comisiones por Ventas ($)
                </label>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={formData.comisionesVentas ?? 0}
                  onChange={(e) => setFormData({ ...formData, comisionesVentas: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Bonos de Producción / Metas ($)
                </label>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={formData.bonosImponibles ?? 0}
                  onChange={(e) => setFormData({ ...formData, bonosImponibles: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Asignación de Colación ($ No Imp.)
                </label>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={formData.asignacionColacion ?? 0}
                  onChange={(e) => setFormData({ ...formData, asignacionColacion: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Asignación Movilización ($ No Imp.)
                </label>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={formData.asignacionMovilizacion ?? 0}
                  onChange={(e) => setFormData({ ...formData, asignacionMovilizacion: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Viáticos de Faena / Traslado ($)
                </label>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={formData.viaticos ?? 0}
                  onChange={(e) => setFormData({ ...formData, viaticos: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded-xl"
                />
              </div>
            </div>
          </div>

          {/* Sección 4: Descuentos Judiciales (Pensión Alimentos), Anticipos y Préstamos */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <span className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-rose-600" />
              4. Descuentos Judiciales y de Empresa
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Retención Judicial Pensión Alimentos ($)
                </label>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={formData.descuentoJudicialPensionAlimentos ?? 0}
                  onChange={(e) => setFormData({ ...formData, descuentoJudicialPensionAlimentos: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs font-mono font-bold text-rose-800 bg-white border border-rose-300 rounded-xl focus:ring-2 focus:ring-rose-500"
                  placeholder="Por orden de Tribunal de Familia"
                />
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Descuento legal obligatorio sobre el alcance líquido.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Anticipos de Sueldo Otorgados ($)
                </label>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={formData.anticipos ?? 0}
                  onChange={(e) => setFormData({ ...formData, anticipos: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Cuota Préstamo de la Empresa ($)
                </label>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={formData.prestamosEmpresa ?? 0}
                  onChange={(e) => setFormData({ ...formData, prestamosEmpresa: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded-xl"
                />
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Guardando...' : `Guardar Novedades de ${periodStr}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
