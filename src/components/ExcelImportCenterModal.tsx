import React, { useState } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, getDocs, addDoc, setDoc, doc } from 'firebase/firestore';
import { Company, ChartOfAccount, Auxiliary, Voucher, VoucherLine, FiscalPeriodYear } from '../types';
import { useProcess } from '../context/ProcessContext';
import { logAuditEvent } from '../utils/auditLogger';
import { sanitizeVoucherLines } from '../utils/voucherValidation';
import * as XLSX from 'xlsx';

// Normaliza fechas en formatos DD/MM/YYYY, D/M/YYYY, YYYY-MM-DD, DD-MM-YYYY, YYYY/MM/DD o serial de Excel a ISO YYYY-MM-DD
function normalizeDateToIso(val?: any): string {
  if (!val) return '';
  const cleaned = String(val).trim();
  if (!cleaned) return '';

  // ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return cleaned;
  }

  // YYYY/MM/DD o YYYY/M/D
  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(cleaned)) {
    const [y, m, d] = cleaned.split('/');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // D/M/YYYY o DD/MM/YYYY (Estándar chileno como 3/3/2026)
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(cleaned)) {
    const [d, m, y] = cleaned.split('/');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // D-M-YYYY o DD-MM-YYYY
  if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(cleaned)) {
    const [d, m, y] = cleaned.split('-');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Serial numérico de Excel (ej: 45000 a 48000 para años 2023-2031)
  const num = Number(cleaned);
  if (!isNaN(num) && num > 30000 && num < 70000) {
    try {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const targetDate = new Date(excelEpoch.getTime() + num * 86400000);
      return targetDate.toISOString().split('T')[0];
    } catch {
      // Ignorar fallback
    }
  }

  // Intento nativo de fecha si es parseable
  const parsed = new Date(cleaned);
  if (!isNaN(parsed.getTime()) && parsed.getFullYear() >= 2020 && parsed.getFullYear() <= 2035) {
    return parsed.toISOString().split('T')[0];
  }

  return '';
}

// Normaliza el período a formato YYYY-MM
function normalizePeriod(periodVal?: any, dateIso?: string): string {
  if (periodVal) {
    const p = String(periodVal).trim();
    // YYYY-MM
    if (/^\d{4}-\d{2}$/.test(p)) return p;
    // YYYYMM (ej: 202603)
    if (/^\d{6}$/.test(p)) return `${p.slice(0, 4)}-${p.slice(4, 6)}`;
    // MM/YYYY o M/YYYY (ej: 03/2026 o 3/2026)
    if (/^\d{1,2}\/\d{4}$/.test(p)) {
      const [m, y] = p.split('/');
      return `${y}-${m.padStart(2, '0')}`;
    }
    // MM-YYYY o M-YYYY
    if (/^\d{1,2}-\d{4}$/.test(p)) {
      const [m, y] = p.split('-');
      return `${y}-${m.padStart(2, '0')}`;
    }
  }

  // Derivar de fecha ISO si está disponible
  if (dateIso && /^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
    return dateIso.slice(0, 7);
  }

  return '';
}

