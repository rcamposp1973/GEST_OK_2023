import React, { useMemo, useState, useEffect } from 'react';
import type { BankStatementLine, ChartOfAccount } from '../types';
import type { MovementProposal, ProposalLevel } from '../utils/bankMovementClassifier';

export interface BandejaRow {
  line: BankStatementLine;
  proposal: MovementProposal | null;
  /** true si se puede contabilizar sin más datos (cuenta única, sin análisis pendientes) */
  aprobable: boolean;
  /** por qué no es aprobable en lote (se muestra al usuario) */
  motivo: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  lines: BankStatementLine[];
  accounts: ChartOfAccount[];
  classify: (line: BankStatementLine) => MovementProposal | null;
  onApprove: (items: { line: BankStatementLine; proposal: MovementProposal }[]) => Promise<void>;
  onOpenLine: (line: BankStatementLine) => void;
}

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CL');

const DOT: Record<ProposalLevel, string> = {
  VERDE: 'bg-emerald-500',
  AMARILLO: 'bg-amber-400',
  ROJO: 'bg-rose-500'
};
const LABEL: Record<ProposalLevel, string> = {
  VERDE: 'Seguro',
  AMARILLO: 'Revisar',
  ROJO: 'Sin propuesta'
};

/** Evalúa si la propuesta se puede contabilizar en lote sin pedir más datos al contador. */
function evaluar(
  line: BankStatementLine,
  proposal: MovementProposal | null,
  accounts: ChartOfAccount[]
): { aprobable: boolean; motivo: string } {
  if (!proposal || !proposal.accountId) return { aprobable: false, motivo: 'No hay cuenta propuesta' };
  if (proposal.level !== 'VERDE') return { aprobable: false, motivo: 'Confianza media: conviene revisarlo' };
  if (proposal.requiresSplit) return { aprobable: false, motivo: 'Se reparte entre varias cuentas' };
  if (proposal.isInternalTransfer) return { aprobable: false, motivo: 'Traspaso entre cuentas propias' };
  const acc = accounts.find(a => a.id === proposal.accountId);
  if (!acc) return { aprobable: false, motivo: 'La cuenta no existe en el plan' };
  if (acc.requiereDocumento) return { aprobable: false, motivo: 'La cuenta exige documento (factura)' };
  if (acc.requiereVencimiento) return { aprobable: false, motivo: 'La cuenta exige vencimiento' };
  if (acc.requiereAuxiliarRUT && !proposal.auxiliaryRut) return { aprobable: false, motivo: 'La cuenta exige RUT y no se conoce' };
  if (acc.requiereCentroCosto && !proposal.costCenter) return { aprobable: false, motivo: 'La cuenta exige centro de costos' };
  if (acc.requiereItemGasto && !proposal.expenseItem) return { aprobable: false, motivo: 'La cuenta exige ítem de gasto' };
  if (acc.requiereProyecto && !proposal.project) return { aprobable: false, motivo: 'La cuenta exige proyecto' };
  if (acc.requiereProducto && !proposal.product) return { aprobable: false, motivo: 'La cuenta exige producto' };
  if (acc.customAttributes && Object.values(acc.customAttributes).some(Boolean)) {
    return { aprobable: false, motivo: 'La cuenta exige análisis personalizados' };
  }
  const monto = (line.charge || 0) > 0 ? line.charge : line.deposit;
  if (!monto || monto <= 0) return { aprobable: false, motivo: 'Monto en cero' };
  return { aprobable: true, motivo: '' };
}

