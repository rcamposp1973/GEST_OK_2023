import React, { useState, useMemo, useEffect } from 'react';
import { periodosParaSelector } from '../utils/periodUtils';
import { inicioAcumuladoVigente } from '../utils/cierreAnio';
import { Company, Voucher, ChartOfAccount, FiscalPeriodYear } from '../types';
import { 
  Scale, 
  Download, 
  Printer, 
  ChevronRight, 
  ChevronDown, 
  CheckCircle2, 
  AlertTriangle,
  FolderTree,
  Eye,
  EyeOff,
  Layers,
  ShieldCheck,
  TrendingUp
} from 'lucide-react';
import { BalanceIFRSPrintModal } from './BalanceIFRSPrintModal';
import { getNaturaleza, getRubroESF, RUBROS_ESF, problemasClasificacion } from '../utils/ifrsClassification';

interface BalanceIFRSViewProps {
  periodoGlobal?: string;
  onCambiarPeriodoGlobal?: (periodo: string) => void;
  company: Company;
  vouchers: Voucher[];
  accounts: ChartOfAccount[];
  fiscalYears: FiscalPeriodYear[];
  onOpenAuditor?: () => void;
  onOpenEstadoResultados?: () => void;
}

interface IFRSAccountLine {
  id: string;
  code: string;
  name: string;
  debit: number;
  credit: number;
  balance: number;
}

interface IFRSParentRubro {
  id: string;
  code: string;
  name: string;
  total: number;
  accounts: IFRSAccountLine[];
}

