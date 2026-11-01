import React, { useState, useMemo } from 'react';
import {
  Clock,
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Download,
  Filter,
  Search,
  Users,
  Building2,
  Calendar,
  Layers,
  ArrowRight,
  ShieldAlert,
  FileSpreadsheet,
  FileText,
  CreditCard,
  Briefcase
} from 'lucide-react';
import {
  Company,
  RCVDocument,
  Voucher,
  ChartOfAccount,
  Auxiliary,
  PaymentBatch
} from '../types';
import * as XLSX from 'xlsx';
import { StandardModuleHeader } from './StandardModuleHeader';

interface AgingDeudasViewProps {
  company: Company;
  rcvDocuments: RCVDocument[];
  vouchers: Voucher[];
  accounts: ChartOfAccount[];
  auxiliaries?: Auxiliary[];
  paymentBatches?: PaymentBatch[];
  selectedPeriod?: string;
  onNavigateToCobranza?: () => void;
  onNavigateToNominasPago?: () => void;
  onNavigateToVoucher?: (voucherId: string) => void;
}

interface AgingBucket {
  key: 'AL_DIA' | '1_30' | '31_60' | '61_90' | 'MAS_90';
  label: string;
  shortLabel: string;
  color: string;
  badgeBg: string;
  badgeText: string;
  receivablesAmount: number;
  receivablesCount: number;
  payablesAmount: number;
  payablesCount: number;
  netGap: number;
}

interface InvoiceAgingItem {
  id: string;
  tipoDoc: number | string;
  tipoDocName: string;
  folio: number | string;
  rut: string;
  razonSocial: string;
  fechaEmision: string;
  fechaVencimiento: string;
  diasMora: number; // >0 vencido, <=0 al día
  bucket: 'AL_DIA' | '1_30' | '31_60' | '61_90' | 'MAS_90';
  montoTotal: number;
  montoPendiente: number;
  status: 'PENDIENTE' | 'PAGADO' | 'ANULADO';
  isVenta: boolean;
}

