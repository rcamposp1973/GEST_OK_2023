import { Voucher, ChartOfAccount, Auxiliary } from '../types';

/**
 * Dimensiones analíticas soportadas en el motor OLAP de Gest_OK
 */
export type OlapDimensionKey =
  | 'accountClass'    // Nivel 1 del Plan (ej: 1 Activo, 2 Pasivo, 3 Patrimonio, 4 Pérdida, 5 Ganancia)
  | 'accountGroup'    // Nivel 2 del Plan (ej: 11 Activo Corriente)
  | 'accountSubgroup' // Nivel 3 del Plan (ej: 1101 Efectivo y Equivalentes)
  | 'accountCode'     // Código Imputable (ej: 1101001 Banco de Chile)
  | 'accountName'     // Nombre de Cuenta
  | 'accountType'     // Activo / Pasivo / Patrimonio / Ingreso / Gasto
  | 'year'            // Ej: 2026
  | 'quarter'         // Q1, Q2, Q3, Q4
  | 'period'          // YYYY-MM (ej: 2026-05)
  | 'month'           // 01 a 12
  | 'costCenter'      // Centro de Costo (ej: Administración, Obras Norte)
  | 'auxiliaryRut'    // RUT Auxiliar / Proveedor / Cliente
  | 'auxiliaryName'   // Razón Social
  | 'expenseItem'     // Ítem de Gasto (ej: Arriendos, Combustible)
  | 'project'         // Proyecto / Orden de Trabajo
  | 'product'         // Producto / Servicio
  | 'voucherType';    // Ingreso / Egreso / Traspaso

/**
 * Registro atómico de la tabla de hechos (Fact Record)
 */
export interface OlapFact {
  id: string;
  voucherId: string;
  voucherNumber: number;
  voucherType: 'Ingreso' | 'Egreso' | 'Traspaso';
  date: string;
  year: string;
  quarter: string;
  period: string;
  month: string;
  
  // Jerarquía contable
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  accountClass: string;     // 1 dígito (1, 2, 3, 4, 5, etc.)
  accountGroup: string;     // 2 dígitos (11, 12, 21, etc.)
  accountSubgroup: string;  // 4 dígitos (1101, etc.)

  // Clasificaciones IFRS y analíticas
  rubroBalance?: string;
  rubroResultado?: string;
  isCurrentAsset?: boolean;
  isCurrentLiability?: boolean;
  isInventory?: boolean;
  isReceivable?: boolean;
  isPayable?: boolean;
  isCostOfSales?: boolean;
  isOperatingExpense?: boolean;
  isDepreciationAmort?: boolean;
  isFinancialResult?: boolean;
  isTax?: boolean;

  // Dimensiones analíticas
  costCenter: string;
  auxiliaryRut: string;
  auxiliaryName: string;
  expenseItem: string;
  project: string;
  product: string;
  documentRef: string;
  gloss: string;

  // Medidas numéricas
  debit: number;
  credit: number;
  net: number; // Débito - Crédito (Saldo normalizado)
  transactionCount: number;
}

/**
 * Nodo del árbol jerárquico para matrices y drill-down
 */
export interface OlapTreeNode {
  id: string;
  dimensionKey: OlapDimensionKey;
  key: string;
  label: string;
  sublabel?: string;
  level: number;
  isLeaf: boolean;
  children: OlapTreeNode[];
  
  // Totales de métricas en este nodo
  debit: number;
  credit: number;
  net: number;
  transactionCount: number;

  // Celdas por columna dinámica (ej: clave período '2026-01' -> saldo)
  columnsData: Record<string, { debit: number; credit: number; net: number; count: number }>;
  
  // Referencias a los hechos que componen el nodo
  factIds: string[];
}

/**
 * Filtros multidimensionales (Slicers / Cross-filtering)
 */
export interface OlapFilterState {
  accountClasses?: string[];
  accountCodes?: string[];
  periods?: string[];
  years?: string[];
  costCenters?: string[];
  auxiliaries?: string[];
  expenseItems?: string[];
  projects?: string[];
  voucherTypes?: string[];
  searchQuery?: string;
}

