import { formatearRut } from '../utils/rutFormato';
import React, { useState, useMemo, useEffect } from 'react';
import { generarArchivoPrevired105, NOMBRE_MUTUAL, NOMBRE_CCAF } from '../utils/previred105';
import PreviredLibroView from './payroll/PreviredLibroView';
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { auth } from '../lib/firebase';
import { 
  FileSpreadsheet, Calculator, Download, CheckCircle2, AlertCircle, 
  Printer, ArrowRight, DollarSign, Shield, HeartPulse, Building2, 
  Users, UserCheck, Sparkles, RefreshCw, Eye, ChevronRight, FileText, 
  Layers, Lock, Check, Send, AlertTriangle, ArrowUpRight, SlidersHorizontal, Table,
  Calendar, Upload, History, ChevronLeft, Settings, Plus, Trash2, BookOpen
} from 'lucide-react';
import { 
  Employee, PayrollSlip, PayrollParameters, ChartOfAccount, 
  Voucher, VoucherLine, CostCenterMaster, PayrollConcept, SalaryHistoryEntry, AnnualReliquidation,
  MasterAccountingParameters
} from '../types';
import { triggerIframePrint } from '../utils/printUtils';
import { crearPdfLiquidacion, nombreArchivoLiquidacion } from '../utils/liquidacionPdf';
import { 
  DEFAULT_PAYROLL_PARAMS_2026, DEFAULT_AFP_COMMISSIONS, PREVIRED_AFP_CODES,
  DEFAULT_PAYROLL_CONCEPTS, getPrevisionalParametersForPeriod, getLegalWeeklyHours,
  calculatePayrollSlip, sueldoVigenteDelPeriodo, generatePreviredTxt, generateLrdCsv, MonthPayrollInput 
} from '../utils/payrollCalculator';
import { OFFICIAL_UF_MONTHLY_START, OFFICIAL_MONTHLY_UTM, syncOnlineChileanIndicators } from '../utils/chileanEconomicIndicators';
import { getNextPeriodStr, getPrevPeriodStr, getPeriodFormattedName } from '../utils/periodUtils';
import { WorkerParametersModal } from './payroll/WorkerParametersModal';
import { SalaryHistoryModal } from './payroll/SalaryHistoryModal';
import { PayrollConceptsModal } from './payroll/PayrollConceptsModal';
import { ExcelBulkImportModal } from './payroll/ExcelBulkImportModal';
import { ReliquidacionesView } from './payroll/ReliquidacionesView';
import { PreviredReceptorModal } from './payroll/PreviredReceptorModal';
import { WorkerMonthlyNovedadesModal } from './payroll/WorkerMonthlyNovedadesModal';
import { FiniquitosCalculatorModal } from './payroll/FiniquitosCalculatorModal';
import { StandardModuleHeader } from './StandardModuleHeader';

interface LiquidacionSueldosViewProps {
  companyId: string;
  companyName: string;
  companyRut: string;
  companyAddress?: string;
  companyGiro?: string;
  employees: Employee[];
  accounts: ChartOfAccount[];
  costCenters: CostCenterMaster[];
  vouchers: Voucher[];
  onSavePayrollSlips: (slips: PayrollSlip[]) => Promise<void>;
  onResetPayrollSlips?: (periodToReset?: string) => Promise<void>;
  /** Registra el comprobante; si se indican, anula en la misma operación los comprobantes anteriores del período. */
  onCentralizePayrollVoucher: (voucher: Omit<Voucher, 'id' | 'createdAt'>, anularIds?: string[]) => Promise<string>;
  /** Guarda las cuentas de remuneraciones elegidas por el usuario (en Parámetros contables de la empresa). */
  onSaveMasterParams?: (patch: Record<string, string>) => Promise<void>;
  /** Estudio de la empresa: novedades del mes, estado del período y libro Previred se guardan dentro del estudio. */
  studyId?: string;
  onNavigateToLibroDiario?: (voucherId: string) => void;
  onOpenVoucher?: (voucherRef: Voucher | string | number) => void;
  savedSlips?: PayrollSlip[];
  initialTab?: 'NOMINA' | 'LIQUIDACION_INDIVIDUAL' | 'CONCEPTOS' | 'RELIQUIDACIONES' | 'PARAMETROS' | 'LRD_DT' | 'PREVIRED';
  onTabChange?: (tab: 'NOMINA' | 'LIQUIDACION_INDIVIDUAL' | 'CONCEPTOS' | 'RELIQUIDACIONES' | 'PARAMETROS' | 'LRD_DT' | 'PREVIRED') => void;
  onNavigateToEmployees?: (subTab?: string) => void;
  onSaveEmployee?: (employee: Employee) => Promise<void> | void;
  savedConcepts?: PayrollConcept[];
  onSaveConcept?: (concept: PayrollConcept) => Promise<void> | void;
  onDeleteConcept?: (conceptId: string) => Promise<void> | void;
  savedReliquidations?: AnnualReliquidation[];
  onSaveReliquidation?: (reliquidation: AnnualReliquidation) => Promise<void> | void;
  defaultYear?: number;
  defaultMonth?: number;
  masterParams?: MasterAccountingParameters | null;
}

