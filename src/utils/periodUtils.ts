import { FiscalPeriodYear } from '../types';

/**
 * Devuelve el período cerrado más avanzado / reciente en la contabilidad (ej: "2026-06").
 * Regla: "los meses cerrados no deben permitir que meses anteriores estén abiertos;
 * si junio está cerrado, enero-febrero-marzo-abril-mayo deben estar obligatoriamente cerrados".
 */
export function getLatestClosedPeriod(fiscalYears: FiscalPeriodYear[] = []): string | null {
  if (!fiscalYears || fiscalYears.length === 0) return null;

  let maxClosed: string | null = null;

  for (const fy of fiscalYears) {
    const yStr = String(fy.id || fy.year);
    if (!yStr || !fy.months) continue;

    // Detectar si el año tiene la plantilla por defecto antigua donde mes 1 era 'Abierto' y 2..12 'Cerrado'
    const isOldBuggyDefault =
      fy.months[1] === 'Abierto' &&
      [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].every(m => fy.months[m] === 'Cerrado');

    if (isOldBuggyDefault) {
      // En dicha plantilla no hubo un cierre real hecho por el usuario
      continue;
    }

    for (let m = 1; m <= 12; m++) {
      if (fy.months[m] === 'Cerrado') {
        const pCode = `${yStr}-${String(m).padStart(2, '0')}`;
        if (!maxClosed || pCode > maxClosed) {
          maxClosed = pCode;
        }
      }
    }
  }

  return maxClosed;
}

export function checkIsPeriodClosed(
  dateOrPeriod: string,
  fiscalYears: FiscalPeriodYear[] = []
): { isClosed: boolean; periodStr: string; errorMsg: string; latestClosedPeriod?: string | null } {
  if (!dateOrPeriod) {
    return { isClosed: false, periodStr: '', errorMsg: '' };
  }
  const clean = dateOrPeriod.trim().substring(0, 7); // e.g. "2026-08"
  const parts = clean.split('-');
  if (parts.length < 2) {
    return { isClosed: false, periodStr: clean, errorMsg: '' };
  }
  const yearStr = parts[0];
  const monthNum = parseInt(parts[1], 10);
  if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
    return { isClosed: false, periodStr: clean, errorMsg: '' };
  }

  const fy = fiscalYears.find(f => f.id === yearStr);
  const isOldBuggyDefault = fy && fy.months && fy.months[1] === 'Abierto' &&
    [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].every(m => fy.months[m] === 'Cerrado');

  const explicitStatus = isOldBuggyDefault ? 'Abierto' : fy?.months?.[monthNum];

  // Regla contable estricta: "los meses cerrados no deben permitir que meses anteriores esten abiertos.
  // Si junio está cerrado, enero-febrero-marzo-abril-mayo deben estar obligatoriamente cerrados".
  const latestClosed = getLatestClosedPeriod(fiscalYears);
  const isClosedBySequence = latestClosed !== null && clean <= latestClosed;
  const isClosed = explicitStatus === 'Cerrado' || isClosedBySequence;

  const monthNames = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const monthName = monthNames[monthNum] || `Mes ${monthNum}`;

  let reason = `El período ${monthName} ${yearStr} (${clean}) se encuentra CERRADO.`;
  if (explicitStatus !== 'Cerrado' && isClosedBySequence && latestClosed) {
    const [lcYear, lcMonth] = latestClosed.split('-');
    const lcMonthName = monthNames[parseInt(lcMonth, 10)] || lcMonth;
    reason = `El período ${monthName} ${yearStr} (${clean}) se encuentra cerrado porque el período posterior ${lcMonthName} ${lcYear} ya fue cerrado (los meses anteriores a un mes cerrado deben estar obligatoriamente cerrados).`;
  }

  return {
    isClosed,
    periodStr: clean,
    latestClosedPeriod: latestClosed,
    errorMsg: `🔒 Período Contable Bloqueado: ${reason} No está permitido ingresar comprobantes, importar cartolas ni realizar modificaciones o procesos en períodos cerrados.`
  };
}

/**
 * Cuando se contabiliza desde la cartola bancaria:
 * "si o si, el registro debe hacerse con fecha y periodo de la cartola, salvo que el mes se encuentre
 * 'cerrado', de ser asi, el registro debe hacerse el día 1 del siguiente mes abierto."
 */