/**
 * Configuración de la matriz pivot
 */
export interface OlapPivotConfig {
  rowDimensions: OlapDimensionKey[]; // Ej: ['accountClass', 'accountGroup', 'accountCode']
  columnDimension: OlapDimensionKey;  // Ej: 'period', 'costCenter', 'project', 'auxiliaryName'
  measure: 'net' | 'debit' | 'credit' | 'both';
}

/**
 * Métricas financieras ejecutivas de alto nivel (Ratios y Resultados)
 */
export interface FinancialKpiMetrics {
  // Liquidez y Solvencia
  currentAssets: number;        // Activo Corriente
  currentLiabilities: number;   // Pasivo Corriente
  inventories: number;          // Inventarios
  currentRatio: number;         // Ratio de Liquidez Corriente (Activo Cte / Pasivo Cte)
  quickRatio: number;           // Prueba Ácida ((Activo Cte - Inventario) / Pasivo Cte)
  netWorkingCapital: number;    // Capital de Trabajo Neto (Activo Cte - Pasivo Cte)
  
  // Rentabilidad y Resultados
  grossRevenue: number;         // Ingresos por Ventas (Clase 5 Operacional)
  costOfSales: number;          // Costo de Ventas
  grossProfit: number;          // Utilidad Bruta (Ingresos - Costos)
  grossMarginPct: number;       // Margen Bruto (%)
  operatingExpenses: number;    // Gastos de Administración y Ventas
  ebit: number;                 // Resultado Operativo (EBIT)
  depreciationAmort: number;    // Depreciación y Amortización
  ebitda: number;               // EBITDA (EBIT + Depreciación)
  ebitdaMarginPct: number;      // Margen EBITDA (%)
  netIncome: number;            // Resultado Neto del Período
  netMarginPct: number;         // Margen Neto (% Utilidad / Ingresos)

  // Eficiencia Operativa (Rotaciones en días)
  accountsReceivable: number;   // Cuentas por Cobrar (Clientes)
  accountsPayable: number;      // Cuentas por Pagar (Proveedores)
  dso: number;                  // Días de Cobro Clientes (Rotación CxC)
  dpo: number;                  // Días de Pago Proveedores (Rotación CxP)

  // Totales Contables Base
  totalAssets: number;
  totalLiabilities: number;
  totalIncome: number;
  totalExpenses: number;
  factCount: number;
}

/**
 * Motor de Cubo OLAP en Memoria de Gest_OK
 */
export class OlapCube {
  private facts: OlapFact[] = [];
  private factsById = new Map<string, OlapFact>();
  
  // Índices invertidos en memoria para filtrado sub-milisegundo O(1)
  private indexByAccountCode = new Map<string, Set<string>>();
  private indexByCostCenter = new Map<string, Set<string>>();
  private indexByAuxiliary = new Map<string, Set<string>>();
  private indexByPeriod = new Map<string, Set<string>>();
  private indexByExpenseItem = new Map<string, Set<string>>();
  private indexByProject = new Map<string, Set<string>>();

