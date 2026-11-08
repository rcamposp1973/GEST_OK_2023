import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db, auth } from '../lib/firebase';
import {
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc
} from 'firebase/firestore';
import {
  Company,
  ChartOfAccount,
  Voucher,
  FiscalPeriodYear,
  Auxiliary,
  RCVDocument,
  AccountMatch,
  MatchedLineRef,
  SavedAccountingQuery
} from '../types';
import { notify } from '../context/ToastContext';
import * as XLSX from 'xlsx';
import {
  Search,
  Download,
  Printer,
  Save,
  Trash2,
  FolderOpen,
  Calendar,
  CheckCircle2,
  RefreshCw,
  Check,
  X,
  FileSpreadsheet,
  Layers,
  Table as TableIcon,
  Users,
  CreditCard,
  TrendingUp,
  TrendingDown,
  Building2,
  Copy,
  ChevronDown,
  ChevronRight,
  Filter,
  ArrowRightLeft,
  DollarSign,
  PieChart
} from 'lucide-react';

export interface PlanillaRow {
  id: string;
  rowNumber: number;
  date: string;
  period?: string;
  voucherNumber?: number | string;
  voucherId?: string;
  voucherType?: string;
  docType?: string;
  folio?: number | string;
  accountCode: string;
  accountName: string;
  auxiliaryRut?: string;
  auxiliaryName?: string;
  costCenter?: string;
  expenseItem?: string;
  gloss: string;
  documentRef?: string;
  debit: number;
  credit: number;
  runningBalance: number;
  status: 'PENDIENTE' | 'COMPENSADO' | 'PAGADA' | 'EMITIDA' | 'CONCILIADO';
  matchId?: string;
  sourceRecord?: any;
}

interface PlanillaConsultasDinamicasViewProps {
  studyId: string;
  company: Company;
  accounts: ChartOfAccount[];
  vouchers: Voucher[];
  fiscalYears: FiscalPeriodYear[];
  auxiliaries?: Auxiliary[];
  rcvDocuments?: RCVDocument[];
  costCenters?: any[];
  expenseItems?: any[];
  projects?: any[];
  products?: any[];
  companies?: Company[];
  onVouchersUpdated?: () => void;
  onOpenVoucher?: (voucherRef: Voucher | string | number) => void;
  initialAccountCode?: string;
  onBackToTraditionalAnalysis?: () => void;
}

// Plantillas de fábrica estándar listas para usar
const FACTORY_TEMPLATES: SavedAccountingQuery[] = [
  {
    id: 'tpl_mayor_1101001',
    name: 'Mayor Cuenta 1101001 (Bancos / Caja) al 30-04-2026',
    description: 'Movimientos del Libro Mayor y saldo acumulado al 30 de abril de 2026.',
    sourceType: 'MAYOR',
    accountCode: '1101001',
    cutoffDate: '2026-04-30',
    statusFilter: 'TODOS',
    viewMode: 'DETALLE',
    isPredefined: true
  },
  {
    id: 'tpl_prov_pendientes',
    name: 'Facturas de Proveedores Pendientes a Hoy',
    description: 'Lista todas las facturas y documentos de compras por pagar a la fecha actual.',
    sourceType: 'PROVEEDORES_RCV',
    cutoffDate: 'HOY',
    statusFilter: 'PENDIENTES',
    viewMode: 'DETALLE',
    isPredefined: true
  },
  {
    id: 'tpl_clientes_pendientes',
    name: 'Facturas de Clientes Pendientes de Cobro',
    description: 'Documentos de venta emitidos con saldo pendiente de cobranza a hoy.',
    sourceType: 'CLIENTES_RCV',
    cutoffDate: 'HOY',
    statusFilter: 'PENDIENTES',
    viewMode: 'DETALLE',
    isPredefined: true
  },
  {
    id: 'tpl_nomina_pagos',
    name: 'Nómina de Pagos: Proveedores Pendientes a Hoy',
    description: 'Generación de nómina de transferencias bancarias masivas a proveedores.',
    sourceType: 'NOMINA_PAGO',
    cutoffDate: 'HOY',
    statusFilter: 'PENDIENTES',
    viewMode: 'NOMINA_PAGO',
    isPredefined: true
  },
  {
    id: 'tpl_costos_comparativo',
    name: 'Comparativo Anual de Centros de Costo',
    description: 'Comparación dinámica de gastos y costos por Centro de Costo entre períodos.',
    sourceType: 'COMPARATIVO',
    viewMode: 'COMPARATIVO',
    isPredefined: true
  },
  {
    id: 'tpl_partidas_abiertas',
    name: 'Partidas Abiertas y Calce entre Cuentas',
    description: 'Compensación de partidas pendientes entre cuentas contables.',
    sourceType: 'PARTIDAS_ABIERTAS',
    cutoffDate: 'HOY',
    statusFilter: 'PENDIENTES',
    viewMode: 'CONCILIACION',
    isPredefined: true
  }
];

