import { BankStatementLine, ChartOfAccount, Auxiliary, Company } from '../types';
import { auth } from '../lib/firebase';

export interface Agent1ClassificationResult {
  transactionId: string;
  classification: 
    | 'CLIENT_PAYMENT' 
    | 'VENDOR_PAYMENT' 
    | 'FINANCIAL_OPERATION' 
    | 'INTERNAL_TRANSFER' 
    | 'TAX_OR_PAYROLL' 
    | 'UNKNOWN_OR_AMBIGUOUS';
  confidence: number;
  detectedEntity: {
    name: string;
    rut?: string;
    entityType: 'CUSTOMER' | 'SUPPLIER' | 'BANK' | 'TAX_ENTITY' | 'INTERNAL' | 'UNKNOWN';
  };
  suggestedAccount?: {
    code?: string;
    name?: string;
  };
  suggestedContraAccount?: {
    code?: string;
    name?: string;
  };
  suggestedVoucherType: 'Ingreso' | 'Egreso' | 'Traspaso';
  routingTarget: 
    | 'AGENT_2_COLLECTIONS' 
    | 'AGENT_3_PAYMENTS' 
    | 'DIRECT_BANK_EXPENSE' 
    | 'INTERBANK_TRANSFER' 
    | 'MANUAL_REVIEW';
  explanation: string;
  recommendedAction: 
    | 'APLICAR_COMISION_BANCARIA' 
    | 'ENVIAR_A_COBRANZAS' 
    | 'ENVIAR_A_PAGOS_PROVEEDORES' 
    | 'CONCILIAR_INTERBANCARIO' 
    | 'REVISAR_MANUAL';
}

export interface Agent1Response {
  success: boolean;
  source: string;
  model?: string;
  classifiedCount: number;
  results: Agent1ClassificationResult[];
  error?: string;
}

export async function runAgent1Conciliador(params: {
  studyId: string;
  company: Company;
  transactions: BankStatementLine[];
  accounts: ChartOfAccount[];
  auxiliaries?: Auxiliary[];
  userId?: string;
}): Promise<Agent1Response> {
  const { studyId, company, transactions, accounts, auxiliaries = [], userId = 'current_user' } = params;

  try {
    const payload = {
      securityEnvelope: {
        studyId,
        companyId: company.id,
        userId,
        traceId: `agent1-${Date.now()}`
      },
      companyContext: {
        id: company.id,
        rut: company.rut,
        name: company.name,
        giro: company.giro
      },
      transactions: transactions.map(t => ({
        id: t.id,
        date: t.date,
        rawGlosa: t.description || '',
        charge: t.charge || 0,
        deposit: t.deposit || 0,
        documentNumber: t.documentNumber || ''
      })),
      availableAccounts: accounts.map(a => ({
        id: a.id,
        code: a.code,
        name: a.name,
        type: a.type || (a as any).tipo || ''
      })),
      knownAuxiliaries: auxiliaries.slice(0, 50).map(aux => ({
        rut: aux.rut,
        name: aux.name,
        type: aux.role || (aux as any).tipo || ''
      }))
    };

    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) {
      throw new Error("Sesión expirada. Vuelve a iniciar sesión.");
    }

    const res = await fetch('/api/agents/conciliador', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || `Error HTTP ${res.status} al consultar Agente 1`);
    }

    const data: Agent1Response = await res.json();
    return data;
  } catch (err: any) {
    console.error('[Agent1] Error de ejecución:', err);
    throw err;
  }
}