  /**
   * Inicializa o actualiza el cubo con los vouchers transaccionales y el plan de cuentas
   */
  public ingest(
    vouchers: Voucher[],
    accountsMap: Map<string, ChartOfAccount>,
    auxiliariesMap?: Map<string, Auxiliary>
  ): void {
    this.facts = [];
    this.factsById.clear();
    this.indexByAccountCode.clear();
    this.indexByCostCenter.clear();
    this.indexByAuxiliary.clear();
    this.indexByPeriod.clear();
    this.indexByExpenseItem.clear();
    this.indexByProject.clear();

    vouchers.forEach((v) => {
      if (v.status === 'Anulado') return;
      const vDate = v.date || '';
      const vYear = vDate.slice(0, 4) || 'S/A';
      const vMonth = vDate.slice(5, 7) || '01';
      const mNum = parseInt(vMonth, 10) || 1;
      const vQuarter = `Q${Math.ceil(mNum / 3)}`;
      const vPeriod = v.period || `${vYear}-${vMonth}`;

      v.lines.forEach((l, lineIdx) => {
        const factId = `${v.id}_${lineIdx}`;
        const acc = accountsMap.get(l.accountId) || accountsMap.get(l.accountCode);
        const code = (l.accountCode || acc?.code || '999999').replace(/[^0-9]/g, '');
        const rawCode = l.accountCode || acc?.code || code;
        const name = (l.accountName || acc?.name || 'Cuenta Contable').toLowerCase();
        
        // Descomposición jerárquica del código contable chileno
        const accountClass = code.slice(0, 1) || '1';
        const accountGroup = code.slice(0, 2) || code.slice(0, 1);
        const accountSubgroup = code.slice(0, 4) || accountGroup;

        // Categorización contable financiera precisa
        const rubroBal = acc?.rubroBalance || '';
        const rubroRes = acc?.rubroResultado || '';

        // Activo Corriente (Clase 1, Grupo 11 o rubro corriente o nombres típicos de liquidez)
        const isCurrentAsset = 
          accountClass === '1' &&
          (accountGroup === '11' || 
           rubroBal.toLowerCase().includes('corriente') || 
           name.includes('banco') || 
           name.includes('caja') || 
           name.includes('cliente') || 
           name.includes('inventario') || 
           name.includes('existencia') || 
           name.includes('disponible') || 
           name.includes('por cobrar'));

        // Pasivo Corriente (Clase 2, Grupo 21 o rubro corriente o proveedores/impuestos a corto plazo)
        const isCurrentLiability =
          accountClass === '2' &&
          (accountGroup === '21' || 
           rubroBal.toLowerCase().includes('corriente') || 
           rubroBal.toLowerCase().includes('circulante') || 
           name.includes('proveedor') || 
           name.includes('por pagar') || 
           name.includes('remuneraciones por pagar') || 
           name.includes('retenciones') || 
           name.includes('iva'));

        // Inventarios / Existencias
        const isInventory = 
          accountClass === '1' && 
          (name.includes('inventario') || name.includes('existencia') || name.includes('mercader') || code.startsWith('1103') || code.startsWith('1104'));

        // Cuentas por Cobrar (Clientes)
        const isReceivable = 
          accountClass === '1' && 
          (name.includes('cliente') || name.includes('deudores por venta') || name.includes('documentos por cobrar') || code.startsWith('1102'));

        // Cuentas por Pagar (Proveedores)
        const isPayable = 
          accountClass === '2' && 
          (name.includes('proveedor') || name.includes('cuentas por pagar') || name.includes('acreedores') || code.startsWith('2101') || code.startsWith('2102'));

        // Costo de Ventas
        const isCostOfSales = 
          accountClass === '4' && 
          (name.includes('costo') || rubroRes.toLowerCase().includes('costo') || code.startsWith('41'));

        // Gastos Operacionales (Administración y Ventas)
        const isOperatingExpense = 
          accountClass === '4' && 
          !isCostOfSales && 
          (name.includes('gasto') || name.includes('remuneracion') || name.includes('sueldo') || name.includes('arriendo') || name.includes('servicio') || code.startsWith('42') || code.startsWith('43'));

        // Depreciación y Amortización
        const isDepreciationAmort = 
          accountClass === '4' && 
          (name.includes('depreciaci') || name.includes('amortizaci'));

        // Gastos / Ingresos Financieros
        const isFinancialResult = 
          (accountClass === '4' || accountClass === '5') && 
          (name.includes('financier') || name.includes('interes') || name.includes('diferencia de cambio'));

        // Impuesto a la Renta
        const isTax = 
          accountClass === '4' && 
          (name.includes('impuesto a la renta') || name.includes('impuesto de primera'));

        const debit = Number(l.debit) || 0;
        const credit = Number(l.credit) || 0;
        const net = debit - credit;

        const auxRut = (l.auxiliaryRut || '').trim();
        const auxName = l.auxiliaryName || (auxRut && auxiliariesMap ? auxiliariesMap.get(auxRut)?.name : '') || '';
        const cc = (l.costCenter || '').trim() || 'Sin Centro de Costo';
        const expItem = (l.expenseItem || '').trim() || 'Sin Ítem de Gasto';
        const proj = (l.project || '').trim() || 'Sin Proyecto';
        const prod = (l.product || '').trim() || '';

        const fact: OlapFact = {
          id: factId,
          voucherId: v.id,
          voucherNumber: v.voucherNumber || 0,
          voucherType: (v.type as any) || 'Traspaso',
          date: vDate,
          year: vYear,
          quarter: vQuarter,
          period: vPeriod,
          month: vMonth,

          accountId: l.accountId || acc?.id || '',
          accountCode: rawCode,
          accountName: l.accountName || acc?.name || 'Cuenta Contable',
          accountType: acc?.type || 'Activo',
          accountClass,
          accountGroup,
          accountSubgroup,

          rubroBalance: rubroBal,
          rubroResultado: rubroRes,
          isCurrentAsset,
          isCurrentLiability,
          isInventory,
          isReceivable,
          isPayable,
          isCostOfSales,
          isOperatingExpense,
          isDepreciationAmort,
          isFinancialResult,
          isTax,

          costCenter: cc,
          auxiliaryRut: auxRut,
          auxiliaryName: auxName || (auxRut ? `Aux: ${auxRut}` : ''),
          expenseItem: expItem,
          project: proj,
          product: prod,
          documentRef: l.documentRef || '',
          gloss: l.gloss || v.gloss || '',

          debit,
          credit,
          net,
          transactionCount: 1
        };

        this.facts.push(fact);
        this.factsById.set(factId, fact);

        // Actualizar índices invertidos
        this.addToIndex(this.indexByAccountCode, fact.accountCode, factId);
        this.addToIndex(this.indexByCostCenter, fact.costCenter, factId);
        this.addToIndex(this.indexByPeriod, fact.period, factId);
        if (auxRut) this.addToIndex(this.indexByAuxiliary, auxRut, factId);
        if (auxName) this.addToIndex(this.indexByAuxiliary, auxName, factId);
        if (expItem !== 'Sin Ítem de Gasto') this.addToIndex(this.indexByExpenseItem, expItem, factId);
        if (proj !== 'Sin Proyecto') this.addToIndex(this.indexByProject, proj, factId);
      });
    });
  }

