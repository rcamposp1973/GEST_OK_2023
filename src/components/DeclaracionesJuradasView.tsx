import React, { useState, useMemo } from 'react';
import { 
  FileText, Download, CheckCircle2, AlertTriangle, 
  Building2, Users, FileSpreadsheet, ShieldCheck, Sparkles, HelpCircle,
  Printer, Award, ArrowUpRight
} from 'lucide-react';
import { Company, Employee, PayrollSlip, ChartOfAccount, RCVDocument, Voucher } from '../types';
import * as XLSX from 'xlsx';
import CertificadosOficialesSiiModal from './CertificadosOficialesSiiModal';

interface DeclaracionesJuradasViewProps {
  company: Company;
  employees: Employee[];
  savedSlips?: PayrollSlip[];
  rcvDocuments?: RCVDocument[];
  accounts: ChartOfAccount[];
  vouchers?: Voucher[];
}

export const DeclaracionesJuradasView: React.FC<DeclaracionesJuradasViewProps> = ({
  company,
  employees = [],
  savedSlips = [],
  rcvDocuments = [],
  accounts = [],
  vouchers = []
}) => {
  const [selectedYear, setSelectedYear] = useState<number>(2025); // Año Comercial (AT = año + 1)
  const [activeDjTab, setActiveDjTab] = useState<'DJ_1887' | 'DJ_1879' | 'DJ_1847'>('DJ_1887');

  // Modal de Certificados Oficiales SII
  const [showCertModal, setShowCertModal] = useState<boolean>(false);
  const [certModalType, setCertModalType] = useState<'CERT_6_SUELDOS' | 'CERT_2_HONORARIOS'>('CERT_6_SUELDOS');

  // =========================================================================
  // 1. PROCESAMIENTO DJ 1887 (Sueldos y Remuneraciones Art. 42 N° 1)
  // =========================================================================
  const dj1887Data = useMemo(() => {
    return employees.map(emp => {
      // Filtrar liquidaciones del año comercial seleccionado
      const empSlips = savedSlips.filter(s => {
        const pYear = s.period ? parseInt(s.period.split('-')[0], 10) : 0;
        return pYear === selectedYear && (s.employeeId === emp.id || s.employeeRut === emp.rut);
      });

      const totalRentasAfectas = empSlips.reduce((sum, s) => sum + (s.rentaAfectaImpuesto || s.totalHaberesImponibles || s.sueldoBaseProporcional || 0), 0);
      const totalImpuestoUnico = empSlips.reduce((sum, s) => sum + (s.impuestoUnicoSegundaCategoria || 0), 0);
      const totalLeyesSociales = empSlips.reduce((sum, s) => sum + (s.totalDescuentosPrevisionales || 0), 0);
      const totalNoGravadas = empSlips.reduce((sum, s) => sum + (s.totalHaberesNoImponibles || (s.asignacionColacion || 0) + (s.asignacionMovilizacion || 0)), 0);

      return {
        rut: emp.rut,
        nombre: emp.name || emp.rut,
        cargo: emp.position || 'Colaborador',
        mesesTrabajados: empSlips.length || 12,
        rentasAfectas: totalRentasAfectas,
        impuestoUnico: totalImpuestoUnico,
        leyesSociales: totalLeyesSociales,
        noGravadas: totalNoGravadas,
        rebajaZonasExtremas: 0
      };
    });
  }, [employees, savedSlips, selectedYear]);

  const totalsDj1887 = useMemo(() => {
    return dj1887Data.reduce((acc, row) => ({
      rentasAfectas: acc.rentasAfectas + row.rentasAfectas,
      impuestoUnico: acc.impuestoUnico + row.impuestoUnico,
      leyesSociales: acc.leyesSociales + row.leyesSociales,
      noGravadas: acc.noGravadas + row.noGravadas
    }), { rentasAfectas: 0, impuestoUnico: 0, leyesSociales: 0, noGravadas: 0 });
  }, [dj1887Data]);

  // Exportar TXT Estándar SII para DJ 1887
  const handleExportDJ1887Txt = () => {
    let txt = `1887;${company.rut};${selectedYear + 1};${dj1887Data.length}\n`;
    dj1887Data.forEach((row, idx) => {
      txt += `${idx + 1};${row.rut};${row.rentasAfectas};${row.impuestoUnico};${row.leyesSociales};${row.noGravadas}\n`;
    });

    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `DJ1887_${company.rut.replace(/[^0-9kK]/g, '')}_AT${selectedYear + 1}.txt`;
    link.click();
  };

  // =========================================================================
  // 2. PROCESAMIENTO DJ 1879 (Retenciones de Honorarios Art. 42 N° 2)
  // =========================================================================
  const dj1879Data = useMemo(() => {
    const honDocs = rcvDocuments.filter(d => {
      const pYear = d.period ? parseInt(d.period.split('-')[0], 10) : 0;
      const isHon = d.tipoRegistro === 'Honorarios' || d.tipoDoc === 'BHE' || d.tipoDoc === '900' || d.tipoDoc === '901' || (d.nombreTipoDoc || '').toLowerCase().includes('honorario');
      return pYear === selectedYear && isHon;
    });

    const grouped: { [rut: string]: { rut: string; name: string; count: number; bruto: number; retencion: number; retPrestamo: number; liquido: number } } = {};

    honDocs.forEach(d => {
      const rut = (d.rutEmisor || 'SIN_RUT').trim();
      const name = d.razonSocialEmisor || 'Profesional Independiente';
      const bruto = d.montoTotal || d.montoExento || d.montoNeto || 0;
      const ret = d.montoRetencion || 0;
      const prestamo = (d as any).montoRetencionPrestamo || 0;
      const liq = d.montoLiquido || Math.max(0, bruto - ret - prestamo);

      if (!grouped[rut]) {
        grouped[rut] = { rut, name, count: 0, bruto: 0, retencion: 0, retPrestamo: 0, liquido: 0 };
      }
      grouped[rut].count += 1;
      grouped[rut].bruto += bruto;
      grouped[rut].retencion += ret;
      grouped[rut].retPrestamo += prestamo;
      grouped[rut].liquido += liq;
    });

    return Object.values(grouped);
  }, [rcvDocuments, selectedYear]);

  const totalsDj1879 = useMemo(() => {
    return dj1879Data.reduce((acc, row) => ({
      count: acc.count + row.count,
      bruto: acc.bruto + row.bruto,
      retencion: acc.retencion + row.retencion,
      retPrestamo: acc.retPrestamo + row.retPrestamo,
      liquido: acc.liquido + row.liquido
    }), { count: 0, bruto: 0, retencion: 0, retPrestamo: 0, liquido: 0 });
  }, [dj1879Data]);

  // Exportar TXT Estándar SII para DJ 1879
  const handleExportDJ1879Txt = () => {
    let txt = `1879;${company.rut};${selectedYear + 1};${dj1879Data.length}\n`;
    dj1879Data.forEach((row, idx) => {
      txt += `${idx + 1};${row.rut};${row.bruto};${row.retencion};${row.retPrestamo};${row.liquido}\n`;
    });

    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `DJ1879_${company.rut.replace(/[^0-9kK]/g, '')}_AT${selectedYear + 1}.txt`;
    link.click();
  };

  // Abrir Certificados
  const handleOpenCertificados = (type: 'CERT_6_SUELDOS' | 'CERT_2_HONORARIOS') => {
    setCertModalType(type);
    setShowCertModal(true);
  };

  return (
    <div className="space-y-6">
      {/* HEADER BANNER OFICIAL */}
      <div className="bg-amber-950 p-6 rounded-2xl text-white shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-amber-400" />
            <h2 className="text-xl font-black tracking-tight">
              Módulo de Declaraciones Juradas Anuales SII (DDJJ Operación Renta)
            </h2>
            <span className="text-[10px] bg-amber-500/30 border border-amber-400/50 text-amber-200 px-2.5 py-0.5 rounded-full font-bold">
              v3.0 Certificada
            </span>
          </div>
          <p className="text-xs text-slate-300 mt-1">
            Confección de declaraciones juradas oficiales (DJ 1887, DJ 1879, DJ 1847) y emisión de certificados legales para trabajadores y profesionales
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-xl border border-white/20">
            <label className="text-xs font-bold text-slate-200">Año Comercial:</label>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
              className="bg-transparent font-extrabold text-white focus:outline-hidden cursor-pointer text-xs"
            >
              <option value={2026} className="text-slate-900">2026 (AT 2027)</option>
              <option value={2025} className="text-slate-900">2025 (AT 2026)</option>
              <option value={2024} className="text-slate-900">2024 (AT 2025)</option>
            </select>
          </div>
        </div>
      </div>

      {/* TABS DE DDJJ */}
      <div className="flex border-b border-slate-200 gap-2">
        <button
          onClick={() => setActiveDjTab('DJ_1887')}
          className={`pb-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
            activeDjTab === 'DJ_1887' ? 'border-indigo-600 text-indigo-950 font-extrabold' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileText className="w-4 h-4 text-indigo-600" />
          <span>DJ 1887 - Sueldos y Remuneraciones</span>
          <span className="text-[10px] bg-indigo-100 text-indigo-800 px-1.5 py-0.2 rounded-full font-bold">
            {dj1887Data.length}
          </span>
        </button>

        <button
          onClick={() => setActiveDjTab('DJ_1879')}
          className={`pb-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
            activeDjTab === 'DJ_1879' ? 'border-amber-600 text-amber-950 font-extrabold' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Award className="w-4 h-4 text-amber-600" />
          <span>DJ 1879 - Retenciones de Honorarios</span>
          <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded-full font-bold">
            {dj1879Data.length}
          </span>
        </button>

        <button
          onClick={() => setActiveDjTab('DJ_1847')}
          className={`pb-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
            activeDjTab === 'DJ_1847' ? 'border-emerald-600 text-emerald-950 font-extrabold' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
          <span>DJ 1847 - Balance 8 Columnas e Inventario</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* CONTENIDO TAB DJ 1887 (SUELDOS Y REMUNERACIONES) */}
      {/* ========================================================================= */}
      {activeDjTab === 'DJ_1887' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-xs">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-slate-900">
                  DJ 1887 - Declaración Jurada sobre Rentas del Art. 42 N° 1
                </h3>
                <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-bold border border-indigo-200">
                  Res. Ex. N° 6509 SII
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Muestreo anual consolidado de remuneraciones e impuesto único de trabajadores dependientes (Año Comercial {selectedYear} - AT {selectedYear + 1})
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleOpenCertificados('CERT_6_SUELDOS')}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
                title="Generar e imprimir Certificados N° 6 con formato oficial SII"
              >
                <Printer className="w-4 h-4 text-indigo-200" />
                <span>Emitir Certificados N° 6 Oficiales</span>
              </button>

              <button
                onClick={handleExportDJ1887Txt}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                title="Descargar archivo TXT para cargar en el portal de Declaraciones Juradas del SII"
              >
                <Download className="w-4 h-4" />
                <span>Exportar TXT SII</span>
              </button>
            </div>
          </div>

          {/* Tarjetas KPI de Resumen DJ 1887 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
              <div className="text-[10px] font-bold text-slate-500 uppercase">Trabajadores Declarados</div>
              <div className="text-lg font-black text-slate-900 font-mono mt-0.5">{dj1887Data.length}</div>
            </div>
            <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
              <div className="text-[10px] font-bold text-slate-500 uppercase">Rentas Afectas Totales</div>
              <div className="text-lg font-black text-indigo-900 font-mono mt-0.5">
                ${totalsDj1887.rentasAfectas.toLocaleString('es-CL')}
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
              <div className="text-[10px] font-bold text-slate-500 uppercase">Impuesto Único Retenido</div>
              <div className="text-lg font-black text-rose-700 font-mono mt-0.5">
                ${totalsDj1887.impuestoUnico.toLocaleString('es-CL')}
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
              <div className="text-[10px] font-bold text-slate-500 uppercase">Leyes Sociales Deducibles</div>
              <div className="text-lg font-black text-emerald-700 font-mono mt-0.5">
                ${totalsDj1887.leyesSociales.toLocaleString('es-CL')}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <th className="p-2.5">RUT Trabajador</th>
                  <th className="p-2.5">Nombre Completo</th>
                  <th className="p-2.5">Cargo</th>
                  <th className="p-2.5 text-center">Meses Trab.</th>
                  <th className="p-2.5 text-right">Rentas Afectas ($)</th>
                  <th className="p-2.5 text-right text-rose-800">Impuesto Único ($)</th>
                  <th className="p-2.5 text-right text-emerald-800">Leyes Sociales ($)</th>
                  <th className="p-2.5 text-center">Certificado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dj1887Data.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="p-2.5 font-mono font-bold text-indigo-900">{row.rut}</td>
                    <td className="p-2.5 font-medium text-slate-900">{row.nombre}</td>
                    <td className="p-2.5 text-slate-600">{row.cargo}</td>
                    <td className="p-2.5 text-center font-bold">{row.mesesTrabajados}</td>
                    <td className="p-2.5 text-right font-mono">${row.rentasAfectas.toLocaleString('es-CL')}</td>
                    <td className="p-2.5 text-right font-mono font-bold text-rose-700">${row.impuestoUnico.toLocaleString('es-CL')}</td>
                    <td className="p-2.5 text-right font-mono text-emerald-700">${row.leyesSociales.toLocaleString('es-CL')}</td>
                    <td className="p-2.5 text-center">
                      <button
                        onClick={() => handleOpenCertificados('CERT_6_SUELDOS')}
                        className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[11px] font-bold transition-colors inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Printer className="w-3 h-3" />
                        <span>Ver N° 6</span>
                      </button>
                    </td>
                  </tr>
                ))}
                {dj1887Data.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-slate-400 italic">
                      No se encontraron liquidaciones de sueldo registradas para el año {selectedYear}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CONTENIDO TAB DJ 1879 (HONORARIOS Y RETENCIONES) */}
      {/* ========================================================================= */}
      {activeDjTab === 'DJ_1879' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-xs">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-slate-900">
                  DJ 1879 - Declaración Jurada sobre Retenciones de Honorarios Art. 42 N° 2
                </h3>
                <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded font-bold border border-amber-200">
                  Art. 101 LIR
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Registro anual de boletas de honorarios recibidas, retención efectuada (13.75% / 14.50%) y montos líquidos pagados (Año Comercial {selectedYear} - AT {selectedYear + 1})
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleOpenCertificados('CERT_2_HONORARIOS')}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
                title="Generar e imprimir Certificados N° 2 con formato oficial SII"
              >
                <Printer className="w-4 h-4 text-amber-200" />
                <span>Emitir Certificados N° 2 Oficiales</span>
              </button>

              <button
                onClick={handleExportDJ1879Txt}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                title="Descargar archivo TXT para cargar en el portal de Declaraciones Juradas del SII"
              >
                <Download className="w-4 h-4" />
                <span>Exportar TXT SII</span>
              </button>
            </div>
          </div>

          {/* Tarjetas KPI de Resumen DJ 1879 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
              <div className="text-[10px] font-bold text-slate-500 uppercase">Profesionales / Emisores</div>
              <div className="text-lg font-black text-slate-900 font-mono mt-0.5">{dj1879Data.length}</div>
            </div>
            <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
              <div className="text-[10px] font-bold text-slate-500 uppercase">Boletas Recibidas</div>
              <div className="text-lg font-black text-indigo-900 font-mono mt-0.5">{totalsDj1879.count}</div>
            </div>
            <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
              <div className="text-[10px] font-bold text-slate-500 uppercase">Honorarios Brutos</div>
              <div className="text-lg font-black text-amber-900 font-mono mt-0.5">
                ${totalsDj1879.bruto.toLocaleString('es-CL')}
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
              <div className="text-[10px] font-bold text-slate-500 uppercase">Retención Legal Efectuada</div>
              <div className="text-lg font-black text-rose-700 font-mono mt-0.5">
                ${totalsDj1879.retencion.toLocaleString('es-CL')}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <th className="p-2.5">RUT Profesional</th>
                  <th className="p-2.5">Nombre / Razón Social</th>
                  <th className="p-2.5 text-center">N° Boletas</th>
                  <th className="p-2.5 text-right">Honorarios Brutos ($)</th>
                  <th className="p-2.5 text-right text-rose-800">Retención Legal ($)</th>
                  <th className="p-2.5 text-right">Préstamo Solidario ($)</th>
                  <th className="p-2.5 text-right text-emerald-800">Líquido Pagado ($)</th>
                  <th className="p-2.5 text-center">Certificado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dj1879Data.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="p-2.5 font-mono font-bold text-amber-900">{row.rut}</td>
                    <td className="p-2.5 font-medium text-slate-900">{row.name}</td>
                    <td className="p-2.5 text-center font-bold">{row.count}</td>
                    <td className="p-2.5 text-right font-mono">${row.bruto.toLocaleString('es-CL')}</td>
                    <td className="p-2.5 text-right font-mono font-bold text-rose-700">${row.retencion.toLocaleString('es-CL')}</td>
                    <td className="p-2.5 text-right font-mono">${row.retPrestamo.toLocaleString('es-CL')}</td>
                    <td className="p-2.5 text-right font-mono text-emerald-700">${row.liquido.toLocaleString('es-CL')}</td>
                    <td className="p-2.5 text-center">
                      <button
                        onClick={() => handleOpenCertificados('CERT_2_HONORARIOS')}
                        className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-lg text-[11px] font-bold transition-colors inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Award className="w-3 h-3" />
                        <span>Ver N° 2</span>
                      </button>
                    </td>
                  </tr>
                ))}
                {dj1879Data.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-slate-400 italic">
                      No se encontraron boletas de honorarios registradas en el período {selectedYear}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CONTENIDO TAB DJ 1847 (BALANCE 8 COLUMNAS E INVENTARIO) */}
      {/* ========================================================================= */}
      {activeDjTab === 'DJ_1847' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-xs">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-slate-900">
                  DJ 1847 - Balance de 8 Columnas e Inventario para la Renta
                </h3>
                <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded font-bold border border-emerald-200">
                  Art. 14 LIR
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Declaración Anual del Balance Tributario consolidado al 31 de Diciembre del ejercicio {selectedYear}
              </p>
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Balance General Consolidado para Declaración Jurada 1847</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              La Declaración Jurada N° 1847 se nutre automáticamente del <strong>Balance de 8 Columnas</strong> generado por el motor de centralización contable. Todas las cuentas de activo, pasivo, patrimonio, resultado y activo fijo se encuentran calculadas para su reporte anual ante el SII.
            </p>
          </div>
        </div>
      )}

      {/* MODAL OFICIAL DE EMISIÓN DE CERTIFICADOS SII */}
      <CertificadosOficialesSiiModal
        isOpen={showCertModal}
        onClose={() => setShowCertModal(false)}
        company={company}
        employees={employees}
        savedSlips={savedSlips}
        rcvDocuments={rcvDocuments}
        accounts={accounts}
        initialCertificateType={certModalType}
        initialYear={selectedYear}
      />
    </div>
  );
};

export default DeclaracionesJuradasView;