export const LiquidacionSueldosView: React.FC<LiquidacionSueldosViewProps> = ({
  companyId,
  companyName,
  companyRut,
  companyAddress,
  companyGiro,
  employees,
  accounts,
  costCenters,
  vouchers,
  onSavePayrollSlips,
  onResetPayrollSlips,
  onCentralizePayrollVoucher,
  onNavigateToLibroDiario,
  onOpenVoucher,
  savedSlips = [],
  initialTab = 'NOMINA',
  onTabChange,
  onNavigateToEmployees,
  onSaveEmployee,
  savedConcepts = [],
  onSaveConcept,
  onDeleteConcept,
  savedReliquidations = [],
  onSaveReliquidation,
  defaultYear = 2026,
  defaultMonth = 1,
  masterParams,
  onSaveMasterParams,
  studyId
}) => {
  // Estado de Período
  const [selectedYear, setSelectedYear] = useState<number>(() => defaultYear || 2026);
  const [selectedMonth, setSelectedMonth] = useState<number>(() => defaultMonth || 1);
  const periodStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;

  // Sincronizar período con cambios desde props externas
  React.useEffect(() => {
    if (defaultYear && defaultYear !== selectedYear) {
      setSelectedYear(defaultYear);
    }
    if (defaultMonth && defaultMonth !== selectedMonth) {
      setSelectedMonth(defaultMonth);
    }
  }, [defaultYear, defaultMonth]);

  // Pestaña activa dentro del módulo
  const [activeTab, setActiveTab] = useState<'NOMINA' | 'LIQUIDACION_INDIVIDUAL' | 'CONCEPTOS' | 'RELIQUIDACIONES' | 'PARAMETROS' | 'LRD_DT' | 'PREVIRED'>(initialTab);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [payrollViewMode, setPayrollViewMode] = useState<'RESUMEN' | 'EXCEL_COMPLETO'>('RESUMEN');

  // Modales de Colaborador y Conceptos
  const [selectedEmployeeForParams, setSelectedEmployeeForParams] = useState<Employee | null>(null);
  const [selectedEmployeeForSalaryHistory, setSelectedEmployeeForSalaryHistory] = useState<Employee | null>(null);
  const [selectedEmployeeForNovedades, setSelectedEmployeeForNovedades] = useState<Employee | null>(null);
  const [isConceptsModalOpen, setIsConceptsModalOpen] = useState(false);
  const [isExcelBulkImportOpen, setIsExcelBulkImportOpen] = useState(false);
  const [isPreviredReceptorOpen, setIsPreviredReceptorOpen] = useState(false);
  const [isFiniquitosModalOpen, setIsFiniquitosModalOpen] = useState(false);

  // Conceptos dinámicos en memoria y sincronizados
  const [companyConcepts, setCompanyConcepts] = useState<PayrollConcept[]>(() => {
    if (savedConcepts && savedConcepts.length > 0) return savedConcepts;
    return DEFAULT_PAYROLL_CONCEPTS.map(c => ({
      ...c,
      id: `concept_${companyId}_${c.code}`,
      companyId
    }));
  });

  // Actualizar conceptos si cambian las props
  React.useEffect(() => {
    if (savedConcepts && savedConcepts.length > 0) {
      setCompanyConcepts(savedConcepts);
    }
  }, [savedConcepts]);

  // Sincronización en línea de indicadores económicos (UF / UTM)
  const [isSyncingIndicators, setIsSyncingIndicators] = useState<boolean>(false);
  // Novedades mensuales (días, horas extras, bonos, sueldo del mes, anticipos)
  const [monthInputs, setMonthInputs] = useState<Record<string, MonthPayrollInput>>({});
  const [syncNotice, setSyncNotice] = useState<string>('');
  const [liveUfOverride, setLiveUfOverride] = useState<number | null>(null);
  const [liveUtmOverride, setLiveUtmOverride] = useState<number | null>(null);

  React.useEffect(() => {
    if (initialTab && initialTab !== activeTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const handleSwitchTab = (tab: 'NOMINA' | 'LIQUIDACION_INDIVIDUAL' | 'CONCEPTOS' | 'RELIQUIDACIONES' | 'PARAMETROS' | 'LRD_DT' | 'PREVIRED') => {
    setActiveTab(tab);
    onTabChange?.(tab);
  };

  // Estado local para parámetros cargados centralizadamente desde Firestore (Super Administrador o Administrador de Estudio)
  const [firestorePrevisionalParams, setFirestorePrevisionalParams] = useState<PayrollParameters | null>(null);
  const [isEditingPeriodIndicators, setIsEditingPeriodIndicators] = useState(false);
  const [indicatorFormData, setIndicatorFormData] = useState<PayrollParameters | null>(null);
  const [isSavingIndicators, setIsSavingIndicators] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchCentralizedIndicators = async () => {
      try {
        const cached = localStorage.getItem(`gestok_previred_params_${companyId}_${periodStr}`);
        if (cached && isMounted) {
          try {
            setFirestorePrevisionalParams(JSON.parse(cached));
          } catch {}
        }

        // 1. Buscar si la empresa tiene indicadores personalizados cargados por el administrador para este mes
        let snap = await getDoc(doc(db, 'companies', companyId, 'previsionalIndicators', periodStr));
        if (!snap.exists()) {
          // 2. Si no, buscar si hay indicadores globales centralizados
          snap = await getDoc(doc(db, 'previsionalIndicators', periodStr));
        }

        if (snap.exists() && isMounted) {
          const data = snap.data() as PayrollParameters;
          setFirestorePrevisionalParams(data);
          try {
            localStorage.setItem(`gestok_previred_params_${companyId}_${periodStr}`, JSON.stringify(data));
          } catch {}
        } else if (isMounted) {
          setFirestorePrevisionalParams(getPrevisionalParametersForPeriod(periodStr));
        }
      } catch (err) {
        console.warn('Could not fetch centralized previsional indicators:', err);
      }
    };
    fetchCentralizedIndicators();
    return () => { isMounted = false; };
  }, [companyId, periodStr]);

  // Novedades del mes (sueldo del mes, días, horas extras, bonos, etc.): se guardan en la base de datos del estudio
  // y se escuchan en línea. Si existen datos de la versión anterior (ruta antigua o este navegador), se migran.
  const refNovedades = useMemo(() => (studyId ? doc(db, 'studies', studyId, 'companies', companyId, 'monthlyPayrollInputs', periodStr) : null), [studyId, companyId, periodStr]);
  const refEstadoPeriodo = useMemo(() => (studyId ? doc(db, 'studies', studyId, 'companies', companyId, 'payrollPeriods', periodStr) : null), [studyId, companyId, periodStr]);
  const [estadoPeriodoDoc, setEstadoPeriodoDoc] = useState<{ estado?: 'ABIERTO' | 'PROCESADO' | 'CERRADO'; procesadoEn?: string; procesadoPor?: string; cerradoEn?: string; cerradoPor?: string } | null>(null);
  useEffect(() => {
    setMonthInputs({});
    if (!refNovedades) return;
    let migrado = false;
    const unsub = onSnapshot(refNovedades, async snap => {
      if (snap.exists()) { setMonthInputs((snap.data() as any) || {}); return; }
      if (migrado) { setMonthInputs({}); return; }
      migrado = true;
      // Migración: ruta antigua fuera del estudio, o lo guardado sólo en este navegador
      let antiguo: Record<string, MonthPayrollInput> | null = null;
      try { const o = await getDoc(doc(db, 'companies', companyId, 'monthlyPayrollInputs', periodStr)); if (o.exists()) antiguo = o.data() as any; } catch { /* sin permiso a la ruta antigua */ }
      if (!antiguo) { try { const c = localStorage.getItem(`gestok_month_inputs_${companyId}_${periodStr}`); if (c) antiguo = JSON.parse(c); } catch { /* nada */ } }
      if (antiguo && Object.keys(antiguo).length) { try { await setDoc(refNovedades, antiguo); } catch { setMonthInputs(antiguo); } }
      else setMonthInputs({});
    }, err => { console.warn('Novedades del mes:', err); });
    return () => unsub();
  }, [refNovedades, companyId, periodStr]);
  useEffect(() => {
    setEstadoPeriodoDoc(null);
    if (!refEstadoPeriodo) return;
    return onSnapshot(refEstadoPeriodo, snap => setEstadoPeriodoDoc(snap.exists() ? (snap.data() as any) : null), () => {});
  }, [refEstadoPeriodo]);

  /** Graba las novedades del mes. Si falla, se avisa (nunca se pierde en silencio). */
  const grabarNovedades = async (updated: Record<string, MonthPayrollInput>) => {
    try { localStorage.setItem(`gestok_month_inputs_${companyId}_${periodStr}`, JSON.stringify(updated)); } catch { /* sin almacenamiento */ }
    if (!refNovedades) return;
    try {
      // Firestore no acepta undefined
      await setDoc(refNovedades, JSON.parse(JSON.stringify(updated)));
    } catch (e: any) {
      alert(`No se pudo grabar el cambio del período ${periodStr}: ${e?.code === 'permission-denied' ? 'tu usuario no tiene permiso de escritura en esta empresa.' : (e?.message || e)}`);
    }
  };

  // Parámetros previsionales del período seleccionado (actualizados automáticamente con datos oficiales de Previred / SII o del Super Administrador)
  const periodParams: PayrollParameters = useMemo(() => {
    const base = firestorePrevisionalParams 
      ? { ...firestorePrevisionalParams }
      : getPrevisionalParametersForPeriod(periodStr);

    const currentMonthStr = new Date().toISOString().slice(0, 7);
    if (liveUfOverride && periodStr === currentMonthStr) {
      base.uf = liveUfOverride;
    }
    if (liveUtmOverride && periodStr === currentMonthStr) {
      base.utm = liveUtmOverride;
    }
    return base;
  }, [periodStr, firestorePrevisionalParams, liveUfOverride, liveUtmOverride]);

  // --- Regla de Control de Períodos de Remuneraciones ---
  // 1. Obtener lista ordenada de períodos procesados y guardados en savedSlips (desde 2026 en adelante)
  const savedPeriods = useMemo(() => {
    const list = Array.from(new Set(savedSlips.map(s => s.period))).filter(p => p && p >= '2026-01');
    list.sort();
    return list;
  }, [savedSlips]);

  // 2. Determinar el último período cerrado/procesado
  const latestSavedPeriod = useMemo(() => {
    if (savedPeriods.length === 0) return null;
    return savedPeriods[savedPeriods.length - 1];
  }, [savedPeriods]);

  // 3. El mes activo abierto permitido para calcular/simular remuneraciones (mínimo Enero 2026)
  const activeOpenPeriod = useMemo(() => {
    if (!latestSavedPeriod) {
      return '2026-01';
    }
    const next = getNextPeriodStr(latestSavedPeriod);
    return next < '2026-01' ? '2026-01' : next;
  }, [latestSavedPeriod]);

  // 4. Identificar si el período seleccionado (periodStr) es un período futuro bloqueado
  // Permitimos procesar libremente cualquier período abierto o seleccionado desde 2026 sin bloqueo secuencial estricto.
  const isFuturePeriodBlocked = useMemo(() => {
    return false;
  }, [periodStr]);

  // Identificar si el período actual ya fue procesado y guardado previamente
  const isPeriodProcessed = useMemo(() => {
    return savedSlips.some(s => s.period === periodStr);
  }, [savedSlips, periodStr]);
  // Estado del mes: ABIERTO (se calcula en vivo), PROCESADO (liquidaciones grabadas, aún se puede corregir y reprocesar)
  // y CERRADO (las liquidaciones quedan fijas: nada de lo que cambie después en fichas, sueldos o parámetros las modifica).
  const estadoPeriodo: 'ABIERTO' | 'PROCESADO' | 'CERRADO' = estadoPeriodoDoc?.estado === 'CERRADO' ? 'CERRADO' : (estadoPeriodoDoc?.estado === 'PROCESADO' || isPeriodProcessed ? 'PROCESADO' : 'ABIERTO');
  const periodoCerrado = estadoPeriodo === 'CERRADO';

  const handleSyncOnlineIndicators = async () => {
    setIsSyncingIndicators(true);
    try {
      const series = await syncOnlineChileanIndicators();
      const latest = series[series.length - 1];
      if (latest) {
        if (latest.uf > 0) setLiveUfOverride(latest.uf);
        if (latest.utm > 0) setLiveUtmOverride(latest.utm);
        setSyncNotice(`Indicadores sincronizados con éxito desde fuentes oficiales: UF $${latest.uf.toLocaleString('es-CL')} | UTM $${latest.utm.toLocaleString('es-CL')} (al ${latest.date})`);
      }
    } catch (err: any) {
      setSyncNotice('No se pudo conectar al servicio en vivo. Se mantienen los parámetros matemáticos oficiales certificados.');
    } finally {
      setIsSyncingIndicators(false);
      setTimeout(() => setSyncNotice(''), 7000);
    }
  };


  // Slips del mes calculados o cargados (Guardia: No calcula liquidaciones si el período es futuro bloqueado)
  const slipsForPeriod: PayrollSlip[] = useMemo(() => {
    if (isFuturePeriodBlocked) {
      return []; // No se entregan ni calculan liquidaciones del futuro
    }

    const existingForPeriod = savedSlips.filter(s => s.period === periodStr);
    // Mes cerrado: se muestran exactamente las liquidaciones grabadas al cerrar
    if (periodoCerrado) return existingForPeriod;
    const periodStart = `${periodStr}-01`;
    const periodEnd = `${periodStr}-31`;

    // Filtrar trabajadores elegibles para este período:
    // 1. Trabajadores que ya tengan una liquidación guardada en este período
    // 2. Trabajadores activos cuya fecha de ingreso (hireDate) sea menor o igual al fin de este período
    //    (Un trabajador que ingresa el 01-01-2026 se incluye al 100% con 30 días trabajados en Enero 2026)
    // 3. Excluye trabajadores con fecha de ingreso en meses futuros o finiquitados con anterioridad
    const eligibleEmployees = employees.filter(emp => {
      if (existingForPeriod.some(s => s.employeeId === emp.id)) return true;
      if (emp.active === false) return false;
      if (emp.hireDate && emp.hireDate > periodEnd) return false;
      if (emp.terminationDate && emp.terminationDate < periodStart) return false;
      return true;
    });
    
    return eligibleEmployees.map(emp => {
      const existing = existingForPeriod.find(s => s.employeeId === emp.id);
      const input = monthInputs[emp.id] || {};
      
      // Liquidación ya procesada y sin novedades nuevas para el trabajador: se muestra la grabada (no se recalcula con datos actuales)
      if (existing && Object.keys(input).length === 0) {
        return existing;
      }

      return calculatePayrollSlip(emp, periodParams, input, companyConcepts);
    });
  }, [employees, savedSlips, periodStr, periodParams, monthInputs, companyConcepts, isFuturePeriodBlocked, periodoCerrado]);

  // Resumen / Totales de la nómina del mes
  const totals = useMemo(() => {
    return slipsForPeriod.reduce((acc, s) => {
      acc.totalEmployees += 1;
      acc.totalImponible += s.totalHaberesImponibles;
      acc.totalNoImponible += s.totalHaberesNoImponibles;
      acc.totalHaberes += s.totalHaberes;
      acc.totalAfp += s.afpMonto;
      acc.totalSalud += s.saludMontoTotal;
      acc.totalAfcTrabajador += s.afcTrabajadorMonto;
      acc.totalImpuestoUnico += s.impuestoUnicoSegundaCategoria;
      acc.totalAnticipos += s.anticipos;
      acc.totalOtrosDescuentos += s.totalOtrosDescuentos;
      acc.totalDescuentos += s.totalDescuentos;
      acc.totalLiquido += s.liquidoAPagar;
      acc.totalSis += s.sisMonto;
      acc.totalAfcEmpleador += s.afcEmpleadorMonto;
      acc.totalMutual += s.mutualMonto;
      acc.totalAportesPatronales += s.totalAportesPatronales;
      acc.costoTotalEmpresa += s.costoTotalEmpresa;
      return acc;
    }, {
      totalEmployees: 0,
      totalImponible: 0,
      totalNoImponible: 0,
      totalHaberes: 0,
      totalAfp: 0,
      totalSalud: 0,
      totalAfcTrabajador: 0,
      totalImpuestoUnico: 0,
      totalAnticipos: 0,
      totalOtrosDescuentos: 0,
      totalDescuentos: 0,
      totalLiquido: 0,
      totalSis: 0,
      totalAfcEmpleador: 0,
      totalMutual: 0,
      totalAportesPatronales: 0,
      costoTotalEmpresa: 0
    });
  }, [slipsForPeriod]);

  // Liquidación individual seleccionada
  const activeSlip = useMemo(() => {
    if (!selectedEmployeeId && slipsForPeriod.length > 0) {
      return slipsForPeriod[0];
    }
    return slipsForPeriod.find(s => s.employeeId === selectedEmployeeId) || slipsForPeriod[0] || null;
  }, [slipsForPeriod, selectedEmployeeId]);

  // Verificar si ya existe un comprobante contable de centralización para este mes
  const existingCentralizationVoucher = useMemo(() => {
    return vouchers.find(v => 
      v.type === 'Traspaso' && 
      (v.gloss || '').toLowerCase().includes('centralización remuneraciones') &&
      (v.gloss || '').toLowerCase().includes(periodStr)
    );
  }, [vouchers, periodStr]);

  const [isCentralizing, setIsCentralizing] = useState(false);
  const [createdVoucherId, setCreatedVoucherId] = useState<string | null>(null);

  // Manejador de cambio de novedades y renta de un colaborador para este período específico
  const handleInputChange = (employeeId: string, field: keyof MonthPayrollInput, value: number) => {
    if (periodoCerrado) { alert(`El mes ${periodStr} está cerrado. Para modificarlo, primero reábrelo.`); return; }
    setMonthInputs(prev => {
      const updated = {
        ...prev,
        [employeeId]: {
          ...(prev[employeeId] || {}),
          [field]: value
        }
      };
      grabarNovedades(updated);
      return updated;
    });
  };

  // Sincronizar novedades importadas desde Previred
  const handleApplyNovedadesFromPrevired = async (novedades: Record<string, MonthPayrollInput>) => {
    setMonthInputs(prev => {
      const updated = { ...prev };
      for (const [empId, data] of Object.entries(novedades)) {
        updated[empId] = {
          ...(updated[empId] || {}),
          ...data
        };
      }
      grabarNovedades(updated);
      return updated;
    });
  };

  // Guardar novedades completas de un colaborador para el mes
  const handleSaveWorkerMonthlyNovedades = async (employeeId: string, updatedInput: MonthPayrollInput) => {
    setMonthInputs(prev => {
      const updated = {
        ...prev,
        [employeeId]: updatedInput
      };
      grabarNovedades(updated);
      return updated;
    });
  };

  // Guardar indicadores del período configurados por el administrador
  const handleSavePeriodIndicators = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!indicatorFormData) return;
    setIsSavingIndicators(true);
    try {
      const toSave: PayrollParameters = {
        ...indicatorFormData,
        period: periodStr
      };

      // Guardar en la empresa para este período y en el registro central
      await setDoc(doc(db, 'companies', companyId, 'previsionalIndicators', periodStr), toSave, { merge: true });
      await setDoc(doc(db, 'previsionalIndicators', periodStr), toSave, { merge: true });

      setFirestorePrevisionalParams(toSave);
      try {
        localStorage.setItem(`gestok_previred_params_${companyId}_${periodStr}`, JSON.stringify(toSave));
      } catch {}

      setSyncNotice(`Indicadores para el período [${periodStr}] guardados y aplicados exitosamente.`);
      setIsEditingPeriodIndicators(false);
      setTimeout(() => setSyncNotice(''), 7000);
    } catch (err: any) {
      console.error('Error al guardar indicadores:', err);
      alert('Error al guardar indicadores: ' + (err.message || err));
    } finally {
      setIsSavingIndicators(false);
    }
  };

  // Guardar concepto dinámico de haberes o descuentos
  const handleSaveConceptInternal = async (concept: PayrollConcept) => {
    setCompanyConcepts(prev => {
      const idx = prev.findIndex(c => c.id === concept.id || c.code === concept.code);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = concept;
        return copy;
      }
      return [...prev, concept];
    });
    if (onSaveConcept) {
      await onSaveConcept(concept);
    }
  };

  // Eliminar concepto dinámico
  const handleDeleteConceptInternal = async (conceptId: string) => {
    setCompanyConcepts(prev => prev.filter(c => c.id !== conceptId));
    if (onDeleteConcept) {
      await onDeleteConcept(conceptId);
    }
  };

  // Guardar parámetros o vigencias de sueldo del trabajador
  const handleSaveEmployeeInternal = async (updatedEmp: Employee) => {
    if (onSaveEmployee) {
      await onSaveEmployee(updatedEmp);
    }
    setSelectedEmployeeForParams(null);
    setSelectedEmployeeForSalaryHistory(null);
  };

  // Aplicar datos cargados masivamente desde Excel tabulado
  const handleApplyBulkExcelConcepts = (bulkData: Record<string, Record<string, number>>) => {
    setMonthInputs(prev => {
      const next = { ...prev };
      for (const [empId, conceptsMap] of Object.entries(bulkData)) {
        next[empId] = {
          ...(next[empId] || {}),
          conceptValues: {
            ...(next[empId]?.conceptValues || {}),
            ...conceptsMap
          }
        };
      }
      return next;
    });
    setIsExcelBulkImportOpen(false);
  };

  // Navegación rápida de mes a mes
  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear(y => y - 1);
    } else {
      setSelectedMonth(m => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear(y => y + 1);
    } else {
      setSelectedMonth(m => m + 1);
    }
  };

  /**
   * Procesar el mes: graba las liquidaciones calculadas y deja fijo, en las novedades del mes, el sueldo base usado.
   * Así, un cambio de sueldo posterior (en la ficha o desde otro mes) no altera este mes.
   */
  const handleSaveAllSlips = async () => {
    if (periodoCerrado) { alert(`El mes ${periodStr} está cerrado. Para reprocesarlo, primero reábrelo.`); return; }
    if (!slipsForPeriod.length) { alert('No hay liquidaciones para procesar en este mes.'); return; }
    try {
      const fijadas: Record<string, MonthPayrollInput> = { ...monthInputs };
      for (const sl of slipsForPeriod) {
        const inp = fijadas[sl.employeeId] || {};
        if (inp.sueldoBaseOverride === undefined || inp.sueldoBaseOverride === null) fijadas[sl.employeeId] = { ...inp, sueldoBaseOverride: sl.sueldoBasePactado };
      }
      await onSavePayrollSlips(slipsForPeriod.map(sl => ({ ...sl, estado: sl.estado === 'CENTRALIZADA' ? sl.estado : 'APROBADA' })));
      await grabarNovedades(fijadas);
      setMonthInputs(fijadas);
      if (refEstadoPeriodo) await setDoc(refEstadoPeriodo, { estado: 'PROCESADO', procesadoEn: new Date().toISOString(), procesadoPor: auth.currentUser?.email || '' }, { merge: true });
      alert(`Mes ${periodStr} procesado: ${slipsForPeriod.length} liquidaciones grabadas.\n\nCuando esté revisado, ciérralo con "Cerrar mes" para que no cambie más.`);
    } catch (err: any) {
      console.error('Error al procesar liquidaciones:', err);
      alert('No se pudieron grabar las liquidaciones: ' + (err?.message || err));
    }
  };

  /** Cerrar el mes: reprocesa lo pendiente y deja las liquidaciones fijas. */
  const handleCerrarMes = async () => {
    if (!refEstadoPeriodo) return;
    if (!confirm(`¿Cerrar el mes ${periodStr}?\n\nSe grabarán las liquidaciones tal como están y quedarán fijas: los cambios de sueldo, bonos o parámetros que hagas después no modificarán este mes. Podrás reabrirlo si es necesario.`)) return;
    try {
      const fijadas: Record<string, MonthPayrollInput> = { ...monthInputs };
      for (const sl of slipsForPeriod) {
        const inp = fijadas[sl.employeeId] || {};
        if (inp.sueldoBaseOverride === undefined || inp.sueldoBaseOverride === null) fijadas[sl.employeeId] = { ...inp, sueldoBaseOverride: sl.sueldoBasePactado };
      }
      await onSavePayrollSlips(slipsForPeriod.map(sl => ({ ...sl, estado: sl.estado === 'CENTRALIZADA' ? sl.estado : 'APROBADA' })));
      await grabarNovedades(fijadas);
      await setDoc(refEstadoPeriodo, { estado: 'CERRADO', cerradoEn: new Date().toISOString(), cerradoPor: auth.currentUser?.email || '', procesadoEn: estadoPeriodoDoc?.procesadoEn || new Date().toISOString() }, { merge: true });
      alert(`Mes ${periodStr} cerrado.`);
    } catch (err: any) {
      alert('No se pudo cerrar el mes: ' + (err?.message || err));
    }
  };

  const handleReabrirMes = async () => {
    if (!refEstadoPeriodo) return;
    if (!confirm(`¿Reabrir el mes ${periodStr}?\n\nPodrás modificar novedades y reprocesar. Si el mes ya está centralizado en la contabilidad, deberás volver a centralizarlo después de corregir.`)) return;
    try {
      await setDoc(refEstadoPeriodo, { estado: 'PROCESADO', reabiertoEn: new Date().toISOString(), reabiertoPor: auth.currentUser?.email || '' }, { merge: true });
    } catch (err: any) {
      alert('No se pudo reabrir el mes: ' + (err?.message || err));
    }
  };

  /** Nuevo sueldo con vigencia desde el mes seleccionado (historial de la ficha). Los meses anteriores conservan su sueldo. */
  const aplicarSueldoDesdeEsteMes = async (emp: Employee, nuevo: number) => {
    if (!onSaveEmployee || !(nuevo > 0)) return;
    if (!confirm(`¿Registrar $${nuevo.toLocaleString('es-CL')} como sueldo de ${emp.name} desde ${periodStr} en adelante?\n\nLos meses anteriores mantienen su sueldo.`)) return;
    const ahora = new Date().toISOString();
    const [y, m] = periodStr.split('-').map(Number);
    const finAnterior = new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10);
    const historial = [...(emp.salaryHistory || [])].map(h => (h.startDate.slice(0, 7) < periodStr && (!h.endDate || h.endDate.slice(0, 7) >= periodStr)) ? { ...h, endDate: finAnterior, isCurrent: false } : h)
      .filter(h => h.startDate.slice(0, 7) !== periodStr);
    // Si no había historial, el sueldo anterior de la ficha queda registrado hasta el mes previo
    if (!(emp.salaryHistory || []).length && emp.baseSalary > 0) historial.push({ id: `sal_${Date.now()}_ant`, employeeId: emp.id, baseSalary: emp.baseSalary, startDate: (emp.hireDate || '2000-01-01').slice(0, 10), endDate: finAnterior, isCurrent: false, reason: 'Sueldo anterior', createdAt: ahora });
    historial.push({ id: `sal_${Date.now()}`, employeeId: emp.id, baseSalary: nuevo, startDate: `${periodStr}-01`, endDate: null, isCurrent: true, reason: 'Ajuste salarial', createdAt: ahora });
    await onSaveEmployee({ ...emp, baseSalary: nuevo, salaryHistory: historial, updatedAt: ahora });
    alert(`Sueldo actualizado desde ${periodStr}. Los meses cerrados o procesados anteriores no cambian.`);
  };

  // Resetear o limpiar las liquidaciones del período seleccionado
  const handleResetCurrentPeriod = async () => {
    if (!onResetPayrollSlips) return;
    if (periodoCerrado) { alert(`El mes ${periodStr} está cerrado. Para limpiarlo, primero reábrelo.`); return; }
    const confirmMsg = `¿Está seguro de eliminar todas las liquidaciones guardadas para el período ${periodStr}?\n\nEsta acción eliminará los datos guardados de este mes para volver a simular o procesar desde cero.`;
    if (confirm(confirmMsg)) {
      try {
        await onResetPayrollSlips(periodStr);
        alert(`Se han eliminado las liquidaciones guardadas del período ${periodStr}.`);
      } catch (err: any) {
        alert('Error al resetear el período: ' + (err.message || 'Error en el servidor'));
      }
    }
  };

  // Resetear todo el historial de remuneraciones de la empresa
  const handleResetAllPeriods = async () => {
    if (!onResetPayrollSlips) return;
    const confirmMsg = `ATENCIÓN: ¿Está seguro de ELIMINAR TODO EL HISTORIAL DE REMUNERACIONES de la empresa ${companyName}?\n\nEsta acción eliminará de la base de datos todas las liquidaciones de todos los períodos.`;
    if (confirm(confirmMsg)) {
      try {
        await onResetPayrollSlips();
        alert('Se ha limpiado exitosamente todo el historial de remuneraciones.');
      } catch (err: any) {
        alert('Error al limpiar el historial: ' + (err.message || 'Error en el servidor'));
      }
    }
  };

  // Buscar comprobante de centralización de remuneraciones existente para el período
  const existingPayrollVouchers = useMemo(() => {
    return vouchers.filter(v => v.status !== 'Anulado' &&
      (v.origin === 'REMUNERACIONES' || 
       v.origin === 'RRHH' ||
       v.gloss?.toLowerCase().includes(`remuneraciones ${periodStr}`) ||
       v.gloss?.toLowerCase().includes(`sueldos ${periodStr}`) ||
       v.gloss?.toLowerCase().includes(`nómina ${periodStr}`)
      ) &&
      (v.period === periodStr || v.date?.startsWith(periodStr))
    );
  }, [vouchers, periodStr]);
  const existingPayrollVoucher = existingPayrollVouchers[0];

  // Cuentas de la centralización: las elige el usuario la primera vez (como en el F29). El sistema no inventa cuentas.
  const [mapeoRemu, setMapeoRemu] = useState<{ key: string; concepto: string; monto: number; sugerida: string }[] | null>(null);
  const [mapeoRemuElegido, setMapeoRemuElegido] = useState<Record<string, string>>({});
  const cuentasRemuRef = React.useRef<Record<string, string>>({});
  const cuentasMovibles = useMemo(() => accounts.filter(a => (a as any).allowsMovement !== false && !(a as any).isGroup), [accounts]);

  // Centralización Contable Automática
  const handleCentralizePayroll = async () => {
    if (slipsForPeriod.length === 0) {
      alert('No hay liquidaciones calculadas para centralizar.');
      return;
    }

    // 1) Cuentas: cada concepto con monto debe tener una cuenta real del plan, elegida por el usuario
    const mp: any = { ...(masterParams || {}), ...cuentasRemuRef.current };
    const conceptos = [
      { key: 'sueldosGastoAccountId', concepto: 'Gasto remuneraciones imponibles', monto: totals.totalImponible, codes: ['4201001', '420101'], kw: ['sueldo', 'remuneracion'] },
      { key: 'asignacionesGastoAccountId', concepto: 'Gasto asignaciones no imponibles (colación, movilización)', monto: totals.totalNoImponible, codes: ['4201003', '420103'], kw: ['colacion', 'movilizacion'] },
      { key: 'imposicionesGastoAccountId', concepto: 'Gasto aportes del empleador (SIS, AFC, mutual)', monto: totals.totalAportesPatronales, codes: ['4201004', '420104'], kw: ['leyes sociales', 'aporte patronal'] },
      { key: 'sueldosPorPagarAccountId', concepto: 'Remuneraciones por pagar (líquidos)', monto: totals.totalLiquido, codes: ['2103001', '2101003'], kw: ['sueldos por pagar', 'remuneraciones por pagar'] },
      { key: 'retencionSegundaCatAccountId', concepto: 'Impuesto único 2ª categoría por pagar', monto: totals.totalImpuestoUnico, codes: ['2104003'], kw: ['impuesto unico', 'segunda categoria'] },
      { key: 'leyesSocialesPorPagarAccountId', concepto: 'AFP por pagar', monto: totals.totalAfp, codes: ['2105001'], kw: ['afp', 'cotizaciones previsionales', 'imposiciones'] },
      { key: 'saludPorPagarAccountId', concepto: 'Salud por pagar (Fonasa / Isapre)', monto: totals.totalSalud, codes: ['2105002'], kw: ['salud', 'fonasa', 'isapre', 'cotizaciones previsionales'] },
      { key: 'afcPorPagarAccountId', concepto: 'Seguro de cesantía (AFC) por pagar', monto: totals.totalAfcTrabajador + totals.totalAfcEmpleador, codes: ['2105003'], kw: ['cesantia', 'afc', 'cotizaciones previsionales'] },
      { key: 'sisMutualPorPagarAccountId', concepto: 'SIS y mutualidad por pagar', monto: totals.totalSis + totals.totalMutual, codes: ['2105004'], kw: ['mutual', 'sis', 'cotizaciones previsionales'] },
      { key: 'anticiposPersonalAccountId', concepto: 'Anticipos y préstamos al personal (descuento)', monto: totals.totalAnticipos, codes: ['1105001'], kw: ['anticipo', 'prestamo'] },
    ].filter(c => c.monto > 0);
    const sinTilde = (t: string) => (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const faltan = conceptos.filter(c => !(mp[c.key] && accounts.some(a => a.id === mp[c.key])));
    if (faltan.length) {
      const pend = faltan.map(c => {
        const sug = cuentasMovibles.find(a => c.codes.some(k => String(a.code || '').replace(/\./g, '') === k)) ||
          cuentasMovibles.find(a => c.kw.some(k => sinTilde(a.name).includes(k)));
        return { key: c.key, concepto: c.concepto, monto: c.monto, sugerida: sug?.id || '' };
      });
      setMapeoRemuElegido(Object.fromEntries(pend.map(p => [p.key, p.sugerida])));
      setMapeoRemu(pend);
      return;
    }
    const cuenta = (key: string) => {
      const a = accounts.find(x => x.id === mp[key])!;
      return { id: a.id, code: a.code, name: a.name, type: a.type };
    };

    // 2) Comprobante anterior del período: se anula al registrar el nuevo (con aviso)
    const anteriores = existingPayrollVouchers;

    const confirmMsg = `¿Desea generar el comprobante contable de Centralización de Remuneraciones para el período ${periodStr}?\n\n` +
      (anteriores.length ? `⚠️ Ya existe el comprobante N° ${anteriores.map(v => v.voucherNumber || v.id).join(', ')} de este período. Si confirmas, se ANULARÁ y se registrará el nuevo.\n\n` : '') +
      `• Total Haberes Imponibles (Gasto Sueldos): $${totals.totalImponible.toLocaleString('es-CL')}\n` +
      `• Total Asignaciones No Imponibles (Gasto Colación/Mov.): $${totals.totalNoImponible.toLocaleString('es-CL')}\n` +
      `• Aportes Patronales (Gasto SIS/AFC Empleador/Mutual): $${totals.totalAportesPatronales.toLocaleString('es-CL')}\n` +
      `• Total Sueldos Líquidos por Pagar: $${totals.totalLiquido.toLocaleString('es-CL')}\n` +
      `• Retención Impuesto Único 2da Categoría: $${totals.totalImpuestoUnico.toLocaleString('es-CL')}\n` +
      `• Leyes Sociales por Pagar (AFP, Fonasa/Isapre, AFC, SIS, Mutual): $${(totals.totalAfp + totals.totalSalud + totals.totalAfcTrabajador + totals.totalAfcEmpleador + totals.totalSis + totals.totalMutual).toLocaleString('es-CL')}`;

    if (!confirm(confirmMsg)) return;

    try {
      setIsCentralizing(true);

      const accGastoSueldos = conceptos.some(c => c.key === 'sueldosGastoAccountId') ? cuenta('sueldosGastoAccountId') : null as any;
      const accGastoNoImponible = conceptos.some(c => c.key === 'asignacionesGastoAccountId') ? cuenta('asignacionesGastoAccountId') : null as any;
      const accGastoLeyesSociales = conceptos.some(c => c.key === 'imposicionesGastoAccountId') ? cuenta('imposicionesGastoAccountId') : null as any;
      const accSueldosPorPagar = conceptos.some(c => c.key === 'sueldosPorPagarAccountId') ? cuenta('sueldosPorPagarAccountId') : null as any;
      const accImpuestoUnicoPorPagar = conceptos.some(c => c.key === 'retencionSegundaCatAccountId') ? cuenta('retencionSegundaCatAccountId') : null as any;
      const accAfpPorPagar = conceptos.some(c => c.key === 'leyesSocialesPorPagarAccountId') ? cuenta('leyesSocialesPorPagarAccountId') : null as any;
      const accSaludPorPagar = conceptos.some(c => c.key === 'saludPorPagarAccountId') ? cuenta('saludPorPagarAccountId') : null as any;
      const accAfcPorPagar = conceptos.some(c => c.key === 'afcPorPagarAccountId') ? cuenta('afcPorPagarAccountId') : null as any;
      const accSisMutualPorPagar = conceptos.some(c => c.key === 'sisMutualPorPagarAccountId') ? cuenta('sisMutualPorPagarAccountId') : null as any;
      const accAnticiposPersonal = conceptos.some(c => c.key === 'anticiposPersonalAccountId') ? cuenta('anticiposPersonalAccountId') : null as any;

      const lines: VoucherLine[] = [];
      let lineIndex = 1;

      // 1. DÉBITOS (GASTOS)
      if (totals.totalImponible > 0) {
        lines.push({
          id: `line_${lineIndex++}`,
          accountId: accGastoSueldos.id,
          accountCode: accGastoSueldos.code,
          accountName: accGastoSueldos.name,
          
          debit: totals.totalImponible,
          credit: 0,
          gloss: `Remuneraciones Imponibles y Gratificaciones ${periodStr} (${totals.totalEmployees} colaboradores)`,
          auxiliaryRut: companyRut,
          auxiliaryName: companyName,
          documentType: 'REMUNERACIONES',
          documentRef: periodStr
        });
      }

      if (totals.totalNoImponible > 0) {
        lines.push({
          id: `line_${lineIndex++}`,
          accountId: accGastoNoImponible.id,
          accountCode: accGastoNoImponible.code,
          accountName: accGastoNoImponible.name,
          
          debit: totals.totalNoImponible,
          credit: 0,
          gloss: `Asignaciones No Imponibles (Colación, Movilización, Viáticos) ${periodStr}`,
          auxiliaryRut: companyRut,
          auxiliaryName: companyName,
          documentType: 'REMUNERACIONES',
          documentRef: periodStr
        });
      }

      if (totals.totalAportesPatronales > 0) {
        lines.push({
          id: `line_${lineIndex++}`,
          accountId: accGastoLeyesSociales.id,
          accountCode: accGastoLeyesSociales.code,
          accountName: accGastoLeyesSociales.name,
          
          debit: totals.totalAportesPatronales,
          credit: 0,
          gloss: `Aportes Patronales (SIS 1.49%, AFC Empleador, Mutualidad) ${periodStr}`,
          auxiliaryRut: companyRut,
          auxiliaryName: companyName,
          documentType: 'REMUNERACIONES',
          documentRef: periodStr
        });
      }

      // 2. CRÉDITOS (PASIVOS Y RETENCIONES)
      if (totals.totalLiquido > 0) {
        lines.push({
          id: `line_${lineIndex++}`,
          accountId: accSueldosPorPagar.id,
          accountCode: accSueldosPorPagar.code,
          accountName: accSueldosPorPagar.name,
          
          debit: 0,
          credit: totals.totalLiquido,
          gloss: `Sueldos Líquidos a Transferir ${periodStr}`,
          auxiliaryRut: companyRut,
          auxiliaryName: companyName,
          documentType: 'REMUNERACIONES',
          documentRef: periodStr
        });
      }

      if (totals.totalImpuestoUnico > 0) {
        lines.push({
          id: `line_${lineIndex++}`,
          accountId: accImpuestoUnicoPorPagar.id,
          accountCode: accImpuestoUnicoPorPagar.code,
          accountName: accImpuestoUnicoPorPagar.name,
          
          debit: 0,
          credit: totals.totalImpuestoUnico,
          gloss: `Retención Impuesto Único de Segunda Categoría (F.29) ${periodStr}`,
          auxiliaryRut: '60805000-0',
          auxiliaryName: 'Tesorería General de la República',
          documentType: 'F29',
          documentRef: periodStr
        });
      }

      if (totals.totalAfp > 0) {
        lines.push({
          id: `line_${lineIndex++}`,
          accountId: accAfpPorPagar.id,
          accountCode: accAfpPorPagar.code,
          accountName: accAfpPorPagar.name,
          
          debit: 0,
          credit: totals.totalAfp,
          gloss: `Cotizaciones Previsionales AFP por Pagar (Previred) ${periodStr}`,
          auxiliaryRut: '76878900-5',
          auxiliaryName: 'Previred - Fondos de Pensiones',
          documentType: 'PREVIRED',
          documentRef: periodStr
        });
      }

      if (totals.totalSalud > 0) {
        lines.push({
          id: `line_${lineIndex++}`,
          accountId: accSaludPorPagar.id,
          accountCode: accSaludPorPagar.code,
          accountName: accSaludPorPagar.name,
          
          debit: 0,
          credit: totals.totalSalud,
          gloss: `Cotizaciones de Salud por Pagar (Fonasa / Isapres) ${periodStr}`,
          auxiliaryRut: '76878900-5',
          auxiliaryName: 'Previred - Salud',
          documentType: 'PREVIRED',
          documentRef: periodStr
        });
      }

      const totalAfc = totals.totalAfcTrabajador + totals.totalAfcEmpleador;
      if (totalAfc > 0) {
        lines.push({
          id: `line_${lineIndex++}`,
          accountId: accAfcPorPagar.id,
          accountCode: accAfcPorPagar.code,
          accountName: accAfcPorPagar.name,
          
          debit: 0,
          credit: totalAfc,
          gloss: `Seguro de Cesantía AFC (Trabajador + Empleador) ${periodStr}`,
          auxiliaryRut: '76878900-5',
          auxiliaryName: 'AFC Chile',
          documentType: 'PREVIRED',
          documentRef: periodStr
        });
      }

      const totalSisMutual = totals.totalSis + totals.totalMutual;
      if (totalSisMutual > 0) {
        lines.push({
          id: `line_${lineIndex++}`,
          accountId: accSisMutualPorPagar.id,
          accountCode: accSisMutualPorPagar.code,
          accountName: accSisMutualPorPagar.name,
          
          debit: 0,
          credit: totalSisMutual,
          gloss: `Seguro de Invalidez y Sobrevivencia (SIS) y Mutualidad ${periodStr}`,
          auxiliaryRut: '76878900-5',
          auxiliaryName: 'Previred / Mutualidad',
          documentType: 'PREVIRED',
          documentRef: periodStr
        });
      }

      if (totals.totalAnticipos > 0) {
        lines.push({
          id: `line_${lineIndex++}`,
          accountId: accAnticiposPersonal.id,
          accountCode: accAnticiposPersonal.code,
          accountName: accAnticiposPersonal.name,
          
          debit: 0,
          credit: totals.totalAnticipos,
          gloss: `Reverso Descuento de Anticipos y Préstamos de Sueldo ${periodStr}`,
          auxiliaryRut: companyRut,
          auxiliaryName: companyName,
          documentType: 'ANTICIPOS',
          documentRef: periodStr
        });
      }

      // Verificación estricta de cuadratura
      const totalDebit = lines.reduce((sum, l) => sum + (l.debit || 0), 0);
      const totalCredit = lines.reduce((sum, l) => sum + (l.credit || 0), 0);
      const difference = totalDebit - totalCredit;

      // Si existe una discrepancia por redondeo menor a $10, se ajusta en Sueldos por Pagar
      if (Math.abs(difference) > 0 && Math.abs(difference) < 10) {
        const sueldosLine = accSueldosPorPagar && lines.find(l => l.accountId === accSueldosPorPagar.id);
        if (sueldosLine) {
          sueldosLine.credit += difference;
        }
      }

      const voucherPayload: Omit<Voucher, 'id' | 'createdAt'> = {
        voucherNumber: 0, // el número correlativo lo asigna el Libro Diario al registrar
        date: `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${new Date(selectedYear, selectedMonth, 0).getDate()}`,
        period: periodStr,
        type: 'Traspaso',
        gloss: `Centralización Remuneraciones ${periodStr} - Nómina ${totals.totalEmployees} Trabajadores`,
        lines: lines,
        totalDebit: totalDebit,
        totalCredit: totalCredit
      };

      const newVoucherId = await onCentralizePayrollVoucher(voucherPayload, anteriores.map(v => v.id));
      setCreatedVoucherId(newVoucherId);
      await onSavePayrollSlips(slipsForPeriod.map(s => ({ ...s, estado: 'CENTRALIZADA', voucherId: newVoucherId })));

      alert(`Comprobante de remuneraciones ${periodStr} registrado.\n\n` +
        `• Total Debe: $${lines.reduce((sum, l) => sum + (l.debit || 0), 0).toLocaleString('es-CL')}\n` +
        `• Total Haber: $${lines.reduce((sum, l) => sum + (l.credit || 0), 0).toLocaleString('es-CL')}` +
        (anteriores.length ? `\n\nSe anuló el comprobante anterior N° ${anteriores.map(v => v.voucherNumber || v.id).join(', ')}.` : ''));

    } catch (err) {
      console.error('Error al centralizar nómina:', err);
      alert('Error al generar el comprobante contable de remuneraciones.');
    } finally {
      setIsCentralizing(false);
    }
  };

  // Descarga de Archivo Plano Previred
  const handleDownloadPrevired = () => {
    if (slipsForPeriod.length === 0) {
      alert('No hay liquidaciones disponibles para exportar.');
      return;
    }

    const mp: any = masterParams || {};
    const { texto: txtContent, avisos } = generarArchivoPrevired105(slipsForPeriod, employees, periodStr, { codigoMutual: mp.previredMutual || '00', codigoCcaf: mp.previredCcaf || '00' });
    if (avisos.length) alert('Revisa antes de subir a Previred:\n\n• ' + avisos.join('\n• '));
    const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `PREVIRED_${companyRut.replace(/[^0-9Kk]/g, '')}_${periodStr.replace('-', '')}.txt`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Descarga de Libro de Remuneraciones Digital (LRD - DT)
  const handleDownloadLrdCsv = () => {
    if (slipsForPeriod.length === 0) {
      alert('No hay liquidaciones disponibles para exportar.');
      return;
    }

    const csvContent = generateLrdCsv(slipsForPeriod, companyRut, periodStr);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `LRD_DT_${companyRut.replace(/[^0-9Kk]/g, '')}_${periodStr.replace('-', '')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Exportar Planilla Excel Detallada idéntica a la planilla mensual del usuario
  const handleExportExcelDetailedCsv = () => {
    if (slipsForPeriod.length === 0) {
      alert('No hay liquidaciones en el período seleccionado para exportar.');
      return;
    }

    const headers = [
      'PERIODO',
      'RUT',
      'NOMBRES',
      'APELLIDO PATERNO',
      'APELLIDO MATERNO',
      'DIAS T.',
      'REM BASE',
      'REM. PERIC',
      'GRATIF',
      'REM IMPONIBLE',
      'COLACION',
      'MOVILIZACION',
      'T. HABERES',
      'SALUD',
      'PLAN UF',
      '7%',
      'ADIC. SALUD',
      'AFP',
      '%',
      'COT.',
      'EZ. 0,1',
      'CES 0.6%',
      'B. TRIB',
      'TRAMO',
      'I. UNICO',
      'ANTI',
      'LIQ',
      'SIS',
      '% MUT.',
      'MUTUAL',
      'CES 2,4%',
      'T. AFP',
      'FONASA',
      'ISAPRE',
      'APV',
      'PREVIRED'
    ];

    const rows = slipsForPeriod.map(slip => {
      const emp = employees.find(e => e.id === slip.employeeId);
      const nameParts = (emp?.name || slip.employeeName || '').trim().split(/\s+/);
      let nombres = '';
      let apPaterno = '';
      let apMaterno = '';

      if (nameParts.length === 1) {
        nombres = nameParts[0];
      } else if (nameParts.length === 2) {
        nombres = nameParts[0];
        apPaterno = nameParts[1];
      } else if (nameParts.length === 3) {
        nombres = nameParts[0];
        apPaterno = nameParts[1];
        apMaterno = nameParts[2];
      } else if (nameParts.length >= 4) {
        nombres = nameParts.slice(0, nameParts.length - 2).join(' ');
        apPaterno = nameParts[nameParts.length - 2];
        apMaterno = nameParts[nameParts.length - 1];
      }

      const afpRatePct = ((slip.afpTasa || 0) * 100).toFixed(2).replace('.', ',') + '%';
      const isFonasa = slip.healthSystem === 'FONASA';
      const totalIsapre = !isFonasa ? slip.saludMontoTotal : 0;
      const totalFonasa = isFonasa ? slip.saludLegal7 : 0;
      const planUf = emp?.healthPlanType === 'ISAPRE_UF' ? (emp?.healthPlanValue || 0) : 0;
      const afcCes24 = slip.afcEmpleadorMonto || 0;
      const afcCes06 = slip.afcTrabajadorMonto || 0;
      const totalAfp = slip.afpMonto || 0;
      const totalPrevired = (slip.afpMonto + slip.saludMontoTotal + slip.afcTrabajadorMonto + slip.sisMonto + slip.mutualMonto + slip.afcEmpleadorMonto + (slip.apvMonto || 0));

      return [
        periodStr.replace('-', ''),
        emp?.rut || slip.employeeRut,
        `"${nombres.toUpperCase()}"`,
        `"${apPaterno.toUpperCase()}"`,
        `"${apMaterno.toUpperCase()}"`,
        slip.diasTrabajados,
        slip.sueldoBasePactado,
        slip.sueldoBaseProporcional,
        slip.gratificacionLegal,
        slip.totalHaberesImponibles,
        slip.asignacionColacion,
        slip.asignacionMovilizacion,
        slip.totalHaberes,
        slip.healthSystem,
        planUf > 0 ? planUf.toFixed(2).replace('.', ',') : '0',
        slip.saludLegal7,
        slip.saludAdicionalIsapre,
        slip.pensionSystem,
        `"${afpRatePct}"`,
        slip.afpMonto,
        0, // EZ. 0,1
        afcCes06,
        slip.rentaAfectaImpuesto,
        slip.impuestoUnicoSegundaCategoria > 0 ? (slip.tramoImpuestoUnico || '2') : '1',
        slip.impuestoUnicoSegundaCategoria,
        slip.anticipos,
        slip.liquidoAPagar,
        slip.sisMonto,
        '0,93%',
        slip.mutualMonto,
        afcCes24,
        totalAfp,
        totalFonasa,
        totalIsapre,
        slip.apvMonto || 0,
        totalPrevired
      ].join(';');
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Planilla_Remuneraciones_Excel_${companyRut.replace(/[^0-9Kk]/g, '')}_${periodStr.replace('-', '')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Liquidación en PDF real (texto nítido), 1 hoja carta por trabajador
  const periodoTextoSlip = new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric' }).format(new Date(selectedYear, selectedMonth - 1, 1));
  const empresaPdf = { nombre: companyName, rut: companyRut, direccion: companyAddress, giro: companyGiro };
  const handlePrintSlip = () => {
    if (!activeSlip) return;
    crearPdfLiquidacion(activeSlip, empresaPdf, periodoTextoSlip, formatearRut).save(nombreArchivoLiquidacion(activeSlip));
  };
  const handlePrintAllSlips = () => {
    if (!slipsForPeriod.length) return;
    // un solo archivo, una hoja por trabajador
    const pdf = crearPdfLiquidacion(slipsForPeriod[0], empresaPdf, periodoTextoSlip, formatearRut);
    for (const sl of slipsForPeriod.slice(1)) crearPdfLiquidacion(sl, empresaPdf, periodoTextoSlip, formatearRut, pdf);
    pdf.save(`${periodStr.replace('-', '')}_Liquidaciones_${companyName.replace(/\W+/g, '_')}.pdf`);
  };

  return (
    <div className="space-y-6">
      {mapeoRemu && (
        <div className="fixed inset-0 z-[80] bg-slate-900/50 flex items-center justify-center p-4" onClick={() => setMapeoRemu(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-slate-900">Cuentas de la centralización de remuneraciones</h3>
            <p className="text-xs text-slate-600">Elige la cuenta del plan para cada concepto. Se guardan en los parámetros de la empresa y no se vuelven a pedir. El sistema no crea ni inventa cuentas: si falta una, créala primero en el Plan de Cuentas.</p>
            <div className="space-y-2 max-h-[55vh] overflow-y-auto">
              {mapeoRemu.map(m => (
                <div key={m.key} className="grid grid-cols-1 sm:grid-cols-[1fr_auto_260px] gap-2 items-center text-sm">
                  <span className="text-slate-700">{m.concepto}</span>
                  <span className="font-mono text-slate-500 text-xs text-right">${Math.round(m.monto).toLocaleString('es-CL')}</span>
                  <select value={mapeoRemuElegido[m.key] || ''} onChange={e => setMapeoRemuElegido(prev => ({ ...prev, [m.key]: e.target.value }))}
                    className={`border rounded-lg px-2 py-1 text-xs ${mapeoRemuElegido[m.key] ? 'border-slate-300' : 'border-rose-300 bg-rose-50'}`}>
                    <option value="">— Elegir cuenta —</option>
                    {cuentasMovibles.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setMapeoRemu(null)} className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold">Cancelar</button>
              <button
                disabled={mapeoRemu.some(m => !mapeoRemuElegido[m.key])}
                onClick={async () => {
                  const patch = Object.fromEntries(mapeoRemu.map(m => [m.key, mapeoRemuElegido[m.key]]));
                  if (!onSaveMasterParams) { alert('No se pudieron guardar las cuentas.'); return; }
                  await onSaveMasterParams(patch);
                  cuentasRemuRef.current = { ...cuentasRemuRef.current, ...patch };
                  setMapeoRemu(null);
                  setTimeout(() => handleCentralizePayroll(), 50);
                }}
                className="px-3 py-2 rounded-lg bg-indigo-600 disabled:bg-slate-300 text-white text-xs font-bold">Guardar cuentas y centralizar</button>
            </div>
          </div>
        </div>
      )}
      {/* HEADER ESTANDARIZADO DE MÓDULO */}
      <StandardModuleHeader
        title="Remuneraciones"
        icon={Calculator}
        iconBgColor="bg-indigo-600"
        period={{
          selectedPeriod: periodStr,
          onPrevPeriod: handlePrevMonth,
          onNextPeriod: handleNextMonth
        }}
        centralizationStatus={{
          isCentralized: !!existingPayrollVoucher,
          voucherId: existingPayrollVoucher?.id,
          voucherNumber: existingPayrollVoucher?.voucherNumber,
          onViewVoucher: (id) => onNavigateToLibroDiario?.(id),
          onQuickCentralize: handleCentralizePayroll,
          isCentralizing,
          disabled: isFuturePeriodBlocked || slipsForPeriod.length === 0,
          disabledTooltip: slipsForPeriod.length === 0 ? 'Calcule y guarde primero las liquidaciones del período' : undefined
        }}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Botón Carga Masiva Excel Tabulado */}
            <button
              type="button"
              onClick={() => setIsExcelBulkImportOpen(true)}
              className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-300 rounded-xl transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
              title="Cargar haberes y bonos desde Excel tabulado"
            >
              <Upload className="w-3.5 h-3.5 text-emerald-600" />
              <span>Excel Masivo</span>
            </button>

            {/* Botón Configuración de Conceptos */}
            <button
              type="button"
              onClick={() => setIsConceptsModalOpen(true)}
              className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-indigo-50 hover:text-indigo-800 hover:border-indigo-300 rounded-xl transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
              title="Parametrizar conceptos de haberes"
            >
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              <span>Conceptos ({companyConcepts.length})</span>
            </button>

            {/* Botón Principal: Procesar / Guardar Remuneraciones del Mes */}
            <button
              type="button"
              onClick={handleSaveAllSlips}
              disabled={isFuturePeriodBlocked || periodoCerrado}
              className={`px-3.5 py-1.5 text-xs font-bold text-white rounded-xl transition-all flex items-center gap-1.5 shadow-2xs shrink-0 cursor-pointer ${
                isFuturePeriodBlocked
                  ? 'bg-slate-400 cursor-not-allowed opacity-60'
                  : isPeriodProcessed 
                  ? 'bg-slate-800 hover:bg-slate-900 active:bg-black' 
                  : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800'
              }`}
              title={isFuturePeriodBlocked ? 'Período bloqueado' : 'Calcular y procesar liquidaciones'}
            >
              {isFuturePeriodBlocked ? <Lock className="w-3.5 h-3.5 text-slate-200" /> : <Sparkles className="w-3.5 h-3.5 text-amber-300" />}
              <span>{isFuturePeriodBlocked ? 'Bloqueado' : periodoCerrado ? 'Cerrado' : isPeriodProcessed ? 'Reprocesar mes' : 'Procesar mes'}</span>
            </button>

            {/* Cerrar / reabrir mes */}
            {studyId && !periodoCerrado && (
              <button type="button" onClick={handleCerrarMes} disabled={!slipsForPeriod.length}
                className="px-3 py-1.5 text-xs font-bold text-white bg-indigo-700 hover:bg-indigo-800 rounded-xl flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
                title="Grabar y dejar fijas las liquidaciones de este mes">
                <Lock className="w-3.5 h-3.5" /><span>Cerrar mes</span>
              </button>
            )}
            {studyId && periodoCerrado && (
              <button type="button" onClick={handleReabrirMes}
                className="px-3 py-1.5 text-xs font-bold text-indigo-800 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 rounded-xl flex items-center gap-1.5 shadow-2xs cursor-pointer"
                title={`Cerrado ${estadoPeriodoDoc?.cerradoEn ? new Date(estadoPeriodoDoc.cerradoEn).toLocaleString('es-CL') : ''} ${estadoPeriodoDoc?.cerradoPor || ''}`}>
                <Lock className="w-3.5 h-3.5" /><span>Mes cerrado · Reabrir</span>
              </button>
            )}

            {/* Botón Reset / Limpiar Período */}
            {onResetPayrollSlips && isPeriodProcessed && !periodoCerrado && (
              <button
                type="button"
                onClick={handleResetCurrentPeriod}
                className="px-2.5 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-colors flex items-center gap-1 shadow-2xs cursor-pointer"
                title={`Eliminar las liquidaciones guardadas del período ${periodStr}`}
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                <span>Limpiar</span>
              </button>
            )}
          </div>
        }
      />

      {/* Parámetros del período en una sola línea */}
      <p className="px-1 text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
        <span>UF del período <b className="text-slate-800 tabular-nums">${periodParams.uf.toLocaleString('es-CL')}</b></span>
        <span>UTM <b className="text-slate-800 tabular-nums">${periodParams.utm.toLocaleString('es-CL')}</b></span>
        <span>Ingreso mínimo <b className="text-slate-800 tabular-nums">${periodParams.imm.toLocaleString('es-CL')}</b></span>
        <span>Tope AFP y salud <b className="text-slate-800 tabular-nums">{periodParams.topeImponibleAfpUf} UF (${Math.round(periodParams.topeImponibleAfpUf * periodParams.uf).toLocaleString('es-CL')})</b></span>
        <span>SIS empleador <b className="text-slate-800">{periodParams.tasaSisPercent}%</b></span>
      </p>

      {/* Navegación por Pestañas del Módulo */}
      <div className="border-b border-slate-200 flex flex-wrap justify-between items-center bg-white px-3 rounded-xl shadow-xs gap-2">
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => handleSwitchTab('NOMINA')}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'NOMINA'
                ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Users className="w-4 h-4" />
            Nómina Mensual ({slipsForPeriod.length})
          </button>

          <button
            onClick={() => handleSwitchTab('LIQUIDACION_INDIVIDUAL')}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'LIQUIDACION_INDIVIDUAL'
                ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <FileText className="w-4 h-4" />
            Liquidación Oficial
          </button>

          <button
            onClick={() => handleSwitchTab('CONCEPTOS')}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'CONCEPTOS'
                ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Layers className="w-4 h-4 text-indigo-600" />
            Conceptos & Haberes ({companyConcepts.length})
          </button>

          <button
            onClick={() => handleSwitchTab('RELIQUIDACIONES')}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'RELIQUIDACIONES'
                ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Calculator className="w-4 h-4 text-purple-600" />
            Reliquidaciones Anuales (Bonos/Gratif.)
          </button>

          <button
            onClick={() => handleSwitchTab('PARAMETROS')}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'PARAMETROS'
                ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4 text-amber-600" />
            Tablas de Parámetros
          </button>

          <button
            onClick={() => handleSwitchTab('LRD_DT')}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'LRD_DT'
                ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            LRD (DT)
          </button>

          <button
            onClick={() => handleSwitchTab('PREVIRED')}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'PREVIRED'
                ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Send className="w-4 h-4" />
            Previred (.txt)
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setIsPreviredReceptorOpen(true)}
            className="px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="Importar y conciliar cartolas o archivos de 105 campos de Previred"
          >
            <Shield className="w-3.5 h-3.5 text-indigo-600" />
            <span>Conciliador Previred</span>
          </button>

          <button
            type="button"
            onClick={() => setIsFiniquitosModalOpen(true)}
            className="px-3 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="Calcular finiquitos legales, años de servicio (Art. 163), aviso previo y vacaciones"
          >
            <Calculator className="w-3.5 h-3.5 text-rose-600" />
            <span>Finiquitos DT</span>
          </button>

          {onNavigateToEmployees && (
            <button
              onClick={() => onNavigateToEmployees('contracts')}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 transition-colors flex items-center gap-1.5"
              title="Ir al gestor de contratos de trabajo y anexos"
            >
              <FileText className="w-3.5 h-3.5 text-indigo-600" />
              <span>Contratos & Anexos</span>
            </button>
          )}

          {existingCentralizationVoucher && (
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
              <CheckCircle2 className="w-4 h-4" />
              {onOpenVoucher ? (
                <button
                  type="button"
                  onClick={() => onOpenVoucher(existingCentralizationVoucher)}
                  className="font-bold underline hover:text-emerald-950 cursor-pointer"
                  title="Abrir comprobante de remuneraciones para consultar, modificar o anular"
                >
                  Centralizado en Folio #{existingCentralizationVoucher.voucherNumber}
                </button>
              ) : (
                <span>Centralizado en Folio #{existingCentralizationVoucher.voucherNumber}</span>
              )}
              {onNavigateToLibroDiario && (
                <button
                  onClick={() => onNavigateToLibroDiario(existingCentralizationVoucher.id)}
                  className="ml-1 underline hover:text-emerald-900 flex items-center gap-0.5"
                >
                  Ver en Diario <ArrowUpRight className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {isFuturePeriodBlocked ? (
        <div className="bg-slate-900 border-2 border-amber-500 rounded-3xl p-8 max-w-2xl mx-auto my-10 text-center text-white shadow-2xl space-y-6">
          <div className="w-16 h-16 bg-amber-500/20 text-amber-400 rounded-2xl flex items-center justify-center mx-auto border border-amber-500/40 text-3xl shadow-inner">
          </div>
          <div className="space-y-2">
            <span className="px-3 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-bold rounded-full inline-block">
              Regla de Control de Remuneraciones
            </span>
            <h3 className="text-xl font-black text-slate-100 uppercase tracking-wide">
              Período Futuro Bloqueado ({getPeriodFormattedName(periodStr)})
            </h3>
            <p className="text-sm text-slate-300 max-w-lg mx-auto leading-relaxed">
              No se pueden calcular ni emitir liquidaciones de sueldo para el mes de <strong className="text-amber-300">{getPeriodFormattedName(periodStr)}</strong> debido a que el período anterior (<strong className="text-amber-300">{getPeriodFormattedName(activeOpenPeriod)}</strong>) aún se encuentra abierto sin procesar.
            </p>
          </div>

          <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-4 text-left text-xs text-slate-300 space-y-2.5">
            <div className="font-bold text-amber-400 flex items-center gap-2 text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Norma de Procesamiento Mensual:
            </div>
            <p className="text-slate-300 leading-relaxed">
              Durante el transcurso de cada mes ocurren eventos reales que modifican las remuneraciones: <strong>anticipos de sueldo, préstamos de empresa, bonos extraordinarios, licencias médicas, ausencias y horas extras</strong>.
            </p>
            <p className="text-slate-400 leading-relaxed">
              Por esta razón, la normativa legal y contable establece que <strong>mientras no se procese y cierre un mes en remuneraciones, no se puede calcular el mes siguiente</strong>.
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                const [y, m] = activeOpenPeriod.split('-').map(Number);
                setSelectedYear(y);
                setSelectedMonth(m);
              }}
              className="w-full sm:w-auto px-6 py-3 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-950 font-black text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4 fill-current" />
              Ir al Período Activo Abierto: {getPeriodFormattedName(activeOpenPeriod)}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* PESTAÑA 1: NÓMINA MENSUAL DE SUELDOS */}
          {activeTab === 'NOMINA' && (
        <div className="space-y-6">
          {/* Resumen de la nómina: una sola franja compacta */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-slate-200">
            <div className="px-4 py-2.5" title={`${totals.totalEmployees} ${totals.totalEmployees === 1 ? 'trabajador' : 'trabajadores'}: sueldo base, gratificación, horas extra y bonos`}>
              <p className="text-[11px] font-semibold text-slate-500">Imponible <span className="font-normal">({totals.totalEmployees} {totals.totalEmployees === 1 ? 'trabajador' : 'trabajadores'})</span></p>
              <p className="text-lg font-bold tabular-nums text-slate-900 leading-tight">${totals.totalImponible.toLocaleString('es-CL')}</p>
            </div>
            <div className="px-4 py-2.5" title="AFP, salud, cesantía e impuesto único">
              <p className="text-[11px] font-semibold text-slate-500">Retenciones al trabajador</p>
              <p className="text-lg font-bold tabular-nums text-rose-700 leading-tight">${(totals.totalAfp + totals.totalSalud + totals.totalAfcTrabajador + totals.totalImpuestoUnico).toLocaleString('es-CL')}</p>
            </div>
            <div className="px-4 py-2.5" title="Lo que se transfiere a los trabajadores">
              <p className="text-[11px] font-semibold text-slate-500">Líquido a pagar</p>
              <p className="text-lg font-bold tabular-nums text-emerald-700 leading-tight">${totals.totalLiquido.toLocaleString('es-CL')}</p>
            </div>
            <div className="px-4 py-2.5" title="Haberes más SIS, cesantía y mutual del empleador">
              <p className="text-[11px] font-semibold text-slate-500">Costo para la empresa</p>
              <p className="text-lg font-bold tabular-nums text-indigo-900 leading-tight">${totals.costoTotalEmpresa.toLocaleString('es-CL')}</p>
            </div>
          </div>

          {/* Tabla de Nómina y Novedades */}
          <fieldset disabled={periodoCerrado} className="contents">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Planilla de remuneraciones
                  {estadoPeriodo === 'ABIERTO' && <span className="ml-2 align-middle text-[11px] font-semibold text-amber-800 bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5">Vista previa, sin procesar</span>}
                  {estadoPeriodo === 'PROCESADO' && <span className="ml-2 align-middle text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">Procesado · se puede corregir y reprocesar</span>}
                  {estadoPeriodo === 'CERRADO' && <span className="ml-2 align-middle text-[11px] font-semibold text-indigo-800 bg-indigo-50 border border-indigo-200 rounded px-1.5 py-0.5">Mes cerrado · liquidaciones fijas</span>}
                </h3>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Selector de Modo de Vista */}
                <div className="bg-slate-200/80 p-0.5 rounded-lg flex items-center">
                  <button
                    onClick={() => setPayrollViewMode('RESUMEN')}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                      payrollViewMode === 'RESUMEN'
                        ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    Vista Novedades
                  </button>
                  <button
                    onClick={() => setPayrollViewMode('EXCEL_COMPLETO')}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                      payrollViewMode === 'EXCEL_COMPLETO'
                        ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Table className="w-3.5 h-3.5" />
                    Planilla Excel Detallada
                  </button>
                </div>

                <button
                  onClick={handleExportExcelDetailedCsv}
                  className="px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition-colors flex items-center gap-1.5"
                  title="Exportar planilla con las 34 columnas exactas a formato CSV compatible con Excel"
                >
                  <Download className="w-3.5 h-3.5" />
                  Exportar a Excel (.csv)
                </button>
              </div>
            </div>

            {slipsForPeriod.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <Users className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                <p className="text-sm font-medium">No hay trabajadores activos para el período seleccionado.</p>
                <p className="text-xs text-slate-400 mt-1">Registra colaboradores en la pestaña "Ficha del Personal".</p>
              </div>
            ) : payrollViewMode === 'RESUMEN' ? (
              <div className="overflow-x-auto max-h-[620px] overflow-y-auto relative rounded-xl border border-slate-200 shadow-2xs">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 z-20 bg-slate-100 shadow-xs">
                    <tr className="bg-slate-100 border-b border-slate-300 text-[11px] font-bold text-slate-700">
                      <th className="py-3 px-3">Colaborador</th>
                      <th className="py-3 px-2 text-center">Días</th>
                      <th className="py-3 px-2 text-center">H. Extras</th>
                      <th className="py-3 px-3 text-right">Sueldo Base</th>
                      <th className="py-3 px-3 text-right">Gratif. Art 50</th>
                      <th className="py-3 px-3 text-right">Imponible</th>
                      <th className="py-3 px-3 text-right">No Imponible</th>
                      <th className="py-3 px-3 text-right text-rose-700">AFP</th>
                      <th className="py-3 px-3 text-right text-rose-700">Salud</th>
                      <th className="py-3 px-3 text-right text-rose-700">Imp. Único</th>
                      <th className="py-3 px-3 text-right font-bold text-emerald-800">Líquido</th>
                      <th className="py-3 px-3 text-center">Parámetros / Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {slipsForPeriod.map((slip) => {
                      const emp = employees.find(e => e.id === slip.employeeId);
                      const hasVigencias = (emp?.salaryHistory && emp.salaryHistory.length > 0);

                      return (
                        <tr key={slip.employeeId} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-2.5 px-3 font-sans">
                            <div className="font-semibold text-slate-900">{slip.employeeName}</div>
                            <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1.5 mt-0.5">
                              <span>{formatearRut(slip.employeeRut)}</span>
                              <span>•</span>
                              <span>{slip.employeePosition}</span>
                            </div>
                          </td>

                          <td className="py-2.5 px-2 text-center">
                            <input
                              type="number"
                              min={0}
                              max={30}
                              value={monthInputs[slip.employeeId]?.diasTrabajados ?? slip.diasTrabajados}
                              onChange={(e) => handleInputChange(slip.employeeId, 'diasTrabajados', Number(e.target.value))}
                              className="w-12 text-center py-1 border border-slate-300 rounded-md font-bold focus:ring-1 focus:ring-indigo-500 text-xs"
                            />
                          </td>

                          <td className="py-2.5 px-2 text-center">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={monthInputs[slip.employeeId]?.horasExtras50Qty ?? slip.horasExtras50Qty}
                              onChange={(e) => handleInputChange(slip.employeeId, 'horasExtras50Qty', Number(e.target.value))}
                              className="w-12 text-center py-1 border border-slate-300 rounded-md focus:ring-1 focus:ring-indigo-500 text-xs"
                            />
                          </td>

                          <td className="py-2.5 px-3 text-right font-medium text-slate-800">
                            <div className="flex items-center justify-end gap-1">
                              <span className="text-[10px] text-slate-400 font-mono">$</span>
                              <input
                                type="number"
                                min={0}
                                step={1000}
                                value={monthInputs[slip.employeeId]?.sueldoBaseOverride !== undefined ? monthInputs[slip.employeeId].sueldoBaseOverride : slip.sueldoBasePactado}
                                onChange={(e) => handleInputChange(slip.employeeId, 'sueldoBaseOverride', Number(e.target.value))}
                                className="w-24 text-right py-1 px-1.5 border border-slate-300 rounded-md font-mono font-bold text-slate-900 focus:ring-1 focus:ring-indigo-500 text-xs bg-white shadow-2xs"
                                title="Renta / Sueldo Base pactado para este período. Si se modifica, afecta exclusivamente al mes en proceso sin alterar períodos históricos anteriores."
                              />
                            </div>
                            <div className="flex items-center justify-end gap-1 mt-0.5 flex-wrap">
                              {slip.sueldoBaseProporcional !== (monthInputs[slip.employeeId]?.sueldoBaseOverride ?? slip.sueldoBasePactado) && (
                                <span className="text-[9px] text-slate-500 font-mono" title="Proporcional según días trabajados">
                                  Prop: ${slip.sueldoBaseProporcional.toLocaleString('es-CL')}
                                </span>
                              )}
                              {emp?.isSueldoEmpresarial && (
                                <span className="text-[9px] bg-amber-100 text-amber-900 font-bold px-1 rounded border border-amber-300" title="Contrato o Régimen de Sueldo Empresarial">
                                  S. Empresarial
                                </span>
                              )}
                              {(emp?.workHoursPerWeek || getLegalWeeklyHours(periodStr)) < 40 && (
                                <span className="text-[9px] bg-sky-100 text-sky-900 font-bold px-1 rounded border border-sky-300" title="Jornada Parcial / Medio Tiempo">
                                  {emp?.workHoursPerWeek} hrs
                                </span>
                              )}
                              {emp && monthInputs[slip.employeeId]?.sueldoBaseOverride !== undefined && monthInputs[slip.employeeId].sueldoBaseOverride !== sueldoVigenteDelPeriodo(emp, periodStr) && (
                                <>
                                  <span className="text-[9px] bg-purple-100 text-purple-900 font-bold px-1 rounded border border-purple-300" title="Sueldo distinto al de la ficha sólo en este mes">
                                    Sólo {periodStr}
                                  </span>
                                  {!periodoCerrado && onSaveEmployee && (
                                    <button type="button" onClick={() => aplicarSueldoDesdeEsteMes(emp, Number(monthInputs[slip.employeeId].sueldoBaseOverride) || 0)}
                                      className="text-[9px] text-indigo-700 underline" title="Registrar este sueldo en la ficha con vigencia desde este mes; los meses anteriores no cambian">
                                      Aplicar desde este mes
                                    </button>
                                  )}
                                </>
                              )}
                              {hasVigencias && (
                                <span className="inline-flex items-center gap-0.5 text-[9px] text-amber-700 font-sans font-semibold bg-amber-50 px-1 rounded border border-amber-200" title="Sueldo regido por vigencia histórica">
                                  <History className="w-2.5 h-2.5" /> Vigente
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-2.5 px-3 text-right text-slate-700">
                            ${slip.gratificacionLegal.toLocaleString('es-CL')}
                          </td>

                          <td className="py-2.5 px-3 text-right font-semibold text-slate-900">
                            ${slip.totalHaberesImponibles.toLocaleString('es-CL')}
                          </td>

                          <td className="py-2.5 px-3 text-right text-slate-600">
                            ${slip.totalHaberesNoImponibles.toLocaleString('es-CL')}
                          </td>

                          <td className="py-2.5 px-3 text-right text-rose-700">
                            -${slip.afpMonto.toLocaleString('es-CL')}
                            <div className="text-[9px] text-slate-400 font-sans">{slip.pensionSystem} ({slip.afpTasa}%)</div>
                          </td>

                          <td className="py-2.5 px-3 text-right text-rose-700">
                            -${slip.saludMontoTotal.toLocaleString('es-CL')}
                            <div className="text-[9px] text-slate-400 font-sans">{slip.healthSystem}</div>
                          </td>

                          <td className="py-2.5 px-3 text-right text-amber-700">
                            {slip.impuestoUnicoSegundaCategoria > 0 ? `-$${slip.impuestoUnicoSegundaCategoria.toLocaleString('es-CL')}` : '$0'}
                          </td>

                          <td className="py-2.5 px-3 text-right font-bold text-emerald-700 bg-emerald-50/40">
                            ${slip.liquidoAPagar.toLocaleString('es-CL')}
                          </td>

                          <td className="py-2.5 px-3 text-center font-sans">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  if (emp) setSelectedEmployeeForNovedades(emp);
                                }}
                                className="p-1.5 text-slate-600 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition-colors border border-transparent hover:border-purple-200"
                                title="Ajustar Novedades y Renta Exclusiva de este Mes (Sueldo empresarial, días, licencias, horas extras, bonos, pensión alimenticia)"
                              >
                                <Calendar className="w-4 h-4 text-purple-600" />
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  if (emp) setSelectedEmployeeForParams(emp);
                                }}
                                className="p-1.5 text-slate-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors border border-transparent hover:border-indigo-200"
                                title="Modificar Parámetros del Trabajador (AFP, Salud, APV, Cargas, etc.)"
                              >
                                <SlidersHorizontal className="w-4 h-4 text-indigo-600" />
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  if (emp) setSelectedEmployeeForSalaryHistory(emp);
                                }}
                                className="p-1.5 text-slate-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors border border-transparent hover:border-amber-200"
                                title="Vigencias de Sueldo del Trabajador (Historial y Nuevo Sueldo)"
                              >
                                <History className="w-4 h-4 text-amber-600" />
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedEmployeeId(slip.employeeId);
                                  setActiveTab('LIQUIDACION_INDIVIDUAL');
                                }}
                                className="p-1.5 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors border border-transparent hover:border-emerald-200"
                                title="Ver Liquidación Oficial Imprimible"
                              >
                                <Eye className="w-4 h-4 text-emerald-600" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-900 text-white font-bold font-mono">
                      <td className="py-3 px-3 font-sans">TOTALES NÓMINA ({totals.totalEmployees})</td>
                      <td className="py-3 px-2 text-center">-</td>
                      <td className="py-3 px-2 text-center">-</td>
                      <td className="py-3 px-3 text-right">
                        ${slipsForPeriod.reduce((sum, s) => sum + s.sueldoBaseProporcional, 0).toLocaleString('es-CL')}
                      </td>
                      <td className="py-3 px-3 text-right">
                        ${slipsForPeriod.reduce((sum, s) => sum + s.gratificacionLegal, 0).toLocaleString('es-CL')}
                      </td>
                      <td className="py-3 px-3 text-right text-amber-300">
                        ${totals.totalImponible.toLocaleString('es-CL')}
                      </td>
                      <td className="py-3 px-3 text-right">
                        ${totals.totalNoImponible.toLocaleString('es-CL')}
                      </td>
                      <td className="py-3 px-3 text-right text-rose-300">
                        -${totals.totalAfp.toLocaleString('es-CL')}
                      </td>
                      <td className="py-3 px-3 text-right text-rose-300">
                        -${totals.totalSalud.toLocaleString('es-CL')}
                      </td>
                      <td className="py-3 px-3 text-right text-amber-300">
                        -${totals.totalImpuestoUnico.toLocaleString('es-CL')}
                      </td>
                      <td className="py-3 px-3 text-right text-emerald-400 text-sm">
                        ${totals.totalLiquido.toLocaleString('es-CL')}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              /* VISTA PLANILLA EXCEL COMPLETA (34 COLUMNAS) */
              <div className="overflow-x-auto max-h-[640px]">
                <table className="w-full text-left border-collapse text-[11px] whitespace-nowrap">
                  <thead className="sticky top-0 z-10 shadow-xs">
                    <tr className="bg-slate-900 text-white text-[10px] uppercase font-bold border-b border-slate-700">
                      <th colSpan={6} className="py-2 px-3 border-r border-slate-700 text-center bg-slate-800">
                        Identificación y Jornada
                      </th>
                      <th colSpan={7} className="py-2 px-3 border-r border-slate-700 text-center bg-indigo-950 text-indigo-200">
                        Haberes
                      </th>
                      <th colSpan={4} className="py-2 px-3 border-r border-slate-700 text-center bg-rose-950 text-rose-200">
                        Previsión Salud
                      </th>
                      <th colSpan={4} className="py-2 px-3 border-r border-slate-700 text-center bg-blue-950 text-blue-200">
                        Previsión AFP
                      </th>
                      <th colSpan={6} className="py-2 px-3 border-r border-slate-700 text-center bg-emerald-950 text-emerald-200">
                        Impuestos y Alcance Líquido
                      </th>
                      <th colSpan={9} className="py-2 px-3 text-center bg-amber-950 text-amber-200">
                        Aportes Patronales e Instituciones (Previred)
                      </th>
                    </tr>
                    <tr className="bg-slate-100 border-b border-slate-300 text-[10px] font-bold text-slate-700 uppercase tracking-tight">
                      <th className="py-2.5 px-2 border-r border-slate-200">PERIODO</th>
                      <th className="py-2.5 px-2 border-r border-slate-200">RUT</th>
                      <th className="py-2.5 px-2 border-r border-slate-200">NOMBRES</th>
                      <th className="py-2.5 px-2 border-r border-slate-200">AP. PATERNO</th>
                      <th className="py-2.5 px-2 border-r border-slate-200">AP. MATERNO</th>
                      <th className="py-2.5 px-2 text-center border-r border-slate-200">DIAS T.</th>

                      <th className="py-2.5 px-2 text-right border-r border-slate-200">REM BASE</th>
                      <th className="py-2.5 px-2 text-right border-r border-slate-200">REM. PERIODO</th>
                      <th className="py-2.5 px-2 text-right border-r border-slate-200">GRATIF</th>
                      <th className="py-2.5 px-2 text-right font-bold text-indigo-800 border-r border-slate-200">REM IMPONIBLE</th>
                      <th className="py-2.5 px-2 text-right border-r border-slate-200">COLACION</th>
                      <th className="py-2.5 px-2 text-right border-r border-slate-200">MOVILIZACION</th>
                      <th className="py-2.5 px-2 text-right font-bold text-indigo-900 border-r border-slate-200">T. HABERES</th>

                      <th className="py-2.5 px-2 border-r border-slate-200">SALUD</th>
                      <th className="py-2.5 px-2 text-right border-r border-slate-200">PLAN UF</th>
                      <th className="py-2.5 px-2 text-right border-r border-slate-200">7%</th>
                      <th className="py-2.5 px-2 text-right border-r border-slate-200">ADIC. SALUD</th>

                      <th className="py-2.5 px-2 border-r border-slate-200">AFP</th>
                      <th className="py-2.5 px-2 text-center border-r border-slate-200">% AFP</th>
                      <th className="py-2.5 px-2 text-right border-r border-slate-200">COTIZ. AFP</th>
                      <th className="py-2.5 px-2 text-right border-r border-slate-200">EZ 0,1</th>

                      <th className="py-2.5 px-2 text-right border-r border-slate-200">CES 0.6%</th>
                      <th className="py-2.5 px-2 text-right border-r border-slate-200">B. TRIB</th>
                      <th className="py-2.5 px-2 text-center border-r border-slate-200">TRAMO</th>
                      <th className="py-2.5 px-2 text-right border-r border-slate-200">I. UNICO</th>
                      <th className="py-2.5 px-2 text-right border-r border-slate-200">ANTI</th>
                      <th className="py-2.5 px-2 text-right font-bold text-emerald-800 border-r border-slate-200">LIQ</th>

                      <th className="py-2.5 px-2 text-right border-r border-slate-200">SIS</th>
                      <th className="py-2.5 px-2 text-center border-r border-slate-200">% MUT</th>
                      <th className="py-2.5 px-2 text-right border-r border-slate-200">MUTUAL</th>
                      <th className="py-2.5 px-2 text-right border-r border-slate-200">CES 2,4%</th>
                      <th className="py-2.5 px-2 text-right border-r border-slate-200">T. AFP</th>
                      <th className="py-2.5 px-2 text-right border-r border-slate-200">FONASA</th>
                      <th className="py-2.5 px-2 text-right border-r border-slate-200">ISAPRE</th>
                      <th className="py-2.5 px-2 text-right border-r border-slate-200">APV</th>
                      <th className="py-2.5 px-2 text-right font-bold text-indigo-950">PREVIRED</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                    {slipsForPeriod.map(slip => {
                      const emp = employees.find(e => e.id === slip.employeeId);
                      const nameParts = (emp?.name || slip.employeeName || '').trim().split(/\s+/);
                      let nombres = '';
                      let apPaterno = '';
                      let apMaterno = '';

                      if (nameParts.length === 1) {
                        nombres = nameParts[0];
                      } else if (nameParts.length === 2) {
                        nombres = nameParts[0];
                        apPaterno = nameParts[1];
                      } else if (nameParts.length === 3) {
                        nombres = nameParts[0];
                        apPaterno = nameParts[1];
                        apMaterno = nameParts[2];
                      } else if (nameParts.length >= 4) {
                        nombres = nameParts.slice(0, nameParts.length - 2).join(' ');
                        apPaterno = nameParts[nameParts.length - 2];
                        apMaterno = nameParts[nameParts.length - 1];
                      }

                      const afpRatePct = ((slip.afpTasa || 0) * 100).toFixed(2) + '%';
                      const isFonasa = slip.healthSystem === 'FONASA';
                      const totalIsapre = !isFonasa ? slip.saludMontoTotal : 0;
                      const totalFonasa = isFonasa ? slip.saludLegal7 : 0;
                      const planUf = emp?.healthPlanType === 'ISAPRE_UF' ? (emp?.healthPlanValue || 0) : 0;
                      const totalPrevired = (slip.afpMonto + slip.saludMontoTotal + slip.afcTrabajadorMonto + slip.sisMonto + slip.mutualMonto + slip.afcEmpleadorMonto + (slip.apvMonto || 0));

                      return (
                        <tr key={slip.employeeId} className="hover:bg-indigo-50/30 transition-colors">
                          <td className="py-2 px-2 text-slate-500 border-r border-slate-100">{periodStr.replace('-', '')}</td>
                          <td className="py-2 px-2 font-bold text-slate-800 border-r border-slate-100">{emp?.rut || slip.employeeRut}</td>
                          <td className="py-2 px-2 font-sans font-medium text-slate-900 border-r border-slate-100 uppercase">{nombres}</td>
                          <td className="py-2 px-2 font-sans font-medium text-slate-800 border-r border-slate-100 uppercase">{apPaterno}</td>
                          <td className="py-2 px-2 font-sans font-medium text-slate-800 border-r border-slate-100 uppercase">{apMaterno}</td>
                          <td className="py-2 px-2 text-center font-bold text-slate-800 border-r border-slate-100">{slip.diasTrabajados}</td>

                          <td className="py-2 px-2 text-right text-slate-700 border-r border-slate-100">${slip.sueldoBasePactado.toLocaleString('es-CL')}</td>
                          <td className="py-2 px-2 text-right text-slate-700 border-r border-slate-100">${slip.sueldoBaseProporcional.toLocaleString('es-CL')}</td>
                          <td className="py-2 px-2 text-right text-slate-700 border-r border-slate-100">${slip.gratificacionLegal.toLocaleString('es-CL')}</td>
                          <td className="py-2 px-2 text-right font-bold text-indigo-700 border-r border-slate-100 bg-indigo-50/20">${slip.totalHaberesImponibles.toLocaleString('es-CL')}</td>
                          <td className="py-2 px-2 text-right text-slate-600 border-r border-slate-100">${slip.asignacionColacion.toLocaleString('es-CL')}</td>
                          <td className="py-2 px-2 text-right text-slate-600 border-r border-slate-100">${slip.asignacionMovilizacion.toLocaleString('es-CL')}</td>
                          <td className="py-2 px-2 text-right font-bold text-indigo-900 border-r border-slate-100 bg-indigo-50/30">${slip.totalHaberes.toLocaleString('es-CL')}</td>

                          <td className="py-2 px-2 font-sans text-slate-700 border-r border-slate-100 capitalize">{slip.healthSystem.toLowerCase()}</td>
                          <td className="py-2 px-2 text-right text-slate-600 border-r border-slate-100">{planUf > 0 ? planUf.toFixed(2) : '-'}</td>
                          <td className="py-2 px-2 text-right text-rose-700 border-r border-slate-100">${slip.saludLegal7.toLocaleString('es-CL')}</td>
                          <td className="py-2 px-2 text-right text-rose-700 border-r border-slate-100">${slip.saludAdicionalIsapre.toLocaleString('es-CL')}</td>

                          <td className="py-2 px-2 font-sans text-slate-700 border-r border-slate-100 capitalize">{slip.pensionSystem.toLowerCase()}</td>
                          <td className="py-2 px-2 text-center text-slate-600 border-r border-slate-100">{afpRatePct}</td>
                          <td className="py-2 px-2 text-right text-rose-700 border-r border-slate-100">${slip.afpMonto.toLocaleString('es-CL')}</td>
                          <td className="py-2 px-2 text-right text-slate-400 border-r border-slate-100">$0</td>

                          <td className="py-2 px-2 text-right text-rose-700 border-r border-slate-100">${slip.afcTrabajadorMonto.toLocaleString('es-CL')}</td>
                          <td className="py-2 px-2 text-right text-slate-700 border-r border-slate-100">${slip.rentaAfectaImpuesto.toLocaleString('es-CL')}</td>
                          <td className="py-2 px-2 text-center font-bold text-slate-700 border-r border-slate-100">{slip.impuestoUnicoSegundaCategoria > 0 ? (slip.tramoImpuestoUnico || '2') : '1'}</td>
                          <td className="py-2 px-2 text-right text-amber-700 border-r border-slate-100">${slip.impuestoUnicoSegundaCategoria.toLocaleString('es-CL')}</td>
                          <td className="py-2 px-2 text-right text-slate-600 border-r border-slate-100">${slip.anticipos.toLocaleString('es-CL')}</td>
                          <td className="py-2 px-2 text-right font-bold text-emerald-800 border-r border-slate-100 bg-emerald-50/30">${slip.liquidoAPagar.toLocaleString('es-CL')}</td>

                          <td className="py-2 px-2 text-right text-slate-600 border-r border-slate-100">${slip.sisMonto.toLocaleString('es-CL')}</td>
                          <td className="py-2 px-2 text-center text-slate-500 border-r border-slate-100">0,93%</td>
                          <td className="py-2 px-2 text-right text-slate-600 border-r border-slate-100">${slip.mutualMonto.toLocaleString('es-CL')}</td>
                          <td className="py-2 px-2 text-right text-slate-600 border-r border-slate-100">${slip.afcEmpleadorMonto.toLocaleString('es-CL')}</td>
                          <td className="py-2 px-2 text-right text-slate-700 border-r border-slate-100">${slip.afpMonto.toLocaleString('es-CL')}</td>
                          <td className="py-2 px-2 text-right text-slate-700 border-r border-slate-100">${totalFonasa.toLocaleString('es-CL')}</td>
                          <td className="py-2 px-2 text-right text-slate-700 border-r border-slate-100">${totalIsapre.toLocaleString('es-CL')}</td>
                          <td className="py-2 px-2 text-right text-slate-600 border-r border-slate-100">${(slip.apvMonto || 0).toLocaleString('es-CL')}</td>
                          <td className="py-2 px-2 text-right font-bold text-indigo-950 bg-indigo-50/30">${totalPrevired.toLocaleString('es-CL')}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-900 text-white font-bold font-mono text-[11px] sticky bottom-0">
                      <td colSpan={6} className="py-2.5 px-3 font-sans border-r border-slate-800 uppercase">TOTALES PLANILLA ({totals.totalEmployees})</td>
                      <td className="py-2.5 px-2 text-right border-r border-slate-800">${slipsForPeriod.reduce((sum, s) => sum + s.sueldoBasePactado, 0).toLocaleString('es-CL')}</td>
                      <td className="py-2.5 px-2 text-right border-r border-slate-800">${slipsForPeriod.reduce((sum, s) => sum + s.sueldoBaseProporcional, 0).toLocaleString('es-CL')}</td>
                      <td className="py-2.5 px-2 text-right border-r border-slate-800">${slipsForPeriod.reduce((sum, s) => sum + s.gratificacionLegal, 0).toLocaleString('es-CL')}</td>
                      <td className="py-2.5 px-2 text-right text-indigo-300 border-r border-slate-800">${totals.totalImponible.toLocaleString('es-CL')}</td>
                      <td className="py-2.5 px-2 text-right border-r border-slate-800">${slipsForPeriod.reduce((sum, s) => sum + s.asignacionColacion, 0).toLocaleString('es-CL')}</td>
                      <td className="py-2.5 px-2 text-right border-r border-slate-800">${slipsForPeriod.reduce((sum, s) => sum + s.asignacionMovilizacion, 0).toLocaleString('es-CL')}</td>
                      <td className="py-2.5 px-2 text-right text-indigo-200 border-r border-slate-800">${totals.totalHaberes.toLocaleString('es-CL')}</td>

                      <td className="py-2.5 px-2 border-r border-slate-800">-</td>
                      <td className="py-2.5 px-2 border-r border-slate-800">-</td>
                      <td className="py-2.5 px-2 text-right text-rose-300 border-r border-slate-800">${slipsForPeriod.reduce((sum, s) => sum + s.saludLegal7, 0).toLocaleString('es-CL')}</td>
                      <td className="py-2.5 px-2 text-right text-rose-300 border-r border-slate-800">${slipsForPeriod.reduce((sum, s) => sum + s.saludAdicionalIsapre, 0).toLocaleString('es-CL')}</td>

                      <td className="py-2.5 px-2 border-r border-slate-800">-</td>
                      <td className="py-2.5 px-2 border-r border-slate-800">-</td>
                      <td className="py-2.5 px-2 text-right text-rose-300 border-r border-slate-800">${totals.totalAfp.toLocaleString('es-CL')}</td>
                      <td className="py-2.5 px-2 text-right border-r border-slate-800">$0</td>

                      <td className="py-2.5 px-2 text-right text-rose-300 border-r border-slate-800">${totals.totalAfcTrabajador.toLocaleString('es-CL')}</td>
                      <td className="py-2.5 px-2 text-right border-r border-slate-800">${slipsForPeriod.reduce((sum, s) => sum + s.rentaAfectaImpuesto, 0).toLocaleString('es-CL')}</td>
                      <td className="py-2.5 px-2 border-r border-slate-800">-</td>
                      <td className="py-2.5 px-2 text-right text-amber-300 border-r border-slate-800">${totals.totalImpuestoUnico.toLocaleString('es-CL')}</td>
                      <td className="py-2.5 px-2 text-right border-r border-slate-800">${totals.totalAnticipos.toLocaleString('es-CL')}</td>
                      <td className="py-2.5 px-2 text-right text-emerald-400 font-bold border-r border-slate-800">${totals.totalLiquido.toLocaleString('es-CL')}</td>

                      <td className="py-2.5 px-2 text-right border-r border-slate-800">${totals.totalSis.toLocaleString('es-CL')}</td>
                      <td className="py-2.5 px-2 border-r border-slate-800">-</td>
                      <td className="py-2.5 px-2 text-right border-r border-slate-800">${totals.totalMutual.toLocaleString('es-CL')}</td>
                      <td className="py-2.5 px-2 text-right border-r border-slate-800">${totals.totalAfcEmpleador.toLocaleString('es-CL')}</td>
                      <td className="py-2.5 px-2 text-right border-r border-slate-800">${totals.totalAfp.toLocaleString('es-CL')}</td>
                      <td className="py-2.5 px-2 text-right border-r border-slate-800">
                        ${slipsForPeriod.filter(s => s.healthSystem === 'FONASA').reduce((sum, s) => sum + s.saludLegal7, 0).toLocaleString('es-CL')}
                      </td>
                      <td className="py-2.5 px-2 text-right border-r border-slate-800">
                        ${slipsForPeriod.filter(s => s.healthSystem !== 'FONASA').reduce((sum, s) => sum + s.saludMontoTotal, 0).toLocaleString('es-CL')}
                      </td>
                      <td className="py-2.5 px-2 text-right border-r border-slate-800">${slipsForPeriod.reduce((sum, s) => sum + (s.apvMonto || 0), 0).toLocaleString('es-CL')}</td>
                      <td className="py-2.5 px-2 text-right text-indigo-300 font-bold">
                        ${slipsForPeriod.reduce((sum, s) => sum + (s.afpMonto + s.saludMontoTotal + s.afcTrabajadorMonto + s.sisMonto + s.mutualMonto + s.afcEmpleadorMonto + (s.apvMonto || 0)), 0).toLocaleString('es-CL')}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
          </fieldset>
        </div>
      )}

      {/* PESTAÑA 2: LIQUIDACIÓN OFICIAL INDIVIDUAL IMPRIMIBLE */}
      {activeTab === 'LIQUIDACION_INDIVIDUAL' && activeSlip && (
        <div className="space-y-4">
          {/* Barra superior de control individual */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 print:hidden">
            <div className="flex items-center gap-3">
              <label className="text-xs font-bold text-slate-700">Seleccionar Trabajador:</label>
              <select
                value={activeSlip.employeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                className="text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:ring-2 focus:ring-indigo-500"
              >
                {slipsForPeriod.map(s => (
                  <option key={s.employeeId} value={s.employeeId}>
                    {s.employeeName} ({s.employeeRut})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handlePrintSlip}
                className="px-4 py-2 text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-300 transition-colors flex items-center gap-1.5 shadow-2xs"
              >
                <Printer className="w-4 h-4" />
                Descargar PDF (1 hoja carta)
              </button>
              {slipsForPeriod.length > 1 && (
                <button
                  onClick={handlePrintAllSlips}
                  className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs"
                >
                  <Printer className="w-4 h-4" />
                  Todas en un PDF ({slipsForPeriod.length})
                </button>
              )}
            </div>
          </div>

          {/* Plantilla Oficial de Liquidación de Sueldo (Formato Chileno Código del Trabajo) */}
          <div id="printable-payroll-slip" className="bg-white p-8 rounded-2xl border border-slate-300 shadow-sm max-w-4xl mx-auto text-slate-900 text-xs font-sans print:p-0 print:border-none print:shadow-none print:max-w-full">
            {/* Membrete Empleador y Título */}
            <div className="border-b-2 border-slate-900 pb-4 mb-5 flex justify-between items-start">
              <div>
                <h2 className="text-base font-black uppercase text-slate-900 tracking-tight">{companyName}</h2>
                <p className="text-xs text-slate-600 font-mono">RUT: {companyRut}</p>
                {companyAddress && <p className="text-xs text-slate-500">{companyAddress}</p>}
                {companyGiro && <p className="text-[11px] text-slate-500">Giro: {companyGiro}</p>}
              </div>

              <div className="text-right">
                <div className="bg-slate-900 text-white px-3 py-1 text-xs font-black rounded-md inline-block">
                  Liquidación de Sueldo
                </div>
                <p className="text-xs font-bold text-slate-800 mt-1 uppercase">
                  Período: {new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric' }).format(new Date(selectedYear, selectedMonth - 1, 1))}
                </p>
              </div>
            </div>

            {/* Datos del Trabajador */}
            <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200 mb-6 grid grid-cols-2 sm:grid-cols-4 gap-y-3 gap-x-4 text-xs">
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Nombre Trabajador</span>
                <span className="font-bold text-slate-900">{activeSlip.employeeName}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase block">RUT</span>
                <span className="font-mono font-bold text-slate-900">{formatearRut(activeSlip.employeeRut)}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Cargo / Función</span>
                <span className="font-medium text-slate-800">{activeSlip.employeePosition}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Días Trabajados</span>
                <span className="font-bold font-mono text-slate-900">{activeSlip.diasTrabajados} de 30</span>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Previsión (AFP)</span>
                <span className="font-medium text-slate-800">{activeSlip.pensionSystem} ({activeSlip.afpTasa}%)</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Salud</span>
                <span className="font-medium text-slate-800">{activeSlip.healthSystem}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Tipo Contrato</span>
                <span className="font-medium text-slate-800">{activeSlip.contractType}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Sueldo Base Pactado</span>
                <span className="font-mono font-bold text-slate-900">${activeSlip.sueldoBasePactado.toLocaleString('es-CL')}</span>
              </div>
            </div>

            {/* Desglose de Haberes vs Descuentos (2 Columnas Oficiales) */}
            <div className="grid grid-cols-1 md:grid-cols-2 print:grid-cols-2 gap-6 mb-6">
              {/* COLUMNA 1: HABERES */}
              <div className="border border-slate-200 rounded-xl p-4 bg-white flex flex-col justify-between">
                <div>
                  <h4 className="text-xs font-black uppercase text-indigo-900 border-b border-indigo-100 pb-2 mb-3">
                    I. Haberes
                  </h4>

                  {/* A. Haberes Imponibles */}
                  <div className="space-y-2 mb-4">
                    <p className="text-[10px] font-bold text-slate-500">A. Haberes Imponibles y Tributables</p>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span>Sueldo Base ({activeSlip.diasTrabajados} días)</span>
                      <span className="font-mono font-semibold">${activeSlip.sueldoBaseProporcional.toLocaleString('es-CL')}</span>
                    </div>

                    {activeSlip.horasExtras50Qty > 0 && (
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span>Horas Extraordinarias (50% - {activeSlip.horasExtras50Qty} hrs)</span>
                        <span className="font-mono font-semibold">${activeSlip.montoHorasExtras50.toLocaleString('es-CL')}</span>
                      </div>
                    )}

                    {activeSlip.gratificacionLegal > 0 && (
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span>Gratificación Legal (Art. 50 Código Trabajo)</span>
                        <span className="font-mono font-semibold">${activeSlip.gratificacionLegal.toLocaleString('es-CL')}</span>
                      </div>
                    )}

                    {activeSlip.bonosImponibles > 0 && (
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span>Bonos Imponibles</span>
                        <span className="font-mono font-semibold">${activeSlip.bonosImponibles.toLocaleString('es-CL')}</span>
                      </div>
                    )}

                    {activeSlip.comisionesVentas > 0 && (
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span>Comisiones por Ventas</span>
                        <span className="font-mono font-semibold">${activeSlip.comisionesVentas.toLocaleString('es-CL')}</span>
                      </div>
                    )}

                    <div className="flex justify-between py-1.5 font-bold text-slate-900 bg-slate-50 px-2 rounded-md">
                      <span>Total Imponible</span>
                      <span className="font-mono">${activeSlip.totalHaberesImponibles.toLocaleString('es-CL')}</span>
                    </div>
                  </div>

                  {/* B. Haberes No Imponibles */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-slate-500">B. Haberes No Imponibles</p>
                    {activeSlip.asignacionColacion > 0 && (
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span>Asignación de Colación</span>
                        <span className="font-mono">${activeSlip.asignacionColacion.toLocaleString('es-CL')}</span>
                      </div>
                    )}

                    {activeSlip.asignacionMovilizacion > 0 && (
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span>Asignación de Movilización</span>
                        <span className="font-mono">${activeSlip.asignacionMovilizacion.toLocaleString('es-CL')}</span>
                      </div>
                    )}

                    {activeSlip.asignacionFamiliar > 0 && (
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span>Asignación Familiar</span>
                        <span className="font-mono">${activeSlip.asignacionFamiliar.toLocaleString('es-CL')}</span>
                      </div>
                    )}

                    {activeSlip.viaticos > 0 && (
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span>Viáticos</span>
                        <span className="font-mono">${activeSlip.viaticos.toLocaleString('es-CL')}</span>
                      </div>
                    )}

                    <div className="flex justify-between py-1.5 font-bold text-slate-900 bg-slate-50 px-2 rounded-md">
                      <span>Total No Imponible</span>
                      <span className="font-mono">${activeSlip.totalHaberesNoImponibles.toLocaleString('es-CL')}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t-2 border-slate-900 flex justify-between items-center bg-indigo-50/50 p-2 rounded-lg font-black text-indigo-950">
                  <span className="uppercase text-xs">Total Haberes Brutos</span>
                  <span className="font-mono text-sm">${activeSlip.totalHaberes.toLocaleString('es-CL')}</span>
                </div>
              </div>

              {/* COLUMNA 2: DESCUENTOS */}
              <div className="border border-slate-200 rounded-xl p-4 bg-white flex flex-col justify-between">
                <div>
                  <h4 className="text-xs font-black uppercase text-rose-900 border-b border-rose-100 pb-2 mb-3">
                    II. Descuentos
                  </h4>

                  {/* A. Descuentos Previsionales */}
                  <div className="space-y-2 mb-4">
                    <p className="text-[10px] font-bold text-slate-500">A. Descuentos Previsionales Obligatorios</p>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span>Cotización Previsional AFP ({activeSlip.pensionSystem} {activeSlip.afpTasa}%)</span>
                      <span className="font-mono font-semibold text-rose-700">${activeSlip.afpMonto.toLocaleString('es-CL')}</span>
                    </div>

                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span>Cotización Salud Obligatoria 7% ({activeSlip.healthSystem})</span>
                      <span className="font-mono font-semibold text-rose-700">${activeSlip.saludLegal7.toLocaleString('es-CL')}</span>
                    </div>

                    {activeSlip.saludAdicionalIsapre > 0 && (
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span>Cotización Adicional Isapre Plan Pactado</span>
                        <span className="font-mono font-semibold text-rose-700">${activeSlip.saludAdicionalIsapre.toLocaleString('es-CL')}</span>
                      </div>
                    )}

                    {activeSlip.afcTrabajadorMonto > 0 && (
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span>Seguro de Cesantía AFC ({activeSlip.afcTrabajadorTasa}%)</span>
                        <span className="font-mono font-semibold text-rose-700">${activeSlip.afcTrabajadorMonto.toLocaleString('es-CL')}</span>
                      </div>
                    )}

                    {activeSlip.apvMonto > 0 && (
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span>Ahorro Previsional Voluntario (APV)</span>
                        <span className="font-mono font-semibold text-rose-700">${activeSlip.apvMonto.toLocaleString('es-CL')}</span>
                      </div>
                    )}
                  </div>

                  {/* B. Descuentos Tributarios y Otros */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-slate-500">B. Impuesto y Otros Descuentos</p>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span>Impuesto Único 2da Categoría ({activeSlip.tramoImpuestoUnico || 'Exento'})</span>
                      <span className="font-mono font-semibold text-amber-700">${activeSlip.impuestoUnicoSegundaCategoria.toLocaleString('es-CL')}</span>
                    </div>

                    {activeSlip.anticipos > 0 && (
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span>Anticipos de Sueldo</span>
                        <span className="font-mono text-slate-800">${activeSlip.anticipos.toLocaleString('es-CL')}</span>
                      </div>
                    )}

                    {activeSlip.prestamosEmpresa > 0 && (
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span>Cuota Préstamo Empresa</span>
                        <span className="font-mono text-slate-800">${activeSlip.prestamosEmpresa.toLocaleString('es-CL')}</span>
                      </div>
                    )}

                    {activeSlip.descuentoJudicialPensionAlimentos && activeSlip.descuentoJudicialPensionAlimentos > 0 ? (
                      <div className="flex justify-between py-1 border-b border-rose-100 bg-rose-50/50 px-1 rounded font-bold text-rose-900">
                        <span>Retención Judicial (Pensión de Alimentos)</span>
                        <span className="font-mono">${activeSlip.descuentoJudicialPensionAlimentos.toLocaleString('es-CL')}</span>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t-2 border-slate-900 flex justify-between items-center bg-rose-50/50 p-2 rounded-lg font-black text-rose-950">
                  <span className="uppercase text-xs">Total Descuentos</span>
                  <span className="font-mono text-sm">-${activeSlip.totalDescuentos.toLocaleString('es-CL')}</span>
                </div>
              </div>
            </div>

            {/* Resumen Final: Alcance Líquido y Líquido a Pagar */}
            <div className="bg-slate-900 text-white p-5 rounded-xl mb-6 flex flex-col sm:flex-row justify-between items-center gap-3">
              <div>
                <span className="text-[11px] font-bold text-emerald-400 block">
                  Total Líquido a Pagar (Monto Recibido Conforme)
                </span>
                <p className="text-xs text-slate-300">
                  Base Tributable: ${activeSlip.rentaAfectaImpuesto.toLocaleString('es-CL')} • Base Imponible AFP: ${activeSlip.baseImponibleAfp.toLocaleString('es-CL')}
                </p>
              </div>

              <div className="text-right">
                <span className="text-2xl font-black font-mono text-emerald-400">
                  ${activeSlip.liquidoAPagar.toLocaleString('es-CL')}
                </span>
              </div>
            </div>

            {/* Declaración Legal y Firmas */}
            <div className="mt-8 pt-4 border-t border-slate-300">
              <p className="text-[10px] text-slate-500 italic text-justify mb-10">
                Certifico que he recibido de mi empleador <strong>{companyName}</strong>, a mi total y entera satisfacción, la suma neta señalada en esta liquidación, sin tener cargo ni reclamo alguno posterior que formular, correspondiente a los servicios prestados durante el período señalado.
              </p>

              <div className="grid grid-cols-2 gap-12 text-center text-xs">
                <div className="border-t border-slate-900 pt-2">
                  <p className="font-bold text-slate-900 uppercase">Firma del Empleador</p>
                  <p className="text-[10px] text-slate-500">{companyName}</p>
                  <p className="text-[10px] font-mono text-slate-500">{companyRut}</p>
                </div>

                <div className="border-t border-slate-900 pt-2">
                  <p className="font-bold text-slate-900 uppercase">Firma del Trabajador</p>
                  <p className="text-[10px] text-slate-500">{activeSlip.employeeName}</p>
                  <p className="text-[10px] font-mono text-slate-500">RUT: {formatearRut(activeSlip.employeeRut)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PESTAÑA 3: LIBRO DE REMUNERACIONES DIGITAL (LRD - DT) */}
      {activeTab === 'LRD_DT' && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Libro de Remuneraciones Digital (LRD - Dirección del Trabajo DT)
                </h3>
              </div>
              <p className="text-xs text-slate-600 max-w-2xl">
                Estructura oficial estandarizada de conceptos de remuneración exigida por la Dirección del Trabajo (DT) mediante la Resolución Exenta N° 873. Listo para exportar en formato CSV.
              </p>
            </div>

            <button
              onClick={handleDownloadLrdCsv}
              className="px-4 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors flex items-center gap-2 shadow-sm"
            >
              <Download className="w-4 h-4" />
              Descargar CSV Libro LRD (DT)
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="bg-slate-100 text-slate-700 text-[11px] font-bold uppercase border-b border-slate-200">
                  <th className="py-2.5 px-3">RUT DT</th>
                  <th className="py-2.5 px-3 font-sans">Trabajador</th>
                  <th className="py-2.5 px-2 text-right">1101 Base</th>
                  <th className="py-2.5 px-2 text-right">1104 Gratif</th>
                  <th className="py-2.5 px-2 text-right text-indigo-900 font-bold">1000 Total Imp</th>
                  <th className="py-2.5 px-2 text-right">2101 Colac</th>
                  <th className="py-2.5 px-2 text-right">2102 Movil</th>
                  <th className="py-2.5 px-2 text-right text-rose-700">3101 AFP</th>
                  <th className="py-2.5 px-2 text-right text-rose-700">3103 Salud</th>
                  <th className="py-2.5 px-2 text-right text-rose-700">3105 AFC</th>
                  <th className="py-2.5 px-2 text-right text-amber-700">4101 Imp.Único</th>
                  <th className="py-2.5 px-3 text-right font-bold text-emerald-700 bg-emerald-50/50">7003 Líquido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {slipsForPeriod.map(s => (
                  <tr key={s.employeeId} className="hover:bg-slate-50">
                    <td className="py-2 px-3">{formatearRut(s.employeeRut)}</td>
                    <td className="py-2 px-3 font-sans font-medium text-slate-800">{s.employeeName}</td>
                    <td className="py-2 px-2 text-right">${s.sueldoBaseProporcional.toLocaleString('es-CL')}</td>
                    <td className="py-2 px-2 text-right">${s.gratificacionLegal.toLocaleString('es-CL')}</td>
                    <td className="py-2 px-2 text-right font-bold text-indigo-900">${s.totalHaberesImponibles.toLocaleString('es-CL')}</td>
                    <td className="py-2 px-2 text-right">${s.asignacionColacion.toLocaleString('es-CL')}</td>
                    <td className="py-2 px-2 text-right">${s.asignacionMovilizacion.toLocaleString('es-CL')}</td>
                    <td className="py-2 px-2 text-right text-rose-700">-${s.afpMonto.toLocaleString('es-CL')}</td>
                    <td className="py-2 px-2 text-right text-rose-700">-${s.saludMontoTotal.toLocaleString('es-CL')}</td>
                    <td className="py-2 px-2 text-right text-rose-700">-${s.afcTrabajadorMonto.toLocaleString('es-CL')}</td>
                    <td className="py-2 px-2 text-right text-amber-700">-${s.impuestoUnicoSegundaCategoria.toLocaleString('es-CL')}</td>
                    <td className="py-2 px-3 text-right font-bold text-emerald-700 bg-emerald-50/50">${s.liquidoAPagar.toLocaleString('es-CL')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PESTAÑA 4: EXPORTADOR PREVIRED */}
      {activeTab === 'PREVIRED' && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Send className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Exportador de Archivo Plano Previred (105 Campos Estándar)
                </h3>
              </div>
              <p className="text-xs text-slate-600 max-w-2xl">
                Genera el archivo estructurado oficial para pago y declaración masiva de cotizaciones previsionales en el portal Previred (AFP, Fonasa, Isapres, AFC e IPS).
              </p>
            </div>

            <button
              onClick={handleDownloadPrevired}
              className="px-4 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors flex items-center gap-2 shadow-sm"
            >
              <Download className="w-4 h-4" />
              Descargar Archivo Previred (.txt)
            </button>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-wrap items-center gap-4 text-xs">
            <span className="font-semibold text-slate-700">Datos del empleador para el archivo:</span>
            <label className="flex items-center gap-2">Mutualidad
              <select defaultValue={(masterParams as any)?.previredMutual || '00'} onChange={e => onSaveMasterParams?.({ previredMutual: e.target.value })} className="border border-slate-300 rounded-md px-2 py-1">
                {Object.entries(NOMBRE_MUTUAL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2">Caja de compensación
              <select defaultValue={(masterParams as any)?.previredCcaf || '00'} onChange={e => onSaveMasterParams?.({ previredCcaf: e.target.value })} className="border border-slate-300 rounded-md px-2 py-1">
                {Object.entries(NOMBRE_CCAF).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <span className="text-slate-500">Formato oficial Previred de 105 campos separado por punto y coma (versión 58), con los aportes de la Ley 21.735.</span>
          </div>

          {studyId && <PreviredLibroView studyId={studyId} companyId={companyId} companyName={companyName} companyRut={companyRut} anioInicial={selectedYear} />}

          {/* Resumen por Institución Previsional Previred */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-indigo-600" />
                <h4 className="text-xs font-bold uppercase text-slate-900">Fondos de Pensiones (AFP)</h4>
              </div>
              <p className="text-xl font-bold font-mono text-indigo-900">${totals.totalAfp.toLocaleString('es-CL')}</p>
              <p className="text-[11px] text-slate-500 mt-1">Cotización obligatoria + comisiones</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center gap-2 mb-2">
                <HeartPulse className="w-4 h-4 text-rose-600" />
                <h4 className="text-xs font-bold uppercase text-slate-900">Salud (Fonasa / Isapres)</h4>
              </div>
              <p className="text-xl font-bold font-mono text-rose-700">${totals.totalSalud.toLocaleString('es-CL')}</p>
              <p className="text-[11px] text-slate-500 mt-1">7% Obligatorio + Planes adicionales Isapre</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="w-4 h-4 text-emerald-600" />
                <h4 className="text-xs font-bold uppercase text-slate-900">AFC & Mutualidad</h4>
              </div>
              <p className="text-xl font-bold font-mono text-emerald-700">
                ${(totals.totalAfcTrabajador + totals.totalAfcEmpleador + totals.totalMutual).toLocaleString('es-CL')}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">Seguro de Cesantía y Accidentes del Trabajo</p>
            </div>
          </div>
        </div>
      )}

      {/* PESTAÑA 3: TABLAS DE PARÁMETROS PREVISIONALES Y TRIBUTARIOS */}
      {activeTab === 'PARAMETROS' && (
        <div className="space-y-6">
          {/* Header de Parámetros y Sincronización Automática */}
          <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 rounded-full flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    Sincronización Automática Activa
                  </span>
                  <span className="text-xs text-slate-500">Período Seleccionado: <strong className="text-slate-800">{periodStr}</strong></span>
                </div>
                <h2 className="text-base font-bold text-slate-900">
                  Tablas de Parámetros Previsionales, Laborales y Tributarios de Chile
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Los parámetros oficiales (UF, UTM, Topes Imponibles, Tasas de AFP, SIS, AFC y Tabla del Art. 43 LIR) se actualizan y aplican automáticamente según el mes y año consultado, exactamente igual que las planillas maestras de remuneraciones.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full lg:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    setIndicatorFormData({ ...periodParams });
                    setIsEditingPeriodIndicators(true);
                  }}
                  className="px-3.5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  title="Cargar o modificar los indicadores de este período específico (Sueldo mínimo, UF, UTM, SIS, Mutual, AFPs)"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span> Cargar / Modificar Indicadores de {periodStr}</span>
                </button>

                <button
                  onClick={handleSyncOnlineIndicators}
                  disabled={isSyncingIndicators}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 rounded-xl transition-all shadow-xs flex items-center justify-center gap-2"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingIndicators ? 'animate-spin' : ''}`} />
                  {isSyncingIndicators ? 'Consultando Servicios Oficiales...' : 'Sincronizar Indicadores en Línea'}
                </button>
              </div>
            </div>

            {syncNotice && (
              <div className="mt-3 p-3 bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-xl text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{syncNotice}</span>
              </div>
            )}
          </div>

          {/* Tarjetas de Indicadores Económicos Clave del Mes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 block">Unidad de Fomento (UF)</span>
              <p className="text-2xl font-bold font-mono text-emerald-700 mt-1">
                ${periodParams.uf.toLocaleString('es-CL', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">Valor oficial inicio del período</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 block">Unidad Tributaria Mensual (UTM)</span>
              <p className="text-2xl font-bold font-mono text-indigo-700 mt-1">
                ${periodParams.utm.toLocaleString('es-CL')}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">Base de cálculo Impuesto Único Art. 43 LIR</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 block">Sueldo Mínimo Legal (IMM)</span>
              <p className="text-2xl font-bold font-mono text-slate-800 mt-1">
                ${periodParams.imm.toLocaleString('es-CL')}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">Ingreso Mínimo Mensual vigente</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 block">Tope Gratificación Art. 50</span>
              <p className="text-2xl font-bold font-mono text-amber-700 mt-1">
                ${Math.round((4.75 * periodParams.imm) / 12).toLocaleString('es-CL')}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">(4.75 × IMM) ÷ 12 mensual</p>
            </div>
          </div>

          {/* Topes Imponibles Previsionales */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">Topes Imponibles Previsionales Oficiales</h3>
              </div>
              <span className="text-xs text-slate-500">Publicado por la Superintendencia de Pensiones</span>
            </div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[11px] font-sans font-bold text-slate-600 uppercase block mb-1">Tope AFP / Salud / SIS</span>
                <p className="text-base font-bold text-indigo-900">{periodParams.topeImponibleAfpUf} UF</p>
                <p className="text-xs text-slate-600 mt-1">${Math.round(periodParams.topeImponibleAfpUf * periodParams.uf).toLocaleString('es-CL')} en pesos</p>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[11px] font-sans font-bold text-slate-600 uppercase block mb-1">Tope Seguro de Cesantía (AFC)</span>
                <p className="text-base font-bold text-emerald-900">{periodParams.topeImponibleAfcUf} UF</p>
                <p className="text-xs text-slate-600 mt-1">${Math.round(periodParams.topeImponibleAfcUf * periodParams.uf).toLocaleString('es-CL')} en pesos</p>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[11px] font-sans font-bold text-slate-600 uppercase block mb-1">Tope IPS / Ex-Cajas de Previsión</span>
                <p className="text-base font-bold text-slate-900">60.0 UF</p>
                <p className="text-xs text-slate-600 mt-1">${Math.round(60.0 * periodParams.uf).toLocaleString('es-CL')} en pesos</p>
              </div>
            </div>
          </div>

          {/* Tasas de Cotización de las AFPs y Aportes Empleador */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Tabla de AFPs */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-sm font-bold text-slate-900">Tasas y Comisiones AFP (Trabajadores Dependientes)</h3>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200 text-[10px] uppercase">
                      <th className="py-2.5 px-3">AFP</th>
                      <th className="py-2.5 px-2 text-center">Previred</th>
                      <th className="py-2.5 px-2 text-right">Fondo 10%</th>
                      <th className="py-2.5 px-2 text-right">Comisión</th>
                      <th className="py-2.5 px-3 text-right font-bold text-indigo-900">Tasa Total (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {Object.entries(DEFAULT_AFP_COMMISSIONS).filter(([k]) => !['INP', 'JUBILADO_COTIZA', 'JUBILADO_NO_COTIZA'].includes(k)).map(([afpKey, totalRate]) => {
                      const commission = +(totalRate - 10.0).toFixed(2);
                      const code = (PREVIRED_AFP_CODES as any)[afpKey] || '';
                      return (
                        <tr key={afpKey} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-bold font-sans text-slate-800 capitalize">{afpKey.toLowerCase()}</td>
                          <td className="py-2 px-2 text-center text-slate-500">{code}</td>
                          <td className="py-2 px-2 text-right text-slate-600">10.00%</td>
                          <td className="py-2 px-2 text-right text-slate-600">{commission.toFixed(2)}%</td>
                          <td className="py-2 px-3 text-right font-bold text-indigo-700 bg-indigo-50/40">{totalRate.toFixed(2)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Aportes Patronales / Costo Empleador */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-600" />
                  <h3 className="text-sm font-bold text-slate-900">Aportes Patronales (Leyes Sociales a Cargo del Empleador)</h3>
                </div>
              </div>
              <div className="p-4 space-y-3 font-mono text-xs">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex justify-between items-center">
                  <div>
                    <span className="font-sans font-bold text-slate-800 block">Seguro de Invalidez y Sobrevivencia (SIS)</span>
                    <span className="text-[11px] text-slate-500 font-sans">Aporte exclusivo del empleador sobre la renta imponible AFP</span>
                  </div>
                  <span className="text-sm font-bold text-indigo-700 bg-indigo-100/60 px-2.5 py-1 rounded-lg">
                    {periodParams.tasaSisPercent}%
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex justify-between items-center">
                  <div>
                    <span className="font-sans font-bold text-slate-800 block">Seguro de Cesantía Empleador (Indefinido)</span>
                    <span className="text-[11px] text-slate-500 font-sans">1.6% a Cuenta Individual (CIC) + 0.8% Fondo Solidario (FCS)</span>
                  </div>
                  <span className="text-sm font-bold text-emerald-700 bg-emerald-100/60 px-2.5 py-1 rounded-lg">
                    2.40%
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex justify-between items-center">
                  <div>
                    <span className="font-sans font-bold text-slate-800 block">Seguro de Cesantía Empleador (Plazo Fijo / Obra)</span>
                    <span className="text-[11px] text-slate-500 font-sans">3.0% íntegro al Fondo de Cesantía Solidario (FCS)</span>
                  </div>
                  <span className="text-sm font-bold text-emerald-700 bg-emerald-100/60 px-2.5 py-1 rounded-lg">
                    3.00%
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex justify-between items-center">
                  <div>
                    <span className="font-sans font-bold text-slate-800 block">Mutual de Seguridad / Ley 16.744</span>
                    <span className="text-[11px] text-slate-500 font-sans">0.90% Básica + 0.03% Ley SANNA (Accidentes del Trabajo)</span>
                  </div>
                  <span className="text-sm font-bold text-amber-700 bg-amber-100/60 px-2.5 py-1 rounded-lg">
                    {periodParams.tasaMutualPercent}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Tabla Oficial de Impuesto Único de Segunda Categoría (Art. 43 LIR) */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div className="flex items-center gap-2">
                <Calculator className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Tabla Mensual del Impuesto Único de Segunda Categoría (Art. 43 N° 1 Ley de la Renta - SII)
                </h3>
              </div>
              <span className="text-xs font-mono font-semibold text-slate-600">
                Calculada con UTM de {periodStr}: <strong className="text-indigo-700">${periodParams.utm.toLocaleString('es-CL')}</strong>
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200 text-[10px] uppercase">
                    <th className="py-2.5 px-3">Tramo</th>
                    <th className="py-2.5 px-3">Desde (UTM)</th>
                    <th className="py-2.5 px-3">Hasta (UTM)</th>
                    <th className="py-2.5 px-3 text-right">Renta Desde ($)</th>
                    <th className="py-2.5 px-3 text-right">Renta Hasta ($)</th>
                    <th className="py-2.5 px-2 text-center">Factor</th>
                    <th className="py-2.5 px-3 text-right">Cantidad a Rebajar ($)</th>
                    <th className="py-2.5 px-3 text-right">Tasa Máxima Efectiva</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  {[
                    { tramo: 1, desdeUtm: 0, hastaUtm: 13.5, factor: 0.0, rebajaUtm: 0, maxEfectiva: 'Exento' },
                    { tramo: 2, desdeUtm: 13.5, hastaUtm: 30.0, factor: 0.04, rebajaUtm: 0.54, maxEfectiva: '2.20%' },
                    { tramo: 3, desdeUtm: 30.0, hastaUtm: 50.0, factor: 0.08, rebajaUtm: 1.74, maxEfectiva: '4.52%' },
                    { tramo: 4, desdeUtm: 50.0, hastaUtm: 70.0, factor: 0.135, rebajaUtm: 4.49, maxEfectiva: '7.09%' },
                    { tramo: 5, desdeUtm: 70.0, hastaUtm: 90.0, factor: 0.23, rebajaUtm: 11.14, maxEfectiva: '10.62%' },
                    { tramo: 6, desdeUtm: 90.0, hastaUtm: 120.0, factor: 0.304, rebajaUtm: 17.80, maxEfectiva: '15.57%' },
                    { tramo: 7, desdeUtm: 120.0, hastaUtm: 310.0, factor: 0.35, rebajaUtm: 23.32, maxEfectiva: '27.48%' },
                    { tramo: 8, desdeUtm: 310.0, hastaUtm: null, factor: 0.40, rebajaUtm: 38.82, maxEfectiva: 'Más de 31.2%' }
                  ].map((row) => {
                    const desdeClp = Math.round(row.desdeUtm * periodParams.utm);
                    const hastaClp = row.hastaUtm ? Math.round(row.hastaUtm * periodParams.utm) : null;
                    const rebajaClp = Math.round(row.rebajaUtm * periodParams.utm);

                    return (
                      <tr key={row.tramo} className={row.factor === 0 ? 'bg-emerald-50/40 hover:bg-emerald-50' : 'hover:bg-slate-50'}>
                        <td className="py-2.5 px-3 font-bold font-sans text-slate-800">Tramo {row.tramo}</td>
                        <td className="py-2.5 px-3 text-slate-600">{row.desdeUtm.toFixed(1)}</td>
                        <td className="py-2.5 px-3 text-slate-600">{row.hastaUtm ? row.hastaUtm.toFixed(1) : 'Y MÁS'}</td>
                        <td className="py-2.5 px-3 text-right text-slate-700">${desdeClp.toLocaleString('es-CL')}</td>
                        <td className="py-2.5 px-3 text-right text-slate-700">{hastaClp ? `$${hastaClp.toLocaleString('es-CL')}` : 'En adelante'}</td>
                        <td className="py-2.5 px-2 text-center font-bold text-indigo-700">{row.factor > 0 ? (row.factor).toFixed(3) : 'Exento'}</td>
                        <td className="py-2.5 px-3 text-right text-rose-700">{rebajaClp > 0 ? `-$${rebajaClp.toLocaleString('es-CL')}` : '$0'}</td>
                        <td className="py-2.5 px-3 text-right text-slate-600">{row.maxEfectiva}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tramos de Asignación Familiar */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">Tramos de Asignación Familiar (IPS / SUSESO)</h3>
              </div>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="font-sans font-bold text-slate-800 block mb-1">Tramo A (Renta ≤ $539.328)</span>
                <p className="text-base font-bold text-emerald-700">${periodParams.tramosAsignacionFamiliar.tramoA.toLocaleString('es-CL')}</p>
                <p className="text-[11px] text-slate-500 font-sans mt-1">Por cada carga familiar acreditada</p>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="font-sans font-bold text-slate-800 block mb-1">Tramo B ($539.328 a $787.746)</span>
                <p className="text-base font-bold text-indigo-700">${periodParams.tramosAsignacionFamiliar.tramoB.toLocaleString('es-CL')}</p>
                <p className="text-[11px] text-slate-500 font-sans mt-1">Por cada carga familiar acreditada</p>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="font-sans font-bold text-slate-800 block mb-1">Tramo C ($787.746 a $1.228.614)</span>
                <p className="text-base font-bold text-amber-700">${periodParams.tramosAsignacionFamiliar.tramoC.toLocaleString('es-CL')}</p>
                <p className="text-[11px] text-slate-500 font-sans mt-1">Por cada carga familiar acreditada</p>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="font-sans font-bold text-slate-800 block mb-1">Tramo D (Renta &gt; $1.228.614)</span>
                <p className="text-base font-bold text-slate-500">$0</p>
                <p className="text-[11px] text-slate-500 font-sans mt-1">Sin pago (Solo derecho a cargas)</p>
              </div>
            </div>
          </div>

          {/* Base de Conocimiento Cuaderno Previred & SII + Mantenimiento de Remuneraciones */}
          <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-md border border-slate-800 space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-full flex items-center gap-1">
                    <BookOpen className="w-3 h-3 text-amber-400" />
                    Cuaderno Previred & SII Conectado
                  </span>
                  <span className="text-xs text-slate-300 font-mono">Período: {periodStr}</span>
                </div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>Knowledge Base Oficial de Factores y Leyes Sociales (Cuaderno Previred AI)</span>
                </h3>
                <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
                  El sistema rescata mes a mes la información oficial de Previred y el SII (UF, UTM, Sueldo Mínimo Legal Reajustado por Ley, Topes Imponibles 84.3 UF / 126.6 UF, Impuesto Único Art. 43 LIR y Tramos de Asignación Familiar). El Copiloto IA de Remuneraciones consulta este cuaderno para validar legalmente cada liquidación de sueldos.
                </p>
              </div>

              {onResetPayrollSlips && (
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleResetCurrentPeriod}
                    className="px-3.5 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5"
                    title={`Borrar liquidaciones guardadas del mes ${periodStr}`}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                    <span>Limpiar Datos Mes ({periodStr})</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleResetAllPeriods}
                    className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center gap-1.5"
                    title="Borrar de la base de datos todo el historial de remuneraciones de la empresa"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-white" />
                    <span>Borrar Todo el Historial</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PESTAÑA 4: APERTURA Y GESTIÓN DE CONCEPTOS DE HABERES Y DESCUENTOS */}
      {activeTab === 'CONCEPTOS' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2.5 py-0.5 text-xs font-bold bg-indigo-100 text-indigo-800 rounded-full">
                    Apertura Dinámica de Haberes y Descuentos
                  </span>
                </div>
                <h2 className="text-base font-bold text-slate-900">
                  Conceptos de Remuneraciones, Bonos, Comisiones y Viáticos
                </h2>
                <p className="text-xs text-slate-600 mt-1 max-w-2xl">
                  Cada empresa puede definir tantas aperturas como necesite. Configura el tipo (imponible, no imponible o descuento), su tributación y la cuenta contable del Plan de Cuentas para centralizar automáticamente en el Libro Diario.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsExcelBulkImportOpen(true)}
                  className="px-3.5 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-300 rounded-xl transition-colors flex items-center gap-1.5 shadow-2xs"
                >
                  <Upload className="w-4 h-4 text-emerald-600" />
                  <span>Carga Masiva Excel Tabulado</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsConceptsModalOpen(true)}
                  className="px-3.5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors flex items-center gap-1.5 shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Gestionar / Nuevo Concepto</span>
                </button>
              </div>
            </div>
          </div>

          {/* Grilla de Conceptos Configurados */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex justify-between items-center">
              <h3 className="text-xs font-bold text-slate-900">
                Catálogo de Conceptos ({companyConcepts.length} activos)
              </h3>
              <span className="text-xs text-slate-500 font-mono">
                Centralización: {companyConcepts.filter(c => c.accountingAccountId).length} conceptos con cuenta asociada
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-[11px] font-bold text-slate-700 uppercase">
                    <th className="py-2.5 px-4">Código</th>
                    <th className="py-2.5 px-4">Nombre del Concepto</th>
                    <th className="py-2.5 px-3 text-center">Naturaleza / Clasificación</th>
                    <th className="py-2.5 px-3 text-center">Art. 50 (Gratificación)</th>
                    <th className="py-2.5 px-3 text-center">Impuesto Único</th>
                    <th className="py-2.5 px-4">Cuenta Contable Centralización</th>
                    <th className="py-2.5 px-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {companyConcepts.map((c) => {
                    const acc = accounts.find(a => a.id === c.accountingAccountId || a.code === c.accountingAccountId);
                    const typeBadge = 
                      c.type === 'HABER_IMPONIBLE' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                      c.type === 'HABER_NO_IMPONIBLE' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      'bg-rose-50 text-rose-700 border-rose-200';
                    const typeLabel = 
                      c.type === 'HABER_IMPONIBLE' ? 'Haber Imponible' :
                      c.type === 'HABER_NO_IMPONIBLE' ? 'Haber No Imponible' : 'Otros Descuentos';

                    return (
                      <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">
                          {c.code}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-800">{c.name}</div>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${typeBadge}`}>
                            {typeLabel}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          {c.aplicaGratificacion ? (
                            <span className="text-emerald-700 font-bold">Sí</span>
                          ) : (
                            <span className="text-slate-400">No</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {c.tributable ? (
                            <span className="text-indigo-700 font-bold">Afecto</span>
                          ) : (
                            <span className="text-slate-500">Exento</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {acc ? (
                            <div className="font-mono text-xs text-slate-800">
                              <span className="font-bold text-indigo-700">{acc.code}</span> - {acc.name}
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">
                              {c.type.startsWith('HABER') ? 'Por defecto (Gastos de Remuneraciones)' : 'Por defecto (Otros Descuentos por Pagar)'}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => setIsConceptsModalOpen(true)}
                            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded hover:bg-indigo-50 transition-colors"
                          >
                            Editar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* PESTAÑA 5: RELIQUIDACIONES ANUALES */}
      {activeTab === 'RELIQUIDACIONES' && (
        <ReliquidacionesView
          companyId={companyId}
          employees={employees}
          companyRut={companyRut}
          companyName={companyName}
          savedSlips={savedSlips}
          currentPeriod={periodStr}
          accounts={accounts}
          savedReliquidations={savedReliquidations}
          onSaveReliquidation={onSaveReliquidation}
          onCentralizeVoucher={async (v) => { await onCentralizePayrollVoucher(v); }}
          onNavigateToLibroDiario={onNavigateToLibroDiario}
        />
      )}
        </>
      )}

      {/* MODAL: Parámetros del Trabajador */}
      {selectedEmployeeForParams && (
        <WorkerParametersModal
          employee={selectedEmployeeForParams}
          isOpen={!!selectedEmployeeForParams}
          onClose={() => setSelectedEmployeeForParams(null)}
          onSave={handleSaveEmployeeInternal}
        />
      )}

      {/* MODAL: Vigencias de Sueldo e Historial */}
      {selectedEmployeeForSalaryHistory && (
        <SalaryHistoryModal
          employee={selectedEmployeeForSalaryHistory}
          isOpen={!!selectedEmployeeForSalaryHistory}
          onClose={() => setSelectedEmployeeForSalaryHistory(null)}
          onSave={handleSaveEmployeeInternal}
        />
      )}

      {/* MODAL: Gestión y Apertura de Conceptos */}
      {isConceptsModalOpen && (
        <PayrollConceptsModal
          companyId={companyId}
          concepts={companyConcepts}
          accounts={accounts}
          isOpen={isConceptsModalOpen}
          onClose={() => setIsConceptsModalOpen(false)}
          onSaveConcept={handleSaveConceptInternal}
          onDeleteConcept={handleDeleteConceptInternal}
        />
      )}

      {/* MODAL: Carga Masiva desde Excel Tabulado */}
      {isExcelBulkImportOpen && (
        <ExcelBulkImportModal
          employees={employees}
          concepts={companyConcepts}
          periodStr={periodStr}
          isOpen={isExcelBulkImportOpen}
          onClose={() => setIsExcelBulkImportOpen(false)}
          onApply={handleApplyBulkExcelConcepts}
        />
      )}

      {/* MODAL: Receptor Masivo y Conciliador Previred */}
      {isPreviredReceptorOpen && (
        <PreviredReceptorModal
          isOpen={isPreviredReceptorOpen}
          onClose={() => setIsPreviredReceptorOpen(false)}
          periodStr={periodStr}
          companyName={companyName}
          companyRut={companyRut}
          employees={employees}
          slips={slipsForPeriod}
          onApplyNovedades={handleApplyNovedadesFromPrevired}
        />
      )}

      {/* MODAL: Novedades y Ajuste Salarial Exclusivo del Mes */}
      {selectedEmployeeForNovedades && (
        <WorkerMonthlyNovedadesModal
          isOpen={!!selectedEmployeeForNovedades}
          onClose={() => setSelectedEmployeeForNovedades(null)}
          employee={selectedEmployeeForNovedades}
          periodStr={periodStr}
          currentInput={monthInputs[selectedEmployeeForNovedades.id] || {}}
          params={periodParams}
          onSave={handleSaveWorkerMonthlyNovedades}
        />
      )}

      {/* MODAL: Finiquitos e Indemnizaciones Legales (Art. 161/163 CdT) */}
      {isFiniquitosModalOpen && (
        <FiniquitosCalculatorModal
          companyName={companyName}
          companyRut={companyRut}
          companyAddress={companyAddress}
          employees={employees}
          accounts={accounts}
          onClose={() => setIsFiniquitosModalOpen(false)}
        />
      )}
      {/* MODAL: Cargar / Modificar Indicadores Previsionales del Período */}
      {isEditingPeriodIndicators && indicatorFormData && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
            {/* Header Modal */}
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-600 rounded-xl text-white">
                  <SlidersHorizontal className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white leading-tight">
                    Cargar / Modificar Indicadores del Mes ({periodStr})
                  </h2>
                  <p className="text-xs text-slate-300">
                    Configuración mensual exclusiva para el período en proceso. Los períodos pasados permanecen congelados e inmutables.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditingPeriodIndicators(false)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-5 h-5 rotate-180" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSavePeriodIndicators} className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Sección 1: Indicadores Económicos Clave */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  1. Indicadores Económicos Clave del Mes
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Sueldo Mínimo Legal (IMM / CLP) *
                    </label>
                    <input
                      type="number"
                      required
                      min={100000}
                      step={1000}
                      value={indicatorFormData.imm}
                      onChange={(e) => setIndicatorFormData({ ...indicatorFormData, imm: Number(e.target.value) })}
                      className="w-full px-3 py-2 text-sm font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                    <p className="text-[10px] text-slate-500 mt-0.5">Base gratificación Art. 50 (Tope $ {Math.round((4.75 * indicatorFormData.imm) / 12).toLocaleString('es-CL')})</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Unidad de Fomento (UF / CLP) *
                    </label>
                    <input
                      type="number"
                      required
                      min={1000}
                      step={0.01}
                      value={indicatorFormData.uf}
                      onChange={(e) => setIndicatorFormData({ ...indicatorFormData, uf: Number(e.target.value) })}
                      className="w-full px-3 py-2 text-sm font-mono font-bold text-emerald-800 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                    <p className="text-[10px] text-slate-500 mt-0.5">Valor oficial inicio del período</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Unidad Tributaria Mensual (UTM / CLP) *
                    </label>
                    <input
                      type="number"
                      required
                      min={1000}
                      step={1}
                      value={indicatorFormData.utm}
                      onChange={(e) => setIndicatorFormData({ ...indicatorFormData, utm: Number(e.target.value) })}
                      className="w-full px-3 py-2 text-sm font-mono font-bold text-indigo-800 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                    <p className="text-[10px] text-slate-500 mt-0.5">Base Impuesto Único de Segunda Categoría</p>
                  </div>
                </div>
              </div>

              {/* Sección 2: Topes Imponibles Previsionales */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-indigo-600" />
                  2. Topes Imponibles Previsionales Oficiales (en UF)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Tope AFP / Salud / SIS (UF)
                    </label>
                    <input
                      type="number"
                      required
                      min={50}
                      max={150}
                      step={0.1}
                      value={indicatorFormData.topeImponibleAfpUf}
                      onChange={(e) => setIndicatorFormData({ ...indicatorFormData, topeImponibleAfpUf: Number(e.target.value) })}
                      className="w-full px-3 py-2 text-sm font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
                    />
                    <p className="text-[10px] text-slate-500 mt-0.5">Equivale a $ {Math.round(indicatorFormData.topeImponibleAfpUf * indicatorFormData.uf).toLocaleString('es-CL')} en pesos</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Tope Seguro de Cesantía AFC (UF)
                    </label>
                    <input
                      type="number"
                      required
                      min={50}
                      max={200}
                      step={0.1}
                      value={indicatorFormData.topeImponibleAfcUf}
                      onChange={(e) => setIndicatorFormData({ ...indicatorFormData, topeImponibleAfcUf: Number(e.target.value) })}
                      className="w-full px-3 py-2 text-sm font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
                    />
                    <p className="text-[10px] text-slate-500 mt-0.5">Equivale a $ {Math.round(indicatorFormData.topeImponibleAfcUf * indicatorFormData.uf).toLocaleString('es-CL')} en pesos</p>
                  </div>
                </div>
              </div>

              {/* Sección 3: Aportes Patronales y Protección Social */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <HeartPulse className="w-4 h-4 text-rose-600" />
                  3. Aportes Patronales y Protección Social (% a Cargo del Empleador)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Seguro de Invalidez SIS (%)
                    </label>
                    <input
                      type="number"
                      required
                      min={0}
                      max={10}
                      step={0.01}
                      value={indicatorFormData.tasaSisPercent}
                      onChange={(e) => setIndicatorFormData({ ...indicatorFormData, tasaSisPercent: Number(e.target.value) })}
                      className="w-full px-3 py-2 text-sm font-mono font-bold text-indigo-900 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
                    />
                    <p className="text-[10px] text-slate-500 mt-0.5">Aporte empleador sobre renta imponible AFP</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Mutualidad + Ley SANNA (%)
                    </label>
                    <input
                      type="number"
                      required
                      min={0}
                      max={10}
                      step={0.01}
                      value={indicatorFormData.tasaMutualPercent}
                      onChange={(e) => setIndicatorFormData({ ...indicatorFormData, tasaMutualPercent: Number(e.target.value) })}
                      className="w-full px-3 py-2 text-sm font-mono font-bold text-amber-900 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500"
                    />
                    <p className="text-[10px] text-slate-500 mt-0.5">Básica 0.90% + 0.03% SANNA + Adicional</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Mayor Cotización Protección Social (%)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      step={0.01}
                      value={indicatorFormData.tasaReformaProteccionSocialPercent || 0}
                      onChange={(e) => setIndicatorFormData({ ...indicatorFormData, tasaReformaProteccionSocialPercent: Number(e.target.value) })}
                      className="w-full px-3 py-2 text-sm font-mono font-bold text-emerald-900 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                    <p className="text-[10px] text-slate-500 mt-0.5">Reforma previsional / Mayor aporte legal si aplica</p>
                  </div>
                </div>
              </div>

              {/* Sección 4: Tasas de AFP */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-indigo-600" />
                  4. Tasas Totales de Cotización AFP (%) (10% Fondo Obligatorio + Comisión)
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
                  {Object.entries(indicatorFormData.afpCommissions || DEFAULT_AFP_COMMISSIONS)
                    .filter(([k]) => !['INP', 'JUBILADO_COTIZA', 'JUBILADO_NO_COTIZA'].includes(k))
                    .map(([afpKey, rate]) => (
                      <div key={afpKey} className="bg-white p-2.5 rounded-xl border border-slate-200">
                        <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                          {afpKey.toLowerCase()}
                        </label>
                        <input
                          type="number"
                          min={10}
                          max={25}
                          step={0.01}
                          value={rate}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setIndicatorFormData({
                              ...indicatorFormData,
                              afpCommissions: {
                                ...(indicatorFormData.afpCommissions || DEFAULT_AFP_COMMISSIONS),
                                [afpKey]: val
                              }
                            });
                          }}
                          className="w-full px-2 py-1 text-xs font-mono font-bold text-indigo-900 border border-slate-300 rounded-lg text-center"
                        />
                      </div>
                    ))}
                </div>
              </div>

              {/* Footer Acciones */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    const official = getPrevisionalParametersForPeriod(periodStr);
                    setIndicatorFormData({ ...official });
                  }}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Restablecer Oficiales Previred
                </button>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setIsEditingPeriodIndicators(false)}
                    className="flex-1 sm:flex-initial px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors border border-slate-200 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingIndicators}
                    className="flex-1 sm:flex-initial px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{isSavingIndicators ? 'Guardando...' : `Guardar Indicadores de ${periodStr}`}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
