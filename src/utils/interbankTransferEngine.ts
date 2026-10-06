import { db, auth } from '../lib/firebase';
import { 
  collection, 
  getDocs, 
  doc, 
  addDoc, 
  updateDoc 
} from 'firebase/firestore';
import { 
  Company, 
  ChartOfAccount, 
  Voucher, 
  VoucherLine, 
  BankStatementLine, 
  BankReconciliation, 
  FiscalPeriodYear 
} from '../types';
import { getNextOpenPeriodAndDate } from './periodUtils';
import { logAuditEvent } from './auditLogger';

// Helper to sanitize undefined values before saving to Firestore
const sanitizeForFirestore = (obj: any): any => {
  if (obj === undefined) return null;
  if (obj === null) return null;
  if (Array.isArray(obj)) return obj.map(sanitizeForFirestore);
  if (typeof obj === 'object') {
    const clean: any = {};
    for (const key of Object.keys(obj)) {
      if (obj[key] !== undefined) {
        clean[key] = sanitizeForFirestore(obj[key]);
      }
    }
    return clean;
  }
  return obj;
};

export interface InterbankTransferProposal {
  id: string; // Unique proposal ID
  originBankAccountId: string;
  originBankAccountCode: string;
  originBankAccountName: string;
  destinationBankAccountId: string;
  destinationBankAccountCode: string;
  destinationBankAccountName: string;
  totalAmount: number;
  matchType: 'ONE_TO_ONE' | 'MANY_TO_ONE' | 'ONE_TO_MANY' | 'MANY_TO_MANY';
  originLines: {
    recId: string;
    period: string;
    line: BankStatementLine;
  }[];
  destinationLines: {
    recId: string;
    period: string;
    line: BankStatementLine;
  }[];
  originDates: string[];
  destinationDates: string[];
  earliestDate: string;
  latestDate: string;
  suggestedVoucherDate: string;
  suggestedPeriod: string;
  daysDifference: number;
  confidence: number; // 0 to 100
  confidenceReason: string;
  selected: boolean;
  status: 'PENDIENTE' | 'CONTABILIZADO';
  createdVoucherId?: string;
  createdVoucherNumber?: number;
}

export interface InterbankScanOptions {
  periodFilter?: string; // 'TODOS' or specific period like '2026-09' or empty for all
  selectedPeriods?: string[]; // Specific list of periods (e.g. ['2026-01', ..., '2026-09'])
  originBankAccountId?: string; // 'TODOS' or specific bank account ID
  destinationBankAccountId?: string; // 'TODOS' or specific bank account ID
  maxDayDifference?: number; // Default 1 (allows 0 or +1 day difference)
  allowNegativeDayDiff?: boolean; // Default true (allows destination date to be ±1 day of origin date)
}

export interface InterbankExecutionResult {
  success: boolean;
  totalVouchersCreated: number;
  totalOriginLinesReconciled: number;
  totalDestinationLinesReconciled: number;
  totalAmountTransferred: number;
  createdVouchers: {
    voucherId: string;
    voucherNumber: number;
    amount: number;
    originBank: string;
    destinationBank: string;
    period: string;
    date: string;
  }[];
  errors: string[];
}

/**
 * Calculates calendar day difference between date2 and date1 (date2 - date1)
 */
function getDayDifference(date1Str: string, date2Str: string): number {
  try {
    const d1 = new Date(date1Str + 'T00:00:00');
    const d2 = new Date(date2Str + 'T00:00:00');
    const diffTime = d2.getTime() - d1.getTime();
    return Math.round(diffTime / (1000 * 60 * 60 * 24));
  } catch {
    return 0;
  }
}

/**
 * Checks if a glosa/description hints at an interbank transfer
 */
