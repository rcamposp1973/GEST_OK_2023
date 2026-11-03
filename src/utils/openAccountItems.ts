import type { ChartOfAccount, RCVDocument, Voucher } from '../types';

export interface OpenAccountItem {
  id: string;
  docType: string;
  docNumber: string;
  auxiliaryRut: string;
  auxiliaryName: string;
  issueDate: string;
  dueDate?: string;
  costCenter?: string;
  expenseItem?: string;
  project?: string;
  product?: string;
  originalAmount: number;
  paidAmount: number;
  /** Saldo abierto. Negativo para notas de crédito (rebajan lo que se debe pagar o cobrar). */
  openBalance: number;
  source: 'RCV' | 'VOUCHER';
  /** true para notas de crédito: su saldo es negativo y al aplicarla va al lado contrario */
  esNotaCredito?: boolean;
}

export interface AccountKind { isAP: boolean; isHonorarios: boolean; isProveedores: boolean; isClientes: boolean; }

/** Documentos abiertos (facturas/boletas con saldo) que componen una cuenta: une el RCV con los comprobantes. */
export function computeOpenItems(
  selectedAccount: ChartOfAccount | undefined,
  kind: AccountKind,
  rcvDocuments: RCVDocument[],
  vouchers: Voucher[]
): OpenAccountItem[] {
  const { isAP, isHonorarios, isProveedores, isClientes } = kind;
    if (!selectedAccount) return [];

    const items: OpenAccountItem[] = [];
    const accCode = selectedAccount.code;
    const accId = selectedAccount.id;

    // Helper: Normalize Folio to pure numeric string or standard code (e.g. "#201501", "DTE 34 #201501", "00201501" -> "201501")
    const normalizeFolio = (val: any): string => {
      if (val === undefined || val === null) return '';
      const s = String(val).trim();
      if (!s) return '';
      if (s.includes('#')) {
        const after = s.split('#').pop()?.trim() || '';
        const d = after.replace(/\D/g, '');
        if (d) return String(parseInt(d, 10));
      }
      const tokens = s.split(/[\s\-_\/]+/);
      for (let i = tokens.length - 1; i >= 0; i--) {
        const d = tokens[i].replace(/\D/g, '');
        if (d.length > 0) return String(parseInt(d, 10));
      }
      const allD = s.replace(/\D/g, '');
      if (allD) return String(parseInt(allD, 10));
      return s.toUpperCase();
    };

    // Helper: Normalize RUT (removes dots, hyphens, spaces: "99.012.000-5" -> "990120005")
    const normalizeRut = (rut: any): string => {
      if (!rut) return '';
      return String(rut).replace(/[^0-9kK]/g, '').toUpperCase().trim();
    };

    // Helper: Normalize Document Type ("DTE 34" -> "34", "33" -> "33", "70" -> "BHE")
    const normalizeDocType = (type: any): string => {
      if (!type) return '';
      const s = String(type).trim().toUpperCase();
      const d = s.replace(/\D/g, '');
      if (d) return d;
      if (s.includes('HONORAR') || s.includes('BHE') || s.includes('BHR')) return 'BHE';
      return s;
    };

    // 1. Gather & aggregate all lines from Accounting Vouchers on this account
    const lineBalancesMap = new Map<string, {
      rawDocType: string;
      rawDocNumber: string;
      rawRut: string;
      rawName: string;
      issueDate: string;
      dueDate?: string;
      costCenter?: string;
      expenseItem?: string;
      project?: string;
      product?: string;
      debitSum: number;
      creditSum: number;
      normRut: string;
      normFolio: string;
    }>();

    vouchers.forEach(v => {
      if (v.status === 'Anulado') return;
      v.lines?.forEach(l => {
        if (l.accountId === accId || l.accountCode === accCode) {
          const normRut = normalizeRut(l.auxiliaryRut);
          const normFolio = normalizeFolio(l.documentRef);
          const rawDocRef = (l.documentRef || 'S/N').trim();
          
          // Primary key by normalized RUT and normalized Folio
          const key = normFolio ? `${normRut}__${normFolio}` : `${normRut}__${rawDocRef}`;
          
          const current = lineBalancesMap.get(key) || {
            rawDocType: l.documentType || (isHonorarios ? 'BHE' : 'DTE 33'),
            rawDocNumber: rawDocRef,
            rawRut: l.auxiliaryRut || '',
            rawName: l.auxiliaryName || '',
            issueDate: v.date,
            dueDate: l.dueDate,
            costCenter: l.costCenter,
            expenseItem: l.expenseItem,
            project: l.project,
            product: l.product,
            debitSum: 0,
            creditSum: 0,
            normRut,
            normFolio
          };

          current.debitSum += Number(l.debit) || 0;
          current.creditSum += Number(l.credit) || 0;
          lineBalancesMap.set(key, current);
        }
      });
    });

    // Nota de crédito (tipo 61): código, o texto del documento
    // El comprobante de centralización guarda la referencia como "<tipo> #<folio>" (ej. "61 #200"); 61 y 112 son notas de crédito
    const tipoDesdeRef = (ref: any): string => {
      const m = /^\s*(?:DTE\s*)?(\d{2,3})\s*#/i.exec(String(ref || ''));
      return m ? m[1] : '';
    };
    const esNC = (type: any, ref?: any): boolean => {
      const t0 = normalizeDocType(type);
      if (t0 === '61' || t0 === '112') return true;
      const tr = tipoDesdeRef(ref);
      if (tr === '61' || tr === '112') return true;
      const t = `${type || ''} ${ref || ''}`.toUpperCase();
      return /NOTA\s*(DE)?\s*CR[EÉ]DITO|\bNC\b/.test(t);
    };

    const matchedVoucherKeys = new Set<string>();

    // 2. Process RCV Documents (SII register: Compras, Honorarios, Ventas)
    if (rcvDocuments.length > 0) {
      let targetDocs: RCVDocument[] = [];
      if (isHonorarios) {
        targetDocs = rcvDocuments.filter(d => d.tipoRegistro === 'Honorarios' || d.tipoDoc === 'BHE' || d.tipoDoc === '70');
      } else if (isProveedores) {
        targetDocs = rcvDocuments.filter(d => d.tipoRegistro === 'Compra');
      } else if (isClientes) {
        targetDocs = rcvDocuments.filter(d => d.tipoRegistro === 'Venta');
      }

      for (const doc of targetDocs) {
          if (doc.estadoPago === 'Pagada' || doc.estadoCobranza === 'Pagada') continue;
        const isClientDoc = isClientes;
        const rawRut = isClientDoc ? doc.rutReceptor : doc.rutEmisor;
        const rawName = isClientDoc ? doc.razonSocialReceptor : doc.razonSocialEmisor;
        const normRut = normalizeRut(rawRut);
        const normFolio = normalizeFolio(doc.folio);
        const rcvKey = `${normRut}__${normFolio}`;

        let docTotal = 0;
        if (isHonorarios) {
          const bruto = Number(doc.montoBruto || doc.montoTotal || doc.montoNeto) || 0;
          const retencion = Number(doc.montoRetencion !== undefined ? doc.montoRetencion : (doc.montoIva || 0)) || 0;
          const liquido = Number(doc.montoLiquido !== undefined && doc.montoLiquido > 0 ? doc.montoLiquido : (bruto - retencion)) || 0;
          docTotal = liquido > 0 ? liquido : bruto;
        } else {
          docTotal = Number(doc.montoTotal) || 0;
        }
        const docEsNC = esNC(doc.tipoDoc, doc.nombreTipoDoc);
        if (docEsNC) docTotal = Math.abs(docTotal);
        if (docTotal <= 0) continue;

        // CASE A: The document has ALREADY been centralized / recorded in accounting vouchers
        const vEntry = lineBalancesMap.get(rcvKey);
        if (vEntry) {
          matchedVoucherKeys.add(rcvKey);
          const netBalance = isAP ? (vEntry.creditSum - vEntry.debitSum) : (vEntry.debitSum - vEntry.creditSum);
          
          // Only show if there is an open balance remaining in the accounting ledger
          // (una nota de crédito centralizada queda con saldo negativo y también se muestra)
          if (netBalance > 0 || (docEsNC && netBalance < 0)) {
            items.push({
              id: `unified_${rcvKey}`,
              docType: doc.tipoDoc ? String(doc.tipoDoc) : (vEntry.rawDocType || (isHonorarios ? 'BHE' : '33')),
              docNumber: doc.folio ? String(doc.folio) : vEntry.rawDocNumber,
              auxiliaryRut: rawRut || vEntry.rawRut,
              auxiliaryName: rawName || vEntry.rawName,
              issueDate: doc.fechaEmision || vEntry.issueDate,
              dueDate: vEntry.dueDate || doc.fechaVencimiento || undefined,
              costCenter: vEntry.costCenter,
              expenseItem: vEntry.expenseItem,
              project: vEntry.project,
              product: vEntry.product,
              originalAmount: docTotal > 0 ? docTotal : (isAP ? vEntry.creditSum : vEntry.debitSum),
              paidAmount: isAP ? vEntry.debitSum : vEntry.creditSum,
              openBalance: netBalance,
              source: 'VOUCHER',
              ...(docEsNC ? { esNotaCredito: true } : {})
            });
          }
          continue;
        }

        // CASE B: The document is in RCV, but has NOT yet been centralized into a voucher
        let paid = 0;
        vouchers.forEach(v => {
          if (v.status === 'Anulado') return;
          v.lines?.forEach(l => {
            if (l.accountId === accId || l.accountCode === accCode) {
              // Facturas: se pagan por el lado contrario al de su origen. Notas de crédito: se aplican por el lado de la factura.
              const debit = Number(l.debit) || 0;
              const credit = Number(l.credit) || 0;
              const monto = docEsNC ? (isAP ? credit : debit) : (isAP ? debit : credit);
              if (monto > 0) {
                const lineRutNorm = normalizeRut(l.auxiliaryRut);
                const lineFolioNorm = normalizeFolio(l.documentRef);
                if (lineRutNorm === normRut && (!normFolio || lineFolioNorm === normFolio)) {
                  paid += monto;
                }
              }
            }
          });
        });

        const pending = Math.max(0, docTotal - paid);
        if (pending > 0) {
          console.log('DEBUG: Adding pending RCV item:', { doc, pending, docTotal, paid });
          items.push({
            id: `rcv_${doc.id || doc.folio}_${normRut}`,
            docType: doc.tipoDoc ? String(doc.tipoDoc) : (isHonorarios ? 'BHE' : '33'),
            docNumber: String(doc.folio || ''),
            auxiliaryRut: rawRut || '',
            auxiliaryName: rawName || '',
            issueDate: doc.fechaEmision,
            dueDate: doc.fechaVencimiento || undefined,
            originalAmount: docTotal,
            paidAmount: paid,
            openBalance: docEsNC ? -pending : pending,
            source: 'RCV',
            ...(docEsNC ? { esNotaCredito: true } : {})
          });
        }
      }
    }

    // 3. Gather remaining Accounting Vouchers that were not matched to any RCV document
    // (e.g. manual entries, foreign supplier invoices, prior period balances)
    lineBalancesMap.forEach((data, key) => {
      if (matchedVoucherKeys.has(key)) return; // Already unified with RCV record

      const netBalance = isAP ? (data.creditSum - data.debitSum) : (data.debitSum - data.creditSum);
      const voucherEsNC = esNC(data.rawDocType, data.rawDocNumber);
      if (netBalance > 0 || (voucherEsNC && netBalance < 0)) {
        const tipoRef = tipoDesdeRef(data.rawDocNumber);
        const folioRef = /#\s*(\S+)\s*$/.exec(data.rawDocNumber)?.[1] || '';
        items.push({
          id: `voucher_${key}`,
          docType: tipoRef || data.rawDocType,
          docNumber: tipoRef && folioRef ? folioRef : data.rawDocNumber,
          auxiliaryRut: data.rawRut,
          auxiliaryName: data.rawName,
          issueDate: data.issueDate,
          dueDate: data.dueDate,
          costCenter: data.costCenter,
          expenseItem: data.expenseItem,
          project: data.project,
          product: data.product,
          originalAmount: isAP ? data.creditSum : data.debitSum,
          paidAmount: isAP ? data.debitSum : data.creditSum,
          openBalance: netBalance,
          source: 'VOUCHER',
          ...(voucherEsNC && netBalance < 0 ? { esNotaCredito: true } : {})
        });
      }
    });

    return items;
}

