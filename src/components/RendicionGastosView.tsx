import React, { useState, useMemo, useEffect } from 'react';
import {
  FileText,
  Plus,
  Download,
  Trash2,
  Edit3,
  CheckCircle2,
  AlertCircle,
  Search,
  Filter,
  DollarSign,
  Calendar,
  Building2,
  Users,
  CreditCard,
  Layers,
  Sparkles,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Clock,
  X,
  FileSpreadsheet,
  Receipt
} from 'lucide-react';
import {
  Company,
  ChartOfAccount,
  Voucher,
  VoucherLine,
  Employee,
  ExpenseReport,
  ExpenseReportItem,
  MasterAccountingParameters,
  CostCenterMaster
} from '../types';
import { db } from '../lib/firebase';
import {
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  updateDoc
} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { StandardModuleHeader } from './StandardModuleHeader';
import { SearchableAccountSelect } from './SearchableAccountSelect';

interface RendicionGastosViewProps {
  studyId: string;
  company: Company;
  accounts: ChartOfAccount[];
  employees?: Employee[];
  costCenters?: CostCenterMaster[];
  vouchers?: Voucher[];
  masterParams?: MasterAccountingParameters | null;
  selectedPeriod?: string; // YYYY-MM
  onCentralizeVoucher?: (voucher: Omit<Voucher, 'id' | 'createdAt'>) => Promise<string>;
  onNavigateToLibroDiario?: (voucherId?: string) => void;
  onNavigateToVoucher?: (voucherId: string) => void;
  isReadOnly?: boolean;
}

const CATEGORY_NAMES: Record<string, string> = {
  ALIMENTACION: 'Alimentación / Viáticos',
  COMBUSTIBLE: 'Combustible',
  PEAJES: 'Peajes / Estacionamiento',
  ALOJAMIENTO: 'Alojamiento / Hotel',
  TRANSPORTE: 'Transporte / Pasajes',
  MATERIALES: 'Materiales Menores',
  GASTOS_MENORES: 'Gastos Menores / Varios'
};