function containsTransferKeywords(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return (
    lower.includes('traspaso') ||
    lower.includes('transf') ||
    lower.includes('transferencia') ||
    lower.includes('tef') ||
    lower.includes('propia') ||
    lower.includes('mismo titular') ||
    lower.includes('fondos') ||
    lower.includes('banco') ||
    lower.includes('cta cte') ||
    lower.includes('cuenta')
  );
}

/**
 * Scans all bank accounts and cartolas across periods to detect candidate interbank transfers
 */
export function findInterbankTransferProposals(
  bankAccounts: ChartOfAccount[],
  reconciliations: BankReconciliation[],
  options: InterbankScanOptions = {}
): InterbankTransferProposal[] {
  const {
    periodFilter = 'TODOS',
    selectedPeriods = [],
    originBankAccountId = 'TODOS',
    destinationBankAccountId = 'TODOS',
    maxDayDifference = 1,
    allowNegativeDayDiff = true
  } = options;

  if (bankAccounts.length < 2) {
    // Need at least 2 bank accounts to have interbank transfers
    return [];
  }

  // 1. Collect all unreconciled charges and deposits across all bank accounts and periods
  interface RawCandidate {
    recId: string;
    period: string;
    bankAccountId: string;
    bankAccountCode: string;
    bankAccountName: string;
    line: BankStatementLine;
    amount: number;
    date: string;
    type: 'CARGO' | 'ABONO';
  }

  const allCharges: RawCandidate[] = [];
  const allDeposits: RawCandidate[] = [];

  for (const rec of reconciliations) {
    // Period filter check
    if (periodFilter !== 'TODOS' && rec.period !== periodFilter) {
      continue;
    }
    if (selectedPeriods.length > 0 && !selectedPeriods.includes(rec.period)) {
      continue;
    }

    const bankAcc = bankAccounts.find(a => a.id === rec.bankAccountId || a.code === rec.bankAccountCode);
    if (!bankAcc) continue;

    for (const line of (rec.lines || [])) {
      // Must be unconciliated
      if (line.matchedStatus === 'Conciliado' || line.matchedVoucherId) {
        continue;
      }

      const charge = Math.round(Number(line.charge || 0));
      const deposit = Math.round(Number(line.deposit || 0));

      if (charge > 0 && deposit === 0) {
        allCharges.push({
          recId: rec.id,
          period: rec.period,
          bankAccountId: bankAcc.id,
          bankAccountCode: bankAcc.code,
          bankAccountName: bankAcc.name,
          line,
          amount: charge,
          date: line.date,
          type: 'CARGO'
        });
      } else if (deposit > 0 && charge === 0) {
        allDeposits.push({
          recId: rec.id,
          period: rec.period,
          bankAccountId: bankAcc.id,
          bankAccountCode: bankAcc.code,
          bankAccountName: bankAcc.name,
          line,
          amount: deposit,
          date: line.date,
          type: 'ABONO'
        });
      }
    }
  }

  const proposals: InterbankTransferProposal[] = [];
  const usedChargeLineIds = new Set<string>();
  const usedDepositLineIds = new Set<string>();

  // Filter pairs according to options
  const targetBankAccounts = bankAccounts;

  // PASS 1: Exact 1 to 1 Match (1 Cargo en Banco A = 1 Abono en Banco B por el mismo monto exacto)
  for (const charge of allCharges) {
    if (usedChargeLineIds.has(charge.line.id)) continue;
    if (originBankAccountId !== 'TODOS' && charge.bankAccountId !== originBankAccountId) continue;

    // Look for matching deposit in any other bank account
    let bestMatch: RawCandidate | null = null;
    let minDayDiff = 999;

    for (const deposit of allDeposits) {
      if (usedDepositLineIds.has(deposit.line.id)) continue;
      if (deposit.bankAccountId === charge.bankAccountId) continue; // Must be different bank account!
      if (destinationBankAccountId !== 'TODOS' && deposit.bankAccountId !== destinationBankAccountId) continue;

      if (deposit.amount === charge.amount) {
        const dayDiff = getDayDifference(charge.date, deposit.date);
        
        // Date tolerance check: deposit is either same day, +1 day, or within ±maxDayDifference
        const isValidDate = allowNegativeDayDiff
          ? Math.abs(dayDiff) <= maxDayDifference
          : (dayDiff >= 0 && dayDiff <= maxDayDifference);

        if (isValidDate) {
          if (Math.abs(dayDiff) < Math.abs(minDayDiff)) {
            minDayDiff = dayDiff;
            bestMatch = deposit;
          }
        }
      }
    }

    if (bestMatch) {
      usedChargeLineIds.add(charge.line.id);
      usedDepositLineIds.add(bestMatch.line.id);

      const hasKeywords = containsTransferKeywords(charge.line.description) || containsTransferKeywords(bestMatch.line.description);
      let confidence = 95;
      let confidenceReason = `Monto exacto ($${charge.amount.toLocaleString('es-CL')})`;
      
      if (minDayDiff === 0) {
        confidence = 100;
        confidenceReason += ' en el mismo día';
      } else if (minDayDiff === 1) {
        confidence = 98;
        confidenceReason += ' con cargo y abono al día siguiente (+1 día)';
      } else {
        confidence = 90;
        confidenceReason += ` con diferencia de ${Math.abs(minDayDiff)} día(s)`;
      }

      if (hasKeywords) {
        confidence = Math.min(100, confidence + 5);
        confidenceReason += ' y glosa con referencia a transferencia';
      }

      proposals.push({
        id: `prop_1_1_${charge.line.id}_${bestMatch.line.id}`,
        originBankAccountId: charge.bankAccountId,
        originBankAccountCode: charge.bankAccountCode,
        originBankAccountName: charge.bankAccountName,
        destinationBankAccountId: bestMatch.bankAccountId,
        destinationBankAccountCode: bestMatch.bankAccountCode,
        destinationBankAccountName: bestMatch.bankAccountName,
        totalAmount: charge.amount,
        matchType: 'ONE_TO_ONE',
        originLines: [{
          recId: charge.recId,
          period: charge.period,
          line: charge.line
        }],
        destinationLines: [{
          recId: bestMatch.recId,
          period: bestMatch.period,
          line: bestMatch.line
        }],
        originDates: [charge.date],
        destinationDates: [bestMatch.date],
        earliestDate: charge.date < bestMatch.date ? charge.date : bestMatch.date,
        latestDate: charge.date > bestMatch.date ? charge.date : bestMatch.date,
        suggestedVoucherDate: charge.date,
        suggestedPeriod: charge.period,
        daysDifference: minDayDiff,
        confidence,
        confidenceReason,
        selected: true,
        status: 'PENDIENTE'
      });
    }
  }

  // PASS 2: N to 1 Match (Múltiples transferencias en Banco Origen = 1 Abono total en Banco Destino)
  // Ejemplo del usuario: 10 transferencias de $7.000.000 = 1 abono de $70.000.000
  for (const deposit of allDeposits) {
    if (usedDepositLineIds.has(deposit.line.id)) continue;
    if (destinationBankAccountId !== 'TODOS' && deposit.bankAccountId !== destinationBankAccountId) continue;

    // For each potential origin bank
    for (const originAcc of targetBankAccounts) {
      if (originAcc.id === deposit.bankAccountId) continue;
      if (originBankAccountId !== 'TODOS' && originAcc.id !== originBankAccountId) continue;

      // Find unused charges in this origin bank occurring near the deposit date
      const candidateCharges = allCharges.filter(c => 
        !usedChargeLineIds.has(c.line.id) &&
        c.bankAccountId === originAcc.id &&
        (allowNegativeDayDiff
          ? Math.abs(getDayDifference(c.date, deposit.date)) <= maxDayDifference
          : (getDayDifference(c.date, deposit.date) >= 0 && getDayDifference(c.date, deposit.date) <= maxDayDifference))
      );

      if (candidateCharges.length < 2) continue;

      // Check if all candidate charges sum up exactly to the deposit
      const totalCandidateSum = candidateCharges.reduce((acc, c) => acc + c.amount, 0);

      if (totalCandidateSum === deposit.amount) {
        // Perfect match of all candidates!
        candidateCharges.forEach(c => usedChargeLineIds.add(c.line.id));
        usedDepositLineIds.add(deposit.line.id);

        const dates = candidateCharges.map(c => c.date);
        const earliestDate = [deposit.date, ...dates].sort()[0];
        const latestDate = [deposit.date, ...dates].sort().reverse()[0];

        proposals.push({
          id: `prop_N_1_${deposit.line.id}_${candidateCharges.map(c => c.line.id).join('_').slice(0, 30)}`,
          originBankAccountId: originAcc.id,
          originBankAccountCode: originAcc.code,
          originBankAccountName: originAcc.name,
          destinationBankAccountId: deposit.bankAccountId,
          destinationBankAccountCode: deposit.bankAccountCode,
          destinationBankAccountName: deposit.bankAccountName,
          totalAmount: deposit.amount,
          matchType: 'MANY_TO_ONE',
          originLines: candidateCharges.map(c => ({
            recId: c.recId,
            period: c.period,
            line: c.line
          })),
          destinationLines: [{
            recId: deposit.recId,
            period: deposit.period,
            line: deposit.line
          }],
          originDates: Array.from(new Set(dates)),
          destinationDates: [deposit.date],
          earliestDate,
          latestDate,
          suggestedVoucherDate: earliestDate,
          suggestedPeriod: candidateCharges[0].period,
          daysDifference: getDayDifference(candidateCharges[0].date, deposit.date),
          confidence: 96,
          confidenceReason: `Suma exacta de ${candidateCharges.length} transferencias ($${deposit.amount.toLocaleString('es-CL')}) hacia 1 abono concentrado`,
          selected: true,
          status: 'PENDIENTE'
        });
        break;
      }

      // Check subset sum (e.g. if same-amount transfers like 10 x $7.000.000 exist among other charges)
      const sameAmountCharges = candidateCharges.filter(c => deposit.amount % c.amount === 0);
      if (sameAmountCharges.length >= 2) {
        const itemAmount = sameAmountCharges[0].amount;
        const requiredCount = Math.round(deposit.amount / itemAmount);
        const matchingSubset = sameAmountCharges.filter(c => c.amount === itemAmount).slice(0, requiredCount);

        if (matchingSubset.length === requiredCount) {
          matchingSubset.forEach(c => usedChargeLineIds.add(c.line.id));
          usedDepositLineIds.add(deposit.line.id);

          const dates = matchingSubset.map(c => c.date);
          const earliestDate = [deposit.date, ...dates].sort()[0];
          const latestDate = [deposit.date, ...dates].sort().reverse()[0];

          proposals.push({
            id: `prop_N_1_subset_${deposit.line.id}_${matchingSubset.map(c => c.line.id).join('_').slice(0, 30)}`,
            originBankAccountId: originAcc.id,
            originBankAccountCode: originAcc.code,
            originBankAccountName: originAcc.name,
            destinationBankAccountId: deposit.bankAccountId,
            destinationBankAccountCode: deposit.bankAccountCode,
            destinationBankAccountName: deposit.bankAccountName,
            totalAmount: deposit.amount,
            matchType: 'MANY_TO_ONE',
            originLines: matchingSubset.map(c => ({
              recId: c.recId,
              period: c.period,
              line: c.line
            })),
            destinationLines: [{
              recId: deposit.recId,
              period: deposit.period,
              line: deposit.line
            }],
            originDates: Array.from(new Set(dates)),
            destinationDates: [deposit.date],
            earliestDate,
            latestDate,
            suggestedVoucherDate: earliestDate,
            suggestedPeriod: matchingSubset[0].period,
            daysDifference: getDayDifference(matchingSubset[0].date, deposit.date),
            confidence: 98,
            confidenceReason: `${requiredCount} transferencias de $${itemAmount.toLocaleString('es-CL')} cada una = 1 abono de $${deposit.amount.toLocaleString('es-CL')}`,
            selected: true,
            status: 'PENDIENTE'
          });
          break;
        }
      }
    }
  }

  // PASS 3: 1 to N Match (1 Cargo único en Banco Origen = Múltiples abonos fraccionados en Banco Destino)
  for (const charge of allCharges) {
    if (usedChargeLineIds.has(charge.line.id)) continue;
    if (originBankAccountId !== 'TODOS' && charge.bankAccountId !== originBankAccountId) continue;

    for (const destAcc of targetBankAccounts) {
      if (destAcc.id === charge.bankAccountId) continue;
      if (destinationBankAccountId !== 'TODOS' && destAcc.id !== destinationBankAccountId) continue;

      const candidateDeposits = allDeposits.filter(d => 
        !usedDepositLineIds.has(d.line.id) &&
        d.bankAccountId === destAcc.id &&
        (allowNegativeDayDiff
          ? Math.abs(getDayDifference(charge.date, d.date)) <= maxDayDifference
          : (getDayDifference(charge.date, d.date) >= 0 && getDayDifference(charge.date, d.date) <= maxDayDifference))
      );

      if (candidateDeposits.length < 2) continue;

      const totalDepositSum = candidateDeposits.reduce((acc, d) => acc + d.amount, 0);
      if (totalDepositSum === charge.amount) {
        usedChargeLineIds.add(charge.line.id);
        candidateDeposits.forEach(d => usedDepositLineIds.add(d.line.id));

        const dates = candidateDeposits.map(d => d.date);
        const earliestDate = [charge.date, ...dates].sort()[0];
        const latestDate = [charge.date, ...dates].sort().reverse()[0];

        proposals.push({
          id: `prop_1_N_${charge.line.id}_${candidateDeposits.map(d => d.line.id).join('_').slice(0, 30)}`,
          originBankAccountId: charge.bankAccountId,
          originBankAccountCode: charge.bankAccountCode,
          originBankAccountName: charge.bankAccountName,
          destinationBankAccountId: destAcc.id,
          destinationBankAccountCode: destAcc.code,
          destinationBankAccountName: destAcc.name,
          totalAmount: charge.amount,
          matchType: 'ONE_TO_MANY',
          originLines: [{
            recId: charge.recId,
            period: charge.period,
            line: charge.line
          }],
          destinationLines: candidateDeposits.map(d => ({
            recId: d.recId,
            period: d.period,
            line: d.line
          })),
          originDates: [charge.date],
          destinationDates: Array.from(new Set(dates)),
          earliestDate,
          latestDate,
          suggestedVoucherDate: charge.date,
          suggestedPeriod: charge.period,
          daysDifference: getDayDifference(charge.date, candidateDeposits[0].date),
          confidence: 96,
          confidenceReason: `1 cargo de $${charge.amount.toLocaleString('es-CL')} transferido en ${candidateDeposits.length} abonos fraccionados`,
          selected: true,
          status: 'PENDIENTE'
        });
        break;
      }
    }
  }

  // PASS 4: N to M Match (Múltiples cargos de igual denominación = Múltiples abonos de igual denominación)
  // Ejemplo: 10 transferencias de $7.000.000 en Banco A y 10 abonos de $7.000.000 en Banco B
  const remainingCharges = allCharges.filter(c => !usedChargeLineIds.has(c.line.id));
  const remainingDeposits = allDeposits.filter(d => !usedDepositLineIds.has(d.line.id));

  for (const originAcc of targetBankAccounts) {
    if (originBankAccountId !== 'TODOS' && originAcc.id !== originBankAccountId) continue;

    for (const destAcc of targetBankAccounts) {
      if (destAcc.id === originAcc.id) continue;
      if (destinationBankAccountId !== 'TODOS' && destAcc.id !== destinationBankAccountId) continue;

      const groupCharges = remainingCharges.filter(c => c.bankAccountId === originAcc.id && !usedChargeLineIds.has(c.line.id));
      const groupDeposits = remainingDeposits.filter(d => d.bankAccountId === destAcc.id && !usedDepositLineIds.has(d.line.id));

      if (groupCharges.length >= 2 && groupDeposits.length >= 2) {
        // Group by amount
        const chargeAmounts = new Set(groupCharges.map(c => c.amount));
        for (const amt of chargeAmounts) {
          const matchCharges = groupCharges.filter(c => c.amount === amt && !usedChargeLineIds.has(c.line.id));
          const matchDeposits = groupDeposits.filter(d => d.amount === amt && !usedDepositLineIds.has(d.line.id));

          if (matchCharges.length >= 2 && matchDeposits.length >= 2 && matchCharges.length === matchDeposits.length) {
            const pairCount = matchCharges.length;
            const totalGroupAmount = amt * pairCount;

            matchCharges.forEach(c => usedChargeLineIds.add(c.line.id));
            matchDeposits.forEach(d => usedDepositLineIds.add(d.line.id));

            const dates = [...matchCharges.map(c => c.date), ...matchDeposits.map(d => d.date)];
            const earliestDate = dates.sort()[0];
            const latestDate = dates.sort().reverse()[0];

            proposals.push({
              id: `prop_N_M_${originAcc.id}_${destAcc.id}_${amt}_${pairCount}`,
              originBankAccountId: originAcc.id,
              originBankAccountCode: originAcc.code,
              originBankAccountName: originAcc.name,
              destinationBankAccountId: destAcc.id,
              destinationBankAccountCode: destAcc.code,
              destinationBankAccountName: destAcc.name,
              totalAmount: totalGroupAmount,
              matchType: 'MANY_TO_MANY',
              originLines: matchCharges.map(c => ({
                recId: c.recId,
                period: c.period,
                line: c.line
              })),
              destinationLines: matchDeposits.map(d => ({
                recId: d.recId,
                period: d.period,
                line: d.line
              })),
              originDates: Array.from(new Set(matchCharges.map(c => c.date))),
              destinationDates: Array.from(new Set(matchDeposits.map(d => d.date))),
              earliestDate,
              latestDate,
              suggestedVoucherDate: earliestDate,
              suggestedPeriod: matchCharges[0].period,
              daysDifference: 0,
              confidence: 97,
              confidenceReason: `${pairCount} transferencias correlativas de $${amt.toLocaleString('es-CL')} cada una ($${totalGroupAmount.toLocaleString('es-CL')} total)`,
              selected: true,
              status: 'PENDIENTE'
            });
          }
        }
      }
    }
  }

  // Sort proposals chronologically by earliestDate descending
  return proposals.sort((a, b) => b.earliestDate.localeCompare(a.earliestDate));
}

