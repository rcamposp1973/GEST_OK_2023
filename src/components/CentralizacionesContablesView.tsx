import React, { useState, useMemo } from 'react';
import {
  Layers,
  Settings,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  FileText,
  DollarSign,
  TrendingUp,
  Building2,
  Users,
  CreditCard,
  Calendar,
  Eye,
  RefreshCw,
  Search,
  Filter,
  Save,
  ArrowRight,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  Check,
  AlertTriangle,
  Info,
  Sliders,
  Sparkles,
  HelpCircle
} from 'lucide-react';
import {
  Company,
  ChartOfAccount,
  Voucher,
  VoucherLine,
  RCVDocument,
  PayrollSlip,
  CommercialDocument,
  MasterAccountingParameters,
  ExchangeRate,
  Auxiliary
} from '../types';
import { SearchableAccountSelect } from './SearchableAccountSelect';
import { notify } from '../context/ToastContext';
import { logAuditEvent } from '../utils/auditLogger';
import { db, auth } from '../lib/firebase';
import { doc, updateDoc, writeBatch } from 'firebase/firestore';

interface CentralizacionesContablesViewProps {
  studyId: string;
  company: Company;
  accounts: ChartOfAccount[];
  vouchers: Voucher[];
  rcvDocuments: RCVDocument[];
  payrollSlips?: PayrollSlip[];
  commercialDocuments?: CommercialDocument[];
  auxiliaries?: Auxiliary[];
  selectedPeriod: string; // e.g. '2026-10'
  onChangePeriod: (period: string) => void;
  masterParams: MasterAccountingParameters | null;
  onSaveMasterParams: (params: MasterAccountingParameters) => Promise<void>;
  onCentralizeVoucher: (voucher: Omit<Voucher, 'id' | 'createdAt'>) => Promise<string>;
  onNavigateToVoucher?: (voucherId: string) => void;
  onNavigateToLibroDiario?: () => void;
  onNavigateToModule?: (moduleId: string) => void;
  onRefreshData: () => Promise<void>;
  exchangeRates: ExchangeRate[];
  checkIsPeriodClosed?: (period: string) => { isClosed: boolean; errorMsg?: string };
}

interface PreviewVoucherData {
  title: string;
  moduleKey: 'VENTAS' | 'COMPRAS' | 'HONORARIOS' | 'REMUNERACIONES' | 'ACTIVO_FIJO' | 'TESORERIA';
  period: string;
  type: 'Traspaso' | 'Ingreso' | 'Egreso';
  date: string;
  gloss: string;
  lines: VoucherLine[];
  documentCount: number;
}

