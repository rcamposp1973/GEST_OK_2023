import React, { useState, useMemo } from 'react';
import { Company, ChartOfAccount, Auxiliary, RCVDocument, Voucher, FiscalPeriodYear } from '../types';
import { generateSIIReportPDF } from '../utils/pdfGenerator';
import VoucherDocumentCorrectorModal from './VoucherDocumentCorrectorModal';
import { 
  Building2, 
  Users, 
  UserCheck, 
  Briefcase, 
  Wallet, 
  Landmark, 
  Layers, 
  FileText, 
  Search, 
  Filter, 
  Download, 
  FileSpreadsheet, 
  Calendar, 
  ChevronRight, 
  ChevronDown, 
  ArrowDownUp, 
  CheckCircle2, 
  Clock, 
  Sparkles,
  DollarSign,
  ExternalLink,
  Wrench
} from 'lucide-react';

interface AnalisisAuxiliaresViewProps {
  studyId: string;
  company: Company;
  accounts: ChartOfAccount[];
  auxiliaries: Auxiliary[];
  rcvDocuments: RCVDocument[];
  vouchers: Voucher[];
  fiscalYears: FiscalPeriodYear[];
  onOpenVoucher?: (voucherRef: Voucher | string | number) => void;
}

export interface DocumentMovement {
  id: string;
  voucherId?: string;
  date: string;
  voucherNumber: number | string;
  voucherType: string;
  gloss: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
}

export interface AuxiliaryDocumentItem {
  id: string;
  docType: string;
  docNumber: string;
  accountCode: string;
  accountName: string;
  issueDate: string;
  totalDebits: number;
  totalCredits: number;
  balance: number; // Saldo según naturaleza de la cuenta
  status: 'Saldado' | 'Pendiente' | 'Parcial';
  movements: DocumentMovement[];
}

// Representación de una cuenta contable dentro de la ficha de un Auxiliar (Modo por RUT)
export interface AuxAccountBreakdown {
  accountCode: string;
  accountName: string;
  accountCategory: 'DEUDOR' | 'ACREEDOR' | 'PERSONAL' | 'DEUDOR_VARIO' | 'ACREEDOR_VARIO' | 'OTRO';
  isActivo: boolean;
  totalDebits: number;
  totalCredits: number;
  balance: number;
  status: 'Saldado' | 'Pendiente';
  documents: AuxiliaryDocumentItem[];
}

// Grupo por RUT / Auxiliar (Modo por RUT)
export interface AuxiliaryGroup {
  rut: string;
  cleanRut: string;
  name: string;
  role: string;
  category: string;
  totalDebits: number;
  totalCredits: number;
  balance: number; // Saldo neto consolidado
  status: 'Saldado' | 'Pendiente';
  accounts: AuxAccountBreakdown[];
  documents: AuxiliaryDocumentItem[]; // Todos los documentos del RUT
}

// Representación de un Auxiliar (RUT) dentro de una Cuenta Contable (Modo por Cuenta)
export interface AccountRutBreakdown {
  rut: string;
  cleanRut: string;
  name: string;
  totalDebits: number;
  totalCredits: number;
  balance: number;
  status: 'Saldado' | 'Pendiente';
  documents: AuxiliaryDocumentItem[];
}

// Grupo por Cuenta Contable (Modo por Cuenta)
export interface AccountAuxGroup {
  accountCode: string;
  accountName: string;
  accountId?: string;
  accountCategory: 'DEUDOR' | 'ACREEDOR' | 'PERSONAL' | 'DEUDOR_VARIO' | 'ACREEDOR_VARIO' | 'OTRO';
  isActivo: boolean;
  totalDebits: number;
  totalCredits: number;
  balance: number;
  status: 'Saldado' | 'Pendiente';
  ruts: AccountRutBreakdown[];
  totalRutsCount: number;
  pendingRutsCount: number;
}

export type AuxiliaryClassificationCategory = 
  | 'TODAS'
  | 'DEUDOR'          // Clientes del giro (1102xxx, 1103xxx)
  | 'ACREEDOR'        // Proveedores del giro (2101xxx)
  | 'PERSONAL'        // Personal / Trabajadores (1104009 Anticipos, 1104003 Préstamos, 2102xxx Sueldos)
  | 'DEUDOR_VARIO'    // Deudores varios no del giro (1105xxx, 1106xxx, terceros)
  | 'ACREEDOR_VARIO'  // Acreedores varios (2104xxx, 2105xxx, bancos, previsionales, socios)
  | 'ACTIVO'
  | 'PASIVO';

const cleanRut = (rut: string): string => {
  if (!rut) return '';
  return rut.trim().toLowerCase().replace(/[^0-9k]/g, '');
};

const normalizeText = (str: string): string => {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
};

function matchesAuxiliarySearch(
  rut: string,
  cRut: string,
  auxName: string,
  searchTerm: string
): boolean {
  if (!searchTerm || !searchTerm.trim()) return true;

  const rawTerm = searchTerm.trim();
  const normTerm = normalizeText(rawTerm);
  if (!normTerm) return true;

  const normName = normalizeText(auxName || '');
  const normRut = normalizeText(rut || '');

  // 1. Coincidencia directa por Nombre o Razón Social
  if (normName && normName.includes(normTerm)) {
    return true;
  }

  // 2. Coincidencia por múltiples palabras del Nombre
  const searchWords = normTerm.split(/\s+/).filter(w => w.length > 0);
  if (searchWords.length > 1 && normName) {
    const allWordsMatch = searchWords.every(word => normName.includes(word));
    if (allWordsMatch) return true;
  }

  // 3. Coincidencia por RUT textual o formateado
  if (normRut && normRut.includes(normTerm)) {
    return true;
  }

  // 4. Coincidencia por dígitos de RUT limpios
  const termDigits = rawTerm.replace(/[^0-9kK]/g, '').toLowerCase();
  const hasDigits = /[0-9]/.test(termDigits);
  if (hasDigits && termDigits.length >= 2 && cRut && cRut.includes(termDigits)) {
    return true;
  }

  return false;
}

export const formatAuxDocType = (dt: string): string => {
  if (dt === '33') return 'Factura (33)';
  if (dt === '34') return 'Factura Exenta (34)';
  if (dt === '39') return 'Boleta (39)';
  if (dt === '41') return 'Boleta Exenta (41)';
  if (dt === '46') return 'Factura Compra (46)';
  if (dt === '56') return 'Nota Débito (56)';
  if (dt === '61') return 'Nota Crédito (61)';
  if (dt === 'BHE' || dt === '70') return 'Boleta Honorarios (BHE)';
  if (dt === 'NOMINA') return 'Nómina';
  if (dt === '9999' || dt === 'OTRO') return 'Doc. Interno';
  return dt;
};

