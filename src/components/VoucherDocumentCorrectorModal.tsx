import React, { useState, useMemo } from 'react';
import { 
  Voucher, 
  VoucherLine, 
  ChartOfAccount, 
  RCVDocument, 
  Auxiliary, 
  Company 
} from '../types';
import { db } from '../lib/firebase';
import { doc, collection, writeBatch, updateDoc } from 'firebase/firestore';
import { 
  X, 
  Wrench, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowRight, 
  RefreshCw, 
  FileText, 
  Building2, 
  Sparkles, 
  Search, 
  Filter, 
  Check, 
  ShieldCheck, 
  Layers, 
  TrendingUp, 
  Database,
  ExternalLink
} from 'lucide-react';
import { cleanRutString, formatRut } from '../utils/rutMatcher';
import { sanitizeForFirestore } from '../utils/bankReconciliationUtils';

export interface VoucherCorrectionItem {
  voucherId: string;
  voucherNumber: number | string;
  voucherType: string;
  voucherDate: string;
  voucherPeriod: string;
  voucherGloss: string;
  lineId: string;
  lineIdx: number;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  currentDocRef: string;
  currentDocType: string;
  currentAuxRut?: string;
  currentAuxName?: string;
  
  // Proposed corrections
  proposedDocType: string;
  proposedDocNumber: string;
  proposedDocRef: string;
  proposedAuxRut: string;
  proposedAuxName: string;
  matchSource: 'RCV_EXACT' | 'RCV_AMOUNT_RUT' | 'GLOSS_EXTRACTION' | 'INVOICE_PURCHASE_VOUCHER' | 'MANUAL';
  matchConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
  matchedRcvDocId?: string;
  selectedForUpdate: boolean;
  status: 'PENDING' | 'UPDATED' | 'ERROR';
}

interface VoucherDocumentCorrectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  studyId: string;
  companyId: string;
  companyName: string;
  companyRut: string;
  vouchers: Voucher[];
  accounts: ChartOfAccount[];
  rcvDocuments: RCVDocument[];
  auxiliaries: Auxiliary[];
  onSuccess: () => Promise<void>;
}