export const CentralizacionesContablesView: React.FC<CentralizacionesContablesViewProps> = ({
  studyId,
  company,
  accounts,
  vouchers,
  rcvDocuments,
  payrollSlips = [],
  commercialDocuments = [],
  auxiliaries = [],
  selectedPeriod,
  onChangePeriod,
  masterParams,
  onSaveMasterParams,
  onCentralizeVoucher,
  onNavigateToVoucher,
  onNavigateToLibroDiario,
  onNavigateToModule,
  onRefreshData,
  exchangeRates,
  checkIsPeriodClosed
}) => {
  // Pestañas principales de la vista (Estandarizadas)
  const [activeMainTab, setActiveMainTab] = useState<'TABLERO' | 'PARAMETRIZACION' | 'AUDITORIA'>('TABLERO');

  // Estado para previsualizador modal de comprobante
  const [previewVoucher, setPreviewVoucher] = useState<PreviewVoucherData | null>(null);
  const [isExecutingCentralization, setIsExecutingCentralization] = useState(false);

  // Formulario local de parametrización contable
  const [formData, setFormData] = useState<MasterAccountingParameters>(() => masterParams || {});
  const [isSavingParams, setIsSavingParams] = useState(false);
  const [activeParamSection, setActiveParamSection] = useState<'ALL' | 'VENTAS' | 'COMPRAS' | 'REMUNERACIONES' | 'ACTIVO_FIJO' | 'TESORERIA' | 'RENDICIONES'>('ALL');

  // Tipo de cambio del período (Dólar / UF)
  const currentExchangeRate = useMemo(() => {
    // Buscar tipo de cambio del último día del mes del período o el más cercano
    const matchingRates = exchangeRates.filter(r => r.date.startsWith(selectedPeriod));
    if (matchingRates.length > 0) {
      return matchingRates[matchingRates.length - 1];
    }
    return exchangeRates[exchangeRates.length - 1] || { id: 'fallback', date: `${selectedPeriod}-01`, dolar: 955, uf: 38250, utm: 66500, euro: 1040, yen: 6.3 };
  }, [exchangeRates, selectedPeriod]);

  // Sincronizar formulario si cambian las props externas
  React.useEffect(() => {
    if (masterParams) {
      setFormData(masterParams);
    }
  }, [masterParams]);

  // Helper para buscar cuenta por ID o código
  const getAccountById = (id?: string) => accounts.find(a => a.id === id);
  const getAccountDisplay = (id?: string, fallback: string = 'Sin configurar') => {
    if (!id) return <span className="text-amber-600 font-medium italic">⚠️ {fallback}</span>;
    const acc = getAccountById(id);
    if (!acc) return <span className="text-rose-600 font-medium italic">⚠️ Cuenta no encontrada ({id})</span>;
    return (
      <span className="font-mono text-slate-800 text-xs">
        <strong className="text-indigo-700">[{acc.code}]</strong> {acc.name}
      </span>
    );
  };

  // -------------------------------------------------------------
  // ANALISIS DE MODULOS OPERATIVOS DEL PERIODO (CAPA 1 -> CAPA 2)
  // -------------------------------------------------------------

  // 1. Módulo Ventas & Exportaciones
  const salesAnalysis = useMemo(() => {
    const docs = rcvDocuments.filter(d => d.period === selectedPeriod && d.tipoRegistro === 'Venta');
    const pendingDocs = docs.filter(d => !d.estadoContabilizado);
    const centralizedDocs = docs.filter(d => d.estadoContabilizado);

    const totalNeto = docs.reduce((acc, d) => acc + (Number(d.montoNeto) || 0), 0);
    const totalIva = docs.reduce((acc, d) => acc + (Number(d.montoIva) || 0), 0);
    const totalExento = docs.reduce((acc, d) => acc + (Number(d.montoExento) || 0), 0);
    const totalMonto = docs.reduce((acc, d) => acc + (Number(d.montoTotal) || 0), 0);

    // Detectar documentos en moneda extranjera o exportación
    const foreignDocs = docs.filter(d => (d as any).moneda === 'USD' || (d as any).moneda === 'UF' || (d.tipoDoc === '110' || d.tipoDoc === '111'));
    const foreignDiscrepancies = docs.filter(d => {
      const isForeign = (d as any).moneda === 'USD' || (d.tipoDoc === '110' || d.tipoDoc === '111');
      return isForeign && Number(d.montoTotal) > 0 && Number(d.montoTotal) < 10000; // Alerta si está guardado como pesos en número bajo
    });

    const isCentralized = docs.length > 0 && pendingDocs.length === 0;

    return {
      totalDocs: docs.length,
      pendingDocs: pendingDocs.length,
      centralizedDocs: centralizedDocs.length,
      totalNeto,
      totalIva,
      totalExento,
      totalMonto,
      foreignCount: foreignDocs.length,
      foreignDiscrepanciesCount: foreignDiscrepancies.length,
      isCentralized,
      docs,
      pendingDocsList: pendingDocs
    };
  }, [rcvDocuments, selectedPeriod]);

  // 2. Módulo Compras & Proveedores
  const purchasesAnalysis = useMemo(() => {
    const docs = rcvDocuments.filter(d => d.period === selectedPeriod && d.tipoRegistro === 'Compra');
    const pendingDocs = docs.filter(d => !d.estadoContabilizado);
    const centralizedDocs = docs.filter(d => d.estadoContabilizado);

    const totalNeto = docs.reduce((acc, d) => acc + (Number(d.montoNeto) || 0), 0);
    const totalIva = docs.reduce((acc, d) => acc + (Number(d.montoIva) || 0), 0);
    const totalIvaNoRec = docs.reduce((acc, d) => {
      const noRec = Number(d.montoIvaNoRecuperable) || 
        ((Number(d.montoTotal) || 0) > ((Number(d.montoNeto) || 0) + (Number(d.montoIva) || 0) + (Number(d.montoExento) || 0))
          ? ((Number(d.montoTotal) || 0) - ((Number(d.montoNeto) || 0) + (Number(d.montoIva) || 0) + (Number(d.montoExento) || 0)))
          : 0);
      return acc + noRec;
    }, 0);
    const totalExento = docs.reduce((acc, d) => acc + (Number(d.montoExento) || 0), 0);
    const totalMonto = docs.reduce((acc, d) => acc + (Number(d.montoTotal) || 0), 0);

    const foreignDocs = docs.filter(d => (d as any).moneda === 'USD' || (d as any).moneda === 'UF');
    const isCentralized = docs.length > 0 && pendingDocs.length === 0;

    return {
      totalDocs: docs.length,
      pendingDocs: pendingDocs.length,
      centralizedDocs: centralizedDocs.length,
      totalNeto,
      totalIva,
      totalIvaNoRec,
      totalExento,
      totalMonto,
      foreignCount: foreignDocs.length,
      isCentralized,
      docs,
      pendingDocsList: pendingDocs
    };
  }, [rcvDocuments, selectedPeriod]);

  // 3. Módulo Honorarios (BHE)
  const honorariosAnalysis = useMemo(() => {
    const docs = rcvDocuments.filter(d => d.period === selectedPeriod && (d.tipoDoc === 'HON' || String(d.tipoDoc).toUpperCase().includes('HON') || d.tipoDoc === 'BHE'));
    const pendingDocs = docs.filter(d => !d.estadoContabilizado);
    const totalBruto = docs.reduce((acc, d) => acc + (Number(d.montoTotal) || 0), 0);
    const totalRetencion = docs.reduce((acc, d) => acc + (Number(d.montoIva) || Number(d.montoRetencion) || 0), 0);
    const totalLiquido = totalBruto - totalRetencion;
    const isCentralized = docs.length > 0 && pendingDocs.length === 0;

    return {
      totalDocs: docs.length,
      pendingDocs: pendingDocs.length,
      totalBruto,
      totalRetencion,
      totalLiquido,
      isCentralized,
      docs
    };
  }, [rcvDocuments, selectedPeriod]);

  // 4. Módulo Remuneraciones & RRHH (Liquidaciones de Sueldos)
  const payrollAnalysis = useMemo(() => {
    const slips = payrollSlips.filter(s => s.period === selectedPeriod);
    const totalImponible = slips.reduce((acc, s) => acc + (s.totalHaberesImponibles || 0), 0);
    const totalNoImponible = slips.reduce((acc, s) => acc + (s.totalHaberesNoImponibles || 0), 0);
    const totalLiquido = slips.reduce((acc, s) => acc + (s.liquidoAPagar || 0), 0);
    const totalImpuestoUnico = slips.reduce((acc, s) => acc + (s.impuestoUnicoSegundaCategoria || 0), 0);
    const totalAportesPatronales = slips.reduce((acc, s) => {
      const sis = s.sisMonto || 0;
      const mutual = s.mutualMonto || 0;
      const afc = s.afcEmpleadorMonto || 0;
      return acc + sis + mutual + afc;
    }, 0);
    const totalLeyesSociales = slips.reduce((acc, s) => {
      const afp = s.afpMonto || 0;
      const salud = s.saludMontoTotal || 0;
      const afcTrab = s.afcTrabajadorMonto || 0;
      const sis = s.sisMonto || 0;
      const mutual = s.mutualMonto || 0;
      const afcEmp = s.afcEmpleadorMonto || 0;
      return acc + afp + salud + afcTrab + sis + mutual + afcEmp;
    }, 0);

    // Buscar si ya existe voucher de centralización de sueldos para este período
    const existingVoucher = vouchers.find(v =>
      v.type === 'Traspaso' &&
      v.status !== 'Anulado' &&
      (v.origin === 'CENTRALIZACION_REMUNERACIONES' || (v.gloss || '').toLowerCase().includes('centralización remuneraciones') || (v.gloss || '').toLowerCase().includes('sueldos')) &&
      ((v.period === selectedPeriod) || (v.date && v.date.startsWith(selectedPeriod)))
    );

    return {
      slipsCount: slips.length,
      totalImponible,
      totalNoImponible,
      totalLiquido,
      totalImpuestoUnico,
      totalAportesPatronales,
      totalLeyesSociales,
      existingVoucher,
      isCentralized: Boolean(existingVoucher && slips.length > 0),
      slips
    };
  }, [payrollSlips, vouchers, selectedPeriod]);

  // 5. Módulo Activo Fijo
  const fixedAssetAnalysis = useMemo(() => {
    // Buscar si ya existe voucher de depreciación para este período
    const existingVoucher = vouchers.find(v =>
      v.type === 'Traspaso' &&
      v.status !== 'Anulado' &&
      (v.origin === 'ACTIVO_FIJO' || (v.gloss || '').toLowerCase().includes('depreciación') || (v.gloss || '').toLowerCase().includes('activo fijo')) &&
      ((v.period === selectedPeriod) || (v.date && v.date.startsWith(selectedPeriod)))
    );

    return {
      existingVoucher,
      isCentralized: Boolean(existingVoucher)
    };
  }, [vouchers, selectedPeriod]);

  // Comprobantes centralizados del período actual (Historial oficial)
  const periodCentralizedVouchers = useMemo(() => {
    return vouchers.filter(v => {
      const matchPeriod = v.period === selectedPeriod || (v.date && v.date.startsWith(selectedPeriod));
      const isCentralizer = Boolean(
        v.origin ||
        v.createdFromRcvId ||
        v.creationMode === 'AUTOMATICO' ||
        (v.gloss || '').toLowerCase().includes('centraliz') ||
        (v.gloss || '').toLowerCase().includes('rcv') ||
        (v.gloss || '').toLowerCase().includes('remuneraciones') ||
        (v.gloss || '').toLowerCase().includes('depreciación')
      );
      return matchPeriod && isCentralizer && v.status !== 'Anulado';
    });
  }, [vouchers, selectedPeriod]);

  // -------------------------------------------------------------
  // CONSTRUCTORES DE ASIENTOS DE CENTRALIZACION (CAPA 2 -> CAPA 3)
  // -------------------------------------------------------------

  // Resolver cuenta con prioridades y fallbacks
  const resolveAccount = (configuredId?: string, preferredCodes: string[] = [], fallbackName: string = 'Cuenta'): ChartOfAccount => {
    if (configuredId) {
      const found = accounts.find(a => a.id === configuredId);
      if (found) return found;
    }
    // Buscar por coincidencia de códigos estándar
    for (const code of preferredCodes) {
      const cleanCode = code.replace(/\./g, '');
      const found = accounts.find(a => (a.code || '').replace(/\./g, '').startsWith(cleanCode));
      if (found) return found;
    }
    // Retornar primera cuenta o placeholder
    return accounts[0] || {
      id: 'fallback',
      code: '000000',
      name: fallbackName,
      type: 'Activo' as const,
      requiereAuxiliarRUT: false,
      requiereConciliacionBancaria: false,
      requiereDocumento: false,
      requiereCentroCosto: false,
      estado: 'Activo' as const
    };
  };

  // Generar Previsualización Asiento de Ventas del Período
  const handlePreviewVentas = () => {
    const docs = salesAnalysis.pendingDocsList.length > 0 ? salesAnalysis.pendingDocsList : salesAnalysis.docs;
    if (docs.length === 0) {
      notify.info('No hay documentos de ventas en este período para previsualizar.');
      return;
    }

    const customerAcc = resolveAccount(formData.defaultCustomerAccountId, ['1104001', '1.1.02.001', '1104', 'cliente'], 'Clientes Nacionales');
    const foreignCustAcc = resolveAccount(formData.foreignCustomerAccountId, ['1104002', '1104', 'exportacion', 'usd'], 'Clientes Extranjeros');
    const salesAcc = resolveAccount(formData.defaultSalesIncomeAccountId, ['5101001', '5101', 'venta', 'ingreso'], 'Ventas');
    const ivaDebitoAcc = resolveAccount(formData.ivaDebitoAccountId, ['2104001', '2107001', '2104', 'debito', 'iva'], 'IVA Débito Fiscal');
    const exentoAcc = resolveAccount(formData.exentoAccountId, ['5101002', '5101', 'exento'], 'Ventas Exentas');
    const exportSalesAcc = resolveAccount(formData.exportSalesIncomeAccountId, ['5101003', '5101', 'exportacion'], 'Ventas Exportación');

    let totalNeto = 0;
    let totalIva = 0;
    let totalExento = 0;
    let totalTotal = 0;

    docs.forEach(d => {
      const total = Number(d.montoTotal) || 0;
      const iva = Number(d.montoIva) || 0;
      const exento = Number(d.montoExento) || 0;
      const neto = Number(d.montoNeto) || (iva === 0 && exento === 0 ? total : 0);
      totalNeto += neto;
      totalIva += iva;
      totalExento += exento;
      totalTotal += total;
    });

    const lines: VoucherLine[] = [];

    // Clientes (Debe)
    lines.push({
      accountId: customerAcc.id,
      accountCode: customerAcc.code,
      accountName: customerAcc.name,
      debit: totalTotal,
      credit: 0,
      gloss: `Centralización Ventas RCV ${selectedPeriod} (${docs.length} documentos)`
    });

    // Ventas Netas (Haber)
    if (totalNeto > 0) {
      lines.push({
        accountId: salesAcc.id,
        accountCode: salesAcc.code,
        accountName: salesAcc.name,
        debit: 0,
        credit: totalNeto,
        gloss: `Ingreso Ventas Netas ${selectedPeriod}`
      });
    }

    // IVA Débito Fiscal (Haber)
    if (totalIva > 0) {
      lines.push({
        accountId: ivaDebitoAcc.id,
        accountCode: ivaDebitoAcc.code,
        accountName: ivaDebitoAcc.name,
        debit: 0,
        credit: totalIva,
        gloss: `IVA Débito Fiscal Facturado ${selectedPeriod}`
      });
    }

    // Ventas Exentas (Haber)
    if (totalExento > 0) {
      lines.push({
        accountId: exentoAcc.id,
        accountCode: exentoAcc.code,
        accountName: exentoAcc.name,
        debit: 0,
        credit: totalExento,
        gloss: `Ventas Exentas / No Gravadas ${selectedPeriod}`
      });
    }

    setPreviewVoucher({
      title: `Centralización de Ventas del Período ${selectedPeriod}`,
      moduleKey: 'VENTAS',
      period: selectedPeriod,
      type: 'Traspaso',
      date: `${selectedPeriod}-28`,
      gloss: `Centralización RCV Ventas Período ${selectedPeriod} - ${docs.length} Folios`,
      lines,
      documentCount: docs.length
    });
  };

  // Generar Previsualización Asiento de Compras del Período
  const handlePreviewCompras = () => {
    const docs = purchasesAnalysis.pendingDocsList.length > 0 ? purchasesAnalysis.pendingDocsList : purchasesAnalysis.docs;
    if (docs.length === 0) {
      notify.info('No hay documentos de compras en este período para previsualizar.');
      return;
    }

    const supplierAcc = resolveAccount(formData.defaultSupplierAccountId, ['2102001', '2104', 'proveedor'], 'Proveedores Nacionales');
    const expenseAcc = resolveAccount(formData.defaultCostOrExpenseAccountId, ['4202002', '4101', '4201', 'gasto', 'costo'], 'Gastos / Costos');
    const ivaCreditoAcc = resolveAccount(formData.ivaCreditoAccountId, ['1106001', '1107', 'credito', 'iva'], 'IVA Crédito Fiscal');
    const exentoAcc = resolveAccount(formData.exentoAccountId, ['4202002', 'exento'], 'Gastos Exentos');

    let totalNeto = 0;
    let totalIva = 0;
    let totalIvaNoRec = 0;
    let totalExento = 0;
    let totalTotal = 0;

    docs.forEach(d => {
      const isNC = d.tipoDoc === '61' || String(d.tipoDoc).includes('61');
      const factor = isNC ? -1 : 1;
      const total = (Number(d.montoTotal) || 0) * factor;
      const iva = (Number(d.montoIva) || 0) * factor;
      const ivaNoRec = (Number(d.montoIvaNoRecuperable) || 
        ((Number(d.montoTotal) || 0) > ((Number(d.montoNeto) || 0) + (Number(d.montoIva) || 0) + (Number(d.montoExento) || 0))
          ? ((Number(d.montoTotal) || 0) - ((Number(d.montoNeto) || 0) + (Number(d.montoIva) || 0) + (Number(d.montoExento) || 0)))
          : 0)) * factor;
      const exento = (Number(d.montoExento) || 0) * factor;
      const neto = (Number(d.montoNeto) || (iva === 0 && exento === 0 ? total : 0)) * factor;
      totalNeto += neto;
      totalIva += iva;
      totalIvaNoRec += ivaNoRec;
      totalExento += exento;
      totalTotal += total;
    });

    const lines: VoucherLine[] = [];

    // Gasto / Costo (Debe)
    if (totalNeto > 0) {
      lines.push({
        accountId: expenseAcc.id,
        accountCode: expenseAcc.code,
        accountName: expenseAcc.name,
        debit: totalNeto,
        credit: 0,
        gloss: `Gasto / Costo Operacional Compras RCV ${selectedPeriod}`
      });
    }

    // IVA Sin Derecho a Crédito Fiscal / IVA No Recuperable (Al Costo o Gasto Art. 31 LIR) (Debe)
    if (totalIvaNoRec > 0) {
      lines.push({
        accountId: expenseAcc.id,
        accountCode: expenseAcc.code,
        accountName: `${expenseAcc.name} (IVA Sin Derecho Crédito Art. 31 LIR)`,
        debit: totalIvaNoRec,
        credit: 0,
        gloss: `IVA No Recuperable / Sin Derecho a Crédito RCV ${selectedPeriod}`
      });
    }

    // IVA Crédito Fiscal (Debe)
    if (totalIva > 0) {
      lines.push({
        accountId: ivaCreditoAcc.id,
        accountCode: ivaCreditoAcc.code,
        accountName: ivaCreditoAcc.name,
        debit: totalIva,
        credit: 0,
        gloss: `IVA Crédito Fiscal Recibido ${selectedPeriod}`
      });
    }

    // Exento (Debe)
    if (totalExento > 0) {
      lines.push({
        accountId: exentoAcc.id,
        accountCode: exentoAcc.code,
        accountName: exentoAcc.name,
        debit: totalExento,
        credit: 0,
        gloss: `Compras Exentas / Sin IVA ${selectedPeriod}`
      });
    }

    // Proveedores por Pagar (Haber)
    lines.push({
      accountId: supplierAcc.id,
      accountCode: supplierAcc.code,
      accountName: supplierAcc.name,
      debit: 0,
      credit: totalTotal,
      gloss: `Centralización Compras Proveedores ${selectedPeriod} (${docs.length} documentos)`
    });

    setPreviewVoucher({
      title: `Centralización de Compras del Período ${selectedPeriod}`,
      moduleKey: 'COMPRAS',
      period: selectedPeriod,
      type: 'Traspaso',
      date: `${selectedPeriod}-28`,
      gloss: `Centralización RCV Compras Período ${selectedPeriod} - ${docs.length} Facturas`,
      lines,
      documentCount: docs.length
    });
  };

  // Generar Previsualización Asiento de Sueldos y Remuneraciones
  const handlePreviewSueldos = () => {
    if (payrollAnalysis.slipsCount === 0) {
      notify.warning('No hay liquidaciones calculadas para este período.');
      return;
    }

    const expenseSueldos = resolveAccount(formData.salariesExpenseAccountId, ['4201001', '4.2.01', 'sueldo', 'remuneracion'], 'Gasto Sueldos Base y Gratificaciones');
    const expenseNoImponible = resolveAccount(formData.nonTaxableExpenseAccountId, ['4201002', 'colacion', 'movilizacion', 'no imponible'], 'Gasto Asignaciones No Imponibles');
    const expenseAportes = resolveAccount(formData.patronalContributionsExpenseAccountId, ['4201003', 'sis', 'mutual', 'afc empleador', 'aporte patronal'], 'Gasto Aportes Patronales');
    const pasivoSueldos = resolveAccount(formData.salariesPayableAccountId, ['2103001', '2103', 'sueldos por pagar', 'remuneraciones por pagar'], 'Sueldos por Pagar');
    const pasivoLeyesSociales = resolveAccount(formData.socialLawsPayableAccountId, ['2103002', 'previred', 'leyes sociales', 'imposiciones'], 'Leyes Sociales por Pagar (Previred)');
    const pasivoImpuestoUnico = resolveAccount(formData.uniqueTaxPayableAccountId, ['2104003', 'impuesto unico', 'segunda categoria'], 'Retención Impuesto Único 2da Cat.');

    const lines: VoucherLine[] = [];

    // Debe: Gastos
    if (payrollAnalysis.totalImponible > 0) {
      lines.push({
        accountId: expenseSueldos.id,
        accountCode: expenseSueldos.code,
        accountName: expenseSueldos.name,
        debit: payrollAnalysis.totalImponible,
        credit: 0,
        gloss: `Gasto Sueldos Imponibles ${selectedPeriod} (${payrollAnalysis.slipsCount} trabajadores)`
      });
    }

    if (payrollAnalysis.totalNoImponible > 0) {
      lines.push({
        accountId: expenseNoImponible.id,
        accountCode: expenseNoImponible.code,
        accountName: expenseNoImponible.name,
        debit: payrollAnalysis.totalNoImponible,
        credit: 0,
        gloss: `Gasto Asignaciones Colación/Movilización ${selectedPeriod}`
      });
    }

    if (payrollAnalysis.totalAportesPatronales > 0) {
      lines.push({
        accountId: expenseAportes.id,
        accountCode: expenseAportes.code,
        accountName: expenseAportes.name,
        debit: payrollAnalysis.totalAportesPatronales,
        credit: 0,
        gloss: `Gasto Aportes SIS, Mutual y AFC Empleador ${selectedPeriod}`
      });
    }

    // Haber: Pasivos por Pagar
    if (payrollAnalysis.totalLiquido > 0) {
      lines.push({
        accountId: pasivoSueldos.id,
        accountCode: pasivoSueldos.code,
        accountName: pasivoSueldos.name,
        debit: 0,
        credit: payrollAnalysis.totalLiquido,
        gloss: `Sueldos Líquidos por Pagar Nómina ${selectedPeriod}`
      });
    }

    if (payrollAnalysis.totalLeyesSociales > 0) {
      lines.push({
        accountId: pasivoLeyesSociales.id,
        accountCode: pasivoLeyesSociales.code,
        accountName: pasivoLeyesSociales.name,
        debit: 0,
        credit: payrollAnalysis.totalLeyesSociales,
        gloss: `Leyes Sociales por Pagar Previred ${selectedPeriod} (AFP, Salud, AFC, Mutual)`
      });
    }

    if (payrollAnalysis.totalImpuestoUnico > 0) {
      lines.push({
        accountId: pasivoImpuestoUnico.id,
        accountCode: pasivoImpuestoUnico.code,
        accountName: pasivoImpuestoUnico.name,
        debit: 0,
        credit: payrollAnalysis.totalImpuestoUnico,
        gloss: `Impuesto Único 2da Categoría por Enterar en F29 ${selectedPeriod}`
      });
    }

    setPreviewVoucher({
      title: `Centralización de Remuneraciones del Período ${selectedPeriod}`,
      moduleKey: 'REMUNERACIONES',
      period: selectedPeriod,
      type: 'Traspaso',
      date: `${selectedPeriod}-28`,
      gloss: `Centralización Mensual de Remuneraciones Período ${selectedPeriod} - ${payrollAnalysis.slipsCount} Colaboradores`,
      lines,
      documentCount: payrollAnalysis.slipsCount
    });
  };

  // Ejecutar grabación del asiento previsualizado en el Libro Diario
  const handleExecuteCentralization = async () => {
    if (!previewVoucher) return;

    if (checkIsPeriodClosed) {
      const check = checkIsPeriodClosed(previewVoucher.period);
      if (check.isClosed) {
        notify.error(`El período ${previewVoucher.period} está CERRADO. Abra el período para centralizar.`);
        return;
      }
    }

    // Validar partida doble
    const totalDebit = previewVoucher.lines.reduce((acc, l) => acc + (l.debit || 0), 0);
    const totalCredit = previewVoucher.lines.reduce((acc, l) => acc + (l.credit || 0), 0);

    if (Math.abs(totalDebit - totalCredit) > 1) {
      notify.error(`El asiento tiene un descuadre de $${Math.abs(totalDebit - totalCredit).toLocaleString('es-CL')}. Revise la parametrización de cuentas.`);
      return;
    }

    const nextVoucherNum = (vouchers.reduce((max, v) => Math.max(max, v.voucherNumber || 0), 0)) + 1;

    try {
      setIsExecutingCentralization(true);

      const newVoucherData = {
        voucherNumber: nextVoucherNum,
        date: previewVoucher.date,
        period: previewVoucher.period,
        type: previewVoucher.type,
        gloss: previewVoucher.gloss,
        origin: `CENTRALIZACION_${previewVoucher.moduleKey}`,
        creationMode: 'AUTOMATICO' as const,
        status: 'Valido' as const,
        totalDebit,
        totalCredit,
        lines: previewVoucher.lines
      };

      const createdId = await onCentralizeVoucher(newVoucherData);

      // Sincronizar documentos de origen (Capa 1 <-> Capa 2)
      if (previewVoucher.moduleKey === 'VENTAS' || previewVoucher.moduleKey === 'COMPRAS') {
        const targetType = previewVoucher.moduleKey === 'VENTAS' ? 'Venta' : 'Compra';
        const pendingDocsToUpdate = rcvDocuments.filter(d => d.period === previewVoucher.period && d.tipoRegistro === targetType && !d.estadoContabilizado);
        
        if (pendingDocsToUpdate.length > 0) {
          const companyDocRef = doc(db, 'studies', studyId, 'companies', company.id);
          const batch = writeBatch(db);
          pendingDocsToUpdate.forEach(d => {
            const dRef = doc(companyDocRef, 'rcvDocuments', d.id);
            batch.update(dRef, { estadoContabilizado: true, voucherId: createdId });
          });
          await batch.commit();
        }
      }

      logAuditEvent({
        userId: auth.currentUser?.uid || 'anon',
        userEmail: auth.currentUser?.email || '',
        studyId,
        companyId: company.id,
        action: 'CONTABILIZAR',
        module: 'COMPROBANTES',
        details: `Asiento de Centralización generado para módulo ${previewVoucher.moduleKey} en período ${previewVoucher.period}`,
        metadata: {
          voucherId: createdId,
          voucherNumber: nextVoucherNum,
          total: totalDebit
        }
      });

      notify.success(`¡Asiento de centralización #${nextVoucherNum} generado con éxito en el Libro Diario!`);
      setPreviewVoucher(null);
      await onRefreshData();
    } catch (err: any) {
      console.error('Error generating centralization voucher:', err);
      notify.error('Error al centralizar el comprobante: ' + err.message);
    } finally {
      setIsExecutingCentralization(false);
    }
  };

  // Reversar comprobante de centralización y desmarcar documentos (Capa 2 -> Capa 1)
  const handleReverseCentralization = async (voucher: Voucher) => {
    if (!voucher || !voucher.id) return;
    const confirmMsg = `¿Desea reversar el comprobante de centralización #${voucher.voucherNumber} (${voucher.origin || voucher.type})?\n\n` +
      `Esto anulará el asiento contable en el Libro Diario y desmarcará los documentos operativos asociados para que queden pendientes nuevamente.`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const companyDocRef = doc(db, 'studies', studyId, 'companies', company.id);
      
      // Anular voucher
      await updateDoc(doc(companyDocRef, 'vouchers', voucher.id), {
        status: 'Anulado',
        anuladoAt: new Date().toISOString(),
        anuladoReason: 'Reversión voluntaria de centralización'
      });

      // Resetear rcvDocuments asociados
      const linkedDocs = rcvDocuments.filter(d => d.voucherId === voucher.id || (d.period === voucher.period && d.estadoContabilizado));
      if (linkedDocs.length > 0) {
        const batch = writeBatch(db);
        linkedDocs.forEach(d => {
          const dRef = doc(companyDocRef, 'rcvDocuments', d.id);
          batch.update(dRef, { estadoContabilizado: false, voucherId: '' });
        });
        await batch.commit();
      }

      logAuditEvent({
        userId: auth.currentUser?.uid || 'anon',
        userEmail: auth.currentUser?.email || '',
        studyId,
        companyId: company.id,
        action: 'ANULAR',
        module: 'COMPROBANTES',
        details: `Reversión de asiento centralizador #${voucher.voucherNumber} en período ${voucher.period}`,
        metadata: { voucherId: voucher.id }
      });

      notify.success(`Asiento #${voucher.voucherNumber} reversado con éxito.`);
      await onRefreshData();
    } catch (e: any) {
      console.error('Error reversing centralization:', e);
      notify.error('Error al reversar: ' + e.message);
    }
  };

  // Guardar matriz de parametrización contable
  const handleSaveParamsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSavingParams(true);
      await onSaveMasterParams(formData);
      notify.success('Parametrización contable maestra guardada exitosamente.');
    } catch (err: any) {
      console.error('Error saving master params:', err);
      notify.error('Error al guardar la parametrización: ' + err.message);
    } finally {
      setIsSavingParams(false);
    }
  };

  return (
    <div className="bg-slate-100 min-h-screen p-4 md:p-6 space-y-6">
      {/* CABECERA ESTANDARIZADA DEL MODULO (CAPA 2) */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-700 text-white flex items-center justify-center shadow-md">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900">
                  Motor de Centralizaciones & Parametrización Contable
                </h1>
                <span className="px-2.5 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-full text-[11px] font-bold uppercase tracking-wider">
                  Capa 2 ERP
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Valida, traduce y centraliza los documentos operativos en Asientos Contables oficiales con estricto control de partida doble y divisas.
              </p>
            </div>
          </div>
        </div>

        {/* SELECTOR DE PERÍODO & ACCIONES RÁPIDAS */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto justify-between lg:justify-end">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 shadow-2xs">
            <Calendar className="w-4 h-4 text-indigo-600" />
            <span className="text-xs font-semibold text-slate-700">Período:</span>
            <input
              type="month"
              value={selectedPeriod}
              onChange={(e) => onChangePeriod(e.target.value)}
              className="text-xs font-bold text-slate-900 bg-transparent border-0 focus:ring-0 p-0 cursor-pointer"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onRefreshData()}
              className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold shadow-2xs flex items-center gap-1.5 transition-colors"
              title="Refrescar datos contables desde la nube"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
              <span>Actualizar</span>
            </button>
            {onNavigateToLibroDiario && (
              <button
                onClick={onNavigateToLibroDiario}
                className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-semibold shadow-2xs flex items-center gap-1.5 transition-colors"
              >
                <FileText className="w-3.5 h-3.5 text-indigo-600" />
                <span>Ver Libro Diario</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* PESTAÑAS PRINCIPALES ESTANDARIZADAS */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveMainTab('TABLERO')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
            activeMainTab === 'TABLERO'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Tablero de Centralizaciones ({selectedPeriod})</span>
        </button>

        <button
          onClick={() => setActiveMainTab('PARAMETRIZACION')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
            activeMainTab === 'PARAMETRIZACION'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Matriz de Parametrización Contable</span>
        </button>

        <button
          onClick={() => setActiveMainTab('AUDITORIA')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
            activeMainTab === 'AUDITORIA'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Auditoría de Cierre & Divisas</span>
        </button>
      </div>

      {/* ======================================================== */}
      {/* PESTAÑA 1: TABLERO DE CENTRALIZACIONES DEL PERIODO       */}
      {/* ======================================================== */}
      {activeMainTab === 'TABLERO' && (
        <div className="space-y-6">
          {/* BANNER INFORMATIVO DE ARQUITECTURA */}
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-4 rounded-2xl shadow-sm border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-indigo-300" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-indigo-200 uppercase tracking-wider">
                  Flujo de Centralización Periódica
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  Los módulos de la <strong>Capa 1</strong> alimentan este panel. El motor valida cuentas, cuadratura y divisas antes de registrar en el <strong>Libro Diario (Capa 3)</strong>.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono bg-slate-800/80 px-3.5 py-2 rounded-xl border border-slate-700/60">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Dólar Observado</span>
                <span className="text-emerald-400 font-bold">${currentExchangeRate.dolar?.toLocaleString('es-CL')}</span>
              </div>
              <div className="w-px h-6 bg-slate-700" />
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">UF Oficial</span>
                <span className="text-indigo-400 font-bold">${currentExchangeRate.uf?.toLocaleString('es-CL')}</span>
              </div>
            </div>
          </div>

          {/* GRID DE MODULOS OPERATIVOS (CAPA 1 -> CAPA 2) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* 1. VENTAS & EXPORTACIONES */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between hover:border-indigo-300 transition-all">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <TrendingUp className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Ventas & Facturación</h3>
                      <span className="text-[11px] text-slate-500">Módulo Operativo 1</span>
                    </div>
                  </div>
                  {salesAnalysis.totalDocs === 0 ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500">Sin Movimientos</span>
                  ) : salesAnalysis.isCentralized ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Centralizado
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {salesAnalysis.pendingDocs} Pendientes
                    </span>
                  )}
                </div>

                <div className="space-y-1.5 my-4 pt-3 border-t border-slate-100 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Documentos del Período:</span>
                    <span className="font-semibold text-slate-900">{salesAnalysis.totalDocs} docs</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Ventas Netas:</span>
                    <span className="font-semibold text-slate-900">${salesAnalysis.totalNeto.toLocaleString('es-CL')}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>IVA Débito Fiscal:</span>
                    <span className="font-semibold text-indigo-700">${salesAnalysis.totalIva.toLocaleString('es-CL')}</span>
                  </div>
                  <div className="flex justify-between text-slate-900 font-bold pt-1 border-t border-slate-100">
                    <span>Total Facturado:</span>
                    <span className="text-emerald-700">${salesAnalysis.totalMonto.toLocaleString('es-CL')}</span>
                  </div>
                </div>

                {salesAnalysis.foreignCount > 0 && (
                  <div className="mb-3 p-2 bg-blue-50/70 border border-blue-200 rounded-lg text-[11px] text-blue-800 flex items-center justify-between">
                    <span>🌐 {salesAnalysis.foreignCount} docs en Divisas (USD/UF)</span>
                    <span className="font-bold text-blue-900">Tipo de cambio OK</span>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                <button
                  onClick={handlePreviewVentas}
                  disabled={salesAnalysis.totalDocs === 0}
                  className="flex-1 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Previsualizar Asiento</span>
                </button>
              </div>
            </div>

            {/* 2. COMPRAS & PROVEEDORES */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between hover:border-indigo-300 transition-all">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Compras & Proveedores</h3>
                      <span className="text-[11px] text-slate-500">Módulo Operativo 2</span>
                    </div>
                  </div>
                  {purchasesAnalysis.totalDocs === 0 ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500">Sin Movimientos</span>
                  ) : purchasesAnalysis.isCentralized ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Centralizado
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {purchasesAnalysis.pendingDocs} Pendientes
                    </span>
                  )}
                </div>

                <div className="space-y-1.5 my-4 pt-3 border-t border-slate-100 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Facturas del Período:</span>
                    <span className="font-semibold text-slate-900">{purchasesAnalysis.totalDocs} docs</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Gasto / Costo Neto:</span>
                    <span className="font-semibold text-slate-900">${purchasesAnalysis.totalNeto.toLocaleString('es-CL')}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>IVA Crédito Fiscal:</span>
                    <span className="font-semibold text-indigo-700">${purchasesAnalysis.totalIva.toLocaleString('es-CL')}</span>
                  </div>
                  <div className="flex justify-between text-slate-900 font-bold pt-1 border-t border-slate-100">
                    <span>Total Compras:</span>
                    <span className="text-indigo-900">${purchasesAnalysis.totalMonto.toLocaleString('es-CL')}</span>
                  </div>
                </div>

                {purchasesAnalysis.foreignCount > 0 && (
                  <div className="mb-3 p-2 bg-blue-50/70 border border-blue-200 rounded-lg text-[11px] text-blue-800 flex items-center justify-between">
                    <span>🌐 {purchasesAnalysis.foreignCount} docs en Divisas (USD/UF)</span>
                    <span className="font-bold text-blue-900">Validado</span>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                <button
                  onClick={handlePreviewCompras}
                  disabled={purchasesAnalysis.totalDocs === 0}
                  className="flex-1 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Previsualizar Asiento</span>
                </button>
              </div>
            </div>

            {/* 3. REMUNERACIONES & RRHH */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between hover:border-indigo-300 transition-all">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                      <Users className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Remuneraciones (RRHH)</h3>
                      <span className="text-[11px] text-slate-500">Módulo Operativo 4</span>
                    </div>
                  </div>
                  {payrollAnalysis.slipsCount === 0 ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500">Sin Nómina</span>
                  ) : payrollAnalysis.isCentralized ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Centralizado
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> Por Centralizar
                    </span>
                  )}
                </div>

                <div className="space-y-1.5 my-4 pt-3 border-t border-slate-100 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Trabajadores Liquidados:</span>
                    <span className="font-semibold text-slate-900">{payrollAnalysis.slipsCount} contratos</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Gasto Sueldos Imponibles:</span>
                    <span className="font-semibold text-slate-900">${payrollAnalysis.totalImponible.toLocaleString('es-CL')}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Leyes Sociales (Previred):</span>
                    <span className="font-semibold text-indigo-700">${payrollAnalysis.totalLeyesSociales.toLocaleString('es-CL')}</span>
                  </div>
                  <div className="flex justify-between text-slate-900 font-bold pt-1 border-t border-slate-100">
                    <span>Líquido a Pagar Personal:</span>
                    <span className="text-blue-900">${payrollAnalysis.totalLiquido.toLocaleString('es-CL')}</span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                <button
                  onClick={handlePreviewSueldos}
                  disabled={payrollAnalysis.slipsCount === 0}
                  className="flex-1 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Previsualizar Asiento</span>
                </button>
              </div>
            </div>

            {/* 4. ACTIVO FIJO & DEPRECIACIÓN */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between hover:border-indigo-300 transition-all">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Activo Fijo & Depreciación</h3>
                      <span className="text-[11px] text-slate-500">Módulo Operativo 7</span>
                    </div>
                  </div>
                  {fixedAssetAnalysis.isCentralized ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Centralizado
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                      Ejercicio en curso
                    </span>
                  )}
                </div>

                <div className="space-y-1.5 my-4 pt-3 border-t border-slate-100 text-xs">
                  <p className="text-slate-500 text-xs leading-relaxed">
                    Gestiona fichas de activos, cálculo de depreciación tributaria lineal/acelerada y financiera bajo norma IFRS.
                  </p>
                  <div className="pt-2 text-indigo-700 font-semibold text-xs flex items-center gap-1.5">
                    <span>✓ Cuenta Gasto y Dep. Acumulada parametrizadas</span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                {onNavigateToModule && (
                  <button
                    onClick={() => onNavigateToModule('activoFijo')}
                    className="flex-1 px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <span>Ir a Fichas de Activo Fijo</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* 5. TESORERIA & CONCILIACION BANCARIA */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between hover:border-indigo-300 transition-all">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-cyan-50 text-cyan-600 flex items-center justify-center">
                      <CreditCard className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Tesorería & Conciliación</h3>
                      <span className="text-[11px] text-slate-500">Módulo Operativo 6</span>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-50 text-cyan-700 border border-cyan-200">
                    Bancos OK
                  </span>
                </div>

                <div className="space-y-1.5 my-4 pt-3 border-t border-slate-100 text-xs">
                  <p className="text-slate-500 text-xs leading-relaxed">
                    Cartola bancaria electrónica, calce inteligente con comprobantes de egreso/ingreso y control de diferencias de cambio.
                  </p>
                  <div className="pt-2 text-slate-700 font-semibold text-xs flex items-center gap-1.5">
                    <span>🏦 Banco principal:</span>
                    <span className="font-mono text-indigo-700">{getAccountDisplay(formData.primaryBankAccountId, '1101001')}</span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                {onNavigateToModule && (
                  <button
                    onClick={() => onNavigateToModule('conciliacionBancaria')}
                    className="flex-1 px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <span>Ir a Conciliación Bancaria</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* 6. HONORARIOS BHE */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between hover:border-indigo-300 transition-all">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                      <FileSpreadsheet className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Honorarios (BHE)</h3>
                      <span className="text-[11px] text-slate-500">Boletas 2da Categoría</span>
                    </div>
                  </div>
                  {honorariosAnalysis.totalDocs === 0 ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500">Sin Boletas</span>
                  ) : honorariosAnalysis.isCentralized ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">Centralizado</span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                      {honorariosAnalysis.pendingDocs} Pendientes
                    </span>
                  )}
                </div>

                <div className="space-y-1.5 my-4 pt-3 border-t border-slate-100 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Boletas Recibidas:</span>
                    <span className="font-semibold text-slate-900">{honorariosAnalysis.totalDocs} docs</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Retención Ley (13.75% / 14.5%):</span>
                    <span className="font-semibold text-rose-700">${honorariosAnalysis.totalRetencion.toLocaleString('es-CL')}</span>
                  </div>
                  <div className="flex justify-between text-slate-900 font-bold pt-1 border-t border-slate-100">
                    <span>Honorario Líquido por Pagar:</span>
                    <span className="text-indigo-900">${honorariosAnalysis.totalLiquido.toLocaleString('es-CL')}</span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                <button
                  onClick={() => {
                    notify.info('Las boletas de honorarios se centralizan conjuntamente con el RCV o nóminas.');
                  }}
                  className="flex-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Info className="w-3.5 h-3.5" />
                  <span>Detalle de Honorarios</span>
                </button>
              </div>
            </div>
          </div>

          {/* HISTORIAL OFICIAL DE ASIENTOS CENTRALIZADOS DEL MES (CAPA 3) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Comprobantes Centralizados en el Libro Diario ({selectedPeriod})
                </h3>
              </div>
              <span className="text-xs font-semibold text-slate-500">
                Total Registros: {periodCentralizedVouchers.length}
              </span>
            </div>

            {periodCentralizedVouchers.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300">
                <Layers className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-700">No hay comprobantes centralizados para este período todavía</p>
                <p className="text-xs text-slate-500 mt-1">
                  Utiliza los botones de previsualización superior para validar y generar los asientos oficiales del mes.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border border-slate-200 rounded-xl overflow-hidden">
                  <thead className="bg-slate-50 text-slate-600 uppercase font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3">N° Folio</th>
                      <th className="p-3">Fecha</th>
                      <th className="p-3">Tipo</th>
                      <th className="p-3">Módulo Origen</th>
                      <th className="p-3">Glosa del Asiento</th>
                      <th className="p-3 text-right">Total Débito ($)</th>
                      <th className="p-3 text-right">Total Crédito ($)</th>
                      <th className="p-3 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {periodCentralizedVouchers.map((v) => (
                      <tr key={v.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 font-mono font-bold text-indigo-700">#{v.voucherNumber}</td>
                        <td className="p-3 text-slate-800">{v.date}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
                            {v.type}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 uppercase">
                            {v.origin || 'RCV'}
                          </span>
                        </td>
                        <td className="p-3 text-slate-700 max-w-xs truncate" title={v.gloss}>
                          {v.gloss}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-slate-900">
                          ${v.totalDebit.toLocaleString('es-CL')}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-slate-900">
                          ${v.totalCredit.toLocaleString('es-CL')}
                        </td>
                        <td className="p-3 text-center">
                          {onNavigateToVoucher && (
                            <button
                              onClick={() => onNavigateToVoucher(v.id)}
                              className="px-2.5 py-1 text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg shadow-2xs transition-colors"
                            >
                              Ver Asiento
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* PESTAÑA 2: MATRIZ MAESTRA DE PARAMETRIZACION CONTABLE     */}
      {/* ======================================================== */}
      {activeMainTab === 'PARAMETRIZACION' && (
        <form onSubmit={handleSaveParamsSubmit} className="space-y-6">
          {/* BARRA DE FILTRO POR SUBSECCION */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-600 mr-2">Filtrar Módulo:</span>
              {(['ALL', 'VENTAS', 'COMPRAS', 'REMUNERACIONES', 'ACTIVO_FIJO', 'TESORERIA', 'RENDICIONES'] as const).map(sec => (
                <button
                  type="button"
                  key={sec}
                  onClick={() => setActiveParamSection(sec)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeParamSection === sec
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  {sec === 'ALL' ? 'Todos los Módulos' : sec}
                </button>
              ))}
            </div>

            <button
              type="submit"
              disabled={isSavingParams}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{isSavingParams ? 'Guardando Parámetros...' : 'Guardar Parametrización Maestra'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* SECCIÓN 1: VENTAS & CLIENTES (NACIONAL Y EXTERIOR) */}
            {(activeParamSection === 'ALL' || activeParamSection === 'VENTAS') && (
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
                  <h3 className="text-xs font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                    <span>Módulo de Ventas & Facturación</span>
                  </h3>
                  <span className="text-[11px] text-slate-400">Cuentas por Cobrar & Ganancias</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cuenta Clientes Nacionales (Por Cobrar)
                  </label>
                  <SearchableAccountSelect
                    accounts={accounts}
                    valueAccountId={formData.defaultCustomerAccountId || ''}
                    onSelectAccount={(acc) => setFormData(prev => ({ ...prev, defaultCustomerAccountId: acc.id }))}
                    placeholder="[1104001] Clientes Nacionales..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cuenta Clientes Extranjeros / Exportaciones (USD)
                  </label>
                  <SearchableAccountSelect
                    accounts={accounts}
                    valueAccountId={formData.foreignCustomerAccountId || ''}
                    onSelectAccount={(acc) => setFormData(prev => ({ ...prev, foreignCustomerAccountId: acc.id }))}
                    placeholder="[1104002] Facturas por Emitir USD / Clientes Exterior..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cuenta Ingreso por Ventas Nacionales
                  </label>
                  <SearchableAccountSelect
                    accounts={accounts}
                    valueAccountId={formData.defaultSalesIncomeAccountId || ''}
                    onSelectAccount={(acc) => setFormData(prev => ({ ...prev, defaultSalesIncomeAccountId: acc.id }))}
                    placeholder="[5101001] Ingresos por Ventas..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cuenta Ventas Exportación (Moneda Extranjera USD)
                  </label>
                  <SearchableAccountSelect
                    accounts={accounts}
                    valueAccountId={formData.exportSalesIncomeAccountId || ''}
                    onSelectAccount={(acc) => setFormData(prev => ({ ...prev, exportSalesIncomeAccountId: acc.id }))}
                    placeholder="[5101002] Ventas al Exterior / Exportaciones..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cuenta IVA Débito Fiscal (19%)
                  </label>
                  <SearchableAccountSelect
                    accounts={accounts}
                    valueAccountId={formData.ivaDebitoAccountId || ''}
                    onSelectAccount={(acc) => setFormData(prev => ({ ...prev, ivaDebitoAccountId: acc.id }))}
                    placeholder="[2104001] IVA Débito Fiscal..."
                  />
                </div>
              </div>
            )}

            {/* SECCIÓN 2: COMPRAS & PROVEEDORES (NACIONAL Y EXTERIOR) */}
            {(activeParamSection === 'ALL' || activeParamSection === 'COMPRAS') && (
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
                  <h3 className="text-xs font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-2">
                    <FileText className="w-4 h-4 text-indigo-600" />
                    <span>Módulo de Compras & Proveedores</span>
                  </h3>
                  <span className="text-[11px] text-slate-400">Cuentas por Pagar & Gastos</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cuenta Proveedores Nacionales (Por Pagar)
                  </label>
                  <SearchableAccountSelect
                    accounts={accounts}
                    valueAccountId={formData.defaultSupplierAccountId || ''}
                    onSelectAccount={(acc) => setFormData(prev => ({ ...prev, defaultSupplierAccountId: acc.id }))}
                    placeholder="[2102001] Proveedores Nacionales..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cuenta Proveedores Extranjeros / Importación (USD)
                  </label>
                  <SearchableAccountSelect
                    accounts={accounts}
                    valueAccountId={formData.foreignSupplierAccountId || ''}
                    onSelectAccount={(acc) => setFormData(prev => ({ ...prev, foreignSupplierAccountId: acc.id }))}
                    placeholder="[2102002] Proveedores del Exterior USD..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cuenta de Gasto o Costo Operacional por Defecto
                  </label>
                  <SearchableAccountSelect
                    accounts={accounts}
                    valueAccountId={formData.defaultCostOrExpenseAccountId || ''}
                    onSelectAccount={(acc) => setFormData(prev => ({ ...prev, defaultCostOrExpenseAccountId: acc.id }))}
                    placeholder="[4202002] Gastos Generales y de Administración..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cuenta IVA Crédito Fiscal (19%)
                  </label>
                  <SearchableAccountSelect
                    accounts={accounts}
                    valueAccountId={formData.ivaCreditoAccountId || ''}
                    onSelectAccount={(acc) => setFormData(prev => ({ ...prev, ivaCreditoAccountId: acc.id }))}
                    placeholder="[1106001] IVA Crédito Fiscal..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cuenta Compras Exentas / No Gravadas
                  </label>
                  <SearchableAccountSelect
                    accounts={accounts}
                    valueAccountId={formData.exentoAccountId || ''}
                    onSelectAccount={(acc) => setFormData(prev => ({ ...prev, exentoAccountId: acc.id }))}
                    placeholder="[4202002] Gastos Exentos..."
                  />
                </div>
              </div>
            )}

            {/* SECCIÓN 3: REMUNERACIONES & LEYES SOCIALES (RRHH) */}
            {(activeParamSection === 'ALL' || activeParamSection === 'REMUNERACIONES') && (
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
                  <h3 className="text-xs font-bold text-blue-900 uppercase tracking-wider flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-600" />
                    <span>Módulo de Remuneraciones & RRHH</span>
                  </h3>
                  <span className="text-[11px] text-slate-400">Centralización Mensual de Sueldos</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cuenta Gasto: Sueldos Base y Gratificaciones (Imponible)
                  </label>
                  <SearchableAccountSelect
                    accounts={accounts}
                    valueAccountId={formData.salariesExpenseAccountId || ''}
                    onSelectAccount={(acc) => setFormData(prev => ({ ...prev, salariesExpenseAccountId: acc.id }))}
                    placeholder="[4201001] Sueldos y Gratificaciones..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cuenta Gasto: Asignaciones No Imponibles (Colación / Movilización)
                  </label>
                  <SearchableAccountSelect
                    accounts={accounts}
                    valueAccountId={formData.nonTaxableExpenseAccountId || ''}
                    onSelectAccount={(acc) => setFormData(prev => ({ ...prev, nonTaxableExpenseAccountId: acc.id }))}
                    placeholder="[4201002] Asignación Colación y Movilización..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cuenta Gasto: Aportes Patronales (SIS, Mutual, AFC Empleador)
                  </label>
                  <SearchableAccountSelect
                    accounts={accounts}
                    valueAccountId={formData.patronalContributionsExpenseAccountId || ''}
                    onSelectAccount={(acc) => setFormData(prev => ({ ...prev, patronalContributionsExpenseAccountId: acc.id }))}
                    placeholder="[4201003] Aportes Patronales e Imposiciones..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cuenta Pasivo: Sueldos por Pagar (Líquido del Personal)
                  </label>
                  <SearchableAccountSelect
                    accounts={accounts}
                    valueAccountId={formData.salariesPayableAccountId || ''}
                    onSelectAccount={(acc) => setFormData(prev => ({ ...prev, salariesPayableAccountId: acc.id }))}
                    placeholder="[2103001] Sueldos por Pagar..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cuenta Pasivo: Leyes Sociales por Pagar (Previred: AFP, Salud, AFC, Mutual)
                  </label>
                  <SearchableAccountSelect
                    accounts={accounts}
                    valueAccountId={formData.socialLawsPayableAccountId || ''}
                    onSelectAccount={(acc) => setFormData(prev => ({ ...prev, socialLawsPayableAccountId: acc.id }))}
                    placeholder="[2103002] Imposiciones por Pagar / Previred..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cuenta Pasivo: Retención Impuesto Único 2da Categoría (F29)
                  </label>
                  <SearchableAccountSelect
                    accounts={accounts}
                    valueAccountId={formData.uniqueTaxPayableAccountId || ''}
                    onSelectAccount={(acc) => setFormData(prev => ({ ...prev, uniqueTaxPayableAccountId: acc.id }))}
                    placeholder="[2104003] Impuesto Único por Pagar..."
                  />
                </div>
              </div>
            )}

            {/* SECCIÓN 4: ACTIVO FIJO & DEPRECIACIONES */}
            {(activeParamSection === 'ALL' || activeParamSection === 'ACTIVO_FIJO') && (
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
                  <h3 className="text-xs font-bold text-purple-900 uppercase tracking-wider flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-purple-600" />
                    <span>Módulo de Activo Fijo & Depreciación</span>
                  </h3>
                  <span className="text-[11px] text-slate-400">Bienes de Uso & Desgaste</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cuenta Gasto: Depreciación del Ejercicio (Tributaria / IFRS)
                  </label>
                  <SearchableAccountSelect
                    accounts={accounts}
                    valueAccountId={formData.depreciationExpenseAccountId || ''}
                    onSelectAccount={(acc) => setFormData(prev => ({ ...prev, depreciationExpenseAccountId: acc.id }))}
                    placeholder="[4203001] Depreciación del Ejercicio..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cuenta Activo Complementario: Depreciación Acumulada
                  </label>
                  <SearchableAccountSelect
                    accounts={accounts}
                    valueAccountId={formData.accumulatedDepreciationAccountId || ''}
                    onSelectAccount={(acc) => setFormData(prev => ({ ...prev, accumulatedDepreciationAccountId: acc.id }))}
                    placeholder="[1209001] Depreciación Acumulada Activo Fijo..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cuenta Corrección Monetaria / Reajuste IPC (Resultado)
                  </label>
                  <SearchableAccountSelect
                    accounts={accounts}
                    valueAccountId={formData.monetaryCorrectionAccountId || ''}
                    onSelectAccount={(acc) => setFormData(prev => ({ ...prev, monetaryCorrectionAccountId: acc.id }))}
                    placeholder="[5201001] Corrección Monetaria..."
                  />
                </div>
              </div>
            )}

            {/* SECCIÓN 5: TESORERIA & DIFERENCIA DE CAMBIO */}
            {(activeParamSection === 'ALL' || activeParamSection === 'TESORERIA') && (
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
                  <h3 className="text-xs font-bold text-cyan-900 uppercase tracking-wider flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-cyan-600" />
                    <span>Módulo de Tesorería, Bancos & Divisas</span>
                  </h3>
                  <span className="text-[11px] text-slate-400">Flujos & Diferencias de Tipo de Cambio</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cuenta Banco Operativo Principal
                  </label>
                  <SearchableAccountSelect
                    accounts={accounts}
                    valueAccountId={formData.primaryBankAccountId || ''}
                    onSelectAccount={(acc) => setFormData(prev => ({ ...prev, primaryBankAccountId: acc.id }))}
                    placeholder="[1101001] Banco Cuenta Corriente..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cuenta Ganancia por Diferencia de Cambio (Resultado +)
                  </label>
                  <SearchableAccountSelect
                    accounts={accounts}
                    valueAccountId={formData.exchangeGainAccountId || ''}
                    onSelectAccount={(acc) => setFormData(prev => ({ ...prev, exchangeGainAccountId: acc.id }))}
                    placeholder="[5202001] Ganancia por Diferencia de Cambio..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cuenta Pérdida por Diferencia de Cambio (Resultado -)
                  </label>
                  <SearchableAccountSelect
                    accounts={accounts}
                    valueAccountId={formData.exchangeLossAccountId || ''}
                    onSelectAccount={(acc) => setFormData(prev => ({ ...prev, exchangeLossAccountId: acc.id }))}
                    placeholder="[4204001] Pérdida por Diferencia de Cambio..."
                  />
                </div>
              </div>
            )}

            {/* SECCIÓN 6: RENDICIONES DE GASTOS & INVENTARIOS */}
            {(activeParamSection === 'ALL' || activeParamSection === 'RENDICIONES') && (
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
                  <h3 className="text-xs font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-2">
                    <Layers className="w-4 h-4 text-emerald-600" />
                    <span>Módulo de Rendiciones de Gastos & Existencias</span>
                  </h3>
                  <span className="text-[11px] text-slate-400">Viáticos, Fondos por Rendir & Costo Ventas</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cuenta Anticipos / Fondos por Rendir (Activo)
                  </label>
                  <SearchableAccountSelect
                    accounts={accounts}
                    valueAccountId={formData.fondosPorRendirAccountId || ''}
                    onSelectAccount={(acc) => setFormData(prev => ({ ...prev, fondosPorRendirAccountId: acc.id }))}
                    placeholder="[1105001] Anticipos al Personal / Fondos a Rendir..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cuenta Gastos Menores y Viáticos por Defecto (Gasto)
                  </label>
                  <SearchableAccountSelect
                    accounts={accounts}
                    valueAccountId={formData.gastosMenoresAccountId || ''}
                    onSelectAccount={(acc) => setFormData(prev => ({ ...prev, gastosMenoresAccountId: acc.id }))}
                    placeholder="[4201001] Gastos Menores y Alimentación..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cuenta Costo de Ventas (Gasto / Costo)
                  </label>
                  <SearchableAccountSelect
                    accounts={accounts}
                    valueAccountId={formData.costoVentasAccountId || ''}
                    onSelectAccount={(acc) => setFormData(prev => ({ ...prev, costoVentasAccountId: acc.id }))}
                    placeholder="[5101001] Costo de Ventas Mercaderías..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cuenta Existencias / Mercaderías en Bodega (Activo)
                  </label>
                  <SearchableAccountSelect
                    accounts={accounts}
                    valueAccountId={formData.inventarioAccountId || ''}
                    onSelectAccount={(acc) => setFormData(prev => ({ ...prev, inventarioAccountId: acc.id }))}
                    placeholder="[1106001] Existencias y Mercaderías en Bodega..."
                  />
                </div>
              </div>
            )}
          </div>

          {/* BOTON GUARDAR INFERIOR */}
          <div className="flex justify-end pt-4">
            <button
              type="submit"
              disabled={isSavingParams}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{isSavingParams ? 'Guardando Parámetros...' : 'Guardar Parametrización Maestra'}</span>
            </button>
          </div>
        </form>
      )}

      {/* ======================================================== */}
      {/* PESTAÑA 3: AUDITORIA PRE-CIERRE & CONTROL DE DIVISAS      */}
      {/* ======================================================== */}
      {activeMainTab === 'AUDITORIA' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          <div className="border-b border-slate-200 pb-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-600" />
              <span>Semáforo de Auditoría y Consistencia Pre-Cierre ({selectedPeriod})</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Verifica que todas las operaciones del mes cumplan las reglas contables oficiales antes de cerrar el período contable.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Checklist 1: Partida Doble */}
            <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-2">
              <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs uppercase tracking-wider">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>1. Partida Doble</span>
              </div>
              <p className="text-xs text-slate-600">
                Todos los comprobantes del período mantienen estricta cuadratura entre débitos y créditos.
              </p>
              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                100% Cuadrado
              </span>
            </div>

            {/* Checklist 2: Moneda Extranjera */}
            <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/50 space-y-2">
              <div className="flex items-center gap-2 text-indigo-800 font-bold text-xs uppercase tracking-wider">
                <DollarSign className="w-4 h-4 text-indigo-600" />
                <span>2. Dólar y Divisas</span>
              </div>
              <p className="text-xs text-slate-600">
                Tipo de cambio oficial Banco Central para {selectedPeriod}: <strong>${currentExchangeRate.dolar} CLP</strong>.
              </p>
              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800">
                Tasa Observada Aplicada
              </span>
            </div>

            {/* Checklist 3: Conciliación Bancaria */}
            <div className="p-4 rounded-xl border border-cyan-200 bg-cyan-50/50 space-y-2">
              <div className="flex items-center gap-2 text-cyan-800 font-bold text-xs uppercase tracking-wider">
                <CreditCard className="w-4 h-4 text-cyan-600" />
                <span>3. Estado Bancario</span>
              </div>
              <p className="text-xs text-slate-600">
                Banco operativo activo con saldo inicial y cartola electrónica en sincronía.
              </p>
              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-100 text-cyan-800">
                Conciliación Activa
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL ESTANDARIZADO DE PREVISUALIZACION DE ASIENTO       */}
      {/* ======================================================== */}
      {previewVoucher && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Cabecera del Asiento */}
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <Layers className="w-5 h-5 text-indigo-400" />
                <div>
                  <h3 className="font-bold text-sm">{previewVoucher.title}</h3>
                  <span className="text-[11px] text-slate-400">
                    Tipo: {previewVoucher.type} • Período: {previewVoucher.period} • Fecha: {previewVoucher.date}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewVoucher(null)}
                className="text-slate-400 hover:text-white text-lg font-bold px-2 py-0.5 rounded hover:bg-slate-800 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Glosa y Contenido */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-2 text-xs">
              <div>
                <span className="font-bold text-slate-700">Glosa General:</span>{' '}
                <span className="text-slate-900 font-medium">{previewVoucher.gloss}</span>
              </div>
              <span className="px-2.5 py-1 rounded bg-indigo-50 border border-indigo-200 text-indigo-800 font-bold shrink-0">
                {previewVoucher.documentCount} Documentos Integrados
              </span>
            </div>

            {/* Tabla Detallada del Asiento Contable */}
            <div className="flex-1 overflow-auto p-4">
              <table className="w-full text-left text-xs border border-slate-200 rounded-lg overflow-hidden">
                <thead className="bg-slate-100 text-slate-700 uppercase font-bold sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">N°</th>
                    <th className="p-2.5">Código Cuenta</th>
                    <th className="p-2.5">Nombre Cuenta Contable</th>
                    <th className="p-2.5">Glosa de la Línea</th>
                    <th className="p-2.5 text-right">Débito ($)</th>
                    <th className="p-2.5 text-right">Crédito ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono text-xs">
                  {previewVoucher.lines.map((line, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="p-2.5 text-slate-400 font-bold">{idx + 1}</td>
                      <td className="p-2.5 text-indigo-900 font-bold">{line.accountCode}</td>
                      <td className="p-2.5 font-sans font-semibold text-slate-900">{line.accountName}</td>
                      <td className="p-2.5 font-sans text-slate-600 text-[11px] max-w-xs truncate">{line.gloss}</td>
                      <td className="p-2.5 text-right font-bold text-slate-900">
                        {line.debit > 0 ? `$${line.debit.toLocaleString('es-CL')}` : '-'}
                      </td>
                      <td className="p-2.5 text-right font-bold text-slate-900">
                        {line.credit > 0 ? `$${line.credit.toLocaleString('es-CL')}` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300 text-xs">
                  <tr>
                    <td colSpan={4} className="p-3 text-right uppercase text-slate-700 font-sans">
                      Totales del Asiento Contable:
                    </td>
                    <td className="p-3 text-right font-mono text-indigo-950 text-sm">
                      ${previewVoucher.lines.reduce((acc, l) => acc + (l.debit || 0), 0).toLocaleString('es-CL')}
                    </td>
                    <td className="p-3 text-right font-mono text-indigo-950 text-sm">
                      ${previewVoucher.lines.reduce((acc, l) => acc + (l.credit || 0), 0).toLocaleString('es-CL')}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Barra de Validación de Cuadratura */}
            {(() => {
              const debit = previewVoucher.lines.reduce((acc, l) => acc + (l.debit || 0), 0);
              const credit = previewVoucher.lines.reduce((acc, l) => acc + (l.credit || 0), 0);
              const isBalanced = Math.abs(debit - credit) <= 1;

              return (
                <div className={`p-3 border-t text-xs flex items-center justify-between ${
                  isBalanced ? 'bg-emerald-50 text-emerald-900 border-emerald-200' : 'bg-rose-50 text-rose-900 border-rose-200'
                }`}>
                  <div className="flex items-center gap-2">
                    {isBalanced ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span className="font-bold">Partida Doble Perfecta: Débitos y Créditos cuadrados ($0 diferencia).</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4 text-rose-600" />
                        <span className="font-bold">Descuadre detectado: Diferencia de ${Math.abs(debit - credit).toLocaleString('es-CL')}.</span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPreviewVoucher(null)}
                      className="px-4 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-bold rounded-lg border border-slate-300 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleExecuteCentralization}
                      disabled={!isBalanced || isExecutingCentralization}
                      className="px-5 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                      <span>{isExecutingCentralization ? 'Generando Asiento...' : 'Confirmar y Centralizar en Libro Diario'}</span>
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};
