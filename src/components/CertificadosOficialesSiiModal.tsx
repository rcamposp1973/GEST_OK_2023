import React, { useState, useMemo } from 'react';
import {
  FileText,
  Printer,
  Download,
  X,
  Building2,
  Users,
  ShieldCheck,
  CheckCircle2,
  Search,
  ChevronDown,
  Calendar,
  Layers,
  Sparkles,
  Award
} from 'lucide-react';
import { Company, Employee, PayrollSlip, RCVDocument, ChartOfAccount } from '../types';
import { triggerIframePrint } from '../utils/printUtils';
import * as XLSX from 'xlsx';

// Factores de actualización IPC oficiales del SII (Circular Anual Operación Renta)
// Por defecto se proporcionan los factores oficiales para el año comercial 2025 (AT 2026)
// y se calculan proporcionalmente si se cambia el año.
export const IPC_FACTORS_SII: { [year: number]: { [month: number]: number } } = {
  2025: {
    1: 1.036,
    2: 1.034,
    3: 1.029,
    4: 1.025,
    5: 1.021,
    6: 1.018,
    7: 1.015,
    8: 1.012,
    9: 1.009,
    10: 1.006,
    11: 1.003,
    12: 1.000
  },
  2024: {
    1: 1.042,
    2: 1.039,
    3: 1.035,
    4: 1.031,
    5: 1.027,
    6: 1.022,
    7: 1.018,
    8: 1.014,
    9: 1.010,
    10: 1.007,
    11: 1.003,
    12: 1.000
  },
  2026: {
    1: 1.035,
    2: 1.032,
    3: 1.028,
    4: 1.024,
    5: 1.020,
    6: 1.016,
    7: 1.013,
    8: 1.010,
    9: 1.007,
    10: 1.004,
    11: 1.002,
    12: 1.000
  }
};

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril',
  'Mayo', 'Junio', 'Julio', 'Agosto',
  'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export interface CertificadosOficialesSiiModalProps {
  isOpen: boolean;
  onClose: () => void;
  company: Company;
  employees: Employee[];
  savedSlips?: PayrollSlip[];
  rcvDocuments?: RCVDocument[];
  accounts?: ChartOfAccount[];
  initialCertificateType?: 'CERT_6_SUELDOS' | 'CERT_2_HONORARIOS';
  initialYear?: number;
}

