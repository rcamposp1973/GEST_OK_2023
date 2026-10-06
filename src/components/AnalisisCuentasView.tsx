import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import {
  Company,
  ChartOfAccount,
  Voucher,
  Auxiliary,
  RCVDocument,
  FiscalPeriodYear,
  AccountMatch,
  MatchedLineRef
} from '../types';
import { logAuditEvent } from '../utils/auditLogger';
import { 
  Search, 
  Filter, 
  CheckCircle2, 
  XCircle, 
  Sparkles, 
  Link2, 
  Unlink, 
  Printer, 
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Scale,
  Calendar,
  AlertCircle,
  FileText,
  User,
  Hash,
  ArrowRightLeft,
  Layers,
  Check,
  Zap,
  ShieldCheck,
  ExternalLink,
  SlidersHorizontal,
  ArrowUpDown,
  CheckSquare,
  Square,
  DollarSign,
  FileSpreadsheet,
  X
} from 'lucide-react';
import PlanillaConsultasDinamicasView from './PlanillaConsultasDinamicasView';

interface AnalisisCuentasViewProps {
  studyId: string;
  company: Company;
  accounts: ChartOfAccount[];
  vouchers: Voucher[];
  fiscalYears?: FiscalPeriodYear[];
  auxiliaries?: Auxiliary[];
  rcvDocuments?: RCVDocument[];
  onVouchersUpdated?: () => void;
  onOpenVoucher?: (voucherRef: Voucher | string | number) => void;
}

export interface ExtVoucherLine {
  key: string; // voucherId_lineIndex
  voucherId: string;
  voucherNumber: number;
  voucherDate: string;
  voucherPeriod: string;
  voucherType: 'Ingreso' | 'Egreso' | 'Traspaso';
  lineIndex: number;
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  gloss: string;
  documentRef?: string;
  auxiliaryRut?: string;
  auxiliaryName?: string;
  matchId?: string | null;
  matchGroup?: AccountMatch | null;
}

