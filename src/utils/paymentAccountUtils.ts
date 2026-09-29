import { ChartOfAccount } from '../types';

/**
 * Determina si una cuenta es de Banco / Tesorería por defecto
 * (requiere conciliación bancaria o está en el grupo de bancos/disponible).
 */
export function isDefaultBankAccount(acc: ChartOfAccount): boolean {
  if (acc.estado === 'Inactivo') return false;
  if (acc.isImputable === false) return false;

  if (acc.requiereConciliacionBancaria) return true;

  const code = (acc.code || '').replace(/-/g, '.');
  const name = (acc.name || '').toLowerCase();

  return (
    code.startsWith('1.1.01') &&
    (name.includes('banco') ||
      name.includes('cuenta corriente') ||
      name.includes('cta cte') ||
      name.includes('cta. cte') ||
      name.includes('tesoreria') ||
      name.includes('bice') ||
      name.includes('santander') ||
      name.includes('chile') ||
      name.includes('bci') ||
      name.includes('itau') ||
      name.includes('scotiabank') ||
      name.includes('estado') ||
      name.includes('security') ||
      name.includes('falabella') ||
      name.includes('ripley') ||
      name.includes('consorcio'))
  );
}

/**
 * Determina si una cuenta es un Fondo Fijo, Caja Chica, Fondos por Rendir o Caja Operacional.
 */
export function isFondoFijoOrCaja(acc: ChartOfAccount): boolean {
  if (acc.estado === 'Inactivo') return false;
  const code = (acc.code || '').replace(/-/g, '.');
  const name = (acc.name || '').toLowerCase();

  return (
    name.includes('fondo fijo') ||
    name.includes('fondos fijos') ||
    name.includes('caja chica') ||
    name.includes('fondo por rendir') ||
    name.includes('fondos por rendir') ||
    name.includes('rendicion') ||
    name.includes('rendición') ||
    name.includes('vale provisorio') ||
    name.includes('caja central') ||
    name.includes('caja local') ||
    name.includes('caja mostrador') ||
    name.includes('caja sucursal') ||
    code.startsWith('1.1.01.001') ||
    code.startsWith('1.1.01.003') ||
    code.startsWith('1.1.03')
  );
}

/**
 * Organiza las cuentas disponibles para pagos y recaudaciones:
 * 1. defaultBanks: Cuentas de banco y con análisis de banco (siempre disponibles)
 * 2. customEnabled: Cuentas habilitadas manualmente por el usuario (fondos fijos, pasivos, etc.)
 * 3. allOtherAccounts: Resto de cuentas imputables del plan
 */
export function getOrganizedPaymentAccounts(
  accounts: ChartOfAccount[],
  customPaymentAccountIds: string[] = []
) {
  const activeAccounts = accounts.filter(
    acc => acc.estado !== 'Inactivo' && acc.isImputable !== false
  );

  const defaultBanks: ChartOfAccount[] = [];
  const customEnabled: ChartOfAccount[] = [];
  const allOtherAccounts: ChartOfAccount[] = [];

  const customSet = new Set(customPaymentAccountIds);

  activeAccounts.forEach(acc => {
    if (isDefaultBankAccount(acc)) {
      defaultBanks.push(acc);
    } else if (customSet.has(acc.id)) {
      customEnabled.push(acc);
    } else {
      allOtherAccounts.push(acc);
    }
  });

  // Si no se detectó ningún banco explícito, agregar cajas y cuentas del grupo 1.1.01
  if (defaultBanks.length === 0) {
    activeAccounts.forEach(acc => {
      const code = (acc.code || '').replace(/-/g, '.');
      const name = (acc.name || '').toLowerCase();
      if (code.startsWith('1.1.01') || name.includes('banco') || name.includes('caja')) {
        if (!defaultBanks.some(b => b.id === acc.id)) {
          defaultBanks.push(acc);
        }
      }
    });
  }

  // Lista combinada de cuentas habilitadas directamente para el selector
  const availableForSelection = [...defaultBanks, ...customEnabled];

  return {
    defaultBanks,
    customEnabled,
    allOtherAccounts,
    availableForSelection,
    allActiveAccounts: activeAccounts
  };
}