export default function BalanceIFRSView({
  company,
  vouchers,
  accounts,
  fiscalYears,
  periodoGlobal,
  onCambiarPeriodoGlobal,
  onOpenAuditor,
  onOpenEstadoResultados
}: BalanceIFRSViewProps) {
  const [periodFilter, setPeriodFilter] = useState<string>('Todos');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [showZeroBalances, setShowZeroBalances] = useState<boolean>(false);
  const [showRevision, setShowRevision] = useState<boolean>(false);
  const hallazgos = useMemo(() => problemasClasificacion(accounts), [accounts]);
  const [showAccountDetails, setShowAccountDetails] = useState<boolean>(true);
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);
  const [expandedRubros, setExpandedRubros] = useState<Record<string, boolean>>({
    '1101': true,
    '1102': true,
    '1103': true,
    '1201': true,
    '2101': true,
    '2103': true,
    '2301': true
  });

  const toggleRubro = (rubroId: string) => {
    setExpandedRubros(prev => ({ ...prev, [rubroId]: !prev[rubroId] }));
  };

  // Enfoque acumulativo para el Balance IFRS (Estado de Situación Financiera)
  const handlePeriodChange = (val: string) => {
    setPeriodFilter(val);
    if (val !== 'Todos') {
      const year = val.slice(0, 4);
      setDateFrom(`${year}-01-01`);
      const parts = val.split('-');
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const lastDay = new Date(y, m, 0).getDate();
      setDateTo(`${val}-${String(lastDay).padStart(2, '0')}`);
    } else {
      setDateFrom('');
      setDateTo('');
    }
  };

  const handleDateFromChange = (date: string) => {
    setDateFrom(date);
  };

  const handleDateToChange = (date: string) => {
    if (dateFrom && date && date < dateFrom) {
      alert("La fecha de término no puede ser anterior a la fecha de inicio.");
      return;
    }
    setDateTo(date);
  };

  // Available periods from vouchers
  const availablePeriods = useMemo(() => {
    const periodsSet = new Set<string>();
    vouchers.forEach(v => {
      const p = v.period || (v.date && v.date.length >= 7 ? v.date.slice(0, 7) : '');
      if (p && p.length === 7) {
        periodsSet.add(p);
      }
    });
    return periodosParaSelector(fiscalYears, periodsSet);
  }, [vouchers, fiscalYears]);

  // Período compartido entre pestañas: al volver a esta pantalla queda en el mes elegido
  useEffect(() => {
    if (!periodoGlobal) return;
    if (availablePeriods.includes(periodoGlobal)) {
      if (periodFilter !== periodoGlobal) handlePeriodChange(periodoGlobal);
    } else if (periodFilter !== 'Todos') {
      handlePeriodChange('Todos');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodoGlobal, availablePeriods.length]);

  // Account map
  const accountMap = useMemo(() => {
    const map = new Map<string, ChartOfAccount>();
    accounts.forEach(a => {
      map.set(a.id, a);
      map.set(a.code, a);
    });
    return map;
  }, [accounts]);

  // Classification & Grouping by Parent Rubros (Cuentas Padre IFRS)
  const {
    activosCorrientesRubros,
    activosNoCorrientesRubros,
    pasivosCorrientesRubros,
    pasivosNoCorrientesRubros,
    patrimonioRubros,
    totalActivosCorrientes,
    totalActivosNoCorrientes,
    totalActivos,
    totalPasivosCorrientes,
    totalPasivosNoCorrientes,
    totalPasivos,
    totalPatrimonioNeto,
    resultadoEjercicio,
    totalPasivoMasPatrimonio,
    diferenciaCuadratura,
    isBalanced,
    descuadradosCount
  } = useMemo(() => {
    // 1. Filtrar comprobantes válidos y equilibrados (Enfoque Acumulativo de Balance)
    const validVouchers: Voucher[] = [];
    const descuadradosVouchers: Voucher[] = [];

    const inicioAcumulado = periodFilter === 'Todos' ? inicioAcumuladoVigente(vouchers) : '';
    vouchers.forEach(v => {
      if (v.status === 'Anulado') return;
      if (inicioAcumulado && (v.date || '') < inicioAcumulado) return; // ya incluidos en la apertura
      if (v.origin === 'CIERRE_ANIO') return; // el resultado se calcula desde las cuentas; el comprobante de cierre no se suma de nuevo

      const vDate = v.date || '';
      const vPeriod = v.period || (vDate ? vDate.slice(0, 7) : '');

      // El Balance IFRS es un Estado de Situación Financiera que acumula saldos a la fecha de corte.
      // Al seleccionar un período (ej: 2026-10), acumula todos los comprobantes desde el inicio
      // del ejercicio comercial (enero o apertura) hasta dicho período.
      if (periodFilter !== 'Todos') {
        const year = periodFilter.slice(0, 4);
        if (vPeriod) {
          if (vPeriod < `${year}-01` || vPeriod > periodFilter) return;
        } else if (vDate) {
          if (vDate < `${year}-01-01` || vDate.slice(0, 7) > periodFilter) return;
        }
      }

      // Filtro por rango de fechas (Desde / Hasta)
      if (dateFrom && vDate && vDate < dateFrom) return;
      if (dateTo && vDate && vDate > dateTo) return;

      const vDebe = (v.lines || []).reduce((s, l) => s + (Number(l.debit) || 0), 0);
      const vHaber = (v.lines || []).reduce((s, l) => s + (Number(l.credit) || 0), 0);

      if (Math.abs(vDebe - vHaber) > 0.01) {
        descuadradosVouchers.push(v);
      } else {
        validVouchers.push(v);
      }
    });

    // 2. Acumular movimientos por cuenta
    const accSums = new Map<string, { debit: number; credit: number; account: ChartOfAccount }>();

    accounts.forEach(a => {
      accSums.set(a.id, { debit: 0, credit: 0, account: a });
    });

    validVouchers.forEach(v => {
      (v.lines || []).forEach(l => {
        const debit = Number(l.debit) || 0;
        const credit = Number(l.credit) || 0;
        if (debit === 0 && credit === 0) return;

        let targetAcc = accountMap.get(l.accountId) || accountMap.get(l.accountCode);
        if (!targetAcc) {
          const accCodeStr = (l.accountCode || '9999999').trim();
          const p = accCodeStr.charAt(0);
          let inferredType: 'Activo' | 'Pasivo' | 'Patrimonio' | 'Ingreso' | 'Gasto' = 'Gasto';
          if (p === '1') inferredType = 'Activo';
          else if (p === '2') {
            inferredType = (accCodeStr.startsWith('23') || accCodeStr.startsWith('2.3')) ? 'Patrimonio' : 'Pasivo';
          }
          else if (p === '3') inferredType = 'Ingreso';
          else if (p === '4' || p === '5') inferredType = 'Gasto';

          targetAcc = {
            id: l.accountId || l.accountCode || 'unknown',
            code: accCodeStr,
            name: l.accountName || 'Cuenta no clasificada',
            type: inferredType,
            requiereCentroCosto: false,
            requiereAuxiliarRUT: false,
            requiereConciliacionBancaria: false,
            requiereDocumento: false,
            estado: 'Activo'
          };
        }

        let entry = accSums.get(targetAcc.id);
        if (!entry) {
          entry = { debit: 0, credit: 0, account: targetAcc };
          accSums.set(targetAcc.id, entry);
        }

        entry.debit += debit;
        entry.credit += credit;
      });
    });

    // 3. Rubros del Estado de Situación Financiera (motor único de clasificación)
    const rubrosMap = new Map<string, IFRSParentRubro>();
    RUBROS_ESF.forEach(r => rubrosMap.set(r.id, { id: r.id, code: r.code, name: r.name, total: 0, accounts: [] }));
    const R = (id: string) => rubrosMap.get(id)!;

    let totalIngresos = 0;
    let totalGastos = 0;

    accSums.forEach(({ debit, credit, account }) => {
      const nat = getNaturaleza(account);

      if (nat === 'INGRESO') { totalIngresos += (credit - debit); return; }
      if (nat === 'GASTO') { totalGastos += (debit - credit); return; }

      // Activos: saldo deudor. Pasivos y Patrimonio: saldo acreedor
      const balance = nat === 'ACTIVO' ? debit - credit : credit - debit;
      if (!showZeroBalances && balance === 0) return;

      const rubro = R(getRubroESF(account));
      rubro.accounts.push({ id: account.id, code: account.code, name: account.name, debit, credit, balance });
      rubro.total += balance;
    });

    const seccion = (s: string) => RUBROS_ESF.filter(r => r.seccion === s).map(r => R(r.id));
    const activosCorrientesRubros = seccion('ACTIVO_CORRIENTE').filter(r => showZeroBalances || r.total !== 0 || r.accounts.length > 0);
    const activosNoCorrientesRubros = seccion('ACTIVO_NO_CORRIENTE').filter(r => showZeroBalances || r.total !== 0 || r.accounts.length > 0);

    const pasivosCorrientesRubros = seccion('PASIVO_CORRIENTE').filter(r => showZeroBalances || r.total !== 0 || r.accounts.length > 0);
    const pasivosNoCorrientesRubros = seccion('PASIVO_NO_CORRIENTE').filter(r => showZeroBalances || r.total !== 0 || r.accounts.length > 0);

    const patrimonioRubros = seccion('PATRIMONIO').filter(r => showZeroBalances || r.total !== 0 || r.accounts.length > 0);

    const totalActivosCorrientes = activosCorrientesRubros.reduce((s, r) => s + r.total, 0);
    const totalActivosNoCorrientes = activosNoCorrientesRubros.reduce((s, r) => s + r.total, 0);
    const totalActivos = totalActivosCorrientes + totalActivosNoCorrientes;

    const totalPasivosCorrientes = pasivosCorrientesRubros.reduce((s, r) => s + r.total, 0);
    const totalPasivosNoCorrientes = pasivosNoCorrientesRubros.reduce((s, r) => s + r.total, 0);
    const totalPasivos = totalPasivosCorrientes + totalPasivosNoCorrientes;

    const totalPatrimonioDirecto = patrimonioRubros.reduce((s, r) => s + r.total, 0);
    const resultadoEjercicio = totalIngresos - totalGastos;
    const totalPatrimonioNeto = totalPatrimonioDirecto + resultadoEjercicio;

    const totalPasivoMasPatrimonio = totalPasivos + totalPatrimonioNeto;
    const diferenciaCuadratura = Math.abs(totalActivos - totalPasivoMasPatrimonio);
    const isBalanced = diferenciaCuadratura < 1;

    return {
      activosCorrientesRubros,
      activosNoCorrientesRubros,
      pasivosCorrientesRubros,
      pasivosNoCorrientesRubros,
      patrimonioRubros,
      totalActivosCorrientes,
      totalActivosNoCorrientes,
      totalActivos,
      totalPasivosCorrientes,
      totalPasivosNoCorrientes,
      totalPasivos,
      totalPatrimonioNeto,
      resultadoEjercicio,
      totalPasivoMasPatrimonio,
      diferenciaCuadratura,
      isBalanced,
      descuadradosCount: descuadradosVouchers.length
    };
  }, [accounts, vouchers, accountMap, periodFilter, dateFrom, dateTo, showZeroBalances]);

  // Export CSV
  const handleExportCSV = () => {
    const rows = [
      ['BALANCE CLASIFICADO IFRS / FECU (ESTADO DE SITUACIÓN FINANCIERA)', `"${company.name}"`, `RUT: ${company.rut}`],
      ['Período:', periodFilter !== 'Todos' ? periodFilter : 'Todo el Ejercicio'],
      ['Principio Contable:', 'Partida Doble: Activo = Pasivo + Patrimonio Neto'],
      [''],
      ['CÓDIGO RUBRO', 'RUBRO / CUENTA PADRE IFRS', 'SALDO ($)'],
      ['1. ACTIVOS', '', totalActivos.toString()],
      ['1.1. ACTIVOS CORRIENTES', '', totalActivosCorrientes.toString()],
      ...activosCorrientesRubros.flatMap(r => [
        [`"${r.code}"`, `"${r.name}"`, r.total.toString()],
        ...r.accounts.map(a => [`  "${a.code}"`, `  "${a.name}"`, a.balance.toString()])
      ]),
      ['1.2. ACTIVOS NO CORRIENTES', '', totalActivosNoCorrientes.toString()],
      ...activosNoCorrientesRubros.flatMap(r => [
        [`"${r.code}"`, `"${r.name}"`, r.total.toString()],
        ...r.accounts.map(a => [`  "${a.code}"`, `  "${a.name}"`, a.balance.toString()])
      ]),
      ['TOTAL ACTIVOS', '', totalActivos.toString()],
      [''],
      ['2. PASIVOS', '', totalPasivos.toString()],
      ['2.1. PASIVOS CORRIENTES', '', totalPasivosCorrientes.toString()],
      ...pasivosCorrientesRubros.flatMap(r => [
        [`"${r.code}"`, `"${r.name}"`, r.total.toString()],
        ...r.accounts.map(a => [`  "${a.code}"`, `  "${a.name}"`, a.balance.toString()])
      ]),
      ['2.2. PASIVOS NO CORRIENTES', '', totalPasivosNoCorrientes.toString()],
      ...pasivosNoCorrientesRubros.flatMap(r => [
        [`"${r.code}"`, `"${r.name}"`, r.total.toString()],
        ...r.accounts.map(a => [`  "${a.code}"`, `  "${a.name}"`, a.balance.toString()])
      ]),
      ['TOTAL PASIVOS', '', totalPasivos.toString()],
      [''],
      ['3. PATRIMONIO NETO', '', totalPatrimonioNeto.toString()],
      ...patrimonioRubros.flatMap(r => [
        [`"${r.code}"`, `"${r.name}"`, r.total.toString()],
        ...r.accounts.map(a => [`  "${a.code}"`, `  "${a.name}"`, a.balance.toString()])
      ]),
      ['3.9. RESULTADO DEL EJERCICIO (GANANCIA/PÉRDIDA)', '', resultadoEjercicio.toString()],
      ['TOTAL PATRIMONIO NETO', '', totalPatrimonioNeto.toString()],
      ['TOTAL PASIVO + PATRIMONIO NETO', '', totalPasivoMasPatrimonio.toString()],
      ['DIFERENCIA CUADRATURA', '', diferenciaCuadratura.toString()]
    ];

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + rows.map(e => e.join(';')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Balance_Clasificado_IFRS_${company.rut}_${periodFilter !== 'Todos' ? periodFilter : 'General'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Renderizador de Rubros Padre con Cuentas Hijas
  const renderRubroBlock = (rubro: IFRSParentRubro, colorTheme: 'indigo' | 'rose' | 'emerald') => {
    const isExpanded = expandedRubros[rubro.id] ?? true;
    const borderCls = colorTheme === 'indigo' ? 'border-indigo-100 hover:border-indigo-200' : colorTheme === 'rose' ? 'border-rose-100 hover:border-rose-200' : 'border-emerald-100 hover:border-emerald-200';
    const bgHeaderCls = colorTheme === 'indigo' ? 'bg-indigo-50/70 text-indigo-950' : colorTheme === 'rose' ? 'bg-rose-50/70 text-rose-950' : 'bg-emerald-50/70 text-emerald-950';
    const tagCls = colorTheme === 'indigo' ? 'bg-indigo-100 text-indigo-800' : colorTheme === 'rose' ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800';

    return (
      <div key={rubro.id} className={`border rounded-lg overflow-hidden transition-all ${borderCls} mb-1 bg-white shadow-2xs`}>
        {/* Cabecera del Rubro Padre */}
        <div 
          onClick={() => toggleRubro(rubro.id)}
          className={`px-3 py-1 flex items-center justify-between cursor-pointer select-none transition-colors ${bgHeaderCls}`}
        >
          <div className="flex items-center gap-2">
            <button className="text-slate-500 hover:text-slate-800 p-0.5">
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${tagCls}`}>
              {rubro.code}
            </span>
            <span className="font-bold text-xs">
              {rubro.name}
            </span>
            <span className="text-[10px] text-slate-500 font-sans font-normal">
              ({rubro.accounts.length} {rubro.accounts.length === 1 ? 'cuenta' : 'cuentas'})
            </span>
          </div>

          <div className="font-mono font-black text-xs">
            ${rubro.total.toLocaleString('es-CL')}
          </div>
        </div>

        {/* Cuentas Hijas Analíticas de 7 Dígitos */}
        {isExpanded && showAccountDetails && rubro.accounts.length > 0 && (
          <div className="divide-y divide-slate-100 bg-slate-50/40 text-[11px] font-mono">
            {rubro.accounts.map(acc => (
              <div key={acc.id} className="px-3 py-0.5 flex justify-between items-center hover:bg-slate-100/80 transition-colors pl-8">
                <div className="flex items-center gap-2 truncate max-w-[320px]">
                  <span className="text-slate-500 font-semibold">{acc.code}</span>
                  <span className="font-sans text-slate-800 truncate">{acc.name}</span>
                </div>
                <div className="font-bold text-slate-900">
                  ${acc.balance.toLocaleString('es-CL')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-2 font-sans">
      {/* Header */}
      <div className="bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-slate-900 tracking-tight uppercase">
                  Balance Clasificado IFRS / FECU
                </h3>
                <span className="text-[10px] bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Acumulativo al Corte
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Estado de Situación Financiera acumulado por Cuentas Padre IFRS
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {onOpenEstadoResultados && (
            <button
              onClick={onOpenEstadoResultados}
              className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs border border-emerald-600 cursor-pointer"
              title="Abrir Estado de Resultados IFRS por Función"
            >
              <TrendingUp className="w-3.5 h-3.5 text-emerald-200" />
              <span>Ver Estado de Resultados</span>
            </button>
          )}
          {onOpenAuditor && (
            <button
              onClick={onOpenAuditor}
              className="px-3 py-1.5 bg-indigo-900 hover:bg-indigo-950 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs border border-indigo-700 cursor-pointer"
              title="Auditar Balance Clasificado IFRS y emitir Dictamen Oficial"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-300" />
              <span>Auditar Estados Financieros</span>
            </button>
          )}
          <button
            onClick={() => setShowAccountDetails(!showAccountDetails)}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
          >
            {showAccountDetails ? <EyeOff className="w-3.5 h-3.5 text-slate-600" /> : <Eye className="w-3.5 h-3.5 text-slate-600" />}
            <span>{showAccountDetails ? 'Ver Sólo Rubros Padre' : 'Mostrar Cuentas Analíticas'}</span>
          </button>
          <button
            onClick={handleExportCSV}
            className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-lg border border-emerald-300 flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
            title="Exportar Balance Clasificado a CSV / Excel"
          >
            <Download className="w-3.5 h-3.5 text-emerald-700" />
            <span>Exportar CSV / Excel</span>
          </button>
          <button
            onClick={() => setShowPrintModal(true)}
            className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-xs font-semibold rounded-lg border border-indigo-300 flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
            title="Imprimir o Descargar PDF Oficial de Balance IFRS"
          >
            <Printer className="w-3.5 h-3.5 text-indigo-700" />
            <span>Imprimir / PDF</span>
          </button>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 shadow-xs flex flex-wrap gap-3 items-center justify-between">
        <div className="flex items-center gap-3 flex-wrap text-xs">
          <div className="flex items-center gap-1.5">
            <label className="font-semibold text-slate-700">Período de Corte:</label>
            <select
              value={periodFilter}
              onChange={(e) => { handlePeriodChange(e.target.value); if (e.target.value !== 'Todos') onCambiarPeriodoGlobal?.(e.target.value); }}
              className="bg-white border border-slate-300 rounded-md px-2.5 py-1 text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="Todos">Todo el Ejercicio (Acumulado)</option>
              {availablePeriods.map(p => (
                <option key={p} value={p}>{p} (Acumulado a {p})</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <label className="font-semibold text-slate-700">Desde:</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => handleDateFromChange(e.target.value)}
              className="bg-white border border-slate-300 rounded-md px-2 py-1 text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <label className="font-semibold text-slate-700">Hasta:</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => handleDateToChange(e.target.value)}
              className="bg-white border border-slate-300 rounded-md px-2 py-1 text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer ml-2">
            <input
              type="checkbox"
              checked={showZeroBalances}
              onChange={(e) => setShowZeroBalances(e.target.checked)}
              className="rounded text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
            />
            <span>Mostrar rubros en $0</span>
          </label>
        </div>

        {/* Ecuación Fundamental del Balance IFRS */}
        <div className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 border ${
          isBalanced ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-rose-50 border-rose-300 text-rose-800'
        }`}>
          <Scale className="w-4 h-4" />
          <span>{isBalanced ? 'Ecuación IFRS Cuadrada: Activo = Pasivo + Patrimonio' : 'Descuadre Patrimonial'}</span>
          {!isBalanced && (
            <span className="font-mono ml-1 bg-rose-200 px-1.5 py-0.5 rounded text-[11px]">Diff: ${diferenciaCuadratura.toLocaleString('es-CL')}</span>
          )}
        </div>
      </div>

      {/* Revisión de clasificación de cuentas */}
      {hallazgos.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl text-xs">
          <button
            type="button"
            onClick={() => setShowRevision(v => !v)}
            className="w-full flex items-center justify-between px-3 py-1.5 font-bold text-amber-900 cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Revisión de clasificación: {hallazgos.length} {hallazgos.length === 1 ? 'cuenta' : 'cuentas'} sin clasificación segura (revísalas en el Plan de Cuentas)
            </span>
            <span className="text-[11px] font-semibold">{showRevision ? 'Ocultar' : 'Ver detalle'}</span>
          </button>
          {showRevision && (
            <div className="px-3.5 pb-3 overflow-x-auto">
              <p className="text-[11px] text-amber-800 mb-2">
                Convención por el código: 1 Activo · 2 Pasivo (23 = Patrimonio) · 3 Ingresos · 4 Gastos. El informe clasifica por el código; estas cuentas tienen un Tipo distinto al del código o un código fuera de la convención.
              </p>
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] uppercase text-amber-900 border-b border-amber-200">
                    <th className="py-1 pr-3">Código</th>
                    <th className="py-1 pr-3">Cuenta</th>
                    <th className="py-1 pr-3">Se clasificó como</th>
                    <th className="py-1">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {hallazgos.slice(0, 200).map(h => (
                    <tr key={h.account.id || h.account.code} className="border-b border-amber-100 align-top">
                      <td className="py-1 pr-3 font-mono">{h.account.code}</td>
                      <td className="py-1 pr-3">{h.account.name}</td>
                      <td className="py-1 pr-3 font-semibold">{h.naturaleza.charAt(0) + h.naturaleza.slice(1).toLowerCase()}</td>
                      <td className="py-1 text-amber-900">{h.detalle}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* KPI Cards de Resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white px-3 py-2 rounded-xl border border-indigo-200 shadow-2xs">
          <div className="flex justify-between items-center text-[11px] font-bold uppercase tracking-wider text-indigo-700">
            <span>1. Total Activos</span>
            <span className="px-1.5 py-0.5 bg-indigo-50 rounded text-indigo-900 font-mono">1000000</span>
          </div>
          <p className="text-lg font-black leading-tight text-indigo-950 mt-1 font-mono">${totalActivos.toLocaleString('es-CL')}</p>
          <div className="flex justify-between text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100 font-mono">
            <span>Corr: ${totalActivosCorrientes.toLocaleString('es-CL')}</span>
            <span>No Corr: ${totalActivosNoCorrientes.toLocaleString('es-CL')}</span>
          </div>
        </div>

        <div className="bg-white px-3 py-2 rounded-xl border border-rose-200 shadow-2xs">
          <div className="flex justify-between items-center text-[11px] font-bold uppercase tracking-wider text-rose-700">
            <span>2. Total Pasivos</span>
            <span className="px-1.5 py-0.5 bg-rose-50 rounded text-rose-900 font-mono">2000000</span>
          </div>
          <p className="text-lg font-black leading-tight text-rose-950 mt-1 font-mono">${totalPasivos.toLocaleString('es-CL')}</p>
          <div className="flex justify-between text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100 font-mono">
            <span>Corr: ${totalPasivosCorrientes.toLocaleString('es-CL')}</span>
            <span>No Corr: ${totalPasivosNoCorrientes.toLocaleString('es-CL')}</span>
          </div>
        </div>

        <div className="bg-white px-3 py-2 rounded-xl border border-emerald-200 shadow-2xs">
          <div className="flex justify-between items-center text-[11px] font-bold uppercase tracking-wider text-emerald-700">
            <span>3. Patrimonio Neto</span>
            <span className="px-1.5 py-0.5 bg-emerald-50 rounded text-emerald-900 font-mono">2300000</span>
          </div>
          <p className="text-lg font-black leading-tight text-emerald-950 mt-1 font-mono">${totalPatrimonioNeto.toLocaleString('es-CL')}</p>
          <div className="flex justify-between text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100 font-mono">
            <span>Res. Ejercicio: ${resultadoEjercicio.toLocaleString('es-CL')}</span>
            <span>Base: ${(totalPatrimonioNeto - resultadoEjercicio).toLocaleString('es-CL')}</span>
          </div>
        </div>
      </div>

      {/* Main 2-Column IFRS Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        {/* COLUMNA 1: ACTIVOS */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col justify-between">
          <div className="divide-y divide-slate-200 text-xs">
            <div className="bg-indigo-900 text-white p-3 font-bold uppercase tracking-wider text-xs flex justify-between items-center">
              <span className="flex items-center gap-1.5">
                <FolderTree className="w-4 h-4 text-indigo-300" />
                <span>1. ESTRUCTURA DE ACTIVOS (IFRS)</span>
              </span>
              <span className="font-mono text-sm font-black">${totalActivos.toLocaleString('es-CL')}</span>
            </div>

            {/* 1.1 Activos Corrientes */}
            <div className="p-2 bg-slate-50/50">
              <div className="flex justify-between items-center font-bold text-slate-900 mb-1 border-b border-indigo-200 pb-1.5">
                <span className="text-indigo-900 uppercase font-black tracking-wide text-xs">1.1. ACTIVOS CORRIENTES (CIRCULANTES)</span>
                <span className="font-mono text-indigo-900 font-bold text-xs">${totalActivosCorrientes.toLocaleString('es-CL')}</span>
              </div>
              
              {activosCorrientesRubros.length > 0 ? (
                <div>
                  {activosCorrientesRubros.map(rubro => renderRubroBlock(rubro, 'indigo'))}
                </div>
              ) : (
                <p className="text-slate-400 italic text-[11px] pl-2 py-2">Sin activos corrientes registrados en el período</p>
              )}
            </div>

            {/* 1.2 Activos No Corrientes */}
            <div className="p-2 bg-slate-50/50">
              <div className="flex justify-between items-center font-bold text-slate-900 mb-1 border-b border-slate-300 pb-1.5">
                <span className="text-slate-800 uppercase font-black tracking-wide text-xs">1.2. ACTIVOS NO CORRIENTES (FIJOS E INTANGIBLES)</span>
                <span className="font-mono text-slate-800 font-bold text-xs">${totalActivosNoCorrientes.toLocaleString('es-CL')}</span>
              </div>
              
              {activosNoCorrientesRubros.length > 0 ? (
                <div>
                  {activosNoCorrientesRubros.map(rubro => renderRubroBlock(rubro, 'indigo'))}
                </div>
              ) : (
                <p className="text-slate-400 italic text-[11px] pl-2 py-2">Sin activos no corrientes registrados en el período</p>
              )}
            </div>
          </div>

          <div className="bg-indigo-950 text-white p-3 font-black text-xs flex justify-between items-center uppercase tracking-wider">
            <span>TOTAL ACTIVOS (1.1 + 1.2)</span>
            <span className="font-mono text-base text-amber-300">${totalActivos.toLocaleString('es-CL')}</span>
          </div>
        </div>

        {/* COLUMNA 2: PASIVOS Y PATRIMONIO NETO */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col justify-between">
          <div className="divide-y divide-slate-200 text-xs">
            <div className="bg-slate-900 text-white p-3 font-bold uppercase tracking-wider text-xs flex justify-between items-center">
              <span className="flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-emerald-300" />
                <span>2. PASIVOS Y PATRIMONIO NETO (IFRS)</span>
              </span>
              <span className="font-mono text-sm font-black">${totalPasivoMasPatrimonio.toLocaleString('es-CL')}</span>
            </div>

            {/* 2.1 Pasivos Corrientes */}
            <div className="p-2 bg-slate-50/50">
              <div className="flex justify-between items-center font-bold text-slate-900 mb-1 border-b border-rose-200 pb-1.5">
                <span className="text-rose-900 uppercase font-black tracking-wide text-xs">2.1. PASIVOS CORRIENTES (CORTO PLAZO)</span>
                <span className="font-mono text-rose-900 font-bold text-xs">${totalPasivosCorrientes.toLocaleString('es-CL')}</span>
              </div>
              
              {pasivosCorrientesRubros.length > 0 ? (
                <div>
                  {pasivosCorrientesRubros.map(rubro => renderRubroBlock(rubro, 'rose'))}
                </div>
              ) : (
                <p className="text-slate-400 italic text-[11px] pl-2 py-2">Sin pasivos corrientes registrados en el período</p>
              )}
            </div>

            {/* 2.2 Pasivos No Corrientes */}
            <div className="p-2 bg-slate-50/50">
              <div className="flex justify-between items-center font-bold text-slate-900 mb-1 border-b border-slate-300 pb-1.5">
                <span className="text-slate-800 uppercase font-black tracking-wide text-xs">2.2. PASIVOS NO CORRIENTES (LARGO PLAZO)</span>
                <span className="font-mono text-slate-800 font-bold text-xs">${totalPasivosNoCorrientes.toLocaleString('es-CL')}</span>
              </div>
              
              {pasivosNoCorrientesRubros.length > 0 ? (
                <div>
                  {pasivosNoCorrientesRubros.map(rubro => renderRubroBlock(rubro, 'rose'))}
                </div>
              ) : (
                <p className="text-slate-400 italic text-[11px] pl-2 py-2">Sin pasivos no corrientes registrados en el período</p>
              )}
            </div>

            {/* 3. Patrimonio Neto */}
            <div className="p-3 bg-emerald-50/30">
              <div className="flex justify-between items-center font-bold text-slate-900 mb-1 border-b border-emerald-300 pb-1.5">
                <span className="text-emerald-950 uppercase font-black tracking-wide text-xs">3. PATRIMONIO NETO</span>
                <span className="font-mono text-emerald-950 font-bold text-xs">${totalPatrimonioNeto.toLocaleString('es-CL')}</span>
              </div>
              
              {patrimonioRubros.length > 0 && (
                <div>
                  {patrimonioRubros.map(rubro => renderRubroBlock(rubro, 'emerald'))}
                </div>
              )}

              {/* Resultado del Ejercicio */}
              <div className="border border-emerald-200 bg-white rounded-lg p-2.5 flex justify-between items-center mt-2 shadow-2xs">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold">2304000</span>
                  <span className="font-bold text-xs text-slate-900">Resultado del Ejercicio (Utilidad / Pérdida)</span>
                </div>
                <span className={`font-mono font-black text-xs ${resultadoEjercicio >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  ${resultadoEjercicio.toLocaleString('es-CL')}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-slate-950 text-white p-3 font-black text-xs flex justify-between items-center uppercase tracking-wider">
            <span>TOTAL PASIVO + PATRIMONIO (2 + 3)</span>
            <span className="font-mono text-base text-amber-300">${totalPasivoMasPatrimonio.toLocaleString('es-CL')}</span>
          </div>
        </div>
      </div>

      {/* Modal de Impresión y Descarga de PDF Balance Clasificado IFRS */}
      <BalanceIFRSPrintModal
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        company={company}
        activosCorrientes={activosCorrientesRubros}
        activosNoCorrientes={activosNoCorrientesRubros}
        totalActivosCorrientes={totalActivosCorrientes}
        totalActivosNoCorrientes={totalActivosNoCorrientes}
        totalActivos={totalActivos}
        pasivosCorrientes={pasivosCorrientesRubros}
        pasivosNoCorrientes={pasivosNoCorrientesRubros}
        totalPasivosCorrientes={totalPasivosCorrientes}
        totalPasivosNoCorrientes={totalPasivosNoCorrientes}
        totalPasivos={totalPasivos}
        patrimonioRubros={patrimonioRubros}
        resultadoEjercicio={resultadoEjercicio}
        totalPatrimonioNeto={totalPatrimonioNeto}
        totalPasivoMasPatrimonio={totalPasivoMasPatrimonio}
        periodFilter={periodFilter}
        dateFrom={dateFrom}
        dateTo={dateTo}
        isBalanced={isBalanced}
      />
    </div>
  );
}
