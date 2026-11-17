import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs, runTransaction, setDoc, updateDoc } from 'firebase/firestore';
import { Plus, Printer, X, CheckCircle2, XCircle, PackageCheck, FileText, Settings, Trash2, Send, Link2, Undo2 } from 'lucide-react';
import { db } from '../lib/firebase';
import type {
  Auxiliary, ChartOfAccount, Company, ProductService, PurchaseOrder, PurchaseOrderLine,
  PurchaseReceipt, PurchasesConfig, RCVDocument, VoucherLine
} from '../types';
import {
  CONFIG_COMPRAS_INICIAL, ESTADOS_OC, armarAsientoRecepcion, calcularTotales, cantidadPendiente,
  estadoAlEnviar, estadoSegunRecepcion, estadoTrasAprobar, fxrAbierto, fxrContabilizado, fxrFacturado,
  importeLinea, montoRecepcionLinea, puedeAprobar, referenciaOC, sugerirFxrNeto
} from '../utils/compras';
import { imprimirOrdenCompra } from '../utils/ordenCompraImpresion';
import { formatearRut } from '../utils/rutFormato';

interface Props {
  studyId: string;
  company: Company;
  accounts: ChartOfAccount[];
  auxiliaries: Auxiliary[];
  products: ProductService[];
  rcvDocuments: RCVDocument[];
  currentUserEmail?: string | null;
  isAdmin: boolean;
  isReadOnly: boolean;
  onCreateVoucher: (v: { date: string; gloss: string; lines: VoucherLine[] }) => Promise<{ id: string; voucherNumber: number }>;
  onReverseVoucher: (voucherId: string, gloss: string, date: string) => Promise<{ id: string; voucherNumber: number }>;
  onRefresh: () => void;
}

const clp = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-CL');
const hoy = () => new Date().toISOString().slice(0, 10);
const nuevoId = () => Math.random().toString(36).slice(2, 10);
const inputCls = 'border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm w-full focus:ring-2 focus:ring-blue-500 focus:outline-none';
const btnPri = 'inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-3.5 py-2 rounded-lg disabled:opacity-50';
const btnSec = 'inline-flex items-center gap-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-semibold px-3.5 py-2 rounded-lg disabled:opacity-50';

function lineaVacia(): PurchaseOrderLine {
  return { id: nuevoId(), code: '', name: '', type: 'SERVICE', unit: 'UN', quantity: 1, unitPriceNeto: 0, contabilizaEnRecepcion: true, receivedQty: 0 };
}

