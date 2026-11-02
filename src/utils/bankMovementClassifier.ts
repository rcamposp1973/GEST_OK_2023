import { BankStatementLine, ChartOfAccount, Voucher, JuniorGlossRule } from '../types';

/**
 * Clasificador por capas de movimientos de cartola.
 * Principio: SOLO propone cuentas que existen en el plan de cuentas de la empresa
 * (nunca códigos fijos) y entrega una explicación y un nivel de confianza.
 *
 * Capas (de la más confiable a la menos):
 *   1. REGLA        -> reglas guardadas por el contador (juniorGlossRules)
 *   2. HISTORIAL    -> cómo se contabilizó antes un movimiento parecido en esta empresa
 *   3. DICCIONARIO  -> conceptos típicos (comisiones, leyes sociales, impuestos...) resueltos
 *                      contra los nombres reales del plan de cuentas
 */

export type ProposalSource = 'REGLA' | 'HISTORIAL' | 'DICCIONARIO';
export type ProposalLevel = 'VERDE' | 'AMARILLO' | 'ROJO';

export interface MovementProposal {
  accountId: string;
  accountCode: string;
  accountName: string;
  voucherType: 'Ingreso' | 'Egreso' | 'Traspaso';
  confidence: number; // 0..1
  level: ProposalLevel;
  source: ProposalSource;
  reason: string;
  category: string;
  /** true cuando el movimiento normalmente se reparte entre varias cuentas (ej. Previred) */
  requiresSplit?: boolean;
  /** true cuando NO debe contabilizarse como gasto/ingreso (ej. traspaso entre cuentas propias) */
  isInternalTransfer?: boolean;
}

export function levelFromConfidence(c: number): ProposalLevel {
  if (c >= 0.9) return 'VERDE';
  if (c >= 0.6) return 'AMARILLO';
  return 'ROJO';
}