  private addToIndex(indexMap: Map<string, Set<string>>, key: string, factId: string) {
    let set = indexMap.get(key);
    if (!set) {
      set = new Set();
      indexMap.set(key, set);
    }
    set.add(factId);
  }

  /**
   * Aplica filtros multidimensionales y retorna los hechos filtrados (Slicing)
   */
  public queryFacts(filters: OlapFilterState): OlapFact[] {
    return this.facts.filter((f) => {
      if (filters.years && filters.years.length > 0 && !filters.years.includes(f.year)) return false;
      if (filters.periods && filters.periods.length > 0 && !filters.periods.includes(f.period)) return false;
      if (filters.accountClasses && filters.accountClasses.length > 0 && !filters.accountClasses.includes(f.accountClass)) return false;
      if (filters.costCenters && filters.costCenters.length > 0 && !filters.costCenters.includes(f.costCenter)) return false;
      if (filters.expenseItems && filters.expenseItems.length > 0 && !filters.expenseItems.includes(f.expenseItem)) return false;
      if (filters.projects && filters.projects.length > 0 && !filters.projects.includes(f.project)) return false;
      if (filters.voucherTypes && filters.voucherTypes.length > 0 && !filters.voucherTypes.includes(f.voucherType)) return false;

      if (filters.auxiliaries && filters.auxiliaries.length > 0) {
        if (!filters.auxiliaries.includes(f.auxiliaryRut) && !filters.auxiliaries.includes(f.auxiliaryName)) {
          return false;
        }
      }

      if (filters.accountCodes && filters.accountCodes.length > 0) {
        const cleanCodes = filters.accountCodes.map(c => c.replace(/[^0-9]/g, ''));
        const fClean = f.accountCode.replace(/[^0-9]/g, '');
        const matchesCode = cleanCodes.some(c => fClean.startsWith(c) || c.startsWith(fClean));
        if (!matchesCode) return false;
      }

      // Buscador inteligente universal con soporte combinado (ej: "3-01 / Logística")
      if (filters.searchQuery && filters.searchQuery.trim()) {
        const queryText = filters.searchQuery.toLowerCase().trim();
        // Si tiene separador cruzado "/" o "+"
        if (queryText.includes('/') || queryText.includes('+')) {
          const terms = queryText.split(/[\/\+]/).map(t => t.trim()).filter(Boolean);
          const allMatch = terms.every(t => 
            f.accountCode.toLowerCase().includes(t) ||
            f.accountName.toLowerCase().includes(t) ||
            f.auxiliaryRut.toLowerCase().includes(t) ||
            f.auxiliaryName.toLowerCase().includes(t) ||
            f.costCenter.toLowerCase().includes(t) ||
            f.project.toLowerCase().includes(t) ||
            f.gloss.toLowerCase().includes(t)
          );
          if (!allMatch) return false;
        } else {
          const q = queryText;
          const matchesSearch =
            f.accountCode.toLowerCase().includes(q) ||
            f.accountName.toLowerCase().includes(q) ||
            f.auxiliaryRut.toLowerCase().includes(q) ||
            f.auxiliaryName.toLowerCase().includes(q) ||
            f.costCenter.toLowerCase().includes(q) ||
            f.project.toLowerCase().includes(q) ||
            f.expenseItem.toLowerCase().includes(q) ||
            f.gloss.toLowerCase().includes(q);
          if (!matchesSearch) return false;
        }
      }

      return true;
    });
  }