export default function ComprasView({
  studyId, company, accounts, auxiliaries, products, rcvDocuments, currentUserEmail, isAdmin, isReadOnly,
  onCreateVoucher, onReverseVoucher, onRefresh
}: Props) {
  const companyRef = useMemo(() => doc(db, 'studies', studyId, 'companies', company.id), [studyId, company.id]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [cfg, setCfg] = useState<PurchasesConfig>({ ...CONFIG_COMPRAS_INICIAL, ...(company.purchasesConfig || {}) });
  const [cargando, setCargando] = useState(true);
  const [vista, setVista] = useState<'lista' | 'config'>('lista');
  const [abierta, setAbierta] = useState<PurchaseOrder | null>(null);
  const [esNueva, setEsNueva] = useState(false);
  const [filtro, setFiltro] = useState<'TODAS' | 'PENDIENTES' | 'POR_RECIBIR' | 'FXR_ABIERTO'>('TODAS');
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  const email = (currentUserEmail || '').toLowerCase();

  const cargar = async () => {
    setCargando(true);
    try {
      const [snap, empresaSnap] = await Promise.all([
        getDocs(collection(companyRef, 'purchaseOrders')),
        getDoc(companyRef)
      ]);
      const lista = snap.docs.map(d => ({ ...(d.data() as any), id: d.id } as PurchaseOrder))
        .map(o => ({ ...o, lines: o.lines || [], approvals: o.approvals || [], receipts: o.receipts || [], invoices: o.invoices || [] }));
      lista.sort((a, b) => b.number - a.number);
      setOrders(lista);
      const c = (empresaSnap.data() as any)?.purchasesConfig;
      if (c) setCfg({ ...CONFIG_COMPRAS_INICIAL, ...c });
    } catch (e: any) {
      setAviso({ tipo: 'error', texto: 'No se pudieron cargar las órdenes de compra: ' + (e?.message || e) });
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [studyId, company.id]);

  const guardarOrden = async (o: PurchaseOrder) => {
    const t = calcularTotales(o.lines);
    const limpia: PurchaseOrder = { ...o, ...t, updatedAt: new Date().toISOString() };
    await setDoc(doc(companyRef, 'purchaseOrders', limpia.id), JSON.parse(JSON.stringify(limpia, (_k, v) => (v === undefined ? null : v))));
    setOrders(prev => {
      const resto = prev.filter(x => x.id !== limpia.id);
      return [limpia, ...resto].sort((a, b) => b.number - a.number);
    });
    setAbierta(limpia);
    return limpia;
  };

  const siguienteNumero = async (): Promise<number> => {
    const ref = doc(companyRef, 'counters', 'purchaseOrders');
    const maxLocal = orders.reduce((m, o) => Math.max(m, o.number || 0), 0);
    return runTransaction(db, async tx => {
      const s = await tx.get(ref);
      const ultimo = s.exists() ? Number((s.data() as any).lastNumber) || 0 : 0;
      const n = Math.max(ultimo, maxLocal) + 1;
      tx.set(ref, { lastNumber: n, updatedAt: new Date().toISOString() }, { merge: true });
      return n;
    });
  };

  const nuevaOC = () => {
    setEsNueva(true);
    setAbierta({
      id: '', number: 0, date: hoy(), supplierRut: '', supplierName: '',
      paymentTerms: cfg.defaultPaymentTerms || '', deliveryPlace: cfg.defaultDeliveryPlace || '',
      lines: [lineaVacia()], neto: 0, exento: 0, iva: 0, total: 0,
      status: 'BORRADOR', approvals: [], receipts: [], invoices: [],
      createdBy: currentUserEmail || '', createdAt: new Date().toISOString()
    });
  };

  const visibles = orders.filter(o => {
    if (filtro === 'PENDIENTES') return o.status === 'PENDIENTE_N1' || o.status === 'PENDIENTE_N2';
    if (filtro === 'POR_RECIBIR') return o.status === 'APROBADA' || o.status === 'RECIBIDA_PARCIAL';
    if (filtro === 'FXR_ABIERTO') return Math.abs(fxrAbierto(o)) > 0 && o.status !== 'ANULADA';
    return true;
  });

  const fxrTotalAbierto = orders.filter(o => o.status !== 'ANULADA').reduce((s, o) => s + fxrAbierto(o), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Compras · Órdenes de Compra</h2>
          <p className="text-sm text-slate-500">Orden de compra → recepción → factura. Lo recibido sin factura queda en Facturas por Recibir.</p>
        </div>
        <div className="flex gap-2">
          <button className={btnSec} onClick={() => setVista(vista === 'config' ? 'lista' : 'config')}>
            <Settings size={15} /> {vista === 'config' ? 'Volver a órdenes' : 'Configuración'}
          </button>
          {vista === 'lista' && !isReadOnly && <button className={btnPri} onClick={nuevaOC}><Plus size={15} /> Nueva O/C</button>}
        </div>
      </div>

      {aviso && (
        <div className={`rounded-lg px-3 py-2 text-sm flex justify-between items-start gap-3 ${aviso.tipo === 'ok' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`}>
          <span>{aviso.texto}</span>
          <button onClick={() => setAviso(null)}><X size={14} /></button>
        </div>
      )}

      {!cfg.facturasPorRecibirAccountId && (
        <div className="rounded-lg px-3 py-2 text-sm bg-amber-50 border border-amber-200 text-amber-900">
          Falta elegir la cuenta <b>Facturas por Recibir</b> (en Configuración). Sin ella se pueden hacer órdenes, pero no recepciones contables.
        </div>
      )}

      {vista === 'config' && (
        <ConfigPanel
          cfg={cfg} accounts={accounts} disabled={isReadOnly || !isAdmin}
          onSave={async (c) => {
            try {
              await updateDoc(companyRef, { purchasesConfig: JSON.parse(JSON.stringify(c)) });
              setCfg(c);
              setAviso({ tipo: 'ok', texto: 'Configuración de compras guardada.' });
              onRefresh();
            } catch (e: any) {
              setAviso({ tipo: 'error', texto: 'No se pudo guardar: ' + (e?.message || e) });
            }
          }}
        />
      )}

      {vista === 'lista' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {([['TODAS', 'Todas'], ['PENDIENTES', 'Por aprobar'], ['POR_RECIBIR', 'Por recibir'], ['FXR_ABIERTO', 'Con saldo en Fact. por Recibir']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setFiltro(k)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${filtro === k ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-300'}`}>{l}</button>
            ))}
            <span className="ml-auto text-sm text-slate-600">Saldo abierto en Facturas por Recibir: <b className={fxrTotalAbierto === 0 ? 'text-slate-700' : 'text-amber-700'}>{clp(fxrTotalAbierto)}</b></span>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs">
                <tr>
                  <th className="text-left px-3 py-2">N°</th><th className="text-left px-3 py-2">Fecha</th>
                  <th className="text-left px-3 py-2">Proveedor</th><th className="text-right px-3 py-2">Total</th>
                  <th className="text-left px-3 py-2">Estado</th><th className="text-right px-3 py-2">Fact. por Recibir abierto</th>
                </tr>
              </thead>
              <tbody>
                {cargando && <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">Cargando…</td></tr>}
                {!cargando && visibles.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">No hay órdenes de compra en esta vista.</td></tr>}
                {visibles.map(o => (
                  <tr key={o.id} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => { setEsNueva(false); setAbierta(o); }}>
                    <td className="px-3 py-2 font-semibold">{referenciaOC(o.number)}</td>
                    <td className="px-3 py-2">{o.date}</td>
                    <td className="px-3 py-2">{o.supplierName}<div className="text-xs text-slate-400">{formatearRut(o.supplierRut)}</div></td>
                    <td className="px-3 py-2 text-right">{clp(o.total)}</td>
                    <td className="px-3 py-2"><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ESTADOS_OC[o.status].tono}`}>{ESTADOS_OC[o.status].label}</span></td>
                    <td className="px-3 py-2 text-right">{fxrContabilizado(o) || fxrFacturado(o) ? clp(fxrAbierto(o)) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {abierta && (
        <OrdenModal
          key={abierta.id || 'nueva'}
          oc={abierta} esNueva={esNueva} cfg={cfg} company={company} accounts={accounts} auxiliaries={auxiliaries}
          products={products} rcvDocuments={rcvDocuments} email={email} isAdmin={isAdmin} isReadOnly={isReadOnly}
          onClose={() => { setAbierta(null); setEsNueva(false); }}
          onSave={async (o) => {
            let obj = o;
            if (!obj.id) {
              const n = await siguienteNumero();
              obj = { ...obj, id: `oc-${n}`, number: n };
              setEsNueva(false);
            }
            return guardarOrden(obj);
          }}
          onCreateVoucher={onCreateVoucher}
          onReverseVoucher={onReverseVoucher}
          onRefresh={onRefresh}
          onMensaje={(tipo, texto) => setAviso({ tipo, texto })}
        />
      )}
    </div>
  );
}

/* ───────────── Configuración ───────────── */
function ConfigPanel({ cfg, accounts, disabled, onSave }: { cfg: PurchasesConfig; accounts: ChartOfAccount[]; disabled: boolean; onSave: (c: PurchasesConfig) => Promise<void> }) {
  const [c, setC] = useState<PurchasesConfig>(cfg);
  const [n1, setN1] = useState((cfg.level1Emails || []).join(', '));
  const [n2, setN2] = useState((cfg.level2Emails || []).join(', '));
  const [guardando, setGuardando] = useState(false);
  const lista = (t: string) => t.split(/[,;\s]+/).map(x => x.trim().toLowerCase()).filter(Boolean);
  const imputables = accounts.filter(a => a.isImputable !== false);
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4 max-w-3xl">
      {disabled && <p className="text-xs text-amber-700">Solo un administrador del estudio puede cambiar esta configuración.</p>}
      <div>
        <label className="text-sm font-semibold text-slate-700">Cuenta “Facturas por Recibir”</label>
        <p className="text-xs text-slate-500 mb-1">Elige una cuenta que ya exista en el plan de cuentas (el sistema no la crea). Aquí se registra lo recibido antes de llegar la factura.</p>
        <select disabled={disabled} className={inputCls} value={c.facturasPorRecibirAccountId || ''} onChange={e => setC({ ...c, facturasPorRecibirAccountId: e.target.value || undefined })}>
          <option value="">— Seleccionar cuenta —</option>
          {imputables.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
        </select>
        {(() => {
          const sel = accounts.find(a => a.id === c.facturasPorRecibirAccountId);
          if (!sel) return null;
          const ok = sel.requiereAuxiliarRUT && sel.requiereDocumento;
          return ok ? null : <p className="text-xs text-amber-700 mt-1">Recomendado: marca esta cuenta con “Requiere auxiliar RUT” y “Requiere documento” en el plan de cuentas, para que la recepción y la factura se neteen por proveedor y O/C en Auxiliares.</p>;
        })()}
      </div>
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <input disabled={disabled} type="checkbox" className="accent-blue-600 h-4 w-4" checked={c.approvalRequired} onChange={e => setC({ ...c, approvalRequired: e.target.checked })} />
        Las órdenes de compra necesitan aprobación
      </label>
      {c.approvalRequired && (
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-semibold text-slate-700">Aprobadores nivel 1 (correos)</label>
            <textarea disabled={disabled} rows={2} className={inputCls} value={n1} onChange={e => setN1(e.target.value)} placeholder="jefe@empresa.cl, otro@empresa.cl" />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-700">Aprobadores nivel 2 (correos)</label>
            <textarea disabled={disabled} rows={2} className={inputCls} value={n2} onChange={e => setN2(e.target.value)} placeholder="gerente@empresa.cl" />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm font-semibold text-slate-700">Total desde el cual se exige también el nivel 2</label>
            <p className="text-xs text-slate-500 mb-1">Con 0, toda orden pasa por los dos niveles (si hay aprobadores de nivel 2).</p>
            <input disabled={disabled} type="number" min={0} className={inputCls + ' max-w-xs'} value={c.level2MinAmount} onChange={e => setC({ ...c, level2MinAmount: Number(e.target.value) || 0 })} />
          </div>
        </div>
      )}
      <div className="grid md:grid-cols-2 gap-3">
        <div><label className="text-sm font-semibold text-slate-700">Condición de pago por defecto</label>
          <input disabled={disabled} className={inputCls} value={c.defaultPaymentTerms || ''} onChange={e => setC({ ...c, defaultPaymentTerms: e.target.value })} placeholder="30 días" /></div>
        <div><label className="text-sm font-semibold text-slate-700">Lugar de entrega por defecto</label>
          <input disabled={disabled} className={inputCls} value={c.defaultDeliveryPlace || ''} onChange={e => setC({ ...c, defaultDeliveryPlace: e.target.value })} /></div>
      </div>
      <div><label className="text-sm font-semibold text-slate-700">Texto al pie de la O/C impresa</label>
        <textarea disabled={disabled} rows={2} className={inputCls} value={c.footerNotes || ''} onChange={e => setC({ ...c, footerNotes: e.target.value })} placeholder="Indicar N° de O/C en la factura. Despachar con guía de despacho." /></div>
      <button className={btnPri} disabled={disabled || guardando} onClick={async () => {
        setGuardando(true);
        try { await onSave({ ...c, level1Emails: lista(n1), level2Emails: lista(n2) }); } finally { setGuardando(false); }
      }}>Guardar configuración</button>
    </div>
  );
}

/* ───────────── Detalle / edición de una O/C ───────────── */
interface ModalProps {
  oc: PurchaseOrder; esNueva: boolean; cfg: PurchasesConfig; company: Company; accounts: ChartOfAccount[];
  auxiliaries: Auxiliary[]; products: ProductService[]; rcvDocuments: RCVDocument[]; email: string;
  isAdmin: boolean; isReadOnly: boolean;
  onClose: () => void;
  onSave: (o: PurchaseOrder) => Promise<PurchaseOrder>;
  onCreateVoucher: Props['onCreateVoucher'];
  onReverseVoucher: Props['onReverseVoucher'];
  onRefresh: () => void;
  onMensaje: (tipo: 'ok' | 'error', texto: string) => void;
}

function OrdenModal(p: ModalProps) {
  const { cfg, accounts, products, auxiliaries, rcvDocuments, company, email, isAdmin, isReadOnly } = p;
  const [oc, setOc] = useState<PurchaseOrder>(p.oc);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState('');
  const [comentario, setComentario] = useState('');
  const editable = !isReadOnly && (oc.status === 'BORRADOR' || oc.status === 'RECHAZADA');
  const totales = calcularTotales(oc.lines);

  const proveedores = useMemo(() => auxiliaries.filter(a => a.rut), [auxiliaries]);
  const cuentaFxr = cfg.facturasPorRecibirAccountId ? accounts.find(a => a.id === cfg.facturasPorRecibirAccountId) : undefined;

  const run = async (fn: () => Promise<void>) => {
    setTrabajando(true); setError('');
    try { await fn(); } catch (e: any) { setError(e?.message || String(e)); } finally { setTrabajando(false); }
  };

  const setLinea = (id: string, cambios: Partial<PurchaseOrderLine>) =>
    setOc(prev => ({ ...prev, lines: prev.lines.map(l => (l.id === id ? { ...l, ...cambios } : l)) }));

  const elegirProducto = (lineId: string, productId: string) => {
    const pr = products.find(x => x.id === productId);
    if (!pr) { setLinea(lineId, { productId: undefined }); return; }
    setLinea(lineId, {
      productId: pr.id, code: pr.code, name: pr.name, type: pr.type, unit: pr.unitOfMeasure || 'UN',
      unitPriceNeto: pr.purchaseCost || 0, exento: !!pr.taxExempt,
      contabilizaEnRecepcion: pr.contabilizaEnRecepcion !== false,
      accountId: (pr.type === 'PRODUCT' ? pr.inventoryAssetAccountId : undefined) || pr.purchaseAccountId || undefined
    });
  };

  const validar = (): string | null => {
    if (!oc.supplierRut.trim() || !oc.supplierName.trim()) return 'Falta el proveedor (RUT y nombre).';
    const util = oc.lines.filter(l => l.name.trim() && l.quantity > 0);
    if (util.length === 0) return 'Agrega al menos una línea con descripción y cantidad.';
    return null;
  };

  const guardar = async (siguienteEstado?: PurchaseOrder['status']) => {
    const v = validar(); if (v) { setError(v); return; }
    await run(async () => {
      const lines = oc.lines.filter(l => l.name.trim() && l.quantity > 0);
      const guardada = await p.onSave({
        ...oc, lines, supplierRut: formatearRut(oc.supplierRut),
        status: siguienteEstado ? siguienteEstado : (oc.status === 'RECHAZADA' ? 'BORRADOR' : oc.status)
      });
      setOc(guardada);
      p.onMensaje('ok', `Orden ${referenciaOC(guardada.number)} guardada (${ESTADOS_OC[guardada.status].label}).`);
    });
  };

  const enviar = () => guardar(estadoAlEnviar(cfg));

  const decidir = (level: 1 | 2, decision: 'APROBADA' | 'RECHAZADA') => run(async () => {
    const aprob = { level, decision, by: email, at: new Date().toISOString(), comment: comentario.trim() || undefined };
    const status = decision === 'APROBADA' ? estadoTrasAprobar(level, oc.total, cfg) : 'RECHAZADA';
    const g = await p.onSave({ ...oc, status, approvals: [...oc.approvals, aprob] });
    setOc(g); setComentario('');
    p.onMensaje('ok', `Orden ${referenciaOC(g.number)}: ${decision === 'APROBADA' ? 'aprobada' : 'rechazada'} (nivel ${level}).`);
  });

  const anularOC = () => run(async () => {
    if (oc.receipts.some(r => !r.anulada)) throw new Error('Tiene recepciones vigentes. Anúlalas primero.');
    if (oc.invoices.length) throw new Error('Tiene facturas asociadas. Quítalas primero.');
    const g = await p.onSave({ ...oc, status: 'ANULADA' });
    setOc(g);
  });

  /* ── Recepción ── */
  const [recFecha, setRecFecha] = useState(hoy());
  const [recNotas, setRecNotas] = useState('');
  const [recQty, setRecQty] = useState<Record<string, number>>({});

  const registrarRecepcion = () => run(async () => {
    if (!cuentaFxr) throw new Error('Primero elige la cuenta Facturas por Recibir en Configuración.');
    const sel = oc.lines.filter(l => (recQty[l.id] || 0) > 0);
    if (!sel.length) throw new Error('Indica la cantidad recibida de al menos una línea.');
    for (const l of sel) {
      if ((recQty[l.id] || 0) > cantidadPendiente(l) + 1e-9) throw new Error(`“${l.name}”: recibes más de lo pendiente (${cantidadPendiente(l)}).`);
    }
    const lineasRec = sel.map(l => ({ lineId: l.id, quantity: recQty[l.id], amountNeto: montoRecepcionLinea(l, recQty[l.id]) }));
    const asiento = armarAsientoRecepcion(oc, lineasRec, l => l.accountId, cuentaFxr.id);
    if (asiento.sinCuenta.length) throw new Error('Falta la cuenta de gasto/inventario (en el producto o en la línea) de: ' + asiento.sinCuenta.join(', '));

    const nRec = oc.receipts.length + 1;
    let voucher: { id: string; voucherNumber: number } | undefined;
    if (asiento.total > 0) {
      const ref = referenciaOC(oc.number);
      const lines: VoucherLine[] = asiento.lines.map(l => {
        const cta = accounts.find(a => a.id === l.accountId)!;
        return {
          accountId: cta.id, accountCode: cta.code, accountName: cta.name,
          debit: l.debit, credit: l.credit, gloss: l.gloss,
          ...(l.conAuxiliar ? { auxiliaryRut: formatearRut(oc.supplierRut), auxiliaryName: oc.supplierName, documentRef: ref, documentType: 'OC' } : {})
        };
      });
      voucher = await p.onCreateVoucher({ date: recFecha, gloss: `Recepción ${ref}-R${nRec} - ${oc.supplierName}`, lines });
    }
    const receipt: PurchaseReceipt = {
      id: nuevoId(), number: `${referenciaOC(oc.number)}-R${nRec}`, date: recFecha, notes: recNotas.trim() || undefined,
      lines: lineasRec, totalNeto: asiento.total,
      ...(voucher ? { voucherId: voucher.id, voucherNumber: voucher.voucherNumber } : {}),
      createdBy: email, createdAt: new Date().toISOString()
    };
    const lines = oc.lines.map(l => ({ ...l, receivedQty: (l.receivedQty || 0) + (recQty[l.id] || 0) }));
    const g = await p.onSave({ ...oc, lines, receipts: [...oc.receipts, receipt], status: estadoSegunRecepcion(lines) });
    setOc(g); setRecQty({}); setRecNotas('');
    p.onRefresh();
    p.onMensaje('ok', voucher
      ? `Recepción ${receipt.number} registrada. Comprobante N° ${voucher.voucherNumber} contra Facturas por Recibir por ${clp(asiento.total)}.`
      : `Recepción ${receipt.number} registrada (sin movimiento contable: los productos se contabilizan con la factura).`);
  });

  const anularRecepcion = (r: PurchaseReceipt) => run(async () => {
    if (oc.invoices.length) throw new Error('Esta orden ya tiene facturas asociadas; quita la factura antes de anular la recepción.');
    let rev: { id: string; voucherNumber: number } | undefined;
    if (r.voucherId) rev = await p.onReverseVoucher(r.voucherId, `Anulación recepción ${r.number} - ${oc.supplierName}`, hoy());
    const lines = oc.lines.map(l => {
      const rl = r.lines.find(x => x.lineId === l.id);
      return rl ? { ...l, receivedQty: Math.max(0, (l.receivedQty || 0) - rl.quantity) } : l;
    });
    const receipts = oc.receipts.map(x => (x.id === r.id ? { ...x, anulada: true, reversalVoucherId: rev?.id } : x));
    const g = await p.onSave({ ...oc, lines, receipts, status: estadoSegunRecepcion(lines) });
    setOc(g); p.onRefresh();
    p.onMensaje('ok', `Recepción ${r.number} anulada${rev ? ` (comprobante de reverso N° ${rev.voucherNumber})` : ''}.`);
  });

  /* ── Facturas ── */
  const rutLimpio = (s: string) => (s || '').replace(/[^0-9kK]/g, '').toUpperCase();
  const facturasDisponibles = rcvDocuments.filter(d =>
    d.tipoRegistro === 'Compra' && !d.estadoContabilizado && !d.purchaseOrderId &&
    rutLimpio(d.rutEmisor) === rutLimpio(oc.supplierRut) && d.tipoDoc !== '61'
  );
  const [facSel, setFacSel] = useState('');
  const [facFxr, setFacFxr] = useState<number | ''>('');
  const facElegida = facturasDisponibles.find(d => d.id === facSel);
  useEffect(() => {
    if (facElegida) setFacFxr(sugerirFxrNeto(oc, Number(facElegida.montoNeto) || 0));
  }, [facSel]); // eslint-disable-line

  const asociarFactura = () => run(async () => {
    if (!facElegida) throw new Error('Elige una factura.');
    if (!cuentaFxr) throw new Error('Primero elige la cuenta Facturas por Recibir en Configuración.');
    const fxr = Math.min(Math.max(0, Number(facFxr) || 0), Number(facElegida.montoNeto) || 0);
    await updateDoc(doc(db, 'studies', company.studyId || '', 'companies', company.id, 'rcvDocuments', facElegida.id), {
      purchaseOrderId: oc.id, purchaseOrderNumber: oc.number, purchaseFxrNeto: fxr, purchaseFxrAccountId: cuentaFxr.id
    });
    const g = await p.onSave({
      ...oc,
      invoices: [...oc.invoices, { rcvId: facElegida.id, tipoDoc: facElegida.tipoDoc, folio: facElegida.folio, date: facElegida.fechaEmision, montoNeto: Number(facElegida.montoNeto) || 0, fxrNeto: fxr }]
    });
    setOc(g); setFacSel(''); setFacFxr(''); p.onRefresh();
    p.onMensaje('ok', `Factura ${facElegida.folio} asociada a ${referenciaOC(oc.number)}. Al contabilizarla en RCV, ${clp(fxr)} netea Facturas por Recibir.`);
  });

  const quitarFactura = (rcvId: string) => run(async () => {
    const doc0 = rcvDocuments.find(d => d.id === rcvId);
    if (doc0?.estadoContabilizado) throw new Error('La factura ya está contabilizada; descontabilízala antes de quitar la referencia.');
    await updateDoc(doc(db, 'studies', company.studyId || '', 'companies', company.id, 'rcvDocuments', rcvId), {
      purchaseOrderId: null, purchaseOrderNumber: null, purchaseFxrNeto: null, purchaseFxrAccountId: null
    });
    const g = await p.onSave({ ...oc, invoices: oc.invoices.filter(i => i.rcvId !== rcvId) });
    setOc(g); p.onRefresh();
  });

  const puedeDecidir = puedeAprobar(email, oc.status, cfg, isAdmin);
  const nivelDecision: 1 | 2 = oc.status === 'PENDIENTE_N2' ? 2 : 1;
  const recibible = !isReadOnly && (oc.status === 'APROBADA' || oc.status === 'RECIBIDA_PARCIAL');
  const hayFxr = oc.receipts.length > 0 || oc.invoices.length > 0;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-start justify-center overflow-y-auto p-3 sm:p-6">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <FileText size={18} className="text-blue-600" />
            <h3 className="font-bold text-slate-900">{oc.number ? `Orden de Compra ${referenciaOC(oc.number)}` : 'Nueva Orden de Compra'}</h3>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ESTADOS_OC[oc.status].tono}`}>{ESTADOS_OC[oc.status].label}</span>
          </div>
          <div className="flex items-center gap-2">
            {oc.number > 0 && <button className={btnSec} onClick={() => imprimirOrdenCompra(oc, company, cfg, accounts)}><Printer size={15} /> Imprimir / PDF</button>}
            <button onClick={p.onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} /></button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {error && <div className="rounded-lg px-3 py-2 text-sm bg-rose-50 border border-rose-200 text-rose-800">{error}</div>}

          {/* Proveedor y condiciones */}
          <div className="grid md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-slate-600">Proveedor (busca por nombre o RUT)</label>
              <input disabled={!editable} list="compras-proveedores" className={inputCls} value={oc.supplierName}
                onChange={e => {
                  const v = e.target.value;
                  const a = proveedores.find(x => x.name === v || formatearRut(x.rut) === v);
                  setOc(prev => a ? { ...prev, supplierName: a.name, supplierRut: formatearRut(a.rut), supplierEmail: (a as any).email || prev.supplierEmail, supplierAddress: (a as any).address || prev.supplierAddress } : { ...prev, supplierName: v });
                }} placeholder="Razón social del proveedor" />
              <datalist id="compras-proveedores">
                {proveedores.map(a => <option key={a.id} value={a.name}>{formatearRut(a.rut)}</option>)}
              </datalist>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">RUT</label>
              <input disabled={!editable} className={inputCls} value={oc.supplierRut} onChange={e => setOc({ ...oc, supplierRut: e.target.value })} onBlur={() => setOc(prev => ({ ...prev, supplierRut: formatearRut(prev.supplierRut) }))} placeholder="11.111.111-1" />
            </div>
            <div><label className="text-xs font-semibold text-slate-600">Fecha</label>
              <input disabled={!editable} type="date" className={inputCls} value={oc.date} onChange={e => setOc({ ...oc, date: e.target.value })} /></div>
            <div><label className="text-xs font-semibold text-slate-600">Condición de pago</label>
              <input disabled={!editable} className={inputCls} value={oc.paymentTerms || ''} onChange={e => setOc({ ...oc, paymentTerms: e.target.value })} /></div>
            <div><label className="text-xs font-semibold text-slate-600">Fecha de entrega</label>
              <input disabled={!editable} type="date" className={inputCls} value={oc.deliveryDate || ''} onChange={e => setOc({ ...oc, deliveryDate: e.target.value })} /></div>
            <div className="md:col-span-3"><label className="text-xs font-semibold text-slate-600">Lugar de entrega y observaciones</label>
              <input disabled={!editable} className={inputCls} value={oc.deliveryPlace || ''} onChange={e => setOc({ ...oc, deliveryPlace: e.target.value })} placeholder="Dirección de entrega" />
              <textarea disabled={!editable} rows={2} className={inputCls + ' mt-2'} value={oc.notes || ''} onChange={e => setOc({ ...oc, notes: e.target.value })} placeholder="Observaciones para el proveedor" /></div>
          </div>

          {/* Líneas */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-sm min-w-[860px]">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-2 py-2 text-left w-48">Producto / Servicio</th>
                  <th className="px-2 py-2 text-left">Descripción</th>
                  <th className="px-2 py-2 text-right w-20">Cant.</th>
                  <th className="px-2 py-2 text-right w-28">Precio neto</th>
                  <th className="px-2 py-2 text-right w-28">Importe</th>
                  {!editable && <th className="px-2 py-2 text-right w-24">Recibido</th>}
                  {editable && <th className="px-2 py-2 w-10" />}
                </tr>
              </thead>
              <tbody>
                {oc.lines.map(l => (
                  <tr key={l.id} className="border-t border-slate-100 align-top">
                    <td className="px-2 py-1.5">
                      {editable ? (
                        <select className={inputCls} value={l.productId || ''} onChange={e => elegirProducto(l.id, e.target.value)}>
                          <option value="">Línea libre</option>
                          {products.filter(x => x.estado !== 'Inactivo').map(x => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}
                        </select>
                      ) : <span className="text-xs text-slate-500">{l.code || 'Libre'}</span>}
                      {editable && !l.productId && (
                        <select className={inputCls + ' mt-1'} value={l.accountId || ''} onChange={e => setLinea(l.id, { accountId: e.target.value || undefined })}>
                          <option value="">Cuenta de gasto/activo…</option>
                          {accounts.filter(a => a.isImputable !== false && (a.type === 'Gasto' || a.type === 'Activo')).map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                        </select>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <input disabled={!editable} className={inputCls} value={l.name} onChange={e => setLinea(l.id, { name: e.target.value })} placeholder="Descripción" />
                      {editable && (
                        <label className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-1">
                          <input type="checkbox" className="accent-blue-600" checked={l.contabilizaEnRecepcion} onChange={e => setLinea(l.id, { contabilizaEnRecepcion: e.target.checked })} />
                          Contabiliza al recibir (si no, solo con la factura)
                        </label>
                      )}
                      {!editable && !l.contabilizaEnRecepcion && <div className="text-[11px] text-slate-400 mt-0.5">Se contabiliza con la factura</div>}
                    </td>
                    <td className="px-2 py-1.5"><input disabled={!editable} type="number" min={0} step="any" className={inputCls + ' text-right'} value={l.quantity} onChange={e => setLinea(l.id, { quantity: Number(e.target.value) || 0 })} /></td>
                    <td className="px-2 py-1.5"><input disabled={!editable} type="number" min={0} step="any" className={inputCls + ' text-right'} value={l.unitPriceNeto} onChange={e => setLinea(l.id, { unitPriceNeto: Number(e.target.value) || 0 })} /></td>
                    <td className="px-2 py-1.5 text-right pt-3">{clp(importeLinea(l))}{l.exento && <div className="text-[10px] text-slate-400">exento</div>}</td>
                    {!editable && <td className="px-2 py-1.5 text-right pt-3">{l.receivedQty || 0} / {l.quantity}</td>}
                    {editable && <td className="px-2 py-1.5"><button className="p-1.5 text-slate-400 hover:text-rose-600" onClick={() => setOc(prev => ({ ...prev, lines: prev.lines.filter(x => x.id !== l.id) }))}><Trash2 size={15} /></button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            {editable ? <button className={btnSec} onClick={() => setOc(prev => ({ ...prev, lines: [...prev.lines, lineaVacia()] }))}><Plus size={15} /> Agregar línea</button> : <span />}
            <div className="text-sm space-y-0.5 text-right min-w-[220px]">
              <div className="flex justify-between gap-6"><span className="text-slate-500">Neto</span><span>{clp(totales.neto)}</span></div>
              {totales.exento > 0 && <div className="flex justify-between gap-6"><span className="text-slate-500">Exento</span><span>{clp(totales.exento)}</span></div>}
              <div className="flex justify-between gap-6"><span className="text-slate-500">IVA 19%</span><span>{clp(totales.iva)}</span></div>
              <div className="flex justify-between gap-6 font-bold text-base border-t border-slate-200 pt-1"><span>Total</span><span>{clp(totales.total)}</span></div>
            </div>
          </div>

          {/* Acciones de borrador */}
          {editable && (
            <div className="flex flex-wrap gap-2">
              <button className={btnSec} disabled={trabajando} onClick={() => guardar()}>Guardar borrador</button>
              <button className={btnPri} disabled={trabajando} onClick={enviar}>
                <Send size={15} /> {estadoAlEnviar(cfg) === 'APROBADA' ? 'Aprobar y emitir' : 'Enviar a aprobación'}
              </button>
              {oc.number > 0 && <button className={btnSec} disabled={trabajando} onClick={anularOC}>Anular O/C</button>}
            </div>
          )}

          {/* Historial de aprobación */}
          {oc.approvals.length > 0 && (
            <div className="text-xs text-slate-600 bg-slate-50 rounded-lg p-3 space-y-1">
              {oc.approvals.map((a, i) => (
                <div key={i}>Nivel {a.level}: <b>{a.decision === 'APROBADA' ? 'aprobada' : 'rechazada'}</b> por {a.by} · {a.at.slice(0, 16).replace('T', ' ')}{a.comment ? ` — “${a.comment}”` : ''}</div>
              ))}
            </div>
          )}

          {(oc.status === 'PENDIENTE_N1' || oc.status === 'PENDIENTE_N2') && (
            <div className="border border-amber-200 bg-amber-50 rounded-xl p-3 space-y-2">
              <div className="text-sm font-semibold text-amber-900">Esperando aprobación de nivel {nivelDecision}</div>
              {puedeDecidir ? (
                <>
                  <input className={inputCls} value={comentario} onChange={e => setComentario(e.target.value)} placeholder="Comentario (opcional)" />
                  <div className="flex gap-2">
                    <button className={btnPri} disabled={trabajando} onClick={() => decidir(nivelDecision, 'APROBADA')}><CheckCircle2 size={15} /> Aprobar</button>
                    <button className={btnSec} disabled={trabajando} onClick={() => decidir(nivelDecision, 'RECHAZADA')}><XCircle size={15} /> Rechazar</button>
                  </div>
                </>
              ) : <p className="text-xs text-amber-800">Tu usuario no figura como aprobador de nivel {nivelDecision}. Los aprobadores se definen en Configuración.</p>}
            </div>
          )}

          {/* Recepción */}
          {recibible && (
            <div className="border border-slate-200 rounded-xl p-3 space-y-3">
              <div className="flex items-center gap-2 font-semibold text-slate-800 text-sm"><PackageCheck size={16} className="text-emerald-600" /> Registrar recepción (total o parcial)</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-slate-500"><tr><th className="text-left py-1">Línea</th><th className="text-right">Pendiente</th><th className="text-right w-28">Recibo ahora</th><th className="text-right w-28">Contabiliza</th></tr></thead>
                  <tbody>
                    {oc.lines.filter(l => cantidadPendiente(l) > 0).map(l => (
                      <tr key={l.id} className="border-t border-slate-100">
                        <td className="py-1">{l.name}</td>
                        <td className="text-right">{cantidadPendiente(l)}</td>
                        <td className="text-right"><input type="number" min={0} step="any" max={cantidadPendiente(l)} className={inputCls + ' text-right'} value={recQty[l.id] ?? ''} onChange={e => setRecQty({ ...recQty, [l.id]: Number(e.target.value) || 0 })} /></td>
                        <td className="text-right text-slate-500">{l.contabilizaEnRecepcion ? clp(montoRecepcionLinea(l, recQty[l.id] || 0)) : 'con factura'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid md:grid-cols-3 gap-2">
                <div><label className="text-xs font-semibold text-slate-600">Fecha de recepción</label><input type="date" className={inputCls} value={recFecha} onChange={e => setRecFecha(e.target.value)} /></div>
                <div className="md:col-span-2"><label className="text-xs font-semibold text-slate-600">Guía de despacho / observaciones</label><input className={inputCls} value={recNotas} onChange={e => setRecNotas(e.target.value)} /></div>
              </div>
              <button className={btnPri} disabled={trabajando} onClick={registrarRecepcion}>Registrar recepción y contabilizar</button>
            </div>
          )}

          {/* Recepciones realizadas */}
          {oc.receipts.length > 0 && (
            <div>
              <div className="text-sm font-semibold text-slate-800 mb-1">Recepciones</div>
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                {oc.receipts.map(r => (
                  <div key={r.id} className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm ${r.anulada ? 'opacity-50' : ''}`}>
                    <div>
                      <b>{r.number}</b> · {r.date} {r.anulada && <span className="text-rose-600 text-xs font-semibold">ANULADA</span>}
                      <div className="text-xs text-slate-500">{r.lines.length} línea(s) · {r.totalNeto ? `${clp(r.totalNeto)} en Facturas por Recibir (comprobante N° ${r.voucherNumber})` : 'sin contabilización'}{r.notes ? ` · ${r.notes}` : ''}</div>
                    </div>
                    {!r.anulada && !isReadOnly && <button className={btnSec} disabled={trabajando} onClick={() => anularRecepcion(r)}><Undo2 size={14} /> Anular</button>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Facturas */}
          {(oc.receipts.length > 0 || oc.invoices.length > 0 || oc.status === 'APROBADA') && oc.status !== 'ANULADA' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Link2 size={15} className="text-blue-600" /> Facturas del proveedor</div>
              {oc.invoices.map(i => (
                <div key={i.rcvId} className="flex items-center justify-between gap-2 border border-slate-200 rounded-lg px-3 py-2 text-sm">
                  <span>Doc {i.tipoDoc} N° {i.folio} · {i.date} · neto {clp(i.montoNeto)} · contra Fact. por Recibir <b>{clp(i.fxrNeto)}</b>
                    {rcvDocuments.find(d => d.id === i.rcvId)?.estadoContabilizado ? <span className="ml-2 text-emerald-700 text-xs font-semibold">contabilizada</span> : <span className="ml-2 text-amber-700 text-xs font-semibold">pendiente de contabilizar en RCV</span>}</span>
                  {!isReadOnly && <button className="text-slate-400 hover:text-rose-600" disabled={trabajando} onClick={() => quitarFactura(i.rcvId)}><X size={15} /></button>}
                </div>
              ))}
              {!isReadOnly && (
                <div className="grid md:grid-cols-[1fr_180px_auto] gap-2 items-end">
                  <div>
                    <label className="text-xs font-semibold text-slate-600">Asociar factura de compra (cargada en RCV, aún no contabilizada)</label>
                    <select className={inputCls} value={facSel} onChange={e => setFacSel(e.target.value)}>
                      <option value="">{facturasDisponibles.length ? 'Seleccionar factura…' : 'No hay facturas disponibles de este proveedor'}</option>
                      {facturasDisponibles.map(d => <option key={d.id} value={d.id}>Doc {d.tipoDoc} N° {d.folio} · {d.fechaEmision} · neto {clp(Number(d.montoNeto) || 0)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600">Neto contra Fact. por Recibir</label>
                    <input type="number" min={0} className={inputCls + ' text-right'} value={facFxr} onChange={e => setFacFxr(e.target.value === '' ? '' : Number(e.target.value))} />
                  </div>
                  <button className={btnPri} disabled={trabajando || !facSel} onClick={asociarFactura}>Asociar</button>
                </div>
              )}
              {hayFxr && (
                <div className="text-sm bg-slate-50 rounded-lg px-3 py-2 flex flex-wrap gap-x-6 gap-y-1">
                  <span>Recibido contabilizado: <b>{clp(fxrContabilizado(oc))}</b></span>
                  <span>Facturado contra la cuenta: <b>{clp(fxrFacturado(oc))}</b></span>
                  <span>Saldo abierto: <b className={fxrAbierto(oc) === 0 ? 'text-emerald-700' : 'text-amber-700'}>{clp(fxrAbierto(oc))}</b></span>
                  {fxrAbierto(oc) !== 0 && <span className="text-xs text-slate-500 basis-full">La diferencia queda abierta en Facturas por Recibir hasta que llegue la factura o la nota de crédito que la cierre.</span>}
                </div>
              )}
            </div>
          )}

          {(oc.status === 'RECIBIDA' || oc.status === 'RECIBIDA_PARCIAL') && !isReadOnly && (
            <div className="flex gap-2">
              <button className={btnSec} disabled={trabajando} onClick={() => run(async () => { const g = await p.onSave({ ...oc, status: 'CERRADA' }); setOc(g); })}>Cerrar O/C</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
