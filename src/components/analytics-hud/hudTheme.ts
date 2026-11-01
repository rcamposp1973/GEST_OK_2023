export type HudTheme = 'light' | 'dark';

export interface HudThemeStyles {
  containerBg: string;
  cardBg: string;
  cardBorder: string;
  cardHover: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accentCyan: string;
  accentIndigo: string;
  accentEmerald: string;
  accentRose: string;
  tableHeaderBg: string;
  tableRowHover: string;
  tableBorder: string;
  inputBg: string;
  inputBorder: string;
}

export function getHudThemeStyles(theme: HudTheme = 'light'): HudThemeStyles {
  if (theme === 'light') {
    return {
      containerBg: 'bg-slate-50 text-slate-800',
      cardBg: 'bg-white shadow-xs border-slate-200/90',
      cardBorder: 'border-slate-200/90',
      cardHover: 'hover:border-indigo-300 hover:shadow-md',
      textPrimary: 'text-slate-900',
      textSecondary: 'text-slate-600',
      textMuted: 'text-slate-400',
      accentCyan: 'text-cyan-600',
      accentIndigo: 'text-indigo-600',
      accentEmerald: 'text-emerald-600',
      accentRose: 'text-rose-600',
      tableHeaderBg: 'bg-slate-100/90 text-slate-700 border-slate-200',
      tableRowHover: 'hover:bg-slate-50',
      tableBorder: 'border-slate-200/70',
      inputBg: 'bg-white text-slate-900',
      inputBorder: 'border-slate-300 focus-within:border-indigo-500'
    };
  }

  // Dark HUD Mode
  return {
    containerBg: 'bg-slate-950 text-slate-100',
    cardBg: 'bg-slate-900/80 backdrop-blur-md border-slate-800 shadow-lg',
    cardBorder: 'border-slate-800',
    cardHover: 'hover:border-cyan-500/50 hover:shadow-cyan-950/30',
    textPrimary: 'text-slate-100',
    textSecondary: 'text-slate-300',
    textMuted: 'text-slate-500',
    accentCyan: 'text-cyan-400',
    accentIndigo: 'text-indigo-400',
    accentEmerald: 'text-emerald-400',
    accentRose: 'text-rose-400',
    tableHeaderBg: 'bg-slate-950/90 text-slate-400 border-slate-800',
    tableRowHover: 'hover:bg-cyan-950/30',
    tableBorder: 'border-slate-800/80',
    inputBg: 'bg-slate-900/90 text-slate-100',
    inputBorder: 'border-slate-700 focus-within:border-cyan-400'
  };
}
