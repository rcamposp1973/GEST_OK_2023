import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

export interface ConciliacionConfig {
  /** pesos de diferencia entre banco y facturas que se llevan a Ajuste por redondeo */
  tolerancia: number;
  /** contabiliza solo los movimientos seguros apenas se importa la cartola */
  autoAprobar: boolean;
}

export const CONFIG_CONCILIACION_POR_DEFECTO: ConciliacionConfig = { tolerancia: 2, autoAprobar: false };
export const TOLERANCIA_MAXIMA = 50;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  config: ConciliacionConfig;
  onSave: (c: ConciliacionConfig) => Promise<void> | void;
}

export default function ConciliacionOpcionesModal({ isOpen, onClose, config, onSave }: Props) {
  const [tolerancia, setTolerancia] = useState<string>(String(config.tolerancia));
  const [autoAprobar, setAutoAprobar] = useState<boolean>(config.autoAprobar);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTolerancia(String(config.tolerancia));
      setAutoAprobar(config.autoAprobar);
    }
  }, [isOpen, config.tolerancia, config.autoAprobar]);

  if (!isOpen) return null;

  const valor = Math.round(Number(tolerancia));
  const valida = Number.isFinite(valor) && valor >= 0 && valor <= TOLERANCIA_MAXIMA;

  const guardar = async () => {
    if (!valida) return;
    setGuardando(true);
    try {
      await onSave({ tolerancia: valor, autoAprobar });
      onClose();
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[55] bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg border border-slate-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-base font-bold text-slate-900">Opciones de conciliación</h3>
            <p className="text-xs text-slate-500">Valen para esta empresa.</p>
          </div>
          <button type="button" onClick={onClose} title="Cerrar" aria-label="Cerrar" className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-800">Diferencia que se lleva a redondeo ($)</label>
            <p className="text-xs text-slate-500 mt-0.5 mb-2">
              Si el banco y las facturas difieren en hasta este monto, la diferencia va a la cuenta Ajuste por redondeo. Máximo ${TOLERANCIA_MAXIMA}; con 0 se exige el monto exacto.
            </p>
            <input
              type="number"
              min={0}
              max={TOLERANCIA_MAXIMA}
              value={tolerancia}
              onChange={e => setTolerancia(e.target.value)}
              className="w-28 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            {!valida && <p className="text-xs text-rose-600 mt-1">Ingresa un número entre 0 y {TOLERANCIA_MAXIMA}.</p>}
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={autoAprobar} onChange={e => setAutoAprobar(e.target.checked)} className="mt-1 w-4 h-4 accent-emerald-600" />
            <span>
              <span className="block text-sm font-semibold text-slate-800">Aprobar solos los movimientos seguros al importar</span>
              <span className="block text-xs text-slate-500 mt-0.5">
                Al terminar de importar una cartola, los movimientos en verde se contabilizan y concilian sin pasar por la bandeja. Cada aprobación queda en el registro de auditoría con los números de comprobante. Los que no son seguros siguen esperando tu revisión.
              </span>
            </span>
          </label>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-200">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer">Cancelar</button>
          <button type="button" disabled={!valida || guardando} onClick={guardar} className="px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 cursor-pointer">
            {guardando ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
