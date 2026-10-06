import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db, auth } from '../lib/firebase';
import {
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  updateDoc
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
  Table,
  Search,
  Filter,
  Download,
  Printer,
  Sparkles,
  Save,
  Trash2,
  Edit2,
  FolderOpen,
  Calendar,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Plus,
  Play,
  RotateCcw,
  Check,
  X,
  ExternalLink,
  ChevronDown,
  Layers,
  FileSpreadsheet,
  ArrowRight,
  Calculator
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
  onVouchersUpdated?: () => void;
  onOpenVoucher?: (voucherRef: Voucher | string | number) => void;
  initialAccountCode?: string;
  onBackToTraditionalAnalysis?: () => void;
}

// Plantillas de fábrica estándar listas para usar
const FACTORY_TEMPLATES: SavedAccountingQuery[] = [
  {
    id: 'tpl_prov_pendientes',
    name: '📥 Facturas de Proveedores Pendientes a Hoy',
    description: 'Lista todas las facturas y documentos de compras por pagar a la fecha actual.',
    sourceType: 'PROVEEDORES_RCV',
    cutoffDate: 'HOY',
    statusFilter: 'PENDIENTES',
    isPredefined: true
  },
  {
    id: 'tpl_clientes_pendientes',
    name: '📤 Facturas de Clientes Pendientes de Cobro',
    description: 'Documentos de venta emitidos con saldo pendiente de cobranza a hoy.',
    sourceType: 'CLIENTES_RCV',
    cutoffDate: 'HOY',
    statusFilter: 'PENDIENTES',
    isPredefined: true
  },
  {
    id: 'tpl_mayor_1101001',
    name: '📘 Mayor Cuenta 1101001 (Bancos / Caja) al 30-04-2026',
    description: 'Movimientos del Libro Mayor y saldo acumulado al 30 de abril de 2026.',
    sourceType: 'MAYOR',
    accountCode: '1101001',
    cutoffDate: '2026-04-30',
    statusFilter: 'TODOS',
    isPredefined: true
  },
  {
    id: 'tpl_clientes_partidas_abiertas',
    name: '⚖️ Partidas Abiertas Clientes (1104001) por Compensar',
    description: 'Facturas, notas de crédito y abonos vivos de clientes pendientes de calce.',
    sourceType: 'PARTIDAS_ABIERTAS',
    accountCode: '1104001',
    cutoffDate: 'HOY',
    statusFilter: 'PENDIENTES',
    isPredefined: true
  },
  {
    id: 'tpl_proveedores_partidas_abiertas',
    name: '⚖️ Partidas Abiertas Proveedores (2101001) por Compensar',
    description: 'Facturas de proveedores y notas de crédito pendientes de calzar.',
    sourceType: 'PARTIDAS_ABIERTAS',
    accountCode: '2101001',
    cutoffDate: 'HOY',
    statusFilter: 'PENDIENTES',
    isPredefined: true
  },
  {
    id: 'tpl_cartola_bancaria_pendientes',
    name: '🏦 Cartola Bancaria - Movimientos Pendientes a la Fecha',
    description: 'Movimientos de cartola sin comprobante contable conciliado.',
    sourceType: 'BANCO_CARTOLA',
    cutoffDate: 'HOY',
    statusFilter: 'PENDIENTES',
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
  onVouchersUpdated,
  onOpenVoucher,
  initialAccountCode,
  onBackToTraditionalAnalysis
}: PlanillaConsultasDinamicasViewProps) {
  // Parámetros de la celda de consulta
  const [sourceType, setSourceType] = useState<SavedAccountingQuery['sourceType']>('MAYOR');
  const [accountCodeInput, setAccountCodeInput] = useState<string>(initialAccountCode || '1101001');
  const [cutoffDateInput, setCutoffDateInput] = useState<string>('30.04.2026');
  const [statusFilter, setStatusFilter] = useState<'TODOS' | 'PENDIENTES' | 'COMPENSADOS'>('TODOS');
  const [rutFilterInput, setRutFilterInput] = useState<string>('');

  // Estados de interfaz y biblioteca de consultas
  const [savedQueries, setSavedQueries] = useState<SavedAccountingQuery[]>([]);
  const [selectedQueryId, setSelectedQueryId] = useState<string>('');
  const [isSaveModalOpen, setIsSaveModalOpen] = useState<boolean>(false);
  const [queryNameInput, setQueryNameInput] = useState<string>('');
  const [queryDescInput, setQueryDescInput] = useState<string>('');

  // Calces contables registrados en la empresa (para determinar estado de compensación)
  const [matches, setMatches] = useState<AccountMatch[]>([]);
  const [loadingMatches, setLoadingMatches] = useState<boolean>(false);

  // Filtro de búsqueda rápida en la grilla
  const [tableSearch, setTableSearch] = useState<string>('');
  const [sortField, setSortField] = useState<'date' | 'folio' | 'debit' | 'credit' | 'balance'>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Selección de filas para compensación in-situ
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [isCompensating, setIsCompensating] = useState<boolean>(false);

  // Cargar calces desde Firestore
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

  // Cargar consultas guardadas desde Firestore
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

  useEffect(() => {
    fetchMatches();
    fetchSavedQueries();
  }, [fetchMatches, fetchSavedQueries]);

  // Mapa rápido de líneas calzadas: `${voucherId}_${lineIndex}` -> matchId
  const matchedLinesMap = useMemo(() => {
    const map = new Map<string, string>();
    matches.forEach(m => {
      m.matchedLines.forEach(l => {
        map.set(`${l.voucherId}_${l.lineIndex}`, m.id);
      });
    });
    return map;
  }, [matches]);

  // Normalizar fecha de corte (acepta "HOY", "30.04.2026", "30-04-2026", "2026-04-30")
  const normalizedCutoffDate = useMemo(() => {
    const raw = (cutoffDateInput || '').trim().toUpperCase();
    if (!raw || raw === 'HOY' || raw === 'TODAY' || raw === 'ACTUAL') {
      return new Date().toISOString().slice(0, 10);
    }
    // Formato DD.MM.YYYY o DD-MM-YYYY
    const chileanMatch = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (chileanMatch) {
      const d = chileanMatch[1].padStart(2, '0');
      const m = chileanMatch[2].padStart(2, '0');
      const y = chileanMatch[3];
      return `${y}-${m}-${d}`;
    }
    // Formato YYYY-MM-DD
    const isoMatch = raw.match(/^\d{4}-\d{2}-\d{2}$/);
    if (isoMatch) return raw;

    // Fallback: Si solo pone año o mes
    if (/^\d{4}$/.test(raw)) return `${raw}-12-31`;
    return new Date().toISOString().slice(0, 10);
  }, [cutoffDateInput]);

  // Autocompletado de cuenta
  const matchedAccount = useMemo(() => {
    const codeClean = accountCodeInput.trim().replace(/[^0-9]/g, '');
    if (!codeClean) return null;
    return accounts.find(a => a.code.replace(/[^0-9]/g, '') === codeClean) || null;
  }, [accountCodeInput, accounts]);

  // Generador de fórmula visible estilo Excel
  const excelFormulaPreview = useMemo(() => {
    const parts = [`FUENTE="${sourceType}"`];
    if (accountCodeInput.trim()) parts.push(`CUENTA="${accountCodeInput.trim()}"`);
    if (cutoffDateInput.trim()) parts.push(`CORTE="${cutoffDateInput.trim()}"`);
    if (statusFilter !== 'TODOS') parts.push(`ESTADO="${statusFilter}"`);
    if (rutFilterInput.trim()) parts.push(`RUT="${rutFilterInput.trim()}"`);
    return `=CONSULTA_CONTABLE(${parts.join('; ')})`;
  }, [sourceType, accountCodeInput, cutoffDateInput, statusFilter, rutFilterInput]);

  // -------------------------------------------------------------
  // MOTOR DE CONSULTAS DINÁMICAS (QUERY ENGINE)
  // -------------------------------------------------------------
  const queryResultRows = useMemo(() => {
    let rows: PlanillaRow[] = [];
    let runningBalance = 0;

    const rutClean = rutFilterInput.trim().toLowerCase().replace(/[^0-9kK]/g, '');
    const accountCodeClean = accountCodeInput.trim().replace(/[^0-9]/g, '');

    // 1. FUENTE: LIBRO MAYOR (Cuentas contables)
    if (sourceType === 'MAYOR' || sourceType === 'PARTIDAS_ABIERTAS') {
      const allLines: {
        v: Voucher;
        l: any;
        lineIdx: number;
      }[] = [];

      vouchers.forEach(v => {
        if (v.status === 'Anulado') return;
        const vDate = v.date || '';
        if (vDate > normalizedCutoffDate) return;

        v.lines.forEach((l, idx) => {
          // Filtrar por cuenta si está especificada
          if (accountCodeClean) {
            const lCode = (l.accountCode || '').replace(/[^0-9]/g, '');
            if (lCode !== accountCodeClean && l.accountId !== matchedAccount?.id) {
              return;
            }
          }
          // Filtrar por RUT si se especificó
          if (rutClean) {
            const lRut = (l.auxiliaryRut || '').toLowerCase().replace(/[^0-9kK]/g, '');
            if (!lRut.includes(rutClean)) return;
          }

          allLines.push({ v, l, lineIdx: idx });
        });
      });

      // Orden cronológico para cálculo de saldo acumulado
      allLines.sort((a, b) => (a.v.date || '').localeCompare(b.v.date || '') || (a.v.voucherNumber || 0) - (b.v.voucherNumber || 0));

      allLines.forEach(({ v, l, lineIdx }, idx) => {
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
          docType: l.documentType || (v.type === 'Ingreso' ? 'INGRESO' : v.type === 'Egreso' ? 'EGRESO' : 'TRASPASO'),
          folio: l.documentRef || v.voucherNumber,
          accountCode: l.accountCode || '',
          accountName: l.accountName || '',
          auxiliaryRut: l.auxiliaryRut || '',
          auxiliaryName: l.auxiliaryName || '',
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

    // 2. FUENTE: FACTURAS DE PROVEEDORES (RCV COMPRAS)
    else if (sourceType === 'PROVEEDORES_RCV') {
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
          accountCode: accountCodeClean || '2101001',
          accountName: 'PROVEEDORES NACIONALES',
          auxiliaryRut: d.rutEmisor || '',
          auxiliaryName: d.razonSocialEmisor || '',
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
          accountCode: accountCodeClean || '1104001',
          accountName: 'CLIENTES POR VENTAS',
          auxiliaryRut: d.rutReceptor || '',
          auxiliaryName: d.razonSocialReceptor || '',
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
    vouchers,
    rcvDocuments,
    accountCodeInput,
    matchedAccount,
    normalizedCutoffDate,
    statusFilter,
    rutFilterInput,
    matchedLinesMap
  ]);

  // Filtrado de búsqueda instantánea en la grilla y ordenamiento
  const displayRows = useMemo(() => {
    let list = [...queryResultRows];

    if (tableSearch.trim()) {
      const q = tableSearch.toLowerCase().trim();
      list = list.filter(r =>
        (r.date || '').includes(q) ||
        String(r.voucherNumber || '').includes(q) ||
        String(r.folio || '').includes(q) ||
        (r.auxiliaryRut || '').toLowerCase().includes(q) ||
        (r.auxiliaryName || '').toLowerCase().includes(q) ||
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

  // Cálculos de selección multilínea (para compensación directa)
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

  // Toggle de selección de fila
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
        accountName: matchedAccount?.name || 'Compensación Planilla Inteligente',
        matchedLines: matchedLinesRef,
        totalAmount: selectedDebitSum,
        matchDate: new Date().toISOString(),
        matchedBy: auth.currentUser?.email || 'Contador Planilla Dinámica',
        notes: `Calce manual desde Planilla de Consultas Dinámicas (${debitRows.length} déb. vs ${creditRows.length} créd.)`,
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
  const handleLoadQuery = (query: SavedAccountingQuery) => {
    setSelectedQueryId(query.id);
    setSourceType(query.sourceType);
    if (query.accountCode !== undefined) setAccountCodeInput(query.accountCode);
    if (query.cutoffDate !== undefined) setCutoffDateInput(query.cutoffDate);
    if (query.statusFilter !== undefined) setStatusFilter(query.statusFilter);
    if (query.rutFilter !== undefined) setRutFilterInput(query.rutFilter);
    setSelectedRowIds(new Set());
    notify.info(`Consulta cargada: ${query.name}`, 'Plantilla Aplicada');
  };

  const handleSaveCurrentQuery = async () => {
    if (!queryNameInput.trim() || !company?.id) {
      notify.warning('Indique un nombre descriptivo para guardar esta consulta.');
      return;
    }

    try {
      const qId = selectedQueryId && !selectedQueryId.startsWith('tpl_')
        ? selectedQueryId
        : `query_${Date.now()}`;

      const queryData: SavedAccountingQuery = {
        id: qId,
        name: queryNameInput.trim(),
        description: queryDescInput.trim() || undefined,
        sourceType,
        accountCode: accountCodeInput.trim() || undefined,
        accountName: matchedAccount?.name,
        cutoffDate: cutoffDateInput.trim() || undefined,
        statusFilter,
        rutFilter: rutFilterInput.trim() || undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: auth.currentUser?.email || undefined
      };

      await setDoc(
        doc(db, 'studies', studyId, 'companies', company.id, 'savedAccountingQueries', qId),
        queryData
      );

      setSavedQueries(prev => {
        const filtered = prev.filter(q => q.id !== qId);
        return [...filtered, queryData];
      });
      setSelectedQueryId(qId);
      setIsSaveModalOpen(false);
      setQueryNameInput('');
      setQueryDescInput('');
      notify.success(`Consulta guardada como plantilla: "${queryData.name}"`, 'Consulta Guardada');
    } catch (err: any) {
      console.error('Error guardando consulta:', err);
      notify.error('No se pudo guardar la consulta: ' + err.message);
    }
  };

  const handleDeleteSavedQuery = async (queryId: string) => {
    if (queryId.startsWith('tpl_')) {
      notify.warning('Las plantillas predefinidas del sistema no se pueden eliminar.');
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
  // EXPORTAR A EXCEL NATIVO (.xlsx)
  // -------------------------------------------------------------
  const handleExportExcel = () => {
    if (displayRows.length === 0) {
      notify.warning('No hay datos en la planilla para exportar.');
      return;
    }

    const header = [
      ['GESTOR CONTABLE - REPORTE Y PLANILLA DINÁMICA DE CONSULTAS'],
      [`Empresa: ${company.name} | RUT: ${company.rut}`],
      [`Fecha de Emisión: ${new Date().toLocaleDateString('es-CL')} | Fecha Corte Consulta: ${normalizedCutoffDate}`],
      [`Fórmula: ${excelFormulaPreview}`],
      []
    ];

    const tableHeaders = [
      '#',
      'Fecha',
      'Asiento / Folio',
      'Tipo Doc',
      'Cuenta Código',
      'Cuenta Nombre',
      'RUT Auxiliar',
      'Razón Social / Beneficiario',
      'Glosa / Concepto',
      'Cargo / Debe ($)',
      'Abono / Haber ($)',
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
      `Total ${displayRows.length} registros`,
      tableTotals.totalDebit,
      tableTotals.totalCredit,
      tableTotals.netBalance,
      ''
    ];

    const fullSheet = [...header, tableHeaders, ...dataRows, [], totalRow];
    const ws = XLSX.utils.aoa_to_sheet(fullSheet);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Planilla Dinámica');

    const fileName = `Planilla_${sourceType}_${normalizedCutoffDate}.xlsx`;
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
          <title>Planilla Dinámica - ${company.name}</title>
          <style>
            body { font-family: -apple-system, sans-serif; font-size: 11px; color: #0f172a; padding: 20px; }
            h1 { font-size: 16px; margin: 0 0 4px 0; }
            .sub { color: #64748b; font-size: 11px; margin-bottom: 15px; }
            .formula { background: #f1f5f9; padding: 6px 10px; font-family: monospace; font-size: 10px; border-radius: 4px; margin-bottom: 15px; }
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
          <div class="formula">${excelFormulaPreview}</div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Fecha</th>
                <th>Doc/Asiento</th>
                <th>RUT</th>
                <th>Razón Social</th>
                <th>Glosa</th>
                <th class="num">Debe ($)</th>
                <th class="num">Haber ($)</th>
                <th class="num">Saldo ($)</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              ${displayRows.map((r, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td>${r.date}</td>
                  <td>${r.folio || r.voucherNumber || '-'}</td>
                  <td>${r.auxiliaryRut || '-'}</td>
                  <td>${r.auxiliaryName || '-'}</td>
                  <td>${r.gloss}</td>
                  <td class="num">${r.debit > 0 ? '$' + r.debit.toLocaleString('es-CL') : '-'}</td>
                  <td class="num">${r.credit > 0 ? '$' + r.credit.toLocaleString('es-CL') : '-'}</td>
                  <td class="num">$${r.runningBalance.toLocaleString('es-CL')}</td>
                  <td>${r.status}</td>
                </tr>
              `).join('')}
              <tr class="total-row">
                <td colspan="6">TOTALES (${displayRows.length} registros)</td>
                <td class="num">$${tableTotals.totalDebit.toLocaleString('es-CL')}</td>
                <td class="num">$${tableTotals.totalCredit.toLocaleString('es-CL')}</td>
                <td class="num">$${tableTotals.netBalance.toLocaleString('es-CL')}</td>
                <td></td>
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

  const allAvailableTemplates = [...FACTORY_TEMPLATES, ...savedQueries];

  return (
    <div className="space-y-4 font-sans text-slate-800 animate-in fade-in duration-200">
      
      {/* --- CABECERA PRINCIPAL ESTILO STUDIO CONTABLE --- */}
      <div className="bg-slate-900 text-white p-4 rounded-xl shadow-sm border border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-white shadow-md">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold tracking-tight">Planilla Dinámica de Consultas (SQL-Excel)</h2>
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                Motor Inteligente
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Genera reportes a la medida, consulta el Mayor por fecha de corte, analiza facturas pendientes y compensa partidas en vivo.
            </p>
          </div>
        </div>

        {/* Acciones de Cabecera: Plantillas, Exportar, Volver */}
        <div className="flex items-center gap-2 flex-wrap">
          {onBackToTraditionalAnalysis && (
            <button
              type="button"
              onClick={onBackToTraditionalAnalysis}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <span>⚖️ Ver Calce Tradicional</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setQueryNameInput(selectedQueryId ? allAvailableTemplates.find(q => q.id === selectedQueryId)?.name || '' : '');
              setIsSaveModalOpen(true);
            }}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
            title="Guardar la configuración actual de celdas como plantilla reutilizable"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Guardar Consulta</span>
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
            title="Descargar esta consulta exacta en formato Excel (.xlsx)"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Excel (.xlsx)</span>
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

      {/* --- SELECTOR DE CONSULTAS GUARDADAS / PLANTILLAS PREDEFINIDAS --- */}
      <div className="bg-slate-100 p-2.5 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <FolderOpen className="w-4 h-4 text-indigo-600 shrink-0" />
          <span className="font-bold text-slate-700 whitespace-nowrap">Biblioteca de Consultas:</span>
          <select
            value={selectedQueryId}
            onChange={(e) => {
              const q = allAvailableTemplates.find(t => t.id === e.target.value);
              if (q) handleLoadQuery(q);
              else setSelectedQueryId('');
            }}
            className="bg-white border border-slate-300 text-slate-800 rounded px-2.5 py-1 text-xs font-medium focus:ring-1 focus:ring-indigo-500 focus:outline-none max-w-sm truncate"
          >
            <option value="">-- Cargar una plantilla o consulta guardada --</option>
            <optgroup label="Plantillas Estándar del Sistema">
              {FACTORY_TEMPLATES.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </optgroup>
            {savedQueries.length > 0 && (
              <optgroup label="Mis Consultas Guardadas (Empresa)">
                {savedQueries.map(q => (
                  <option key={q.id} value={q.id}>⭐ {q.name}</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        {selectedQueryId && (
          <div className="flex items-center gap-2 text-[11px] text-slate-600">
            <span className="italic">
              {allAvailableTemplates.find(t => t.id === selectedQueryId)?.description || 'Consulta cargada'}
            </span>
            {!selectedQueryId.startsWith('tpl_') && (
              <button
                type="button"
                onClick={() => handleDeleteSavedQuery(selectedQueryId)}
                className="text-rose-600 hover:text-rose-800 font-bold hover:underline flex items-center gap-1"
                title="Eliminar esta consulta guardada"
              >
                <Trash2 className="w-3 h-3" />
                <span>Eliminar</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* --- BARRA DE CELDAS DINÁMICAS ESTILO EXCEL (A1 a A5) --- */}
      <div className="bg-white rounded-xl border border-slate-300 shadow-sm overflow-hidden">
        
        {/* Encabezado de Celdas Excel */}
        <div className="bg-slate-50 border-b border-slate-200 px-3 py-1.5 flex items-center justify-between text-[11px] font-mono text-slate-500 font-semibold">
          <div className="flex items-center gap-2">
            <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-black">CELDAS DE PARÁMETROS</span>
            <span>Edita las celdas A1 a A5 para recalcular la planilla en vivo:</span>
          </div>
          <div className="flex items-center gap-2 text-indigo-700 font-sans font-semibold">
            <span>Fórmula Activa:</span>
          </div>
        </div>

        {/* Fila de Celdas Interactivas */}
        <div className="p-3 grid grid-cols-1 md:grid-cols-12 gap-3 bg-white">
          
          {/* CELDA A1: FUENTE DE DATOS */}
          <div className="md:col-span-3 border border-slate-300 rounded-lg p-2 bg-slate-50/50 hover:border-indigo-400 transition-colors focus-within:ring-2 focus-within:ring-indigo-400">
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1 rounded">A1</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Fuente de Datos</span>
            </div>
            <select
              value={sourceType}
              onChange={(e) => {
                setSourceType(e.target.value as any);
                setSelectedRowIds(new Set());
              }}
              className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs font-bold text-slate-900 focus:outline-none"
            >
              <option value="MAYOR">📘 Libro Mayor / Cuentas</option>
              <option value="PROVEEDORES_RCV">📥 Facturas por Pagar (Compras)</option>
              <option value="CLIENTES_RCV">📤 Facturas por Cobrar (Ventas)</option>
              <option value="PARTIDAS_ABIERTAS">⚖️ Partidas Abiertas por Calzar</option>
            </select>
          </div>

          {/* CELDA A2: CUENTA CONTABLE */}
          <div className="md:col-span-3 border border-slate-300 rounded-lg p-2 bg-slate-50/50 hover:border-indigo-400 transition-colors focus-within:ring-2 focus-within:ring-indigo-400">
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1 rounded">A2</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Cuenta / Código</span>
            </div>
            <div className="relative">
              <input
                type="text"
                value={accountCodeInput}
                onChange={(e) => setAccountCodeInput(e.target.value)}
                placeholder="Ej: 1101001, 1104001..."
                className="w-full bg-white border border-slate-300 rounded px-2 py-1 font-mono text-xs font-bold text-indigo-950 focus:outline-none"
              />
              {matchedAccount && (
                <span className="block text-[10px] text-slate-600 truncate mt-0.5" title={matchedAccount.name}>
                  {matchedAccount.code} - {matchedAccount.name}
                </span>
              )}
            </div>
          </div>

          {/* CELDA A3: FECHA DE CORTE */}
          <div className="md:col-span-2 border border-slate-300 rounded-lg p-2 bg-slate-50/50 hover:border-indigo-400 transition-colors focus-within:ring-2 focus-within:ring-indigo-400">
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1 rounded">A3</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Fecha de Corte</span>
            </div>
            <input
              type="text"
              value={cutoffDateInput}
              onChange={(e) => setCutoffDateInput(e.target.value)}
              placeholder="HOY, 30.04.2026..."
              className="w-full bg-white border border-slate-300 rounded px-2 py-1 font-mono text-xs font-bold text-slate-900 focus:outline-none"
            />
            <div className="flex gap-1 mt-1">
              <button
                type="button"
                onClick={() => setCutoffDateInput('HOY')}
                className="text-[9px] bg-slate-200 hover:bg-slate-300 text-slate-700 px-1 rounded font-bold"
              >
                Hoy
              </button>
              <button
                type="button"
                onClick={() => setCutoffDateInput('30.04.2026')}
                className="text-[9px] bg-slate-200 hover:bg-slate-300 text-slate-700 px-1 rounded font-bold"
              >
                30.04.2026
              </button>
            </div>
          </div>

          {/* CELDA A4: ESTADO DE PARTIDAS */}
          <div className="md:col-span-2 border border-slate-300 rounded-lg p-2 bg-slate-50/50 hover:border-indigo-400 transition-colors focus-within:ring-2 focus-within:ring-indigo-400">
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1 rounded">A4</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Estado</span>
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs font-bold text-slate-900 focus:outline-none"
            >
              <option value="TODOS">Todas las Partidas</option>
              <option value="PENDIENTES">⏳ Solo Pendientes</option>
              <option value="COMPENSADOS">✓ Solo Compensadas</option>
            </select>
          </div>

          {/* CELDA A5: RUT / AUXILIAR OPCIONAL */}
          <div className="md:col-span-2 border border-slate-300 rounded-lg p-2 bg-slate-50/50 hover:border-indigo-400 transition-colors focus-within:ring-2 focus-within:ring-indigo-400">
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1 rounded">A5</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">RUT (Opcional)</span>
            </div>
            <input
              type="text"
              value={rutFilterInput}
              onChange={(e) => setRutFilterInput(e.target.value)}
              placeholder="Ej: 76123456-7"
              className="w-full bg-white border border-slate-300 rounded px-2 py-1 font-mono text-xs font-semibold text-slate-900 focus:outline-none"
            />
          </div>
        </div>

        {/* Barra de Fórmula Dinámica fx */}
        <div className="bg-slate-900 px-3 py-1.5 flex items-center gap-2 border-t border-slate-800 text-xs text-white font-mono">
          <span className="font-serif italic font-bold text-indigo-300 text-sm">fx</span>
          <span className="text-slate-400">|</span>
          <input
            type="text"
            readOnly
            value={excelFormulaPreview}
            className="w-full bg-transparent text-emerald-400 focus:outline-none font-mono text-xs select-all"
            title="Fórmula equivalente calculada en tiempo real"
          />
          <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700 whitespace-nowrap font-sans">
            Fecha corte: <strong className="text-white font-mono">{normalizedCutoffDate}</strong>
          </span>
        </div>
      </div>

      {/* --- BARRA DE ACCIÓN Y COMPENSACIÓN SI HAY FILAS MARCADAS --- */}
      {selectedRows.length > 0 && (
        <div className="bg-indigo-900 text-white p-3 rounded-xl shadow-lg border border-indigo-700 flex flex-col md:flex-row items-center justify-between gap-3 animate-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-700 flex items-center justify-center font-bold text-white">
              {selectedRows.length}
            </div>
            <div>
              <span className="font-bold text-xs uppercase tracking-wider text-indigo-200">
                Partidas Seleccionadas para Compensación / Calce:
              </span>
              <div className="flex items-center gap-3 text-xs font-mono font-bold mt-0.5">
                <span>Cargos (Debe): <strong className="text-emerald-300">${selectedDebitSum.toLocaleString('es-CL')}</strong></span>
                <span>Abonos (Haber): <strong className="text-rose-300">${selectedCreditSum.toLocaleString('es-CL')}</strong></span>
                <span className={`px-2 py-0.5 rounded text-[11px] font-black ${selectedDifference === 0 ? 'bg-emerald-500 text-white' : 'bg-amber-400 text-slate-950'}`}>
                  {selectedDifference === 0 ? '✓ Cuadre Exacto ($0)' : `Diferencia: $${selectedDifference.toLocaleString('es-CL')}`}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedRowIds(new Set())}
              className="px-3 py-1.5 bg-indigo-800 hover:bg-indigo-700 text-indigo-200 text-xs font-bold rounded-lg transition-colors"
            >
              Desmarcar
            </button>
            <button
              type="button"
              disabled={!canCompensateSelection || isCompensating}
              onClick={handleExecuteCompensation}
              className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-md transition-all ${
                canCompensateSelection && !isCompensating
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-white cursor-pointer hover:scale-105'
                  : 'bg-slate-700 text-slate-400 cursor-not-allowed opacity-60'
              }`}
            >
              <Sparkles className="w-4 h-4 text-emerald-100" />
              <span>{isCompensating ? 'Compensando...' : '⚡ Compensar Selección'}</span>
            </button>
          </div>
        </div>
      )}

      {/* --- LA PLANILLA INTERACTIVA (EXCEL GRID) --- */}
      <div className="bg-white rounded-xl border border-slate-300 shadow-sm overflow-hidden flex flex-col">
        
        {/* Barra superior de la tabla: Totales rápidos y Búsqueda */}
        <div className="bg-slate-100 border-b border-slate-300 p-2.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          
          {/* Fórmulas de Totales Rápidos */}
          <div className="flex items-center gap-4 flex-wrap font-mono">
            <span className="text-slate-600">
              Filas: <strong className="text-slate-950">{displayRows.length}</strong>
            </span>
            <span className="text-slate-600">
              Total Debe: <strong className="text-emerald-700">${tableTotals.totalDebit.toLocaleString('es-CL')}</strong>
            </span>
            <span className="text-slate-600">
              Total Haber: <strong className="text-rose-700">${tableTotals.totalCredit.toLocaleString('es-CL')}</strong>
            </span>
            <span className="text-slate-600">
              Saldo Neto: <strong className="text-indigo-950 font-black">${tableTotals.netBalance.toLocaleString('es-CL')}</strong>
            </span>
            {tableTotals.pendingCount > 0 && (
              <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded text-[10px] font-bold font-sans">
                {tableTotals.pendingCount} pendientes
              </span>
            )}
          </div>

          {/* Buscador sobre la grilla */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
            <input
              type="text"
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              placeholder="Buscar en esta planilla..."
              className="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-6 py-1 text-xs font-medium focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
            {tableSearch && (
              <button
                type="button"
                onClick={() => setTableSearch('')}
                className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-700 text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Tabla con encabezados de columnas estilo Excel (A, B, C...) */}
        <div className="overflow-x-auto max-h-[580px] min-h-[380px]">
          <table className="w-full text-left text-xs border-collapse font-mono">
            <thead className="bg-slate-200 text-slate-700 font-bold sticky top-0 z-10 border-b-2 border-slate-300 shadow-2xs select-none">
              
              {/* Fila 1: Letras de Columna de Excel */}
              <tr className="bg-slate-300 text-slate-600 text-[10px] font-mono text-center border-b border-slate-400">
                <th className="p-1 w-10">#</th>
                <th className="p-1 w-8">K</th>
                <th className="p-1">A</th>
                <th className="p-1">B</th>
                <th className="p-1">C</th>
                <th className="p-1">D</th>
                <th className="p-1">E</th>
                <th className="p-1">F</th>
                <th className="p-1 text-right">G</th>
                <th className="p-1 text-right">H</th>
                <th className="p-1 text-right">I</th>
                <th className="p-1 text-center">J</th>
              </tr>

              {/* Fila 2: Títulos Reales de Negocio */}
              <tr className="text-[11px] divide-x divide-slate-300">
                <th className="p-2 text-center text-slate-500">N°</th>
                <th className="p-2 text-center w-8">
                  <input
                    type="checkbox"
                    checked={displayRows.length > 0 && selectedRowIds.size === displayRows.length}
                    onChange={handleSelectAllVisible}
                    className="rounded text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5 cursor-pointer"
                    title="Seleccionar todo para compensar"
                  />
                </th>
                <th
                  onClick={() => { setSortField('date'); setSortDirection(d => d === 'asc' ? 'desc' : 'asc'); }}
                  className="p-2 cursor-pointer hover:bg-slate-300/60"
                >
                  Fecha {sortField === 'date' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th
                  onClick={() => { setSortField('folio'); setSortDirection(d => d === 'asc' ? 'desc' : 'asc'); }}
                  className="p-2 cursor-pointer hover:bg-slate-300/60"
                >
                  Asiento / Doc {sortField === 'folio' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className="p-2">Tipo</th>
                <th className="p-2">RUT Auxiliar</th>
                <th className="p-2">Razón Social</th>
                <th className="p-2 min-w-[200px]">Glosa / Concepto</th>
                <th
                  onClick={() => { setSortField('debit'); setSortDirection(d => d === 'asc' ? 'desc' : 'asc'); }}
                  className="p-2 text-right text-emerald-800 cursor-pointer hover:bg-slate-300/60"
                >
                  Debe / Cargo ($)
                </th>
                <th
                  onClick={() => { setSortField('credit'); setSortDirection(d => d === 'asc' ? 'desc' : 'asc'); }}
                  className="p-2 text-right text-rose-800 cursor-pointer hover:bg-slate-300/60"
                >
                  Haber / Abono ($)
                </th>
                <th
                  onClick={() => { setSortField('balance'); setSortDirection(d => d === 'asc' ? 'desc' : 'asc'); }}
                  className="p-2 text-right text-indigo-950 font-black cursor-pointer hover:bg-slate-300/60"
                >
                  Saldo Acum. ($)
                </th>
                <th className="p-2 text-center">Estado</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200 text-[11px]">
              {displayRows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="p-12 text-center text-slate-400 font-sans italic bg-slate-50/50">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <FileSpreadsheet className="w-8 h-8 text-slate-300" />
                      <p className="font-semibold text-slate-600">No se encontraron movimientos con los parámetros indicados.</p>
                      <p className="text-xs text-slate-400">Verifica la cuenta contable en [A2], o amplía la fecha de corte en [A3].</p>
                    </div>
                  </td>
                </tr>
              ) : (
                displayRows.map((row, idx) => {
                  const isChecked = selectedRowIds.has(row.id);

                  return (
                    <tr
                      key={row.id}
                      className={`divide-x divide-slate-100 transition-colors ${
                        isChecked
                          ? 'bg-indigo-50/90 font-medium'
                          : row.status === 'COMPENSADO' || row.status === 'PAGADA'
                          ? 'bg-emerald-50/30 hover:bg-emerald-50/60 text-slate-600'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      {/* Número de fila de Excel */}
                      <td className="p-1.5 text-center text-slate-400 text-[10px] bg-slate-100/50 select-none">
                        {idx + 1}
                      </td>

                      {/* Checkbox de selección */}
                      <td className="p-1.5 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleRow(row.id)}
                          className="rounded text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5 cursor-pointer"
                        />
                      </td>

                      {/* A: Fecha */}
                      <td className="p-1.5 whitespace-nowrap text-slate-700">
                        {row.date}
                      </td>

                      {/* B: Asiento / Folio */}
                      <td className="p-1.5 font-bold text-indigo-700 whitespace-nowrap">
                        {row.voucherNumber ? (
                          onOpenVoucher ? (
                            <button
                              type="button"
                              onClick={() => onOpenVoucher(row.voucherId || row.voucherNumber || '')}
                              className="inline-flex items-center gap-1 hover:underline text-indigo-700 font-mono"
                              title="Abrir comprobante"
                            >
                              <span>#{row.voucherNumber}</span>
                              <ExternalLink className="w-2.5 h-2.5 text-indigo-400" />
                            </button>
                          ) : (
                            <span>#{row.voucherNumber}</span>
                          )
                        ) : (
                          <span>{row.folio || '-'}</span>
                        )}
                      </td>

                      {/* C: Tipo */}
                      <td className="p-1.5 text-slate-600 font-sans text-[10px]">
                        {row.docType}
                      </td>

                      {/* D: RUT Auxiliar */}
                      <td className="p-1.5 font-semibold text-slate-800 whitespace-nowrap">
                        {row.auxiliaryRut || '-'}
                      </td>

                      {/* E: Razón Social */}
                      <td className="p-1.5 font-sans truncate max-w-[150px] text-slate-700" title={row.auxiliaryName}>
                        {row.auxiliaryName || '-'}
                      </td>

                      {/* F: Glosa */}
                      <td className="p-1.5 font-sans truncate max-w-[260px] text-slate-900" title={row.gloss}>
                        {row.gloss}
                      </td>

                      {/* G: Debe / Cargo */}
                      <td className="p-1.5 text-right font-bold text-emerald-700">
                        {row.debit > 0 ? `$${row.debit.toLocaleString('es-CL')}` : '-'}
                      </td>

                      {/* H: Haber / Abono */}
                      <td className="p-1.5 text-right font-bold text-rose-700">
                        {row.credit > 0 ? `$${row.credit.toLocaleString('es-CL')}` : '-'}
                      </td>

                      {/* I: Saldo Acumulado */}
                      <td className="p-1.5 text-right font-black text-slate-900 bg-slate-50/50">
                        ${row.runningBalance.toLocaleString('es-CL')}
                      </td>

                      {/* J: Estado */}
                      <td className="p-1.5 text-center font-sans">
                        {row.status === 'COMPENSADO' || row.status === 'PAGADA' ? (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            ✓ Calzado
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                            ⏳ Pendiente
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Fila Fija de Fórmulas de Totales al final de la hoja */}
            {displayRows.length > 0 && (
              <tfoot className="bg-slate-100 font-bold sticky bottom-0 border-t-2 border-slate-400 z-10 shadow-lg text-[11px] divide-x divide-slate-300">
                <tr>
                  <td className="p-2 text-center text-slate-400 font-mono text-[10px]">Σ</td>
                  <td className="p-2 text-center text-[10px] text-slate-500">{selectedRows.length > 0 ? `${selectedRows.length} sel.` : ''}</td>
                  <td colSpan={6} className="p-2 text-slate-800 font-sans">
                    TOTALES PLANILLA ({displayRows.length} registros desplegados)
                  </td>
                  <td className="p-2 text-right font-mono font-bold text-emerald-800">
                    ${tableTotals.totalDebit.toLocaleString('es-CL')}
                  </td>
                  <td className="p-2 text-right font-mono font-bold text-rose-800">
                    ${tableTotals.totalCredit.toLocaleString('es-CL')}
                  </td>
                  <td className="p-2 text-right font-mono font-black text-indigo-950 bg-slate-200/60">
                    ${tableTotals.netBalance.toLocaleString('es-CL')}
                  </td>
                  <td className="p-2 text-center text-[10px] text-slate-600 font-sans">
                    {tableTotals.pendingCount === 0 ? '✓ Cuadrado' : `${tableTotals.pendingCount} pend.`}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* --- MODAL PARA GUARDAR CONSULTA ACTUAL COMO PLANTILLA --- */}
      {isSaveModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-5 space-y-4 border border-slate-200">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-2">
                <Save className="w-4 h-4 text-indigo-600" />
                <h3 className="font-bold text-sm text-slate-900">Guardar Consulta como Plantilla</h3>
              </div>
              <button onClick={() => setIsSaveModalOpen(false)} className="text-slate-400 hover:text-slate-700 font-bold">
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nombre de la Plantilla:</label>
                <input
                  type="text"
                  placeholder="Ej: Facturas Proveedores Pendientes al Corte"
                  value={queryNameInput}
                  onChange={(e) => setQueryNameInput(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Descripción (Opcional):</label>
                <textarea
                  rows={2}
                  placeholder="Notas de qué analiza este reporte..."
                  value={queryDescInput}
                  onChange={(e) => setQueryDescInput(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1 font-mono text-[11px] text-slate-600">
                <p><strong>Parámetros a guardar:</strong></p>
                <p>• Fuente: <span className="text-indigo-700">{sourceType}</span></p>
                <p>• Cuenta: <span className="text-indigo-700">{accountCodeInput || 'Todas'}</span></p>
                <p>• Corte: <span className="text-indigo-700">{cutoffDateInput}</span></p>
                <p>• Estado: <span className="text-indigo-700">{statusFilter}</span></p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => setIsSaveModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveCurrentQuery}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm"
              >
                Guardar Plantilla
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
