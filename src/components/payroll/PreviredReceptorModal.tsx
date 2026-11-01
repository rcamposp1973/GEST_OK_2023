import React, { useState, useMemo } from 'react';
import { Employee, PayrollSlip, PensionSystem, HealthSystem } from '../../types';
import { MonthPayrollInput } from '../../utils/payrollCalculator';
import { 
  X, FileText, Upload, CheckCircle2, AlertTriangle, ArrowRight, 
  Download, RefreshCw, Layers, ShieldCheck, DollarSign, Users, Sparkles
} from 'lucide-react';

interface PreviredReceptorModalProps {
  isOpen: boolean;
  onClose: () => void;
  periodStr: string;
  companyName: string;
  companyRut: string;
  employees: Employee[];
  slips: PayrollSlip[];
  onApplyNovedades: (novedades: Record<string, MonthPayrollInput>) => void;
}

interface ParsedPreviredRow {
  rut: string;
  dv: string;
  cleanRut: string;
  fullName: string;
  diasTrabajados: number;
  imponibleAfp: number;
  cotizAfp: number;
  cotizSalud: number;
  cotizAfcTrabajador: number;
  cotizAfcEmpleador: number;
  cotizSis: number;
  cotizMutual: number;
  liquido: number;
  codAfp?: string;
  codSalud?: string;
  // Comparación con sistema
  matchedSlip?: PayrollSlip;
  matchedEmployee?: Employee;
  diffImponible: number;
  diffAfp: number;
  diffSalud: number;
  diffAfc: number;
  diffTotal: number;
  status: 'CUADRADO' | 'DIFERENCIA' | 'NO_REGISTRADO';
}

