import { db } from '../lib/firebase';
import { doc, runTransaction } from 'firebase/firestore';

/**
 * Obtiene de forma atómica el siguiente número de comprobante para una empresa y año fiscal,
 * garantizando correlatividad estricta (year = 0 -> correlativo global de la empresa) sin colisiones concurrentes (Ítem 8 - Auditoría Gest_OK).
 */
export async function getNextVoucherNumber(
  studyId: string,
  companyId: string,
  year: number,
  fallbackMax: number = 0
): Promise<number> {
  const counterRef = doc(db, 'studies', studyId, 'companies', companyId, 'counters', (year === 0 ? 'vouchers_all' : `vouchers_${year}`));

  return await runTransaction(db, async (transaction) => {
    const counterDoc = await transaction.get(counterRef);
    let nextNum = 1;

    if (counterDoc.exists()) {
      const data = counterDoc.data();
      const currentLast = typeof data.lastNumber === 'number' ? data.lastNumber : 0;
      nextNum = Math.max(currentLast, fallbackMax) + 1;
    } else {
      nextNum = Math.max(fallbackMax, 0) + 1;
    }

    transaction.set(
      counterRef,
      {
        lastNumber: nextNum,
        year,
        updatedAt: new Date().toISOString()
      },
      { merge: true }
    );

    return nextNum;
  });
}

/**
 * Reserva un bloque atómico de N números correlativos para importaciones masivas (RCV / Cartolas).
 */
export async function reserveVoucherNumberBatch(
  studyId: string,
  companyId: string,
  year: number,
  count: number,
  fallbackMax: number = 0
): Promise<{ startNumber: number; endNumber: number }> {
  if (count <= 0) {
    return { startNumber: 1, endNumber: 0 };
  }

  const counterRef = doc(db, 'studies', studyId, 'companies', companyId, 'counters', (year === 0 ? 'vouchers_all' : `vouchers_${year}`));

  return await runTransaction(db, async (transaction) => {
    const counterDoc = await transaction.get(counterRef);
    let currentLast = 0;

    if (counterDoc.exists()) {
      const data = counterDoc.data();
      currentLast = typeof data.lastNumber === 'number' ? data.lastNumber : 0;
      currentLast = Math.max(currentLast, fallbackMax);
    } else {
      currentLast = Math.max(fallbackMax, 0);
    }

    const startNumber = currentLast + 1;
    const endNumber = currentLast + count;

    transaction.set(
      counterRef,
      {
        lastNumber: endNumber,
        year,
        updatedAt: new Date().toISOString()
      },
      { merge: true }
    );

    return { startNumber, endNumber };
  });
}