function parseDocRef(
  refStr: string, 
  defaultVoucherNum?: number | string,
  lineDocType?: string,
  gloss?: string,
  accCategory?: string
): { docType: string; docNumber: string } {
  const clean = (refStr || '').trim();
  const cleanGloss = (gloss || '').trim();
  const cleanLineDocType = (lineDocType || '').trim().toUpperCase();

  // 1. Prioritize lineDocType if defined on the voucher line
  let docType = '';
  if (cleanLineDocType) {
    if (cleanLineDocType === '33' || cleanLineDocType.includes('FACTURA') || cleanLineDocType === 'FAC') {
      docType = cleanLineDocType.includes('EXENTA') ? '34' : '33';
    } else if (cleanLineDocType === '34' || cleanLineDocType.includes('EXENTA') || cleanLineDocType === 'FE') {
      docType = '34';
    } else if (cleanLineDocType === 'BHE' || cleanLineDocType === '70' || cleanLineDocType.includes('HONORAR')) {
      docType = 'BHE';
    } else if (cleanLineDocType === '61' || cleanLineDocType.includes('CREDITO') || cleanLineDocType.includes('CRÉDITO') || cleanLineDocType === 'NC') {
      docType = '61';
    } else if (cleanLineDocType === '56' || cleanLineDocType.includes('DEBITO') || cleanLineDocType.includes('DÉBITO') || cleanLineDocType === 'ND') {
      docType = '56';
    } else if (cleanLineDocType === '39' || cleanLineDocType.includes('BOLETA') || cleanLineDocType === 'BOL') {
      docType = '39';
    } else if (cleanLineDocType === '41') {
      docType = '41';
    } else if (cleanLineDocType === '46') {
      docType = '46';
    } else if (cleanLineDocType === 'NOMINA') {
      docType = 'NOMINA';
    } else if (cleanLineDocType === '9999' || cleanLineDocType === 'OTRO' || cleanLineDocType.includes('INTERNO')) {
      docType = '';
    } else {
      const d = cleanLineDocType.replace(/\D/g, '');
      if (d) docType = d;
    }
  }

  // 2. Detection from gloss first if refStr is generic (like Doc. Interno, OTRO, BANCO, S/N)
  const isGenericRef = !clean || /^(?:doc(?:umento)?\.?\s*interno|otro|banco|s\/n|sn|9999|sin\s*documento|\d+)$/i.test(clean);

  if (!docType && cleanGloss) {
    if (/factura\s*exenta/i.test(cleanGloss)) {
      docType = '34';
    } else if (/factura|fac\b|dte\s*33/i.test(cleanGloss)) {
      docType = '33';
    } else if (/boleta\s*honorario|\bbhe\b/i.test(cleanGloss)) {
      docType = 'BHE';
    } else if (/nota\s*de?\s*cr[eé]dito|\bnc\b/i.test(cleanGloss)) {
      docType = '61';
    } else if (/nota\s*de?\s*d[eé]bito|\bnd\b/i.test(cleanGloss)) {
      docType = '56';
    }
  }

  // 3. Detection from refStr
  if (!docType && clean) {
    if (/boleta\s*honorario/i.test(clean) || /\bbhe\b/i.test(clean) || /\bbhr\b/i.test(clean)) {
      docType = 'BHE';
    } else {
      const dteTypeMatch = clean.match(/(?:tipo\s*doc|doc|dte|nc|nd)?\s*\b(33|34|39|41|46|56|61|110)\b/i);
      if (dteTypeMatch) {
        docType = dteTypeMatch[1];
      } else if (/factura\s*exenta/i.test(clean) || /fe\b/i.test(clean)) {
        docType = '34';
      } else if (/factura/i.test(clean) || /fac\b/i.test(clean)) {
        docType = '33';
      } else if (/boleta/i.test(clean) || /bol\b/i.test(clean)) {
        docType = '39';
      } else if (/nota\s*de?\s*cr[eé]dito/i.test(clean) || /\bnc\b/i.test(clean)) {
        docType = '61';
      } else if (/nota\s*de?\s*d[eé]bito/i.test(clean) || /\bnd\b/i.test(clean)) {
        docType = '56';
      } else if (/n[oó]mina/i.test(clean)) {
        docType = 'NOMINA';
      }
    }
  }

  // 4. Default for commercial accounts (Proveedores / Clientes)
  if (!docType) {
    if (accCategory === 'ACREEDOR' || accCategory === 'DEUDOR') {
      docType = '33'; // Factura Electrónica por defecto en cuentas de clientes/proveedores
    } else if (clean.toUpperCase().includes('OTRO') || clean.includes('9999')) {
      docType = '9999';
    } else {
      docType = '9999';
    }
  }

  // Extract document number
  let docNumber = defaultVoucherNum ? String(defaultVoucherNum) : '1';

  if (isGenericRef && cleanGloss) {
    const glossNumMatch = cleanGloss.match(/(?:factura|fac|f\.|dte|boleta|bhe|n[oó]mina|doc\.?|folio|n°|nº|#)\s*:?\s*(\d+)/i)
      || cleanGloss.match(/\b(\d{2,10})\b/);
    if (glossNumMatch) {
      docNumber = glossNumMatch[1];
    }
  }

  if (docNumber === '1' || docNumber === String(defaultVoucherNum)) {
    const numMatch = clean.match(/(?:n°|#|nº|folio|num|nro\.?|doc\.?)\s*:?\s*(\d+)/i) 
      || clean.match(/\b(\d+)\b(?!.*\b\d+\b)/)
      || cleanGloss.match(/(?:n°|#|nº|folio|num|nro\.?|factura)\s*:?\s*(\d+)/i);

    if (numMatch) {
      docNumber = numMatch[1];
    } else {
      const digits = clean.replace(/[^0-9]/g, '');
      if (digits) {
        docNumber = digits;
      } else if (clean && !isGenericRef) {
        docNumber = clean;
      }
    }
  }

  return { docType, docNumber };
}

/**
 * Categoriza una cuenta contable en una de las 5 naturalezas de auxiliares
 */
export function getAccountAuxiliaryCategory(
  accCode: string, 
  accName: string, 
  accObj?: ChartOfAccount
): 'DEUDOR' | 'ACREEDOR' | 'PERSONAL' | 'DEUDOR_VARIO' | 'ACREEDOR_VARIO' | 'OTRO' {
  const code = (accCode || '').trim().replace(/[^0-9]/g, '');
  const rawCode = (accCode || '').trim();
  const name = (accName || '').toLowerCase();

  // 1. Personal / Trabajadores (Anticipos 1104009, Préstamos 1104003, Sueldos, Finiquitos, Honorarios)
  if (
    rawCode.startsWith('1104') || 
    rawCode.startsWith('1.1.04') || 
    code.startsWith('1104') ||
    rawCode.startsWith('2103') || 
    rawCode.startsWith('2.1.03') || 
    name.includes('trabajador') || 
    name.includes('personal') || 
    name.includes('anticipo') || 
    name.includes('prestamo trabajador') || 
    name.includes('prestamos a trabajador') || 
    name.includes('sueldo') || 
    name.includes('remuneracion') || 
    name.includes('finiquito') || 
    name.includes('empleado') ||
    name.includes('honorario')
  ) {
    return 'PERSONAL';
  }

  // 2. Deudores / Clientes del giro (1102xxx, 1103xxx, Facturas por cobrar)
  if (
    rawCode.startsWith('1102') || 
    rawCode.startsWith('1.1.02') || 
    code.startsWith('1102') ||
    rawCode.startsWith('1103') || 
    rawCode.startsWith('1.1.03') || 
    code.startsWith('1103') ||
    name.includes('cliente') || 
    name.includes('deudores por venta') || 
    name.includes('facturas por cobrar')
  ) {
    return 'DEUDOR';
  }

  // 3. Acreedores / Proveedores del giro (2101xxx, 2102xxx, Facturas por pagar)
  if (
    rawCode.startsWith('2101') || 
    rawCode.startsWith('2.1.01') || 
    code.startsWith('2101') ||
    rawCode.startsWith('2102') || 
    rawCode.startsWith('2.1.02') || 
    code.startsWith('2102') ||
    name.includes('proveedor') || 
    name.includes('facturas por pagar') || 
    name.includes('factura por pagar') ||
    name.includes('acreedores comerciales')
  ) {
    return 'ACREEDOR';
  }

  // 4. Deudores Varios (no giro: préstamos a terceros, cuentas por cobrar varias, socios activo)
  if (
    rawCode.startsWith('1105') || 
    rawCode.startsWith('1.1.05') || 
    rawCode.startsWith('1106') || 
    rawCode.startsWith('1.1.06') || 
    rawCode.startsWith('1107') || 
    rawCode.startsWith('1108') || 
    code.startsWith('1105') ||
    code.startsWith('1106') ||
    name.includes('deudores varios') || 
    name.includes('otros deudores') || 
    name.includes('prestamo tercero') || 
    name.includes('cuenta corriente socio (activo)') ||
    (name.includes('socio') && rawCode.startsWith('1'))
  ) {
    return 'DEUDOR_VARIO';
  }

  // 5. Acreedores Varios (bancos, previsiones, socios pasivo, impuestos por pagar)
  if (
    rawCode.startsWith('2104') || 
    rawCode.startsWith('2.1.04') || 
    rawCode.startsWith('2105') || 
    rawCode.startsWith('2.1.05') || 
    rawCode.startsWith('2106') || 
    rawCode.startsWith('2107') || 
    code.startsWith('2104') ||
    code.startsWith('2105') ||
    name.includes('acreedores varios') || 
    name.includes('otros acreedores') || 
    name.includes('instituciones previsionales') || 
    name.includes('afp') || 
    name.includes('isapre') || 
    name.includes('fonasa') || 
    name.includes('previred') || 
    name.includes('banco') || 
    (name.includes('socio') && rawCode.startsWith('2')) ||
    name.includes('tgr') || 
    name.includes('tesoreria')
  ) {
    return 'ACREEDOR_VARIO';
  }

  return rawCode.startsWith('1') ? 'DEUDOR' : 'ACREEDOR';
}

export default function AnalisisAuxiliaresView({
  studyId,
  company,
  accounts,
  auxiliaries,
  rcvDocuments,
  vouchers,
  fiscalYears,
  onOpenVoucher
}: AnalisisAuxiliaresViewProps) {
  // Modo de Vista Principal: 'byAccount' (Por Cuenta Contable) vs 'byRut' (Por RUT / Auxiliar)
  const [viewMode, setViewMode] = useState<'byAccount' | 'byRut'>('byAccount');

  // Filtro de Categoría Especializada de Auxiliares
  const [selectedCategory, setSelectedCategory] = useState<AuxiliaryClassificationCategory>('TODAS');
  
  // Filtro de Cuenta Contable específica
  const [selectedAccountId, setSelectedAccountId] = useState<string>('todos');
  
  // Búsqueda por RUT / Nombre Auxiliar
  const [rutSearch, setRutSearch] = useState<string>('');
  
  // Filtro por Tipo de Documento y Folio
  const [docTypeFilter, setDocTypeFilter] = useState<string>('todos');
  const [docNumberSearch, setDocNumberSearch] = useState<string>('');

  // Filtro de Saldo: 'soloPendientes' (ocultar saldo $0) vs 'todos' (incluye saldo $0)
  const [balanceFilter, setBalanceFilter] = useState<'soloPendientes' | 'todos'>('soloPendientes');
  const [showCorrectorModal, setShowCorrectorModal] = useState<boolean>(false);

  // Filtro de Fechas
  const [dateFilterMode, setDateFilterMode] = useState<'corte' | 'rango'>('corte');
  const [cutoffDate, setCutoffDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [startDate, setStartDate] = useState<string>('2025-01-01');
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Acordeones desplegados
  const [expandedKeys, setExpandedKeys] = useState<{ [key: string]: boolean }>({});
  const [expandedSubKeys, setExpandedSubKeys] = useState<{ [key: string]: boolean }>({});
  const [expandedDocs, setExpandedDocs] = useState<{ [docId: string]: boolean }>({});

  // Account map by ID and Code
  const accountMap = useMemo(() => {
    const map = new Map<string, ChartOfAccount>();
    accounts.forEach(a => {
      map.set(a.id, a);
      if (a.code) {
        map.set(a.code, a);
        map.set(a.code.replace(/[^a-zA-Z0-9]/g, ''), a);
      }
    });
    return map;
  }, [accounts]);

  // Auxiliary Map by RUT
  const auxMap = useMemo(() => {
    const map = new Map<string, Auxiliary>();
    auxiliaries.forEach(a => {
      if (a.rut) map.set(cleanRut(a.rut), a);
    });
    return map;
  }, [auxiliaries]);

  /**
   * REGLA ESTRICTA DE CUENTA AUXILIAR:
   * Filtra las cuentas que tienen `requiereAuxiliarRUT === true` o códigos contables auxiliares estándar.
   */
  const isAuxiliaryAccount = (accCode: string, accName: string, accObj?: ChartOfAccount): boolean => {
    const code = (accCode || '').trim();
    const name = (accName || '').toLowerCase();
    const type = (accObj?.type || '').toLowerCase();

    // 1. Descartar explícitamente cuentas de Resultado (Ingresos 4.x / Gastos 5.x)
    if (code.startsWith('4') || code.startsWith('5') || type.includes('ingreso') || type.includes('gasto')) {
      return false;
    }
    // 2. Descartar cuentas de IVA débito y crédito del F29 que no son auxiliares individuales
    if (
      code.startsWith('1.1.07') || 
      code.startsWith('2.1.03.01') || 
      name === 'iva débito fiscal' || 
      name === 'iva credito fiscal' ||
      name === 'iva debito fiscal' ||
      name === 'iva crédito fiscal'
    ) {
      return false;
    }
    // 3. Si existe el objeto de cuenta, verificar si tiene marcado `requiereAuxiliarRUT`
    if (accObj) {
      if (accObj.requiereAuxiliarRUT) return true;
      if (accObj.requiereAuxiliarRUT === false) return false;
    }
    // 4. Fallback estándar para cuentas de Clientes / Proveedores / Anticipos / Honorarios / Personal / Cuentas Corrientes
    return (
      code.startsWith('1.1.02') || 
      code.startsWith('1.1.03') || 
      code.startsWith('1.1.04') || 
      code.startsWith('1104') || 
      code.startsWith('1102') || 
      code.startsWith('1103') || 
      code.startsWith('1105') || 
      code.startsWith('1106') || 
      code.startsWith('2.1.01') || 
      code.startsWith('2.1.02') || 
      code.startsWith('2.1.04') ||
      code.startsWith('2101') || 
      code.startsWith('2102') || 
      code.startsWith('2103') || 
      code.startsWith('2104') || 
      code.startsWith('2105') || 
      name.includes('cliente') ||
      name.includes('proveedor') ||
      name.includes('trabajador') ||
      name.includes('personal') ||
      name.includes('anticipo') ||
      name.includes('prestamo') ||
      name.includes('honorario') ||
      name.includes('deudores varios') ||
      name.includes('acreedores varios') ||
      name.includes('socio')
    );
  };

  // Cuentas auxiliares disponibles para el desplegable de filtro
  const availableAuxiliaryAccounts = useMemo(() => {
    return accounts.filter(acc => {
      if (acc.estado === 'Inactivo') return false;
      if (!isAuxiliaryAccount(acc.code, acc.name, acc)) return false;

      const cat = getAccountAuxiliaryCategory(acc.code, acc.name, acc);
      const code = (acc.code || '').toLowerCase();
      const type = (acc.type || '').toLowerCase();

      if (selectedCategory === 'DEUDOR' && cat !== 'DEUDOR') return false;
      if (selectedCategory === 'ACREEDOR' && cat !== 'ACREEDOR') return false;
      if (selectedCategory === 'PERSONAL' && cat !== 'PERSONAL') return false;
      if (selectedCategory === 'DEUDOR_VARIO' && cat !== 'DEUDOR_VARIO') return false;
      if (selectedCategory === 'ACREEDOR_VARIO' && cat !== 'ACREEDOR_VARIO') return false;
      if (selectedCategory === 'ACTIVO' && !type.includes('activo') && !code.startsWith('1')) return false;
      if (selectedCategory === 'PASIVO' && !type.includes('pasivo') && !code.startsWith('2')) return false;

      return true;
    });
  }, [accounts, selectedCategory]);

  const selectedAccountObj = useMemo(() => {
    if (selectedAccountId === 'todos') return null;
    return accounts.find(a => a.id === selectedAccountId || a.code === selectedAccountId) || null;
  }, [accounts, selectedAccountId]);

  // Nombres más completos por RUT
  const bestAuxNameByRut = useMemo(() => {
    const map = new Map<string, string>();
    auxiliaries.forEach(a => {
      if (a.rut && a.name && a.name.trim()) {
        const c = cleanRut(a.rut);
        if (c) map.set(c, a.name.trim());
      }
    });
    vouchers.forEach(v => {
      (v.lines || []).forEach(l => {
        if (l.auxiliaryRut && l.auxiliaryName && l.auxiliaryName.trim()) {
          const c = cleanRut(l.auxiliaryRut);
          if (c && !map.has(c)) {
            map.set(c, l.auxiliaryName.trim());
          }
        }
      });
    });
    return map;
  }, [auxiliaries, vouchers]);

  /**
   * =========================================================================
   * MOTOR 1: ANÁLISIS AGRUPADO POR CUENTA CONTABLE (DESGLOSE POR RUT)
   * =========================================================================
   */
  const accountGroups = useMemo(() => {
    interface TempMovementItem {
      rut: string;
      cleanRut: string;
      name: string;
      docType: string;
      docNumber: string;
      accountCode: string;
      accountName: string;
      date: string;
      voucherId?: string;
      voucherNumber: number | string;
      voucherType: string;
      gloss: string;
      debit: number;
      credit: number;
    }

    const movementsByAccount = new Map<string, TempMovementItem[]>();

    vouchers.forEach(v => {
      if (v.status === 'Anulado') return;
      const vDate = v.date || '';

      if (dateFilterMode === 'corte') {
        if (cutoffDate && vDate > cutoffDate) return;
      } else {
        if (startDate && vDate < startDate) return;
        if (endDate && vDate > endDate) return;
      }

      (v.lines || []).forEach((line, lIdx) => {
        if (!line.auxiliaryRut) return;

        const rut = line.auxiliaryRut.trim();
        const cRut = cleanRut(rut);
        if (!cRut) return;

        const debit = Number(line.debit) || 0;
        const credit = Number(line.credit) || 0;
        if (debit === 0 && credit === 0) return;

        const lineCode = (line.accountCode || '').trim();
        const cleanLineCode = lineCode.replace(/[^a-zA-Z0-9]/g, '');
        const lineAcc = accountMap.get(line.accountId || '') || accountMap.get(lineCode) || accountMap.get(cleanLineCode);
        const lineName = line.accountName || lineAcc?.name || 'Cuenta Auxiliar';

        if (!isAuxiliaryAccount(lineCode, lineName, lineAcc)) {
          return;
        }

        const accCategory = getAccountAuxiliaryCategory(lineCode, lineName, lineAcc);

        // Filtro por Categoría
        if (selectedCategory === 'DEUDOR' && accCategory !== 'DEUDOR') return;
        if (selectedCategory === 'ACREEDOR' && accCategory !== 'ACREEDOR') return;
        if (selectedCategory === 'PERSONAL' && accCategory !== 'PERSONAL') return;
        if (selectedCategory === 'DEUDOR_VARIO' && accCategory !== 'DEUDOR_VARIO') return;
        if (selectedCategory === 'ACREEDOR_VARIO' && accCategory !== 'ACREEDOR_VARIO') return;
        if (selectedCategory === 'ACTIVO' && !(lineCode.startsWith('1') || lineAcc?.type === 'Activo')) return;
        if (selectedCategory === 'PASIVO' && !(lineCode.startsWith('2') || lineAcc?.type === 'Pasivo')) return;

        // Filtro por Cuenta específica
        if (selectedAccountObj) {
          if (lineAcc?.id !== selectedAccountObj.id && lineCode !== selectedAccountObj.code) {
            return;
          }
        }

        // Búsqueda por RUT / Nombre
        const auxObj = auxMap.get(cRut);
        const resolvedName = bestAuxNameByRut.get(cRut) || line.auxiliaryName || auxObj?.name || rut;
        if (rutSearch && !matchesAuxiliarySearch(rut, cRut, resolvedName, rutSearch)) {
          return;
        }

        const parsed = parseDocRef(line.documentRef || '', v.voucherNumber, line.documentType, line.gloss || v.gloss, accCategory);

        // Filtro tipo doc
        if (docTypeFilter !== 'todos') {
          if (docTypeFilter === '9999' && parsed.docType !== '9999' && parsed.docType !== 'OTRO') return;
          if (docTypeFilter !== '9999' && parsed.docType !== docTypeFilter) return;
        }

        // Filtro folio doc
        if (docNumberSearch && !parsed.docNumber.includes(docNumberSearch.trim())) {
          return;
        }

        const accKey = lineCode;
        if (!movementsByAccount.has(accKey)) {
          movementsByAccount.set(accKey, []);
        }

        movementsByAccount.get(accKey)!.push({
          rut: auxObj?.rut || rut,
          cleanRut: cRut,
          name: resolvedName,
          docType: parsed.docType,
          docNumber: parsed.docNumber,
          accountCode: lineCode,
          accountName: lineName,
          date: vDate,
          voucherId: v.id,
          voucherNumber: v.voucherNumber,
          voucherType: v.type,
          gloss: line.gloss || v.gloss || `Comprobante N° ${v.voucherNumber}`,
          debit,
          credit
        });
      });
    });

    // Construcción estructurada de Grupos por Cuenta
    const result: AccountAuxGroup[] = [];

    movementsByAccount.forEach((movs, accCode) => {
      const sample = movs[0];
      const accObj = accountMap.get(accCode);
      const accName = sample?.accountName || accObj?.name || accCode;
      const accCategory = getAccountAuxiliaryCategory(accCode, accName, accObj);
      const isActivo = accCode.startsWith('1') || (accObj?.type === 'Activo');

      // Agrupar movimientos dentro de la cuenta por RUT y luego por Documento
      const rutsMap = new Map<string, {
        rut: string;
        cleanRut: string;
        name: string;
        docsMap: Map<string, AuxiliaryDocumentItem>;
      }>();

      movs.forEach(m => {
        if (!rutsMap.has(m.cleanRut)) {
          rutsMap.set(m.cleanRut, {
            rut: m.rut,
            cleanRut: m.cleanRut,
            name: m.name,
            docsMap: new Map()
          });
        }
        const rutItem = rutsMap.get(m.cleanRut)!;
        const docKey = `${m.docType}__${m.docNumber}`;

        if (!rutItem.docsMap.has(docKey)) {
          rutItem.docsMap.set(docKey, {
            id: `${accCode}_${m.cleanRut}_${docKey}`,
            docType: m.docType,
            docNumber: m.docNumber,
            accountCode: accCode,
            accountName: accName,
            issueDate: m.date,
            totalDebits: 0,
            totalCredits: 0,
            balance: 0,
            status: 'Pendiente',
            movements: []
          });
        }

        const docItem = rutItem.docsMap.get(docKey)!;
        docItem.totalDebits += m.debit;
        docItem.totalCredits += m.credit;
        docItem.movements.push({
          id: `mv_${m.voucherNumber}_${m.date}_${m.voucherId || ''}`,
          voucherId: m.voucherId,
          date: m.date,
          voucherNumber: m.voucherNumber,
          voucherType: m.voucherType,
          gloss: m.gloss,
          accountCode: accCode,
          accountName: accName,
          debit: m.debit,
          credit: m.credit
        });
      });

      const rutBreakdowns: AccountRutBreakdown[] = [];
      let accTotalDebits = 0;
      let accTotalCredits = 0;

      rutsMap.forEach(rItem => {
        const docsList: AuxiliaryDocumentItem[] = [];
        let rDebits = 0;
        let rCredits = 0;

        rItem.docsMap.forEach(doc => {
          doc.movements.sort((a, b) => a.date.localeCompare(b.date));
          doc.issueDate = doc.movements[0]?.date || doc.issueDate;

          const rawBalance = isActivo ? (doc.totalDebits - doc.totalCredits) : (doc.totalCredits - doc.totalDebits);
          const isDocSaldado = Math.abs(doc.totalDebits - doc.totalCredits) < 0.01;
          doc.balance = isDocSaldado ? 0 : rawBalance;

          if (isDocSaldado) {
            doc.status = 'Saldado';
          } else if (doc.totalDebits > 0 && doc.totalCredits > 0) {
            doc.status = 'Parcial';
          } else {
            doc.status = 'Pendiente';
          }

          if (balanceFilter === 'soloPendientes' && isDocSaldado) {
            return;
          }

          rDebits += doc.totalDebits;
          rCredits += doc.totalCredits;
          docsList.push(doc);
        });

        if (docsList.length === 0) return;

        docsList.sort((a, b) => b.issueDate.localeCompare(a.issueDate));

        const rNetBalance = isActivo ? (rDebits - rCredits) : (rCredits - rDebits);
        const isRutSaldado = Math.abs(rDebits - rCredits) < 0.01;

        accTotalDebits += rDebits;
        accTotalCredits += rCredits;

        rutBreakdowns.push({
          rut: rItem.rut,
          cleanRut: rItem.cleanRut,
          name: rItem.name,
          totalDebits: rDebits,
          totalCredits: rCredits,
          balance: isRutSaldado ? 0 : rNetBalance,
          status: isRutSaldado ? 'Saldado' : 'Pendiente',
          documents: docsList
        });
      });

      if (rutBreakdowns.length === 0) return;

      // Ordenar RUTs alfabéticamente por Razón Social
      rutBreakdowns.sort((a, b) => a.name.localeCompare(b.name));

      const accNetBalance = isActivo ? (accTotalDebits - accTotalCredits) : (accTotalCredits - accTotalDebits);
      const isAccSaldado = Math.abs(accTotalDebits - accTotalCredits) < 0.01;

      result.push({
        accountCode: accCode,
        accountName: accName,
        accountId: accObj?.id,
        accountCategory: accCategory,
        isActivo,
        totalDebits: accTotalDebits,
        totalCredits: accTotalCredits,
        balance: isAccSaldado ? 0 : accNetBalance,
        status: isAccSaldado ? 'Saldado' : 'Pendiente',
        ruts: rutBreakdowns,
        totalRutsCount: rutBreakdowns.length,
        pendingRutsCount: rutBreakdowns.filter(r => r.balance !== 0).length
      });
    });

    // Ordenar cuentas por código contable
    result.sort((a, b) => a.accountCode.localeCompare(b.accountCode, undefined, { numeric: true }));

    return result;
  }, [
    vouchers,
    auxiliaries,
    auxMap,
    accountMap,
    bestAuxNameByRut,
    rutSearch,
    selectedAccountId,
    selectedAccountObj,
    selectedCategory,
    docTypeFilter,
    docNumberSearch,
    balanceFilter,
    dateFilterMode,
    cutoffDate,
    startDate,
    endDate
  ]);

  /**
   * =========================================================================
   * MOTOR 2: ANÁLISIS AGRUPADO POR RUT / AUXILIAR (DESGLOSE POR CUENTAS)
   * =========================================================================
   */
  const auxiliaryGroups = useMemo(() => {
    interface TempAuxMovement {
      rut: string;
      cleanRut: string;
      name: string;
      accountCode: string;
      accountName: string;
      docType: string;
      docNumber: string;
      date: string;
      voucherId?: string;
      voucherNumber: number | string;
      voucherType: string;
      gloss: string;
      debit: number;
      credit: number;
    }

    const movementsByRut = new Map<string, TempAuxMovement[]>();

    vouchers.forEach(v => {
      if (v.status === 'Anulado') return;
      const vDate = v.date || '';

      if (dateFilterMode === 'corte') {
        if (cutoffDate && vDate > cutoffDate) return;
      } else {
        if (startDate && vDate < startDate) return;
        if (endDate && vDate > endDate) return;
      }

      (v.lines || []).forEach((line) => {
        if (!line.auxiliaryRut) return;

        const rut = line.auxiliaryRut.trim();
        const cRut = cleanRut(rut);
        if (!cRut) return;

        const debit = Number(line.debit) || 0;
        const credit = Number(line.credit) || 0;
        if (debit === 0 && credit === 0) return;

        const lineCode = (line.accountCode || '').trim();
        const cleanLineCode = lineCode.replace(/[^a-zA-Z0-9]/g, '');
        const lineAcc = accountMap.get(line.accountId || '') || accountMap.get(lineCode) || accountMap.get(cleanLineCode);
        const lineName = line.accountName || lineAcc?.name || 'Cuenta Auxiliar';

        if (!isAuxiliaryAccount(lineCode, lineName, lineAcc)) {
          return;
        }

        const accCategory = getAccountAuxiliaryCategory(lineCode, lineName, lineAcc);

        // Filtro por Categoría
        if (selectedCategory === 'DEUDOR' && accCategory !== 'DEUDOR') return;
        if (selectedCategory === 'ACREEDOR' && accCategory !== 'ACREEDOR') return;
        if (selectedCategory === 'PERSONAL' && accCategory !== 'PERSONAL') return;
        if (selectedCategory === 'DEUDOR_VARIO' && accCategory !== 'DEUDOR_VARIO') return;
        if (selectedCategory === 'ACREEDOR_VARIO' && accCategory !== 'ACREEDOR_VARIO') return;
        if (selectedCategory === 'ACTIVO' && !(lineCode.startsWith('1') || lineAcc?.type === 'Activo')) return;
        if (selectedCategory === 'PASIVO' && !(lineCode.startsWith('2') || lineAcc?.type === 'Pasivo')) return;

        // Filtro por Cuenta específica
        if (selectedAccountObj) {
          if (lineAcc?.id !== selectedAccountObj.id && lineCode !== selectedAccountObj.code) {
            return;
          }
        }

        const auxObj = auxMap.get(cRut);
        const resolvedName = bestAuxNameByRut.get(cRut) || line.auxiliaryName || auxObj?.name || rut;
        if (rutSearch && !matchesAuxiliarySearch(rut, cRut, resolvedName, rutSearch)) {
          return;
        }

        const parsed = parseDocRef(line.documentRef || '', v.voucherNumber, line.documentType, line.gloss || v.gloss, accCategory);

        if (docTypeFilter !== 'todos') {
          if (docTypeFilter === '9999' && parsed.docType !== '9999' && parsed.docType !== 'OTRO') return;
          if (docTypeFilter !== '9999' && parsed.docType !== docTypeFilter) return;
        }

        if (docNumberSearch && !parsed.docNumber.includes(docNumberSearch.trim())) {
          return;
        }

        if (!movementsByRut.has(cRut)) {
          movementsByRut.set(cRut, []);
        }

        movementsByRut.get(cRut)!.push({
          rut: auxObj?.rut || rut,
          cleanRut: cRut,
          name: resolvedName,
          accountCode: lineCode,
          accountName: lineName,
          docType: parsed.docType,
          docNumber: parsed.docNumber,
          date: vDate,
          voucherId: v.id,
          voucherNumber: v.voucherNumber,
          voucherType: v.type,
          gloss: line.gloss || v.gloss || `Comprobante N° ${v.voucherNumber}`,
          debit,
          credit
        });
      });
    });

    const result: AuxiliaryGroup[] = [];

    movementsByRut.forEach((movs, cRut) => {
      const auxObj = auxMap.get(cRut);
      const resolvedName = bestAuxNameByRut.get(cRut) || auxObj?.name || movs[0]?.name || cRut;
      const rutStr = auxObj?.rut || movs[0]?.rut || cRut;
      const roleStr = auxObj?.role || 'Deudor';
      const catStr = auxObj?.category || 'Deudores';

      // Agrupar movimientos del RUT por Cuenta Contable
      const accMapLocal = new Map<string, {
        accountCode: string;
        accountName: string;
        docsMap: Map<string, AuxiliaryDocumentItem>;
      }>();

      movs.forEach(m => {
        if (!accMapLocal.has(m.accountCode)) {
          accMapLocal.set(m.accountCode, {
            accountCode: m.accountCode,
            accountName: m.accountName,
            docsMap: new Map()
          });
        }
        const accItem = accMapLocal.get(m.accountCode)!;
        const docKey = `${m.docType}__${m.docNumber}`;

        if (!accItem.docsMap.has(docKey)) {
          accItem.docsMap.set(docKey, {
            id: `doc_${cRut}_${m.accountCode}_${docKey}`,
            docType: m.docType,
            docNumber: m.docNumber,
            accountCode: m.accountCode,
            accountName: m.accountName,
            issueDate: m.date,
            totalDebits: 0,
            totalCredits: 0,
            balance: 0,
            status: 'Pendiente',
            movements: []
          });
        }

        const docObj = accItem.docsMap.get(docKey)!;
        docObj.totalDebits += m.debit;
        docObj.totalCredits += m.credit;
        docObj.movements.push({
          id: `m_${m.voucherNumber}_${m.date}_${m.voucherId || ''}`,
          voucherId: m.voucherId,
          date: m.date,
          voucherNumber: m.voucherNumber,
          voucherType: m.voucherType,
          gloss: m.gloss,
          accountCode: m.accountCode,
          accountName: m.accountName,
          debit: m.debit,
          credit: m.credit
        });
      });

      const accBreakdowns: AuxAccountBreakdown[] = [];
      const allDocs: AuxiliaryDocumentItem[] = [];
      let totalRDebits = 0;
      let totalRCredits = 0;

      accMapLocal.forEach((accItem, aCode) => {
        const accObj = accountMap.get(aCode);
        const aCategory = getAccountAuxiliaryCategory(aCode, accItem.accountName, accObj);
        const isActivo = aCode.startsWith('1') || (accObj?.type === 'Activo');

        const docsList: AuxiliaryDocumentItem[] = [];
        let aDebits = 0;
        let aCredits = 0;

        accItem.docsMap.forEach(doc => {
          doc.movements.sort((a, b) => a.date.localeCompare(b.date));
          doc.issueDate = doc.movements[0]?.date || doc.issueDate;

          const rawBalance = isActivo ? (doc.totalDebits - doc.totalCredits) : (doc.totalCredits - doc.totalDebits);
          const isDocSaldado = Math.abs(doc.totalDebits - doc.totalCredits) < 0.01;
          doc.balance = isDocSaldado ? 0 : rawBalance;

          if (isDocSaldado) {
            doc.status = 'Saldado';
          } else if (doc.totalDebits > 0 && doc.totalCredits > 0) {
            doc.status = 'Parcial';
          } else {
            doc.status = 'Pendiente';
          }

          if (balanceFilter === 'soloPendientes' && isDocSaldado) {
            return;
          }

          aDebits += doc.totalDebits;
          aCredits += doc.totalCredits;
          docsList.push(doc);
          allDocs.push(doc);
        });

        if (docsList.length === 0) return;

        docsList.sort((a, b) => b.issueDate.localeCompare(a.issueDate));

        const aNetBalance = isActivo ? (aDebits - aCredits) : (aCredits - aDebits);
        const isAccSaldado = Math.abs(aDebits - aCredits) < 0.01;

        totalRDebits += aDebits;
        totalRCredits += aCredits;

        accBreakdowns.push({
          accountCode: aCode,
          accountName: accItem.accountName,
          accountCategory: aCategory,
          isActivo,
          totalDebits: aDebits,
          totalCredits: aCredits,
          balance: isAccSaldado ? 0 : aNetBalance,
          status: isAccSaldado ? 'Saldado' : 'Pendiente',
          documents: docsList
        });
      });

      if (accBreakdowns.length === 0) return;

      accBreakdowns.sort((a, b) => a.accountCode.localeCompare(b.accountCode, undefined, { numeric: true }));

      // Determinar saldo consolidado neto
      const isActivoPredominant = accBreakdowns.some(a => a.isActivo);
      const auxNetBalance = isActivoPredominant ? (totalRDebits - totalRCredits) : (totalRCredits - totalRDebits);
      const isAuxSaldado = Math.abs(totalRDebits - totalRCredits) < 0.01;

      result.push({
        rut: rutStr,
        cleanRut: cRut,
        name: resolvedName,
        role: roleStr,
        category: catStr,
        totalDebits: totalRDebits,
        totalCredits: totalRCredits,
        balance: isAuxSaldado ? 0 : auxNetBalance,
        status: isAuxSaldado ? 'Saldado' : 'Pendiente',
        accounts: accBreakdowns,
        documents: allDocs
      });
    });

    result.sort((a, b) => a.name.localeCompare(b.name));

    return result;
  }, [
    vouchers,
    auxiliaries,
    auxMap,
    accountMap,
    bestAuxNameByRut,
    rutSearch,
    selectedAccountId,
    selectedAccountObj,
    selectedCategory,
    docTypeFilter,
    docNumberSearch,
    balanceFilter,
    dateFilterMode,
    cutoffDate,
    startDate,
    endDate
  ]);

  // Resumen global de métricas
  const summaryMetrics = useMemo(() => {
    let totalDebits = 0;
    let totalCredits = 0;
    let totalPendingBalance = 0;
    let totalAccountsCount = accountGroups.length;
    let totalAuxiliariesCount = auxiliaryGroups.length;
    let totalDocsCount = 0;

    auxiliaryGroups.forEach(aux => {
      totalDebits += aux.totalDebits;
      totalCredits += aux.totalCredits;
      totalDocsCount += aux.documents.length;
      aux.documents.forEach(doc => {
        if (doc.balance > 0) {
          totalPendingBalance += doc.balance;
        }
      });
    });

    return { 
      totalDebits, 
      totalCredits, 
      totalPendingBalance, 
      totalAccountsCount, 
      totalAuxiliariesCount, 
      totalDocsCount 
    };
  }, [auxiliaryGroups, accountGroups]);

  // Expand / collapse all
  const handleToggleExpandAll = () => {
    if (viewMode === 'byAccount') {
      const allExpanded = accountGroups.every(g => expandedKeys[g.accountCode]);
      const newState: { [key: string]: boolean } = {};
      accountGroups.forEach(g => {
        newState[g.accountCode] = !allExpanded;
      });
      setExpandedKeys(newState);
    } else {
      const allExpanded = auxiliaryGroups.every(g => expandedKeys[g.cleanRut]);
      const newState: { [key: string]: boolean } = {};
      auxiliaryGroups.forEach(g => {
        newState[g.cleanRut] = !allExpanded;
      });
      setExpandedKeys(newState);
    }
  };

  // Exportar a Excel CSV
  const handleExportCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    
    if (viewMode === 'byAccount') {
      csvContent += "Código Cuenta;Nombre Cuenta;Categoría;RUT Auxiliar;Razón Social;Tipo Doc;Folio / N° Doc;Fecha;Débitos ($);Créditos ($);Saldo ($);Estado\n";
      accountGroups.forEach(acc => {
        acc.ruts.forEach(rut => {
          rut.documents.forEach(doc => {
            const row = [
              acc.accountCode,
              `"${acc.accountName}"`,
              acc.accountCategory,
              rut.rut,
              `"${rut.name}"`,
              formatAuxDocType(doc.docType),
              doc.docNumber,
              doc.issueDate,
              doc.totalDebits,
              doc.totalCredits,
              doc.balance,
              doc.status
            ].join(';');
            csvContent += row + "\n";
          });
        });
      });
    } else {
      csvContent += "RUT Auxiliar;Razón Social / Nombre;Rol;Código Cuenta;Nombre Cuenta;Tipo Doc;Folio / N° Doc;Fecha;Débitos ($);Créditos ($);Saldo ($);Estado\n";
      auxiliaryGroups.forEach(aux => {
        aux.accounts.forEach(acc => {
          acc.documents.forEach(doc => {
            const row = [
              aux.rut,
              `"${aux.name}"`,
              aux.role,
              acc.accountCode,
              `"${acc.accountName}"`,
              formatAuxDocType(doc.docType),
              doc.docNumber,
              doc.issueDate,
              doc.totalDebits,
              doc.totalCredits,
              doc.balance,
              doc.status
            ].join(';');
            csvContent += row + "\n";
          });
        });
      });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Analisis_Auxiliares_${viewMode === 'byAccount' ? 'Por_Cuenta' : 'Por_RUT'}_${company.rut || 'Empresa'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadSIIReport = () => {
    if (viewMode === 'byAccount') {
      if (accountGroups.length === 0) {
        alert('No hay movimientos en el Análisis de Auxiliares por Cuenta para generar el informe.');
        return;
      }
      const title = `Analisis_Auxiliares_Por_Cuenta_${company.name}_${selectedCategory}`;
      const columns = ['Cuenta', 'RUT', 'Auxiliar', 'Doc', 'N°', 'Fecha', 'Débitos ($)', 'Créditos ($)', 'Saldo ($)', 'Estado'];
      const data: any[][] = [];

      accountGroups.forEach(acc => {
        acc.ruts.forEach(rut => {
          rut.documents.forEach(doc => {
            data.push([
              `[${acc.accountCode}]`,
              rut.rut,
              rut.name,
              formatAuxDocType(doc.docType),
              doc.docNumber,
              doc.issueDate,
              doc.totalDebits.toLocaleString('es-CL'),
              doc.totalCredits.toLocaleString('es-CL'),
              doc.balance.toLocaleString('es-CL'),
              doc.status
            ]);
          });
        });
      });
      generateSIIReportPDF(title, columns, data);
    } else {
      if (auxiliaryGroups.length === 0) {
        alert('No hay movimientos en el Análisis de Auxiliares por RUT para generar el informe.');
        return;
      }
      const title = `Analisis_Auxiliares_Por_RUT_${company.name}_${selectedCategory}`;
      const columns = ['RUT', 'Auxiliar', 'Cuenta', 'Doc', 'N°', 'Fecha', 'Débitos ($)', 'Créditos ($)', 'Saldo ($)', 'Estado'];
      const data: any[][] = [];

      auxiliaryGroups.forEach(aux => {
        aux.accounts.forEach(acc => {
          acc.documents.forEach(doc => {
            data.push([
              aux.rut,
              aux.name,
              `[${acc.accountCode}]`,
              formatAuxDocType(doc.docType),
              doc.docNumber,
              doc.issueDate,
              doc.totalDebits.toLocaleString('es-CL'),
              doc.totalCredits.toLocaleString('es-CL'),
              doc.balance.toLocaleString('es-CL'),
              doc.status
            ]);
          });
        });
      });
      generateSIIReportPDF(title, columns, data);
    }
  };

  return (
    <div className="space-y-5">
      {/* CABECERA & SELECTOR DE MODO DE ANÁLISIS (POR CUENTA VS POR RUT) */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-tr from-indigo-600 to-sky-500 text-white rounded-xl shadow-sm">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-lg leading-tight flex items-center gap-2">
                <span>Análisis de Cuentas Corrientes y Auxiliares</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono">
                  Multi-Perspectiva
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Control de saldos por cuenta contable (Clientes, Proveedores, Personal 1104, Deudores y Acreedores Varios) y desglose integral por RUT.
              </p>
            </div>
          </div>
        </div>

        {/* SELECTOR DE MODO (POR CUENTA VS POR RUT) & ACCIONES */}
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          {/* Pestañas de Modo */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold w-full sm:w-auto">
            <button
              onClick={() => setViewMode('byAccount')}
              className={`flex-1 sm:flex-none px-3.5 py-2 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                viewMode === 'byAccount'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>1. Análisis por Cuenta Contable</span>
            </button>
            <button
              onClick={() => setViewMode('byRut')}
              className={`flex-1 sm:flex-none px-3.5 py-2 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                viewMode === 'byRut'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>2. Análisis por RUT / Auxiliar</span>
            </button>
          </div>

          <button
            onClick={() => setShowCorrectorModal(true)}
            className="px-3 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-blue-500/20 cursor-pointer animate-pulse hover:animate-none"
            title="Auto-corregir egresos con 'Documento Interno' en cuenta 2102001 y cancelar facturas correspondientes"
          >
            <Wrench className="w-3.5 h-3.5 text-blue-100" />
            <span>Corregir Egresos (2102001)</span>
          </button>

          <button
            onClick={handleDownloadSIIReport}
            className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
            title="Generar informe PDF oficial"
          >
            <FileText className="w-3.5 h-3.5 text-slate-300" />
            <span>PDF</span>
          </button>
          
          <button
            onClick={handleExportCSV}
            className="px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
            title="Exportar registros a formato Excel / CSV"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-200" />
            <span>Excel</span>
          </button>
        </div>
      </div>

      {/* SELECTOR RÁPIDO DE CATEGORÍAS (CLIENTES, PROVEEDORES, PERSONAL, DEUDORES VARIOS, ACREEDORES VARIOS) */}
      <div className="bg-slate-900 text-white p-3 rounded-2xl shadow-sm flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300 px-2">
          <Filter className="w-3.5 h-3.5 text-indigo-400" />
          <span>Clasificación Contable:</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
          <button
            onClick={() => { setSelectedCategory('TODAS'); setSelectedAccountId('todos'); }}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              selectedCategory === 'TODAS'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
            }`}
          >
            🌐 Todas ({accounts.filter(a => isAuxiliaryAccount(a.code, a.name, a)).length})
          </button>

          <button
            onClick={() => { setSelectedCategory('DEUDOR'); setSelectedAccountId('todos'); }}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              selectedCategory === 'DEUDOR'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-800 text-blue-300 hover:bg-slate-700 hover:text-white'
            }`}
            title="Clientes del giro comercial (Cuentas 1102xxx, 1103xxx)"
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>🏢 Clientes (Giro)</span>
          </button>

          <button
            onClick={() => { setSelectedCategory('ACREEDOR'); setSelectedAccountId('todos'); }}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              selectedCategory === 'ACREEDOR'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-slate-800 text-amber-300 hover:bg-slate-700 hover:text-white'
            }`}
            title="Proveedores del giro comercial (Cuentas 2101xxx)"
          >
            <Briefcase className="w-3.5 h-3.5" />
            <span>🏭 Proveedores (Giro)</span>
          </button>

          <button
            onClick={() => { setSelectedCategory('PERSONAL'); setSelectedAccountId('todos'); }}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              selectedCategory === 'PERSONAL'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-800 text-emerald-300 hover:bg-slate-700 hover:text-white'
            }`}
            title="Personal y Trabajadores (Anticipos 1104009, Préstamos 1104003, Sueldos 2102xxx)"
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>👥 Personal / Trabajadores</span>
          </button>

          <button
            onClick={() => { setSelectedCategory('DEUDOR_VARIO'); setSelectedAccountId('todos'); }}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              selectedCategory === 'DEUDOR_VARIO'
                ? 'bg-cyan-600 text-white shadow-xs'
                : 'bg-slate-800 text-cyan-300 hover:bg-slate-700 hover:text-white'
            }`}
            title="Deudores varios no relacionados con el giro (Cuentas 1105xxx, préstamos a terceros)"
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>🔄 Deudores Varios</span>
          </button>

          <button
            onClick={() => { setSelectedCategory('ACREEDOR_VARIO'); setSelectedAccountId('todos'); }}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              selectedCategory === 'ACREEDOR_VARIO'
                ? 'bg-orange-600 text-white shadow-xs'
                : 'bg-slate-800 text-orange-300 hover:bg-slate-700 hover:text-white'
            }`}
            title="Acreedores varios (Bancos, Instituciones Previsionales, Socios, Accionistas 2104xxx, 2105xxx)"
          >
            <Landmark className="w-3.5 h-3.5" />
            <span>🏦 Acreedores Varios (Socios / Bancos)</span>
          </button>
        </div>
      </div>

      {/* KPI RESUMEN DE MÉTRICAS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            {viewMode === 'byAccount' ? 'Cuentas con Movimiento' : 'Auxiliares con Movimiento'}
          </span>
          <p className="text-xl font-mono font-black text-slate-900">
            {viewMode === 'byAccount' ? summaryMetrics.totalAccountsCount : summaryMetrics.totalAuxiliariesCount}
          </p>
          <span className="text-[10px] text-slate-400">
            {summaryMetrics.totalDocsCount} documentos registrados en {summaryMetrics.totalAccountsCount} cuentas
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Total Débitos (Cargos / Debe)</span>
          <p className="text-xl font-mono font-black text-slate-800">${summaryMetrics.totalDebits.toLocaleString('es-CL')}</p>
          <span className="text-[10px] text-slate-400">Total acumulado en el Debe</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Total Créditos (Abonos / Haber)</span>
          <p className="text-xl font-mono font-black text-slate-800">${summaryMetrics.totalCredits.toLocaleString('es-CL')}</p>
          <span className="text-[10px] text-slate-400">Total acumulado en el Haber</span>
        </div>

        <div className="bg-indigo-900 text-white p-4 rounded-xl shadow-md space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-200">Saldo Pendiente Neto Total</span>
          <p className="text-xl font-mono font-black text-emerald-300">${summaryMetrics.totalPendingBalance.toLocaleString('es-CL')}</p>
          <span className="text-[10px] text-indigo-300">
            {balanceFilter === 'soloPendientes' ? 'Mostrando solo registros con saldo pendiente' : 'Histórico completo (incluye saldados $0)'}
          </span>
        </div>
      </div>

      {/* FILTROS PARAMETRIZABLES */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-100 pb-3">
          <h4 className="text-xs font-black uppercase text-slate-800 flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-indigo-600" />
            <span>Filtros y Búsqueda Avanzada</span>
          </h4>

          {/* Selector de Saldo: Solo Pendientes vs Todos */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
            <button
              onClick={() => setBalanceFilter('soloPendientes')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                balanceFilter === 'soloPendientes'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>📌</span>
              <span>Solo con Saldo Pendiente (Ocultar $0)</span>
            </button>
            <button
              onClick={() => setBalanceFilter('todos')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                balanceFilter === 'todos'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>📋</span>
              <span>Todos los Movimientos (Incluye $0)</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          {/* Cuenta Contable */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Cuenta Contable:
            </label>
            <select
              value={selectedAccountId}
              onChange={e => setSelectedAccountId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-mono text-slate-900 focus:ring-2 focus:ring-indigo-500 font-medium"
            >
              <option value="todos">Todas las Cuentas Auxiliares ({availableAuxiliaryAccounts.length})</option>
              {availableAuxiliaryAccounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                  [{acc.code}] {acc.name}
                </option>
              ))}
            </select>
          </div>

          {/* Buscar por RUT o Nombre */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">Buscar por Auxiliar (RUT o Nombre):</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Ej. 77.044.205-2, Mundo Call, Juan Pérez..."
                value={rutSearch}
                onChange={e => setRutSearch(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 pr-8 text-slate-900 focus:ring-2 focus:ring-indigo-500 font-medium"
              />
              {rutSearch && (
                <button
                  type="button"
                  onClick={() => setRutSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full hover:bg-slate-200 transition-colors"
                  title="Limpiar búsqueda"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Modo de Fecha */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">Filtro de Fecha:</label>
            <div className="grid grid-cols-2 gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setDateFilterMode('corte')}
                className={`py-1.5 px-2 rounded-md font-bold text-[11px] cursor-pointer ${
                  dateFilterMode === 'corte' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600'
                }`}
              >
                A Fecha de Corte
              </button>
              <button
                type="button"
                onClick={() => setDateFilterMode('rango')}
                className={`py-1.5 px-2 rounded-md font-bold text-[11px] cursor-pointer ${
                  dateFilterMode === 'rango' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600'
                }`}
              >
                Por Rango
              </button>
            </div>
          </div>

          {/* Input de Fecha según modo */}
          {dateFilterMode === 'corte' ? (
            <div>
              <label className="block font-bold text-slate-700 mb-1">Fecha de Corte:</label>
              <input
                type="date"
                value={cutoffDate}
                onChange={e => setCutoffDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-mono font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Desde:</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-1.5 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Hasta:</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-1.5 font-mono text-xs"
                />
              </div>
            </div>
          )}

          {/* Tipo de Documento */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">Tipo de Documento:</label>
            <select
              value={docTypeFilter}
              onChange={e => setDocTypeFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-900 focus:ring-2 focus:ring-indigo-500 font-medium"
            >
              <option value="todos">Todos los Tipos de Documento</option>
              <option value="33">33 (Factura Electrónica)</option>
              <option value="34">34 (Factura Exenta)</option>
              <option value="61">61 (Nota de Crédito)</option>
              <option value="56">56 (Nota de Débito)</option>
              <option value="39">39 (Boleta Electrónica)</option>
              <option value="46">46 (Factura de Compra)</option>
              <option value="BHE">BHE (Boleta de Honorarios)</option>
              <option value="9999">Documento Interno / Otros (9999)</option>
              <option value="NOMINA">NÓMINA (Remuneraciones / Anticipos)</option>
            </select>
          </div>

          {/* Folio / N° Documento */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">Número de Folio / Documento:</label>
            <input
              type="text"
              placeholder="Ej. 13879759, 22278309, 105..."
              value={docNumberSearch}
              onChange={e => setDocNumberSearch(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-mono text-slate-900 focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* VISTA 1: ANÁLISIS POR CUENTA CONTABLE (DESGLOSANDO POR CADA RUT)          */}
      {/* ========================================================================= */}
      {viewMode === 'byAccount' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap justify-between items-center gap-2">
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-black uppercase text-slate-800 flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-indigo-600" />
                <span>Análisis por Cuenta Contable ({accountGroups.length} cuentas con movimientos)</span>
              </h4>
              <span className="text-[11px] text-slate-500">
                • {balanceFilter === 'soloPendientes' ? 'Mostrando RUTs con saldo pendiente' : 'Histórico completo'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleToggleExpandAll}
                className="text-xs font-bold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg border border-indigo-200 transition-colors cursor-pointer"
              >
                {accountGroups.every(g => expandedKeys[g.accountCode]) ? '🔼 Contraer Todas' : '🔽 Desplegar Todas las Cuentas'}
              </button>
            </div>
          </div>

          <div className="divide-y divide-slate-200">
            {accountGroups.length === 0 ? (
              <div className="p-12 text-center text-slate-500 space-y-2">
                <p className="font-semibold text-sm">No se encontraron movimientos para los filtros seleccionados.</p>
                <p className="text-xs text-slate-400">
                  {balanceFilter === 'soloPendientes' 
                    ? 'Prueba cambiando a "Todos los Movimientos" para revisar registros con saldo $0.'
                    : 'Verifica los filtros de cuenta contable, fechas o texto de búsqueda.'}
                </p>
              </div>
            ) : (
              accountGroups.map((accGroup) => {
                const isAccExpanded = expandedKeys[accGroup.accountCode] ?? true;
                const isAccSaldada = accGroup.balance === 0;

                return (
                  <div key={accGroup.accountCode} className="bg-white transition-colors">
                    {/* CABECERA DE LA CUENTA CONTABLE */}
                    <div
                      onClick={() => setExpandedKeys({ ...expandedKeys, [accGroup.accountCode]: !isAccExpanded })}
                      className="p-3.5 hover:bg-slate-50 cursor-pointer flex flex-wrap items-center justify-between gap-3 select-none bg-slate-50/40 border-b border-slate-100"
                    >
                      <div className="flex items-center gap-3 min-w-[320px]">
                        <span className="text-indigo-600 font-bold text-sm w-4 text-center">
                          {isAccExpanded ? '▼' : '▶'}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-black text-indigo-900 text-xs bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-200">
                              [{accGroup.accountCode}]
                            </span>
                            <span className="font-black text-slate-900 text-sm">
                              {accGroup.accountName}
                            </span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              accGroup.accountCategory === 'PERSONAL'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : accGroup.accountCategory === 'DEUDOR'
                                ? 'bg-blue-50 text-blue-800 border-blue-200'
                                : accGroup.accountCategory === 'ACREEDOR'
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : accGroup.accountCategory === 'DEUDOR_VARIO'
                                ? 'bg-cyan-50 text-cyan-800 border-cyan-200'
                                : 'bg-orange-50 text-orange-800 border-orange-200'
                            }`}>
                              {accGroup.accountCategory === 'PERSONAL' && '👥 Personal / Trabajadores'}
                              {accGroup.accountCategory === 'DEUDOR' && '🏢 Clientes (Giro)'}
                              {accGroup.accountCategory === 'ACREEDOR' && '🏭 Proveedores (Giro)'}
                              {accGroup.accountCategory === 'DEUDOR_VARIO' && '🔄 Deudores Varios'}
                              {accGroup.accountCategory === 'ACREEDOR_VARIO' && '🏦 Acreedores Varios'}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-2">
                            <span>{accGroup.totalRutsCount} {accGroup.totalRutsCount === 1 ? 'auxiliar / RUT' : 'auxiliares / RUTs'}</span>
                            <span>•</span>
                            <span className={accGroup.pendingRutsCount > 0 ? 'text-amber-700 font-semibold' : 'text-emerald-700 font-semibold'}>
                              {accGroup.pendingRutsCount} con saldo pendiente
                            </span>
                            <span>•</span>
                            <span>Naturaleza: {accGroup.isActivo ? 'Activo (Deudor)' : 'Pasivo (Acreedor)'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-6 text-xs font-mono">
                        <div className="text-right">
                          <span className="text-[10px] block font-sans text-slate-400 font-semibold uppercase">Total Débitos</span>
                          <span className="font-bold text-slate-800">${accGroup.totalDebits.toLocaleString('es-CL')}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] block font-sans text-slate-400 font-semibold uppercase">Total Créditos</span>
                          <span className="font-bold text-slate-800">${accGroup.totalCredits.toLocaleString('es-CL')}</span>
                        </div>
                        <div className="text-right min-w-[120px]">
                          <span className="text-[10px] block font-sans text-slate-400 font-semibold uppercase">Saldo de la Cuenta</span>
                          <span className={`font-black text-sm ${isAccSaldada ? 'text-slate-400' : 'text-indigo-700'}`}>
                            ${accGroup.balance.toLocaleString('es-CL')}
                          </span>
                        </div>
                        <div>
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                            isAccSaldada 
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}>
                            {isAccSaldada ? '✓ Saldada ($0)' : 'Saldo Pendiente'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* LISTA DE RUTs DENTRO DE LA CUENTA */}
                    {isAccExpanded && (
                      <div className="p-4 bg-slate-50/50 space-y-3">
                        {accGroup.ruts.map((rutItem) => {
                          const rutSubKey = `${accGroup.accountCode}__${rutItem.cleanRut}`;
                          const isRutExpanded = expandedSubKeys[rutSubKey] ?? true;
                          const isRutSaldado = rutItem.balance === 0;

                          return (
                            <div key={rutSubKey} className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
                              {/* Fila del RUT */}
                              <div
                                onClick={() => setExpandedSubKeys({ ...expandedSubKeys, [rutSubKey]: !isRutExpanded })}
                                className="p-3 hover:bg-slate-50 cursor-pointer flex flex-wrap items-center justify-between gap-2 select-none border-b border-slate-100"
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className="text-indigo-600 font-bold text-xs w-3.5 text-center">
                                    {isRutExpanded ? '▼' : '▶'}
                                  </span>
                                  <span className="font-mono font-bold text-slate-900 text-xs bg-slate-100 px-2 py-0.5 rounded border border-slate-300">
                                    {rutItem.rut}
                                  </span>
                                  <span className="font-bold text-slate-900 text-xs">
                                    {rutItem.name}
                                  </span>
                                  <span className="text-[10px] text-slate-400">
                                    ({rutItem.documents.length} {rutItem.documents.length === 1 ? 'doc' : 'docs'})
                                  </span>
                                </div>

                                <div className="flex items-center gap-5 text-xs font-mono">
                                  <div className="text-right">
                                    <span className="text-[9px] block font-sans text-slate-400 uppercase">Débito</span>
                                    <span className="font-semibold text-slate-700">${rutItem.totalDebits.toLocaleString('es-CL')}</span>
                                  </div>
                                  <div className="text-right">
                                    <span className="text-[9px] block font-sans text-slate-400 uppercase">Crédito</span>
                                    <span className="font-semibold text-slate-700">${rutItem.totalCredits.toLocaleString('es-CL')}</span>
                                  </div>
                                  <div className="text-right min-w-[90px]">
                                    <span className="text-[9px] block font-sans text-slate-400 uppercase">Saldo RUT</span>
                                    <span className={`font-bold ${isRutSaldado ? 'text-slate-400' : 'text-indigo-700'}`}>
                                      ${rutItem.balance.toLocaleString('es-CL')}
                                    </span>
                                  </div>
                                  <div>
                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                      isRutSaldado 
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                                    }`}>
                                      {isRutSaldado ? 'Saldado' : 'Pendiente'}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Documentos del RUT en esta cuenta */}
                              {isRutExpanded && (
                                <div className="p-3 bg-slate-50/60">
                                  <table className="w-full text-left text-xs font-mono">
                                    <thead className="bg-slate-100/80 text-slate-600 font-sans text-[10px] border-b border-slate-200">
                                      <tr>
                                        <th className="py-2 px-2.5 w-6"></th>
                                        <th className="py-2 px-2.5">Tipo Doc</th>
                                        <th className="py-2 px-2.5">Folio / N° Doc</th>
                                        <th className="py-2 px-2.5">Fecha</th>
                                        <th className="py-2 px-2.5 text-right">Débito ($)</th>
                                        <th className="py-2 px-2.5 text-right">Crédito ($)</th>
                                        <th className="py-2 px-2.5 text-right">Saldo ($)</th>
                                        <th className="py-2 px-2.5 text-center">Estado</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 text-[11px]">
                                      {rutItem.documents.map((doc) => {
                                        const isDocExpanded = expandedDocs[doc.id] ?? false;
                                        const isDocSaldado = doc.balance === 0;

                                        return (
                                          <React.Fragment key={doc.id}>
                                            <tr className="hover:bg-slate-50 transition-colors">
                                              <td className="py-2 px-2.5 text-center">
                                                {doc.movements.length > 0 && (
                                                  <button
                                                    type="button"
                                                    onClick={() => setExpandedDocs({ ...expandedDocs, [doc.id]: !isDocExpanded })}
                                                    className="text-indigo-600 hover:text-indigo-900 font-bold text-xs cursor-pointer"
                                                  >
                                                    {isDocExpanded ? '▼' : '▶'}
                                                  </button>
                                                )}
                                              </td>
                                              <td className="py-2 px-2.5 font-sans font-medium">
                                                <span className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded border border-slate-200 text-[10px] font-bold">
                                                  {formatAuxDocType(doc.docType)}
                                                </span>
                                              </td>
                                              <td className="py-2 px-2.5 font-bold text-indigo-700">
                                                N° {doc.docNumber}
                                              </td>
                                              <td className="py-2 px-2.5 text-slate-600">{doc.issueDate}</td>
                                              <td className="py-2 px-2.5 text-right font-bold text-slate-800">
                                                ${doc.totalDebits.toLocaleString('es-CL')}
                                              </td>
                                              <td className="py-2 px-2.5 text-right font-bold text-slate-800">
                                                ${doc.totalCredits.toLocaleString('es-CL')}
                                              </td>
                                              <td className={`py-2 px-2.5 text-right font-black ${isDocSaldado ? 'text-slate-400' : 'text-indigo-700'}`}>
                                                ${doc.balance.toLocaleString('es-CL')}
                                              </td>
                                              <td className="py-2 px-2.5 text-center">
                                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                                  isDocSaldado 
                                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                                                    : doc.status === 'Parcial'
                                                    ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                                    : 'bg-amber-100 text-amber-800 border border-amber-200'
                                                }`}>
                                                  {isDocSaldado ? 'Saldado ($0)' : doc.status}
                                                </span>
                                              </td>
                                            </tr>

                                            {/* Sub-tabla comprobantes */}
                                            {isDocExpanded && doc.movements.length > 0 && (
                                              <tr className="bg-indigo-50/30">
                                                <td colSpan={8} className="p-3">
                                                  <div className="bg-white p-2.5 rounded-lg border border-indigo-100 shadow-2xs space-y-1.5">
                                                    <div className="text-[10px] font-bold text-slate-700 flex justify-between items-center">
                                                      <span>📋 Asientos y Comprobantes Contables:</span>
                                                      <span className="text-slate-500 font-normal">
                                                        Debe: ${doc.totalDebits.toLocaleString('es-CL')} | Haber: ${doc.totalCredits.toLocaleString('es-CL')}
                                                      </span>
                                                    </div>
                                                    <table className="w-full text-left text-[10px] border-collapse">
                                                      <thead className="bg-slate-100 text-slate-600 font-sans border-b">
                                                        <tr>
                                                          <th className="p-1.5">Fecha</th>
                                                          <th className="p-1.5">Comp. N°</th>
                                                          <th className="p-1.5">Tipo</th>
                                                          <th className="p-1.5">Glosa</th>
                                                          <th className="p-1.5 text-right">Debe ($)</th>
                                                          <th className="p-1.5 text-right">Haber ($)</th>
                                                        </tr>
                                                      </thead>
                                                      <tbody className="divide-y divide-slate-100">
                                                        {doc.movements.map((m, mIdx) => (
                                                          <tr key={mIdx} className="hover:bg-slate-50">
                                                            <td className="p-1.5 font-bold text-slate-800">{m.date}</td>
                                                            <td className="p-1.5">
                                                              <button
                                                                type="button"
                                                                onClick={() => onOpenVoucher?.(m.voucherId || m.voucherNumber)}
                                                                className="inline-flex items-center gap-1 font-bold text-xs text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 hover:border-indigo-300 px-2 py-0.5 rounded-md border border-indigo-200 transition-all cursor-pointer shadow-2xs group"
                                                                title="Abrir comprobante para consultar, modificar, anular o eliminar sin salir de la vista"
                                                              >
                                                                <span>N° {m.voucherNumber}</span>
                                                                <ExternalLink className="w-3 h-3 text-indigo-500 group-hover:text-indigo-800 transition-transform group-hover:scale-110" />
                                                              </button>
                                                            </td>
                                                            <td className="p-1.5 text-slate-600">{m.voucherType}</td>
                                                            <td className="p-1.5 text-slate-700 font-sans">{m.gloss}</td>
                                                            <td className="p-1.5 text-right font-bold text-slate-800">
                                                              {m.debit > 0 ? `$${m.debit.toLocaleString('es-CL')}` : '-'}
                                                            </td>
                                                            <td className="p-1.5 text-right font-bold text-emerald-700">
                                                              {m.credit > 0 ? `$${m.credit.toLocaleString('es-CL')}` : '-'}
                                                            </td>
                                                          </tr>
                                                        ))}
                                                      </tbody>
                                                    </table>
                                                  </div>
                                                </td>
                                              </tr>
                                            )}
                                          </React.Fragment>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VISTA 2: ANÁLISIS POR RUT / AUXILIAR (DESGLOSANDO POR CADA CUENTA)        */}
      {/* ========================================================================= */}
      {viewMode === 'byRut' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap justify-between items-center gap-2">
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-black uppercase text-slate-800 flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-600" />
                <span>Análisis por RUT / Auxiliar ({auxiliaryGroups.length} auxiliares registrados)</span>
              </h4>
              <span className="text-[11px] text-slate-500">
                • {balanceFilter === 'soloPendientes' ? 'Mostrando auxiliares con saldo pendiente' : 'Histórico completo'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleToggleExpandAll}
                className="text-xs font-bold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg border border-indigo-200 transition-colors cursor-pointer"
              >
                {auxiliaryGroups.every(g => expandedKeys[g.cleanRut]) ? '🔼 Contraer Todos' : '🔽 Desplegar Todos los Auxiliares'}
              </button>
            </div>
          </div>

          <div className="divide-y divide-slate-200">
            {auxiliaryGroups.length === 0 ? (
              <div className="p-12 text-center text-slate-500 space-y-2">
                <p className="font-semibold text-sm">No se encontraron movimientos para los filtros seleccionados.</p>
                <p className="text-xs text-slate-400">
                  Prueba cambiando los filtros de clasificación o texto de búsqueda.
                </p>
              </div>
            ) : (
              auxiliaryGroups.map((aux) => {
                const isAuxExpanded = expandedKeys[aux.cleanRut] ?? true;
                const isSaldado = aux.balance === 0;

                return (
                  <div key={aux.cleanRut} className="bg-white transition-colors">
                    {/* Fila Cabecera del Auxiliar (RUT) */}
                    <div
                      onClick={() => setExpandedKeys({ ...expandedKeys, [aux.cleanRut]: !isAuxExpanded })}
                      className="p-3.5 hover:bg-slate-50 cursor-pointer flex flex-wrap items-center justify-between gap-3 select-none bg-slate-50/30 border-b border-slate-100"
                    >
                      <div className="flex items-center gap-3 min-w-[320px]">
                        <span className="text-indigo-600 font-bold text-sm w-4 text-center">
                          {isAuxExpanded ? '▼' : '▶'}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-900 text-xs bg-slate-100 px-2 py-0.5 rounded border border-slate-300">
                              {aux.rut}
                            </span>
                            <span className="font-bold text-slate-900 text-sm">
                              {aux.name}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                              Rol: {aux.role}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-2">
                            <span>{aux.accounts.length} {aux.accounts.length === 1 ? 'cuenta contable vinculada' : 'cuentas contables vinculadas'}</span>
                            <span>•</span>
                            <span>{aux.documents.length} {aux.documents.length === 1 ? 'documento' : 'documentos'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-6 text-xs font-mono">
                        <div className="text-right">
                          <span className="text-[10px] block font-sans text-slate-400 font-semibold uppercase">Total Débitos</span>
                          <span className="font-bold text-slate-800">${aux.totalDebits.toLocaleString('es-CL')}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] block font-sans text-slate-400 font-semibold uppercase">Total Créditos</span>
                          <span className="font-bold text-slate-800">${aux.totalCredits.toLocaleString('es-CL')}</span>
                        </div>
                        <div className="text-right min-w-[120px]">
                          <span className="text-[10px] block font-sans text-slate-400 font-semibold uppercase">Saldo Neto Consolidado</span>
                          <span className={`font-black text-sm ${isSaldado ? 'text-slate-400' : 'text-indigo-700'}`}>
                            ${aux.balance.toLocaleString('es-CL')}
                          </span>
                        </div>
                        <div>
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                            isSaldado 
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}>
                            {isSaldado ? '✓ Al Día ($0)' : 'Saldo Pendiente'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* CUENTAS CONTABLES QUE TIENEN REGISTROS CON ESTE RUT */}
                    {isAuxExpanded && (
                      <div className="p-4 bg-slate-50/50 space-y-3">
                        {aux.accounts.map((accItem) => {
                          const accSubKey = `${aux.cleanRut}__${accItem.accountCode}`;
                          const isAccSubExpanded = expandedSubKeys[accSubKey] ?? true;
                          const isAccItemSaldado = accItem.balance === 0;

                          return (
                            <div key={accSubKey} className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
                              {/* Cabecera de Cuenta del Auxiliar */}
                              <div
                                onClick={() => setExpandedSubKeys({ ...expandedSubKeys, [accSubKey]: !isAccSubExpanded })}
                                className="p-3 hover:bg-slate-50 cursor-pointer flex flex-wrap items-center justify-between gap-2 select-none border-b border-slate-100"
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className="text-indigo-600 font-bold text-xs w-3.5 text-center">
                                    {isAccSubExpanded ? '▼' : '▶'}
                                  </span>
                                  <span className="font-mono font-bold text-indigo-900 text-xs bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                                    [{accItem.accountCode}]
                                  </span>
                                  <span className="font-bold text-slate-900 text-xs">
                                    {accItem.accountName}
                                  </span>
                                  <span className="text-[10px] text-slate-400">
                                    ({accItem.documents.length} {accItem.documents.length === 1 ? 'doc' : 'docs'})
                                  </span>
                                </div>

                                <div className="flex items-center gap-5 text-xs font-mono">
                                  <div className="text-right">
                                    <span className="text-[9px] block font-sans text-slate-400 uppercase">Débito</span>
                                    <span className="font-semibold text-slate-700">${accItem.totalDebits.toLocaleString('es-CL')}</span>
                                  </div>
                                  <div className="text-right">
                                    <span className="text-[9px] block font-sans text-slate-400 uppercase">Crédito</span>
                                    <span className="font-semibold text-slate-700">${accItem.totalCredits.toLocaleString('es-CL')}</span>
                                  </div>
                                  <div className="text-right min-w-[90px]">
                                    <span className="text-[9px] block font-sans text-slate-400 uppercase">Saldo Cuenta</span>
                                    <span className={`font-bold ${isAccItemSaldado ? 'text-slate-400' : 'text-indigo-700'}`}>
                                      ${accItem.balance.toLocaleString('es-CL')}
                                    </span>
                                  </div>
                                  <div>
                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                      isAccItemSaldado 
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                                    }`}>
                                      {isAccItemSaldado ? 'Saldada' : 'Pendiente'}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Documentos dentro de la cuenta del Auxiliar */}
                              {isAccSubExpanded && (
                                <div className="p-3 bg-slate-50/60">
                                  <table className="w-full text-left text-xs font-mono">
                                    <thead className="bg-slate-100/80 text-slate-600 font-sans text-[10px] border-b border-slate-200">
                                      <tr>
                                        <th className="py-2 px-2.5 w-6"></th>
                                        <th className="py-2 px-2.5">Tipo Doc</th>
                                        <th className="py-2 px-2.5">Folio / N° Doc</th>
                                        <th className="py-2 px-2.5">Fecha</th>
                                        <th className="py-2 px-2.5 text-right">Débito ($)</th>
                                        <th className="py-2 px-2.5 text-right">Crédito ($)</th>
                                        <th className="py-2 px-2.5 text-right">Saldo ($)</th>
                                        <th className="py-2 px-2.5 text-center">Estado</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 text-[11px]">
                                      {accItem.documents.map((doc) => {
                                        const isDocExpanded = expandedDocs[doc.id] ?? false;
                                        const isDocSaldado = doc.balance === 0;

                                        return (
                                          <React.Fragment key={doc.id}>
                                            <tr className="hover:bg-slate-50 transition-colors">
                                              <td className="py-2 px-2.5 text-center">
                                                {doc.movements.length > 0 && (
                                                  <button
                                                    type="button"
                                                    onClick={() => setExpandedDocs({ ...expandedDocs, [doc.id]: !isDocExpanded })}
                                                    className="text-indigo-600 hover:text-indigo-900 font-bold text-xs cursor-pointer"
                                                  >
                                                    {isDocExpanded ? '▼' : '▶'}
                                                  </button>
                                                )}
                                              </td>
                                              <td className="py-2 px-2.5 font-sans font-medium">
                                                <span className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded border border-slate-200 text-[10px] font-bold">
                                                  {formatAuxDocType(doc.docType)}
                                                </span>
                                              </td>
                                              <td className="py-2 px-2.5 font-bold text-indigo-700">
                                                N° {doc.docNumber}
                                              </td>
                                              <td className="py-2 px-2.5 text-slate-600">{doc.issueDate}</td>
                                              <td className="py-2 px-2.5 text-right font-bold text-slate-800">
                                                ${doc.totalDebits.toLocaleString('es-CL')}
                                              </td>
                                              <td className="py-2 px-2.5 text-right font-bold text-slate-800">
                                                ${doc.totalCredits.toLocaleString('es-CL')}
                                              </td>
                                              <td className={`py-2 px-2.5 text-right font-black ${isDocSaldado ? 'text-slate-400' : 'text-indigo-700'}`}>
                                                ${doc.balance.toLocaleString('es-CL')}
                                              </td>
                                              <td className="py-2 px-2.5 text-center">
                                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                                  isDocSaldado 
                                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                                                    : doc.status === 'Parcial'
                                                    ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                                    : 'bg-amber-100 text-amber-800 border border-amber-200'
                                                }`}>
                                                  {isDocSaldado ? 'Saldado ($0)' : doc.status}
                                                </span>
                                              </td>
                                            </tr>

                                            {/* Sub-tabla comprobantes */}
                                            {isDocExpanded && doc.movements.length > 0 && (
                                              <tr className="bg-indigo-50/30">
                                                <td colSpan={8} className="p-3">
                                                  <div className="bg-white p-2.5 rounded-lg border border-indigo-100 shadow-2xs space-y-1.5">
                                                    <div className="text-[10px] font-bold text-slate-700 flex justify-between items-center">
                                                      <span>📋 Asientos y Comprobantes Contables:</span>
                                                      <span className="text-slate-500 font-normal">
                                                        Debe: ${doc.totalDebits.toLocaleString('es-CL')} | Haber: ${doc.totalCredits.toLocaleString('es-CL')}
                                                      </span>
                                                    </div>
                                                    <table className="w-full text-left text-[10px] border-collapse">
                                                      <thead className="bg-slate-100 text-slate-600 font-sans border-b">
                                                        <tr>
                                                          <th className="p-1.5">Fecha</th>
                                                          <th className="p-1.5">Comp. N°</th>
                                                          <th className="p-1.5">Tipo</th>
                                                          <th className="p-1.5">Glosa</th>
                                                          <th className="p-1.5 text-right">Debe ($)</th>
                                                          <th className="p-1.5 text-right">Haber ($)</th>
                                                        </tr>
                                                      </thead>
                                                      <tbody className="divide-y divide-slate-100">
                                                        {doc.movements.map((m, mIdx) => (
                                                          <tr key={mIdx} className="hover:bg-slate-50">
                                                            <td className="p-1.5 font-bold text-slate-800">{m.date}</td>
                                                            <td className="p-1.5">
                                                              <button
                                                                type="button"
                                                                onClick={() => onOpenVoucher?.(m.voucherId || m.voucherNumber)}
                                                                className="inline-flex items-center gap-1 font-bold text-xs text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 hover:border-indigo-300 px-2 py-0.5 rounded-md border border-indigo-200 transition-all cursor-pointer shadow-2xs group"
                                                                title="Abrir comprobante para consultar, modificar, anular o eliminar sin salir de la vista"
                                                              >
                                                                <span>N° {m.voucherNumber}</span>
                                                                <ExternalLink className="w-3 h-3 text-indigo-500 group-hover:text-indigo-800 transition-transform group-hover:scale-110" />
                                                              </button>
                                                            </td>
                                                            <td className="p-1.5 text-slate-600">{m.voucherType}</td>
                                                            <td className="p-1.5 text-slate-700 font-sans">{m.gloss}</td>
                                                            <td className="p-1.5 text-right font-bold text-slate-800">
                                                              {m.debit > 0 ? `$${m.debit.toLocaleString('es-CL')}` : '-'}
                                                            </td>
                                                            <td className="p-1.5 text-right font-bold text-emerald-700">
                                                              {m.credit > 0 ? `$${m.credit.toLocaleString('es-CL')}` : '-'}
                                                            </td>
                                                          </tr>
                                                        ))}
                                                      </tbody>
                                                    </table>
                                                  </div>
                                                </td>
                                              </tr>
                                            )}
                                          </React.Fragment>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* MODAL AUTO-CORRECTOR DE EGRESOS & CANCELACIÓN FACTURAS 2102001 */}
      {showCorrectorModal && (
        <VoucherDocumentCorrectorModal
          isOpen={showCorrectorModal}
          onClose={() => setShowCorrectorModal(false)}
          studyId={studyId}
          companyId={company.id || ''}
          companyName={company.name}
          companyRut={company.rut}
          vouchers={vouchers}
          accounts={accounts}
          rcvDocuments={rcvDocuments}
          auxiliaries={auxiliaries}
          onSuccess={async () => {
            setShowCorrectorModal(false);
          }}
        />
      )}
    </div>
  );
}