export default function AnalisisCuentasView({
  studyId,
  company,
  accounts,
  vouchers,
  fiscalYears = [],
  auxiliaries = [],
  rcvDocuments = [],
  onVouchersUpdated,
  onOpenVoucher
}: AnalisisCuentasViewProps) {
  // --- ESTADOS DE SELECCIÓN Y FILTRO DE CUENTA ---
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [accountTypeFilter, setAccountTypeFilter] = useState<'TODAS' | 'Activo' | 'Pasivo' | 'Patrimonio' | 'Ingreso' | 'Gasto'>('TODAS');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [periodFilter, setPeriodFilter] = useState<string>('TODOS');
  const [viewMode, setViewMode] = useState<'PENDIENTES' | 'CALZADAS' | 'TODAS'>('PENDIENTES');
  const [viewModeType, setViewModeType] = useState<'TRADITIONAL' | 'DYNAMIC_SPREADSHEET'>('TRADITIONAL');
  
  // --- FILTROS COMPLETOS DE PARTIDAS ---
  const [filterRut, setFilterRut] = useState<string>('TODOS');
  const [filterRutQuery, setFilterRutQuery] = useState<string>('');
  const [filterDoc, setFilterDoc] = useState<string>('');
  const [filterAmount, setFilterAmount] = useState<string>('');
  const [filterGloss, setFilterGloss] = useState<string>('');
  const [filterVoucherType, setFilterVoucherType] = useState<'TODOS' | 'Ingreso' | 'Egreso' | 'Traspaso'>('TODOS');
  const [filterVoucherNumber, setFilterVoucherNumber] = useState<string>('');
  const [filterMonth, setFilterMonth] = useState<string>('TODOS');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');
  const [filterOnlyMatchingAmounts, setFilterOnlyMatchingAmounts] = useState<boolean>(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState<boolean>(true);

  // Búsqueda específica e instantánea por tabla
  const [debitSearchQuery, setDebitSearchQuery] = useState<string>('');
  const [creditSearchQuery, setCreditSearchQuery] = useState<string>('');

  // Ordenamiento por columna
  const [debitSortBy, setDebitSortBy] = useState<'date' | 'voucher' | 'amount' | 'rut'>('date');
  const [debitSortDir, setDebitSortDir] = useState<'asc' | 'desc'>('asc');
  const [creditSortBy, setCreditSortBy] = useState<'date' | 'voucher' | 'amount' | 'rut'>('date');
  const [creditSortDir, setCreditSortDir] = useState<'asc' | 'desc'>('asc');

  // --- ESTADOS DE MATCHES Y FIRESTORE ---
  const [matches, setMatches] = useState<AccountMatch[]>([]);
  const [loadingMatches, setLoadingMatches] = useState<boolean>(true);
  const [saveStatus, setSaveStatus] = useState<'SAVED' | 'SAVING' | 'ERROR' | 'IDLE'>('SAVED');

  // --- ESTADOS DE CALCE MANUAL ---
  const [selectedDebitKeys, setSelectedDebitKeys] = useState<string[]>([]);
  const [selectedCreditKeys, setSelectedCreditKeys] = useState<string[]>([]);
  const [matchNotes, setMatchNotes] = useState<string>('');

  // --- ESTADOS DE CALCE INTELIGENTE (SUGERENCIAS) ---
  const [isAutoMatching, setIsAutoMatching] = useState<boolean>(false);
  const [suggestedMatches, setSuggestedMatches] = useState<{
    id: string;
    debitLines: ExtVoucherLine[];
    creditLines: ExtVoucherLine[];
    totalAmount: number;
    rule: string;
  }[] | null>(null);

  // --- CARGAR MATCHES DESDE FIRESTORE ---
  const fetchMatches = useCallback(async () => {
    if (!studyId || !company.id) return;
    setLoadingMatches(true);
    try {
      const matchesRef = collection(db, 'studies', studyId, 'companies', company.id, 'accountMatches');
      const snap = await getDocs(matchesRef);
      const loaded: AccountMatch[] = [];
      snap.forEach(docSnap => {
        const data = docSnap.data() as AccountMatch;
        if (data.status !== 'DESCALZADO') {
          loaded.push({ ...data, id: docSnap.id });
        }
      });
      setMatches(loaded);
    } catch (err) {
      console.error('Error cargando calces de cuentas:', err);
    } finally {
      setLoadingMatches(false);
    }
  }, [studyId, company.id]);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  // --- CUENTAS IMPUTABLES FILTRADAS ---
  const imputableAccounts = useMemo(() => {
    return accounts.filter(acc => {
      if (!acc.isImputable) return false;
      if (accountTypeFilter !== 'TODAS' && acc.type !== accountTypeFilter) return false;
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        return acc.code.toLowerCase().includes(term) || acc.name.toLowerCase().includes(term);
      }
      return true;
    }).sort((a, b) => a.code.localeCompare(b.code));
  }, [accounts, accountTypeFilter, searchTerm]);

  // Seleccionar automáticamente la primera cuenta útil o de análisis común al cargar
  useEffect(() => {
    if (!selectedAccountId && imputableAccounts.length > 0) {
      const priorityAcc = imputableAccounts.find(a => 
        a.code.startsWith('1103') || 
        a.name.toLowerCase().includes('iva') || 
        a.requiereConciliacionBancaria ||
        a.type === 'Activo' || 
        a.type === 'Pasivo'
      );
      setSelectedAccountId(priorityAcc ? priorityAcc.id : imputableAccounts[0].id);
    }
  }, [imputableAccounts, selectedAccountId]);

  const selectedAccount = useMemo(() => {
    return accounts.find(a => a.id === selectedAccountId);
  }, [accounts, selectedAccountId]);

  // --- MAPEAR LÍNEAS DE COMPROBANTES DE LA CUENTA SELECCIONADA ---
  const accountLines = useMemo(() => {
    if (!selectedAccountId) return [];
    
    // Mapa rápido de lineKeys calzadas -> AccountMatch
    const matchedMap = new Map<string, AccountMatch>();
    matches.forEach(m => {
      if (m.status !== 'DESCALZADO') {
        m.matchedLines.forEach(l => {
          const key = `${l.voucherId}_${l.lineIndex}`;
          matchedMap.set(key, m);
        });
      }
    });

    const lines: ExtVoucherLine[] = [];

    vouchers.forEach(voucher => {
      if (voucher.status === 'Anulado') return;
      if (periodFilter !== 'TODOS' && voucher.period !== periodFilter) return;

      voucher.lines.forEach((line, index) => {
        if (line.accountId === selectedAccountId || line.accountCode === selectedAccount?.code) {
          const lineKey = `${voucher.id}_${index}`;
          const matchGroup = matchedMap.get(lineKey) || null;
          
          lines.push({
            key: lineKey,
            voucherId: voucher.id,
            voucherNumber: Number(voucher.voucherNumber || (voucher as any).number || 0),
            voucherDate: voucher.date,
            voucherPeriod: voucher.period || voucher.date?.slice(0, 7) || '',
            voucherType: voucher.type,
            lineIndex: index,
            accountId: line.accountId || selectedAccountId,
            accountCode: line.accountCode || selectedAccount?.code || '',
            accountName: line.accountName || selectedAccount?.name || '',
            debit: line.debit || 0,
            credit: line.credit || 0,
            gloss: line.gloss || voucher.gloss || '',
            documentRef: line.documentRef,
            auxiliaryRut: line.auxiliaryRut,
            auxiliaryName: line.auxiliaryName,
            matchId: matchGroup ? matchGroup.id : null,
            matchGroup: matchGroup
          });
        }
      });
    });

    // Ordenar inicialmente por fecha y número
    return lines.sort((a, b) => {
      const dateComp = (a.voucherDate || '').localeCompare(b.voucherDate || '');
      if (dateComp !== 0) return dateComp;
      return a.voucherNumber - b.voucherNumber;
    });
  }, [selectedAccountId, selectedAccount, vouchers, periodFilter, matches]);

  // --- LISTA DE RUTS / AUXILIARES PRESENTES EN ESTA CUENTA ---
  const accountRutsList = useMemo(() => {
    const map = new Map<string, { rut: string; name: string; debitTotal: number; creditTotal: number; count: number; pendingCount: number }>();
    accountLines.forEach(l => {
      const rut = (l.auxiliaryRut || '').trim();
      if (rut) {
        const existing = map.get(rut) || { rut, name: l.auxiliaryName || rut, debitTotal: 0, creditTotal: 0, count: 0, pendingCount: 0 };
        existing.debitTotal += l.debit;
        existing.creditTotal += l.credit;
        existing.count += 1;
        if (!l.matchId) existing.pendingCount += 1;
        if ((!existing.name || existing.name === rut) && l.auxiliaryName) {
          existing.name = l.auxiliaryName;
        }
        map.set(rut, existing);
      }
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [accountLines]);

  // --- DETECCIÓN DE COMPROBANTES DE TRASPASO / COMPENSACIÓN INTERNA PENDIENTES ---
  const pendingIntraVouchers = useMemo(() => {
    const map = new Map<string, { debits: ExtVoucherLine[]; credits: ExtVoucherLine[]; voucherNumber: number; gloss: string; totalAmount: number }>();
    accountLines.filter(l => !l.matchId).forEach(l => {
      const existing = map.get(l.voucherId) || { debits: [], credits: [], voucherNumber: l.voucherNumber, gloss: l.gloss, totalAmount: 0 };
      if (l.debit > 0) existing.debits.push(l);
      if (l.credit > 0) existing.credits.push(l);
      map.set(l.voucherId, existing);
    });

    const list: { voucherId: string; debits: ExtVoucherLine[]; credits: ExtVoucherLine[]; voucherNumber: number; gloss: string; totalAmount: number }[] = [];
    map.forEach((data, vId) => {
      if (data.debits.length > 0 && data.credits.length > 0) {
        const sumD = data.debits.reduce((acc, curr) => acc + curr.debit, 0);
        const sumC = data.credits.reduce((acc, curr) => acc + curr.credit, 0);
        if (sumD === sumC && sumD > 0) {
          list.push({ ...data, voucherId: vId, totalAmount: sumD });
        }
      }
    });
    return list;
  }, [accountLines]);

  const handleApplyAllIntraVouchers = async () => {
    if (pendingIntraVouchers.length === 0 || !selectedAccount) return;
    const formattedSuggestions = pendingIntraVouchers.map(v => ({
      id: `sug_vch_${v.voucherId}_${Date.now()}`,
      debitLines: v.debits,
      creditLines: v.credits,
      totalAmount: v.totalAmount,
      rule: `Comprobante de Traspaso / Compensación Vch #${v.voucherNumber} (${v.gloss || 'Compensación NC vs Factura'})`
    }));
    await handleApplySuggestedMatches(formattedSuggestions);
  };

  // --- MONTOS RECURRENTES PARA FILTRADO DE CALCES EXACTOS ---
  const pendingDebitAmounts = useMemo(() => {
    const set = new Set<number>();
    accountLines.filter(l => !l.matchId && l.debit > 0).forEach(l => set.add(l.debit));
    return set;
  }, [accountLines]);

  const pendingCreditAmounts = useMemo(() => {
    const set = new Set<number>();
    accountLines.filter(l => !l.matchId && l.credit > 0).forEach(l => set.add(l.credit));
    return set;
  }, [accountLines]);

  // --- LÍNEAS FILTRADAS SEGÚN VIEW MODE Y FILTROS GLOBALES ---
  const displayedLines = useMemo(() => {
    let list = accountLines;

    if (viewMode === 'PENDIENTES') {
      list = list.filter(l => !l.matchId);
    } else if (viewMode === 'CALZADAS') {
      list = list.filter(l => !!l.matchId);
    }

    // Filtro por RUT del dropdown
    if (filterRut !== 'TODOS') {
      if (filterRut === '__CON_RUT__') {
        list = list.filter(l => !!(l.auxiliaryRut || '').trim());
      } else if (filterRut === '__SIN_RUT__') {
        list = list.filter(l => !(l.auxiliaryRut || '').trim());
      } else {
        list = list.filter(l => (l.auxiliaryRut || '').trim().toLowerCase() === filterRut.trim().toLowerCase());
      }
    }

    // Filtro por RUT Query (texto libre)
    if (filterRutQuery.trim()) {
      const q = filterRutQuery.toLowerCase().trim();
      list = list.filter(l => 
        (l.auxiliaryRut || '').toLowerCase().includes(q) ||
        (l.auxiliaryName || '').toLowerCase().includes(q)
      );
    }

    // Filtro por Documento / Folio
    if (filterDoc.trim()) {
      const qDoc = filterDoc.toLowerCase().trim().replace(/^#/, '');
      list = list.filter(l => 
        (l.documentRef || '').toLowerCase().includes(qDoc) ||
        l.gloss.toLowerCase().includes(qDoc)
      );
    }

    // Filtro por Tipo de Comprobante
    if (filterVoucherType !== 'TODOS') {
      list = list.filter(l => l.voucherType === filterVoucherType);
    }

    // Filtro por N° Comprobante
    if (filterVoucherNumber.trim()) {
      const vNumQ = filterVoucherNumber.trim().replace(/^#/, '');
      list = list.filter(l => String(l.voucherNumber).includes(vNumQ));
    }

    // Filtro por Monto
    if (filterAmount.trim()) {
      const cleanAmt = filterAmount.replace(/[^0-9]/g, '');
      if (cleanAmt) {
        const numAmt = Number(cleanAmt);
        list = list.filter(l => 
          l.debit === numAmt || 
          l.credit === numAmt || 
          String(l.debit).includes(cleanAmt) || 
          String(l.credit).includes(cleanAmt)
        );
      }
    }

    // Filtro: Sólo partidas que tienen un monto idéntico en el lado contrario
    if (filterOnlyMatchingAmounts) {
      list = list.filter(l => {
        if (l.debit > 0) return pendingCreditAmounts.has(l.debit);
        if (l.credit > 0) return pendingDebitAmounts.has(l.credit);
        return false;
      });
    }

    // Filtro por Glosa General
    if (filterGloss.trim()) {
      const qGloss = filterGloss.toLowerCase().trim();
      list = list.filter(l => 
        l.gloss.toLowerCase().includes(qGloss) ||
        String(l.voucherNumber).includes(qGloss) ||
        (l.auxiliaryName || '').toLowerCase().includes(qGloss)
      );
    }

    // Filtro por Mes
    if (filterMonth !== 'TODOS') {
      list = list.filter(l => 
        (l.voucherPeriod || '').endsWith(`-${filterMonth}`) || 
        (l.voucherDate || '').slice(5, 7) === filterMonth
      );
    }

    // Filtro por Rango de Fechas
    if (filterDateFrom) {
      list = list.filter(l => l.voucherDate >= filterDateFrom);
    }
    if (filterDateTo) {
      list = list.filter(l => l.voucherDate <= filterDateTo);
    }

    return list;
  }, [
    accountLines, 
    viewMode, 
    filterRut, 
    filterRutQuery, 
    filterDoc, 
    filterVoucherType, 
    filterVoucherNumber, 
    filterAmount, 
    filterOnlyMatchingAmounts, 
    filterGloss, 
    filterMonth, 
    filterDateFrom, 
    filterDateTo, 
    pendingDebitAmounts, 
    pendingCreditAmounts
  ]);

  // Dividir líneas mostradas en Cargos (Debes) y Abonos (Haberes) con ordenamiento y búsqueda por columna
  const debitLines = useMemo(() => {
    let list = displayedLines.filter(l => l.debit > 0);
    if (debitSearchQuery.trim()) {
      const q = debitSearchQuery.toLowerCase().trim();
      list = list.filter(l => 
        String(l.voucherNumber).includes(q) ||
        l.gloss.toLowerCase().includes(q) ||
        (l.auxiliaryRut || '').toLowerCase().includes(q) ||
        (l.auxiliaryName || '').toLowerCase().includes(q) ||
        (l.documentRef || '').toLowerCase().includes(q) ||
        String(l.debit).includes(q.replace(/[^0-9]/g, ''))
      );
    }

    return list.sort((a, b) => {
      let comp = 0;
      if (debitSortBy === 'date') comp = (a.voucherDate || '').localeCompare(b.voucherDate || '');
      else if (debitSortBy === 'voucher') comp = a.voucherNumber - b.voucherNumber;
      else if (debitSortBy === 'amount') comp = a.debit - b.debit;
      else if (debitSortBy === 'rut') comp = (a.auxiliaryRut || '').localeCompare(b.auxiliaryRut || '');
      return debitSortDir === 'asc' ? comp : -comp;
    });
  }, [displayedLines, debitSearchQuery, debitSortBy, debitSortDir]);

  const creditLines = useMemo(() => {
    let list = displayedLines.filter(l => l.credit > 0);
    if (creditSearchQuery.trim()) {
      const q = creditSearchQuery.toLowerCase().trim();
      list = list.filter(l => 
        String(l.voucherNumber).includes(q) ||
        l.gloss.toLowerCase().includes(q) ||
        (l.auxiliaryRut || '').toLowerCase().includes(q) ||
        (l.auxiliaryName || '').toLowerCase().includes(q) ||
        (l.documentRef || '').toLowerCase().includes(q) ||
        String(l.credit).includes(q.replace(/[^0-9]/g, ''))
      );
    }

    return list.sort((a, b) => {
      let comp = 0;
      if (creditSortBy === 'date') comp = (a.voucherDate || '').localeCompare(b.voucherDate || '');
      else if (creditSortBy === 'voucher') comp = a.voucherNumber - b.voucherNumber;
      else if (creditSortBy === 'amount') comp = a.credit - b.credit;
      else if (creditSortBy === 'rut') comp = (a.auxiliaryRut || '').localeCompare(b.auxiliaryRut || '');
      return creditSortDir === 'asc' ? comp : -comp;
    });
  }, [displayedLines, creditSearchQuery, creditSortBy, creditSortDir]);

  // Conteo de filtros activos
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filterRut !== 'TODOS') count++;
    if (filterRutQuery.trim()) count++;
    if (filterDoc.trim()) count++;
    if (filterAmount.trim()) count++;
    if (filterGloss.trim()) count++;
    if (filterVoucherType !== 'TODOS') count++;
    if (filterVoucherNumber.trim()) count++;
    if (filterMonth !== 'TODOS') count++;
    if (filterDateFrom) count++;
    if (filterDateTo) count++;
    if (filterOnlyMatchingAmounts) count++;
    if (debitSearchQuery.trim()) count++;
    if (creditSearchQuery.trim()) count++;
    return count;
  }, [
    filterRut, filterRutQuery, filterDoc, filterAmount, filterGloss, 
    filterVoucherType, filterVoucherNumber, filterMonth, filterDateFrom, 
    filterDateTo, filterOnlyMatchingAmounts, debitSearchQuery, creditSearchQuery
  ]);

  const resetAllFilters = () => {
    setFilterRut('TODOS');
    setFilterRutQuery('');
    setFilterDoc('');
    setFilterAmount('');
    setFilterGloss('');
    setFilterVoucherType('TODOS');
    setFilterVoucherNumber('');
    setFilterMonth('TODOS');
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterOnlyMatchingAmounts(false);
    setDebitSearchQuery('');
    setCreditSearchQuery('');
  };

  // --- ACCIÓN RÁPIDA: PAREAR CONTRAPARTIDA POR MONTO (1-CLIC) ---
  const handleQuickMatchLine = (line: ExtVoucherLine) => {
    const isDebit = line.debit > 0;
    const targetAmount = isDebit ? line.debit : line.credit;
    
    // Buscar contraparte idéntica
    const oppositeList = accountLines.filter(l => !l.matchId && (isDebit ? l.credit === targetAmount : l.debit === targetAmount));

    if (oppositeList.length === 0) {
      // Filtrar el monto para que el usuario explore
      setFilterAmount(String(targetAmount));
      return;
    }

    // Si hay una coincidencia con el mismo RUT o única, seleccionarla inmediatamente
    const sameRutMatch = oppositeList.find(l => line.auxiliaryRut && l.auxiliaryRut === line.auxiliaryRut);
    const counterpart = sameRutMatch || (oppositeList.length === 1 ? oppositeList[0] : null);

    if (isDebit) {
      setSelectedDebitKeys([line.key]);
      if (counterpart) {
        setSelectedCreditKeys([counterpart.key]);
      } else {
        // Filtrar la tabla de créditos por este monto
        setCreditSearchQuery(String(targetAmount));
      }
    } else {
      setSelectedCreditKeys([line.key]);
      if (counterpart) {
        setSelectedDebitKeys([counterpart.key]);
      } else {
        // Filtrar la tabla de débitos por este monto
        setDebitSearchQuery(String(targetAmount));
      }
    }
  };

  // Seleccionar todas las partidas de un RUT
  const handleSelectRutLines = (rut: string) => {
    if (!rut) return;
    const debits = accountLines.filter(l => !l.matchId && l.debit > 0 && l.auxiliaryRut === rut).map(l => l.key);
    const credits = accountLines.filter(l => !l.matchId && l.credit > 0 && l.auxiliaryRut === rut).map(l => l.key);
    setSelectedDebitKeys(debits);
    setSelectedCreditKeys(credits);
    setFilterRut(rut);
  };

  // Seleccionar todas las visibles
  const handleSelectAllVisible = (side: 'debit' | 'credit' | 'both') => {
    if (side === 'debit' || side === 'both') {
      const visibleDebits = debitLines.filter(l => !l.matchId).map(l => l.key);
      setSelectedDebitKeys(visibleDebits);
    }
    if (side === 'credit' || side === 'both') {
      const visibleCredits = creditLines.filter(l => !l.matchId).map(l => l.key);
      setSelectedCreditKeys(visibleCredits);
    }
  };

  // --- KPIS Y MÉTRICAS DE LA CUENTA ---
  const accountStats = useMemo(() => {
    let totalDebit = 0;
    let totalCredit = 0;
    let pendingDebit = 0;
    let pendingCredit = 0;
    let matchedDebit = 0;
    let matchedCredit = 0;

    accountLines.forEach(l => {
      totalDebit += l.debit;
      totalCredit += l.credit;
      if (l.matchId) {
        matchedDebit += l.debit;
        matchedCredit += l.credit;
      } else {
        pendingDebit += l.debit;
        pendingCredit += l.credit;
      }
    });

    const netLedgerBalance = totalDebit - totalCredit;
    const netPendingBalance = pendingDebit - pendingCredit;
    const totalMatchedAmount = (matchedDebit + matchedCredit) / 2;
    const matchPercentage = (totalDebit + totalCredit) > 0 
      ? Math.round(((matchedDebit + matchedCredit) / (totalDebit + totalCredit)) * 100) 
      : 100;

    return {
      totalLinesCount: accountLines.length,
      pendingCount: accountLines.filter(l => !l.matchId).length,
      matchedCount: accountLines.filter(l => !!l.matchId).length,
      totalDebit,
      totalCredit,
      netLedgerBalance,
      pendingDebit,
      pendingCredit,
      netPendingBalance,
      totalMatchedAmount,
      matchPercentage
    };
  }, [accountLines]);

  // --- CÁLCULO DINÁMICO DE SELECCIÓN MANUAL ---
  const selectionMath = useMemo(() => {
    let sumDebits = 0;
    let sumCredits = 0;

    const selectedDebitsList = accountLines.filter(l => selectedDebitKeys.includes(l.key));
    const selectedCreditsList = accountLines.filter(l => selectedCreditKeys.includes(l.key));

    selectedDebitsList.forEach(l => { sumDebits += l.debit; });
    selectedCreditsList.forEach(l => { sumCredits += l.credit; });

    const diff = Math.abs(sumDebits - sumCredits);
    const isMatchedPair = (selectedDebitKeys.length > 0 || selectedCreditKeys.length > 0) && diff === 0 && sumDebits > 0;

    return {
      sumDebits,
      sumCredits,
      diff,
      isMatchedPair,
      selectedDebitsCount: selectedDebitKeys.length,
      selectedCreditsCount: selectedCreditKeys.length,
      selectedDebitsList,
      selectedCreditsList
    };
  }, [accountLines, selectedDebitKeys, selectedCreditKeys]);

  // --- GUARDAR CALCE MANUAL ---
  const handleCreateManualMatch = async () => {
    if (!selectionMath.isMatchedPair || !selectedAccount) return;

    setSaveStatus('SAVING');
    try {
      const matchId = `match_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const matchedLinesRef: MatchedLineRef[] = [
        ...selectionMath.selectedDebitsList.map(l => ({
          voucherId: l.voucherId,
          voucherNumber: l.voucherNumber,
          voucherDate: l.voucherDate,
          voucherPeriod: l.voucherPeriod,
          lineIndex: l.lineIndex,
          accountId: l.accountId,
          accountCode: l.accountCode,
          debit: l.debit,
          credit: l.credit,
          gloss: l.gloss,
          documentRef: l.documentRef,
          auxiliaryRut: l.auxiliaryRut,
          auxiliaryName: l.auxiliaryName
        })),
        ...selectionMath.selectedCreditsList.map(l => ({
          voucherId: l.voucherId,
          voucherNumber: l.voucherNumber,
          voucherDate: l.voucherDate,
          voucherPeriod: l.voucherPeriod,
          lineIndex: l.lineIndex,
          accountId: l.accountId,
          accountCode: l.accountCode,
          debit: l.debit,
          credit: l.credit,
          gloss: l.gloss,
          documentRef: l.documentRef,
          auxiliaryRut: l.auxiliaryRut,
          auxiliaryName: l.auxiliaryName
        }))
      ];

      const newMatch: AccountMatch = {
        id: matchId,
        accountId: selectedAccount.id,
        accountCode: selectedAccount.code,
        accountName: selectedAccount.name,
        matchedLines: matchedLinesRef,
        totalAmount: selectionMath.sumDebits,
        matchDate: new Date().toISOString(),
        matchedBy: auth.currentUser?.email || 'Usuario Contable',
        notes: matchNotes.trim() || 'Compensación de partidas',
        creationMode: 'MANUAL',
        status: 'CALZADO'
      };

      // Firestore persistence
      const matchDocRef = doc(db, 'studies', studyId, 'companies', company.id, 'accountMatches', matchId);
      await setDoc(matchDocRef, newMatch);

      // Actualizar estado local
      setMatches(prev => [...prev, newMatch]);
      setSelectedDebitKeys([]);
      setSelectedCreditKeys([]);
      setMatchNotes('');
      setSaveStatus('SAVED');

      // Auditoría
      logAuditEvent({
        userId: auth.currentUser?.uid || 'user',
        userEmail: auth.currentUser?.email || 'usuario@gestok.cl',
        studyId,
        companyId: company.id,
        action: 'CONTABILIZAR',
        module: 'PLAN_CUENTAS',
        details: `Compensación de cuenta ${selectedAccount.code} - ${selectedAccount.name} por $${selectionMath.sumDebits.toLocaleString('es-CL')} (${matchedLinesRef.length} líneas pareadas)`
      });

    } catch (err) {
      console.error('Error al guardar calce manual:', err);
      setSaveStatus('ERROR');
    }
  };

  // --- DESCALZAR / DESHACER UN CALCE ---
  const handleUnmatchGroup = async (matchId: string) => {
    if (!window.confirm('¿Está seguro de deshacer esta compensación? Las partidas volverán a quedar pendientes en el análisis.')) return;

    setSaveStatus('SAVING');
    try {
      const matchDocRef = doc(db, 'studies', studyId, 'companies', company.id, 'accountMatches', matchId);
      await deleteDoc(matchDocRef);

      setMatches(prev => prev.filter(m => m.id !== matchId));
      setSaveStatus('SAVED');

      logAuditEvent({
        userId: auth.currentUser?.uid || 'user',
        userEmail: auth.currentUser?.email || 'usuario@gestok.cl',
        studyId,
        companyId: company.id,
        action: 'MODIFICAR',
        module: 'PLAN_CUENTAS',
        details: `Descalzado de grupo ${matchId} en cuenta ${selectedAccount?.code}`
      });
    } catch (err) {
      console.error('Error al deshacer calce:', err);
      setSaveStatus('ERROR');
    }
  };

  // --- MOTOR DE CALCE INTELIGENTE (ALGORITMO MULTI-REGLA N-A-1 Y 1-A-1) ---
  const handleRunSmartAutoMatch = () => {
    if (!selectedAccount) return;
    setIsAutoMatching(true);

    const pendingLines = accountLines.filter(l => !l.matchId);
    const pendDebits = pendingLines.filter(l => l.debit > 0);
    const pendCredits = pendingLines.filter(l => l.credit > 0);

    const suggestions: {
      id: string;
      debitLines: ExtVoucherLine[];
      creditLines: ExtVoucherLine[];
      totalAmount: number;
      rule: string;
    }[] = [];

    const usedKeys = new Set<string>();

    // REGLA 0: Comprobantes de Traspaso / Compensación Interna (Debe y Haber en el mismo Comprobante)
    const vouchersMap = new Map<string, { debits: ExtVoucherLine[]; credits: ExtVoucherLine[]; voucherNumber: number; gloss: string }>();
    pendingLines.forEach(l => {
      if (usedKeys.has(l.key)) return;
      const existing = vouchersMap.get(l.voucherId) || { debits: [], credits: [], voucherNumber: l.voucherNumber, gloss: l.gloss };
      if (l.debit > 0) existing.debits.push(l);
      if (l.credit > 0) existing.credits.push(l);
      vouchersMap.set(l.voucherId, existing);
    });

    vouchersMap.forEach((data, vId) => {
      if (data.debits.length > 0 && data.credits.length > 0) {
        const sumD = data.debits.reduce((acc, curr) => acc + curr.debit, 0);
        const sumC = data.credits.reduce((acc, curr) => acc + curr.credit, 0);
        if (sumD === sumC && sumD > 0) {
          data.debits.forEach(d => usedKeys.add(d.key));
          data.credits.forEach(c => usedKeys.add(c.key));
          suggestions.push({
            id: `sug_vch_${vId}_${Date.now()}`,
            debitLines: data.debits,
            creditLines: data.credits,
            totalAmount: sumD,
            rule: `Comprobante de Traspaso / Compensación Vch #${data.voucherNumber} (${data.gloss || 'Compensación NC vs Factura'})`
          });
        }
      }
    });

    // REGLA 1: Match 1 a 1 por RUT + Documento de Referencia
    pendDebits.forEach(d => {
      if (usedKeys.has(d.key)) return;
      if (d.auxiliaryRut && d.documentRef) {
        const matchingCredit = pendCredits.find(c => 
          !usedKeys.has(c.key) &&
          c.auxiliaryRut === d.auxiliaryRut &&
          c.documentRef === d.documentRef &&
          c.credit === d.debit
        );
        if (matchingCredit) {
          usedKeys.add(d.key);
          usedKeys.add(matchingCredit.key);
          suggestions.push({
            id: `sug_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            debitLines: [d],
            creditLines: [matchingCredit],
            totalAmount: d.debit,
            rule: `RUT (${d.auxiliaryRut}) + Documento (#${d.documentRef})`
          });
        }
      }
    });

    // REGLA 2: Match 1 a 1 por Monto Exacto dentro del mismo RUT
    pendDebits.forEach(d => {
      if (usedKeys.has(d.key)) return;
      if (d.auxiliaryRut) {
        const matchingCredit = pendCredits.find(c => 
          !usedKeys.has(c.key) &&
          c.auxiliaryRut === d.auxiliaryRut &&
          c.credit === d.debit
        );
        if (matchingCredit) {
          usedKeys.add(d.key);
          usedKeys.add(matchingCredit.key);
          suggestions.push({
            id: `sug_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            debitLines: [d],
            creditLines: [matchingCredit],
            totalAmount: d.debit,
            rule: `RUT (${d.auxiliaryRut}) + Monto Exacto ($${d.debit.toLocaleString('es-CL')})`
          });
        }
      }
    });

    // REGLA 3: Match 1 a 1 por Monto Exacto en la misma cuenta
    pendDebits.forEach(d => {
      if (usedKeys.has(d.key)) return;
      const matchingCredit = pendCredits.find(c => 
        !usedKeys.has(c.key) &&
        c.credit === d.debit
      );
      if (matchingCredit) {
        usedKeys.add(d.key);
        usedKeys.add(matchingCredit.key);
        suggestions.push({
          id: `sug_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          debitLines: [d],
          creditLines: [matchingCredit],
          totalAmount: d.debit,
          rule: `Monto Exacto ($${d.debit.toLocaleString('es-CL')})`
        });
      }
    });

    // REGLA 4: Match por RUT Total Balanceado (Si el saldo deudor del RUT = saldo acreedor del RUT)
    accountRutsList.forEach(r => {
      const rutDebits = pendDebits.filter(d => !usedKeys.has(d.key) && d.auxiliaryRut === r.rut);
      const rutCredits = pendCredits.filter(c => !usedKeys.has(c.key) && c.auxiliaryRut === r.rut);
      if (rutDebits.length > 0 && rutCredits.length > 0) {
        const sumD = rutDebits.reduce((acc, curr) => acc + curr.debit, 0);
        const sumC = rutCredits.reduce((acc, curr) => acc + curr.credit, 0);
        if (sumD === sumC && sumD > 0) {
          rutDebits.forEach(d => usedKeys.add(d.key));
          rutCredits.forEach(c => usedKeys.add(c.key));
          suggestions.push({
            id: `sug_rut_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            debitLines: rutDebits,
            creditLines: rutCredits,
            totalAmount: sumD,
            rule: `Saldo Total Cuadrado para RUT ${r.rut} (${rutDebits.length} Debes vs ${rutCredits.length} Haberes)`
          });
        }
      }
    });

    // REGLA 5: Match por Glosa / F29 / Leyes Sociales
    pendDebits.forEach(d => {
      if (usedKeys.has(d.key)) return;
      const cleanGlossD = d.gloss.toLowerCase();
      if (cleanGlossD.includes('f29') || cleanGlossD.includes('impuesto') || cleanGlossD.includes('formulario 29') || cleanGlossD.includes('previred')) {
        const matchingCredit = pendCredits.find(c => {
          if (usedKeys.has(c.key)) return false;
          const cleanGlossC = c.gloss.toLowerCase();
          return (cleanGlossC.includes('f29') || cleanGlossC.includes('impuesto') || cleanGlossC.includes('previred')) && c.credit === d.debit;
        });
        if (matchingCredit) {
          usedKeys.add(d.key);
          usedKeys.add(matchingCredit.key);
          suggestions.push({
            id: `sug_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            debitLines: [d],
            creditLines: [matchingCredit],
            totalAmount: d.debit,
            rule: `Coincidencia de Glosa Impuestos / F29 / Previsión`
          });
        }
      }
    });

    setSuggestedMatches(suggestions);
    setIsAutoMatching(false);
  };

  // --- APLICAR TODAS O INDIVIDUALES SUGERENCIAS DE CALCE ---
  const handleApplySuggestedMatches = async (toApply = suggestedMatches) => {
    if (!toApply || toApply.length === 0 || !selectedAccount) return;

    setSaveStatus('SAVING');
    try {
      const newMatches: AccountMatch[] = [];

      for (const sug of toApply) {
        const matchId = `match_auto_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const matchedLinesRef: MatchedLineRef[] = [
          ...sug.debitLines.map(l => ({
            voucherId: l.voucherId,
            voucherNumber: l.voucherNumber,
            voucherDate: l.voucherDate,
            voucherPeriod: l.voucherPeriod,
            lineIndex: l.lineIndex,
            accountId: l.accountId,
            accountCode: l.accountCode,
            debit: l.debit,
            credit: l.credit,
            gloss: l.gloss,
            documentRef: l.documentRef,
            auxiliaryRut: l.auxiliaryRut,
            auxiliaryName: l.auxiliaryName
          })),
          ...sug.creditLines.map(l => ({
            voucherId: l.voucherId,
            voucherNumber: l.voucherNumber,
            voucherDate: l.voucherDate,
            voucherPeriod: l.voucherPeriod,
            lineIndex: l.lineIndex,
            accountId: l.accountId,
            accountCode: l.accountCode,
            debit: l.debit,
            credit: l.credit,
            gloss: l.gloss,
            documentRef: l.documentRef,
            auxiliaryRut: l.auxiliaryRut,
            auxiliaryName: l.auxiliaryName
          }))
        ];

        const matchObj: AccountMatch = {
          id: matchId,
          accountId: selectedAccount.id,
          accountCode: selectedAccount.code,
          accountName: selectedAccount.name,
          matchedLines: matchedLinesRef,
          totalAmount: sug.totalAmount,
          matchDate: new Date().toISOString(),
          matchedBy: auth.currentUser?.email || 'Sistema Inteligente Gest_OK',
          notes: `Calce automático: ${sug.rule}`,
          creationMode: 'AUTOMATICO',
          status: 'CALZADO'
        };

        const matchDocRef = doc(db, 'studies', studyId, 'companies', company.id, 'accountMatches', matchId);
        await setDoc(matchDocRef, matchObj);
        newMatches.push(matchObj);
      }

      setMatches(prev => [...prev, ...newMatches]);
      setSuggestedMatches(null);
      setSaveStatus('SAVED');
    } catch (err) {
      console.error('Error aplicando sugerencias de calce:', err);
      setSaveStatus('ERROR');
    }
  };

  // --- EXPORTAR INFORME DE COMPOSICIÓN DE SALDO ---
  const handleExportAccountAnalysis = () => {
    if (!selectedAccount) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const openLines = accountLines.filter(l => !l.matchId);
    const dateStr = new Date().toLocaleDateString('es-CL');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Análisis de Cuenta - ${selectedAccount.code} ${selectedAccount.name}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 12px; color: #1e293b; padding: 20px; }
            .header { border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; }
            .header h1 { margin: 0; font-size: 18px; color: #0f172a; }
            .header p { margin: 4px 0 0 0; color: #64748b; font-size: 11px; }
            .kpi-row { display: flex; gap: 15px; margin-bottom: 20px; }
            .kpi-card { background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px 14px; border-radius: 6px; flex: 1; }
            .kpi-card .label { font-size: 10px; font-weight: bold; color: #64748b; text-transform: uppercase; }
            .kpi-card .val { font-size: 16px; font-weight: bold; color: #0f172a; margin-top: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
            th { background: #f1f5f9; text-align: left; padding: 8px; border-bottom: 2px solid #cbd5e1; font-weight: 600; color: #334155; }
            td { padding: 8px; border-bottom: 1px solid #e2e8f0; }
            .num { text-align: right; font-family: monospace; }
            .footer { margin-top: 30px; border-top: 1px solid #cbd5e1; padding-top: 10px; display: flex; justify-content: space-between; font-size: 10px; color: #64748b; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>ANÁLISIS DE CUENTA CONTABLE: ${selectedAccount.code} - ${selectedAccount.name}</h1>
            <p>Empresa: <strong>${company.name}</strong> (RUT: ${company.rut}) | Fecha de Emisión: ${dateStr}</p>
          </div>

          <div class="kpi-row">
            <div class="kpi-card">
              <div class="label">Saldo Libro Mayor</div>
              <div class="val">$${accountStats.netLedgerBalance.toLocaleString('es-CL')}</div>
            </div>
            <div class="kpi-card">
              <div class="label">Composición Saldo Pendiente</div>
              <div class="val">$${accountStats.netPendingBalance.toLocaleString('es-CL')}</div>
            </div>
            <div class="kpi-card">
              <div class="label">Partidas Abiertas</div>
              <div class="val">${accountStats.pendingCount} / ${accountStats.totalLinesCount} (${accountStats.matchPercentage}% Conciliado)</div>
            </div>
          </div>

          <h3>Detalle de Partidas Abiertas (Composición del Saldo)</h3>
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Voucher</th>
                <th>Tipo</th>
                <th>RUT / Auxiliar</th>
                <th>Documento</th>
                <th>Glosa / Detalle</th>
                <th class="num">Cargo (Debe)</th>
                <th class="num">Abono (Haber)</th>
              </tr>
            </thead>
            <tbody>
              ${openLines.map(l => `
                <tr>
                  <td>${l.voucherDate}</td>
                  <td>#${l.voucherNumber}</td>
                  <td>${l.voucherType}</td>
                  <td>${l.auxiliaryRut ? `${l.auxiliaryRut} - ${l.auxiliaryName || ''}` : '-'}</td>
                  <td>${l.documentRef || '-'}</td>
                  <td>${l.gloss}</td>
                  <td class="num">${l.debit > 0 ? '$' + l.debit.toLocaleString('es-CL') : '-'}</td>
                  <td class="num">${l.credit > 0 ? '$' + l.credit.toLocaleString('es-CL') : '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="footer">
            <span>Gest_OK Contabilidad Integral Chile</span>
            <span>Informe firmado y preparado por el departamento contable</span>
          </div>

          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const monthsList = [
    { code: '01', name: 'Ene' },
    { code: '02', name: 'Feb' },
    { code: '03', name: 'Mar' },
    { code: '04', name: 'Abr' },
    { code: '05', name: 'May' },
    { code: '06', name: 'Jun' },
    { code: '07', name: 'Jul' },
    { code: '08', name: 'Ago' },
    { code: '09', name: 'Sep' },
    { code: '10', name: 'Oct' },
    { code: '11', name: 'Nov' },
    { code: '12', name: 'Dic' }
  ];

  if (viewModeType === 'DYNAMIC_SPREADSHEET') {
    return (
      <PlanillaConsultasDinamicasView
        studyId={studyId}
        company={company}
        accounts={accounts}
        vouchers={vouchers}
        fiscalYears={fiscalYears}
        auxiliaries={auxiliaries}
        rcvDocuments={rcvDocuments}
        onVouchersUpdated={onVouchersUpdated}
        onOpenVoucher={onOpenVoucher}
        initialAccountCode={selectedAccount?.code}
        onBackToTraditionalAnalysis={() => setViewModeType('TRADITIONAL')}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* --- CABECERA PRINCIPAL --- */}
      <div className="bg-slate-900 text-white p-4 rounded-xl shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold">Compensación y Análisis de Cuentas Contables</h2>
            <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold rounded-full uppercase tracking-wider">
              Finanzas & Auditoría
            </span>
          </div>
          <p className="text-xs text-slate-300 mt-0.5">
            Compensa facturas, notas de crédito, pagos, transferencias y analiza la composición exacta de cualquier cuenta del Mayor.
          </p>
        </div>

        {/* Botones Globales de Acción */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setViewModeType('DYNAMIC_SPREADSHEET')}
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm"
            title="Abrir Planilla de Cálculo Dinámica: Consultas dinámicas estilo Excel/SQL, reportes instantáneos y compensación masiva"
          >
            <FileSpreadsheet className="w-4 h-4 text-blue-200" />
            <span>Planilla Dinámica (Excel Query)</span>
          </button>

          <button
            onClick={handleRunSmartAutoMatch}
            disabled={!selectedAccount || accountLines.length === 0}
            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50 shadow-sm"
            title="Ejecutar motor inteligente para compensar automáticamente por RUT, documento, montos exactos y F29"
          >
            <Sparkles className="w-4 h-4 text-emerald-200 animate-pulse" />
            <span>Compensación Inteligente</span>
          </button>

          <button
            onClick={handleExportAccountAnalysis}
            disabled={!selectedAccount || accountLines.length === 0}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-lg font-semibold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
            title="Exportar informe impreso con la composición detallada del saldo"
          >
            <Printer className="w-4 h-4 text-slate-300" />
            <span>Informe Saldo</span>
          </button>

          <button
            onClick={fetchMatches}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg border border-slate-700 transition-colors"
            title="Refrescar estado de calces"
          >
            <RefreshCw className={`w-4 h-4 ${loadingMatches ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* --- SELECTOR DE CUENTA Y ACCESOS RÁPIDOS --- */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          
          {/* Selector principal de cuenta contable */}
          <div className="md:col-span-5">
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Cuenta Contable a Compensar / Analizar
            </label>
            <div className="relative">
              <select
                value={selectedAccountId}
                onChange={(e) => {
                  setSelectedAccountId(e.target.value);
                  setSelectedDebitKeys([]);
                  setSelectedCreditKeys([]);
                }}
                className="w-full pl-3 pr-8 py-2 bg-slate-50 border border-slate-300 rounded-lg font-medium text-xs text-slate-800 focus:bg-white focus:border-indigo-500 focus:outline-none"
              >
                {imputableAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} - {acc.name} {acc.requiereAuxiliarRUT ? '• [Exige Auxiliar]' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Filtro rápido por tipo de cuenta */}
          <div className="md:col-span-4">
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Grupo de Cuenta
            </label>
            <div className="flex items-center gap-1 overflow-x-auto">
              {(['TODAS', 'Activo', 'Pasivo', 'Patrimonio', 'Ingreso', 'Gasto'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setAccountTypeFilter(type)}
                  className={`px-2.5 py-1.5 text-[11px] font-bold rounded-md transition-colors ${
                    accountTypeFilter === type
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Buscador de código o nombre de cuenta */}
          <div className="md:col-span-3">
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Buscar en Catálogo
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Ej: 1103001, IVA, Clientes, Banco..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:bg-white focus:border-indigo-500 focus:outline-none"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            </div>
          </div>

        </div>

        {/* Sugerencias de cuentas típicas para análisis inmediato */}
        <div className="pt-2 border-t border-slate-100 flex items-center gap-2 flex-wrap text-xs">
          <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            Cuentas Sugeridas:
          </span>
          {imputableAccounts.filter(a => 
            a.code.startsWith('1103') || 
            a.name.toLowerCase().includes('iva') ||
            a.name.toLowerCase().includes('cliente') ||
            a.name.toLowerCase().includes('proveedor') ||
            a.name.toLowerCase().includes('transbank') ||
            a.name.toLowerCase().includes('f29') ||
            a.name.toLowerCase().includes('anticipo') ||
            a.name.toLowerCase().includes('fondo') ||
            a.name.toLowerCase().includes('retencion')
          ).slice(0, 8).map(acc => (
            <button
              key={acc.id}
              onClick={() => {
                setSelectedAccountId(acc.id);
                setSelectedDebitKeys([]);
                setSelectedCreditKeys([]);
              }}
              className={`px-2 py-0.5 rounded-md border text-[11px] font-mono transition-colors ${
                selectedAccountId === acc.id
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-bold'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {acc.code} - {acc.name}
            </button>
          ))}
        </div>
      </div>

      {/* --- BANNER DE AUTO-COMPENSACIÓN PARA COMPROBANTES DE TRASPASO / NC --- */}
      {pendingIntraVouchers.length > 0 && (
        <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white p-4 rounded-xl border border-emerald-500/40 shadow-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 animate-fadeIn">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/20 rounded-xl text-emerald-300 border border-emerald-500/30">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-sm text-white">
                  ¡Se detectaron {pendingIntraVouchers.length} Comprobante(s) de Compensación / Traspaso con calce cuadrado!
                </h4>
                <span className="px-2 py-0.5 bg-emerald-500/30 text-emerald-200 text-[10px] font-bold rounded-full border border-emerald-400/40">
                  Listo para aplicar
                </span>
              </div>
              <p className="text-xs text-emerald-200/90 mt-0.5">
                Comprobantes como #{pendingIntraVouchers.slice(0, 5).map(v => v.voucherNumber).join(', #')} ya tienen cargos y abonos iguales ({pendingIntraVouchers.reduce((s, v) => s + v.totalAmount, 0).toLocaleString('es-CL')}$). Puedes compensarlos ahora en 1 solo clic.
              </p>
            </div>
          </div>
          <button
            onClick={handleApplyAllIntraVouchers}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-lg transition-all shadow-md flex items-center gap-1.5 flex-shrink-0 cursor-pointer hover:scale-[1.02]"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Compensar Comprobantes ({pendingIntraVouchers.length})</span>
          </button>
        </div>
      )}

      {/* --- TARJETAS KPI DE SALDOS Y CONCILIACIÓN --- */}
      {selectedAccount && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          
          {/* Card 1: Saldo Mayor Total */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Saldo Libro Mayor</span>
                <div className="text-lg font-bold text-slate-900 mt-0.5 font-mono">
                  ${accountStats.netLedgerBalance.toLocaleString('es-CL')}
                </div>
              </div>
              <div className="p-2 bg-slate-100 text-slate-700 rounded-lg">
                <Scale className="w-4 h-4" />
              </div>
            </div>
            <div className="text-[11px] text-slate-500 mt-2 flex justify-between">
              <span>Debes: ${accountStats.totalDebit.toLocaleString('es-CL')}</span>
              <span>Haberes: ${accountStats.totalCredit.toLocaleString('es-CL')}</span>
            </div>
          </div>

          {/* Card 2: Saldo Pendiente de Compensar */}
          <div className="bg-white p-3.5 rounded-xl border border-amber-200 bg-amber-50/20 shadow-2xs">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Saldo Partidas Abiertas</span>
                <div className="text-lg font-bold text-amber-900 mt-0.5 font-mono">
                  ${accountStats.netPendingBalance.toLocaleString('es-CL')}
                </div>
              </div>
              <div className="p-2 bg-amber-100 text-amber-800 rounded-lg">
                <AlertCircle className="w-4 h-4" />
              </div>
            </div>
            <div className="text-[11px] text-amber-800 font-medium mt-2">
              {accountStats.pendingCount} de {accountStats.totalLinesCount} movimientos sin compensar
            </div>
          </div>

          {/* Card 3: Monto Total Compensado */}
          <div className="bg-white p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-2xs">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Monto Compensado (Pareado)</span>
                <div className="text-lg font-bold text-emerald-900 mt-0.5 font-mono">
                  ${accountStats.totalMatchedAmount.toLocaleString('es-CL')}
                </div>
              </div>
              <div className="p-2 bg-emerald-100 text-emerald-800 rounded-lg">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="text-[11px] text-emerald-800 font-medium mt-2">
              {accountStats.matchedCount} partidas regularizadas
            </div>
          </div>

          {/* Card 4: % de Conciliación */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Nivel de Compensación</span>
                <div className="text-lg font-bold text-indigo-700 mt-0.5 font-mono">
                  {accountStats.matchPercentage}%
                </div>
              </div>
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="w-full bg-slate-100 h-1.5 rounded-full mt-3 overflow-hidden">
              <div
                className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                style={{ width: `${accountStats.matchPercentage}%` }}
              />
            </div>
          </div>

        </div>
      )}

      {/* --- SUGERENCIAS DE COMPENSACIÓN INTELIGENTE --- */}
      {suggestedMatches && (
        <div className="bg-indigo-900 text-white p-4 rounded-xl shadow-lg border border-indigo-700 animate-fadeIn">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-300 animate-spin" />
              <h3 className="font-bold text-sm">
                Sugerencias del Motor Inteligente ({suggestedMatches.length} compensaciones encontradas)
              </h3>
            </div>
            <div className="flex items-center gap-2">
              {suggestedMatches.length > 0 && (
                <button
                  onClick={() => handleApplySuggestedMatches()}
                  className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-900 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  <Check className="w-4 h-4" />
                  <span>Compensar Todos ({suggestedMatches.length})</span>
                </button>
              )}
              <button
                onClick={() => setSuggestedMatches(null)}
                className="p-1 text-slate-300 hover:text-white"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
          </div>

          {suggestedMatches.length === 0 ? (
            <p className="text-xs text-indigo-200">
              No se encontraron coincidencias directas automáticas para esta cuenta. Utiliza la barra de filtros inferiores para parear manualmente o por RUT.
            </p>
          ) : (
            <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
              {suggestedMatches.map((sug) => (
                <div key={sug.id} className="bg-indigo-800/80 p-3 rounded-lg border border-indigo-600/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 bg-indigo-700 text-indigo-200 rounded text-[10px] font-mono font-bold">
                        {sug.rule}
                      </span>
                      <span className="font-bold text-emerald-300 font-mono text-sm">
                        Monto: ${sug.totalAmount.toLocaleString('es-CL')}
                      </span>
                    </div>
                    <div className="text-[11px] text-indigo-200">
                      <strong>Debe:</strong> {sug.debitLines.map(d => `Vch #${d.voucherNumber} (${d.voucherDate}) $${d.debit.toLocaleString('es-CL')}`).join(', ')}
                      {' ↔ '}
                      <strong>Haber:</strong> {sug.creditLines.map(c => `Vch #${c.voucherNumber} (${c.voucherDate}) $${c.credit.toLocaleString('es-CL')}`).join(', ')}
                    </div>
                  </div>

                  <button
                    onClick={() => handleApplySuggestedMatches([sug])}
                    className="px-3 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-900 rounded font-bold text-[11px] transition-colors flex-shrink-0"
                  >
                    Compensar Este
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* --- BARRA COMPLETA DE FILTROS AVANZADOS DE PARTIDAS --- */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
        {/* Fila 1: Pestañas de Vista (Pendientes, Calzadas, Todas) + Toggle de Filtros + Limpiar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          
          {/* Toggle de Modo de Vista */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg w-full sm:w-auto">
            <button
              onClick={() => setViewMode('PENDIENTES')}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                viewMode === 'PENDIENTES'
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Partidas Abiertas ({accountStats.pendingCount})</span>
            </button>

            <button
              onClick={() => setViewMode('CALZADAS')}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                viewMode === 'CALZADAS'
                  ? 'bg-emerald-700 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Compensadas ({accountStats.matchedCount})</span>
            </button>

            <button
              onClick={() => setViewMode('TODAS')}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                viewMode === 'TODAS'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Todas ({accountLines.length})</span>
            </button>
          </div>

          {/* Acciones de Selección y Reset */}
          <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto justify-end">
            {activeFiltersCount > 0 && (
              <button
                onClick={resetAllFilters}
                className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-md text-[11px] font-bold flex items-center gap-1 transition-colors"
                title="Quitar todos los filtros aplicados"
              >
                <X className="w-3.5 h-3.5" />
                <span>Limpiar Filtros ({activeFiltersCount})</span>
              </button>
            )}

            {(selectedDebitKeys.length > 0 || selectedCreditKeys.length > 0) && (
              <button
                onClick={() => {
                  setSelectedDebitKeys([]);
                  setSelectedCreditKeys([]);
                }}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-[11px] font-semibold flex items-center gap-1"
              >
                <XCircle className="w-3.5 h-3.5 text-slate-500" />
                <span>Deseleccionar ({selectedDebitKeys.length + selectedCreditKeys.length})</span>
              </button>
            )}

            <button
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-600" />
              <span>{showAdvancedFilters ? 'Ocultar Filtros' : 'Mostrar Filtros'}</span>
            </button>
          </div>

        </div>

        {/* Fila 2: PANEL COMPLETO DE FILTROS */}
        {showAdvancedFilters && (
          <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            
            {/* Filtro 1: Selector de RUT / Auxiliar */}
            <div>
              <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1">
                <User className="w-3 h-3 text-indigo-600" />
                <span>RUT / Auxiliar</span>
              </label>
              <select
                value={filterRut}
                onChange={(e) => {
                  setFilterRut(e.target.value);
                  if (e.target.value !== 'TODOS' && e.target.value !== '__CON_RUT__' && e.target.value !== '__SIN_RUT__') {
                    setFilterRutQuery('');
                  }
                }}
                className="w-full px-2 py-1.5 bg-slate-50 border border-slate-300 rounded text-xs text-slate-800 focus:bg-white focus:border-indigo-500 focus:outline-none"
              >
                <option value="TODOS">Todos los RUTs ({accountRutsList.length})</option>
                <option value="__CON_RUT__">★ Sólo con RUT asignado</option>
                <option value="__SIN_RUT__">∅ Sin RUT / Genéricos</option>
                {accountRutsList.map(r => (
                  <option key={r.rut} value={r.rut}>
                    {r.rut} - {r.name.slice(0, 20)} ({r.pendingCount} pend)
                  </option>
                ))}
              </select>
            </div>

            {/* Filtro 2: Búsqueda libre RUT o Razón Social */}
            <div>
              <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Buscar RUT / Nombre
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Ej: 76.123..., Enel, Falabella"
                  value={filterRutQuery}
                  onChange={(e) => setFilterRutQuery(e.target.value)}
                  className="w-full pl-7 pr-2 py-1.5 bg-slate-50 border border-slate-300 rounded text-xs text-slate-800 focus:bg-white focus:border-indigo-500 focus:outline-none"
                />
                <Search className="w-3 h-3 text-slate-400 absolute left-2 top-2.5" />
              </div>
            </div>

            {/* Filtro 3: Documento / Folio / Factura */}
            <div>
              <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Hash className="w-3 h-3 text-emerald-600" />
                <span>N° Documento / Folio</span>
              </label>
              <input
                type="text"
                placeholder="Ej: 14502, FAC-88..."
                value={filterDoc}
                onChange={(e) => setFilterDoc(e.target.value)}
                className="w-full px-2 py-1.5 bg-slate-50 border border-slate-300 rounded text-xs text-slate-800 focus:bg-white focus:border-indigo-500 focus:outline-none"
              />
            </div>

            {/* Filtro 4: Monto / Cantidad */}
            <div>
              <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1">
                <DollarSign className="w-3 h-3 text-amber-600" />
                <span>Monto ($)</span>
              </label>
              <input
                type="text"
                placeholder="Ej: 50000 o 1500000"
                value={filterAmount}
                onChange={(e) => setFilterAmount(e.target.value)}
                className="w-full px-2 py-1.5 bg-slate-50 border border-slate-300 rounded text-xs text-slate-800 font-mono focus:bg-white focus:border-indigo-500 focus:outline-none"
              />
            </div>

            {/* Filtro 5: N° Comprobante Contable */}
            <div>
              <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1">
                <FileText className="w-3 h-3 text-indigo-600" />
                <span>N° Comprobante</span>
              </label>
              <input
                type="text"
                placeholder="Ej: 42, 108..."
                value={filterVoucherNumber}
                onChange={(e) => setFilterVoucherNumber(e.target.value)}
                className="w-full px-2 py-1.5 bg-slate-50 border border-slate-300 rounded text-xs text-slate-800 font-mono focus:bg-white focus:border-indigo-500 focus:outline-none"
              />
            </div>

            {/* Filtro 6: Tipo de Comprobante */}
            <div>
              <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Tipo Comprobante
              </label>
              <select
                value={filterVoucherType}
                onChange={(e) => setFilterVoucherType(e.target.value as any)}
                className="w-full px-2 py-1.5 bg-slate-50 border border-slate-300 rounded text-xs text-slate-800 focus:bg-white focus:border-indigo-500 focus:outline-none"
              >
                <option value="TODOS">Todos los Tipos</option>
                <option value="Ingreso">Ingreso</option>
                <option value="Egreso">Egreso</option>
                <option value="Traspaso">Traspaso</option>
              </select>
            </div>

          </div>
        )}

        {/* Fila 3: Filtro por Meses + Toggle de Coincidencias Exactas */}
        {showAdvancedFilters && (
          <div className="pt-2 border-t border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-2 text-xs">
            
            {/* Selector de Meses */}
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[10px] font-bold text-slate-500 uppercase mr-1">Mes:</span>
              <button
                onClick={() => setFilterMonth('TODOS')}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                  filterMonth === 'TODOS'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Todos
              </button>
              {monthsList.map(m => (
                <button
                  key={m.code}
                  onClick={() => setFilterMonth(m.code)}
                  className={`px-1.5 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                    filterMonth === m.code
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {m.name}
                </button>
              ))}
            </div>

            {/* Toggle: Sólo montos con contraparte idéntica */}
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-1.5 cursor-pointer bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 text-emerald-900 font-semibold text-[11px] hover:bg-emerald-100 transition-colors">
                <input
                  type="checkbox"
                  checked={filterOnlyMatchingAmounts}
                  onChange={(e) => setFilterOnlyMatchingAmounts(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span>⚡ Mostrar sólo montos con contraparte idéntica</span>
              </label>
            </div>

          </div>
        )}
      </div>

      {/* --- TABLA PRINCIPAL DE MOVIMIENTOS: CARGOS VS ABONOS --- */}
      {viewMode === 'CALZADAS' ? (
        /* VISTA DE MOVIMIENTOS YA COMPENSADOS */
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-3.5 bg-slate-50 border-b border-slate-200 font-bold text-xs text-slate-800 flex justify-between items-center">
            <span>Histórico de Compensaciones y Pareos</span>
            <span className="text-slate-500 text-[11px] font-normal">
              Mostrando grupos de movimientos compensados en esta cuenta
            </span>
          </div>

          <div className="divide-y divide-slate-200 max-h-[550px] overflow-y-auto">
            {matches.filter(m => m.accountId === selectedAccountId || m.accountCode === selectedAccount?.code).length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                No hay compensaciones registradas para esta cuenta contable aún.
              </div>
            ) : (
              matches.filter(m => m.accountId === selectedAccountId || m.accountCode === selectedAccount?.code).map((m) => (
                <div key={m.id} className="p-3.5 hover:bg-slate-50/80 transition-colors">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-mono font-bold text-[11px] rounded border border-emerald-300">
                        Match ID: {m.id.substr(0, 14)}
                      </span>
                      <span className="text-xs text-slate-500 font-medium">
                        Fecha: {new Date(m.matchDate).toLocaleDateString('es-CL')} | Por: {m.matchedBy}
                      </span>
                      {m.creationMode === 'AUTOMATICO' && (
                        <span className="px-1.5 py-0.2 bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded">
                          Automático
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-slate-900 text-sm">
                        Monto: ${m.totalAmount.toLocaleString('es-CL')}
                      </span>
                      <button
                        onClick={() => handleUnmatchGroup(m.id)}
                        className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded font-semibold text-[11px] flex items-center gap-1 transition-colors"
                      >
                        <Unlink className="w-3.5 h-3.5" />
                        <span>Descompensar Partidas</span>
                      </button>
                    </div>
                  </div>

                  {m.notes && (
                    <div className="text-[11px] text-slate-600 bg-slate-100/70 p-1.5 rounded mb-2 italic">
                      Nota: "{m.notes}"
                    </div>
                  )}

                  {/* Tabla interna de las líneas involucradas */}
                  <div className="overflow-x-auto rounded border border-slate-200">
                    <table className="w-full text-[11px] text-left">
                      <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px]">
                        <tr>
                          <th className="p-1.5">Fecha</th>
                          <th className="p-1.5">Voucher</th>
                          <th className="p-1.5">RUT / Auxiliar</th>
                          <th className="p-1.5">Documento</th>
                          <th className="p-1.5">Glosa</th>
                          <th className="p-1.5 text-right">Cargo (Debe)</th>
                          <th className="p-1.5 text-right">Abono (Haber)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {m.matchedLines.map((l, idx) => (
                          <tr key={idx} className="bg-white hover:bg-slate-50">
                            <td className="p-1.5 font-mono">{l.voucherDate}</td>
                            <td className="p-1.5 font-semibold">
                              <button
                                type="button"
                                onClick={() => onOpenVoucher?.(l.voucherId || l.voucherNumber)}
                                className="inline-flex items-center gap-1 font-bold text-xs text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-1.5 py-0.5 rounded border border-indigo-200 transition-all cursor-pointer shadow-2xs group"
                                title="Abrir comprobante"
                              >
                                <span>#{l.voucherNumber}</span>
                                <ExternalLink className="w-2.5 h-2.5 text-indigo-500 group-hover:text-indigo-800" />
                              </button>
                            </td>
                            <td className="p-1.5">{l.auxiliaryRut ? `${l.auxiliaryRut}` : '-'}</td>
                            <td className="p-1.5">{l.documentRef || '-'}</td>
                            <td className="p-1.5 text-slate-700 max-w-xs truncate">{l.gloss}</td>
                            <td className="p-1.5 text-right font-mono font-bold text-slate-900">
                              {l.debit > 0 ? `$${l.debit.toLocaleString('es-CL')}` : '-'}
                            </td>
                            <td className="p-1.5 text-right font-mono font-bold text-slate-900">
                              {l.credit > 0 ? `$${l.credit.toLocaleString('es-CL')}` : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        /* VISTA DIVIDIDA 2 COLUMNAS (CARGOS DEBES IZQUIERDA VS ABONOS HABERES DERECHA) */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          
          {/* COLUMNA IZQUIERDA: CARGOS (DEBES) */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col">
            <div className="p-3 bg-slate-900 text-white font-bold text-xs flex justify-between items-center">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <span>Cargos (Debes) ({debitLines.length})</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleSelectAllVisible('debit')}
                  className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[10px] font-semibold flex items-center gap-1 border border-slate-700"
                >
                  <CheckSquare className="w-3 h-3" />
                  <span>Sel. Visibles</span>
                </button>
                <span className="font-mono text-emerald-300">
                  Total: ${debitLines.reduce((acc, curr) => acc + curr.debit, 0).toLocaleString('es-CL')}
                </span>
              </div>
            </div>

            {/* Buscador y Orden de la Tabla Debes */}
            <div className="p-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Buscar en Cargos (RUT, Doc, Glosa, Monto)..."
                  value={debitSearchQuery}
                  onChange={(e) => setDebitSearchQuery(e.target.value)}
                  className="w-full pl-7 pr-2 py-1 bg-white border border-slate-200 rounded text-[11px] focus:outline-none focus:border-indigo-500"
                />
                <Search className="w-3 h-3 text-slate-400 absolute left-2 top-2" />
              </div>

              <div className="flex items-center gap-1 text-[11px]">
                <span className="text-slate-500 text-[10px]">Orden:</span>
                <select
                  value={`${debitSortBy}_${debitSortDir}`}
                  onChange={(e) => {
                    const [by, dir] = e.target.value.split('_');
                    setDebitSortBy(by as any);
                    setDebitSortDir(dir as any);
                  }}
                  className="px-1.5 py-1 bg-white border border-slate-200 rounded text-[11px]"
                >
                  <option value="date_asc">Fecha (Antigua a Reciente)</option>
                  <option value="date_desc">Fecha (Reciente a Antigua)</option>
                  <option value="amount_desc">Monto (Mayor a Menor)</option>
                  <option value="amount_asc">Monto (Menor a Mayor)</option>
                  <option value="voucher_asc">Voucher # (Asc)</option>
                  <option value="rut_asc">RUT (A-Z)</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto overflow-y-auto max-h-[520px] flex-1">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] sticky top-0 z-10 border-b border-slate-200">
                  <tr>
                    <th className="p-2 w-8 text-center">Sel</th>
                    <th className="p-2">Fecha</th>
                    <th className="p-2">Vch</th>
                    <th className="p-2">RUT / Auxiliar</th>
                    <th className="p-2">Doc</th>
                    <th className="p-2">Glosa</th>
                    <th className="p-2 text-right">Monto Cargo</th>
                    <th className="p-2 text-center w-12">Parear</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {debitLines.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-400 text-xs">
                        No hay movimientos de cargo con los filtros actuales.
                      </td>
                    </tr>
                  ) : (
                    debitLines.map((l) => {
                      const isSelected = selectedDebitKeys.includes(l.key);
                      const hasExactMatch = pendingCreditAmounts.has(l.debit);
                      return (
                        <tr
                          key={l.key}
                          onClick={() => {
                            if (l.matchId) return;
                            setSelectedDebitKeys(prev => 
                              prev.includes(l.key) ? prev.filter(k => k !== l.key) : [...prev, l.key]
                            );
                          }}
                          className={`cursor-pointer transition-colors ${
                            l.matchId 
                              ? 'bg-emerald-50/40 text-slate-400' 
                              : isSelected
                              ? 'bg-amber-100/90 font-medium text-amber-900'
                              : hasExactMatch
                              ? 'hover:bg-emerald-50/60'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              disabled={!!l.matchId}
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedDebitKeys(prev => [...prev, l.key]);
                                } else {
                                  setSelectedDebitKeys(prev => prev.filter(k => k !== l.key));
                                }
                              }}
                              className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                            />
                          </td>
                          <td className="p-2 font-mono text-[11px] whitespace-nowrap">{l.voucherDate}</td>
                          <td className="p-2 font-semibold">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenVoucher?.(l.voucherId || l.voucherNumber);
                              }}
                              className="inline-flex items-center gap-1 font-bold text-xs text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-1.5 py-0.5 rounded border border-indigo-200 transition-all cursor-pointer shadow-2xs group"
                              title="Abrir comprobante"
                            >
                              <span>#{l.voucherNumber}</span>
                              <ExternalLink className="w-2.5 h-2.5 text-indigo-500 group-hover:text-indigo-800" />
                            </button>
                          </td>
                          <td className="p-2 text-[11px]">
                            {l.auxiliaryRut ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectRutLines(l.auxiliaryRut!);
                                }}
                                className="font-mono bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200 transition-colors text-[10px] font-bold"
                                title="Filtrar y seleccionar todo este RUT"
                              >
                                {l.auxiliaryRut}
                              </button>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className="p-2 text-[11px]">
                            {l.documentRef ? (
                              <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-mono text-[10px]">
                                #{l.documentRef}
                              </span>
                            ) : '-'}
                          </td>
                          <td className="p-2 max-w-[160px] truncate text-[11px] text-slate-700" title={l.gloss}>
                            {l.gloss}
                          </td>
                          <td className="p-2 text-right font-mono font-bold text-slate-900">
                            ${l.debit.toLocaleString('es-CL')}
                          </td>
                          <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => handleQuickMatchLine(l)}
                              className={`p-1 rounded text-[10px] font-bold transition-all ${
                                hasExactMatch
                                  ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border border-emerald-300'
                                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                              }`}
                              title={hasExactMatch ? "¡Contraparte con monto exacto encontrada! Clic para parear" : "Buscar contraparte por este monto"}
                            >
                              <Zap className={`w-3 h-3 ${hasExactMatch ? 'text-emerald-700 fill-emerald-500' : 'text-slate-500'}`} />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* COLUMNA DERECHA: ABONOS (HABERES) */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col">
            <div className="p-3 bg-slate-900 text-white font-bold text-xs flex justify-between items-center">
              <div className="flex items-center gap-1.5">
                <TrendingDown className="w-4 h-4 text-amber-400" />
                <span>Abonos (Haberes) ({creditLines.length})</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleSelectAllVisible('credit')}
                  className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[10px] font-semibold flex items-center gap-1 border border-slate-700"
                >
                  <CheckSquare className="w-3 h-3" />
                  <span>Sel. Visibles</span>
                </button>
                <span className="font-mono text-amber-300">
                  Total: ${creditLines.reduce((acc, curr) => acc + curr.credit, 0).toLocaleString('es-CL')}
                </span>
              </div>
            </div>

            {/* Buscador y Orden de la Tabla Haberes */}
            <div className="p-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Buscar en Abonos (RUT, Doc, Glosa, Monto)..."
                  value={creditSearchQuery}
                  onChange={(e) => setCreditSearchQuery(e.target.value)}
                  className="w-full pl-7 pr-2 py-1 bg-white border border-slate-200 rounded text-[11px] focus:outline-none focus:border-indigo-500"
                />
                <Search className="w-3 h-3 text-slate-400 absolute left-2 top-2" />
              </div>

              <div className="flex items-center gap-1 text-[11px]">
                <span className="text-slate-500 text-[10px]">Orden:</span>
                <select
                  value={`${creditSortBy}_${creditSortDir}`}
                  onChange={(e) => {
                    const [by, dir] = e.target.value.split('_');
                    setCreditSortBy(by as any);
                    setCreditSortDir(dir as any);
                  }}
                  className="px-1.5 py-1 bg-white border border-slate-200 rounded text-[11px]"
                >
                  <option value="date_asc">Fecha (Antigua a Reciente)</option>
                  <option value="date_desc">Fecha (Reciente a Antigua)</option>
                  <option value="amount_desc">Monto (Mayor a Menor)</option>
                  <option value="amount_asc">Monto (Menor a Mayor)</option>
                  <option value="voucher_asc">Voucher # (Asc)</option>
                  <option value="rut_asc">RUT (A-Z)</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto overflow-y-auto max-h-[520px] flex-1">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] sticky top-0 z-10 border-b border-slate-200">
                  <tr>
                    <th className="p-2 w-8 text-center">Sel</th>
                    <th className="p-2">Fecha</th>
                    <th className="p-2">Vch</th>
                    <th className="p-2">RUT / Auxiliar</th>
                    <th className="p-2">Doc</th>
                    <th className="p-2">Glosa</th>
                    <th className="p-2 text-right">Monto Abono</th>
                    <th className="p-2 text-center w-12">Parear</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {creditLines.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-400 text-xs">
                        No hay movimientos de abono con los filtros actuales.
                      </td>
                    </tr>
                  ) : (
                    creditLines.map((l) => {
                      const isSelected = selectedCreditKeys.includes(l.key);
                      const hasExactMatch = pendingDebitAmounts.has(l.credit);
                      return (
                        <tr
                          key={l.key}
                          onClick={() => {
                            if (l.matchId) return;
                            setSelectedCreditKeys(prev => 
                              prev.includes(l.key) ? prev.filter(k => k !== l.key) : [...prev, l.key]
                            );
                          }}
                          className={`cursor-pointer transition-colors ${
                            l.matchId 
                              ? 'bg-emerald-50/40 text-slate-400' 
                              : isSelected
                              ? 'bg-amber-100/90 font-medium text-amber-900'
                              : hasExactMatch
                              ? 'hover:bg-emerald-50/60'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              disabled={!!l.matchId}
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedCreditKeys(prev => [...prev, l.key]);
                                } else {
                                  setSelectedCreditKeys(prev => prev.filter(k => k !== l.key));
                                }
                              }}
                              className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                            />
                          </td>
                          <td className="p-2 font-mono text-[11px] whitespace-nowrap">{l.voucherDate}</td>
                          <td className="p-2 font-semibold">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenVoucher?.(l.voucherId || l.voucherNumber);
                              }}
                              className="inline-flex items-center gap-1 font-bold text-xs text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-1.5 py-0.5 rounded border border-indigo-200 transition-all cursor-pointer shadow-2xs group"
                              title="Abrir comprobante"
                            >
                              <span>#{l.voucherNumber}</span>
                              <ExternalLink className="w-2.5 h-2.5 text-indigo-500 group-hover:text-indigo-800" />
                            </button>
                          </td>
                          <td className="p-2 text-[11px]">
                            {l.auxiliaryRut ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectRutLines(l.auxiliaryRut!);
                                }}
                                className="font-mono bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200 transition-colors text-[10px] font-bold"
                                title="Filtrar y seleccionar todo este RUT"
                              >
                                {l.auxiliaryRut}
                              </button>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className="p-2 text-[11px]">
                            {l.documentRef ? (
                              <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-mono text-[10px]">
                                #{l.documentRef}
                              </span>
                            ) : '-'}
                          </td>
                          <td className="p-2 max-w-[160px] truncate text-[11px] text-slate-700" title={l.gloss}>
                            {l.gloss}
                          </td>
                          <td className="p-2 text-right font-mono font-bold text-slate-900">
                            ${l.credit.toLocaleString('es-CL')}
                          </td>
                          <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => handleQuickMatchLine(l)}
                              className={`p-1 rounded text-[10px] font-bold transition-all ${
                                hasExactMatch
                                  ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border border-emerald-300'
                                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                              }`}
                              title={hasExactMatch ? "¡Contraparte con monto exacto encontrada! Clic para parear" : "Buscar contraparte por este monto"}
                            >
                              <Zap className={`w-3 h-3 ${hasExactMatch ? 'text-emerald-700 fill-emerald-500' : 'text-slate-500'}`} />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* --- PANEL FLOTANTE INFERIOR DE CONFIRMACIÓN DE COMPENSACIÓN --- */}
      {(selectedDebitKeys.length > 0 || selectedCreditKeys.length > 0) && (
        <div className="fixed bottom-4 right-4 left-4 md:left-64 z-40 bg-slate-900 text-white p-4 rounded-2xl shadow-2xl border border-slate-700 animate-slideUp">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            
            {/* Resumen matemático de la selección */}
            <div className="space-y-1">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Compensación Activa
                </span>
                <span className="px-2.5 py-0.5 bg-slate-800 text-emerald-300 rounded-md text-xs font-mono font-bold border border-slate-700">
                  {selectionMath.selectedDebitsCount} Cargo(s): ${selectionMath.sumDebits.toLocaleString('es-CL')}
                </span>
                <span className="text-slate-500 font-bold">↔</span>
                <span className="px-2.5 py-0.5 bg-slate-800 text-amber-300 rounded-md text-xs font-mono font-bold border border-slate-700">
                  {selectionMath.selectedCreditsCount} Abono(s): ${selectionMath.sumCredits.toLocaleString('es-CL')}
                </span>
              </div>

              <div className="text-xs flex items-center gap-2 flex-wrap">
                <span>Diferencia:</span>
                <span className={`font-mono font-bold text-sm px-2.5 py-0.5 rounded-md ${
                  selectionMath.diff === 0 && selectionMath.sumDebits > 0
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                }`}>
                  ${selectionMath.diff.toLocaleString('es-CL')}
                </span>
                {selectionMath.diff === 0 && selectionMath.sumDebits > 0 ? (
                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> Cuadrado Exacto (Listo para compensar)
                  </span>
                ) : (
                  <span className="text-rose-400 text-[11px]">
                    (Faltan ${selectionMath.diff.toLocaleString('es-CL')} para igualar cargos y abonos)
                  </span>
                )}
              </div>
            </div>

            {/* Ingrese nota y botón final de Compensar */}
            <div className="flex items-center gap-2 w-full md:w-auto">
              <input
                type="text"
                placeholder="Glosa/Nota (ej: Compensación Facturas vs Pago)..."
                value={matchNotes}
                onChange={(e) => setMatchNotes(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-white placeholder-slate-400 text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-amber-400 flex-1 md:w-64"
              />

              <button
                onClick={handleCreateManualMatch}
                disabled={!selectionMath.isMatchedPair}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-lg font-bold text-xs flex items-center gap-2 transition-colors flex-shrink-0 shadow-lg cursor-pointer disabled:cursor-not-allowed"
              >
                <Link2 className="w-4 h-4" />
                <span>Compensar Partidas</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