export const AgingDeudasView: React.FC<AgingDeudasViewProps> = ({
  company,
  rcvDocuments,
  vouchers,
  accounts,
  auxiliaries = [],
  paymentBatches = [],
  selectedPeriod: initialPeriod,
  onNavigateToCobranza,
  onNavigateToNominasPago,
  onNavigateToVoucher
}) => {
  const [activeTab, setActiveTab] = useState<'RESUMEN' | 'CLIENTES' | 'PROVEEDORES'>('RESUMEN');
  const [selectedBucketFilter, setSelectedBucketFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Período de referencia
  const [periodStr, setPeriodStr] = useState<string>(() => {
    if (initialPeriod) return initialPeriod;
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const handlePrevPeriod = () => {
    const [y, m] = periodStr.split('-').map(Number);
    const prevDate = new Date(y, m - 2, 1);
    setPeriodStr(`${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`);
  };

  const handleNextPeriod = () => {
    const [y, m] = periodStr.split('-').map(Number);
    const nextDate = new Date(y, m, 1);
    setPeriodStr(`${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`);
  };

  // Fecha de corte para cálculo de morosidad (fin de mes del período o hoy si es mes actual)
  const cutOffDate = useMemo(() => {
    const today = new Date();
    const [y, m] = periodStr.split('-').map(Number);
    const isCurrentMonth = today.getFullYear() === y && today.getMonth() + 1 === m;
    if (isCurrentMonth) return today;
    return new Date(y, m, 0); // Último día del mes
  }, [periodStr]);

  // 1. Procesar Documentos con cálculo de Aging
  const { receivablesList, payablesList, buckets } = useMemo(() => {
    const recList: InvoiceAgingItem[] = [];
    const payList: InvoiceAgingItem[] = [];

    // Helper para clasificar tramo
    const getBucket = (days: number): 'AL_DIA' | '1_30' | '31_60' | '61_90' | 'MAS_90' => {
      if (days <= 0) return 'AL_DIA';
      if (days <= 30) return '1_30';
      if (days <= 60) return '31_60';
      if (days <= 90) return '61_90';
      return 'MAS_90';
    };

    rcvDocuments.forEach(doc => {
      const isVenta = doc.tipoRegistro === 'Venta';
      const isCompra = doc.tipoRegistro === 'Compra';
      if (!isVenta && !isCompra) return;

      const fechaEmisionStr = doc.fechaEmision || doc.date || `${periodStr}-01`;
      // Calcular fecha de vencimiento (por defecto 30 días tras emisión si no viene especificada)
      const emision = new Date(fechaEmisionStr);
      const vencimiento = doc.fechaVencimiento
        ? new Date(doc.fechaVencimiento)
        : new Date(emision.getTime() + 30 * 24 * 60 * 60 * 1000);

      const diffTime = cutOffDate.getTime() - vencimiento.getTime();
      const diasMora = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      const bucket = getBucket(diasMora);

      const tipoDocStr = String(doc.tipoDoc || '33');
      const isCancelled = tipoDocStr === '61'; // Nota de Crédito
      const montoTotal = doc.montoTotal || 0;
      const montoPendiente = isCancelled ? -montoTotal : montoTotal;

      const rutContraparte = isVenta ? (doc.rutReceptor || doc.rutEmisor || '') : (doc.rutEmisor || '');
      const razonSocialContraparte = isVenta ? (doc.razonSocialReceptor || doc.razonSocialEmisor || 'Cliente') : (doc.razonSocialEmisor || 'Proveedor');

      const item: InvoiceAgingItem = {
        id: doc.id,
        tipoDoc: tipoDocStr,
        tipoDocName: tipoDocStr === '33' ? 'Factura Electrónica' : tipoDocStr === '34' ? 'Factura Exenta' : tipoDocStr === '61' ? 'Nota Crédito' : `DTE ${tipoDocStr}`,
        folio: doc.folio,
        rut: rutContraparte,
        razonSocial: razonSocialContraparte,
        fechaEmision: fechaEmisionStr,
        fechaVencimiento: vencimiento.toISOString().slice(0, 10),
        diasMora,
        bucket,
        montoTotal,
        montoPendiente,
        status: isCancelled ? 'ANULADO' : 'PENDIENTE',
        isVenta
      };

      if (isVenta && montoPendiente !== 0) {
        recList.push(item);
      } else if (isCompra && montoPendiente !== 0) {
        payList.push(item);
      }
    });

    // Calcular montos por tramo
    const bucketDefs: AgingBucket[] = [
      {
        key: 'AL_DIA',
        label: 'Al Día (Vigente)',
        shortLabel: 'Al Día',
        color: 'emerald',
        badgeBg: 'bg-emerald-50 border-emerald-200',
        badgeText: 'text-emerald-800',
        receivablesAmount: recList.filter(i => i.bucket === 'AL_DIA').reduce((s, i) => s + i.montoPendiente, 0),
        receivablesCount: recList.filter(i => i.bucket === 'AL_DIA').length,
        payablesAmount: payList.filter(i => i.bucket === 'AL_DIA').reduce((s, i) => s + i.montoPendiente, 0),
        payablesCount: payList.filter(i => i.bucket === 'AL_DIA').length,
        netGap: 0
      },
      {
        key: '1_30',
        label: '1 a 30 Días de Mora',
        shortLabel: '1-30 Días',
        color: 'blue',
        badgeBg: 'bg-blue-50 border-blue-200',
        badgeText: 'text-blue-800',
        receivablesAmount: recList.filter(i => i.bucket === '1_30').reduce((s, i) => s + i.montoPendiente, 0),
        receivablesCount: recList.filter(i => i.bucket === '1_30').length,
        payablesAmount: payList.filter(i => i.bucket === '1_30').reduce((s, i) => s + i.montoPendiente, 0),
        payablesCount: payList.filter(i => i.bucket === '1_30').length,
        netGap: 0
      },
      {
        key: '31_60',
        label: '31 a 60 Días de Mora',
        shortLabel: '31-60 Días',
        color: 'amber',
        badgeBg: 'bg-amber-50 border-amber-200',
        badgeText: 'text-amber-800',
        receivablesAmount: recList.filter(i => i.bucket === '31_60').reduce((s, i) => s + i.montoPendiente, 0),
        receivablesCount: recList.filter(i => i.bucket === '31_60').length,
        payablesAmount: payList.filter(i => i.bucket === '31_60').reduce((s, i) => s + i.montoPendiente, 0),
        payablesCount: payList.filter(i => i.bucket === '31_60').length,
        netGap: 0
      },
      {
        key: '61_90',
        label: '61 a 90 Días de Mora',
        shortLabel: '61-90 Días',
        color: 'orange',
        badgeBg: 'bg-orange-50 border-orange-200',
        badgeText: 'text-orange-800',
        receivablesAmount: recList.filter(i => i.bucket === '61_90').reduce((s, i) => s + i.montoPendiente, 0),
        receivablesCount: recList.filter(i => i.bucket === '61_90').length,
        payablesAmount: payList.filter(i => i.bucket === '61_90').reduce((s, i) => s + i.montoPendiente, 0),
        payablesCount: payList.filter(i => i.bucket === '61_90').length,
        netGap: 0
      },
      {
        key: 'MAS_90',
        label: 'Más de 90 Días (Crítico)',
        shortLabel: '+90 Días',
        color: 'rose',
        badgeBg: 'bg-rose-50 border-rose-200',
        badgeText: 'text-rose-800',
        receivablesAmount: recList.filter(i => i.bucket === 'MAS_90').reduce((s, i) => s + i.montoPendiente, 0),
        receivablesCount: recList.filter(i => i.bucket === 'MAS_90').length,
        payablesAmount: payList.filter(i => i.bucket === 'MAS_90').reduce((s, i) => s + i.montoPendiente, 0),
        payablesCount: payList.filter(i => i.bucket === 'MAS_90').length,
        netGap: 0
      }
    ];

    bucketDefs.forEach(b => {
      b.netGap = b.receivablesAmount - b.payablesAmount;
    });

    return {
      receivablesList: recList,
      payablesList: payList,
      buckets: bucketDefs
    };
  }, [rcvDocuments, cutOffDate]);

  // Totales globales
  const totals = useMemo(() => {
    const totalReceivables = receivablesList.reduce((s, i) => s + i.montoPendiente, 0);
    const totalPayables = payablesList.reduce((s, i) => s + i.montoPendiente, 0);
    const netWorkingCapital = totalReceivables - totalPayables;
    const criticalReceivables = buckets.find(b => b.key === 'MAS_90')?.receivablesAmount || 0;
    const criticalPayables = buckets.find(b => b.key === 'MAS_90')?.payablesAmount || 0;

    return {
      totalReceivables,
      totalPayables,
      netWorkingCapital,
      criticalReceivables,
      criticalPayables
    };
  }, [receivablesList, payablesList, buckets]);

  // Filtros en listados de detalle
  const filteredReceivables = useMemo(() => {
    return receivablesList.filter(i => {
      const matchBucket = selectedBucketFilter === 'ALL' || i.bucket === selectedBucketFilter;
      const matchSearch =
        i.razonSocial.toLowerCase().includes(searchTerm.toLowerCase()) ||
        i.rut.toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(i.folio).includes(searchTerm);
      return matchBucket && matchSearch;
    });
  }, [receivablesList, selectedBucketFilter, searchTerm]);

  const filteredPayables = useMemo(() => {
    return payablesList.filter(i => {
      const matchBucket = selectedBucketFilter === 'ALL' || i.bucket === selectedBucketFilter;
      const matchSearch =
        i.razonSocial.toLowerCase().includes(searchTerm.toLowerCase()) ||
        i.rut.toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(i.folio).includes(searchTerm);
      return matchBucket && matchSearch;
    });
  }, [payablesList, selectedBucketFilter, searchTerm]);

  // Exportar matriz de Aging a Excel
  const handleExportExcel = () => {
    const summaryRows = buckets.map(b => ({
      Tramo_Vencimiento: b.label,
      Cuentas_por_Cobrar_Monto: b.receivablesAmount,
      Cuentas_por_Cobrar_Docs: b.receivablesCount,
      Cuentas_por_Pagar_Monto: b.payablesAmount,
      Cuentas_por_Pagar_Docs: b.payablesCount,
      Brecha_Neta_Caja: b.netGap
    }));

    const detailRecRows = receivablesList.map(r => ({
      Modulo: 'CLIENTES_VENTAS',
      RUT: r.rut,
      Razon_Social: r.razonSocial,
      Tipo_DTE: r.tipoDocName,
      Folio: r.folio,
      Fecha_Emision: r.fechaEmision,
      Fecha_Vencimiento: r.fechaVencimiento,
      Dias_Mora: r.diasMora,
      Tramo_Aging: r.bucket,
      Monto_Pendiente: r.montoPendiente
    }));

    const detailPayRows = payablesList.map(p => ({
      Modulo: 'PROVEEDORES_COMPRAS',
      RUT: p.rut,
      Razon_Social: p.razonSocial,
      Tipo_DTE: p.tipoDocName,
      Folio: p.folio,
      Fecha_Emision: p.fechaEmision,
      Fecha_Vencimiento: p.fechaVencimiento,
      Dias_Mora: p.diasMora,
      Tramo_Aging: p.bucket,
      Monto_Pendiente: p.montoPendiente
    }));

    const wb = XLSX.utils.book_new();
    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
    const wsRec = XLSX.utils.json_to_sheet(detailRecRows);
    const wsPay = XLSX.utils.json_to_sheet(detailPayRows);

    XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen_Aging');
    XLSX.utils.book_append_sheet(wb, wsRec, 'Cobranzas_Clientes');
    XLSX.utils.book_append_sheet(wb, wsPay, 'Pagos_Proveedores');

    XLSX.writeFile(wb, `Informe_Gerencial_Aging_${company.name.replace(/\s+/g, '_')}_${periodStr}.xlsx`);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* HEADER ESTANDARIZADO DE MÓDULO */}
      <StandardModuleHeader
        title="Aging de Deudas & Antigüedad de Cartera"
        subtitle={`Empresa: ${company.name} — Matriz de vencimientos de Cuentas por Cobrar (Clientes) y Cuentas por Pagar (Proveedores) con proyección de liquidez neta.`}
        icon={Clock}
        iconBgColor="bg-indigo-600"
        layerBadge={{ layer: 4, label: 'Capa 4: Reportes Gerenciales' }}
        period={{
          selectedPeriod: periodStr,
          onPrevPeriod: handlePrevPeriod,
          onNextPeriod: handleNextPeriod
        }}
        kpis={[
          {
            label: 'Cuentas por Cobrar (Clientes)',
            value: `$${totals.totalReceivables.toLocaleString('es-CL')}`,
            subtext: `${receivablesList.length} documentos por recaudar`,
            icon: DollarSign,
            variant: 'success'
          },
          {
            label: 'Cuentas por Pagar (Proveedores)',
            value: `$${totals.totalPayables.toLocaleString('es-CL')}`,
            subtext: `${payablesList.length} facturas por pagar`,
            icon: CreditCard,
            variant: 'warning'
          },
          {
            label: 'Brecha Neta de Cartera',
            value: `$${totals.netWorkingCapital.toLocaleString('es-CL')}`,
            subtext: totals.netWorkingCapital >= 0 ? 'Superávit exigible a favor' : 'Déficit de capital de trabajo',
            icon: TrendingUp,
            variant: totals.netWorkingCapital >= 0 ? 'purple' : 'danger'
          },
          {
            label: 'Cartera Morosa Crítica (+90d)',
            value: `$${totals.criticalReceivables.toLocaleString('es-CL')}`,
            subtext: 'Cobranza judicial / riesgo incobrable',
            icon: ShieldAlert,
            variant: totals.criticalReceivables > 0 ? 'danger' : 'default'
          }
        ]}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 px-3 py-1.5 rounded-xl text-xs font-semibold shadow-2xs transition-all cursor-pointer"
              title="Exportar Aging a Excel"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Exportar Excel</span>
            </button>
          </div>
        }
      />

      {/* TABS DE NAVEGACIÓN */}
      <div className="flex border-b border-slate-200 bg-white px-4 rounded-xl shadow-xs gap-3">
        <button
          onClick={() => setActiveTab('RESUMEN')}
          className={`py-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'RESUMEN'
              ? 'border-indigo-600 text-indigo-700 bg-indigo-50/40'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Matriz de Aging Cruzada</span>
        </button>

        <button
          onClick={() => setActiveTab('CLIENTES')}
          className={`py-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'CLIENTES'
              ? 'border-emerald-600 text-emerald-700 bg-emerald-50/40'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Cuentas por Cobrar Clientes ({receivablesList.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('PROVEEDORES')}
          className={`py-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'PROVEEDORES'
              ? 'border-amber-600 text-amber-700 bg-amber-50/40'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Cuentas por Pagar Proveedores ({payablesList.length})</span>
        </button>
      </div>

      {/* CONTENIDO TAB 1: RESUMEN EJECUTIVO / MATRIZ */}
      {activeTab === 'RESUMEN' && (
        <div className="space-y-6">
          {/* Matriz comparativa de tramos */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50/60 flex justify-between items-center">
              <div>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Matriz Comparativa de Antigüedad y Brecha de Liquidez
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Fecha de corte al corte del período: {cutOffDate.toISOString().slice(0, 10)}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 uppercase">
                    <th className="p-3">Tramo de Antigüedad</th>
                    <th className="p-3 text-right">Cobranzas (Clientes)</th>
                    <th className="p-3 text-center">N° Docs</th>
                    <th className="p-3 text-right">Pagos (Proveedores)</th>
                    <th className="p-3 text-center">N° Docs</th>
                    <th className="p-3 text-right">Brecha Neta (Superávit / Déficit)</th>
                    <th className="p-3 text-center">Nivel de Riesgo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {buckets.map(b => {
                    const isPositive = b.netGap >= 0;
                    return (
                      <tr key={b.key} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3 font-bold text-slate-900 flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${b.key === 'AL_DIA' ? 'bg-emerald-500' : b.key === '1_30' ? 'bg-blue-500' : b.key === '31_60' ? 'bg-amber-500' : b.key === '61_90' ? 'bg-orange-500' : 'bg-rose-500'}`} />
                          <span>{b.label}</span>
                        </td>
                        <td className="p-3 font-mono font-bold text-right text-emerald-800">
                          ${b.receivablesAmount.toLocaleString('es-CL')}
                        </td>
                        <td className="p-3 text-center text-slate-500 font-mono">
                          {b.receivablesCount}
                        </td>
                        <td className="p-3 font-mono font-bold text-right text-amber-800">
                          ${b.payablesAmount.toLocaleString('es-CL')}
                        </td>
                        <td className="p-3 text-center text-slate-500 font-mono">
                          {b.payablesCount}
                        </td>
                        <td className={`p-3 font-mono font-bold text-right ${isPositive ? 'text-indigo-900' : 'text-rose-700'}`}>
                          ${b.netGap.toLocaleString('es-CL')}
                        </td>
                        <td className="p-3 text-center">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${b.badgeBg} ${b.badgeText}`}>
                            {b.key === 'AL_DIA' ? 'Bajo' : b.key === '1_30' ? 'Moderado' : b.key === '31_60' ? 'Medio' : b.key === '61_90' ? 'Alto' : 'Crítico'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 font-bold border-t-2 border-slate-300">
                    <td className="p-3 text-slate-800 uppercase">Totales Consolidados</td>
                    <td className="p-3 font-mono text-right text-emerald-900 text-sm">
                      ${totals.totalReceivables.toLocaleString('es-CL')}
                    </td>
                    <td className="p-3 text-center text-slate-700 font-mono">
                      {receivablesList.length}
                    </td>
                    <td className="p-3 font-mono text-right text-amber-900 text-sm">
                      ${totals.totalPayables.toLocaleString('es-CL')}
                    </td>
                    <td className="p-3 text-center text-slate-700 font-mono">
                      {payablesList.length}
                    </td>
                    <td className={`p-3 font-mono text-right text-sm ${totals.netWorkingCapital >= 0 ? 'text-indigo-900' : 'text-rose-700'}`}>
                      ${totals.netWorkingCapital.toLocaleString('es-CL')}
                    </td>
                    <td className="p-3 text-center text-slate-500 text-[11px]">
                      Balance Cartera
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* CONTENIDO TAB 2: DETALLE CLIENTES */}
      {activeTab === 'CLIENTES' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-[240px]">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por cliente, RUT o folio..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-600">Filtrar Tramo:</label>
              <select
                value={selectedBucketFilter}
                onChange={e => setSelectedBucketFilter(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-semibold text-slate-800"
              >
                <option value="ALL">Todos los Tramos</option>
                <option value="AL_DIA">Al Día (Vigente)</option>
                <option value="1_30">1 a 30 Días</option>
                <option value="31_60">31 a 60 Días</option>
                <option value="61_90">61 a 90 Días</option>
                <option value="MAS_90">+90 Días (Crítico)</option>
              </select>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <th className="p-2.5">RUT</th>
                    <th className="p-2.5">Razón Social Cliente</th>
                    <th className="p-2.5">Tipo DTE</th>
                    <th className="p-2.5">Folio</th>
                    <th className="p-2.5">Fecha Emisión</th>
                    <th className="p-2.5">Vencimiento</th>
                    <th className="p-2.5 text-center">Días Mora</th>
                    <th className="p-2.5 text-center">Tramo</th>
                    <th className="p-2.5 text-right">Monto Pendiente ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredReceivables.length > 0 ? (
                    filteredReceivables.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50/80">
                        <td className="p-2.5 font-mono text-slate-600">{item.rut}</td>
                        <td className="p-2.5 font-bold text-slate-900">{item.razonSocial}</td>
                        <td className="p-2.5 text-slate-600">{item.tipoDocName}</td>
                        <td className="p-2.5 font-mono font-semibold text-indigo-900">#{item.folio}</td>
                        <td className="p-2.5 font-mono text-slate-600">{item.fechaEmision}</td>
                        <td className="p-2.5 font-mono text-slate-600">{item.fechaVencimiento}</td>
                        <td className={`p-2.5 font-mono font-bold text-center ${item.diasMora > 60 ? 'text-rose-700' : item.diasMora > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                          {item.diasMora > 0 ? `+${item.diasMora}d` : `${item.diasMora}d`}
                        </td>
                        <td className="p-2.5 text-center">
                          <span className="bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-slate-200">
                            {item.bucket}
                          </span>
                        </td>
                        <td className="p-2.5 font-mono font-bold text-right text-emerald-800">
                          ${item.montoPendiente.toLocaleString('es-CL')}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="p-6 text-center text-slate-400">
                        No se encontraron cuentas por cobrar en el filtro seleccionado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* CONTENIDO TAB 3: DETALLE PROVEEDORES */}
      {activeTab === 'PROVEEDORES' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-[240px]">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por proveedor, RUT o folio..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-600">Filtrar Tramo:</label>
              <select
                value={selectedBucketFilter}
                onChange={e => setSelectedBucketFilter(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-semibold text-slate-800"
              >
                <option value="ALL">Todos los Tramos</option>
                <option value="AL_DIA">Al Día (Vigente)</option>
                <option value="1_30">1 a 30 Días</option>
                <option value="31_60">31 a 60 Días</option>
                <option value="61_90">61 a 90 Días</option>
                <option value="MAS_90">+90 Días (Crítico)</option>
              </select>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <th className="p-2.5">RUT</th>
                    <th className="p-2.5">Razón Social Proveedor</th>
                    <th className="p-2.5">Tipo DTE</th>
                    <th className="p-2.5">Folio</th>
                    <th className="p-2.5">Fecha Emisión</th>
                    <th className="p-2.5">Vencimiento</th>
                    <th className="p-2.5 text-center">Días Mora</th>
                    <th className="p-2.5 text-center">Tramo</th>
                    <th className="p-2.5 text-right">Monto por Pagar ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPayables.length > 0 ? (
                    filteredPayables.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50/80">
                        <td className="p-2.5 font-mono text-slate-600">{item.rut}</td>
                        <td className="p-2.5 font-bold text-slate-900">{item.razonSocial}</td>
                        <td className="p-2.5 text-slate-600">{item.tipoDocName}</td>
                        <td className="p-2.5 font-mono font-semibold text-amber-900">#{item.folio}</td>
                        <td className="p-2.5 font-mono text-slate-600">{item.fechaEmision}</td>
                        <td className="p-2.5 font-mono text-slate-600">{item.fechaVencimiento}</td>
                        <td className={`p-2.5 font-mono font-bold text-center ${item.diasMora > 60 ? 'text-rose-700' : item.diasMora > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                          {item.diasMora > 0 ? `+${item.diasMora}d` : `${item.diasMora}d`}
                        </td>
                        <td className="p-2.5 text-center">
                          <span className="bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-slate-200">
                            {item.bucket}
                          </span>
                        </td>
                        <td className="p-2.5 font-mono font-bold text-right text-amber-800">
                          ${item.montoPendiente.toLocaleString('es-CL')}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="p-6 text-center text-slate-400">
                        No se encontraron cuentas por pagar en el filtro seleccionado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