/**
 * Executes confirmed interbank transfer proposals:
 * 1. Creates balanced accounting vouchers (Type: 'Traspaso').
 * 2. Reconciles statement lines across both bank accounts in Firestore.
 * 3. Persists updated bankReconciliations.
 */
export async function executeInterbankTransfers(
  studyId: string,
  company: Company,
  proposals: InterbankTransferProposal[],
  fiscalYears: FiscalPeriodYear[],
  onProgress?: (processed: number, total: number, currentMsg: string) => void
): Promise<InterbankExecutionResult> {
  const result: InterbankExecutionResult = {
    success: true,
    totalVouchersCreated: 0,
    totalOriginLinesReconciled: 0,
    totalDestinationLinesReconciled: 0,
    totalAmountTransferred: 0,
    createdVouchers: [],
    errors: []
  };

  const selectedProposals = proposals.filter(p => p.selected && p.status !== 'CONTABILIZADO');
  if (selectedProposals.length === 0) {
    return result;
  }

  const companyRef = doc(db, 'studies', studyId, 'companies', company.id);

  try {
    // 1. Fetch current vouchers to get next sequential numbers
    const vouchersSnap = await getDocs(collection(companyRef, 'vouchers'));
    const existingVouchers = vouchersSnap.docs.map(d => ({ id: d.id, ...d.data() } as Voucher));
    
    // Group existing voucher numbers by type and year
    let maxVoucherNumber = existingVouchers.reduce((max, v) => Math.max(max, Number(v.voucherNumber || 0)), 0);

    // 2. Fetch all bankReconciliations to update them
    const recsSnap = await getDocs(collection(companyRef, 'bankReconciliations'));
    const allReconciliations = recsSnap.docs.map(d => ({ id: d.id, ...d.data() } as BankReconciliation));

    // Map to keep track of reconciliations modified in-memory before writing to Firestore
    const modifiedRecsMap = new Map<string, BankReconciliation>();
    allReconciliations.forEach(r => modifiedRecsMap.set(r.id, { ...r, lines: [...(r.lines || [])] }));

    let processedCount = 0;

    for (const prop of selectedProposals) {
      processedCount++;
      if (onProgress) {
        onProgress(
          processedCount,
          selectedProposals.length,
          `Contabilizando traspaso ${processedCount} de ${selectedProposals.length}: ${prop.originBankAccountName} ➔ ${prop.destinationBankAccountName} ($${prop.totalAmount.toLocaleString('es-CL')})`
        );
      }

      // Check period and shift if closed
      const effective = getNextOpenPeriodAndDate(prop.suggestedVoucherDate, fiscalYears);
      const targetPeriod = effective.period;
      const targetDate = effective.date;

      maxVoucherNumber += 1;
      const nextVoucherNumber = maxVoucherNumber;

      const originCount = prop.originLines.length;
      const destCount = prop.destinationLines.length;
      const transferDesc = originCount > 1 
        ? `${originCount} transferencias` 
        : `Transferencia`;

      const voucherGloss = `Traspaso de fondos ${prop.originBankAccountName} a ${prop.destinationBankAccountName} por $${prop.totalAmount.toLocaleString('es-CL')} (${transferDesc} de fecha ${prop.suggestedVoucherDate})`;

      // Create Voucher Lines:
      // Line 1: Destination Bank (DEBIT = +amount)
      // Line 2: Origin Bank (CREDIT = +amount)
      const voucherLines: VoucherLine[] = [
        {
          id: `line-1-${Date.now()}-dest`,
          accountId: prop.destinationBankAccountId,
          accountCode: prop.destinationBankAccountCode,
          accountName: prop.destinationBankAccountName,
          debit: prop.totalAmount,
          credit: 0,
          gloss: voucherGloss
        },
        {
          id: `line-2-${Date.now()}-orig`,
          accountId: prop.originBankAccountId,
          accountCode: prop.originBankAccountCode,
          accountName: prop.originBankAccountName,
          debit: 0,
          credit: prop.totalAmount,
          gloss: voucherGloss
        }
      ];

      const newVoucherPayload: Omit<Voucher, 'id'> = {
        voucherNumber: nextVoucherNumber,
        companyId: company.id,
        type: 'Traspaso',
        date: targetDate,
        period: targetPeriod,
        gloss: voucherGloss,
        lines: voucherLines,
        totalDebit: prop.totalAmount,
        totalCredit: prop.totalAmount,
        status: 'Valido',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: auth.currentUser?.email || 'sistema-traspasos'
      };

      const sanitizedVoucher = sanitizeForFirestore(newVoucherPayload);
      const voucherDocRef = await addDoc(collection(companyRef, 'vouchers'), sanitizedVoucher);

      // 3. Mark Statement Lines as Conciliated in both Bank Accounts
      let originLinesCount = 0;
      let destLinesCount = 0;

      // Update Origin Lines
      for (const origItem of prop.originLines) {
        let rec = modifiedRecsMap.get(origItem.recId);
        if (!rec) {
          rec = allReconciliations.find(r => r.id === origItem.recId);
          if (rec) modifiedRecsMap.set(rec.id, { ...rec, lines: [...(rec.lines || [])] });
        }

        if (rec) {
          rec.lines = rec.lines.map(l => {
            if (l.id === origItem.line.id) {
              originLinesCount++;
              return {
                ...l,
                matchedStatus: 'Conciliado',
                matchedVoucherId: voucherDocRef.id,
                matchedVoucherNumber: nextVoucherNumber,
                matchedVoucherPeriod: targetPeriod
              };
            }
            return l;
          });
        }
      }

      // Update Destination Lines
      for (const destItem of prop.destinationLines) {
        let rec = modifiedRecsMap.get(destItem.recId);
        if (!rec) {
          rec = allReconciliations.find(r => r.id === destItem.recId);
          if (rec) modifiedRecsMap.set(rec.id, { ...rec, lines: [...(rec.lines || [])] });
        }

        if (rec) {
          rec.lines = rec.lines.map(l => {
            if (l.id === destItem.line.id) {
              destLinesCount++;
              return {
                ...l,
                matchedStatus: 'Conciliado',
                matchedVoucherId: voucherDocRef.id,
                matchedVoucherNumber: nextVoucherNumber,
                matchedVoucherPeriod: targetPeriod
              };
            }
            return l;
          });
        }
      }

      prop.status = 'CONTABILIZADO';
      prop.createdVoucherId = voucherDocRef.id;
      prop.createdVoucherNumber = nextVoucherNumber;

      result.totalVouchersCreated += 1;
      result.totalOriginLinesReconciled += originLinesCount;
      result.totalDestinationLinesReconciled += destLinesCount;
      result.totalAmountTransferred += prop.totalAmount;

      result.createdVouchers.push({
        voucherId: voucherDocRef.id,
        voucherNumber: nextVoucherNumber,
        amount: prop.totalAmount,
        originBank: prop.originBankAccountName,
        destinationBank: prop.destinationBankAccountName,
        period: targetPeriod,
        date: targetDate
      });
    }

    // 4. Save all modified bankReconciliations to Firestore
    for (const rec of modifiedRecsMap.values()) {
      try {
        const sanitizedRec = sanitizeForFirestore({
          lines: rec.lines,
          updatedAt: new Date().toISOString()
        });
        await updateDoc(doc(companyRef, 'bankReconciliations', rec.id), sanitizedRec);
      } catch (saveErr: any) {
        console.warn(`Error actualizando conciliación ${rec.id}:`, saveErr);
        result.errors.push(`Error al guardar conciliación ${rec.bankAccountName} (${rec.period}): ${saveErr.message}`);
      }
    }

    // 5. Audit Log
    try {
      await logAuditEvent({
        studyId,
        companyId: company.id,
        companyName: company.name,
        action: 'CONTABILIZACION_MASIVA_TRASPASOS' as any,
        module: 'Conciliación Bancaria' as any,
        details: `Se generaron automáticamente ${result.totalVouchersCreated} comprobantes de traspaso interbancario por un total de $${result.totalAmountTransferred.toLocaleString('es-CL')}, conciliando ${result.totalOriginLinesReconciled} cargos y ${result.totalDestinationLinesReconciled} abonos.`
      });
    } catch (auditErr) {
      console.warn('No se pudo registrar log de auditoría:', auditErr);
    }

  } catch (err: any) {
    console.error('Error executing interbank transfers:', err);
    result.success = false;
    result.errors.push(err.message || 'Error inesperado durante la ejecución de traspasos interbancarios.');
  }

  return result;
}