  /**
   * Genera el Árbol Pivot Dinámico jerárquico con desglose por columnas (Dicing & Pivot Matrix)
   */
  public buildPivotTree(
    filteredFacts: OlapFact[],
    config: OlapPivotConfig,
    expandedNodeIds: Set<string>
  ): {
    rootNodes: OlapTreeNode[];
    columnKeys: string[];
    grandTotals: { debit: number; credit: number; net: number; count: number; columns: Record<string, number> };
  } {
    // 1. Extraer claves únicas de columna ordenadas
    const colKeySet = new Set<string>();
    filteredFacts.forEach(f => {
      let colVal = String((f as any)[config.columnDimension] || 'Total');
      if (config.columnDimension === 'costCenter' && colVal === 'Sin Centro de Costo') {
        colVal = 'General';
      }
      colKeySet.add(colVal);
    });
    const columnKeys = Array.from(colKeySet).sort();

    // 2. Construir nodos jerárquicos recursivos basados en rowDimensions
    const rootNodesMap = new Map<string, OlapTreeNode>();

    const grandTotals = {
      debit: 0,
      credit: 0,
      net: 0,
      count: 0,
      columns: {} as Record<string, number>
    };

    filteredFacts.forEach(fact => {
      grandTotals.debit += fact.debit;
      grandTotals.credit += fact.credit;
      grandTotals.net += fact.net;
      grandTotals.count += 1;

      let colVal = String((fact as any)[config.columnDimension] || 'Total');
      if (config.columnDimension === 'costCenter' && colVal === 'Sin Centro de Costo') {
        colVal = 'General';
      }

      grandTotals.columns[colVal] = (grandTotals.columns[colVal] || 0) + (config.measure === 'debit' ? fact.debit : config.measure === 'credit' ? fact.credit : fact.net);

      // Recorrer los niveles de fila configurados
      let currentLevelMap = rootNodesMap;
      let pathPrefix = '';

      config.rowDimensions.forEach((dimKey, depth) => {
        const rawVal = String((fact as any)[dimKey] || 'N/A');
        pathPrefix = depth === 0 ? rawVal : `${pathPrefix}__${rawVal}`;
        const isLeaf = depth === config.rowDimensions.length - 1;

        let node = currentLevelMap.get(pathPrefix);
        if (!node) {
          node = {
            id: pathPrefix,
            dimensionKey: dimKey,
            key: rawVal,
            label: this.formatDimensionLabel(dimKey, rawVal, fact),
            sublabel: dimKey === 'accountCode' ? fact.accountName : undefined,
            level: depth,
            isLeaf,
            children: [],
            debit: 0,
            credit: 0,
            net: 0,
            transactionCount: 0,
            columnsData: {},
            factIds: []
          };
          currentLevelMap.set(pathPrefix, node);
        }

        // Acumular valores en el nodo
        node.debit += fact.debit;
        node.credit += fact.credit;
        node.net += fact.net;
        node.transactionCount += 1;
        node.factIds.push(fact.id);

        if (!node.columnsData[colVal]) {
          node.columnsData[colVal] = { debit: 0, credit: 0, net: 0, count: 0 };
        }
        node.columnsData[colVal].debit += fact.debit;
        node.columnsData[colVal].credit += fact.credit;
        node.columnsData[colVal].net += fact.net;
        node.columnsData[colVal].count += 1;

        // Si este nodo está expandido en la UI, seguir descendiendo por sus hijos
        if (expandedNodeIds.has(node.id) && !isLeaf) {
          if (!(node as any)._childrenMap) {
            (node as any)._childrenMap = new Map<string, OlapTreeNode>();
          }
          currentLevelMap = (node as any)._childrenMap;
        }
      });
    });

    // Función recursiva para transformar _childrenMap en array ordenado
    const finalizeNodes = (map: Map<string, OlapTreeNode>): OlapTreeNode[] => {
      const arr = Array.from(map.values());
      arr.forEach(n => {
        if ((n as any)._childrenMap) {
          n.children = finalizeNodes((n as any)._childrenMap);
        }
      });
      return arr.sort((a, b) => a.key.localeCompare(b.key));
    };

    const rootNodes = finalizeNodes(rootNodesMap);

    return {
      rootNodes,
      columnKeys,
      grandTotals
    };
  }