export const RendicionGastosView: React.FC<RendicionGastosViewProps> = ({
  studyId,
  company,
  accounts,
  employees = [],
  costCenters = [],
  vouchers = [],
  masterParams,
  selectedPeriod: initialPeriod,
  onCentralizeVoucher,
  onNavigateToLibroDiario,
  onNavigateToVoucher,
  isReadOnly = false
}) => {
  const [reports, setReports] = useState<ExpenseReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'BORRADOR' | 'ENVIADA' | 'APROBADA' | 'CENTRALIZADA'>('ALL');
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);

  // Período
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

  // Modal Crear / Editar Rendición
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingReport, setEditingReport] = useState<Partial<ExpenseReport> | null>(null);
  const [modalItems, setModalItems] = useState<ExpenseReportItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isCentralizing, setIsCentralizing] = useState(false);

  // Cargar rendiciones desde Firestore
  const fetchReports = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(
        collection(db, 'studies', studyId, 'companies', company.id, 'expenseReports')
      );
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as ExpenseReport));
      setReports(list);
    } catch (err) {
      console.error('Error fetching expense reports:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [studyId, company.id]);

  // Rendiciones del período actual
  const currentPeriodReports = useMemo(() => {
    return reports.filter(r => r.period === periodStr);
  }, [reports, periodStr]);

  // Métricas del período
  const stats = useMemo(() => {
    const totalCount = currentPeriodReports.length;
    const totalAdvances = currentPeriodReports.reduce((s, r) => s + (r.initialAdvanceAmount || 0), 0);
    const totalExpenses = currentPeriodReports.reduce((s, r) => s + (r.totalExpensesAmount || 0), 0);
    const totalBalance = currentPeriodReports.reduce((s, r) => s + (r.balanceAmount || 0), 0);
    const centralizedCount = currentPeriodReports.filter(r => r.status === 'CENTRALIZADA').length;
    const approvedPendingCount = currentPeriodReports.filter(r => r.status === 'APROBADA').length;

    return {
      totalCount,
      totalAdvances,
      totalExpenses,
      totalBalance,
      centralizedCount,
      approvedPendingCount
    };
  }, [currentPeriodReports]);

  // Rendiciones filtradas por búsqueda y estado
  const filteredReports = useMemo(() => {
    return currentPeriodReports.filter(r => {
      const matchStatus = statusFilter === 'ALL' || r.status === statusFilter;
      const matchSearch =
        r.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.folio.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.responsibleName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.responsibleRut.toLowerCase().includes(searchTerm.toLowerCase());
      return matchStatus && matchSearch;
    });
  }, [currentPeriodReports, statusFilter, searchTerm]);

  // Modal: Abrir para nueva rendición
  const handleOpenCreateModal = () => {
    const nextNum = reports.length + 1;
    setEditingReport({
      folio: `RDG-${String(nextNum).padStart(3, '0')}`,
      period: periodStr,
      date: new Date().toISOString().split('T')[0],
      title: '',
      responsibleRut: '',
      responsibleName: '',
      initialAdvanceAmount: 0,
      status: 'BORRADOR',
      notes: ''
    });
    setModalItems([]);
    setIsModalOpen(true);
  };

  // Modal: Abrir para editar rendición
  const handleOpenEditModal = (rep: ExpenseReport) => {
    if (rep.status === 'CENTRALIZADA') {
      alert('Esta rendición ya fue centralizada contablemente en el Libro Diario y no puede ser modificada.');
      return;
    }
    setEditingReport({ ...rep });
    setModalItems([...(rep.items || [])]);
    setIsModalOpen(true);
  };

  // Modal: Agregar ítem de gasto
  const handleAddItem = () => {
    const defaultAcc = accounts.find(a => a.code.startsWith('4201') || a.name.toLowerCase().includes('gasto menor')) || accounts[0];
    const newItem: ExpenseReportItem = {
      id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      date: editingReport?.date || new Date().toISOString().split('T')[0],
      documentType: 'BOLETA',
      documentNumber: '',
      supplierName: '',
      category: 'GASTOS_MENORES',
      description: '',
      amount: 0,
      expenseAccountId: defaultAcc?.id,
      expenseAccountCode: defaultAcc?.code,
      expenseAccountName: defaultAcc?.name
    };
    setModalItems(prev => [...prev, newItem]);
  };

  // Modal: Eliminar ítem
  const handleRemoveItem = (id: string) => {
    setModalItems(prev => prev.filter(i => i.id !== id));
  };

  // Modal: Actualizar ítem
  const handleUpdateItem = (id: string, field: keyof ExpenseReportItem, val: any) => {
    setModalItems(prev =>
      prev.map(item => {
        if (item.id === id) {
          const updated = { ...item, [field]: val };
          if (field === 'expenseAccountId') {
            const acc = accounts.find(a => a.id === val);
            if (acc) {
              updated.expenseAccountCode = acc.code;
              updated.expenseAccountName = acc.name;
            }
          }
          return updated;
        }
        return item;
      })
    );
  };

  // Modal: Guardar rendición
  const handleSaveReport = async () => {
    if (!editingReport?.title || !editingReport.responsibleName) {
      alert('Por favor ingrese el título / motivo de la rendición y el nombre del responsable.');
      return;
    }

    if (modalItems.length === 0) {
      alert('Debe agregar al menos un ítem de gasto en la rendición.');
      return;
    }

    const totalExp = modalItems.reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const advance = Number(editingReport.initialAdvanceAmount) || 0;
    const balance = advance - totalExp;

    const repId = editingReport.id || `rdg_${Date.now()}`;
    const reportData: ExpenseReport = {
      id: repId,
      folio: editingReport.folio || `RDG-${Date.now()}`,
      period: editingReport.period || periodStr,
      date: editingReport.date || new Date().toISOString().split('T')[0],
      title: editingReport.title.trim(),
      responsibleRut: editingReport.responsibleRut?.trim() || '',
      responsibleName: editingReport.responsibleName.trim(),
      employeeId: editingReport.employeeId,
      status: editingReport.status || 'BORRADOR',
      initialAdvanceAmount: advance,
      totalExpensesAmount: totalExp,
      balanceAmount: balance,
      items: modalItems,
      notes: editingReport.notes || '',
      createdAt: editingReport.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    setIsSaving(true);
    try {
      await setDoc(
        doc(db, 'studies', studyId, 'companies', company.id, 'expenseReports', repId),
        reportData
      );
      setIsModalOpen(false);
      setEditingReport(null);
      await fetchReports();
    } catch (err: any) {
      alert('Error al guardar rendición: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Cambiar estado a Aprobada
  const handleApproveReport = async (rep: ExpenseReport) => {
    if (rep.status === 'CENTRALIZADA') return;
    try {
      await updateDoc(
        doc(db, 'studies', studyId, 'companies', company.id, 'expenseReports', rep.id),
        { status: 'APROBADA', updatedAt: new Date().toISOString() }
      );
      await fetchReports();
    } catch (err: any) {
      alert('Error al aprobar rendición: ' + err.message);
    }
  };

  // Centralizar Asiento Contable en Libro Diario
  const handleCentralizeReport = async (rep: ExpenseReport) => {
    if (rep.status === 'CENTRALIZADA') {
      alert('Esta rendición ya se encuentra centralizada.');
      return;
    }

    if (!onCentralizeVoucher) {
      alert('La función de centralización contable no está disponible.');
      return;
    }

    const confirmMsg =
      `¿Desea generar el comprobante contable de Centralización para la rendición ${rep.folio}?\n\n` +
      `• Responsable: ${rep.responsibleName}\n` +
      `• Total Gastos a Contabilizar: $${rep.totalExpensesAmount.toLocaleString('es-CL')}\n` +
      `• Anticipo Inicial: $${rep.initialAdvanceAmount.toLocaleString('es-CL')}\n` +
      `• Saldo: $${rep.balanceAmount.toLocaleString('es-CL')} (${rep.balanceAmount >= 0 ? 'Devolución de colaborador' : 'Reembolso de empresa'})\n\n` +
      `Se creará un Comprobante de Traspaso en el Libro Diario imputando los gastos por ítem.`;

    if (!confirm(confirmMsg)) return;

    try {
      setIsCentralizing(true);

      // Cuentas de Pasivo / Anticipo
      const accFondoPorRendir = accounts.find(
        a =>
          a.id === masterParams?.fondosPorRendirAccountId ||
          a.code.replace(/\./g, '').startsWith('1105') ||
          a.name.toLowerCase().includes('fondo por rendir') ||
          a.name.toLowerCase().includes('anticipo')
      ) || { id: 'acc_1105001', code: '1105001', name: 'ANTICIPOS Y FONDOS POR RENDIR' };

      const accReembolsoPorPagar = accounts.find(
        a =>
          a.code.replace(/\./g, '').startsWith('2103') ||
          a.name.toLowerCase().includes('sueldos por pagar') ||
          a.name.toLowerCase().includes('personal')
      ) || { id: 'acc_2103001', code: '2103001', name: 'REMUNERACIONES Y COLABORADORES POR PAGAR' };

      const lines: VoucherLine[] = [];
      let lineIdx = 1;

      // 1. DÉBITOS: Agrupar gastos por cuenta contable
      const groupedExpenses: Record<string, { accountId: string; code: string; name: string; amount: number }> = {};
      rep.items.forEach(item => {
        const acc = accounts.find(a => a.id === item.expenseAccountId) || {
          id: 'acc_4201001',
          code: '4201001',
          name: 'GASTOS GENERALES Y MENORES'
        };
        const key = acc.id;
        if (!groupedExpenses[key]) {
          groupedExpenses[key] = { accountId: acc.id, code: acc.code, name: acc.name, amount: 0 };
        }
        groupedExpenses[key].amount += Number(item.amount) || 0;
      });

      Object.values(groupedExpenses).forEach(g => {
        lines.push({
          id: `l_${lineIdx++}`,
          accountId: g.accountId,
          accountCode: g.code,
          accountName: g.name,
          debit: g.amount,
          credit: 0,
          gloss: `Rendición ${rep.folio} - ${rep.title.slice(0, 30)}`,
          auxiliaryRut: rep.responsibleRut,
          auxiliaryName: rep.responsibleName
        });
      });

      // 2. CRÉDITOS: Abono a Fondo por Rendir y/o Pasivo Reembolso
      if (rep.initialAdvanceAmount > 0) {
        const abonoFondo = Math.min(rep.initialAdvanceAmount, rep.totalExpensesAmount);
        lines.push({
          id: `l_${lineIdx++}`,
          accountId: accFondoPorRendir.id,
          accountCode: accFondoPorRendir.code,
          accountName: accFondoPorRendir.name,
          debit: 0,
          credit: abonoFondo,
          gloss: `Rebaja fondo por rendir ${rep.folio} (${rep.responsibleName})`,
          auxiliaryRut: rep.responsibleRut,
          auxiliaryName: rep.responsibleName
        });

        // Si el gasto superó el anticipo, el remanente es una cuenta por pagar al colaborador
        if (rep.totalExpensesAmount > rep.initialAdvanceAmount) {
          const remanenteReembolso = rep.totalExpensesAmount - rep.initialAdvanceAmount;
          lines.push({
            id: `l_${lineIdx++}`,
            accountId: accReembolsoPorPagar.id,
            accountCode: accReembolsoPorPagar.code,
            accountName: accReembolsoPorPagar.name,
            debit: 0,
            credit: remanenteReembolso,
            gloss: `Reembolso por pagar a ${rep.responsibleName} (${rep.folio})`,
            auxiliaryRut: rep.responsibleRut,
            auxiliaryName: rep.responsibleName
          });
        }
      } else {
        // Sin anticipo previo: Todo el gasto se adeuda como reembolso al colaborador
        lines.push({
          id: `l_${lineIdx++}`,
          accountId: accReembolsoPorPagar.id,
          accountCode: accReembolsoPorPagar.code,
          accountName: accReembolsoPorPagar.name,
          debit: 0,
          credit: rep.totalExpensesAmount,
          gloss: `Reembolso gastos por pagar a ${rep.responsibleName} (${rep.folio})`,
          auxiliaryRut: rep.responsibleRut,
          auxiliaryName: rep.responsibleName
        });
      }

      const totalDebit = lines.reduce((s, l) => s + (l.debit || 0), 0);
      const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0);

      const voucherPayload: Omit<Voucher, 'id' | 'createdAt'> = {
        voucherNumber: 700 + Math.floor(Math.random() * 90),
        date: rep.date,
        period: rep.period,
        type: 'Traspaso',
        gloss: `CENTRALIZACION RENDICION DE GASTOS ${rep.folio}: ${rep.title} (${rep.responsibleName})`,
        lines,
        totalDebit,
        totalCredit,
        origin: 'RENDICION_GASTOS' as any,
        status: 'Valido'
      };

      const newVoucherId = await onCentralizeVoucher(voucherPayload);

      // Actualizar estado de la rendición en Firestore
      await updateDoc(
        doc(db, 'studies', studyId, 'companies', company.id, 'expenseReports', rep.id),
        {
          status: 'CENTRALIZADA',
          voucherId: newVoucherId,
          voucherNumber: voucherPayload.voucherNumber,
          centralizedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      );

      await fetchReports();
      alert(`🎉 Rendición ${rep.folio} centralizada con éxito en el Comprobante Folio #${voucherPayload.voucherNumber}!`);
    } catch (err: any) {
      alert('Error al centralizar rendición: ' + err.message);
    } finally {
      setIsCentralizing(false);
    }
  };

  // Exportar a Excel
  const handleExportExcel = () => {
    if (filteredReports.length === 0) {
      alert('No hay rendiciones para exportar en el período.');
      return;
    }

    const flatRows: any[] = [];
    filteredReports.forEach(rep => {
      if (rep.items && rep.items.length > 0) {
        rep.items.forEach(it => {
          flatRows.push({
            Folio_Rendicion: rep.folio,
            Fecha_Rendicion: rep.date,
            Periodo: rep.period,
            Titulo: rep.title,
            Responsable_RUT: rep.responsibleRut,
            Responsable_Nombre: rep.responsibleName,
            Estado: rep.status,
            Anticipo_Total: rep.initialAdvanceAmount,
            Gasto_Total_Rendicion: rep.totalExpensesAmount,
            Saldo_Rendicion: rep.balanceAmount,
            Fecha_Gasto: it.date,
            Tipo_Doc: it.documentType,
            N_Doc: it.documentNumber,
            Proveedor: it.supplierName,
            Categoria: CATEGORY_NAMES[it.category] || it.category,
            Descripcion_Gasto: it.description,
            Monto_Gasto: it.amount,
            Cuenta_Contable: `${it.expenseAccountCode || ''} ${it.expenseAccountName || ''}`,
            Centro_Costo: it.costCenter || ''
          });
        });
      } else {
        flatRows.push({
          Folio_Rendicion: rep.folio,
          Fecha_Rendicion: rep.date,
          Periodo: rep.period,
          Titulo: rep.title,
          Responsable_RUT: rep.responsibleRut,
          Responsable_Nombre: rep.responsibleName,
          Estado: rep.status,
          Anticipo_Total: rep.initialAdvanceAmount,
          Gasto_Total_Rendicion: rep.totalExpensesAmount,
          Saldo_Rendicion: rep.balanceAmount,
          Fecha_Gasto: '',
          Tipo_Doc: '',
          N_Doc: '',
          Proveedor: '',
          Categoria: '',
          Descripcion_Gasto: '',
          Monto_Gasto: 0,
          Cuenta_Contable: '',
          Centro_Costo: ''
        });
      }
    });

    const ws = XLSX.utils.json_to_sheet(flatRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rendiciones_Gastos');
    XLSX.writeFile(wb, `Rendiciones_Gastos_${company.name.replace(/\s+/g, '_')}_${periodStr}.xlsx`);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* HEADER ESTANDARIZADO DE MÓDULO */}
      <StandardModuleHeader
        title="Módulo de Rendición de Gastos & Viáticos"
        subtitle="Control de anticipos, fondos por rendir, viáticos de colaboradores y boletas de compras menores con centralización contable al Libro Diario."
        icon={Receipt}
        iconBgColor="bg-emerald-600"
        layerBadge={{ layer: 1, label: 'Capa 1: Módulo Operativo' }}
        period={{
          selectedPeriod: periodStr,
          onPrevPeriod: handlePrevPeriod,
          onNextPeriod: handleNextPeriod
        }}
        centralizationStatus={{
          isCentralized: stats.totalCount > 0 && stats.centralizedCount === stats.totalCount,
          voucherNumber: stats.centralizedCount > 0 ? `${stats.centralizedCount} rend.` : undefined,
          onQuickCentralize: () => {
            const pendingApp = currentPeriodReports.find(r => r.status === 'APROBADA');
            if (pendingApp) handleCentralizeReport(pendingApp);
            else alert('No hay rendiciones en estado "Aprobada" pendientes de centralizar.');
          },
          isCentralizing,
          disabled: stats.approvedPendingCount === 0,
          disabledTooltip: stats.approvedPendingCount === 0 ? 'No hay rendiciones aprobadas para centralizar' : undefined
        }}
        kpis={[
          {
            label: 'Rendiciones del Período',
            value: stats.totalCount,
            subtext: `${stats.centralizedCount} centralizadas / ${stats.approvedPendingCount} pendientes`,
            icon: FileText,
            variant: 'info'
          },
          {
            label: 'Anticipos Entregados',
            value: `$${stats.totalAdvances.toLocaleString('es-CL')}`,
            subtext: 'Fondos otorgados a rendir',
            icon: CreditCard,
            variant: 'default'
          },
          {
            label: 'Total Gastos Rendidos',
            value: `$${stats.totalExpenses.toLocaleString('es-CL')}`,
            subtext: 'Gasto acreditado con boletas',
            icon: DollarSign,
            variant: 'purple'
          },
          {
            label: 'Saldo por Reintegrar/Reembolsar',
            value: `$${Math.abs(stats.totalBalance).toLocaleString('es-CL')}`,
            subtext: stats.totalBalance >= 0 ? 'Saldo a favor de la empresa' : 'Reembolso pendiente a colaborador',
            icon: Sparkles,
            variant: stats.totalBalance >= 0 ? 'success' : 'warning'
          }
        ]}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 px-3 py-1.5 rounded-xl text-xs font-semibold shadow-2xs transition-all cursor-pointer"
              title="Exportar a Excel"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Excel</span>
            </button>

            {!isReadOnly && (
              <button
                onClick={handleOpenCreateModal}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold shadow-2xs transition-all active:scale-95 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nueva Rendición</span>
              </button>
            )}

            <button
              onClick={fetchReports}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors cursor-pointer"
              title="Actualizar datos"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        }
      />

      {/* FILTROS Y BÚSQUEDA */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por folio, responsable o motivo..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-slate-600">Estado:</label>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-semibold text-slate-800"
          >
            <option value="ALL">Todos los Estados</option>
            <option value="BORRADOR">Borrador</option>
            <option value="ENVIADA">Enviada</option>
            <option value="APROBADA">Aprobada</option>
            <option value="CENTRALIZADA">Centralizada</option>
          </select>
        </div>
      </div>

      {/* LISTADO DE RENDICIONES */}
      <div className="space-y-3">
        {loading ? (
          <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-500 text-xs">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-600 mb-2" />
            Cargando rendiciones de gastos...
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="bg-white p-12 rounded-xl border border-slate-200 text-center space-y-3">
            <Receipt className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="text-sm font-bold text-slate-700">No hay rendiciones registradas en el período {periodStr}</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Presione el botón "Nueva Rendición" para ingresar los comprobantes de gastos menores o viáticos de un colaborador.
            </p>
          </div>
        ) : (
          filteredReports.map(rep => {
            const isExpanded = expandedReportId === rep.id;
            const statusBadges: Record<string, { bg: string; text: string; label: string }> = {
              BORRADOR: { bg: 'bg-slate-100 border-slate-300', text: 'text-slate-700', label: 'Borrador' },
              ENVIADA: { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700', label: 'Enviada' },
              APROBADA: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-800', label: 'Aprobada' },
              CENTRALIZADA: { bg: 'bg-emerald-50 border-emerald-300', text: 'text-emerald-800', label: 'Centralizada' }
            };
            const badge = statusBadges[rep.status] || statusBadges.BORRADOR;

            return (
              <div
                key={rep.id}
                className="bg-white rounded-xl border border-slate-200 shadow-2xs hover:border-slate-300 transition-all overflow-hidden"
              >
                {/* Cabecera de la rendición */}
                <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50/40">
                  <div className="flex items-start sm:items-center gap-3">
                    <button
                      onClick={() => setExpandedReportId(isExpanded ? null : rep.id)}
                      className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-indigo-900 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                          {rep.folio}
                        </span>
                        <h3 className="font-bold text-sm text-slate-900 line-clamp-1">{rep.title}</h3>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge.bg} ${badge.text}`}>
                          {badge.label}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Responsable: <strong className="text-slate-700">{rep.responsibleName}</strong> ({rep.responsibleRut || 'Sin RUT'}) • Fecha: {rep.date} • {rep.items?.length || 0} ítems de gasto
                      </p>
                    </div>
                  </div>

                  {/* Resumen financiero & Acciones */}
                  <div className="flex flex-wrap items-center gap-3 self-end md:self-center">
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block font-semibold uppercase">Total Gastado</span>
                      <span className="font-mono font-bold text-sm text-slate-900">
                        ${rep.totalExpensesAmount.toLocaleString('es-CL')}
                      </span>
                    </div>

                    <div className="text-right pl-3 border-l border-slate-200">
                      <span className="text-[10px] text-slate-400 block font-semibold uppercase">Saldo</span>
                      <span className={`font-mono font-bold text-xs ${rep.balanceAmount >= 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                        ${Math.abs(rep.balanceAmount).toLocaleString('es-CL')} {rep.balanceAmount >= 0 ? '(Devolver)' : '(Reembolso)'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 pl-3 border-l border-slate-200">
                      {rep.status === 'BORRADOR' && !isReadOnly && (
                        <button
                          onClick={() => handleApproveReport(rep)}
                          className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                        >
                          Aprobar
                        </button>
                      )}

                      {rep.status === 'APROBADA' && !isReadOnly && (
                        <button
                          onClick={() => handleCentralizeReport(rep)}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Centralizar Asiento</span>
                        </button>
                      )}

                      {rep.status === 'CENTRALIZADA' && rep.voucherId && (
                        <button
                          onClick={() => {
                            if (onNavigateToVoucher) onNavigateToVoucher(rep.voucherId!);
                            else if (onNavigateToLibroDiario) onNavigateToLibroDiario(rep.voucherId);
                          }}
                          className="px-2.5 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border border-emerald-300 text-xs font-bold rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                          title="Ver comprobante en el Libro Diario"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Folio #{rep.voucherNumber || 'Ver'}</span>
                        </button>
                      )}

                      {rep.status !== 'CENTRALIZADA' && !isReadOnly && (
                        <button
                          onClick={() => handleOpenEditModal(rep)}
                          className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                          title="Editar rendición"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Desglose de ítems (Colapsable) */}
                {isExpanded && (
                  <div className="p-4 border-t border-slate-200 bg-white">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      Detalle de Comprobantes y Boletas Rendidas
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                            <th className="p-2">Fecha</th>
                            <th className="p-2">Tipo Doc.</th>
                            <th className="p-2">N° Doc.</th>
                            <th className="p-2">Proveedor / Establecimiento</th>
                            <th className="p-2">Categoría</th>
                            <th className="p-2">Descripción</th>
                            <th className="p-2">Cuenta Contable</th>
                            <th className="p-2 text-right">Monto ($)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {rep.items && rep.items.length > 0 ? (
                            rep.items.map((it, idx) => (
                              <tr key={it.id || idx} className="hover:bg-slate-50/80">
                                <td className="p-2 font-mono">{it.date}</td>
                                <td className="p-2">
                                  <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] font-semibold text-slate-700">
                                    {it.documentType}
                                  </span>
                                </td>
                                <td className="p-2 font-mono font-semibold">{it.documentNumber || '-'}</td>
                                <td className="p-2 font-medium text-slate-900">{it.supplierName || 'Comercio menor'}</td>
                                <td className="p-2 text-slate-600">{CATEGORY_NAMES[it.category] || it.category}</td>
                                <td className="p-2 text-slate-500">{it.description || '-'}</td>
                                <td className="p-2 font-mono text-[11px] text-slate-700">
                                  {it.expenseAccountCode} - {it.expenseAccountName}
                                </td>
                                <td className="p-2 font-mono font-bold text-right text-slate-900">
                                  ${it.amount.toLocaleString('es-CL')}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={8} className="p-3 text-center text-slate-400">
                                Sin ítems de gasto registrados
                              </td>
                            </tr>
                          )}
                        </tbody>
                        <tfoot>
                          <tr className="bg-slate-50 font-bold border-t border-slate-200">
                            <td colSpan={7} className="p-2 text-right text-slate-700">Total Rendición:</td>
                            <td className="p-2 font-mono text-right text-emerald-800">
                              ${rep.totalExpensesAmount.toLocaleString('es-CL')}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* MODAL CREAR / EDITAR RENDICIÓN */}
      {isModalOpen && editingReport && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden my-8 max-h-[90vh] flex flex-col">
            {/* Cabecera del modal */}
            <div className="p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2.5">
                <Receipt className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-base">
                  {editingReport.id ? `Editar Rendición ${editingReport.folio}` : 'Nueva Rendición de Gastos & Viáticos'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Cuerpo del modal (Scrollable) */}
            <div className="p-6 space-y-6 overflow-y-auto flex-1 text-xs">
              {/* Datos generales */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Folio Interno:</label>
                  <input
                    type="text"
                    value={editingReport.folio || ''}
                    onChange={e => setEditingReport({ ...editingReport, folio: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Fecha de Rendición:</label>
                  <input
                    type="date"
                    value={editingReport.date || ''}
                    onChange={e => setEditingReport({ ...editingReport, date: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Período Contable:</label>
                  <input
                    type="month"
                    value={editingReport.period || periodStr}
                    onChange={e => setEditingReport({ ...editingReport, period: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 font-mono"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">Título / Motivo del Gasto:</label>
                  <input
                    type="text"
                    placeholder="Ej: Visita clientes Rancagua - Viáticos y Combustible"
                    value={editingReport.title || ''}
                    onChange={e => setEditingReport({ ...editingReport, title: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Anticipo Entregado ($):</label>
                  <input
                    type="number"
                    value={editingReport.initialAdvanceAmount || 0}
                    onChange={e => setEditingReport({ ...editingReport, initialAdvanceAmount: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 font-mono font-bold text-slate-900"
                  />
                </div>

                {/* Selección de colaborador */}
                <div className="md:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">Colaborador Responsable:</label>
                  {employees.length > 0 ? (
                    <select
                      value={editingReport.employeeId || ''}
                      onChange={e => {
                        const emp = employees.find(x => x.id === e.target.value);
                        if (emp) {
                          setEditingReport({
                            ...editingReport,
                            employeeId: emp.id,
                            responsibleName: emp.name,
                            responsibleRut: emp.rut
                          });
                        }
                      }}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5"
                    >
                      <option value="">-- Seleccionar Trabajador de Nómina --</option>
                      {employees.map(emp => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name} ({emp.rut})
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <input
                      type="text"
                      placeholder="Nombre Responsable"
                      value={editingReport.responsibleName || ''}
                      onChange={e => setEditingReport({ ...editingReport, responsibleName: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5"
                    />
                    <input
                      type="text"
                      placeholder="RUT Responsable"
                      value={editingReport.responsibleRut || ''}
                      onChange={e => setEditingReport({ ...editingReport, responsibleRut: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Observaciones:</label>
                  <textarea
                    rows={2}
                    value={editingReport.notes || ''}
                    onChange={e => setEditingReport({ ...editingReport, notes: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5"
                    placeholder="Notas o justificación del gasto..."
                  />
                </div>
              </div>

              {/* Sección de Ítems / Boletas */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="font-bold text-slate-900 text-sm">Comprobantes y Boletas de Gasto</h4>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Agregar Comprobante</span>
                  </button>
                </div>

                {modalItems.length === 0 ? (
                  <div className="p-6 border-2 border-dashed border-slate-200 rounded-xl text-center text-slate-400">
                    Haga clic en "Agregar Comprobante" para ingresar boletas, facturas o peajes rendidos.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {modalItems.map((item, index) => (
                      <div
                        key={item.id}
                        className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end"
                      >
                        <div className="md:col-span-2">
                          <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Fecha:</label>
                          <input
                            type="date"
                            value={item.date}
                            onChange={e => handleUpdateItem(item.id, 'date', e.target.value)}
                            className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs"
                          />
                        </div>

                        <div className="md:col-span-2">
                          <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Tipo Doc:</label>
                          <select
                            value={item.documentType}
                            onChange={e => handleUpdateItem(item.id, 'documentType', e.target.value)}
                            className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs"
                          >
                            <option value="BOLETA">Boleta</option>
                            <option value="FACTURA">Factura Menor</option>
                            <option value="PEAJE">Peaje</option>
                            <option value="TICKET">Ticket Transporte</option>
                            <option value="VALE">Vale de Caja</option>
                            <option value="OTRO">Otro Comprobante</option>
                          </select>
                        </div>

                        <div className="md:col-span-2">
                          <label className="block text-[10px] font-bold text-slate-500 mb-0.5">N° Doc / Folio:</label>
                          <input
                            type="text"
                            placeholder="Ej: 14205"
                            value={item.documentNumber}
                            onChange={e => handleUpdateItem(item.id, 'documentNumber', e.target.value)}
                            className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-mono"
                          />
                        </div>

                        <div className="md:col-span-3">
                          <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Proveedor / Comercio:</label>
                          <input
                            type="text"
                            placeholder="Ej: Copec / Shell / Restaurant"
                            value={item.supplierName}
                            onChange={e => handleUpdateItem(item.id, 'supplierName', e.target.value)}
                            className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs"
                          />
                        </div>

                        <div className="md:col-span-2">
                          <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Categoría:</label>
                          <select
                            value={item.category}
                            onChange={e => handleUpdateItem(item.id, 'category', e.target.value)}
                            className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs"
                          >
                            <option value="ALIMENTACION">Alimentación</option>
                            <option value="COMBUSTIBLE">Combustible</option>
                            <option value="PEAJES">Peajes</option>
                            <option value="ALOJAMIENTO">Alojamiento</option>
                            <option value="TRANSPORTE">Transporte</option>
                            <option value="MATERIALES">Materiales</option>
                            <option value="GASTOS_MENORES">Gastos Menores</option>
                          </select>
                        </div>

                        <div className="md:col-span-1 flex justify-end">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.id)}
                            className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Eliminar ítem"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="md:col-span-6">
                          <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Descripción Detallada:</label>
                          <input
                            type="text"
                            placeholder="Detalle del gasto o justificación..."
                            value={item.description}
                            onChange={e => handleUpdateItem(item.id, 'description', e.target.value)}
                            className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs"
                          />
                        </div>

                        <div className="md:col-span-4">
                          <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Cuenta Contable (Gasto):</label>
                          <select
                            value={item.expenseAccountId || ''}
                            onChange={e => handleUpdateItem(item.id, 'expenseAccountId', e.target.value)}
                            className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-mono"
                          >
                            {accounts
                              .filter(a => a.type === 'Gasto' || a.code.startsWith('4') || a.code.startsWith('5'))
                              .map(acc => (
                                <option key={acc.id} value={acc.id}>
                                  {acc.code} - {acc.name}
                                </option>
                              ))}
                          </select>
                        </div>

                        <div className="md:col-span-2">
                          <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Monto ($):</label>
                          <input
                            type="number"
                            value={item.amount}
                            onChange={e => handleUpdateItem(item.id, 'amount', Number(e.target.value))}
                            className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-mono font-bold text-slate-900 text-right"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Resumen de totales */}
              <div className="bg-slate-100 p-4 rounded-xl flex justify-between items-center font-bold">
                <div className="space-y-0.5">
                  <span className="text-slate-500 text-[11px] block">
                    Anticipo: ${(Number(editingReport.initialAdvanceAmount) || 0).toLocaleString('es-CL')}
                  </span>
                  <span className="text-slate-900 text-xs block">
                    Total Gastos: ${modalItems.reduce((s, i) => s + (Number(i.amount) || 0), 0).toLocaleString('es-CL')}
                  </span>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-slate-500 block uppercase">Saldo Resultante</span>
                  <span className="text-sm font-mono text-emerald-800">
                    ${Math.abs((Number(editingReport.initialAdvanceAmount) || 0) - modalItems.reduce((s, i) => s + (Number(i.amount) || 0), 0)).toLocaleString('es-CL')}
                  </span>
                </div>
              </div>
            </div>

            {/* Pie del modal */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 border border-slate-300 hover:bg-white text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveReport}
                disabled={isSaving}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                <span>Guardar Rendición</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