// Limpia montos numéricos de strings con puntos de miles o comas decimales
function parseAmount(val?: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const cleaned = String(val).replace(/[$ ]/g, '').replace(/\./g, '').replace(',', '.').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// Detecta si una fila está totalmente vacía
function isRowBlank(row: any[]): boolean {
  if (!row || row.length === 0) return true;
  return row.every(cell => cell === null || cell === undefined || String(cell).trim() === '');
}

// Detecta si una fila corresponde a un encabezado de plantilla repetido
function isHeaderRow(row: any[]): boolean {
  if (!row || row.length === 0) return false;
  const first = String(row[0] || '').toLowerCase().trim();
  const second = String(row[1] || '').toLowerCase().trim();
  return (
    first.includes('numero') ||
    first.includes('comprobante') ||
    first.includes('n°') ||
    first.includes('num') ||
    first.includes('codigo') ||
    first.includes('rut') ||
    second.includes('fecha') ||
    second.includes('date') ||
    second.includes('nombre') ||
    second.includes('razon')
  );
}

// Parser CSV seguro que respeta comillas y múltiples delimitadores
function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' || char === "'") {
      if (inQuotes && line[i + 1] === char) {
        current += char;
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim().replace(/^["']|["']$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim().replace(/^["']|["']$/g, ''));
  return result;
}

function detectDelimiter(firstLine: string): string {
  const semiCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;
  if (semiCount >= commaCount && semiCount >= tabCount && semiCount > 0) return ';';
  if (commaCount > semiCount && commaCount >= tabCount) return ',';
  if (tabCount > 0) return '\t';
  return ';';
}

interface ExcelImportCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  studyId: string;
  company: Company;
  accounts: ChartOfAccount[];
  auxiliaries: Auxiliary[];
  fiscalYears?: FiscalPeriodYear[];
  onDataImported: () => void;
}

type ImportType = 'cuentas' | 'clientes' | 'proveedores' | 'comprobantes';

export default function ExcelImportCenterModal({
  isOpen,
  onClose,
  studyId,
  company,
  accounts,
  auxiliaries,
  fiscalYears = [],
  onDataImported
}: ExcelImportCenterModalProps) {
  const { withProcess } = useProcess();
  const [activeTab, setActiveTab] = useState<ImportType>('cuentas');
  const [fileContent, setFileContent] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [importReport, setImportReport] = useState<string | null>(null);

  if (!isOpen) return null;

  const companyRef = doc(db, 'studies', studyId, 'companies', company.id);

  // Template Download Functions (generates standard CSV with UTF-8 BOM that Excel opens directly)
  const downloadTemplate = (type: ImportType) => {
    let headers = '';
    let sampleRows = '';
    let filename = '';

    if (type === 'cuentas') {
      filename = `Plantilla_Plan_de_Cuentas_${company.rut}.csv`;
      headers = 'Codigo;Nombre;Tipo;CodigoPadre;RequiereCentroCosto;RequiereAuxiliarRUT;RequiereConciliacionBancaria;RequiereDocumento;Estado';
      sampleRows = [
        '1;ACTIVO;Activo;;NO;NO;NO;NO;Activo',
        '1.1;ACTIVO CIRCULANTE;Activo;1;NO;NO;NO;NO;Activo',
        '1.1.01;Disponible;Activo;1.1;NO;NO;SI;NO;Activo',
        '1.1.01.001;Caja Moneda Nacional;Activo;1.1.01;NO;NO;NO;NO;Activo',
        '1.1.01.002;Banco Estado Cta Cte;Activo;1.1.01;NO;NO;SI;NO;Activo',
        '1.1.02;Deudores por Ventas;Activo;1.1;NO;SI;NO;SI;Activo',
        '1.1.02.001;Clientes Nacionales;Activo;1.1.02;NO;SI;NO;SI;Activo',
        '2;PASIVO;Pasivo;;NO;NO;NO;NO;Activo',
        '2.1;PASIVO CIRCULANTE;Pasivo;2;NO;NO;NO;NO;Activo',
        '2.1.01;Cuentas por Pagar;Pasivo;2.1;NO;SI;NO;SI;Activo',
        '2.1.01.001;Proveedores Nacionales;Pasivo;2.1.01;NO;SI;NO;SI;Activo',
        '3;PATRIMONIO;Patrimonio;;NO;NO;NO;NO;Activo',
        '3.1.01;Capital Social;Patrimonio;3;NO;NO;NO;NO;Activo',
        '4;RESULTADO GANANCIA;Ingreso;;NO;NO;NO;NO;Activo',
        '4.1.01;Ventas del Giro;Ingreso;4;SI;NO;NO;NO;Activo',
        '5;RESULTADO PERDIDA;Gasto;;NO;NO;NO;NO;Activo',
        '5.1.01;Costo de Ventas;Gasto;5;SI;NO;NO;NO;Activo',
        '5.2.01;Gastos de Administracion;Gasto;5;SI;NO;NO;NO;Activo'
      ].join('\n');
    } else if (type === 'clientes') {
      filename = `Plantilla_Clientes_${company.rut}.csv`;
      headers = 'RUT;RazonSocial;GlosaSugerida;Rol;Email;Telefono;Banco;TipoCuenta;NumeroCuenta;CodigoCuentaCliente;CodigoCuentaIngreso;Estado';
      sampleRows = [
        '76123456-7;DISTRIBUIDORA Y COMERCIAL NORTE SPA;Ventas y Distribución Mayorista;Deudor;contacto@disnorte.cl;+56912345678;Banco de Chile;Corriente;1234567890;1.1.02.001;4.1.01;Activo',
        '77987654-3;AGRICOLA SAN ISIDRO LIMITADA;Venta de Productos Agrícolas;Deudor;pagos@sanisidro.cl;+56987654321;Banco Santander;Vista;987654321;1.1.02.001;4.1.01;Activo'
      ].join('\n');
    } else if (type === 'proveedores') {
      filename = `Plantilla_Proveedores_${company.rut}.csv`;
      headers = 'RUT;RazonSocial;GlosaSugerida;Rol;Email;Telefono;Banco;TipoCuenta;NumeroCuenta;CodigoCuentaProveedor;CodigoCuentaGasto;Estado';
      sampleRows = [
        '76543210-K;SERVICIOS INDUSTRIALES DEL SUR SPA;Servicios de Mantención y Soporte Técnico;Acreedor;facturas@serviciosur.cl;+56998765432;Banco Estado;Corriente;456789123;2.1.01.001;5.2.01;Activo',
        '79111222-3;IMPORTADORA GLOBAL CHILE S.A.;Adquisición de Insumos y Repuestos;Acreedor;cobranzas@globalchile.com;+56223334444;Banco BCI;Corriente;888777666;2.1.01.001;5.1.01;Activo'
      ].join('\n');
    } else if (type === 'comprobantes') {
      filename = `Plantilla_Comprobantes_Contables_${company.rut}.csv`;
      headers = 'NumeroComprobante;Fecha;Periodo;TipoComprobante;GlosaComprobante;CodigoCuenta;GlosaLinea;RUTAuxiliar;TipoDocumento;FolioDocumento;CentroCosto;Debe;Haber';
      sampleRows = [
        '1;2026-01-02;2026-01;Ingreso;Aporte inicial de capital social;1.1.01.002;Deposito bancario capital;;;;;10000000;0',
        '1;2026-01-02;2026-01;Ingreso;Aporte inicial de capital social;3.1.01;Suscripcion y pago capital social;;;;;0;10000000',
        '2;2026-01-15;2026-01;Egreso;Pago de arriendo oficina comercial;5.2.01;Arriendo mes enero;;;;ADM;850000;0',
        '2;2026-01-15;2026-01;Egreso;Pago de arriendo oficina comercial;1.1.01.002;Transferencia bancaria;;;;;0;850000'
      ].join('\n');
    }

    const csvContent = '\uFEFF' + headers + '\n' + sampleRows;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Handle File Upload and Preview
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setImportReport(null);

    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');

    if (isExcel) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const data = new Uint8Array(evt.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          // Genera CSV delimitado con punto y coma para procesar
          const csv = XLSX.utils.sheet_to_csv(worksheet, { FS: ';' });
          setFileContent(csv);
          parsePreview(csv, activeTab);
        } catch (err: any) {
          console.error('Error al leer archivo binario Excel:', err);
          alert('No se pudo procesar el archivo Excel seleccionado. Verifique que no esté protegido o dañado.');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = (evt.target?.result as string) || '';
        setFileContent(text);
        parsePreview(text, activeTab);
      };
      reader.readAsText(file, 'UTF-8');
    }
  };

  const parsePreview = (rawCsv: string, type: ImportType) => {
    const lines = rawCsv
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0);

    if (lines.length <= 1) {
      setPreviewData([]);
      return;
    }

    const delimiter = detectDelimiter(lines[0]);
    const parsedRows: string[][] = [];
    for (let i = 1; i < lines.length; i++) {
      const row = parseCsvLine(lines[i], delimiter);
      if (isRowBlank(row)) continue;
      if (isHeaderRow(row)) continue;
      parsedRows.push(row);
      if (parsedRows.length >= 10) break;
    }

    setPreviewData(parsedRows);
  };

  // Perform Real Batch Import to Firestore
  const handleExecuteImport = async () => {
    if (!fileContent) {
      alert('Por favor seleccione o cargue un archivo primero.');
      return;
    }

    const lines = fileContent
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0);

    if (lines.length <= 1) {
      alert('El archivo no contiene filas de datos.');
      return;
    }

    const delimiter = detectDelimiter(lines[0]);
    const rawRows = lines.slice(1).map(line => parseCsvLine(line, delimiter));
    const rows = rawRows.filter(r => !isRowBlank(r) && !isHeaderRow(r));

    if (rows.length === 0) {
      alert('El archivo no contiene filas de datos válidas para procesar.');
      return;
    }

    setIsProcessing(true);
    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    try {
      await withProcess(
        `Importando ${rows.length} registros desde Excel/CSV...`,
        async (updateProgress) => {
          if (activeTab === 'cuentas') {
            for (let i = 0; i < rows.length; i++) {
              const row = rows[i];
              const [code, name, typeStr, parentCode, ccStr, auxStr, concStr, docStr, estadoStr] = row;

              updateProgress({
                current: i + 1,
                total: rows.length,
                message: `Importando Plan de Cuentas (${i + 1}/${rows.length})`,
                stage: `${code || ''} - ${name || ''}`
              });

              if (!code || !name) {
                // Si la fila está vacía o incompleta, saltar
                continue;
              }

              let normalizedType: ChartOfAccount['type'] = 'Activo';
              const tLower = (typeStr || '').toLowerCase();
              if (tLower.includes('pasivo')) normalizedType = 'Pasivo';
              else if (tLower.includes('patrimonio')) normalizedType = 'Patrimonio';
              else if (tLower.includes('ingreso') || tLower.includes('ganancia')) normalizedType = 'Ingreso';
              else if (tLower.includes('gasto') || tLower.includes('perdida') || tLower.includes('costo')) normalizedType = 'Gasto';

              const reqCC = ['si', 's', 'true', '1'].includes((ccStr || '').toLowerCase());
              const reqAux = ['si', 's', 'true', '1'].includes((auxStr || '').toLowerCase());
              const reqConc = ['si', 's', 'true', '1'].includes((concStr || '').toLowerCase());
              const reqDoc = ['si', 's', 'true', '1'].includes((docStr || '').toLowerCase());
              const estado = (estadoStr || '').toLowerCase().includes('inactiv') ? 'Inactivo' : 'Activo';

              const userUid = auth.currentUser?.uid || 'import-excel';
              const userEmail = auth.currentUser?.email || '';
              const nowIso = new Date().toISOString();

              const accountPayload: Omit<ChartOfAccount, 'id'> = {
                code: String(code).trim(),
                name: String(name).trim(),
                type: normalizedType,
                parentCode: parentCode ? String(parentCode).trim() : '',
                requiereCentroCosto: reqCC,
                requiereAuxiliarRUT: reqAux,
                requiereConciliacionBancaria: reqConc,
                requiereDocumento: reqDoc,
                estado,
                createdBy: userUid,
                createdByUserEmail: userEmail,
                creationMode: 'IMPORTACION_MASIVA',
                createdAt: nowIso,
                lastModifiedBy: userUid,
                lastModifiedAt: nowIso
              };

              await addDoc(collection(companyRef, 'chartOfAccounts'), accountPayload);
              successCount++;
            }
          } else if (activeTab === 'clientes' || activeTab === 'proveedores') {
            const userUid = auth.currentUser?.uid || 'import-excel';
            const userEmail = auth.currentUser?.email || '';
            const nowIso = new Date().toISOString();

            const existingAuxSnap = await getDocs(collection(companyRef, 'auxiliaries'));
            const existingAuxList = existingAuxSnap.docs.map(d => ({ id: d.id, ...d.data() } as Auxiliary));

            for (let i = 0; i < rows.length; i++) {
              const row = rows[i];
              let rut = '';
              let name = '';
              let defaultGloss = '';
              let roleStr = '';
              let email = '';
              let phone = '';
              let banco = '';
              let tipoCtaStr = '';
              let numCta = '';
              let accCode1 = '';
              let accCode2 = '';
              let estadoStr = '';

              if (row.length >= 12) {
                [rut, name, defaultGloss, roleStr, email, phone, banco, tipoCtaStr, numCta, accCode1, accCode2, estadoStr] = row;
              } else {
                [rut, name, roleStr, email, phone, banco, tipoCtaStr, numCta, accCode1, accCode2, estadoStr] = row;
              }

              updateProgress({
                current: i + 1,
                total: rows.length,
                message: `Importando Auxiliares (${i + 1}/${rows.length})`,
                stage: `${rut} - ${name}`
              });

              if (!rut || !name) {
                continue;
              }

              let role: 'Deudor' | 'Acreedor' | 'Ambos' = activeTab === 'clientes' ? 'Deudor' : 'Acreedor';
              const rLower = (roleStr || '').toLowerCase();
              if (rLower.includes('ambos')) role = 'Ambos';
              else if (rLower.includes('deudor') || rLower.includes('cliente')) role = 'Deudor';
              else if (rLower.includes('acreedor') || rLower.includes('proveedor')) role = 'Acreedor';

              const matchedAcc1 = accounts.find(a => a.code === (accCode1 || '').trim());
              const matchedAcc2 = accounts.find(a => a.code === (accCode2 || '').trim());

              let tipoCuenta: 'Corriente' | 'Vista' | 'Ahorro' | 'RUT' = 'Corriente';
              const tCtaLower = (tipoCtaStr || '').toLowerCase();
              if (tCtaLower.includes('vista')) tipoCuenta = 'Vista';
              else if (tCtaLower.includes('ahorro')) tipoCuenta = 'Ahorro';
              else if (tCtaLower.includes('rut')) tipoCuenta = 'RUT';

              const auxPayload: Omit<Auxiliary, 'id'> = {
                rut: rut.trim(),
                name: name.trim(),
                defaultGloss: defaultGloss ? defaultGloss.trim() : '',
                role,
                email: email || '',
                phone: phone || '',
                banco: banco || '',
                tipoCuenta,
                numeroCuenta: numCta || '',
                defaultDebtorAccountId: role === 'Deudor' || role === 'Ambos' ? (matchedAcc1?.id || '') : '',
                defaultCreditorAccountId: role === 'Acreedor' || role === 'Ambos' ? (matchedAcc1?.id || '') : '',
                defaultExpenseOrIncomeAccountId: matchedAcc2?.id || '',
                estado: (estadoStr || '').toLowerCase().includes('inactiv') ? 'Inactivo' : 'Activo',
                createdBy: userUid,
                createdByUserEmail: userEmail,
                creationMode: 'IMPORTACION_MASIVA',
                createdAt: nowIso,
                lastModifiedBy: userUid,
                lastModifiedAt: nowIso
              };

              const cleanImportRut = rut.replace(/[^0-9kK]/g, '').toUpperCase();
              const existingAux = existingAuxList.find(a => (a.rut || '').replace(/[^0-9kK]/g, '').toUpperCase() === cleanImportRut);

              if (existingAux) {
                await setDoc(doc(companyRef, 'auxiliaries', existingAux.id), auxPayload, { merge: true });
              } else {
                const newRef = await addDoc(collection(companyRef, 'auxiliaries'), auxPayload);
                existingAuxList.push({ id: newRef.id, ...auxPayload });
              }
              successCount++;
            }
          } else if (activeTab === 'comprobantes') {
            const vouchersMap = new Map<string, {
              voucherNumber: number;
              date: string;
              period: string;
              type: 'Ingreso' | 'Egreso' | 'Traspaso';
              gloss: string;
              lines: VoucherLine[];
            }>();

            // Rastrear el comprobante activo para filas multilínea que heredan cabecera
            let currentVNum = 1;
            let currentDate = '';
            let currentPeriod = '';
            let currentType: 'Ingreso' | 'Egreso' | 'Traspaso' = 'Traspaso';
            let currentGloss = 'Comprobante importado vía Excel';

            for (let i = 0; i < rows.length; i++) {
              const row = rows[i];
              const [numStr, dateStr, periodStr, typeStr, vGloss, accCode, lineGloss, auxRut, docType, docFolio, ccCode, debeStr, haberStr] = row;

              const debe = parseAmount(debeStr);
              const haber = parseAmount(haberStr);
              const hasAccount = Boolean(accCode && String(accCode).trim());

              // Si la fila no tiene cuenta ni montos, omitir
              if (!hasAccount && debe === 0 && haber === 0) {
                continue;
              }

              // Determinar número de comprobante
              const parsedNum = parseInt(numStr, 10);
              if (!isNaN(parsedNum) && parsedNum > 0) {
                currentVNum = parsedNum;
              }

              // Determinar fecha normalizada (admite D/M/YYYY, DD/MM/YYYY, YYYY-MM-DD, etc.)
              const parsedDate = normalizeDateToIso(dateStr);
              if (parsedDate) {
                currentDate = parsedDate;
              }

              // Determinar período normalizado (admite YYYY-MM, 2026-03, 202603, etc.)
              const parsedPeriod = normalizePeriod(periodStr, currentDate);
              if (parsedPeriod) {
                currentPeriod = parsedPeriod;
              } else if (currentDate) {
                currentPeriod = currentDate.slice(0, 7);
              }

              // Si hay período pero no fecha exacta, asignar el primer día del mes
              if (!currentDate && currentPeriod) {
                currentDate = `${currentPeriod}-01`;
              }

              // Si no tiene fecha ni período válido, reportar error y no usar fecha de hoy
              if (!currentDate || !currentPeriod) {
                errorCount++;
                errors.push(`Fila ${i + 2}: El comprobante N° ${currentVNum} no tiene fecha ni período contable válido.`);
                continue;
              }

              // Determinar tipo de comprobante
              if (typeStr && String(typeStr).trim()) {
                const tLower = String(typeStr).toLowerCase();
                if (tLower.includes('ingreso')) currentType = 'Ingreso';
                else if (tLower.includes('egreso')) currentType = 'Egreso';
                else if (tLower.includes('traspaso')) currentType = 'Traspaso';
              }

              if (vGloss && String(vGloss).trim()) {
                currentGloss = String(vGloss).trim();
              }

              // Clave única para agrupar líneas del mismo comprobante
              const key = `V_${currentVNum}_${currentPeriod}_${currentDate}`;

              const matchedAcc = accounts.find(a => a.code === (accCode || '').trim());
              const matchedAux = auxiliaries.find(a => (a.rut || '').replace(/[^0-9kK]/g, '').toUpperCase() === (auxRut || '').replace(/[^0-9kK]/g, '').toUpperCase());

              const formattedDocRef = [docType, docFolio].filter(Boolean).map(s => String(s).trim()).join(' ');

              const lineObj: VoucherLine = {
                id: `imp_line_${Date.now()}_${i}`,
                accountId: matchedAcc?.id || '',
                accountCode: (accCode || '').trim(),
                accountName: matchedAcc?.name || 'Cuenta Importada',
                gloss: lineGloss ? String(lineGloss).trim() : currentGloss,
                auxiliaryRut: auxRut ? String(auxRut).trim() : '',
                auxiliaryName: matchedAux?.name || '',
                documentRef: formattedDocRef,
                costCenter: ccCode ? String(ccCode).trim() : '',
                debit: debe,
                credit: haber
              };

              if (!vouchersMap.has(key)) {
                vouchersMap.set(key, {
                  voucherNumber: currentVNum,
                  date: currentDate,
                  period: currentPeriod,
                  type: currentType,
                  gloss: currentGloss,
                  lines: [lineObj]
                });
              } else {
                vouchersMap.get(key)!.lines.push(lineObj);
              }
            }

            // Validar si algún comprobante pertenece a un período cerrado
            if (fiscalYears && fiscalYears.length > 0) {
              const closedDrafts: string[] = [];
              for (const vData of vouchersMap.values()) {
                const pStr = vData.period || vData.date.slice(0, 7);
                const parts = pStr.split('-');
                if (parts.length >= 2) {
                  const y = parts[0];
                  const m = parseInt(parts[1], 10);
                  const fy = fiscalYears.find(f => String(f.id || f.year) === y);
                  if (fy && fy.months?.[m] === 'Cerrado') {
                    closedDrafts.push(`Comprobante N° ${vData.voucherNumber} (Período ${pStr})`);
                  }
                }
              }

              if (closedDrafts.length > 0) {
                throw new Error(
                  `Acción bloqueada: Se encontraron ${closedDrafts.length} comprobante(s) con fecha en períodos CERRADOS:\n` +
                  closedDrafts.slice(0, 5).join('\n') +
                  (closedDrafts.length > 5 ? `\n...y ${closedDrafts.length - 5} más.` : '') +
                  `\n\nPor favor abre los períodos correspondientes en 'Configuraciones > Períodos Contables' antes de importar.`
                );
              }
            }

            const totalVouchers = vouchersMap.size;
            let vIdx = 0;
            const userUid = auth.currentUser?.uid || 'import-excel';
            const userEmail = auth.currentUser?.email || '';
            const nowIso = new Date().toISOString();

            for (const vData of vouchersMap.values()) {
              vIdx++;
              updateProgress({
                current: vIdx,
                total: totalVouchers,
                message: `Guardando Comprobantes Contables (${vIdx}/${totalVouchers})`,
                stage: `N° ${vData.voucherNumber}: ${vData.gloss}`
              });

              const sanitizedLines = sanitizeVoucherLines(vData.lines, accounts);
              const totalDebit = sanitizedLines.reduce((s, l) => s + l.debit, 0);
              const totalCredit = sanitizedLines.reduce((s, l) => s + l.credit, 0);

              const voucherPayload: Omit<Voucher, 'id'> = {
                voucherNumber: vData.voucherNumber,
                date: vData.date,
                period: vData.period,
                type: vData.type,
                gloss: vData.gloss,
                lines: sanitizedLines,
                totalDebit,
                totalCredit,
                status: 'Valido',
                createdBy: userUid,
                createdByUserEmail: userEmail,
                creationMode: 'IMPORTACION_MASIVA',
                createdAt: nowIso,
                lastModifiedBy: userUid,
                lastModifiedAt: nowIso
              };

              await addDoc(collection(companyRef, 'vouchers'), voucherPayload);
              successCount++;
            }
          }
        }
      );

      // Audit Log
      logAuditEvent({
        userId: auth.currentUser?.uid || 'anon',
        userEmail: auth.currentUser?.email || '',
        studyId,
        companyId: company.id,
        action: 'IMPORTACION_MASIVA',
        module: activeTab === 'cuentas' ? 'PLAN_CUENTAS' : activeTab === 'comprobantes' ? 'COMPROBANTES' : 'AUXILIARES',
        details: `Carga masiva Excel de ${activeTab}: ${successCount} registros procesados con éxito en ${company.name}`,
        metadata: {
          tipo: activeTab,
          archivo: fileName,
          exitosos: successCount,
          errores: errorCount
        }
      });

      setImportReport(`✅ Proceso finalizado con éxito: ${successCount} registros importados correctamente. (Errores/Filas vacías omitidas: ${errorCount})`);
      onDataImported();
    } catch (err: any) {
      console.error('Error importing Excel data:', err);
      setImportReport(`❌ Error durante la importación: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col border border-slate-200">
        {/* Header */}
        <div className="p-4 bg-slate-900 text-white flex justify-between items-center border-b border-slate-800">
          <div>
            <h3 className="font-black text-sm uppercase tracking-wide flex items-center gap-2">
              <span>📥</span> Centro de Carga Masiva de Archivos Excel / CSV
            </h3>
            <p className="text-xs text-slate-400">
              Empresa: <span className="text-indigo-300 font-bold">{company.name}</span> (RUT: {company.rut})
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-lg font-bold px-2 py-1 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-4 pt-2 gap-2 text-xs font-bold overflow-x-auto">
          {[
            { id: 'cuentas', label: '1. Plan de Cuentas', icon: '🗂️' },
            { id: 'clientes', label: '2. Clientes (Deudores)', icon: '👥' },
            { id: 'proveedores', label: '3. Proveedores (Acreedores)', icon: '🏢' },
            { id: 'comprobantes', label: '4. Comprobantes Contables', icon: '📝' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as ImportType);
                setFileContent('');
                setFileName('');
                setPreviewData([]);
                setImportReport(null);
              }}
              className={`px-4 py-2.5 rounded-t-lg transition-all flex items-center gap-1.5 ${
                activeTab === tab.id
                  ? 'bg-white text-indigo-700 border-t-2 border-indigo-600 border-x border-slate-200 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs flex-1">
          {/* Step 1: Download Format Guide */}
          <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h4 className="font-bold text-indigo-950 text-xs flex items-center gap-1.5">
                <span>📄</span> Paso 1: Descargar Plantilla Oficial Excel/CSV
              </h4>
              <p className="text-indigo-800 text-[11px] mt-0.5">
                Descargue el formato con los encabezados y filas de ejemplo estándar chilenos para completar su información.
              </p>
            </div>
            <button
              onClick={() => downloadTemplate(activeTab)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2 rounded-lg transition-colors flex items-center gap-2 shadow-xs whitespace-nowrap"
            >
              <span>⬇️ Descargar Formato {activeTab.toUpperCase()}</span>
            </button>
          </div>

          {/* Step 2: Upload CSV / File Drop */}
          <div className="border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-xl p-6 text-center transition-colors bg-slate-50/50">
            <input
              type="file"
              accept=".csv,.txt,.xlsx"
              onChange={handleFileChange}
              id="excel-file-input"
              className="hidden"
            />
            <label
              htmlFor="excel-file-input"
              className="cursor-pointer flex flex-col items-center justify-center gap-2"
            >
              <div className="w-12 h-12 bg-white border border-slate-200 rounded-full flex items-center justify-center text-xl shadow-xs text-indigo-600">
                📁
              </div>
              <span className="font-bold text-slate-800 text-xs">
                {fileName ? `Archivo seleccionado: ${fileName}` : 'Haga clic para seleccionar archivo Excel/CSV o arrástrelo aquí'}
              </span>
              <span className="text-[11px] text-slate-500">
                Soporta archivos CSV delimitados por punto y coma (;) o coma (,) con codificación UTF-8.
              </span>
            </label>
          </div>

          {/* Step 3: Data Preview */}
          {previewData.length > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <h5 className="font-bold text-slate-800 text-xs uppercase tracking-wide">
                  Vista Previa de Filas a Importar (Primeros registros)
                </h5>
                <span className="text-slate-500 text-[11px] font-mono">Total {previewData.length} filas detectadas en muestra</span>
              </div>
              <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-48">
                <table className="w-full text-left text-xs border-collapse font-mono">
                  <tbody className="divide-y divide-slate-200 text-[11px]">
                    {previewData.map((row, idx) => (
                      <tr key={idx} className={idx === 0 ? 'bg-slate-100 font-bold' : 'hover:bg-slate-50'}>
                        <td className="p-2 text-slate-400 font-sans w-8 text-center">{idx + 1}</td>
                        {row.map((cell: string, cIdx: number) => (
                          <td key={cIdx} className="p-2 text-slate-800 truncate max-w-[150px]">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Result Alert / Report */}
          {importReport && (
            <div
              className={`p-3 rounded-xl border text-xs font-semibold ${
                importReport.startsWith('✅')
                  ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                  : 'bg-rose-50 text-rose-900 border-rose-300'
              }`}
            >
              {importReport}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 font-semibold text-xs rounded-lg border border-slate-300 transition-colors"
          >
            Cerrar
          </button>
          <button
            onClick={handleExecuteImport}
            disabled={isProcessing || !fileContent}
            className={`px-5 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 shadow-xs ${
              isProcessing || !fileContent
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            }`}
          >
            <span>⚡</span>
            <span>{isProcessing ? 'Importando a la Base de Datos...' : `Cargar ${activeTab.toUpperCase()} a la Empresa`}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