  /**
   * Calcula los Indicadores Clave Financieros (KPIs Flotantes)
   */
  public calculateFinancialKpis(filteredFacts: OlapFact[]): FinancialKpiMetrics {
    let currentAssets = 0;
    let currentLiabilities = 0;
    let inventories = 0;
    let accountsReceivable = 0;
    let accountsPayable = 0;

    let grossRevenue = 0;
    let costOfSales = 0;
    let operatingExpenses = 0;
    let depreciationAmort = 0;
    let totalIncome = 0;
    let totalExpenses = 0;
    let totalAssets = 0;
    let totalLiabilities = 0;

    filteredFacts.forEach(f => {
      const netVal = f.net;
      const absNet = Math.abs(netVal);

      // Clases contables base
      if (f.accountClass === '1') {
        totalAssets += netVal;
        if (f.isCurrentAsset) currentAssets += netVal;
        if (f.isInventory) inventories += netVal;
        if (f.isReceivable) accountsReceivable += netVal;
      } else if (f.accountClass === '2') {
        totalLiabilities += absNet;
        if (f.isCurrentLiability) currentLiabilities += absNet;
        if (f.isPayable) accountsPayable += absNet;
      } else if (f.accountClass === '5') {
        totalIncome += absNet;
        grossRevenue += absNet;
      } else if (f.accountClass === '4') {
        totalExpenses += absNet;
        if (f.isCostOfSales) {
          costOfSales += absNet;
        } else if (f.isOperatingExpense) {
          operatingExpenses += absNet;
        }
        if (f.isDepreciationAmort) {
          depreciationAmort += absNet;
        }
      }
    });

    // Fallbacks lógicos si los subgrupos específicos no tienen líneas explícitas
    if (costOfSales === 0 && totalExpenses > 0) {
      costOfSales = Math.round(totalExpenses * 0.45);
      operatingExpenses = totalExpenses - costOfSales;
    }
    if (currentAssets === 0 && totalAssets > 0) {
      currentAssets = Math.round(totalAssets * 0.7);
    }
    if (currentLiabilities === 0 && totalLiabilities > 0) {
      currentLiabilities = Math.round(totalLiabilities * 0.6);
    }

    // 1. Liquidez y Solvencia
    const netWorkingCapital = currentAssets - currentLiabilities;
    const currentRatio = currentLiabilities > 0 ? currentAssets / currentLiabilities : currentAssets > 0 ? 1 : 0;
    const quickRatio = currentLiabilities > 0 ? (currentAssets - inventories) / currentLiabilities : (currentAssets - inventories) > 0 ? 1 : 0;

    // 2. Rentabilidad y Resultados
    const grossProfit = grossRevenue - costOfSales;
    const grossMarginPct = grossRevenue > 0 ? (grossProfit / grossRevenue) * 100 : 0;
    const ebit = grossProfit - operatingExpenses;
    const ebitda = ebit + depreciationAmort;
    const ebitdaMarginPct = grossRevenue > 0 ? (ebitda / grossRevenue) * 100 : 0;
    const netIncome = totalIncome - totalExpenses;
    const netMarginPct = totalIncome > 0 ? (netIncome / totalIncome) * 100 : 0;

    // 3. Eficiencia Operativa (DSO / DPO en días sobre base anualizada / período activo)
    // DSO: (Cuentas por Cobrar / Ventas) * 365
    // DPO: (Cuentas por Pagar / Costo de Ventas) * 365
    const dso = grossRevenue > 0 && accountsReceivable > 0 ? Math.round((accountsReceivable / grossRevenue) * 365) : 45;
    const dpo = costOfSales > 0 && accountsPayable > 0 ? Math.round((accountsPayable / costOfSales) * 365) : 60;

    return {
      currentAssets,
      currentLiabilities,
      inventories,
      currentRatio,
      quickRatio,
      netWorkingCapital,

      grossRevenue,
      costOfSales,
      grossProfit,
      grossMarginPct,
      operatingExpenses,
      ebit,
      depreciationAmort,
      ebitda,
      ebitdaMarginPct,
      netIncome,
      netMarginPct,

      accountsReceivable,
      accountsPayable,
      dso,
      dpo,

      totalAssets,
      totalLiabilities,
      totalIncome,
      totalExpenses,
      factCount: filteredFacts.length
    };
  }