const norm = (s: string) =>
  (s || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Clave estable de una glosa: sin números, fechas ni palabras de relleno. */
export function glossKey(description: string): string {
  const stop = new Set(['DE', 'DEL', 'LA', 'EL', 'A', 'POR', 'TEF', 'TRF', 'TRANSFERENCIA', 'TRANSF', 'PAGO', 'ABONO', 'CARGO', 'SPA', 'LTDA', 'SA', 'EIRL']);
  return norm(description)
    .replace(/[0-9.\-/]+/g, ' ')
    .split(' ')
    .filter(w => w.length > 2 && !stop.has(w))
    .slice(0, 3)
    .join(' ');
}

const accText = (a: ChartOfAccount) => norm(`${a.name || ''}`);

function findAccount(
  accounts: ChartOfAccount[],
  patterns: RegExp[],
  types?: ChartOfAccount['type'][]
): ChartOfAccount | undefined {
  const imputables = accounts.filter(a => a.isImputable !== false);
  for (const p of patterns) {
    const hit = imputables.find(a => (!types || types.includes(a.type)) && p.test(accText(a)));
    if (hit) return hit;
  }
  return undefined;
}

interface DictEntry {
  category: string;
  test: (glosa: string, isCharge: boolean) => boolean;
  patterns: RegExp[];
  types?: ChartOfAccount['type'][];
  voucherType: 'Ingreso' | 'Egreso' | 'Traspaso';
  confidence: number;
  reason: string;
  requiresSplit?: boolean;
  isInternalTransfer?: boolean;
}

const DICTIONARY: DictEntry[] = [
  {
    category: 'IVA de comisión bancaria',
    test: (g, c) => c && /IVA\s*(DE\s*)?COMIS|IVA\s*MANTENC|IVA\s*SEGURO/.test(g),
    patterns: [/IVA.*CREDITO/, /CREDITO.*FISCAL/],
    types: ['Activo'],
    voucherType: 'Egreso',
    confidence: 0.7,
    reason: 'IVA cobrado por el banco sobre una comisión: normalmente va a IVA crédito fiscal.'
  },
  {
    category: 'Comisión bancaria',
    test: (g, c) => c && /COMISION|COMIS\.|MANTENCION|MANTENC|SEGURO FRAUDE|GASTO ADM|INTERES SOBREGIRO|LINEA SOBREGIRO|IMPUESTO TIMBRES|COBRO SERVICIO/.test(g),
    patterns: [/COMISION.*BANC/, /GASTOS?.*BANC/, /COMISIONES?/, /GASTOS?.*FINANC/, /INTERESES?.*Y.*GASTOS/],
    types: ['Gasto'],
    voucherType: 'Egreso',
    confidence: 0.93,
    reason: 'Cargo del banco por comisión o mantención de cuenta.'
  },
  {
    category: 'Leyes sociales (Previred)',
    test: (g, c) => c && /PREVIRED|COTIZACION|COTIZ\.|AFP|ISAPRE|FONASA|MUTUAL/.test(g),
    patterns: [/LEYES?.*SOCIAL/, /PREVIRED/, /COTIZACIONES?.*PAGAR/, /OBLIGACIONES?.*PREVISION/, /IMPOSICIONES.*PAGAR/],
    types: ['Pasivo'],
    voucherType: 'Egreso',
    confidence: 0.8,
    reason: 'Pago de cotizaciones previsionales. Normalmente se reparte entre AFP, salud y otros.',
    requiresSplit: true
  },
  {
    category: 'Impuestos (F29 / Tesorería)',
    test: (g, c) => c && /TESORERIA|TGR|F29|SERVICIO DE IMPUESTOS|SII\b/.test(g),
    patterns: [/IVA.*PAGAR/, /IMPUESTOS?.*PAGAR/, /F[\s-]?29/, /RETENCIONES?.*PAGAR/],
    types: ['Pasivo'],
    voucherType: 'Egreso',
    confidence: 0.75,
    reason: 'Pago a Tesorería. Puede incluir IVA, PPM y retenciones: conviene revisar el reparto.',
    requiresSplit: true
  },
  {
    category: 'Liquidación de tarjetas (Transbank)',
    test: (g, c) => !c && /TRANSBANK|TBK|WEBPAY|REDCOMPRA|GETNET|MERCADOPAGO|SUMUP|KLAP/.test(g),
    patterns: [/TRANSBANK/, /TARJETAS?.*POR.*COBRAR/, /TARJETAS?.*CREDITO.*COBRAR/, /DOCUMENTOS?.*POR.*COBRAR/],
    types: ['Activo'],
    voucherType: 'Ingreso',
    confidence: 0.7,
    reason: 'Abono de un procesador de pagos: normalmente cancela ventas con tarjeta por cobrar.'
  },
  {
    category: 'Servicios básicos y telecomunicaciones',
    test: (g, c) => c && /\bPAC\b|ENTEL|MOVISTAR|CLARO|\bWOM\b|VTR|CGE|ENEL|SAESA|AGUAS|ESSBIO|ESVAL|METROGAS|CHILQUINTA|GTD|MUNDO PACIFICO/.test(g),
    patterns: [/SERVICIOS?.*BASIC/, /TELEFON/, /COMUNICACION/, /ELECTRICIDAD|LUZ\b/, /AGUA\b/],
    types: ['Gasto'],
    voucherType: 'Egreso',
    confidence: 0.8,
    reason: 'Cuenta de servicios (teléfono, luz, agua, internet).'
  },
  {
    category: 'Traspaso entre cuentas propias',
    test: (g) => /TRASPASO A CUENTA PROPIA|TRASP.*ENTRE CTA|TRANSFERENCIA PROPIA|TRASPASO.*CTA|FONDO MUTUO|RESCATE INVERSION/.test(g),
    patterns: [],
    voucherType: 'Traspaso',
    confidence: 0.85,
    reason: 'Movimiento entre cuentas de la misma empresa: se concilia con el otro banco, no es gasto ni ingreso.',
    isInternalTransfer: true
  }
];

export interface ClassifierContext {
  accounts: ChartOfAccount[];
  vouchers: Voucher[];
  rules: JuniorGlossRule[];
  bankAccountId: string;
}

function ruleMatches(rule: JuniorGlossRule, glosa: string, isCharge: boolean): boolean {
  if (rule.isActive === false) return false;
  if (rule.movementType === 'CARGO' && !isCharge) return false;
  if (rule.movementType === 'ABONO' && isCharge) return false;
  const pat = norm(rule.pattern || '');
  if (!pat) return false;
  switch (rule.matchType) {
    case 'EXACT': return glosa === pat;
    case 'STARTS_WITH': return glosa.startsWith(pat);
    default: return glosa.includes(pat);
  }
}

/** Cómo se contabilizó antes un movimiento con la misma clave de glosa. */
function fromHistory(
  line: BankStatementLine,
  isCharge: boolean,
  ctx: ClassifierContext
): MovementProposal | null {
  const key = glossKey(line.description);
  if (!key) return null;

  const counts = new Map<string, { n: number; line: any; type: Voucher['type'] }>();
  for (const v of ctx.vouchers) {
    if ((v as any).status === 'Anulado') continue;
    if (glossKey(v.gloss || '') !== key) continue;
    const vl: any[] = v.lines || [];
    if (!vl.some(l => l.accountId === ctx.bankAccountId)) continue;
    const counter = vl.find(l => l.accountId !== ctx.bankAccountId &&
      (isCharge ? Number(l.debit) > 0 : Number(l.credit) > 0));
    if (!counter) continue;
    const cur = counts.get(counter.accountId);
    counts.set(counter.accountId, { n: (cur?.n || 0) + 1, line: counter, type: v.type });
  }
  if (counts.size === 0) return null;

  const best = [...counts.values()].sort((a, b) => b.n - a.n)[0];
  const total = [...counts.values()].reduce((s, x) => s + x.n, 0);
  const consistency = best.n / total;
  const acc = ctx.accounts.find(a => a.id === best.line.accountId);
  if (!acc) return null;

  const confidence = Math.min(0.95, (0.55 + 0.1 * best.n) * (0.5 + 0.5 * consistency));
  return {
    accountId: acc.id,
    accountCode: acc.code,
    accountName: acc.name,
    voucherType: isCharge ? 'Egreso' : 'Ingreso',
    confidence,
    level: levelFromConfidence(confidence),
    source: 'HISTORIAL',
    category: 'Según historial de la empresa',
    reason: `Movimientos parecidos ("${key}") se contabilizaron ${best.n} vez/veces en "${acc.name}".`
  };
}

export function classifyMovement(
  line: BankStatementLine,
  ctx: ClassifierContext
): MovementProposal | null {
  const isCharge = (line.charge || 0) > 0;
  const glosa = norm(line.description);
  if (!glosa) return null;

  // 1) Reglas guardadas
  for (const r of ctx.rules) {
    if (!ruleMatches(r, glosa, isCharge)) continue;
    const acc = ctx.accounts.find(a => a.id === r.accountId || a.code === r.accountCode);
    if (!acc) continue; // regla apunta a una cuenta que ya no existe: se ignora
    return {
      accountId: acc.id,
      accountCode: acc.code,
      accountName: acc.name,
      voucherType: isCharge ? 'Egreso' : 'Ingreso',
      confidence: 0.96,
      level: 'VERDE',
      source: 'REGLA',
      category: r.title || 'Regla guardada',
      reason: `Regla guardada: glosa que contiene "${r.pattern}".`
    };
  }

  // 2) Historial
  const hist = fromHistory(line, isCharge, ctx);
  if (hist && hist.confidence >= 0.6) return hist;

  // 3) Diccionario resuelto contra el plan real
  for (const e of DICTIONARY) {
    if (!e.test(glosa, isCharge)) continue;
    if (e.isInternalTransfer) {
      return {
        accountId: '', accountCode: '', accountName: '',
        voucherType: 'Traspaso',
        confidence: e.confidence, level: levelFromConfidence(e.confidence),
        source: 'DICCIONARIO', category: e.category, reason: e.reason,
        isInternalTransfer: true
      };
    }
    const acc = findAccount(ctx.accounts, e.patterns, e.types);
    if (!acc) {
      // El concepto es reconocible pero esta empresa no tiene una cuenta evidente: NO se inventa una.
      return {
        accountId: '', accountCode: '', accountName: '',
        voucherType: e.voucherType,
        confidence: 0.3, level: 'ROJO',
        source: 'DICCIONARIO', category: e.category,
        reason: `${e.reason} No encontré una cuenta adecuada en el plan de cuentas de esta empresa: elige una.`,
        requiresSplit: e.requiresSplit
      };
    }
    return {
      accountId: acc.id, accountCode: acc.code, accountName: acc.name,
      voucherType: e.voucherType,
      confidence: e.confidence, level: levelFromConfidence(e.confidence),
      source: 'DICCIONARIO', category: e.category, reason: e.reason,
      requiresSplit: e.requiresSplit
    };
  }

  // 4) Historial débil como último recurso (amarillo/rojo)
  return hist;
}
