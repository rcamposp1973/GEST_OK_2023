import React, { useEffect, useState } from 'react';
import { leerNumero } from '../../utils/f29Ppm';

/** Formato chileno: miles con punto y decimales con coma. */
export const formatoCL = (n: number, decimales = 0) =>
  (Number.isFinite(n) ? n : 0).toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: decimales });

type Extra = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'value' | 'defaultValue' | 'min' | 'max' | 'step'>;
type Base = { value: number | undefined | null; onChange: (n: number) => void; disabled?: boolean; className?: string; title?: string; placeholder?: string; max?: number | string; extra?: Extra };

/**
 * Casillero numérico con formato chileno (1.234.567 / 12,5). Mientras se escribe respeta lo tecleado;
 * al salir del casillero lo muestra formateado. Acepta pegar montos con puntos, comas o signo $.
 */
export const InputNumeroCL: React.FC<Base & { decimales?: number; permitirNegativo?: boolean; sufijo?: string }> = ({
  value, onChange, disabled, className, title, placeholder, decimales = 0, permitirNegativo = false, sufijo, max, extra,
}) => {
  const tope = max !== undefined && max !== '' && Number.isFinite(Number(max)) ? Number(max) : null;
  const mostrar = (v: number | undefined | null) => (v === undefined || v === null || !Number.isFinite(Number(v)) ? '' : formatoCL(Number(v), decimales));
  const [txt, setTxt] = useState(mostrar(value));
  const [foco, setFoco] = useState(false);
  useEffect(() => { if (!foco) setTxt(mostrar(value)); }, [value, foco]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <span className="inline-flex items-center gap-1">
      <input
        {...(extra || {})}
        type="text" inputMode={decimales > 0 ? 'decimal' : 'numeric'} disabled={disabled} title={title} placeholder={placeholder}
        value={txt}
        onFocus={e => { setFoco(true); extra?.onFocus?.(e); }}
        onBlur={e => { setFoco(false); setTxt(mostrar(value)); extra?.onBlur?.(e); }}
        onChange={e => {
          const crudo = e.target.value;
          setTxt(crudo);
          const neg = permitirNegativo && crudo.trim().startsWith('-');
          // Sin decimales: cualquier punto o coma se toma como separador de miles
          const n = decimales > 0 ? leerNumero(crudo.replace('-', '')) : (crudo.replace(/\D/g, '') ? Number(crudo.replace(/\D/g, '')) : 0);
          if (n === null) { if (!crudo.replace('-', '').trim()) onChange(0); return; }
          let valor = decimales > 0 ? Math.round(n * 10 ** decimales) / 10 ** decimales : Math.round(n);
          if (tope !== null && valor > tope) valor = tope;
          onChange(neg ? -valor : valor);
        }}
        className={className ?? 'w-40 border border-slate-300 rounded-lg px-2 py-1 text-right font-mono text-sm disabled:bg-slate-50'}
      />
      {sufijo && <span className="text-sm text-slate-500">{sufijo}</span>}
    </span>
  );
};

/**
 * Reemplazo directo de <input type="number">: mismas props (value, onChange(e), className, placeholder…),
 * pero muestra y lee el número en formato chileno. onChange recibe un evento con target.value en formato JS ("1234.5").
 */
export const InputNumeroEvento: React.FC<Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'value'> & {
  value: number | string | undefined | null;
  onChange?: (e: { target: { value: string } }) => void;
  decimales?: number;
}> = ({ value, onChange, decimales, step, min, max, ...rest }) => {
  const dec = decimales ?? (step && String(step).includes('.') ? String(step).split('.')[1].length : 0);
  const v = value === '' || value === undefined || value === null ? null : Number(value);
  return (
    <InputNumeroCL
      value={v}
      decimales={dec}
      permitirNegativo={!(min !== undefined && Number(min) >= 0)}
      disabled={rest.disabled}
      className={rest.className}
      title={rest.title}
      placeholder={rest.placeholder}
      max={max as any}
      extra={rest}
      onChange={n => onChange?.({ target: { value: String(n) } })}
    />
  );
};