export default function VoucherDocumentCorrectorModal({
  isOpen,
  onClose,
  studyId,
  companyId,
  companyName,
  companyRut,
  vouchers,
  accounts,
  rcvDocuments,
  auxiliaries,
  onSuccess
}: VoucherDocumentCorrectorModalProps) {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterType, setFilterType] = useState<'ALL' | 'SELECTED' | 'HIGH_CONFIDENCE'>('ALL');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [items, setItems] = useState<VoucherCorrectionItem[]>([]);
  const [initialAnalyzed, setInitialAnalyzed] = useState<boolean>(false);

  // Map of auxiliaries by clean RUT
  const auxMap = useMemo(() => {
    const map = new Map<string, Auxiliary>();
    auxiliaries.forEach(a => {
      const clean = cleanRutString(a.rut || '');
      if (clean) map.set(clean, a);
    });
    return map;
  }, [auxiliaries]);

  // Map of RCV purchases (compras) by RUT and Folio / Amount
  const rcvPurchases = useMemo(() => {
    return (rcvDocuments || []).filter(d => {
      const t = (d.tipoDoc || '').trim();
      const op = (d.tipoOperacion || '').toUpperCase();
      return t === '33' || t === '34' || t === '46' || t === '61' || t === 'Factura' || t === 'Factura Exenta' || op === 'COMPRA' || op === 'COMPRAS';
    });
  }, [rcvDocuments]);

  // Run analysis when modal is opened or vouchers change
  React.useEffect(() => {
    if (!isOpen) {
      setInitialAnalyzed(false);
      setIsCompleted(false);
      return;
    }

    const detectedItems: VoucherCorrectionItem[] = [];

    // Helper: is Account 2102001 or Facturas por pagar / Proveedores
    const isTargetAccount = (code: string, name: string) => {
      const cleanCode = (code || '').replace(/[^0-9]/g, '');
      const lowerName = (name || '').toLowerCase();
      return (
        cleanCode === '2102001' ||
        cleanCode.startsWith('2102') ||
        cleanCode.startsWith('2101') ||
        (code || '').startsWith('2.1.02') ||
        (code || '').startsWith('2.1.01') ||
        lowerName.includes('facturas por pagar') ||
        lowerName.includes('factura por pagar') ||
        lowerName.includes('proveedores') ||
        lowerName.includes('acreedores comerciales')
      );
    };

    // Helper: is generic/internal document ref
    const isGenericDocRef = (ref?: string, docType?: string) => {
      if (!ref || !ref.trim()) return true;
      const clean = ref.trim().toUpperCase();
      if (
        clean === 'DOCUMENTO INTERNO' ||
        clean === 'DOC. INTERNO' ||
        clean === 'DOC INTERNO' ||
        clean === 'INTERNO' ||
        clean === 'OTRO' ||
        clean === 'DOC. OTRO' ||
        clean === 'DOCUMENTO OTRO' ||
        clean === 'BANCO' ||
        clean === 'S/N' ||
        clean === 'SN' ||
        clean === 'SIN DOCUMENTO' ||
        clean === '9999' ||
        clean === '1' ||
        docType === '9999' ||
        docType === 'OTRO' ||
        docType === 'DOCUMENTO INTERNO'
      ) {
        return true;
      }
      return false;
    };

    vouchers.forEach(v => {
      if (!v.lines || v.lines.length === 0) return;

      v.lines.forEach((line, lineIdx) => {
        const accCode = line.accountCode || '';
        const accName = line.accountName || '';

        if (!isTargetAccount(accCode, accName)) return;

        // Check if current docRef or docType is generic or missing
        if (!isGenericDocRef(line.documentRef, line.documentType)) return;

        const lineAmount = Math.round(Number(line.debit) || Number(line.credit) || 0);
        if (lineAmount <= 0) return;

        const lineGloss = (line.gloss || '').trim();
        const voucherGloss = (v.gloss || '').trim();
        const combinedText = `${voucherGloss} ${lineGloss} ${line.documentRef || ''} ${line.bankDocRef || ''}`;

        let proposedDocType = '33';
        let proposedDocNumber = '';
        let proposedAuxRut = line.auxiliaryRut ? cleanRutString(line.auxiliaryRut) : '';
        let proposedAuxName = line.auxiliaryName || '';
        let matchSource: VoucherCorrectionItem['matchSource'] = 'GLOSS_EXTRACTION';
        let matchConfidence: VoucherCorrectionItem['matchConfidence'] = 'LOW';
        let matchedRcvDocId: string | undefined = undefined;

        // Step 1: Extract potential Folio from gloss / text
        const folioRegexes = [
          /(?:factura|fac|f\.|dte\s*33|factura\s*electr[oó]nica|dte)\s*(?:n°|#|nº|folio|num|nro\.?)?\s*:?\s*(\d+)/i,
          /(?:pago\s+fac(?:tura)?|cancela(?:ci[oó]n)?\s+fac(?:tura)?)\s*(?:n°|#|nº)?\s*:?\s*(\d+)/i,
          /(?:n°|#|nº|folio|nro\.?)\s*:?\s*(\d+)/i,
          /\b(\d{3,10})\b/
        ];

        let extractedFolio = '';
        for (const rx of folioRegexes) {
          const match = combinedText.match(rx);
          if (match && match[1]) {
            extractedFolio = match[1];
            break;
          }
        }

        // Detect if explicit DTE type mentioned
        if (/factura\s*exenta|fe\b|dte\s*34/i.test(combinedText)) {
          proposedDocType = '34';
        } else if (/nota\s*de?\s*cr[eé]dito|\bnc\b|dte\s*61/i.test(combinedText)) {
          proposedDocType = '61';
        } else if (/boleta\s*honorario|\bbhe\b/i.test(combinedText)) {
          proposedDocType = 'BHE';
        } else {
          proposedDocType = '33';
        }

        // Step 2: Match against RCV Documents (Purchases)
        if (extractedFolio) {
          const rcvByFolio = rcvPurchases.find(d => {
            const dFolio = String(d.folio || '').replace(/\D/g, '');
            const dRut = cleanRutString(d.rutEmisor || '');
            const matchesFolio = dFolio === extractedFolio;
            const matchesRut = !proposedAuxRut || !dRut || dRut === proposedAuxRut;
            return matchesFolio && matchesRut;
          });

          if (rcvByFolio) {
            proposedDocNumber = String(rcvByFolio.folio);
            proposedDocType = rcvByFolio.tipoDoc === '34' ? '34' : (rcvByFolio.tipoDoc === '61' ? '61' : '33');
            if (rcvByFolio.rutEmisor) proposedAuxRut = cleanRutString(rcvByFolio.rutEmisor);
            if (rcvByFolio.razonSocialEmisor) proposedAuxName = rcvByFolio.razonSocialEmisor;
            matchedRcvDocId = rcvByFolio.id;
            matchSource = 'RCV_EXACT';
            matchConfidence = 'HIGH';
          }
        }

        // Step 3: Match against RCV by Amount & Supplier RUT if no folio match yet
        if (!matchedRcvDocId) {
          const rcvByAmountAndRut = rcvPurchases.find(d => {
            const dTotal = Math.round(Number(d.montoTotal) || 0);
            const dRut = cleanRutString(d.rutEmisor || '');
            const matchesAmount = Math.abs(dTotal - lineAmount) <= 1;
            const matchesRut = proposedAuxRut && dRut && dRut === proposedAuxRut;
            return matchesAmount && matchesRut;
          });

          if (rcvByAmountAndRut) {
            proposedDocNumber = String(rcvByAmountAndRut.folio);
            proposedDocType = rcvByAmountAndRut.tipoDoc === '34' ? '34' : (rcvByAmountAndRut.tipoDoc === '61' ? '61' : '33');
            if (rcvByAmountAndRut.rutEmisor) proposedAuxRut = cleanRutString(rcvByAmountAndRut.rutEmisor);
            if (rcvByAmountAndRut.razonSocialEmisor) proposedAuxName = rcvByAmountAndRut.razonSocialEmisor;
            matchedRcvDocId = rcvByAmountAndRut.id;
            matchSource = 'RCV_AMOUNT_RUT';
            matchConfidence = 'HIGH';
          }
        }

        // Step 4: Fallback to extracted folio if available
        if (!proposedDocNumber && extractedFolio) {
          proposedDocNumber = extractedFolio;
          matchSource = 'GLOSS_EXTRACTION';
          matchConfidence = 'MEDIUM';
        }

        // Step 5: Match by other purchase vouchers (Traspasos / Compras) for same RUT
        if (!proposedDocNumber && proposedAuxRut) {
          vouchers.forEach(otherV => {
            if (otherV.id === v.id) return;
            otherV.lines?.forEach(ol => {
              const oRut = cleanRutString(ol.auxiliaryRut || '');
              const oCredit = Math.round(Number(ol.credit) || 0);
              if (oRut === proposedAuxRut && Math.abs(oCredit - lineAmount) <= 1 && ol.documentRef) {
                const match = ol.documentRef.match(/\b(\d+)\b/);
                if (match && match[1]) {
                  proposedDocNumber = match[1];
                  proposedDocType = ol.documentType || '33';
                  matchSource = 'INVOICE_PURCHASE_VOUCHER';
                  matchConfidence = 'MEDIUM';
                }
              }
            });
          });
        }

        // Fill Auxiliary name from auxiliary master if known
        if (proposedAuxRut && !proposedAuxName) {
          const auxObj = auxMap.get(proposedAuxRut);
          if (auxObj) proposedAuxName = auxObj.name;
        }

        const formattedDocNumber = proposedDocNumber || String(v.voucherNumber);
        let docPrefix = 'Factura N°';
        if (proposedDocType === '34') docPrefix = 'Factura Exenta N°';
        else if (proposedDocType === '61') docPrefix = 'Nota de Crédito N°';
        else if (proposedDocType === 'BHE') docPrefix = 'Boleta Honorarios N°';

        const proposedDocRef = `${docPrefix} ${formattedDocNumber}`.toUpperCase();

        detectedItems.push({
          voucherId: v.id || '',
          voucherNumber: v.voucherNumber,
          voucherType: v.type || 'Egreso',
          voucherDate: v.date || '',
          voucherPeriod: v.period || '',
          voucherGloss: v.gloss || '',
          lineId: line.id || `l_${lineIdx}`,
          lineIdx,
          accountCode: accCode,
          accountName: accName,
          debit: Number(line.debit) || 0,
          credit: Number(line.credit) || 0,
          currentDocRef: line.documentRef || 'DOCUMENTO INTERNO',
          currentDocType: line.documentType || '9999',
          currentAuxRut: line.auxiliaryRut,
          currentAuxName: line.auxiliaryName,
          proposedDocType,
          proposedDocNumber: formattedDocNumber,
          proposedDocRef,
          proposedAuxRut: proposedAuxRut ? formatRut(proposedAuxRut) : (line.auxiliaryRut || ''),
          proposedAuxName: proposedAuxName || line.auxiliaryName || 'PROVEEDOR',
          matchSource,
          matchConfidence,
          matchedRcvDocId,
          selectedForUpdate: true,
          status: 'PENDING'
        });
      });
    });

    setItems(detectedItems);
    setInitialAnalyzed(true);
  }, [isOpen, vouchers, rcvPurchases, auxMap]);

  // Toggle selection for item
  const toggleItemSelection = (index: number) => {
    setItems(prev => prev.map((item, idx) => idx === index ? { ...item, selectedForUpdate: !item.selectedForUpdate } : item));
  };

  // Toggle select all
  const toggleSelectAll = () => {
    const allSelected = items.every(i => i.selectedForUpdate);
    setItems(prev => prev.map(i => ({ ...i, selectedForUpdate: !allSelected })));
  };

  // Filtered items
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (filterType === 'SELECTED' && !item.selectedForUpdate) return false;
      if (filterType === 'HIGH_CONFIDENCE' && item.matchConfidence !== 'HIGH') return false;

      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        String(item.voucherNumber).includes(term) ||
        item.voucherGloss.toLowerCase().includes(term) ||
        item.proposedDocRef.toLowerCase().includes(term) ||
        (item.proposedAuxRut || '').toLowerCase().includes(term) ||
        (item.proposedAuxName || '').toLowerCase().includes(term) ||
        item.currentDocRef.toLowerCase().includes(term)
      );
    });
  }, [items, filterType, searchTerm]);

  // Execute the Batch Fix and Document Reconciliation
  const handleExecuteUpgrade = async () => {
    const toUpdate = items.filter(i => i.selectedForUpdate);
    if (toUpdate.length === 0) return;

    setIsProcessing(true);
    setProgress(5);
    setStatusMessage('Iniciando corrección de comprobantes y cancelación de facturas...');

    try {
      const companyRef = doc(db, 'studies', studyId, 'companies', companyId);
      const vouchersCollection = collection(companyRef, 'vouchers');
      const rcvCollection = collection(companyRef, 'rcvDocuments');

      // Group corrections by voucherId
      const correctionsByVoucher = new Map<string, VoucherCorrectionItem[]>();
      toUpdate.forEach(item => {
        const list = correctionsByVoucher.get(item.voucherId) || [];
        list.push(item);
        correctionsByVoucher.set(item.voucherId, list);
      });

      const totalVouchers = correctionsByVoucher.size;
      let processedVouchers = 0;
      let batch = writeBatch(db);
      let batchCount = 0;

      // Map of RCV documents to mark as paid
      const rcvUpdates = new Set<string>();

      for (const [vId, correctionList] of correctionsByVoucher.entries()) {
        const originalVoucher = vouchers.find(v => v.id === vId);
        if (!originalVoucher || !originalVoucher.lines) continue;

        // Clone lines and apply corrections
        const updatedLines = originalVoucher.lines.map((l, idx) => {
          const match = correctionList.find(c => c.lineIdx === idx || c.lineId === l.id);
          if (!match) return l;

          if (match.matchedRcvDocId) {
            rcvUpdates.add(match.matchedRcvDocId);
          }

          return {
            ...l,
            documentType: match.proposedDocType,
            documentRef: match.proposedDocRef.toUpperCase(),
            auxiliaryRut: match.proposedAuxRut ? cleanRutString(match.proposedAuxRut).toUpperCase() : l.auxiliaryRut,
            auxiliaryName: match.proposedAuxName ? match.proposedAuxName.toUpperCase() : l.auxiliaryName,
            gloss: l.gloss?.toUpperCase().includes('PAGO') ? l.gloss : `PAGO ${match.proposedDocRef} - ${l.gloss || originalVoucher.gloss}`.toUpperCase()
          };
        });

        const vDocRef = doc(vouchersCollection, vId);
        batch.update(vDocRef, {
          lines: sanitizeForFirestore(updatedLines),
          updatedAt: new Date().toISOString()
        });
        batchCount++;

        processedVouchers++;
        setProgress(Math.round(10 + (processedVouchers / totalVouchers) * 70));
        setStatusMessage(`Actualizando comprobante ${processedVouchers} de ${totalVouchers}...`);

        if (batchCount >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          batchCount = 0;
        }
      }

      // Update RCV Documents status to 'Pagada'
      if (rcvUpdates.size > 0) {
        setStatusMessage(`Cancelando ${rcvUpdates.size} facturas asociadas en Registro de Compras...`);
        for (const rcvId of rcvUpdates) {
          const rDocRef = doc(rcvCollection, rcvId);
          batch.update(rDocRef, {
            estadoPago: 'Pagada',
            estadoCobranza: 'Pagada',
            saldoPendiente: 0,
            updatedAt: new Date().toISOString()
          });
          batchCount++;

          if (batchCount >= 400) {
            await batch.commit();
            batch = writeBatch(db);
            batchCount = 0;
          }
        }
      }

      if (batchCount > 0) {
        await batch.commit();
      }

      setProgress(100);
      setStatusMessage('¡Corrección y cancelación completadas con éxito!');
      setIsCompleted(true);

      // Reload data
      if (onSuccess) {
        await onSuccess();
      }
    } catch (err) {
      console.error('Error al corregir comprobantes:', err);
      setStatusMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  const totalAmount = items.reduce((sum, i) => sum + (i.debit || i.credit || 0), 0);
  const selectedCount = items.filter(i => i.selectedForUpdate).length;
  const highConfidenceCount = items.filter(i => i.matchConfidence === 'HIGH').length;

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-6xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-700 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center shadow-inner">
              <Wrench className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-xl font-bold tracking-tight">Corrector de Egresos & Cancelación de Facturas</h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/20 text-white border border-white/30">
                  Cuenta 2102001
                </span>
              </div>
              <p className="text-sm text-blue-100 mt-0.5">
                Empresa: <strong className="text-white">{companyName}</strong> ({formatRut(companyRut)})
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            disabled={isProcessing}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Registros Detectados</span>
              <div className="text-2xl font-black text-slate-800 dark:text-slate-100 mt-1">{items.length}</div>
              <span className="text-xs text-slate-500">Con "Doc. Interno" / "OTRO"</span>
            </div>

            <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/50 dark:bg-emerald-950/20">
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Coincidencias RCV</span>
              <div className="text-2xl font-black text-emerald-700 dark:text-emerald-400 mt-1">{highConfidenceCount}</div>
              <span className="text-xs text-emerald-600/80 dark:text-emerald-400/80">Facturas 100% asociadas</span>
            </div>

            <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-800/50 bg-blue-50/50 dark:bg-blue-950/20">
              <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Monto a Conciliar</span>
              <div className="text-2xl font-black text-blue-700 dark:text-blue-400 mt-1">
                ${totalAmount.toLocaleString('es-CL')}
              </div>
              <span className="text-xs text-blue-600/80 dark:text-blue-400/80">Total egresos a saldar</span>
            </div>

            <div className="p-4 rounded-xl border border-indigo-200 dark:border-indigo-800/50 bg-indigo-50/50 dark:bg-indigo-950/20">
              <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Seleccionados</span>
              <div className="text-2xl font-black text-indigo-700 dark:text-indigo-400 mt-1">{selectedCount}</div>
              <span className="text-xs text-indigo-600/80 dark:text-indigo-400/80">Listos para actualización</span>
            </div>
          </div>

          {/* Explanation Alert */}
          <div className="p-4 rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/30 flex items-start space-x-3">
            <Sparkles className="w-5 h-5 text-sky-600 dark:text-sky-400 mt-0.5 shrink-0" />
            <div className="text-xs text-sky-900 dark:text-sky-200 leading-relaxed">
              <strong>Diagnóstico & Solución Automática:</strong> Los comprobantes de Egreso o Traspaso con imputación a la cuenta <strong>2102001 (Facturas por pagar)</strong> que fueron registrados genéricamente como <em>"Documento Interno"</em> o <em>"OTRO"</em> impiden que el análisis de auxiliares cruce los pagos contra las facturas de compras (DTE 33/34). 
              Esta herramienta analiza automáticamente las glosas, RUTs de proveedores y folios del Registro de Compras (RCV) para actualizar cada comprobante con su <strong>Factura Electrónica correspondiente</strong> y <strong>cancelar el saldo pendiente</strong>.
            </div>
          </div>

          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center space-x-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input 
                  type="text"
                  placeholder="Buscar por comprobante, RUT o glosa..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-xs">
                <button
                  onClick={() => setFilterType('ALL')}
                  className={`px-3 py-2 font-medium transition-colors ${filterType === 'ALL' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100'}`}
                >
                  Todos ({items.length})
                </button>
                <button
                  onClick={() => setFilterType('HIGH_CONFIDENCE')}
                  className={`px-3 py-2 font-medium transition-colors ${filterType === 'HIGH_CONFIDENCE' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100'}`}
                >
                  RCV Exacto ({highConfidenceCount})
                </button>
                <button
                  onClick={() => setFilterType('SELECTED')}
                  className={`px-3 py-2 font-medium transition-colors ${filterType === 'SELECTED' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100'}`}
                >
                  Seleccionados ({selectedCount})
                </button>
              </div>
            </div>

            <button
              onClick={toggleSelectAll}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline px-2 py-1"
            >
              {items.every(i => i.selectedForUpdate) ? 'Deseleccionar Todos' : 'Seleccionar Todos'}
            </button>
          </div>

          {/* Table of Proposed Corrections */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto max-h-[42vh]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 uppercase font-semibold sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="p-3 w-10 text-center">Sel.</th>
                    <th className="p-3">Comprobante</th>
                    <th className="p-3">Auxiliar / Proveedor</th>
                    <th className="p-3">Referencia Actual</th>
                    <th className="p-3 text-center w-8">➔</th>
                    <th className="p-3">Factura a Cancelar</th>
                    <th className="p-3 text-right">Monto</th>
                    <th className="p-3 text-center">Origen Match</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-500 dark:text-slate-400">
                        {items.length === 0 ? (
                          <div className="flex flex-col items-center justify-center space-y-2">
                            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                            <p className="font-semibold text-slate-700 dark:text-slate-300">¡Excelente! No hay egresos pendientes con "Documento Interno".</p>
                            <p className="text-xs text-slate-500">Todos los pagos de la cuenta 2102001 ya cuentan con su Factura Electrónica asociada.</p>
                          </div>
                        ) : (
                          'No se encontraron registros que coincidan con la búsqueda.'
                        )}
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item, idx) => (
                      <tr 
                        key={`${item.voucherId}_${item.lineIdx}`}
                        className={`hover:bg-blue-50/50 dark:hover:bg-slate-800/60 transition-colors ${item.selectedForUpdate ? 'bg-blue-50/20 dark:bg-blue-950/10' : 'opacity-60'}`}
                      >
                        <td className="p-3 text-center">
                          <input 
                            type="checkbox"
                            checked={item.selectedForUpdate}
                            onChange={() => toggleItemSelection(idx)}
                            className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                          />
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <div className="font-bold text-slate-900 dark:text-slate-100">
                            {item.voucherType} N° {item.voucherNumber}
                          </div>
                          <div className="text-[11px] text-slate-500">{item.voucherDate} ({item.voucherPeriod})</div>
                        </td>
                        <td className="p-3 max-w-[200px]">
                          <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                            {item.proposedAuxName || 'PROVEEDOR'}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500">{item.proposedAuxRut}</div>
                        </td>
                        <td className="p-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                            {item.currentDocRef}
                          </span>
                        </td>
                        <td className="p-3 text-center text-slate-400 font-bold">➔</td>
                        <td className="p-3">
                          <div className="flex items-center space-x-1.5">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                              {item.proposedDocRef}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 truncate max-w-[220px] mt-0.5">
                            {item.voucherGloss}
                          </div>
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                          ${(item.debit || item.credit).toLocaleString('es-CL')}
                        </td>
                        <td className="p-3 text-center whitespace-nowrap">
                          {item.matchConfidence === 'HIGH' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                              <Check className="w-3 h-3 mr-0.5" /> 100% RCV
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                              <Sparkles className="w-3 h-3 mr-0.5" /> Glosa
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Progress / Status Bar */}
          {isProcessing && (
            <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 space-y-2">
              <div className="flex justify-between text-xs font-semibold text-blue-900 dark:text-blue-200">
                <span>{statusMessage}</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full h-2.5 bg-blue-200 dark:bg-blue-900 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-600 transition-all duration-300 rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {isCompleted && (
            <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 flex items-center space-x-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div>
                <h4 className="text-sm font-bold text-emerald-900 dark:text-emerald-200">¡Actualización Exitosa!</h4>
                <p className="text-xs text-emerald-800 dark:text-emerald-300">
                  Se corrigieron todos los registros de comprobantes y las facturas han quedado canceladas / saldadas en el Análisis de Auxiliares.
                </p>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            {selectedCount} de {items.length} registros seleccionados
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              disabled={isProcessing}
              className="px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
            >
              {isCompleted ? 'Cerrar' : 'Cancelar'}
            </button>

            {!isCompleted && (
              <button
                onClick={handleExecuteUpgrade}
                disabled={isProcessing || selectedCount === 0}
                className="px-6 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 rounded-xl shadow-lg shadow-blue-600/30 flex items-center space-x-2 transition-all transform active:scale-95"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Procesando...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Ejecutar Corrección y Cancelar Facturas ({selectedCount})</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