export default function BandejaMovimientosModal({ isOpen, onClose, lines, accounts, classify, onApprove, onOpenLine }: Props) {
  const [filtro, setFiltro] = useState<'TODOS' | ProposalLevel>('TODOS');
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [procesando, setProcesando] = useState(false);

  const rows = useMemo<BandejaRow[]>(() => {
    if (!isOpen) return [];
    return lines.map(line => {
      let proposal: MovementProposal | null = null;
      try { proposal = classify(line); } catch { proposal = null; }
      const ev = evaluar(line, proposal, accounts);
      return { line, proposal, aprobable: ev.aprobable, motivo: ev.motivo };
    });
  }, [isOpen, lines, accounts, classify]);

  // Al abrir (o al cambiar los pendientes) quedan marcados los aprobables
  useEffect(() => {
    if (!isOpen) return;
    setSeleccion(new Set(rows.filter(r => r.aprobable).map(r => r.line.id)));
  }, [isOpen, rows]);

  const conteo = useMemo(() => {
    const c = { VERDE: 0, AMARILLO: 0, ROJO: 0, aprobables: 0 };
    rows.forEach(r => {
      const lvl: ProposalLevel = r.proposal ? r.proposal.level : 'ROJO';
      c[lvl]++;
      if (r.aprobable) c.aprobables++;
    });
    return c;
  }, [rows]);

  const visibles = useMemo(
    () => rows.filter(r => filtro === 'TODOS' || (r.proposal ? r.proposal.level : 'ROJO') === filtro),
    [rows, filtro]
  );

  const seleccionados = rows.filter(r => r.aprobable && seleccion.has(r.line.id));
  const totalSel = seleccionados.reduce((s, r) => s + ((r.line.charge || 0) > 0 ? r.line.charge : r.line.deposit), 0);

  if (!isOpen) return null;

  const toggle = (id: string) =>
    setSeleccion(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const aprobar = async () => {
    if (seleccionados.length === 0 || procesando) return;
    setProcesando(true);
    try {
      await onApprove(seleccionados.map(r => ({ line: r.line, proposal: r.proposal as MovementProposal })));
    } finally {
      setProcesando(false);
    }
  };

  const chip = (valor: 'TODOS' | ProposalLevel, texto: string, n: number) => (
    <button
      type="button"
      onClick={() => setFiltro(valor)}
      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
        filtro === valor ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
      }`}
    >
      {texto} <span className="opacity-70">({n})</span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold tracking-wide">Bandeja de movimientos pendientes</h4>
            <p className="text-xs text-slate-300 mt-0.5">
              {lines.length} movimientos sin contabilizar. Los marcados como Seguro se pueden aprobar de una vez.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-white text-lg px-2 rounded hover:bg-white/10">✕</button>
        </div>

        <div className="px-5 py-3 border-b border-slate-200 flex flex-wrap items-center gap-2">
          {chip('TODOS', 'Todos', rows.length)}
          {chip('VERDE', 'Seguros', conteo.VERDE)}
          {chip('AMARILLO', 'Por revisar', conteo.AMARILLO)}
          {chip('ROJO', 'Sin propuesta', conteo.ROJO)}
        </div>

        <div className="overflow-y-auto flex-1">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="w-10 px-3 py-2"></th>
                <th className="text-left px-2 py-2">Fecha</th>
                <th className="text-left px-2 py-2">Glosa del banco</th>
                <th className="text-right px-2 py-2">Monto</th>
                <th className="text-left px-2 py-2">Propuesta</th>
                <th className="text-right px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {visibles.map(r => {
                const lvl: ProposalLevel = r.proposal ? r.proposal.level : 'ROJO';
                const esCargo = (r.line.charge || 0) > 0;
                const monto = esCargo ? r.line.charge : r.line.deposit;
                return (
                  <tr key={r.line.id} className="border-b border-slate-100 hover:bg-slate-50/70 align-top">
                    <td className="px-3 py-2">
                      {r.aprobable ? (
                        <input
                          type="checkbox"
                          checked={seleccion.has(r.line.id)}
                          onChange={() => toggle(r.line.id)}
                          className="h-4 w-4 accent-emerald-600"
                        />
                      ) : null}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap text-slate-600">{r.line.date}</td>
                    <td className="px-2 py-2 text-slate-800 max-w-[260px] break-words">{r.line.description}</td>
                    <td className={`px-2 py-2 text-right font-mono whitespace-nowrap ${esCargo ? 'text-rose-700' : 'text-emerald-700'}`}>
                      {esCargo ? '-' : '+'}{fmt(monto)}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-start gap-2">
                        <span className={`mt-1 inline-block h-2.5 w-2.5 rounded-full shrink-0 ${DOT[lvl]}`} title={LABEL[lvl]} />
                        <div>
                          {r.proposal && r.proposal.accountId ? (
                            <div className="font-semibold text-slate-800">{r.proposal.accountCode} {r.proposal.accountName}</div>
                          ) : (
                            <div className="font-semibold text-slate-500">Sin cuenta propuesta</div>
                          )}
                          <div className="text-slate-500">
                            {r.aprobable ? (r.proposal?.reason || '') : (r.motivo || r.proposal?.reason || '')}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onOpenLine(r.line)}
                        className="px-2.5 py-1 border border-slate-300 rounded-md text-slate-700 hover:bg-white font-semibold"
                      >
                        Abrir
                      </button>
                    </td>
                  </tr>
                );
              })}
              {visibles.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">No hay movimientos en esta categoría.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-600">
            {seleccionados.length > 0
              ? <>Se contabilizarán <b>{seleccionados.length}</b> movimientos por un total de <b>{fmt(totalSel)}</b>. Cada uno genera su comprobante y queda conciliado.</>
              : <>No hay movimientos seleccionados para aprobar en lote.</>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50">
              Cerrar
            </button>
            <button
              onClick={aprobar}
              disabled={seleccionados.length === 0 || procesando}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-bold"
            >
              {procesando ? 'Contabilizando…' : `Aprobar ${seleccionados.length} seleccionados`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