/** Naturaleza de la cuenta (proveedores, clientes, honorarios) según su nombre y código. */
export function getAccountKind(selectedAccount: ChartOfAccount | undefined, isCharge: boolean): AccountKind {
  if (!selectedAccount) return { isAP: isCharge, isHonorarios: false, isProveedores: false, isClientes: false };
  const code0 = selectedAccount.code || '';
  const type = (selectedAccount.type || '').toLowerCase();
  const name = (selectedAccount.name || '').toLowerCase();
  const code = code0.replace(/\./g, '');

  let isAP: boolean;
  if (code0.startsWith('2') || type.includes('pasivo') || name.includes('proveedor') || name.includes('acreedor') || name.includes('pagar') || name.includes('honorario')) {
    isAP = true;
  } else if (code0.startsWith('1') || type.includes('activo') || name.includes('cliente') || name.includes('cobrar') || name.includes('préstamo') || name.includes('prestamo')) {
    isAP = false;
  } else {
    isAP = isCharge;
  }

  const isHonorarios = name.includes('honorario') || name.includes('bhe') || name.includes('bhr') || code === '2101003' || (code.startsWith('2101') && name.includes('honorario'));
  const isProveedores = !isHonorarios && (
    name.includes('proveedor') ||
    name.includes('facturas por pagar') ||
    name.includes('factura por pagar') ||
    name.includes('cuentas por pagar') ||
    name.includes('cuenta por pagar') ||
    name.includes('acreedores comerciales') ||
    code === '2101001' ||
    (code.startsWith('2101') && !name.includes('honorario') && !name.includes('retencion'))
  );
  const isClientes =
    name.includes('cliente') ||
    name.includes('facturas por cobrar') ||
    name.includes('factura por cobrar') ||
    name.includes('cuentas por cobrar') ||
    name.includes('cuenta por cobrar') ||
    name.includes('deudores') ||
    code.startsWith('1102') ||
    code === '1102001' ||
    code === '1102002';
  return { isAP, isHonorarios, isProveedores, isClientes };
}