export const PreviredReceptorModal: React.FC<PreviredReceptorModalProps> = ({
  isOpen,
  onClose,
  periodStr,
  companyName,
  companyRut,
  employees,
  slips,
  onApplyNovedades
}) => {
  const [rawText, setRawText] = useState('');
  const [filterMode, setFilterMode] = useState<'TODOS' | 'CUADRADO' | 'DIFERENCIAS' | 'NO_REGISTRADO'>('TODOS');
  const [appliedNotice, setAppliedNotice] = useState<string | null>(null);

  if (!isOpen) return null;

  // RUT helper
  const cleanRut = (r: string) => r.replace(/[^0-9Kk]/g, '').toUpperCase();

  // Index slips & employees by cleaned RUT
  const slipMap = new Map<string, PayrollSlip>();
  for (const s of slips) {
    slipMap.set(cleanRut(s.employeeRut), s);
  }

  const empMap = new Map<string, Employee>();
  for (const e of employees) {
    empMap.set(cleanRut(e.rut), e);
  }

  // Parse Previred text (Format: 105 fields delimited by semicolon or tab or comma)
  const parsedRows: ParsedPreviredRow[] = useMemo(() => {
    if (!rawText.trim()) return [];

    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    const results: ParsedPreviredRow[] = [];

    for (const line of lines) {
      // Ignore comment or header lines if present
      if (line.toLowerCase().startsWith('rut') || line.toLowerCase().startsWith('periodo')) continue;

      const cols = line.split(/[;\t,]/).map(c => c.trim().replace(/^"|"$/g, ''));
      if (cols.length < 3) continue;

      let rut = '';
      let dv = '';
      let fullName = '';
      let diasTrabajados = 30;
      let imponibleAfp = 0;
      let cotizAfp = 0;
      let cotizSalud = 0;
      let cotizAfcTrabajador = 0;
      let cotizAfcEmpleador = 0;
      let cotizSis = 0;
      let cotizMutual = 0;
      let liquido = 0;
      let codAfp = '';
      let codSalud = '';

      // Check if format is the 105-field standard or cartola
      if (cols.length >= 15 && cols[0].replace(/[^0-9]/g, '').length >= 7) {
        // Standard Previred Line
        rut = cols[0];
        dv = cols[1] || '';
        const apePat = cols[2] || '';
        const apeMat = cols[3] || '';
        const nom = cols[4] || '';
        fullName = `${apePat} ${apeMat} ${nom}`.trim() || `Trabajador RUT ${rut}-${dv}`;
        diasTrabajados = parseInt(cols[12], 10) || 30;
        codAfp = cols[14] || '';
        imponibleAfp = parseFloat(cols[15]?.replace(/[^0-9.]/g, '') || '0') || 0;
        cotizAfp = parseFloat(cols[16]?.replace(/[^0-9.]/g, '') || '0') || 0;
        cotizSis = parseFloat(cols[19]?.replace(/[^0-9.]/g, '') || '0') || 0;
        codSalud = cols[22] || '';
        cotizSalud = (parseFloat(cols[25]?.replace(/[^0-9.]/g, '') || '0') || 0) + (parseFloat(cols[26]?.replace(/[^0-9.]/g, '') || '0') || 0);
        cotizAfcTrabajador = parseFloat(cols[31]?.replace(/[^0-9.]/g, '') || '0') || 0;
        cotizAfcEmpleador = parseFloat(cols[32]?.replace(/[^0-9.]/g, '') || '0') || 0;
        cotizMutual = parseFloat(cols[33]?.replace(/[^0-9.]/g, '') || '0') || 0;
        liquido = parseFloat(cols[35]?.replace(/[^0-9.]/g, '') || '0') || 0;
      } else {
        // Freeform / Cartola columns: [RUT, Nombre, Imponible, AFP, Salud, AFC...]
        rut = cols[0];
        dv = cols[0].includes('-') ? cols[0].split('-')[1] : '';
        fullName = cols[1] || 'Colaborador';
        imponibleAfp = parseFloat(cols[2]?.replace(/[^0-9.]/g, '') || '0') || 0;
        cotizAfp = parseFloat(cols[3]?.replace(/[^0-9.]/g, '') || '0') || 0;
        cotizSalud = parseFloat(cols[4]?.replace(/[^0-9.]/g, '') || '0') || 0;
        cotizAfcTrabajador = parseFloat(cols[5]?.replace(/[^0-9.]/g, '') || '0') || 0;
        diasTrabajados = parseInt(cols[6]?.replace(/[^0-9]/g, '') || '30', 10) || 30;
      }

      const cRut = cleanRut(dv ? `${rut}-${dv}` : rut);
      const matchedSlip = slipMap.get(cRut);
      const matchedEmployee = empMap.get(cRut);

      // Conciliation variance
      let diffImponible = 0;
      let diffAfp = 0;
      let diffSalud = 0;
      let diffAfc = 0;
      let diffTotal = 0;
      let status: 'CUADRADO' | 'DIFERENCIA' | 'NO_REGISTRADO' = 'NO_REGISTRADO';

      if (matchedSlip) {
        diffImponible = Math.round(imponibleAfp - matchedSlip.totalHaberesImponibles);
        diffAfp = Math.round(cotizAfp - matchedSlip.afpMonto);
        diffSalud = Math.round(cotizSalud - matchedSlip.saludMontoTotal);
        diffAfc = Math.round(cotizAfcTrabajador - matchedSlip.afcTrabajadorMonto);
        diffTotal = Math.abs(diffImponible) + Math.abs(diffAfp) + Math.abs(diffSalud) + Math.abs(diffAfc);
        status = diffTotal <= 5 ? 'CUADRADO' : 'DIFERENCIA';
      } else if (matchedEmployee) {
        diffImponible = Math.round(imponibleAfp - (matchedEmployee.baseSalary || 0));
        status = 'DIFERENCIA';
      }

      results.push({
        rut,
        dv,
        cleanRut: cRut,
        fullName: matchedEmployee?.name || fullName,
        diasTrabajados,
        imponibleAfp,
        cotizAfp,
        cotizSalud,
        cotizAfcTrabajador,
        cotizAfcEmpleador,
        cotizSis,
        cotizMutual,
        liquido,
        codAfp,
        codSalud,
        matchedSlip,
        matchedEmployee,
        diffImponible,
        diffAfp,
        diffSalud,
        diffAfc,
        diffTotal,
        status
      });
    }

    return results;
  }, [rawText, slips, employees]);

  // Totals & Metrics
  const metrics = useMemo(() => {
    const totalCount = parsedRows.length;
    const cuadrados = parsedRows.filter(r => r.status === 'CUADRADO').length;
    const diferencias = parsedRows.filter(r => r.status === 'DIFERENCIA').length;
    const noRegistrados = parsedRows.filter(r => r.status === 'NO_REGISTRADO').length;

    const totalImponiblePrevired = parsedRows.reduce((sum, r) => sum + r.imponibleAfp, 0);
    const totalImponibleSistema = slips.reduce((sum, s) => sum + s.totalHaberesImponibles, 0);
    const totalAfpPrevired = parsedRows.reduce((sum, r) => sum + r.cotizAfp, 0);
    const totalAfpSistema = slips.reduce((sum, s) => sum + s.afpMonto, 0);
    const totalSaludPrevired = parsedRows.reduce((sum, r) => sum + r.cotizSalud, 0);
    const totalSaludSistema = slips.reduce((sum, s) => sum + s.saludMontoTotal, 0);

    const matchRate = totalCount > 0 ? Math.round((cuadrados / totalCount) * 100) : 0;

    return {
      totalCount,
      cuadrados,
      diferencias,
      noRegistrados,
      totalImponiblePrevired,
      totalImponibleSistema,
      totalAfpPrevired,
      totalAfpSistema,
      totalSaludPrevired,
      totalSaludSistema,
      matchRate
    };
  }, [parsedRows, slips]);

  // Filtered rows for UI
  const filteredRows = useMemo(() => {
    if (filterMode === 'TODOS') return parsedRows;
    if (filterMode === 'CUADRADO') return parsedRows.filter(r => r.status === 'CUADRADO');
    if (filterMode === 'DIFERENCIAS') return parsedRows.filter(r => r.status === 'DIFERENCIA');
    if (filterMode === 'NO_REGISTRADO') return parsedRows.filter(r => r.status === 'NO_REGISTRADO');
    return parsedRows;
  }, [parsedRows, filterMode]);

  // Load official sample
  const handleLoadSample = () => {
    // Generate sample based on actual company employees
    const lines = employees.map(emp => {
      const cleanR = cleanRut(emp.rut);
      const rutNum = cleanR.slice(0, -1).padStart(11, '0');
      const dv = cleanR.slice(-1);
      const names = emp.name.split(' ');
      const apePat = (names[0] || 'PEREZ').padEnd(30, ' ');
      const apeMat = (names[1] || 'GONZALEZ').padEnd(30, ' ');
      const nom = (names.slice(2).join(' ') || 'JUAN').padEnd(30, ' ');
      const baseSal = emp.baseSalary || 500000;
      const grat = emp.hasGratificacionLegal ? Math.round(baseSal * 0.25) : 0;
      const imponible = baseSal + grat;
      const afpVal = Math.round(imponible * ((emp.pensionCommissionPercent || 11.27) / 100));
      const saludVal = Math.round(imponible * 0.07);
      const afcVal = emp.contractType === 'INDEFINIDO' ? Math.round(imponible * 0.006) : 0;
      const afcEmpVal = emp.contractType === 'INDEFINIDO' ? Math.round(imponible * 0.024) : Math.round(imponible * 0.03);
      const sisVal = Math.round(imponible * 0.0162);
      const mutVal = Math.round(imponible * 0.0093);
      const liq = imponible - afpVal - saludVal - afcVal;

      return [
        rutNum, dv, apePat.trim(), apeMat.trim(), nom.trim(),
        'M', 'CHL', '01', periodStr.replace('-', ''), periodStr.replace('-', ''),
        '0', '0', '30', '0', '05',
        String(imponible), String(afpVal), '0', '0', String(sisVal),
        '0', '0', '01', '0', String(imponible), String(saludVal), '0',
        '0', '0', '0', String(imponible), String(afcVal), String(afcEmpVal),
        String(mutVal), '0', String(liq)
      ].join(';');
    });

    setRawText(lines.join('\r\n'));
  };

  // Sync / Apply Novedades to system
  const handleApplyToSystem = () => {
    const novedades: Record<string, MonthPayrollInput> = {};
    let appliedCount = 0;

    for (const r of parsedRows) {
      if (r.matchedEmployee) {
        novedades[r.matchedEmployee.id] = {
          diasTrabajados: r.diasTrabajados,
          sueldoBaseOverride: r.imponibleAfp > 0 ? r.imponibleAfp : undefined
        };
        appliedCount++;
      }
    }

    onApplyNovedades(novedades);
    setAppliedNotice(`¡Sincronización Exitosa! Se actualizaron las novedades y bases imponibles de ${appliedCount} trabajadores para el período ${periodStr}.`);
    setTimeout(() => {
      setAppliedNotice(null);
    }, 4000);
  };

  // Export CSV reconciliation report
  const handleExportCsv = () => {
    const headers = [
      'RUT',
      'Nombre Trabajador',
      'Días Trabajados',
      'Imponible Previred ($)',
      'Imponible Sistema ($)',
      'Dif. Imponible ($)',
      'AFP Previred ($)',
      'AFP Sistema ($)',
      'Dif. AFP ($)',
      'Salud Previred ($)',
      'Salud Sistema ($)',
      'Dif. Salud ($)',
      'Estado Conciliación'
    ];

    const lines = [headers.join(';')];

    for (const r of parsedRows) {
      lines.push([
        r.cleanRut,
        `"${r.fullName}"`,
        r.diasTrabajados,
        r.imponibleAfp,
        r.matchedSlip?.totalHaberesImponibles || 0,
        r.diffImponible,
        r.cotizAfp,
        r.matchedSlip?.afpMonto || 0,
        r.diffAfp,
        r.cotizSalud,
        r.matchedSlip?.saludMontoTotal || 0,
        r.diffSalud,
        r.status
      ].join(';'));
    }

    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Conciliacion_Previred_${companyRut}_${periodStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl overflow-hidden flex flex-col max-h-[94vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600 rounded-xl text-white shadow-xs">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white leading-tight">
                  Receptor Masivo y Conciliador Previred
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-indigo-800 text-indigo-200 rounded-md">
                  {periodStr}
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Audita y concilia en tiempo real lo declarado y pagado en Previred vs. el cálculo teórico de remuneraciones de {companyName}.
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

        {/* Notice */}
        {appliedNotice && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-3 text-emerald-900 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{appliedNotice}</span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Input & Instructions Box */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <label className="text-xs font-bold text-slate-900 block">
                  Pegar o Cargar Archivo Previred (.txt plano de 105 campos, cartola de cotizaciones pagadas o CSV)
                </label>
                <p className="text-[11px] text-slate-500">
                  El sistema detecta automáticamente la estructura, extrae las rentas imponibles, cotizaciones de AFP, Salud, AFC y valida cada trabajador.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleLoadSample}
                  className="px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  Cargar Ejemplo Previred Oficial
                </button>
                {parsedRows.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setRawText('')}
                    className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                  >
                    Limpiar
                  </button>
                )}
              </div>
            </div>

            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Pega aquí el contenido de tu archivo Previred (.txt de 105 campos delimitado por punto y coma, o cartola de cotizaciones)..."
              rows={4}
              className="w-full p-3 font-mono text-xs text-slate-800 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-2xs"
            />
          </div>

          {/* KPI Dashboard */}
          {parsedRows.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Trabajadores Analizados</span>
                <p className="text-2xl font-bold font-mono text-slate-900 mt-0.5">
                  {metrics.totalCount}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {metrics.cuadrados} exactos &bull; {metrics.diferencias} con diferencias
                </p>
              </div>

              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Exactitud / Cuadratura</span>
                <p className={`text-2xl font-bold font-mono mt-0.5 ${metrics.matchRate >= 90 ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {metrics.matchRate}%
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {metrics.matchRate === 100 ? '✓ 100% Coincidencia legal' : 'Revisar discrepancias'}
                </p>
              </div>

              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Imponible Previred vs Sistema</span>
                <p className="text-lg font-bold font-mono text-slate-900 mt-0.5">
                  ${metrics.totalImponiblePrevired.toLocaleString('es-CL')}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5 font-mono">
                  Sistema: ${metrics.totalImponibleSistema.toLocaleString('es-CL')}
                </p>
              </div>

              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">AFP Previred vs Sistema</span>
                <p className="text-lg font-bold font-mono text-indigo-700 mt-0.5">
                  ${metrics.totalAfpPrevired.toLocaleString('es-CL')}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5 font-mono">
                  Sistema: ${metrics.totalAfpSistema.toLocaleString('es-CL')}
                </p>
              </div>
            </div>
          )}

          {/* Table of Reconciliation */}
          {parsedRows.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-3.5 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-bold text-slate-700 mr-2">Filtrar:</span>
                  {(['TODOS', 'CUADRADO', 'DIFERENCIAS', 'NO_REGISTRADO'] as const).map(mode => (
                    <button
                      key={mode}
                      onClick={() => setFilterMode(mode)}
                      className={`px-2.5 py-1 text-xs rounded-lg font-semibold transition-colors ${
                        filterMode === mode
                          ? 'bg-slate-900 text-white shadow-2xs'
                          : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
                      }`}
                    >
                      {mode === 'TODOS' ? `Todos (${parsedRows.length})` :
                       mode === 'CUADRADO' ? `Cuadrados (${metrics.cuadrados})` :
                       mode === 'DIFERENCIAS' ? `Diferencias (${metrics.diferencias})` :
                       `No Ficha (${metrics.noRegistrados})`}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportCsv}
                    className="px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Exportar Auditoría (.csv)
                  </button>

                  <button
                    type="button"
                    onClick={handleApplyToSystem}
                    className="px-3.5 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Sincronizar a Remuneraciones del Mes
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto max-h-[440px] overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200 text-[11px] font-bold text-slate-700 uppercase">
                    <tr>
                      <th className="py-2.5 px-3">Trabajador</th>
                      <th className="py-2.5 px-2 text-center">Días</th>
                      <th className="py-2.5 px-3 text-right">Imponible Previred</th>
                      <th className="py-2.5 px-3 text-right">Imponible Sistema</th>
                      <th className="py-2.5 px-3 text-right">AFP Previred</th>
                      <th className="py-2.5 px-3 text-right">AFP Sistema</th>
                      <th className="py-2.5 px-3 text-right">Salud Previred</th>
                      <th className="py-2.5 px-3 text-right">Salud Sistema</th>
                      <th className="py-2.5 px-3 text-center">Estado Auditoría</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {filteredRows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2.5 px-3 font-sans">
                          <p className="font-semibold text-slate-900 leading-tight">{row.fullName}</p>
                          <p className="text-[11px] text-slate-500 font-mono mt-0.5">RUT: {row.cleanRut}</p>
                        </td>

                        <td className="py-2.5 px-2 text-center font-bold text-slate-800">
                          {row.diasTrabajados}
                        </td>

                        <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                          ${row.imponibleAfp.toLocaleString('es-CL')}
                        </td>

                        <td className="py-2.5 px-3 text-right text-slate-700">
                          ${(row.matchedSlip?.totalHaberesImponibles || 0).toLocaleString('es-CL')}
                        </td>

                        <td className="py-2.5 px-3 text-right font-medium text-indigo-700">
                          ${row.cotizAfp.toLocaleString('es-CL')}
                        </td>

                        <td className="py-2.5 px-3 text-right text-slate-600">
                          ${(row.matchedSlip?.afpMonto || 0).toLocaleString('es-CL')}
                        </td>

                        <td className="py-2.5 px-3 text-right font-medium text-indigo-700">
                          ${row.cotizSalud.toLocaleString('es-CL')}
                        </td>

                        <td className="py-2.5 px-3 text-right text-slate-600">
                          ${(row.matchedSlip?.saludMontoTotal || 0).toLocaleString('es-CL')}
                        </td>

                        <td className="py-2.5 px-3 text-center font-sans">
                          {row.status === 'CUADRADO' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 rounded-md">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              100% Cuadrado
                            </span>
                          ) : row.status === 'DIFERENCIA' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-900 rounded-md" title={`Diferencia total: $${row.diffTotal.toLocaleString('es-CL')}`}>
                              <AlertTriangle className="w-3 h-3 text-amber-600" />
                              Dif: ${row.diffTotal.toLocaleString('es-CL')}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-700 rounded-md">
                              No en Ficha
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-200 flex items-center justify-between">
          <p className="text-xs text-slate-500">
            {parsedRows.length > 0 ? `${parsedRows.length} colaboradores procesados.` : 'Pega un archivo de Previred o presiona "Cargar Ejemplo Previred Oficial".'}
          </p>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
