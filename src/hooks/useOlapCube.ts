import { useState, useMemo, useCallback } from 'react';
import { Voucher, ChartOfAccount, Auxiliary } from '../types';
import {
  OlapCube,
  OlapFact,
  OlapFilterState,
  OlapPivotConfig,
  OlapTreeNode,
  FinancialKpiMetrics
} from '../utils/olapCubeEngine';

export interface UseOlapCubeOptions {
  vouchers: Voucher[];
  accounts: ChartOfAccount[];
  auxiliaries?: Auxiliary[];
}

export function useOlapCube({ vouchers, accounts, auxiliaries = [] }: UseOlapCubeOptions) {
  // Instancia única del Cubo OLAP
  const cube = useMemo(() => new OlapCube(), []);

  // Mapas rápidos para resolución de metadatos O(1)
  const accountsMap = useMemo(() => {
    const map = new Map<string, ChartOfAccount>();
    accounts.forEach(a => {
      map.set(a.id, a);
      map.set(a.code, a);
    });
    return map;
  }, [accounts]);

  const auxiliariesMap = useMemo(() => {
    const map = new Map<string, Auxiliary>();
    auxiliaries.forEach(a => {
      map.set(a.rut, a);
    });
    return map;
  }, [auxiliaries]);

  // Ingesta automática en memoria cada vez que cambien los comprobantes o el plan
  useMemo(() => {
    cube.ingest(vouchers, accountsMap, auxiliariesMap);
  }, [cube, vouchers, accountsMap, auxiliariesMap]);

  // Estados de control del usuario
  const [filters, setFilters] = useState<OlapFilterState>({});
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(new Set());
  
  // Configuración de la matriz pivot (Por defecto: Clase -> Grupo -> Cuenta Imputable)
  const [pivotConfig, setPivotConfig] = useState<OlapPivotConfig>({
    rowDimensions: ['accountClass', 'accountGroup', 'accountCode'],
    columnDimension: 'period',
    measure: 'net'
  });

  // Hechos resultantes tras aplicar slicing/filtros cruzados
  const filteredFacts = useMemo(() => {
    return cube.queryFacts(filters);
  }, [cube, filters]);

  // Matriz pivot calculada y árbol jerárquico
  const pivotResult = useMemo(() => {
    return cube.buildPivotTree(filteredFacts, pivotConfig, expandedNodeIds);
  }, [cube, filteredFacts, pivotConfig, expandedNodeIds]);

  // KPIs Financieros Instantáneos Calculados desde el Cubo
  const kpiMetrics: FinancialKpiMetrics = useMemo(() => {
    return cube.calculateFinancialKpis(filteredFacts);
  }, [cube, filteredFacts]);

  // Manejador de expansión y contracción de nodos (Drill-Down)
  const toggleNodeExpand = useCallback((nodeId: string) => {
    setExpandedNodeIds(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  const expandAll = useCallback((nodeIds: string[]) => {
    setExpandedNodeIds(new Set(nodeIds));
  }, []);

  const collapseAll = useCallback(() => {
    setExpandedNodeIds(new Set());
  }, []);

  // Filtrado cruzado con un clic (Cross-filtering)
  const crossFilterBy = useCallback((dimension: keyof OlapFilterState, value: string) => {
    setFilters(prev => {
      const currentValues = (prev[dimension] as string[]) || [];
      const isSelected = currentValues.includes(value);
      return {
        ...prev,
        [dimension]: isSelected
          ? currentValues.filter(v => v !== value)
          : [...currentValues, value]
      };
    });
  }, []);

  const clearAllFilters = useCallback(() => {
    setFilters({});
  }, []);

  return {
    cube,
    filters,
    setFilters,
    filteredFacts,
    pivotConfig,
    setPivotConfig,
    expandedNodeIds,
    toggleNodeExpand,
    expandAll,
    collapseAll,
    crossFilterBy,
    clearAllFilters,
    pivotResult,
    kpiMetrics
  };
}
