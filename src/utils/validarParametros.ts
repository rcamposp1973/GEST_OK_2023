import { getNaturaleza } from './ifrsClassification';

// Campos de parametrización contable cuya naturaleza está fuera de discusión.
// (Los campos ambiguos, como "exento", no se validan.)
const CAMPOS: { campo: string; etiqueta: string; esperada: 'ACTIVO' | 'PASIVO' | 'INGRESO' | 'GASTO'; texto: string; tambien?: 'ACTIVO' | 'PASIVO' }[] = [
  { campo: 'defaultCustomerAccountId', etiqueta: 'Clientes nacionales', esperada: 'ACTIVO', texto: 'de Activo' },
  { campo: 'foreignCustomerAccountId', etiqueta: 'Clientes extranjeros', esperada: 'ACTIVO', texto: 'de Activo' },
  { campo: 'ivaCreditoAccountId', etiqueta: 'IVA crédito fiscal', esperada: 'ACTIVO', texto: 'de Activo' },
  // Proveedores: normalmente Pasivo, pero una empresa que compra al contado puede usar Caja o Banco (Activo).
  { campo: 'defaultSupplierAccountId', etiqueta: 'Proveedores nacionales', esperada: 'PASIVO', tambien: 'ACTIVO', texto: 'de Pasivo (o de Caja/Banco si compras al contado)' },
  { campo: 'foreignSupplierAccountId', etiqueta: 'Proveedores extranjeros', esperada: 'PASIVO', tambien: 'ACTIVO', texto: 'de Pasivo (o de Caja/Banco si compras al contado)' },
  { campo: 'ivaDebitoAccountId', etiqueta: 'IVA débito fiscal', esperada: 'PASIVO', texto: 'de Pasivo' },
  { campo: 'defaultSalesIncomeAccountId', etiqueta: 'Ingresos por ventas', esperada: 'INGRESO', texto: 'de Ingresos' },
  { campo: 'exportSalesIncomeAccountId', etiqueta: 'Ventas de exportación', esperada: 'INGRESO', texto: 'de Ingresos' },
  { campo: 'defaultCostOrExpenseAccountId', etiqueta: 'Gasto o costo por defecto', esperada: 'GASTO', texto: 'de Gasto o Costo' },
];

/** Devuelve un mensaje por cada campo cuya cuenta no es de la naturaleza que corresponde. Vacío = todo bien. */
export function validarNaturalezaParametros(
  params: Record<string, any>,
  accounts: { id: string; code: string; name: string; type?: string }[]
): string[] {
  const errores: string[] = [];
  for (const c of CAMPOS) {
    const id = params?.[c.campo];
    if (!id) continue;
    const cuenta = accounts.find(a => a.id === id || a.code === id);
    if (!cuenta) continue;
    const nat = getNaturaleza(cuenta as any);
    if (nat !== c.esperada && nat !== c.tambien) {
      errores.push(`${c.etiqueta}: elegiste [${cuenta.code}] ${cuenta.name}, pero debe ser una cuenta ${c.texto}.`);
    }
  }
  return errores;
}