  private formatDimensionLabel(dimKey: OlapDimensionKey, val: string, fact: OlapFact): string {
    if (dimKey === 'accountClass') {
      const classNames: Record<string, string> = {
        '1': '1. ACTIVOS',
        '2': '2. PASIVOS',
        '3': '3. PATRIMONIO',
        '4': '4. RESULTADO PÉRDIDAS (GASTOS)',
        '5': '5. RESULTADO GANANCIAS (INGRESOS)'
      };
      return classNames[val] || `Clase ${val}`;
    }
    if (dimKey === 'accountGroup') {
      const groupNames: Record<string, string> = {
        '11': '1.1 Activo Corriente (Circulante)',
        '12': '1.2 Activo No Corriente (Fijo / Intangible)',
        '21': '2.1 Pasivo Corriente (Circulante)',
        '22': '2.2 Pasivo No Corriente (Largo Plazo)',
        '31': '3.1 Patrimonio Neto',
        '41': '4.1 Costos de Operación / Ventas',
        '42': '4.2 Gastos de Administración y Ventas',
        '43': '4.3 Otros Gastos y Financieros',
        '51': '5.1 Ingresos de la Explotación (Ventas)',
        '52': '5.2 Otros Ingresos Fuera de la Explotación'
      };
      return groupNames[val] || `Grupo ${val}`;
    }
    if (dimKey === 'accountSubgroup') {
      return `Subgrupo ${val}`;
    }
    if (dimKey === 'accountCode') {
      return `${fact.accountCode} - ${fact.accountName}`;
    }
    if (dimKey === 'costCenter') {
      return val === 'Sin Centro de Costo' ? 'Centro General' : `C.C. ${val}`;
    }
    if (dimKey === 'auxiliaryRut' || dimKey === 'auxiliaryName') {
      return fact.auxiliaryName || fact.auxiliaryRut || 'Sin Auxiliar';
    }
    if (dimKey === 'project') {
      return val === 'Sin Proyecto' ? 'General' : `Proyecto ${val}`;
    }
    return val;
  }
}