export function getNextOpenPeriodAndDate(
  cartolaDate: string,
  fiscalYears: FiscalPeriodYear[] = []
): {
  period: string;
  date: string;
  wasShifted: boolean;
  originalPeriod: string;
  originalDate: string;
  explanation?: string;
} {
  if (!cartolaDate) {
    const now = new Date();
    const curP = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return {
      period: curP,
      date: `${curP}-01`,
      wasShifted: false,
      originalPeriod: curP,
      originalDate: `${curP}-01`
    };
  }

  const cleanDate = cartolaDate.trim().substring(0, 10);
  const originalPeriod = cleanDate.substring(0, 7);

  const check = checkIsPeriodClosed(originalPeriod, fiscalYears);

  // Si el mes de la cartola está ABIERTO, se respeta fecha y período exactos de la cartola
  if (!check.isClosed) {
    return {
      period: originalPeriod,
      date: cleanDate,
      wasShifted: false,
      originalPeriod,
      originalDate: cleanDate
    };
  }

  // Si el mes está CERRADO: Se busca el primer mes abierto cronológicamente posterior
  const [yStr, mStr] = originalPeriod.split('-');
  let curYear = parseInt(yStr, 10);
  let curMonth = parseInt(mStr, 10);

  let targetPeriod = '';
  // Avanzar mes a mes hasta encontrar el primer mes abierto (máximo 60 meses)
  for (let step = 0; step < 60; step++) {
    curMonth++;
    if (curMonth > 12) {
      curMonth = 1;
      curYear++;
    }
    const candidatePeriod = `${curYear}-${String(curMonth).padStart(2, '0')}`;
    const candidateCheck = checkIsPeriodClosed(candidatePeriod, fiscalYears);
    if (!candidateCheck.isClosed) {
      targetPeriod = candidatePeriod;
      break;
    }
  }

  if (!targetPeriod) {
    targetPeriod = `${curYear}-${String(curMonth).padStart(2, '0')}`;
  }

  const targetDate = `${targetPeriod}-01`;
  const monthNames = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const origMNum = parseInt(mStr, 10);
  const origMonthName = monthNames[origMNum] || originalPeriod;

  return {
    period: targetPeriod,
    date: targetDate,
    wasShifted: true,
    originalPeriod,
    originalDate: cleanDate,
    explanation: `El mes de la cartola (${origMonthName} ${yStr}) se encuentra cerrado. Por normativa contable, el registro se realiza automáticamente el día 1 del siguiente mes abierto (${targetDate}, período ${targetPeriod}).`
  };
}

/**
 * Returns the active open accounting/fiscal period (e.g. "2026-07").
 * Never returns a closed period.
 */
export function getLatestOpenPeriod(
  fiscalYears: FiscalPeriodYear[] = [],
  fallbackPeriods?: string[]
): string {
  const latestClosed = getLatestClosedPeriod(fiscalYears);

  // 1. First priority: Search open periods in fiscalYears that are strictly NOT closed
  if (fiscalYears && fiscalYears.length > 0) {
    const sortedYears = [...fiscalYears].sort((a, b) => {
      const yA = Number(a.id || a.year) || 0;
      const yB = Number(b.id || b.year) || 0;
      return yB - yA;
    });

    for (const fy of sortedYears) {
      const y = Number(fy.id || fy.year);
      if (!y || !fy.months) continue;

      for (let m = 12; m >= 1; m--) {
        const pCode = `${y}-${String(m).padStart(2, '0')}`;
        const check = checkIsPeriodClosed(pCode, fiscalYears);
        if (!check.isClosed) {
          return pCode;
        }
      }
    }
  }

  // 2. If all configured periods are closed, the next open period is the month immediately following latestClosed
  if (latestClosed) {
    const [yStr, mStr] = latestClosed.split('-');
    let y = parseInt(yStr, 10);
    let m = parseInt(mStr, 10) + 1;
    if (m > 12) {
      m = 1;
      y++;
    }
    return `${y}-${String(m).padStart(2, '0')}`;
  }

  // 3. Check fallback periods
  if (fallbackPeriods && fallbackPeriods.length > 0) {
    const valid = fallbackPeriods
      .filter(p => p && /^\d{4}-\d{2}$/.test(p))
      .sort()
      .reverse();
    for (const vp of valid) {
      if (!checkIsPeriodClosed(vp, fiscalYears).isClosed) {
        return vp;
      }
    }
  }

  // 4. Default: current month
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}