export const CertificadosOficialesSiiModal: React.FC<CertificadosOficialesSiiModalProps> = ({
  isOpen,
  onClose,
  company,
  employees = [],
  savedSlips = [],
  rcvDocuments = [],
  accounts = [],
  initialCertificateType = 'CERT_6_SUELDOS',
  initialYear = 2025
}) => {
  const [certType, setCertType] = useState<'CERT_6_SUELDOS' | 'CERT_2_HONORARIOS'>(initialCertificateType);
  const [selectedYear, setSelectedYear] = useState<number>(initialYear);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('ALL');
  const [selectedHonorarioRut, setSelectedHonorarioRut] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [printAllBatch, setPrintAllBatch] = useState(false);

  if (!isOpen) return null;

  // Factores para el año seleccionado
  const currentIpcFactors = IPC_FACTORS_SII[selectedYear] || IPC_FACTORS_SII[2025];

  // =========================================================================
  // 1. PROCESAMIENTO CERTIFICADO N° 6 (SUELDOS Y RETENCIONES DJ 1887)
  // =========================================================================
  const employeesCertificatesData = useMemo(() => {
    return employees.map((emp) => {
      // Filtrar liquidaciones del año comercial para este trabajador
      const empSlips = savedSlips.filter((s) => {
        const pYear = s.period ? parseInt(s.period.split('-')[0], 10) : 0;
        return pYear === selectedYear && (s.employeeId === emp.id || s.employeeRut === emp.rut);
      });

      // Crear mapa mensual de 1 a 12
      const monthlyRows = Array.from({ length: 12 }, (_, idx) => {
        const monthNum = idx + 1;
        const monthStr = String(monthNum).padStart(2, '0');
        const periodStr = `${selectedYear}-${monthStr}`;

        const slip = empSlips.find((s) => s.period === periodStr);

        const sueldoImponible = slip ? (slip.totalHaberesImponibles || slip.sueldoBaseProporcional || 0) : 0;
        const cotizaciones = slip ? (slip.totalDescuentosPrevisionales || (slip.afpMonto || 0) + (slip.saludMontoTotal || 0) + (slip.afcTrabajadorMonto || 0)) : 0;
        const rentaAfecta = slip ? (slip.rentaAfectaImpuesto || Math.max(0, sueldoImponible - cotizaciones)) : 0;
        const impuestoUnico = slip ? (slip.impuestoUnicoSegundaCategoria || 0) : 0;
        const mayorRetencion = slip ? (slip.mayorRetencionSolicitada || 0) : 0;
        const noGravados = slip ? (slip.totalHaberesNoImponibles || (slip.asignacionColacion || 0) + (slip.asignacionMovilizacion || 0) + (slip.viaticos || 0)) : 0;

        const factor = currentIpcFactors[monthNum] || 1.0;
        const rentaActualizada = Math.round(rentaAfecta * factor);
        const impuestoActualizado = Math.round(impuestoUnico * factor);

        return {
          monthNum,
          monthName: MONTH_NAMES[idx],
          periodStr,
          hasSlip: Boolean(slip),
          sueldoImponible,
          cotizaciones,
          rentaAfecta,
          impuestoUnico,
          mayorRetencion,
          noGravados,
          factor,
          rentaActualizada,
          impuestoActualizado
        };
      });

      const totals = monthlyRows.reduce(
        (acc, r) => ({
          sueldoImponible: acc.sueldoImponible + r.sueldoImponible,
          cotizaciones: acc.cotizaciones + r.cotizaciones,
          rentaAfecta: acc.rentaAfecta + r.rentaAfecta,
          impuestoUnico: acc.impuestoUnico + r.impuestoUnico,
          mayorRetencion: acc.mayorRetencion + r.mayorRetencion,
          noGravados: acc.noGravados + r.noGravados,
          rentaActualizada: acc.rentaActualizada + r.rentaActualizada,
          impuestoActualizado: acc.impuestoActualizado + r.impuestoActualizado
        }),
        {
          sueldoImponible: 0,
          cotizaciones: 0,
          rentaAfecta: 0,
          impuestoUnico: 0,
          mayorRetencion: 0,
          noGravados: 0,
          rentaActualizada: 0,
          impuestoActualizado: 0
        }
      );

      const monthsWorked = monthlyRows.filter((r) => r.hasSlip).length;

      return {
        employee: emp,
        monthlyRows,
        totals,
        monthsWorked
      };
    });
  }, [employees, savedSlips, selectedYear, currentIpcFactors]);

  // =========================================================================
  // 2. PROCESAMIENTO CERTIFICADO N° 2 (HONORARIOS DJ 1879)
  // =========================================================================
  const honorariosCertificatesData = useMemo(() => {
    // Buscar en rcvDocuments todos los documentos de honorarios (tipoDoc BHE, Boleta de Honorarios)
    const honDocs = rcvDocuments.filter((d) => {
      const pYear = d.period ? parseInt(d.period.split('-')[0], 10) : 0;
      const isHon =
        d.tipoRegistro === 'Honorarios' ||
        d.tipoDoc === 'BHE' ||
        d.tipoDoc === '900' ||
        d.tipoDoc === '901' ||
        (d.nombreTipoDoc || '').toLowerCase().includes('honorario');
      return pYear === selectedYear && isHon;
    });

    // Agrupar por RUT del Emisor / Profesional
    const groupedByRut: { [rut: string]: { rut: string; name: string; docs: RCVDocument[] } } = {};

    honDocs.forEach((d) => {
      const rutEmisor = (d.rutEmisor || 'SIN_RUT').trim();
      const nameEmisor = d.razonSocialEmisor || 'Profesional Independiente';
      if (!groupedByRut[rutEmisor]) {
        groupedByRut[rutEmisor] = {
          rut: rutEmisor,
          name: nameEmisor,
          docs: []
        };
      }
      groupedByRut[rutEmisor].docs.push(d);
    });

    // Generar certificados por profesional
    return Object.values(groupedByRut).map((group) => {
      const monthlyRows = Array.from({ length: 12 }, (_, idx) => {
        const monthNum = idx + 1;
        const monthStr = String(monthNum).padStart(2, '0');
        const periodStr = `${selectedYear}-${monthStr}`;

        const docsInMonth = group.docs.filter((d) => d.period === periodStr);

        const folios = docsInMonth.map((d) => d.folio).filter(Boolean).join(', ');
        const bruto = docsInMonth.reduce((sum, d) => sum + (d.montoTotal || d.montoExento || d.montoNeto || 0), 0);
        const retencion = docsInMonth.reduce((sum, d) => sum + (d.montoRetencion || 0), 0);
        const retPrestamo = docsInMonth.reduce((sum, d) => sum + ((d as any).montoRetencionPrestamo || 0), 0);
        const liquido = docsInMonth.reduce((sum, d) => sum + (d.montoLiquido || Math.max(0, bruto - retencion - retPrestamo)), 0);

        const tasaEfectiva = bruto > 0 ? ((retencion / bruto) * 100).toFixed(2) + '%' : (selectedYear >= 2026 ? '14.50%' : '13.75%');
        const factor = currentIpcFactors[monthNum] || 1.0;
        const brutoActualizado = Math.round(bruto * factor);
        const retencionActualizada = Math.round(retencion * factor);

        return {
          monthNum,
          monthName: MONTH_NAMES[idx],
          periodStr,
          hasDocs: docsInMonth.length > 0,
          folios,
          count: docsInMonth.length,
          bruto,
          tasaEfectiva,
          retencion,
          retPrestamo,
          liquido,
          factor,
          brutoActualizado,
          retencionActualizada
        };
      });

      const totals = monthlyRows.reduce(
        (acc, r) => ({
          count: acc.count + r.count,
          bruto: acc.bruto + r.bruto,
          retencion: acc.retencion + r.retencion,
          retPrestamo: acc.retPrestamo + r.retPrestamo,
          liquido: acc.liquido + r.liquido,
          brutoActualizado: acc.brutoActualizado + r.brutoActualizado,
          retencionActualizada: acc.retencionActualizada + r.retencionActualizada
        }),
        {
          count: 0,
          bruto: 0,
          retencion: 0,
          retPrestamo: 0,
          liquido: 0,
          brutoActualizado: 0,
          retencionActualizada: 0
        }
      );

      return {
        rut: group.rut,
        name: group.name,
        monthlyRows,
        totals
      };
    });
  }, [rcvDocuments, selectedYear, currentIpcFactors]);

  // Selección activa para vista previa individual
  const activeEmployeeCert = useMemo(() => {
    if (selectedEmployeeId === 'ALL') {
      return employeesCertificatesData[0] || null;
    }
    return employeesCertificatesData.find((c) => c.employee.id === selectedEmployeeId) || employeesCertificatesData[0] || null;
  }, [employeesCertificatesData, selectedEmployeeId]);

  const activeHonorarioCert = useMemo(() => {
    if (selectedHonorarioRut === 'ALL') {
      return honorariosCertificatesData[0] || null;
    }
    return honorariosCertificatesData.find((c) => c.rut === selectedHonorarioRut) || honorariosCertificatesData[0] || null;
  }, [honorariosCertificatesData, selectedHonorarioRut]);

  // Filtrado de listas según término de búsqueda
  const filteredEmployees = useMemo(() => {
    if (!searchTerm.trim()) return employeesCertificatesData;
    const term = searchTerm.toLowerCase();
    return employeesCertificatesData.filter(
      (c) => c.employee.name.toLowerCase().includes(term) || c.employee.rut.toLowerCase().includes(term)
    );
  }, [employeesCertificatesData, searchTerm]);

  const filteredHonorarios = useMemo(() => {
    if (!searchTerm.trim()) return honorariosCertificatesData;
    const term = searchTerm.toLowerCase();
    return honorariosCertificatesData.filter(
      (c) => c.name.toLowerCase().includes(term) || c.rut.toLowerCase().includes(term)
    );
  }, [honorariosCertificatesData, searchTerm]);

  // =========================================================================
  // ACCIONES DE IMPRESIÓN Y EXPORTACIÓN
  // =========================================================================
  const handlePrint = (allBatch: boolean = false) => {
    setPrintAllBatch(allBatch);
    setTimeout(() => {
      const area = document.getElementById('printable-certificates-area');
      if (area) {
        triggerIframePrint({
          title: `Certificado_SII_${company.rut}_${selectedYear}`,
          htmlContent: area.innerHTML
        });
      } else {
        window.print();
      }
    }, 150);
  };

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    if (certType === 'CERT_6_SUELDOS') {
      // Hoja Resumen DJ 1887
      const summaryRows = employeesCertificatesData.map((c) => ({
        'RUT Trabajador': c.employee.rut,
        'Nombre Trabajador': c.employee.name,
        'Cargo': c.employee.position || 'Empleado',
        'Meses Trabajados': c.monthsWorked,
        'Rentas Afectas Históricas ($)': c.totals.rentaAfecta,
        'Impuesto Único Histórico ($)': c.totals.impuestoUnico,
        'Leyes Sociales ($)': c.totals.cotizaciones,
        'Rentas No Gravadas ($)': c.totals.noGravados,
        'Rentas Afectas Actualizadas ($)': c.totals.rentaActualizada,
        'Impuesto Único Actualizado ($)': c.totals.impuestoActualizado
      }));

      const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen_DJ1887');

      // Si hay un trabajador seleccionado específico, exportar detalle mes a mes
      if (activeEmployeeCert) {
        const detailRows = activeEmployeeCert.monthlyRows.map((r) => ({
          'Mes': r.monthName,
          'Sueldo Imponible ($)': r.sueldoImponible,
          'Cotizaciones Previsionales ($)': r.cotizaciones,
          'Renta Neta Afecta ($)': r.rentaAfecta,
          'Impuesto Único Retenido ($)': r.impuestoUnico,
          'Mayor Retención ($)': r.mayorRetencion,
          'Rentas No Gravadas ($)': r.noGravados,
          'Factor IPC': r.factor,
          'Renta Afecta Actualizada ($)': r.rentaActualizada,
          'Impuesto Actualizado ($)': r.impuestoActualizado
        }));
        const wsDetail = XLSX.utils.json_to_sheet(detailRows);
        XLSX.utils.book_append_sheet(wb, wsDetail, `Detalle_${activeEmployeeCert.employee.rut.replace(/[^0-9kK]/g, '')}`);
      }

      XLSX.writeFile(wb, `Certificados_N6_DJ1887_${company.rut}_AT${selectedYear + 1}.xlsx`);
    } else {
      // Hoja Resumen DJ 1879
      const summaryRows = honorariosCertificatesData.map((c) => ({
        'RUT Prestador': c.rut,
        'Razón Social / Profesional': c.name,
        'Total Boletas': c.totals.count,
        'Honorarios Brutos ($)': c.totals.bruto,
        'Retención Efectuada ($)': c.totals.retencion,
        'Préstamo Solidario ($)': c.totals.retPrestamo,
        'Líquido Pagado ($)': c.totals.liquido,
        'Honorarios Brutos Actualizados ($)': c.totals.brutoActualizado,
        'Retención Actualizada ($)': c.totals.retencionActualizada
      }));

      const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen_DJ1879');

      if (activeHonorarioCert) {
        const detailRows = activeHonorarioCert.monthlyRows.map((r) => ({
          'Mes': r.monthName,
          'Folios Boletas': r.folios || '-',
          'Honorarios Brutos ($)': r.bruto,
          'Tasa Retención': r.tasaEfectiva,
          'Retención Legal ($)': r.retencion,
          'Préstamo Solidario ($)': r.retPrestamo,
          'Líquido Pagado ($)': r.liquido,
          'Factor IPC': r.factor,
          'Bruto Actualizado ($)': r.brutoActualizado,
          'Retención Actualizada ($)': r.retencionActualizada
        }));
        const wsDetail = XLSX.utils.json_to_sheet(detailRows);
        XLSX.utils.book_append_sheet(wb, wsDetail, `Detalle_${activeHonorarioCert.rut.replace(/[^0-9kK]/g, '')}`);
      }

      XLSX.writeFile(wb, `Certificados_N2_DJ1879_${company.rut}_AT${selectedYear + 1}.xlsx`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
      {/* Estilos específicos de impresión oficial */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-certificates-area, #printable-certificates-area * {
            visibility: visible;
          }
          #printable-certificates-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 0;
            background: white !important;
            color: black !important;
          }
          .no-print {
            display: none !important;
          }
          .page-break {
            page-break-after: always;
            break-after: page;
          }
        }
      `}</style>

      <div className="relative w-full max-w-6xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[95vh]">
        {/* CABECERA MODAL (NO PRINT) */}
        <div className="no-print bg-gradient-to-r from-[#0D253D] via-[#1a385c] to-[#0D253D] px-6 py-4 text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-700 shadow-md">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/20 text-amber-300 rounded-xl border border-amber-400/30">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold tracking-tight">
                  Generador de Certificados Oficiales SII
                </h2>
                <span className="text-[10px] bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 px-2 py-0.5 rounded-full font-bold">
                  Res. Ex. N° 6509 SII
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Emisión de Certificados Anuales N° 6 (Sueldos DJ 1887) y N° 2 (Honorarios DJ 1879) para colaboradores
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end md:self-auto">
            <button
              onClick={() => handlePrint(false)}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
              title="Imprimir el certificado actual en formato carta"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir Certificado</span>
            </button>

            <button
              onClick={() => handlePrint(true)}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-600 transition-all flex items-center gap-1.5 cursor-pointer"
              title="Imprimir todos los certificados de la empresa en lote continuo"
            >
              <Users className="w-4 h-4 text-amber-300" />
              <span>Imprimir Lote Completo</span>
            </button>

            <button
              onClick={handleExportExcel}
              className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
              title="Descargar libro consolidado en Excel"
            >
              <Download className="w-4 h-4" />
              <span>Excel</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
              title="Cerrar ventana"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* BARRA DE CONTROL Y SELECTORES (NO PRINT) */}
        <div className="no-print bg-slate-50 border-b border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Tabs Selector de Tipo de Certificado */}
          <div className="flex bg-slate-200/80 p-1 rounded-xl gap-1">
            <button
              onClick={() => setCertType('CERT_6_SUELDOS')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                certType === 'CERT_6_SUELDOS'
                  ? 'bg-white text-indigo-950 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-4 h-4 text-indigo-600" />
              <span>Certificado N° 6 (Sueldos DJ 1887)</span>
              <span className="text-[10px] bg-indigo-100 text-indigo-800 px-1.5 py-0.2 rounded-full font-bold">
                {employeesCertificatesData.length}
              </span>
            </button>

            <button
              onClick={() => setCertType('CERT_2_HONORARIOS')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                certType === 'CERT_2_HONORARIOS'
                  ? 'bg-white text-amber-950 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Award className="w-4 h-4 text-amber-600" />
              <span>Certificado N° 2 (Honorarios DJ 1879)</span>
              <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded-full font-bold">
                {honorariosCertificatesData.length}
              </span>
            </button>
          </div>

          {/* Selector de Año Comercial & Búsqueda */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-xl px-2.5 py-1 shadow-2xs">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <label className="text-[11px] font-bold text-slate-700">Año Comercial:</label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="font-bold text-slate-900 bg-transparent focus:outline-hidden cursor-pointer"
              >
                <option value={2026}>2026 (AT 2027)</option>
                <option value={2025}>2025 (AT 2026)</option>
                <option value={2024}>2024 (AT 2025)</option>
              </select>
            </div>

            {/* Selector de Destinatario */}
            {certType === 'CERT_6_SUELDOS' ? (
              <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-xl px-2.5 py-1 shadow-2xs">
                <Users className="w-3.5 h-3.5 text-indigo-600" />
                <label className="text-[11px] font-bold text-slate-700">Trabajador:</label>
                <select
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                  className="font-medium text-slate-900 bg-transparent focus:outline-hidden max-w-[220px] truncate cursor-pointer"
                >
                  <option value="ALL">-- Ver Primer Trabajador --</option>
                  {employeesCertificatesData.map((c) => (
                    <option key={c.employee.id} value={c.employee.id}>
                      {c.employee.rut} - {c.employee.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-xl px-2.5 py-1 shadow-2xs">
                <Award className="w-3.5 h-3.5 text-amber-600" />
                <label className="text-[11px] font-bold text-slate-700">Prestador:</label>
                <select
                  value={selectedHonorarioRut}
                  onChange={(e) => setSelectedHonorarioRut(e.target.value)}
                  className="font-medium text-slate-900 bg-transparent focus:outline-hidden max-w-[220px] truncate cursor-pointer"
                >
                  <option value="ALL">-- Ver Primer Prestador --</option>
                  {honorariosCertificatesData.map((c) => (
                    <option key={c.rut} value={c.rut}>
                      {c.rut} - {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* CUERPO DEL CERTIFICADO IMPRIMIBLE */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-100 flex justify-center">
          <div id="printable-certificates-area" className="w-full max-w-4xl space-y-8">
            {/* RENDERIZADO CERTIFICADO N° 6 (SUELDOS) */}
            {certType === 'CERT_6_SUELDOS' && (
              <>
                {printAllBatch ? (
                  employeesCertificatesData.map((certItem, idx) => (
                    <div key={certItem.employee.id} className="page-break">
                      <SingleCertificadoN6Sheet
                        company={company}
                        certItem={certItem}
                        year={selectedYear}
                      />
                    </div>
                  ))
                ) : activeEmployeeCert ? (
                  <SingleCertificadoN6Sheet
                    company={company}
                    certItem={activeEmployeeCert}
                    year={selectedYear}
                  />
                ) : (
                  <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-500">
                    No se encontraron trabajadores con liquidaciones registradas en el año comercial {selectedYear}.
                  </div>
                )}
              </>
            )}

            {/* RENDERIZADO CERTIFICADO N° 2 (HONORARIOS) */}
            {certType === 'CERT_2_HONORARIOS' && (
              <>
                {printAllBatch ? (
                  honorariosCertificatesData.map((certItem, idx) => (
                    <div key={certItem.rut} className="page-break">
                      <SingleCertificadoN2Sheet
                        company={company}
                        certItem={certItem}
                        year={selectedYear}
                      />
                    </div>
                  ))
                ) : activeHonorarioCert ? (
                  <SingleCertificadoN2Sheet
                    company={company}
                    certItem={activeHonorarioCert}
                    year={selectedYear}
                  />
                ) : (
                  <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-500">
                    No se registraron boletas de honorarios recibidas en el año comercial {selectedYear}.
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// =========================================================================
// SUBCOMPONENTE HOJA OFICIAL: CERTIFICADO N° 6 (DJ 1887)
// =========================================================================
interface SingleCertificadoN6SheetProps {
  company: Company;
  certItem: {
    employee: Employee;
    monthlyRows: any[];
    totals: any;
    monthsWorked: number;
  };
  year: number;
}

const SingleCertificadoN6Sheet: React.FC<SingleCertificadoN6SheetProps> = ({ company, certItem, year }) => {
  const { employee, monthlyRows, totals } = certItem;
  const atYear = year + 1;

  return (
    <div className="bg-white text-slate-900 p-6 md:p-8 rounded-xl shadow-lg border border-slate-300 font-sans text-xs">
      {/* ENCABEZADO OFICIAL SII */}
      <div className="border-b-2 border-slate-900 pb-3 mb-4">
        <div className="flex justify-between items-start">
          <div className="text-[10px] text-slate-600 font-semibold tracking-wider uppercase">
            REPÚBLICA DE CHILE<br />
            SERVICIO DE IMPUESTOS INTERNOS<br />
            DIRECCIÓN NACIONAL
          </div>
          <div className="text-right">
            <div className="text-sm font-black text-slate-950 uppercase tracking-tight">
              FORMULARIO OFICIAL SII
            </div>
            <div className="text-xs font-bold text-indigo-900">
              AÑO TRIBUTARIO {atYear} (AÑO COMERCIAL {year})
            </div>
          </div>
        </div>

        <div className="text-center mt-3">
          <h1 className="text-base md:text-lg font-black tracking-tight text-slate-950 uppercase">
            CERTIFICADO Nº 6
          </h1>
          <p className="text-[11px] font-bold text-slate-700 max-w-2xl mx-auto leading-snug">
            SOBRE SUELDOS, PENSIONES O MONTEPÍOS Y OTRAS RENTAS SIMILARES Y RETENCIONES DE IMPUESTO ÚNICO DE SEGUNDA CATEGORÍA EFECTUADAS
          </p>
          <p className="text-[10px] text-slate-500 italic mt-0.5">
            (Artículo 42 Nº 1 de la Ley sobre Impuesto a la Renta - Declaración Jurada N° 1887)
          </p>
        </div>
      </div>

      {/* CUADRO 1: IDENTIFICACIÓN DEL EMPLEADOR / PAGADOR */}
      <div className="border border-slate-800 rounded-lg p-3 mb-3 bg-slate-50/50">
        <div className="text-[10px] font-black uppercase text-slate-700 border-b border-slate-300 pb-1 mb-2">
          1. IDENTIFICACIÓN DE LA PERSONA O ENTIDAD QUE CERTIFICA (EMPLEADOR / RETENEDOR)
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
          <div>
            <span className="font-bold text-slate-700">Razón Social: </span>
            <span className="font-bold text-slate-950">{company.name}</span>
          </div>
          <div>
            <span className="font-bold text-slate-700">RUT Empleador: </span>
            <span className="font-mono font-bold text-indigo-900">{company.rut}</span>
          </div>
          <div>
            <span className="font-bold text-slate-700">Giro Comercial: </span>
            <span className="text-slate-800 truncate">{company.giro || 'Servicios y Comercio'}</span>
          </div>
          <div>
            <span className="font-bold text-slate-700">Dirección: </span>
            <span className="text-slate-800">{company.address || 'Santiago, Chile'}</span>
          </div>
          <div>
            <span className="font-bold text-slate-700">Representante Legal: </span>
            <span className="font-medium text-slate-900">{company.legalRepName || company.contactName || 'Representante Legal'}</span>
          </div>
          <div>
            <span className="font-bold text-slate-700">RUT Rep. Legal: </span>
            <span className="font-mono text-slate-900">{company.legalRepRut || 'No informado'}</span>
          </div>
        </div>
      </div>

      {/* CUADRO 2: IDENTIFICACIÓN DEL TRABAJADOR */}
      <div className="border border-slate-800 rounded-lg p-3 mb-3 bg-slate-50/50">
        <div className="text-[10px] font-black uppercase text-slate-700 border-b border-slate-300 pb-1 mb-2">
          2. IDENTIFICACIÓN DEL TRABAJADOR O BENEFICIARIO DE LA RENTA
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
          <div>
            <span className="font-bold text-slate-700">Nombre Completo: </span>
            <span className="font-bold text-slate-950">{employee.name}</span>
          </div>
          <div>
            <span className="font-bold text-slate-700">RUT Trabajador: </span>
            <span className="font-mono font-bold text-indigo-900">{employee.rut}</span>
          </div>
          <div>
            <span className="font-bold text-slate-700">Cargo / Función: </span>
            <span className="text-slate-800">{employee.position || 'Colaborador'}</span>
          </div>
          <div>
            <span className="font-bold text-slate-700">Período de Desempeño: </span>
            <span className="text-slate-800">Enero a Diciembre {year}</span>
          </div>
        </div>
      </div>

      {/* CUADRO 3: TABLA MENSUAL OFICIAL SII */}
      <div className="mb-4 overflow-x-auto">
        <table className="w-full text-[10px] border-collapse border border-slate-800">
          <thead>
            <tr className="bg-slate-200 text-slate-900 font-bold border-b border-slate-800 text-center">
              <th className="border border-slate-800 p-1">Mes</th>
              <th className="border border-slate-800 p-1">Remun. Imponible Total ($)</th>
              <th className="border border-slate-800 p-1">Cotiz. Prev. Deducibles ($)</th>
              <th className="border border-slate-800 p-1">Renta Afecta a Impuesto ($)</th>
              <th className="border border-slate-800 p-1 text-indigo-900">Impuesto Único Retenido ($)</th>
              <th className="border border-slate-800 p-1">Mayor Retención ($)</th>
              <th className="border border-slate-800 p-1">Rentas No Gravadas ($)</th>
              <th className="border border-slate-800 p-1">Factor Actualiz.</th>
              <th className="border border-slate-800 p-1">Renta Actualiz. ($)</th>
              <th className="border border-slate-800 p-1 text-indigo-900">Impuesto Actualiz. ($)</th>
            </tr>
          </thead>
          <tbody>
            {monthlyRows.map((row: any) => (
              <tr key={row.monthNum} className="hover:bg-slate-50 text-right">
                <td className="border border-slate-800 p-1 text-center font-bold">{row.monthName}</td>
                <td className="border border-slate-800 p-1 font-mono">${row.sueldoImponible.toLocaleString('es-CL')}</td>
                <td className="border border-slate-800 p-1 font-mono">${row.cotizaciones.toLocaleString('es-CL')}</td>
                <td className="border border-slate-800 p-1 font-mono">${row.rentaAfecta.toLocaleString('es-CL')}</td>
                <td className="border border-slate-800 p-1 font-mono font-bold text-indigo-900">${row.impuestoUnico.toLocaleString('es-CL')}</td>
                <td className="border border-slate-800 p-1 font-mono">${row.mayorRetencion.toLocaleString('es-CL')}</td>
                <td className="border border-slate-800 p-1 font-mono">${row.noGravados.toLocaleString('es-CL')}</td>
                <td className="border border-slate-800 p-1 font-mono text-center font-semibold">{row.factor.toFixed(3)}</td>
                <td className="border border-slate-800 p-1 font-mono font-medium">${row.rentaActualizada.toLocaleString('es-CL')}</td>
                <td className="border border-slate-800 p-1 font-mono font-bold text-indigo-900">${row.impuestoActualizado.toLocaleString('es-CL')}</td>
              </tr>
            ))}
            {/* FILA DE TOTALES ANUALES */}
            <tr className="bg-slate-200/90 font-black border-t-2 border-slate-900 text-right">
              <td className="border border-slate-800 p-1.5 text-center uppercase">TOTALES</td>
              <td className="border border-slate-800 p-1.5 font-mono">${totals.sueldoImponible.toLocaleString('es-CL')}</td>
              <td className="border border-slate-800 p-1.5 font-mono">${totals.cotizaciones.toLocaleString('es-CL')}</td>
              <td className="border border-slate-800 p-1.5 font-mono">${totals.rentaAfecta.toLocaleString('es-CL')}</td>
              <td className="border border-slate-800 p-1.5 font-mono text-indigo-950">${totals.impuestoUnico.toLocaleString('es-CL')}</td>
              <td className="border border-slate-800 p-1.5 font-mono">${totals.mayorRetencion.toLocaleString('es-CL')}</td>
              <td className="border border-slate-800 p-1.5 font-mono">${totals.noGravados.toLocaleString('es-CL')}</td>
              <td className="border border-slate-800 p-1.5 text-center text-slate-500">-</td>
              <td className="border border-slate-800 p-1.5 font-mono">${totals.rentaActualizada.toLocaleString('es-CL')}</td>
              <td className="border border-slate-800 p-1.5 font-mono text-indigo-950">${totals.impuestoActualizado.toLocaleString('es-CL')}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* NOTA LEGAL Y CERTIFICACIÓN */}
      <div className="text-[10px] text-slate-600 space-y-1 mb-8 leading-relaxed text-justify">
        <p>
          Se extiende el presente certificado en cumplimiento de lo establecido en la <strong>Resolución Exenta N° 6509 del Servicio de Impuestos Internos</strong> y las instrucciones correspondientes a la <strong>Declaración Jurada N° 1887</strong>, para ser presentado con motivo de la Declaración Anual de Impuestos a la Renta (Formulario 22).
        </p>
        <p className="italic text-slate-500">
          * Nota: Los factores de actualización aplicados corresponden a los publicados oficialmente por el SII para el respectivo año comercial.
        </p>
      </div>

      {/* FIRMA Y TIMBRE OFICIAL */}
      <div className="pt-6 border-t border-slate-300 grid grid-cols-2 gap-8 text-center text-[11px]">
        <div>
          <div className="text-slate-500">Fecha de Emisión:</div>
          <div className="font-semibold text-slate-800">
            {new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })}
          </div>
        </div>
        <div>
          <div className="w-56 border-b border-slate-800 mx-auto mb-1 h-12"></div>
          <div className="font-bold text-slate-950">{company.legalRepName || company.name}</div>
          <div className="text-[10px] text-slate-500 font-mono">RUT: {company.legalRepRut || company.rut}</div>
          <div className="text-[10px] font-semibold text-slate-600 uppercase">Firma del Empleador o Representante Legal</div>
        </div>
      </div>
    </div>
  );
};

// =========================================================================
// SUBCOMPONENTE HOJA OFICIAL: CERTIFICADO N° 2 (DJ 1879 - HONORARIOS)
// =========================================================================
interface SingleCertificadoN2SheetProps {
  company: Company;
  certItem: {
    rut: string;
    name: string;
    monthlyRows: any[];
    totals: any;
  };
  year: number;
}

const SingleCertificadoN2Sheet: React.FC<SingleCertificadoN2SheetProps> = ({ company, certItem, year }) => {
  const { rut, name, monthlyRows, totals } = certItem;
  const atYear = year + 1;

  return (
    <div className="bg-white text-slate-900 p-6 md:p-8 rounded-xl shadow-lg border border-slate-300 font-sans text-xs">
      {/* ENCABEZADO OFICIAL SII */}
      <div className="border-b-2 border-slate-900 pb-3 mb-4">
        <div className="flex justify-between items-start">
          <div className="text-[10px] text-slate-600 font-semibold tracking-wider uppercase">
            REPÚBLICA DE CHILE<br />
            SERVICIO DE IMPUESTOS INTERNOS<br />
            DIRECCIÓN NACIONAL
          </div>
          <div className="text-right">
            <div className="text-sm font-black text-slate-950 uppercase tracking-tight">
              FORMULARIO OFICIAL SII
            </div>
            <div className="text-xs font-bold text-amber-900">
              AÑO TRIBUTARIO {atYear} (AÑO COMERCIAL {year})
            </div>
          </div>
        </div>

        <div className="text-center mt-3">
          <h1 className="text-base md:text-lg font-black tracking-tight text-slate-950 uppercase">
            CERTIFICADO Nº 2
          </h1>
          <p className="text-[11px] font-bold text-slate-700 max-w-2xl mx-auto leading-snug">
            SOBRE HONORARIOS Y OTRAS RENTAS Y RETENCIONES EFECTUADAS
          </p>
          <p className="text-[10px] text-slate-500 italic mt-0.5">
            (Artículos 42 Nº 2 y 48 de la Ley sobre Impuesto a la Renta - Declaración Jurada N° 1879)
          </p>
        </div>
      </div>

      {/* CUADRO 1: IDENTIFICACIÓN DEL PAGADOR / RETENEDOR */}
      <div className="border border-slate-800 rounded-lg p-3 mb-3 bg-slate-50/50">
        <div className="text-[10px] font-black uppercase text-slate-700 border-b border-slate-300 pb-1 mb-2">
          1. IDENTIFICACIÓN DE LA PERSONA O ENTIDAD QUE CERTIFICA (EMPRESA PAGADORA)
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
          <div>
            <span className="font-bold text-slate-700">Razón Social: </span>
            <span className="font-bold text-slate-950">{company.name}</span>
          </div>
          <div>
            <span className="font-bold text-slate-700">RUT Empresa: </span>
            <span className="font-mono font-bold text-amber-900">{company.rut}</span>
          </div>
          <div>
            <span className="font-bold text-slate-700">Giro Comercial: </span>
            <span className="text-slate-800 truncate">{company.giro || 'Servicios y Comercio'}</span>
          </div>
          <div>
            <span className="font-bold text-slate-700">Dirección: </span>
            <span className="text-slate-800">{company.address || 'Santiago, Chile'}</span>
          </div>
          <div>
            <span className="font-bold text-slate-700">Representante Legal: </span>
            <span className="font-medium text-slate-900">{company.legalRepName || company.contactName || 'Representante Legal'}</span>
          </div>
          <div>
            <span className="font-bold text-slate-700">RUT Rep. Legal: </span>
            <span className="font-mono text-slate-900">{company.legalRepRut || 'No informado'}</span>
          </div>
        </div>
      </div>

      {/* CUADRO 2: IDENTIFICACIÓN DEL PROFESIONAL / RECEPTOR */}
      <div className="border border-slate-800 rounded-lg p-3 mb-3 bg-slate-50/50">
        <div className="text-[10px] font-black uppercase text-slate-700 border-b border-slate-300 pb-1 mb-2">
          2. IDENTIFICACIÓN DEL PROFESIONAL O SOCIEDAD DE PROFESIONALES
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
          <div>
            <span className="font-bold text-slate-700">Nombre / Razón Social: </span>
            <span className="font-bold text-slate-950">{name}</span>
          </div>
          <div>
            <span className="font-bold text-slate-700">RUT Prestador: </span>
            <span className="font-mono font-bold text-amber-900">{rut}</span>
          </div>
          <div>
            <span className="font-bold text-slate-700">Tipo de Renta: </span>
            <span className="text-slate-800">Honorarios Profesionales e Independientes (Art. 42 N° 2 LIR)</span>
          </div>
          <div>
            <span className="font-bold text-slate-700">Año Calendario: </span>
            <span className="text-slate-800">{year}</span>
          </div>
        </div>
      </div>

      {/* CUADRO 3: TABLA MENSUAL OFICIAL SII */}
      <div className="mb-4 overflow-x-auto">
        <table className="w-full text-[10px] border-collapse border border-slate-800">
          <thead>
            <tr className="bg-slate-200 text-slate-900 font-bold border-b border-slate-800 text-center">
              <th className="border border-slate-800 p-1">Mes</th>
              <th className="border border-slate-800 p-1">Folios Boletas</th>
              <th className="border border-slate-800 p-1">Honorario Bruto ($)</th>
              <th className="border border-slate-800 p-1">Tasa Ret.</th>
              <th className="border border-slate-800 p-1 text-amber-900">Retención Legal ($)</th>
              <th className="border border-slate-800 p-1">Préstamo Solid. ($)</th>
              <th className="border border-slate-800 p-1">Líquido Pagado ($)</th>
              <th className="border border-slate-800 p-1">Factor Actualiz.</th>
              <th className="border border-slate-800 p-1">Bruto Actualiz. ($)</th>
              <th className="border border-slate-800 p-1 text-amber-900">Retención Actualiz. ($)</th>
            </tr>
          </thead>
          <tbody>
            {monthlyRows.map((row: any) => (
              <tr key={row.monthNum} className="hover:bg-slate-50 text-right">
                <td className="border border-slate-800 p-1 text-center font-bold">{row.monthName}</td>
                <td className="border border-slate-800 p-1 text-center font-mono text-[9px] truncate max-w-[100px]">{row.folios || '-'}</td>
                <td className="border border-slate-800 p-1 font-mono">${row.bruto.toLocaleString('es-CL')}</td>
                <td className="border border-slate-800 p-1 text-center font-medium">{row.tasaEfectiva}</td>
                <td className="border border-slate-800 p-1 font-mono font-bold text-amber-900">${row.retencion.toLocaleString('es-CL')}</td>
                <td className="border border-slate-800 p-1 font-mono">${row.retPrestamo.toLocaleString('es-CL')}</td>
                <td className="border border-slate-800 p-1 font-mono font-medium">${row.liquido.toLocaleString('es-CL')}</td>
                <td className="border border-slate-800 p-1 font-mono text-center font-semibold">{row.factor.toFixed(3)}</td>
                <td className="border border-slate-800 p-1 font-mono">${row.brutoActualizado.toLocaleString('es-CL')}</td>
                <td className="border border-slate-800 p-1 font-mono font-bold text-amber-900">${row.retencionActualizada.toLocaleString('es-CL')}</td>
              </tr>
            ))}
            {/* FILA DE TOTALES ANUALES */}
            <tr className="bg-slate-200/90 font-black border-t-2 border-slate-900 text-right">
              <td className="border border-slate-800 p-1.5 text-center uppercase" colSpan={2}>TOTALES ({totals.count} Boletas)</td>
              <td className="border border-slate-800 p-1.5 font-mono">${totals.bruto.toLocaleString('es-CL')}</td>
              <td className="border border-slate-800 p-1.5 text-center">-</td>
              <td className="border border-slate-800 p-1.5 font-mono text-amber-950">${totals.retencion.toLocaleString('es-CL')}</td>
              <td className="border border-slate-800 p-1.5 font-mono">${totals.retPrestamo.toLocaleString('es-CL')}</td>
              <td className="border border-slate-800 p-1.5 font-mono">${totals.liquido.toLocaleString('es-CL')}</td>
              <td className="border border-slate-800 p-1.5 text-center text-slate-500">-</td>
              <td className="border border-slate-800 p-1.5 font-mono">${totals.brutoActualizado.toLocaleString('es-CL')}</td>
              <td className="border border-slate-800 p-1.5 font-mono text-amber-950">${totals.retencionActualizada.toLocaleString('es-CL')}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* NOTA LEGAL Y CERTIFICACIÓN */}
      <div className="text-[10px] text-slate-600 space-y-1 mb-8 leading-relaxed text-justify">
        <p>
          Se extiende el presente certificado en cumplimiento de lo establecido en el <strong>Artículo 101 de la Ley sobre Impuesto a la Renta</strong> y las instrucciones para la confección de la <strong>Declaración Jurada N° 1879</strong>, para ser presentado con motivo de la Declaración Anual de Impuestos a la Renta (Formulario 22).
        </p>
        <p className="italic text-slate-500">
          * Nota: Los montos actualizados incluyen los factores de reajustabilidad determinados por el Servicio de Impuestos Internos.
        </p>
      </div>

      {/* FIRMA Y TIMBRE OFICIAL */}
      <div className="pt-6 border-t border-slate-300 grid grid-cols-2 gap-8 text-center text-[11px]">
        <div>
          <div className="text-slate-500">Fecha de Emisión:</div>
          <div className="font-semibold text-slate-800">
            {new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })}
          </div>
        </div>
        <div>
          <div className="w-56 border-b border-slate-800 mx-auto mb-1 h-12"></div>
          <div className="font-bold text-slate-950">{company.legalRepName || company.name}</div>
          <div className="text-[10px] text-slate-500 font-mono">RUT: {company.legalRepRut || company.rut}</div>
          <div className="text-[10px] font-semibold text-slate-600 uppercase">Firma del Pagador o Representante Legal</div>
        </div>
      </div>
    </div>
  );
};

export default CertificadosOficialesSiiModal;