export default function PlanillaConsultasDinamicasView({
  studyId,
  company,
  accounts,
  vouchers,
  fiscalYears,
  auxiliaries = [],
  rcvDocuments = [],
  costCenters = [],
  expenseItems = [],
  onVouchersUpdated,
  onOpenVoucher,
  initialAccountCode,
  onBackToTraditionalAnalysis
}: PlanillaConsultasDinamicasViewProps) {
  // --- MODO DE VISUALIZACIÓN / HERRAMIENTA ---
  const [activeViewMode, setActiveViewMode] = useState<'DETALLE' | 'PIVOT' | 'CONCILIACION' | 'NOMINA_PAGO' | 'COMPARATIVO'>('DETALLE');

  // --- PARÁMETROS DE CONSULTA (FILTROS EN LA MISMA BARRA) ---
  const [sourceType, setSourceType] = useState<SavedAccountingQuery['sourceType']>('MAYOR');
  const [accountCodeInput, setAccountCodeInput] = useState<string>(initialAccountCode || '1101001');
  const [selectedAccountCodes, setSelectedAccountCodes] = useState<string[]>(initialAccountCode ? [initialAccountCode] : ['1101001']);
  const [cutoffDateInput, setCutoffDateInput] = useState<string>('30.04.2026');
  const [statusFilter, setStatusFilter] = useState<'TODOS' | 'PENDIENTES' | 'COMPENSADOS'>('TODOS');
  const [rutFilterInput, setRutFilterInput] = useState<string>('');
  const [costCenterFilter, setCostCenterFilter] = useState<string>('TODOS');
  const [expenseItemFilter, setExpenseItemFilter] = useState<string>('TODOS');

  // --- MULTI-CUENTA MODAL / POPOVER ---
  const [showMultiAccountModal, setShowMultiAccountModal] = useState<boolean>(false);

  // --- TABLA DINÁMICA (PIVOT) AGRUPADOR ---
  const [pivotGroupBy, setPivotGroupBy] = useState<'ACCOUNT' | 'COST_CENTER' | 'AUXILIARY' | 'PERIOD' | 'EXPENSE_ITEM'>('ACCOUNT');
  const [expandedPivotGroups, setExpandedPivotGroups] = useState<Set<string>>(new Set());

  // --- COMPARATIVO DE PERÍODOS / AÑOS ---
  const [comparisonPeriod1, setComparisonPeriod1] = useState<string>('2025');
  const [comparisonPeriod2, setComparisonPeriod2] = useState<string>('2026');
  const [comparisonDimension, setComparisonDimension] = useState<'COST_CENTER' | 'ACCOUNT' | 'EXPENSE_ITEM'>('COST_CENTER');

  // --- NÓMINA DE PAGOS ---
  const [selectedBankFormat, setSelectedBankFormat] = useState<'CHILE' | 'SANTANDER' | 'BCI' | 'BANCOESTADO' | 'EXCEL'>('CHILE');

  // --- GESTIÓN DE PLANTILLAS Y REPLICACIÓN ---
  const [savedQueries, setSavedQueries] = useState<SavedAccountingQuery[]>([]);
  const [selectedQueryId, setSelectedQueryId] = useState<string>('');
  const [isSaveModalOpen, setIsSaveModalOpen] = useState<boolean>(false);
  const [queryNameInput, setQueryNameInput] = useState<string>('');
  const [queryDescInput, setQueryDescInput] = useState<string>('');

  // Replicación a otras empresas del estudio
  const [isReplicateModalOpen, setIsReplicateModalOpen] = useState<boolean>(false);
  const [studyCompanies, setStudyCompanies] = useState<Company[]>([]);
  const [loadingStudyCompanies, setLoadingStudyCompanies] = useState<boolean>(false);
  const [selectedTargetCompanyIds, setSelectedTargetCompanyIds] = useState<Set<string>>(new Set());
  const [isReplicating, setIsReplicating] = useState<boolean>(false);

  // Calces contables registrados en la empresa
  const [matches, setMatches] = useState<AccountMatch[]>([]);
  const [loadingMatches, setLoadingMatches] = useState<boolean>(false);

  // Filtro de búsqueda rápida en la grilla y orden
  const [tableSearch, setTableSearch] = useState<string>('');
  const [sortField, setSortField] = useState<'date' | 'folio' | 'debit' | 'credit' | 'balance'>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Selección de filas para compensación / nómina
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [isCompensating, setIsCompensating] = useState<boolean>(false);

  // --- CARGAR CALCES DESDE FIRESTORE ---
  const fetchMatches = useCallback(async () => {
    if (!studyId || !company?.id) return;
    setLoadingMatches(true);
    try {
      const snap = await getDocs(collection(db, 'studies', studyId, 'companies', company.id, 'accountMatches'));
      const list: AccountMatch[] = [];
      snap.forEach(d => {
        const item = d.data() as AccountMatch;
        if (item.status !== 'DESCALZADO') {
          list.push({ ...item, id: d.id });
        }
      });
      setMatches(list);
    } catch (err) {
      console.warn('Error cargando calces en planilla:', err);
    } finally {
      setLoadingMatches(false);
    }
  }, [studyId, company?.id]);

  // --- CARGAR CONSULTAS GUARDADAS DESDE FIRESTORE ---
  const fetchSavedQueries = useCallback(async () => {
    if (!studyId || !company?.id) return;
    try {
      const snap = await getDocs(
        collection(db, 'studies', studyId, 'companies', company.id, 'savedAccountingQueries')
      );
      const userQueries: SavedAccountingQuery[] = [];
      snap.forEach(d => {
        userQueries.push({ ...d.data(), id: d.id } as SavedAccountingQuery);
      });
      setSavedQueries(userQueries);
    } catch (err) {
      console.warn('Error cargando consultas guardadas:', err);
    }
  }, [studyId, company?.id]);

  // --- CARGAR EMPRESAS DEL ESTUDIO PARA REPLICAR ---
  const fetchStudyCompanies = useCallback(async () => {
    if (!studyId) return;
    setLoadingStudyCompanies(true);
    try {
      const snap = await getDocs(collection(db, 'studies', studyId, 'companies'));
      const list: Company[] = [];
      snap.forEach(d => {
        const c = { id: d.id, ...d.data() } as Company;
        if (c.id !== company.id) {
          list.push(c);
        }
      });
      setStudyCompanies(list);
    } catch (err) {
      console.warn('Error cargando empresas del estudio:', err);
    } finally {
      setLoadingStudyCompanies(false);
    }
  }, [studyId, company.id]);

  useEffect(() => {
    fetchMatches();
    fetchSavedQueries();
  }, [fetchMatches, fetchSavedQueries]);

  // Mapa de líneas calzadas: `${voucherId}_${lineIndex}` -> matchId
  const matchedLinesMap = useMemo(() => {
    const map = new Map<string, string>();
    // Una partida pareada solo en parte (pareo parcial) sigue abierta: se considera compensada únicamente si lo pareado cubre su monto
    const montos = new Map<string, { d: number; c: number }>();
    matches.forEach(m => {
      if (m.status === 'DESCALZADO') return;
      m.matchedLines.forEach(l => {
        const k = `${l.voucherId}_${l.lineIndex}`;
        map.set(k, m.id);
        const e = montos.get(k) || { d: 0, c: 0 };
        e.d += l.debit || 0; e.c += l.credit || 0;
        montos.set(k, e);
      });
    });
    const lineaOriginal = new Map<string, { d: number; c: number }>();
    vouchers.forEach(v => (v.lines || []).forEach((ln, i) => lineaOriginal.set(`${v.id}_${i}`, { d: Number(ln.debit) || 0, c: Number(ln.credit) || 0 })));
    montos.forEach((e, k) => {
      const o = lineaOriginal.get(k);
      if (o && (o.d - e.d > 0.5 || o.c - e.c > 0.5)) map.delete(k);
    });
    return map;
  }, [matches, vouchers]);

  // Normalizar fecha de corte
  const normalizedCutoffDate = useMemo(() => {
    const raw = (cutoffDateInput || '').trim().toUpperCase();
    if (!raw || raw === 'HOY' || raw === 'TODAY' || raw === 'ACTUAL') {
      return new Date().toISOString().slice(0, 10);
    }
    const chileanMatch = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (chileanMatch) {
      const d = chileanMatch[1].padStart(2, '0');
      const m = chileanMatch[2].padStart(2, '0');
      const y = chileanMatch[3];
      return `${y}-${m}-${d}`;
    }
    const isoMatch = raw.match(/^\d{4}-\d{2}-\d{2}$/);
    if (isoMatch) return raw;
    if (/^\d{4}$/.test(raw)) return `${raw}-12-31`;
    return new Date().toISOString().slice(0, 10);
  }, [cutoffDateInput]);

  // Cuenta principal seleccionada y sus atributos oficiales
  const matchedAccount = useMemo(() => {
    const codeClean = accountCodeInput.trim().replace(/[^0-9]/g, '');
    if (!codeClean) return null;
    return accounts.find(a => a.code.replace(/[^0-9]/g, '') === codeClean) || null;
  }, [accountCodeInput, accounts]);

  // Atributos de análisis de la cuenta seleccionada: si requiere o no auxiliares, centros de costo, ítems de gasto
  const accountAnalysisInfo = useMemo(() => {
    if (!matchedAccount) {
      return {
        hasAuxiliary: true,
        hasCostCenter: true,
        hasExpenseItem: true,
        isStandardOnly: false,
        label: 'Análisis Multidimensional Activo'
      };
    }
    const hasAux = !!matchedAccount.requiereAuxiliarRUT;
    const hasCC = !!matchedAccount.requiereCentroCosto;
    const hasItem = !!matchedAccount.requiereItemGasto;
    const isStandardOnly = !hasAux && !hasCC && !hasItem;

    const badges = [];
    if (hasAux) badges.push('Auxiliar (RUT)');
    if (hasCC) badges.push('Centro de Costo');
    if (hasItem) badges.push('Ítem de Gasto');

    return {
      hasAuxiliary: hasAux,
      hasCostCenter: hasCC,
      hasExpenseItem: hasItem,
      isStandardOnly,
      label: isStandardOnly ? 'Cuenta Estándar (Sin análisis adicional)' : badges.join(' • ')
    };
  }, [matchedAccount]);

  // Sincronizar selección multi-cuenta cuando se escribe en el input
  const handleAccountCodeChange = (val: string) => {
    setAccountCodeInput(val);
    const codes = val
      .split(',')
      .map(c => c.trim().replace(/[^0-9]/g, ''))
      .filter(Boolean);
    setSelectedAccountCodes(codes.length > 0 ? codes : []);
  };

  // -------------------------------------------------------------
  // MOTOR DE CONSULTAS DINÁMICAS (QUERY ENGINE)
  // -------------------------------------------------------------
  const queryResultRows = useMemo(() => {
    const rows: PlanillaRow[] = [];
    let runningBalance = 0;

    const rutClean = rutFilterInput.trim().toLowerCase().replace(/[^0-9kK]/g, '');
    const activeAccountCodes = selectedAccountCodes.length > 0
      ? selectedAccountCodes
      : (accountCodeInput.trim() ? [accountCodeInput.trim().replace(/[^0-9]/g, '')] : []);

    // 1. FUENTE: LIBRO MAYOR / ASIENTOS / PARTIDAS ABIERTAS / CONCILIACIÓN
    if (
      sourceType === 'MAYOR' ||
      sourceType === 'PARTIDAS_ABIERTAS' ||
      activeViewMode === 'CONCILIACION' ||
      activeViewMode === 'PIVOT' ||
      activeViewMode === 'COMPARATIVO'
    ) {
      const allLines: { v: Voucher; l: any; lineIdx: number }[] = [];

      vouchers.forEach(v => {
        if (v.status === 'Anulado') return;
        const vDate = v.date || '';
        if (activeViewMode !== 'COMPARATIVO' && vDate > normalizedCutoffDate) return;

        v.lines.forEach((l, idx) => {
          // Filtrar por cuenta si hay cuentas especificadas
          if (activeAccountCodes.length > 0) {
            const lCode = (l.accountCode || '').replace(/[^0-9]/g, '');
            const matchesCode = activeAccountCodes.some(code => lCode.startsWith(code) || code.startsWith(lCode));
            if (!matchesCode) return;
          }

          // Filtrar por RUT si se especificó y la cuenta lo soporta
          if (rutClean) {
            const lRut = (l.auxiliaryRut || '').toLowerCase().replace(/[^0-9kK]/g, '');
            if (!lRut.includes(rutClean)) return;
          }

          // Filtrar por Centro de Costo si se especificó
          if (costCenterFilter !== 'TODOS') {
            if ((l.costCenter || '').trim() !== costCenterFilter.trim()) return;
          }

          // Filtrar por Ítem de Gasto si se especificó
          if (expenseItemFilter !== 'TODOS') {
            if ((l.expenseItem || '').trim() !== expenseItemFilter.trim()) return;
          }

          allLines.push({ v, l, lineIdx: idx });
        });
      });

      // Orden cronológico
      allLines.sort(
        (a, b) =>
          (a.v.date || '').localeCompare(b.v.date || '') ||
          (a.v.voucherNumber || 0) - (b.v.voucherNumber || 0)
      );

      allLines.forEach(({ v, l, lineIdx }) => {
        const matchId = matchedLinesMap.get(`${v.id}_${lineIdx}`);
        const isCompensado = !!matchId;

        // Filtrado por estado
        if (statusFilter === 'PENDIENTES' && isCompensado) return;
        if (statusFilter === 'COMPENSADOS' && !isCompensado) return;
        if (sourceType === 'PARTIDAS_ABIERTAS' && isCompensado) return;

        const debit = Number(l.debit) || 0;
        const credit = Number(l.credit) || 0;
        runningBalance += debit - credit;

        rows.push({
          id: `line_${v.id}_${lineIdx}`,
          rowNumber: rows.length + 1,
          date: v.date,
          period: v.period,
          voucherNumber: v.voucherNumber,
          voucherId: v.id,
          voucherType: v.type,
          docType:
            l.documentType ||
            (v.type === 'Ingreso' ? 'INGRESO' : v.type === 'Egreso' ? 'EGRESO' : 'TRASPASO'),
          folio: l.documentRef || v.voucherNumber,
          accountCode: l.accountCode || '',
          accountName: l.accountName || '',
          auxiliaryRut: l.auxiliaryRut || '',
          auxiliaryName: l.auxiliaryName || '',
          costCenter: l.costCenter || '',
          expenseItem: l.expenseItem || '',
          gloss: l.gloss || v.gloss || '',
          documentRef: l.documentRef || '',
          debit,
          credit,
          runningBalance,
          status: isCompensado ? 'COMPENSADO' : 'PENDIENTE',
          matchId,
          sourceRecord: { voucher: v, line: l, lineIndex: lineIdx }
        });
      });
    }

    // 2. FUENTE: FACTURAS DE PROVEEDORES (RCV COMPRAS / NÓMINA DE PAGO)
    else if (sourceType === 'PROVEEDORES_RCV' || sourceType === 'NOMINA_PAGO' || activeViewMode === 'NOMINA_PAGO') {
      const docs = rcvDocuments.filter(d => {
        if (d.tipoRegistro !== 'Compra') return false;
        const dDate = d.fechaEmision || d.date || '';
        if (dDate > normalizedCutoffDate) return false;
        if (rutClean) {
          const dRut = (d.rutEmisor || '').toLowerCase().replace(/[^0-9kK]/g, '');
          if (!dRut.includes(rutClean)) return false;
        }
        const anyDoc = d as any;
        const isPagada = anyDoc.estadoPago === 'Pagada' || (anyDoc.saldoPendiente !== undefined && anyDoc.saldoPendiente <= 0);
        if (statusFilter === 'PENDIENTES' && isPagada) return false;
        if (statusFilter === 'COMPENSADOS' && !isPagada) return false;
        return true;
      });

      docs.sort((a, b) => (a.fechaEmision || a.date || '').localeCompare(b.fechaEmision || b.date || ''));

      docs.forEach(d => {
        const anyDoc = d as any;
        const isNC = d.tipoDoc === '61' || String(d.tipoDoc).includes('61');
        const total = d.montoTotal || 0;
        const saldo = anyDoc.saldoPendiente !== undefined ? anyDoc.saldoPendiente : total;
        const isPagada = anyDoc.estadoPago === 'Pagada' || saldo <= 0;

        const debit = isNC ? total : 0;
        const credit = !isNC ? total : 0;
        runningBalance += debit - credit;

        rows.push({
          id: `rcv_compra_${d.id}`,
          rowNumber: rows.length + 1,
          date: d.fechaEmision || d.date || '',
          period: d.period,
          voucherNumber: anyDoc.voucherNumber || d.voucherId,
          voucherId: d.voucherId,
          docType: `DTE ${d.tipoDoc || '33'}`,
          folio: d.folio,
          accountCode: activeAccountCodes[0] || '2101001',
          accountName: 'PROVEEDORES NACIONALES',
          auxiliaryRut: d.rutEmisor || '',
          auxiliaryName: d.razonSocialEmisor || '',
          costCenter: '',
          expenseItem: '',
          gloss: `DTE ${d.tipoDoc || '33'} N° ${d.folio} - Saldo: $${saldo.toLocaleString('es-CL')}`,
          documentRef: `${d.tipoDoc || '33'} N° ${d.folio}`,
          debit,
          credit,
          runningBalance,
          status: isPagada ? 'PAGADA' : 'PENDIENTE',
          sourceRecord: d
        });
      });
    }

    // 3. FUENTE: FACTURAS DE CLIENTES (RCV VENTAS)
    else if (sourceType === 'CLIENTES_RCV') {
      const docs = rcvDocuments.filter(d => {
        if (d.tipoRegistro !== 'Venta') return false;
        const dDate = d.fechaEmision || d.date || '';
        if (dDate > normalizedCutoffDate) return false;
        if (rutClean) {
          const dRut = (d.rutReceptor || '').toLowerCase().replace(/[^0-9kK]/g, '');
          if (!dRut.includes(rutClean)) return false;
        }
        const anyDoc = d as any;
        const isCobrada = anyDoc.estadoCobranza === 'Pagada' || (anyDoc.saldoPendiente !== undefined && anyDoc.saldoPendiente <= 0);
        if (statusFilter === 'PENDIENTES' && isCobrada) return false;
        if (statusFilter === 'COMPENSADOS' && !isCobrada) return false;
        return true;
      });

      docs.sort((a, b) => (a.fechaEmision || a.date || '').localeCompare(b.fechaEmision || b.date || ''));

      docs.forEach(d => {
        const anyDoc = d as any;
        const isNC = d.tipoDoc === '61' || String(d.tipoDoc).includes('61');
        const total = d.montoTotal || 0;
        const saldo = anyDoc.saldoPendiente !== undefined ? anyDoc.saldoPendiente : total;
        const isCobrada = anyDoc.estadoCobranza === 'Pagada' || saldo <= 0;

        const debit = !isNC ? total : 0;
        const credit = isNC ? total : 0;
        runningBalance += debit - credit;

        rows.push({
          id: `rcv_venta_${d.id}`,
          rowNumber: rows.length + 1,
          date: d.fechaEmision || d.date || '',
          period: d.period,
          voucherNumber: anyDoc.voucherNumber || d.voucherId,
          voucherId: d.voucherId,
          docType: `DTE ${d.tipoDoc || '33'}`,
          folio: d.folio,
          accountCode: activeAccountCodes[0] || '1104001',
          accountName: 'CLIENTES POR VENTAS',
          auxiliaryRut: d.rutReceptor || '',
          auxiliaryName: d.razonSocialReceptor || '',
          costCenter: '',
          expenseItem: '',
          gloss: `DTE ${d.tipoDoc || '33'} N° ${d.folio} - Saldo Pend: $${saldo.toLocaleString('es-CL')}`,
          documentRef: `${d.tipoDoc || '33'} N° ${d.folio}`,
          debit,
          credit,
          runningBalance,
          status: isCobrada ? 'PAGADA' : 'PENDIENTE',
          sourceRecord: d
        });
      });
    }

    return rows;
  }, [
    sourceType,
    activeViewMode,
    vouchers,
    rcvDocuments,
    selectedAccountCodes,
    accountCodeInput,
    normalizedCutoffDate,
    rutFilterInput,
    costCenterFilter,
    expenseItemFilter,
    statusFilter,
    matchedLinesMap
  ]);

  // Filtrado por búsqueda en tabla y ordenamiento
  const displayRows = useMemo(() => {
    let list = [...queryResultRows];

    if (tableSearch.trim()) {
      const q = tableSearch.toLowerCase().trim();
      list = list.filter(
        r =>
          r.accountCode.toLowerCase().includes(q) ||
          r.accountName.toLowerCase().includes(q) ||
          (r.auxiliaryRut || '').toLowerCase().includes(q) ||
          (r.auxiliaryName || '').toLowerCase().includes(q) ||
          (r.costCenter || '').toLowerCase().includes(q) ||
          (r.expenseItem || '').toLowerCase().includes(q) ||
          (r.gloss || '').toLowerCase().includes(q) ||
          String(r.debit || 0).includes(q) ||
          String(r.credit || 0).includes(q)
      );
    }

    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'date') cmp = a.date.localeCompare(b.date);
      else if (sortField === 'folio') cmp = String(a.folio || '').localeCompare(String(b.folio || ''));
      else if (sortField === 'debit') cmp = a.debit - b.debit;
      else if (sortField === 'credit') cmp = a.credit - b.credit;
      else if (sortField === 'balance') cmp = a.runningBalance - b.runningBalance;

      return sortDirection === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [queryResultRows, tableSearch, sortField, sortDirection]);

  // Fórmulas de Totales de la Planilla
  const tableTotals = useMemo(() => {
    const totalDebit = displayRows.reduce((acc, r) => acc + (r.debit || 0), 0);
    const totalCredit = displayRows.reduce((acc, r) => acc + (r.credit || 0), 0);
    const netBalance = totalDebit - totalCredit;
    const pendingCount = displayRows.filter(r => r.status === 'PENDIENTE').length;
    return {
      count: displayRows.length,
      totalDebit,
      totalCredit,
      netBalance,
      pendingCount
    };
  }, [displayRows]);

  // Selección de filas
  const selectedRows = useMemo(() => {
    return displayRows.filter(r => selectedRowIds.has(r.id));
  }, [displayRows, selectedRowIds]);

  const selectedDebitSum = useMemo(() => {
    return selectedRows.reduce((acc, r) => acc + (r.debit || 0), 0);
  }, [selectedRows]);

  const selectedCreditSum = useMemo(() => {
    return selectedRows.reduce((acc, r) => acc + (r.credit || 0), 0);
  }, [selectedRows]);

  const selectedDifference = useMemo(() => {
    return Math.abs(selectedDebitSum - selectedCreditSum);
  }, [selectedDebitSum, selectedCreditSum]);

  const canCompensateSelection = useMemo(() => {
    return selectedRows.length >= 2 && selectedDifference === 0 && selectedDebitSum > 0;
  }, [selectedRows, selectedDifference, selectedDebitSum]);

  const handleToggleRow = (id: string) => {
    setSelectedRowIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllVisible = () => {
    if (selectedRowIds.size === displayRows.length && displayRows.length > 0) {
      setSelectedRowIds(new Set());
    } else {
      setSelectedRowIds(new Set(displayRows.map(r => r.id)));
    }
  };

  // -------------------------------------------------------------
  // TABLA DINÁMICA (PIVOT) GROUP ENGINE
  // -------------------------------------------------------------
  const pivotGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        label: string;
        sublabel?: string;
        debitSum: number;
        creditSum: number;
        balance: number;
        count: number;
        rows: PlanillaRow[];
      }
    >();

    displayRows.forEach(r => {
      let groupKey = 'Sin Asignar';
      let label = 'Sin Asignar';
      let sublabel = '';

      if (pivotGroupBy === 'ACCOUNT') {
        groupKey = r.accountCode || 'S_CTA';
        label = `${r.accountCode} - ${r.accountName}`;
      } else if (pivotGroupBy === 'COST_CENTER') {
        groupKey = r.costCenter || 'SIN_CENTRO_COSTO';
        label = r.costCenter || 'Sin Centro de Costo';
      } else if (pivotGroupBy === 'AUXILIARY') {
        groupKey = r.auxiliaryRut || 'SIN_AUXILIAR';
        label = r.auxiliaryName || r.auxiliaryRut || 'Sin Auxiliar';
        sublabel = r.auxiliaryRut || '';
      } else if (pivotGroupBy === 'PERIOD') {
        groupKey = r.period || r.date.slice(0, 7) || 'S_PERIODO';
        label = `Período ${groupKey}`;
      } else if (pivotGroupBy === 'EXPENSE_ITEM') {
        groupKey = r.expenseItem || 'SIN_ITEM';
        label = r.expenseItem || 'Sin Ítem de Gasto';
      }

      if (!map.has(groupKey)) {
        map.set(groupKey, {
          key: groupKey,
          label,
          sublabel,
          debitSum: 0,
          creditSum: 0,
          balance: 0,
          count: 0,
          rows: []
        });
      }

      const g = map.get(groupKey)!;
      g.debitSum += r.debit;
      g.creditSum += r.credit;
      g.balance += r.debit - r.credit;
      g.count += 1;
      g.rows.push(r);
    });

    return Array.from(map.values()).sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
  }, [displayRows, pivotGroupBy]);

  const togglePivotGroupExpand = (key: string) => {
    setExpandedPivotGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // -------------------------------------------------------------
  // COMPARATIVO DE PERÍODOS / AÑOS
  // -------------------------------------------------------------
  const comparisonResults = useMemo(() => {
    const dataMap = new Map<
      string,
      { label: string; amountP1: number; amountP2: number }
    >();

    vouchers.forEach(v => {
      if (v.status === 'Anulado') return;
      const vYear = (v.date || '').slice(0, 4);
      const vPeriod = v.period || '';
      const isP1 = vYear === comparisonPeriod1 || vPeriod === comparisonPeriod1;
      const isP2 = vYear === comparisonPeriod2 || vPeriod === comparisonPeriod2;

      if (!isP1 && !isP2) return;

      v.lines.forEach(l => {
        let key = 'General';
        let label = 'General';

        if (comparisonDimension === 'COST_CENTER') {
          key = l.costCenter || 'Sin Centro de Costo';
          label = key;
        } else if (comparisonDimension === 'ACCOUNT') {
          key = l.accountCode;
          label = `${l.accountCode} - ${l.accountName}`;
        } else if (comparisonDimension === 'EXPENSE_ITEM') {
          key = l.expenseItem || 'Sin Ítem de Gasto';
          label = key;
        }

        if (!dataMap.has(key)) {
          dataMap.set(key, { label, amountP1: 0, amountP2: 0 });
        }

        const item = dataMap.get(key)!;
        const amount = (l.debit || 0) - (l.credit || 0);

        if (isP1) item.amountP1 += amount;
        if (isP2) item.amountP2 += amount;
      });
    });

    return Array.from(dataMap.values())
      .map(item => {
        const diff = item.amountP2 - item.amountP1;
        const pct = item.amountP1 !== 0 ? (diff / Math.abs(item.amountP1)) * 100 : 0;
        return { ...item, diff, pct };
      })
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  }, [vouchers, comparisonPeriod1, comparisonPeriod2, comparisonDimension]);

  // -------------------------------------------------------------
  // NÓMINA DE PAGOS A PROVEEDORES
  // -------------------------------------------------------------
  const pendingPayablesRows = useMemo(() => {
    return displayRows.filter(r => r.credit > 0 || r.status === 'PENDIENTE');
  }, [displayRows]);

  const selectedForPayroll = useMemo(() => {
    return pendingPayablesRows.filter(r => selectedRowIds.has(r.id));
  }, [pendingPayablesRows, selectedRowIds]);

  const payrollTotalAmount = useMemo(() => {
    return selectedForPayroll.reduce((acc, r) => acc + (r.credit || r.debit || 0), 0);
  }, [selectedForPayroll]);

  const handleExportPayrollFile = () => {
    if (selectedForPayroll.length === 0) {
      notify.warning('Seleccione las facturas o partidas que desea incluir en la nómina de pagos.');
      return;
    }

    const rows = selectedForPayroll.map((r, idx) => {
      const aux = auxiliaries.find(a => (a.rut || '').replace(/[^0-9kK]/g, '') === (r.auxiliaryRut || '').replace(/[^0-9kK]/g, ''));
      const bank = aux?.banco || (aux as any)?.bankDetails?.bankName || 'BANCO DE CHILE';
      const accType = aux?.tipoCuenta || (aux as any)?.bankDetails?.accountType || 'Cuenta Corriente';
      const accNum = aux?.numeroCuenta || (aux as any)?.bankDetails?.accountNumber || '0000000000';
      const amount = r.credit || r.debit || 0;

      return {
        '#': idx + 1,
        'RUT Beneficiario': r.auxiliaryRut || '99999999-9',
        'Nombre Proveedor': r.auxiliaryName || 'PROVEEDOR',
        'Monto a Pagar ($)': amount,
        'Banco Destino': bank,
        'Tipo de Cuenta': accType,
        'N° de Cuenta': accNum,
        'Documento / Folio': r.folio || r.voucherNumber,
        'Glosa / Detalle': r.gloss || 'Pago de Proveedor'
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Nomina_${selectedBankFormat}`);

    const fileName = `Nomina_Pagos_${selectedBankFormat}_${company.rut}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
    notify.success(`Nómina de pagos exportada exitosamente (${selectedForPayroll.length} transferencias).`, 'Nómina Bancaria');
  };

  // -------------------------------------------------------------
  // COMPENSACIÓN IN-SITU DIRECTAMENTE DESDE LA PLANILLA
  // -------------------------------------------------------------
  const handleExecuteCompensation = async () => {
    if (!canCompensateSelection || !company?.id) {
      notify.warning('Para compensar, los cargos (Debe) y abonos (Haber) seleccionados deben cuadrar a $0.');
      return;
    }

    setIsCompensating(true);
    try {
      const matchId = `match_sheet_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const debitRows = selectedRows.filter(r => r.debit > 0);
      const creditRows = selectedRows.filter(r => r.credit > 0);

      const matchedLinesRef: MatchedLineRef[] = selectedRows
        .filter(r => r.sourceRecord?.voucher && r.sourceRecord?.line)
        .map(r => ({
          voucherId: r.sourceRecord.voucher.id,
          voucherNumber: r.sourceRecord.voucher.voucherNumber || 0,
          voucherDate: r.sourceRecord.voucher.date,
          voucherPeriod: r.sourceRecord.voucher.period,
          lineIndex: r.sourceRecord.lineIndex || 0,
          accountId: r.sourceRecord.line.accountId,
          accountCode: r.accountCode,
          debit: r.debit,
          credit: r.credit,
          gloss: r.gloss,
          documentRef: r.documentRef,
          auxiliaryRut: r.auxiliaryRut,
          auxiliaryName: r.auxiliaryName
        }));

      const newMatch: AccountMatch = {
        id: matchId,
        accountId: matchedAccount?.id || 'gen',
        accountCode: accountCodeInput.trim() || 'VAR',
        accountName: matchedAccount?.name || 'Compensación Pizarra Mágica',
        matchedLines: matchedLinesRef,
        totalAmount: selectedDebitSum,
        matchDate: new Date().toISOString(),
        matchedBy: auth.currentUser?.email || 'Contador Pizarra Mágica',
        notes: `Calce manual desde Pizarra Dinámica (${debitRows.length} déb. vs ${creditRows.length} créd.)`,
        creationMode: 'MANUAL',
        status: 'CALZADO'
      };

      await setDoc(doc(db, 'studies', studyId, 'companies', company.id, 'accountMatches', matchId), newMatch);
      setMatches(prev => [...prev, newMatch]);
      setSelectedRowIds(new Set());

      notify.success(
        `✓ Se compensaron ${selectedRows.length} partidas con éxito por un total de $${selectedDebitSum.toLocaleString('es-CL')}.`,
        'Calce Contable Realizado'
      );

      if (onVouchersUpdated) onVouchersUpdated();
    } catch (err: any) {
      console.error('Error al compensar:', err);
      notify.error('No se pudo guardar la compensación: ' + err.message);
    } finally {
      setIsCompensating(false);
    }
  };

  // -------------------------------------------------------------
  // GESTIÓN DE PLANTILLAS Y CONSULTAS GUARDADAS
  // -------------------------------------------------------------
  const allAvailableTemplates = useMemo(() => {
    return [...FACTORY_TEMPLATES, ...savedQueries];
  }, [savedQueries]);

  const handleLoadQuery = (query: SavedAccountingQuery) => {
    setSelectedQueryId(query.id);
    if (query.sourceType) setSourceType(query.sourceType);
    if (query.accountCode !== undefined) {
      setAccountCodeInput(query.accountCode);
      setSelectedAccountCodes([query.accountCode]);
    }
    if (query.accountCodes && query.accountCodes.length > 0) {
      setSelectedAccountCodes(query.accountCodes);
      setAccountCodeInput(query.accountCodes.join(', '));
    }
    if (query.cutoffDate !== undefined) setCutoffDateInput(query.cutoffDate);
    if (query.statusFilter !== undefined) setStatusFilter(query.statusFilter);
    if (query.rutFilter !== undefined) setRutFilterInput(query.rutFilter);
    if (query.costCenterFilter !== undefined) setCostCenterFilter(query.costCenterFilter);
    if (query.expenseItemFilter !== undefined) setExpenseItemFilter(query.expenseItemFilter);
    if (query.viewMode !== undefined) setActiveViewMode(query.viewMode);
    if (query.pivotGroupBy !== undefined) setPivotGroupBy(query.pivotGroupBy);
    setSelectedRowIds(new Set());
    notify.info(`Plantilla cargada: ${query.name}`, 'Consulta Aplicada');
  };

  const handleSaveCurrentQuery = async () => {
    if (!queryNameInput.trim() || !company?.id) {
      notify.warning('Indique un nombre descriptivo para guardar este informe o consulta.');
      return;
    }

    try {
      const qId =
        selectedQueryId && !selectedQueryId.startsWith('tpl_')
          ? selectedQueryId
          : `query_${Date.now()}`;

      const queryData: SavedAccountingQuery = {
        id: qId,
        name: queryNameInput.trim(),
        description: queryDescInput.trim() || undefined,
        sourceType,
        accountCode: accountCodeInput.trim() || undefined,
        accountCodes: selectedAccountCodes,
        accountName: matchedAccount?.name,
        cutoffDate: cutoffDateInput.trim() || undefined,
        statusFilter,
        rutFilter: rutFilterInput.trim() || undefined,
        costCenterFilter: costCenterFilter !== 'TODOS' ? costCenterFilter : undefined,
        expenseItemFilter: expenseItemFilter !== 'TODOS' ? expenseItemFilter : undefined,
        viewMode: activeViewMode,
        pivotGroupBy,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: auth.currentUser?.email || undefined
      };

      await setDoc(doc(db, 'studies', studyId, 'companies', company.id, 'savedAccountingQueries', qId), queryData);

      setSavedQueries(prev => {
        const filtered = prev.filter(q => q.id !== qId);
        return [...filtered, queryData];
      });
      setSelectedQueryId(qId);
      setIsSaveModalOpen(false);
      setQueryNameInput('');
      setQueryDescInput('');
      notify.success(`Informe guardado: "${queryData.name}"`, 'Consulta Guardada');
    } catch (err: any) {
      console.error('Error guardando consulta:', err);
      notify.error('No se pudo guardar la consulta: ' + err.message);
    }
  };

  const handleDeleteSavedQuery = async (queryId: string) => {
    if (queryId.startsWith('tpl_')) {
      notify.warning('Las plantillas predefinidas no se pueden eliminar.');
      return;
    }
    if (!window.confirm('¿Seguro que deseas eliminar esta consulta guardada?')) return;

    try {
      await deleteDoc(doc(db, 'studies', studyId, 'companies', company.id, 'savedAccountingQueries', queryId));
      setSavedQueries(prev => prev.filter(q => q.id !== queryId));
      if (selectedQueryId === queryId) setSelectedQueryId('');
      notify.info('Consulta eliminada.');
    } catch (err: any) {
      notify.error('Error al eliminar: ' + err.message);
    }
  };

  // -------------------------------------------------------------
  // REPLICAR ESTRUCTURA A OTRAS EMPRESAS DEL ESTUDIO
  // -------------------------------------------------------------
  const handleOpenReplicateModal = async () => {
    await fetchStudyCompanies();
    setSelectedTargetCompanyIds(new Set());
    setIsReplicateModalOpen(true);
  };

  const handleToggleTargetCompany = (compId: string) => {
    setSelectedTargetCompanyIds(prev => {
      const next = new Set(prev);
      if (next.has(compId)) next.delete(compId);
      else next.add(compId);
      return next;
    });
  };

  const handleSelectAllTargetCompanies = () => {
    if (selectedTargetCompanyIds.size === studyCompanies.length) {
      setSelectedTargetCompanyIds(new Set());
    } else {
      setSelectedTargetCompanyIds(new Set(studyCompanies.map(c => c.id)));
    }
  };

  const handleExecuteReplication = async () => {
    if (selectedTargetCompanyIds.size === 0) {
      notify.warning('Seleccione al menos una empresa destino para replicar esta consulta.');
      return;
    }

    setIsReplicating(true);
    try {
      const queryToCopy: SavedAccountingQuery = {
        id: `query_replicated_${Date.now()}`,
        name: queryNameInput.trim() || `Informe ${accountCodeInput || sourceType}`,
        description: `Estructura replicada desde ${company.name}`,
        sourceType,
        accountCode: accountCodeInput.trim() || undefined,
        accountCodes: selectedAccountCodes,
        cutoffDate: cutoffDateInput.trim() || undefined,
        statusFilter,
        rutFilter: rutFilterInput.trim() || undefined,
        costCenterFilter: costCenterFilter !== 'TODOS' ? costCenterFilter : undefined,
        expenseItemFilter: expenseItemFilter !== 'TODOS' ? expenseItemFilter : undefined,
        viewMode: activeViewMode,
        pivotGroupBy,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: auth.currentUser?.email || undefined
      };

      const copyPromises = Array.from(selectedTargetCompanyIds).map(targetCompId => {
        return setDoc(
          doc(db, 'studies', studyId, 'companies', targetCompId, 'savedAccountingQueries', queryToCopy.id),
          queryToCopy
        );
      });

      await Promise.all(copyPromises);

      notify.success(
        `✓ Estructura de consulta replicada exitosamente en ${selectedTargetCompanyIds.size} empresas del estudio.`,
        'Replicación Completada'
      );
      setIsReplicateModalOpen(false);
    } catch (err: any) {
      console.error('Error replicando consulta:', err);
      notify.error('Error al replicar consulta: ' + err.message);
    } finally {
      setIsReplicating(false);
    }
  };

  // -------------------------------------------------------------
  // EXPORTAR A EXCEL NATIVO (.xlsx)
  // -------------------------------------------------------------
  const handleExportExcel = () => {
    if (displayRows.length === 0) {
      notify.warning('No hay datos en la planilla para exportar.');
      return;
    }

    const header = [
      ['GESTOR CONTABLE - PIZARRA MÁGICA Y PLANILLA DINÁMICA DE CONSULTAS'],
      [`Empresa: ${company.name} | RUT: ${company.rut}`],
      [`Fecha de Emisión: ${new Date().toLocaleDateString('es-CL')} | Fecha Corte: ${normalizedCutoffDate}`],
      []
    ];

    const tableHeaders = [
      '#',
      'Fecha',
      'Comprobante',
      'Tipo Doc',
      'Código Cuenta',
      'Nombre Cuenta',
      'RUT Auxiliar',
      'Razón Social / Beneficiario',
      'Centro de Costo',
      'Ítem de Gasto',
      'Glosa / Concepto',
      'Debe ($)',
      'Haber ($)',
      'Saldo Acumulado ($)',
      'Estado'
    ];

    const dataRows = displayRows.map((r, i) => [
      i + 1,
      r.date,
      r.folio || r.voucherNumber || '-',
      r.docType || '-',
      r.accountCode,
      r.accountName,
      r.auxiliaryRut || '-',
      r.auxiliaryName || '-',
      r.costCenter || '-',
      r.expenseItem || '-',
      r.gloss,
      r.debit,
      r.credit,
      r.runningBalance,
      r.status
    ]);

    const totalRow = [
      'TOTALES',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      `Total ${displayRows.length} registros`,
      tableTotals.totalDebit,
      tableTotals.totalCredit,
      tableTotals.netBalance,
      ''
    ];

    const fullSheet = [...header, tableHeaders, ...dataRows, [], totalRow];
    const ws = XLSX.utils.aoa_to_sheet(fullSheet);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Planilla Dinamica');

    const fileName = `Planilla_${company.rut}_${normalizedCutoffDate}.xlsx`;
    XLSX.writeFile(wb, fileName);
    notify.success(`Archivo Excel "${fileName}" generado exitosamente.`);
  };

  // -------------------------------------------------------------
  // IMPRESIÓN Y PDF
  // -------------------------------------------------------------
  const handlePrint = () => {
    if (displayRows.length === 0) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Pizarra Dinámica - ${company.name}</title>
          <style>
            body { font-family: -apple-system, sans-serif; font-size: 11px; color: #0f172a; padding: 20px; }
            h1 { font-size: 16px; margin: 0 0 4px 0; }
            .sub { color: #64748b; font-size: 11px; margin-bottom: 15px; }
            table { width: 100%; border-collapse: collapse; font-size: 10px; }
            th { background: #f8fafc; text-align: left; padding: 6px; border-bottom: 2px solid #cbd5e1; font-weight: bold; }
            td { padding: 6px; border-bottom: 1px solid #e2e8f0; }
            .num { text-align: right; font-family: monospace; }
            .total-row { font-weight: bold; background: #f8fafc; border-top: 2px solid #0f172a; }
          </style>
        </head>
        <body>
          <h1>${company.name} - Planilla Dinámica de Consultas</h1>
          <div class="sub">RUT: ${company.rut} | Fecha de Corte: ${normalizedCutoffDate} | Fuente: ${sourceType}</div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Fecha</th>
                <th>Doc/Asiento</th>
                <th>Cuenta</th>
                <th>RUT</th>
                <th>C. Costo</th>
                <th>Glosa</th>
                <th class="num">Debe ($)</th>
                <th class="num">Haber ($)</th>
                <th class="num">Saldo ($)</th>
              </tr>
            </thead>
            <tbody>
              ${displayRows.map((r, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td>${r.date}</td>
                  <td>${r.folio || r.voucherNumber || '-'}</td>
                  <td>${r.accountCode}</td>
                  <td>${r.auxiliaryRut || '-'}</td>
                  <td>${r.costCenter || '-'}</td>
                  <td>${r.gloss}</td>
                  <td class="num">${r.debit > 0 ? '$' + r.debit.toLocaleString('es-CL') : '-'}</td>
                  <td class="num">${r.credit > 0 ? '$' + r.credit.toLocaleString('es-CL') : '-'}</td>
                  <td class="num">$${r.runningBalance.toLocaleString('es-CL')}</td>
                </tr>
              `).join('')}
              <tr class="total-row">
                <td colspan="7">TOTALES (${displayRows.length} registros)</td>
                <td class="num">$${tableTotals.totalDebit.toLocaleString('es-CL')}</td>
                <td class="num">$${tableTotals.totalCredit.toLocaleString('es-CL')}</td>
                <td class="num">$${tableTotals.netBalance.toLocaleString('es-CL')}</td>
              </tr>
            </tbody>
          </table>
          <script>window.onload = function() { window.print(); }</script>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  return (
    <div className="space-y-4 font-sans text-slate-800 animate-in fade-in duration-200">
      
      {/* --- CABECERA PRINCIPAL ESTILO STUDIO CONTABLE --- */}
      <div className="bg-slate-900 text-white p-4 rounded-xl shadow-sm border border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500 flex items-center justify-center text-white shadow-md">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold tracking-tight">Planilla dinámica de consultas y análisis</h2>
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                Motor Multidimensional
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Consulta todas las cuentas de la empresa, analiza centros de costo, concilia partidas, genera nóminas de pago y compara períodos.
            </p>
          </div>
        </div>

        {/* Acciones de Cabecera: Guardar, Replicar, Exportar, Volver */}
        <div className="flex items-center gap-2 flex-wrap">
          {onBackToTraditionalAnalysis && (
            <button
              type="button"
              onClick={onBackToTraditionalAnalysis}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <span> Ver Calce Tradicional</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setQueryNameInput(selectedQueryId ? allAvailableTemplates.find(q => q.id === selectedQueryId)?.name || '' : '');
              setIsSaveModalOpen(true);
            }}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
            title="Guardar este informe con el nombre que estimes conveniente"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Grabar Informe</span>
          </button>

          <button
            type="button"
            onClick={handleOpenReplicateModal}
            className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
            title="Copiar la estructura de este informe a las demás empresas asignadas de tu estudio"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Replicar a Otras Empresas</span>
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
            title="Descargar datos en Excel (.xlsx)"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Excel</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg border border-slate-700 transition-colors"
            title="Imprimir / Exportar a PDF"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* --- BARRA UNIFICADA DE FILTROS (CON CARGA DE PLANTILLAS PEGADA A LA DERECHA) --- */}
      <div className="bg-white p-3 rounded-xl border border-slate-300 shadow-sm space-y-2.5">
        <div className="flex flex-wrap items-center gap-2.5">
          
          {/* 1. Selector de Fuente de Datos */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
            <span className="text-[11px] font-bold text-slate-600 px-1.5">Fuente:</span>
            <select
              value={sourceType}
              onChange={(e) => {
                const newSource = e.target.value as any;
                setSourceType(newSource);
                if (newSource === 'NOMINA_PAGO') setActiveViewMode('NOMINA_PAGO');
                else if (newSource === 'PARTIDAS_ABIERTAS') setActiveViewMode('CONCILIACION');
                else if (newSource === 'COMPARATIVO') setActiveViewMode('COMPARATIVO');
                setSelectedRowIds(new Set());
              }}
              className="bg-white border border-slate-300 rounded px-2 py-1 text-xs font-bold text-slate-900 focus:outline-none"
            >
              <option value="MAYOR"> Libro Mayor (Cuentas)</option>
              <option value="PARTIDAS_ABIERTAS"> Partidas Abiertas / Calce</option>
              <option value="PROVEEDORES_RCV"> Facturas por Pagar (Compras)</option>
              <option value="CLIENTES_RCV"> Facturas por Cobrar (Ventas)</option>
              <option value="NOMINA_PAGO"> Nómina de Pagos</option>
              <option value="COMPARATIVO"> Comparativo de Períodos</option>
            </select>
          </div>

          {/* 2. Selector de Cuenta(s) Contable(s) con soporte Multi-Cuentas */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200">
            <span className="text-[11px] font-bold text-slate-600 px-1.5">Cuenta:</span>
            <input
              type="text"
              value={accountCodeInput}
              onChange={(e) => handleAccountCodeChange(e.target.value)}
              placeholder="Ej: 1101001, 1101002..."
              className="w-32 bg-white border border-slate-300 rounded px-2 py-1 font-mono text-xs font-bold text-indigo-950 focus:outline-none"
              title="Escribe un código de cuenta, o varios separados por coma"
            />
            <button
              type="button"
              onClick={() => setShowMultiAccountModal(true)}
              className="px-2 py-1 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded text-[11px] font-bold flex items-center gap-1"
              title="Seleccionar múltiples cuentas del plan de cuentas"
            >
              <Layers className="w-3 h-3 text-indigo-600" />
              <span>Multi-Cta ({selectedAccountCodes.length})</span>
            </button>
            {matchedAccount && (
              <span className="text-[11px] font-medium text-slate-600 max-w-[140px] truncate" title={matchedAccount.name}>
                {matchedAccount.name}
              </span>
            )}
          </div>

          {/* 3. Filtro Contextual: Auxiliar (RUT) si la cuenta lo requiere o si es general */}
          {accountAnalysisInfo.hasAuxiliary && (
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
              <span className="text-[11px] font-bold text-slate-600 px-1.5">RUT Auxiliar:</span>
              <input
                type="text"
                value={rutFilterInput}
                onChange={(e) => setRutFilterInput(e.target.value)}
                placeholder="RUT o Nombre..."
                className="w-28 bg-white border border-slate-300 rounded px-2 py-1 text-xs font-medium text-slate-900 focus:outline-none"
              />
            </div>
          )}

          {/* 4. Filtro Contextual: Centro de Costo si la cuenta lo requiere */}
          {accountAnalysisInfo.hasCostCenter && costCenters.length > 0 && (
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
              <span className="text-[11px] font-bold text-slate-600 px-1.5">C. Costo:</span>
              <select
                value={costCenterFilter}
                onChange={(e) => setCostCenterFilter(e.target.value)}
                className="bg-white border border-slate-300 rounded px-2 py-1 text-xs font-medium text-slate-800 focus:outline-none max-w-[130px]"
              >
                <option value="TODOS">Todos</option>
                {costCenters.map(cc => (
                  <option key={cc.id || cc.name} value={cc.name}>{cc.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* 5. Filtro Contextual: Ítem de Gasto si la cuenta lo requiere */}
          {accountAnalysisInfo.hasExpenseItem && expenseItems.length > 0 && (
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
              <span className="text-[11px] font-bold text-slate-600 px-1.5">Ítem Gasto:</span>
              <select
                value={expenseItemFilter}
                onChange={(e) => setExpenseItemFilter(e.target.value)}
                className="bg-white border border-slate-300 rounded px-2 py-1 text-xs font-medium text-slate-800 focus:outline-none max-w-[130px]"
              >
                <option value="TODOS">Todos</option>
                {expenseItems.map(it => (
                  <option key={it.id || it.name} value={it.name}>{it.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* 6. Fecha de Corte Inteligente */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
            <span className="text-[11px] font-bold text-slate-600 px-1.5">Corte:</span>
            <input
              type="text"
              value={cutoffDateInput}
              onChange={(e) => setCutoffDateInput(e.target.value)}
              placeholder="HOY, 30.04.2026..."
              className="w-24 bg-white border border-slate-300 rounded px-2 py-1 font-mono text-xs font-bold text-slate-800 focus:outline-none"
              title="Acepta 'HOY', '30.04.2026', '2026-04-30' o años"
            />
          </div>

          {/* 7. Estado: Todos / Pendientes / Compensados */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
            <span className="text-[11px] font-bold text-slate-600 px-1.5">Estado:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-white border border-slate-300 rounded px-2 py-1 text-xs font-semibold text-slate-800 focus:outline-none"
            >
              <option value="TODOS">Todos</option>
              <option value="PENDIENTES">Pendientes</option>
              <option value="COMPENSADOS">Compensados</option>
            </select>
          </div>

          {/* --- SELECTOR DE PLANTILLAS PEGADO A LA DERECHA (SIN LA FRASE 'BIBLIOTECA DE CONSULTAS') --- */}
          <div className="ml-auto flex items-center gap-1.5">
            <FolderOpen className="w-4 h-4 text-indigo-600 shrink-0" />
            <select
              value={selectedQueryId}
              onChange={(e) => {
                const q = allAvailableTemplates.find(t => t.id === e.target.value);
                if (q) handleLoadQuery(q);
                else setSelectedQueryId('');
              }}
              className="bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-lg px-2.5 py-1.5 text-xs font-bold shadow-2xs focus:ring-1 focus:ring-indigo-500 focus:outline-none max-w-xs truncate"
              title="Cargar una plantilla predefinida o consulta guardada de la empresa"
            >
              <option value=""> Cargar plantilla o consulta guardada...</option>
              <optgroup label="Plantillas de Fábrica">
                {FACTORY_TEMPLATES.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </optgroup>
              {savedQueries.length > 0 && (
                <optgroup label="Consultas Guardadas (Empresa)">
                  {savedQueries.map(q => (
                    <option key={q.id} value={q.id}> {q.name}</option>
                  ))}
                </optgroup>
              )}
            </select>

            {selectedQueryId && !selectedQueryId.startsWith('tpl_') && (
              <button
                type="button"
                onClick={() => handleDeleteSavedQuery(selectedQueryId)}
                className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-colors"
                title="Eliminar esta consulta guardada"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Sub-barra de Atributos de Cuenta y Herramientas */}
        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">Estructura de la Cuenta:</span>
            <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-700 font-mono text-[10px]">
              {accountAnalysisInfo.label}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-600">Total Registros: <strong>{displayRows.length}</strong></span>
            <span>•</span>
            <span className="text-emerald-700 font-mono font-bold">Debe: ${tableTotals.totalDebit.toLocaleString('es-CL')}</span>
            <span>•</span>
            <span className="text-blue-700 font-mono font-bold">Haber: ${tableTotals.totalCredit.toLocaleString('es-CL')}</span>
            <span>•</span>
            <span className="text-slate-900 font-mono font-bold">Saldo: ${tableTotals.netBalance.toLocaleString('es-CL')}</span>
          </div>
        </div>
      </div>

      {/* --- PESTAÑAS DE MODOS DE LA PIZARRA MÁGICA --- */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-1 flex-wrap gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveViewMode('DETALLE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
              activeViewMode === 'DETALLE'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <TableIcon className="w-3.5 h-3.5" />
            <span>1. Planilla de Movimientos</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveViewMode('PIVOT')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
              activeViewMode === 'PIVOT'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <PieChart className="w-3.5 h-3.5" />
            <span>2. Tabla Dinámica (Pivot)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveViewMode('CONCILIACION')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
              activeViewMode === 'CONCILIACION'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span>3. Conciliación entre Cuentas</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveViewMode('NOMINA_PAGO')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
              activeViewMode === 'NOMINA_PAGO'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>4. Nómina de Pagos</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveViewMode('COMPARATIVO')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
              activeViewMode === 'COMPARATIVO'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>5. Comparativo de Costos</span>
          </button>
        </div>

        {/* Buscador Rápido de Texto en la Planilla */}
        <div className="relative w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={tableSearch}
            onChange={(e) => setTableSearch(e.target.value)}
            placeholder="Buscar en la grilla..."
            className="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-3 py-1 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
      </div>

      {/* ============================================================= */}
      {/* VISTA 1: DETALLE DE MOVIMIENTOS Y LIBRO MAYOR DINÁMICO        */}
      {/* ============================================================= */}
      {activeViewMode === 'DETALLE' && (
        <div className="bg-white rounded-xl border border-slate-300 shadow-sm overflow-hidden">
          <div className="overflow-x-auto max-h-[580px]">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-900 text-white sticky top-0 z-10 select-none shadow-xs">
                <tr>
                  <th className="p-2 w-8 text-center">
                    <input
                      type="checkbox"
                      checked={selectedRowIds.size === displayRows.length && displayRows.length > 0}
                      onChange={handleSelectAllVisible}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer"
                    />
                  </th>
                  <th className="p-2 w-10 text-center font-mono">#</th>
                  <th className="p-2 cursor-pointer hover:bg-slate-800" onClick={() => setSortField('date')}>
                    Fecha
                  </th>
                  <th className="p-2">Período</th>
                  <th className="p-2">Comprobante</th>
                  <th className="p-2">Cuenta</th>
                  <th className="p-2">RUT / Beneficiario</th>
                  <th className="p-2">C. Costo</th>
                  <th className="p-2">Ítem Gasto</th>
                  <th className="p-2">Doc / Ref</th>
                  <th className="p-2">Glosa</th>
                  <th className="p-2 text-right cursor-pointer hover:bg-slate-800 font-mono" onClick={() => setSortField('debit')}>
                    Debe ($)
                  </th>
                  <th className="p-2 text-right cursor-pointer hover:bg-slate-800 font-mono" onClick={() => setSortField('credit')}>
                    Haber ($)
                  </th>
                  <th className="p-2 text-right cursor-pointer hover:bg-slate-800 font-mono" onClick={() => setSortField('balance')}>
                    Saldo ($)
                  </th>
                  <th className="p-2 text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {displayRows.length === 0 ? (
                  <tr>
                    <td colSpan={15} className="p-8 text-center text-slate-500">
                      No se encontraron movimientos con los filtros y fechas seleccionadas.
                    </td>
                  </tr>
                ) : (
                  displayRows.map((r, i) => {
                    const isSelected = selectedRowIds.has(r.id);
                    return (
                      <tr
                        key={r.id}
                        className={`hover:bg-indigo-50/50 transition-colors cursor-pointer ${
                          isSelected ? 'bg-indigo-50/80' : i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                        }`}
                        onClick={() => handleToggleRow(r.id)}
                      >
                        <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleRow(r.id)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-0 cursor-pointer"
                          />
                        </td>
                        <td className="p-2 text-center text-slate-400 font-mono text-[11px]">{i + 1}</td>
                        <td className="p-2 font-mono whitespace-nowrap text-slate-800 font-medium">{r.date}</td>
                        <td className="p-2 font-mono text-slate-600 text-[11px]">{r.period || '-'}</td>
                        <td className="p-2 font-mono text-indigo-900 font-bold whitespace-nowrap">
                          {r.voucherNumber ? `Comp. ${r.voucherNumber}` : '-'}
                        </td>
                        <td className="p-2 whitespace-nowrap">
                          <span className="font-mono font-bold text-slate-900">{r.accountCode}</span>
                          <span className="text-slate-500 text-[10px] block truncate max-w-[120px]">{r.accountName}</span>
                        </td>
                        <td className="p-2 whitespace-nowrap">
                          <span className="font-mono text-slate-700 text-[11px]">{r.auxiliaryRut || '-'}</span>
                          {r.auxiliaryName && (
                            <span className="text-slate-500 text-[10px] block truncate max-w-[140px]">{r.auxiliaryName}</span>
                          )}
                        </td>
                        <td className="p-2 text-slate-700 text-[11px] whitespace-nowrap">{r.costCenter || '-'}</td>
                        <td className="p-2 text-slate-700 text-[11px] whitespace-nowrap">{r.expenseItem || '-'}</td>
                        <td className="p-2 font-mono text-slate-600 text-[11px] whitespace-nowrap">{r.documentRef || r.folio || '-'}</td>
                        <td className="p-2 text-slate-700 max-w-xs truncate" title={r.gloss}>{r.gloss}</td>
                        <td className="p-2 text-right font-mono font-bold text-emerald-800 whitespace-nowrap">
                          {r.debit > 0 ? `$${r.debit.toLocaleString('es-CL')}` : '-'}
                        </td>
                        <td className="p-2 text-right font-mono font-bold text-blue-800 whitespace-nowrap">
                          {r.credit > 0 ? `$${r.credit.toLocaleString('es-CL')}` : '-'}
                        </td>
                        <td className="p-2 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                          ${r.runningBalance.toLocaleString('es-CL')}
                        </td>
                        <td className="p-2 text-center whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              r.status === 'COMPENSADO' || r.status === 'PAGADA' || r.status === 'CONCILIADO'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {r.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* VISTA 2: TABLA DINÁMICA (PIVOT CON SUB-TOTALES Y RESÚMENES)    */}
      {/* ============================================================= */}
      {activeViewMode === 'PIVOT' && (
        <div className="bg-white rounded-xl border border-slate-300 shadow-sm overflow-hidden p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">Agrupar Tabla Dinámica por:</span>
              <select
                value={pivotGroupBy}
                onChange={(e) => setPivotGroupBy(e.target.value as any)}
                className="bg-slate-100 border border-slate-300 text-slate-900 rounded-lg px-2.5 py-1 text-xs font-bold focus:outline-none"
              >
                <option value="ACCOUNT">Cuenta Contable</option>
                <option value="COST_CENTER">Centro de Costo</option>
                <option value="AUXILIARY">Auxiliar (RUT / Beneficiario)</option>
                <option value="PERIOD">Período / Mes</option>
                <option value="EXPENSE_ITEM">Ítem de Gasto</option>
              </select>
            </div>

            <div className="text-xs text-slate-600">
              Total Grupos Calculados: <strong>{pivotGroups.length}</strong>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-900 text-white">
                <tr>
                  <th className="p-2.5">Agrupador / Dimensión</th>
                  <th className="p-2.5 text-center">N° Movimientos</th>
                  <th className="p-2.5 text-right font-mono">Total Debe ($)</th>
                  <th className="p-2.5 text-right font-mono">Total Haber ($)</th>
                  <th className="p-2.5 text-right font-mono">Saldo Neto ($)</th>
                  <th className="p-2.5 text-right">% Participación</th>
                  <th className="p-2.5 text-center">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {pivotGroups.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-slate-500">
                      No hay datos agrupables para esta selección.
                    </td>
                  </tr>
                ) : (
                  pivotGroups.map(g => {
                    const isExpanded = expandedPivotGroups.has(g.key);
                    const pctOfTotal = tableTotals.totalDebit + tableTotals.totalCredit > 0
                      ? ((g.debitSum + g.creditSum) / (tableTotals.totalDebit + tableTotals.totalCredit)) * 100
                      : 0;

                    return (
                      <React.Fragment key={g.key}>
                        <tr className="hover:bg-slate-50 font-medium">
                          <td className="p-2.5">
                            <span className="font-bold text-slate-900">{g.label}</span>
                            {g.sublabel && <span className="text-slate-400 font-mono text-[10px] block">{g.sublabel}</span>}
                          </td>
                          <td className="p-2.5 text-center font-mono text-slate-700">{g.count}</td>
                          <td className="p-2.5 text-right font-mono font-bold text-emerald-800">${g.debitSum.toLocaleString('es-CL')}</td>
                          <td className="p-2.5 text-right font-mono font-bold text-blue-800">${g.creditSum.toLocaleString('es-CL')}</td>
                          <td className="p-2.5 text-right font-mono font-bold text-slate-900">${g.balance.toLocaleString('es-CL')}</td>
                          <td className="p-2.5 text-right font-mono text-slate-600">{pctOfTotal.toFixed(1)}%</td>
                          <td className="p-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => togglePivotGroupExpand(g.key)}
                              className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-bold"
                            >
                              {isExpanded ? 'Ocultar' : 'Ver Líneas'}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-slate-50/70">
                            <td colSpan={7} className="p-3 pl-8">
                              <table className="w-full text-[11px] border-collapse bg-white rounded border border-slate-200">
                                <thead className="bg-slate-100 text-slate-700">
                                  <tr>
                                    <th className="p-1.5">Fecha</th>
                                    <th className="p-1.5">Comprobante</th>
                                    <th className="p-1.5">Glosa</th>
                                    <th className="p-1.5 text-right font-mono">Debe</th>
                                    <th className="p-1.5 text-right font-mono">Haber</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {g.rows.map(line => (
                                    <tr key={line.id} className="hover:bg-slate-50">
                                      <td className="p-1.5 font-mono">{line.date}</td>
                                      <td className="p-1.5 font-mono">{line.voucherNumber || '-'}</td>
                                      <td className="p-1.5 truncate max-w-sm">{line.gloss}</td>
                                      <td className="p-1.5 text-right font-mono text-emerald-700">${line.debit.toLocaleString('es-CL')}</td>
                                      <td className="p-1.5 text-right font-mono text-blue-700">${line.credit.toLocaleString('es-CL')}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* VISTA 3: CONCILIACIÓN Y CALCE ENTRE CUENTAS                   */}
      {/* ============================================================= */}
      {activeViewMode === 'CONCILIACION' && (
        <div className="space-y-3">
          <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl flex items-center justify-between text-xs text-amber-900">
            <div className="flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-amber-700" />
              <span>
                <strong>Modo Conciliación Activo:</strong> Selecciona partidas en la grilla para compensar cargos y abonos entre cuentas.
              </span>
            </div>
            <div className="flex items-center gap-3 font-mono font-bold">
              <span>Cargos (Debe): ${selectedDebitSum.toLocaleString('es-CL')}</span>
              <span>Abonos (Haber): ${selectedCreditSum.toLocaleString('es-CL')}</span>
              <span className={selectedDifference === 0 && selectedDebitSum > 0 ? 'text-emerald-700' : 'text-rose-700'}>
                Diferencia: ${selectedDifference.toLocaleString('es-CL')}
              </span>
              <button
                type="button"
                onClick={handleExecuteCompensation}
                disabled={!canCompensateSelection || isCompensating}
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded font-sans text-xs font-bold transition-colors"
              >
                {isCompensating ? 'Compensando...' : 'Compensar Selección ($0)'}
              </button>
            </div>
          </div>

          {/* Grilla de Selección para Calce */}
          <div className="bg-white rounded-xl border border-slate-300 shadow-sm overflow-hidden">
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-900 text-white sticky top-0 z-10 font-mono">
                  <tr>
                    <th className="p-2 w-8 text-center">Sel</th>
                    <th className="p-2">Fecha</th>
                    <th className="p-2">Comprobante</th>
                    <th className="p-2">Cuenta</th>
                    <th className="p-2">Auxiliar</th>
                    <th className="p-2">Glosa</th>
                    <th className="p-2 text-right">Debe ($)</th>
                    <th className="p-2 text-right">Haber ($)</th>
                    <th className="p-2 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {displayRows.map(r => {
                    const isSelected = selectedRowIds.has(r.id);
                    return (
                      <tr
                        key={r.id}
                        onClick={() => handleToggleRow(r.id)}
                        className={`hover:bg-indigo-50 cursor-pointer ${
                          isSelected ? 'bg-indigo-50 font-bold' : ''
                        }`}
                      >
                        <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleRow(r.id)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-0"
                          />
                        </td>
                        <td className="p-2 font-mono">{r.date}</td>
                        <td className="p-2 font-mono">{r.voucherNumber || '-'}</td>
                        <td className="p-2 font-mono">{r.accountCode}</td>
                        <td className="p-2">{r.auxiliaryRut || '-'}</td>
                        <td className="p-2 truncate max-w-sm">{r.gloss}</td>
                        <td className="p-2 text-right font-mono text-emerald-800">{r.debit > 0 ? `$${r.debit.toLocaleString('es-CL')}` : '-'}</td>
                        <td className="p-2 text-right font-mono text-blue-800">{r.credit > 0 ? `$${r.credit.toLocaleString('es-CL')}` : '-'}</td>
                        <td className="p-2 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${r.status === 'COMPENSADO' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                            {r.status}
                          </span>
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

      {/* ============================================================= */}
      {/* VISTA 4: NÓMINA DE PAGOS A PROVEEDORES                        */}
      {/* ============================================================= */}
      {activeViewMode === 'NOMINA_PAGO' && (
        <div className="bg-white rounded-xl border border-slate-300 shadow-sm p-4 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-indigo-600" />
                <span>Generador de Nómina Bancaria de Pagos</span>
              </h3>
              <p className="text-xs text-slate-500">
                Marca los documentos o facturas a pagar para exportar el archivo listo para transferencias masivas.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-700">Formato Bancario:</span>
              <select
                value={selectedBankFormat}
                onChange={(e) => setSelectedBankFormat(e.target.value as any)}
                className="bg-white border border-slate-300 text-slate-800 rounded px-2.5 py-1 text-xs font-bold focus:outline-none"
              >
                <option value="CHILE">Banco de Chile</option>
                <option value="SANTANDER">Banco Santander</option>
                <option value="BCI">Banco BCI</option>
                <option value="BANCOESTADO">BancoEstado</option>
                <option value="EXCEL">Planilla Estándar Excel</option>
              </select>

              <button
                type="button"
                onClick={handleExportPayrollFile}
                disabled={selectedForPayroll.length === 0}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Exportar Nómina ({selectedForPayroll.length})</span>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-700 bg-indigo-50/60 p-2.5 rounded-lg border border-indigo-100">
            <div>
              Total Partidas Seleccionadas: <strong>{selectedForPayroll.length}</strong> de {pendingPayablesRows.length}
            </div>
            <div className="font-mono text-sm font-bold text-indigo-900">
              Monto Total a Pagar: ${payrollTotalAmount.toLocaleString('es-CL')}
            </div>
          </div>

          <div className="overflow-x-auto max-h-[480px]">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-900 text-white font-mono sticky top-0 z-10">
                <tr>
                  <th className="p-2 w-8 text-center">
                    <input
                      type="checkbox"
                      checked={selectedForPayroll.length === pendingPayablesRows.length && pendingPayablesRows.length > 0}
                      onChange={() => {
                        if (selectedForPayroll.length === pendingPayablesRows.length) {
                          setSelectedRowIds(new Set());
                        } else {
                          setSelectedRowIds(new Set(pendingPayablesRows.map(r => r.id)));
                        }
                      }}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-0"
                    />
                  </th>
                  <th className="p-2">Fecha</th>
                  <th className="p-2">Documento / Folio</th>
                  <th className="p-2">RUT Beneficiario</th>
                  <th className="p-2">Proveedor / Razón Social</th>
                  <th className="p-2">Banco Destino</th>
                  <th className="p-2">N° Cuenta</th>
                  <th className="p-2 text-right">Monto a Transferir ($)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {pendingPayablesRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-500">
                      No hay partidas de pasivo o proveedores pendientes para generar nómina.
                    </td>
                  </tr>
                ) : (
                  pendingPayablesRows.map(r => {
                    const isSelected = selectedRowIds.has(r.id);
                    const aux = auxiliaries.find(a => (a.rut || '').replace(/[^0-9kK]/g, '') === (r.auxiliaryRut || '').replace(/[^0-9kK]/g, ''));
                    const bank = aux?.banco || (aux as any)?.bankDetails?.bankName || 'Banco de Chile';
                    const accNum = aux?.numeroCuenta || (aux as any)?.bankDetails?.accountNumber || '0000000000';
                    const amount = r.credit || r.debit || 0;

                    return (
                      <tr
                        key={r.id}
                        onClick={() => handleToggleRow(r.id)}
                        className={`hover:bg-indigo-50 cursor-pointer ${isSelected ? 'bg-indigo-50 font-bold' : ''}`}
                      >
                        <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleRow(r.id)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-0"
                          />
                        </td>
                        <td className="p-2 font-mono">{r.date}</td>
                        <td className="p-2 font-mono">{r.folio || r.voucherNumber}</td>
                        <td className="p-2 font-mono text-slate-900">{r.auxiliaryRut || '-'}</td>
                        <td className="p-2">{r.auxiliaryName || '-'}</td>
                        <td className="p-2 text-slate-600">{bank}</td>
                        <td className="p-2 font-mono text-slate-600">{accNum}</td>
                        <td className="p-2 text-right font-mono font-bold text-slate-900">${amount.toLocaleString('es-CL')}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* VISTA 5: COMPARATIVO DE COSTOS (PERÍODOS / AÑOS)             */}
      {/* ============================================================= */}
      {activeViewMode === 'COMPARATIVO' && (
        <div className="bg-white rounded-xl border border-slate-300 shadow-sm p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-700">Dimensión a Comparar:</span>
              <select
                value={comparisonDimension}
                onChange={(e) => setComparisonDimension(e.target.value as any)}
                className="bg-white border border-slate-300 text-slate-900 rounded px-2.5 py-1 text-xs font-bold focus:outline-none"
              >
                <option value="COST_CENTER">Centros de Costo</option>
                <option value="ACCOUNT">Cuentas Contables</option>
                <option value="EXPENSE_ITEM">Ítems de Gasto</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">Período Base:</span>
              <input
                type="text"
                value={comparisonPeriod1}
                onChange={(e) => setComparisonPeriod1(e.target.value)}
                placeholder="2025"
                className="w-20 bg-white border border-slate-300 rounded px-2 py-1 font-mono text-xs font-bold text-center"
              />
              <span className="text-xs font-bold text-slate-500">vs</span>
              <span className="text-xs font-bold text-slate-700">Período Comparado:</span>
              <input
                type="text"
                value={comparisonPeriod2}
                onChange={(e) => setComparisonPeriod2(e.target.value)}
                placeholder="2026"
                className="w-20 bg-white border border-slate-300 rounded px-2 py-1 font-mono text-xs font-bold text-center"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-900 text-white font-mono">
                <tr>
                  <th className="p-2.5">Concepto / Dimensión</th>
                  <th className="p-2.5 text-right">Período {comparisonPeriod1} ($)</th>
                  <th className="p-2.5 text-right">Período {comparisonPeriod2} ($)</th>
                  <th className="p-2.5 text-right">Variación ($)</th>
                  <th className="p-2.5 text-right">Variación (%)</th>
                  <th className="p-2.5 text-center">Tendencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {comparisonResults.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-500">
                      No hay movimientos para contrastar entre los períodos {comparisonPeriod1} y {comparisonPeriod2}.
                    </td>
                  </tr>
                ) : (
                  comparisonResults.map(item => {
                    const isIncrease = item.diff > 0;
                    return (
                      <tr key={item.label} className="hover:bg-slate-50 font-medium">
                        <td className="p-2.5 font-bold text-slate-900">{item.label}</td>
                        <td className="p-2.5 text-right font-mono text-slate-700">${item.amountP1.toLocaleString('es-CL')}</td>
                        <td className="p-2.5 text-right font-mono text-slate-700">${item.amountP2.toLocaleString('es-CL')}</td>
                        <td className={`p-2.5 text-right font-mono font-bold ${isIncrease ? 'text-rose-700' : 'text-emerald-700'}`}>
                          {isIncrease ? '+' : ''}${item.diff.toLocaleString('es-CL')}
                        </td>
                        <td className={`p-2.5 text-right font-mono font-bold ${isIncrease ? 'text-rose-700' : 'text-emerald-700'}`}>
                          {item.pct > 0 ? '+' : ''}{item.pct.toFixed(1)}%
                        </td>
                        <td className="p-2.5 text-center">
                          {isIncrease ? (
                            <span className="inline-flex items-center gap-1 text-rose-700 font-bold text-[11px]">
                              <TrendingUp className="w-3.5 h-3.5" />
                              <span>Mayor Gasto</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-bold text-[11px]">
                              <TrendingDown className="w-3.5 h-3.5" />
                              <span>Ahorro</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* MODAL: SELECCIONAR MÚLTIPLES CUENTAS CONTABLES                */}
      {/* ============================================================= */}
      {showMultiAccountModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600" />
                <span>Seleccionar Múltiples Cuentas Contables</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowMultiAccountModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-64 overflow-y-auto space-y-1 divide-y divide-slate-100 text-xs">
              {accounts.map(acc => {
                const isSelected = selectedAccountCodes.includes(acc.code);
                return (
                  <label
                    key={acc.id}
                    className="flex items-center gap-2.5 p-1.5 hover:bg-slate-50 cursor-pointer rounded"
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {
                        setSelectedAccountCodes(prev => {
                          const next = prev.includes(acc.code)
                            ? prev.filter(c => c !== acc.code)
                            : [...prev, acc.code];
                          setAccountCodeInput(next.join(', '));
                          return next;
                        });
                      }}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-0"
                    />
                    <span className="font-mono font-bold text-slate-900">{acc.code}</span>
                    <span className="text-slate-700 truncate">{acc.name}</span>
                    <span className="ml-auto text-[10px] text-slate-400 font-mono">{acc.type}</span>
                  </label>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setSelectedAccountCodes([]);
                  setAccountCodeInput('');
                }}
                className="text-xs text-rose-600 hover:underline font-bold"
              >
                Limpiar Selección
              </button>
              <button
                type="button"
                onClick={() => setShowMultiAccountModal(false)}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold"
              >
                Aplicar Cuentas ({selectedAccountCodes.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* MODAL: GRABAR INFORME / CONSULTA PERSONALIZADA               */}
      {/* ============================================================= */}
      {isSaveModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Save className="w-5 h-5 text-indigo-600" />
                <span>Grabar Informe Personalizado</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsSaveModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nombre del Informe / Consulta *</label>
                <input
                  type="text"
                  value={queryNameInput}
                  onChange={(e) => setQueryNameInput(e.target.value)}
                  placeholder="Ej: Análisis Banco & Proveedores 2026..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Descripción (Opcional)</label>
                <textarea
                  rows={2}
                  value={queryDescInput}
                  onChange={(e) => setQueryDescInput(e.target.value)}
                  placeholder="Objetivo o uso de este informe..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-[11px] text-slate-600 space-y-1">
                <div><strong>Fuente:</strong> {sourceType}</div>
                <div><strong>Cuentas:</strong> {selectedAccountCodes.join(', ') || 'Todas'}</div>
                <div><strong>Fecha Corte:</strong> {normalizedCutoffDate}</div>
                <div><strong>Herramienta:</strong> {activeViewMode}</div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsSaveModalOpen(false)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveCurrentQuery}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold"
              >
                Grabar Consulta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* MODAL: REPLICAR ESTRUCTURA A OTRAS EMPRESAS DEL ESTUDIO       */}
      {/* ============================================================= */}
      {isReplicateModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Copy className="w-5 h-5 text-blue-600" />
                <span>Replicar Estructura a Otras Empresas</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsReplicateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Copia la definición y configuración de este informe a las demás empresas que tienes asignadas en el estudio contable.
            </p>

            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700">Empresas Destino Disponibles:</span>
              <button
                type="button"
                onClick={handleSelectAllTargetCompanies}
                className="text-indigo-600 hover:underline font-bold"
              >
                {selectedTargetCompanyIds.size === studyCompanies.length ? 'Deseleccionar Todas' : 'Seleccionar Todas'}
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-1.5 border border-slate-200 rounded-lg p-2 text-xs">
              {loadingStudyCompanies ? (
                <div className="p-4 text-center text-slate-400">Cargando empresas del estudio...</div>
              ) : studyCompanies.length === 0 ? (
                <div className="p-4 text-center text-slate-500">No hay otras empresas registradas en este estudio.</div>
              ) : (
                studyCompanies.map(c => {
                  const isChecked = selectedTargetCompanyIds.has(c.id);
                  return (
                    <label
                      key={c.id}
                      className="flex items-center gap-2.5 p-2 hover:bg-slate-50 cursor-pointer rounded border border-transparent hover:border-slate-200"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleTargetCompany(c.id)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-0"
                      />
                      <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                      <div>
                        <span className="font-bold text-slate-900 block">{c.name}</span>
                        <span className="font-mono text-[10px] text-slate-500">RUT: {c.rut}</span>
                      </div>
                    </label>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsReplicateModalOpen(false)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExecuteReplication}
                disabled={selectedTargetCompanyIds.size === 0 || isReplicating}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors"
              >
                {isReplicating ? 'Replicando...' : `Replicar a ${selectedTargetCompanyIds.size} Empresa(s)`}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
