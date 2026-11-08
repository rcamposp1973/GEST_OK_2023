import React, { useState } from 'react';
import { X, ChevronDown, ChevronRight, Table2 } from 'lucide-react';
import type { ChartOfAccount, Voucher, CostCenterMaster, ExpenseItemMaster } from '../types';
import {
  KpiDef, KpiFigures, FIGURA_NOMBRE, FIGURA_DERIVADA, FIGURA_RESULTADO, cifrasDeKpi, formatKpi,
} from '../utils/kpiEngine';
import DetallePivotModal from './DetallePivotModal';
import DetalleCuentaModal from './DetalleCuentaModal';

interface Props {
  kpi: KpiDef;
  figuras: KpiFigures;
  vouchers: Voucher[];
  year: number;
  cutoffMonth: number;
  onClose: () => void;
  costCenters?: CostCenterMaster[];
  expenseItems?: ExpenseItemMaster[];
  empresa?: { studyId: string; id: string };
}

const fmt = (n: number) => Math.round(n).toLocaleString('es-CL');
const valorFigura = (f: KpiFigures, k: string): number => Number((f as any)[k]) || 0;
// El patrimonio del KPI incluye el resultado del ejercicio
const EXTRAS: Record<string, { fig: string; signo: 1 | -1 }[]> = { patrimonio: [{ fig: 'resultado', signo: 1 }] };
const ultimoDia = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;

export default function KpiDetalleModal({ kpi, figuras, vouchers, year, cutoffMonth, onClose, costCenters, expenseItems, empresa }: Props) {
  const mesCorte = cutoffMonth > 0 ? cutoffMonth : 12;
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});
  const [pivot, setPivot] = useState<{ cuentas: ChartOfAccount[]; naturaleza: 'INGRESO' | 'GASTO'; titulo: string } | null>(null);
  const [cuentaSaldo, setCuentaSaldo] = useState<ChartOfAccount | null>(null);

  const usadas = cifrasDeKpi(kpi, figuras);
  const valorKpi = kpi.calcular(figuras);

  const fila = (fig: string, signo: 1 | -1, nivel: number, ruta: string): React.ReactNode => {
    const hijos = [...(FIGURA_DERIVADA[fig] || []), ...(EXTRAS[fig] || [])];
    const cuentas = figuras.detalle[fig] || [];
    const esBase = !FIGURA_DERIVADA[fig];
    const nat = FIGURA_RESULTADO[fig];
    const expandible = hijos.length > 0 || cuentas.length > 0;
    const abierto = !!abiertos[ruta];
    return (
      <React.Fragment key={ruta}>
        <tr className="border-t border-slate-100 hover:bg-slate-50">
          <td className="py-1 pr-2" style={{ paddingLeft: 8 + nivel * 18 }}>
            <button className={`flex items-center gap-1 text-left ${expandible ? 'text-indigo-700 hover:underline' : 'text-slate-700 cursor-default'}`}
              onClick={() => expandible && setAbiertos(p => ({ ...p, [ruta]: !abierto }))}>
              {expandible ? (abierto ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : <span className="w-[13px]" />}
              {nivel > 0 && <span className="text-slate-400 font-mono">{signo === 1 ? '+' : '−'}</span>}
              <span className="font-semibold">{FIGURA_NOMBRE[fig] || fig}</span>
            </button>
          </td>
          <td className="py-1 px-2 text-right font-mono font-bold">{fmt(valorFigura(figuras, fig))}</td>
          <td className="py-1 px-2 text-right">
            {esBase && nat && cuentas.length > 0 && (
              <button
                onClick={() => setPivot({ cuentas: cuentas.map(c => c.acc), naturaleza: nat, titulo: FIGURA_NOMBRE[fig] })}
                className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded px-1.5 py-0.5">
                <Table2 size={11} /> Por centro de costo y mes
              </button>
            )}
          </td>
        </tr>
        {abierto && hijos.map(h => fila(h.fig, h.signo, nivel + 1, `${ruta}/${h.fig}`))}
        {abierto && esBase && [...cuentas].sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor)).map(c => (
          <tr key={`${ruta}/${c.acc.id}`} className="border-t border-slate-50 hover:bg-indigo-50/50 cursor-pointer"
            onClick={() => nat ? setPivot({ cuentas: [c.acc], naturaleza: nat, titulo: `${c.acc.code} · ${c.acc.name}` }) : setCuentaSaldo(c.acc)}
            title="Ver el detalle de esta cuenta">
            <td className="py-0.5 text-slate-600" style={{ paddingLeft: 8 + (nivel + 1) * 18 + 18 }}>
              <span className="font-mono text-slate-400 mr-1.5">{c.acc.code}</span>{c.acc.name}
            </td>
            <td className="py-0.5 px-2 text-right font-mono">{fmt(c.valor)}</td>
            <td />
          </tr>
        ))}
      </React.Fragment>
    );
  };

  return (
    <>
      <div className="fixed inset-0 z-[65] bg-black/50 flex justify-end" onClick={onClose}>
        <div className="bg-white w-full max-w-2xl h-full shadow-2xl flex flex-col text-slate-800" onClick={e => e.stopPropagation()}>
          <div className="px-4 py-3 border-b border-slate-200 flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">KPI · {kpi.grupo} · {year} (ene–{mesCorte})</div>
              <div className="text-base font-bold">{kpi.nombre}</div>
              <div className="text-2xl font-extrabold">{formatKpi(kpi, valorKpi)}</div>
              <div className="text-[11px] text-slate-500 mt-1">{kpi.descripcion}</div>
            </div>
            <button onClick={onClose} className="p-1 rounded hover:bg-slate-100" aria-label="Cerrar"><X size={18} /></button>
          </div>
          <div className="flex-1 overflow-auto p-3">
            <div className="text-[11px] font-bold uppercase text-slate-500 mb-1">De dónde sale</div>
            {usadas.length === 0 ? (
              <p className="text-xs text-slate-500">Este KPI se calcula con datos del negocio que se ingresan a mano (clientes, marketing), no con cuentas contables.</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="text-slate-500 bg-slate-50">
                  <tr><th className="text-left p-1.5">Cifra</th><th className="text-right p-1.5">Valor</th><th /></tr>
                </thead>
                <tbody>{usadas.map(u => fila(u, 1, 0, u))}</tbody>
              </table>
            )}
            <p className="text-[10px] text-slate-400 mt-3">
              Misma regla que los informes: sin comprobantes anulados y solo cuadrados. Haz clic en una cifra para ver sus componentes, en una cuenta para ver su detalle, y en
              "Por centro de costo y mes" para abrir la tabla dinámica.
            </p>
          </div>
        </div>
      </div>
      {pivot && (
        <DetallePivotModal cuentas={pivot.cuentas} naturaleza={pivot.naturaleza} vouchers={vouchers} anio={year} mesCorte={mesCorte} titulo={pivot.titulo} costCenters={costCenters} expenseItems={expenseItems} onClose={() => setPivot(null)} />
      )}
      {cuentaSaldo && (
        <DetalleCuentaModal account={cuentaSaldo} vouchers={vouchers} desde={`${year}-01-01`} hasta={ultimoDia(year, mesCorte)} titulo={`KPI ${kpi.nombre} · detalle de cuenta`} empresa={empresa} onClose={() => setCuentaSaldo(null)} />
      )}
    </>
  );
}
