import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Send, X, MessageCircle, Sparkles, Scale, TrendingUp, UserSearch, CalendarClock, Percent, HandCoins, Wallet, CalendarDays } from 'lucide-react';
import type { Company, Voucher, ChartOfAccount, RCVDocument } from '../types';
import {
  balanceALaFecha, resultadosAFecha, buscarContrapartes, cuentaCorriente, saldosPorContraparte, vencimientos, ivaDelPeriodo,
  parseFechaTexto, finDeMes, hoyISO, clp, fechaCL, sinTildes,
  type Contraparte, type BalanceResultado, type ResultadosResultado, type CuentaCorrienteResultado,
  type SaldosPorContraparte, type VencimientosResultado, type IvaResultado
} from '../utils/observerReports';

type Msg =
  | { id: number; from: 'user'; text: string }
  | { id: number; from: 'bot'; kind: 'text'; text: string }
  | { id: number; from: 'bot'; kind: 'balance'; data: BalanceResultado }
  | { id: number; from: 'bot'; kind: 'resultados'; data: ResultadosResultado }
  | { id: number; from: 'bot'; kind: 'cc'; data: CuentaCorrienteResultado }
  | { id: number; from: 'bot'; kind: 'saldos'; data: SaldosPorContraparte }
  | { id: number; from: 'bot'; kind: 'venc'; data: VencimientosResultado }
  | { id: number; from: 'bot'; kind: 'iva'; data: IvaResultado };

type NewMsg = Msg extends infer M ? (M extends { id: number } ? Omit<M, 'id'> : never) : never;

type Pending =
  | null
  | { type: 'fecha'; report: 'balance' | 'resultados' | 'cobrar' | 'pagar' }
  | { type: 'parte' }
  | { type: 'elegir'; opciones: Contraparte[] };

interface Props {
  company: Company;
  accounts: ChartOfAccount[];
  vouchers: Voucher[];
  rcvDocuments: RCVDocument[];
  selectedPeriod: string;
}

const ACCIONES = [
  { id: 'balance', label: 'Balance', icon: Scale },
  { id: 'resultados', label: 'Estado de resultados', icon: TrendingUp },
  { id: 'cc', label: 'Cuenta corriente', icon: UserSearch },
  { id: 'cobrar', label: 'Por cobrar', icon: HandCoins },
  { id: 'pagar', label: 'Por pagar', icon: Wallet },
  { id: 'venc', label: 'Vencimientos', icon: CalendarClock },
  { id: 'iva', label: 'IVA del período', icon: Percent }
] as const;

const Tabla = ({ filas, vacio }: { filas: { a: string; b?: string; n: number; fuerte?: boolean }[]; vacio?: string }) => (
  <table className="w-full text-[11px]">
    <tbody>
      {filas.length === 0 && <tr><td className="py-1 text-slate-400 italic">{vacio || 'Sin movimientos'}</td></tr>}
      {filas.map((f, i) => (
        <tr key={i} className={f.fuerte ? 'font-bold border-t border-slate-300 text-slate-900' : 'text-slate-700'}>
          <td className="py-0.5 pr-2">{f.a}{f.b && <span className="block text-[10px] text-slate-400 font-normal">{f.b}</span>}</td>
          <td className="py-0.5 text-right font-mono whitespace-nowrap align-top">{clp(f.n)}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

const Seccion = ({ t, children }: { t: string; children: React.ReactNode }) => (
  <div className="mt-2 first:mt-0"><p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700 mb-0.5">{t}</p>{children}</div>
);

export default function ObserverAssistantPanel({ company, accounts, vouchers, rcvDocuments, selectedPeriod }: Props) {
  const [open, setOpen] = useState<boolean>(() => typeof window !== 'undefined' && window.innerWidth >= 1280);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [pending, setPending] = useState<Pending>(null);
  const [text, setText] = useState('');
  const [fecha, setFecha] = useState(hoyISO());
  const idRef = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);
  const nid = () => idRef.current++;

  const push = (...m: NewMsg[]) => setMsgs(prev => [...prev, ...m.map(x => ({ ...x, id: nid() } as Msg))]);
  const bot = (text: string) => push({ from: 'bot', kind: 'text', text });

  useEffect(() => {
    if (msgs.length === 0) {
      push({ from: 'bot', kind: 'text', text: `Hola. Soy el asistente de ${company.name}. ¿Qué necesitas hoy? Elige un informe o escríbeme, por ejemplo: “balance al 31-10-2026”, “saldo de Nubox” o “qué me vence esta semana”.` });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs, pending]);

  const hoy = hoyISO();
  const finPeriodo = useMemo(() => finDeMes(selectedPeriod), [selectedPeriod]);
  const finMesPasado = useMemo(() => { const d = new Date(); d.setDate(0); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }, []);

  const ejecutarFecha = (report: 'balance' | 'resultados' | 'cobrar' | 'pagar', f: string) => {
    setPending(null);
    if (report === 'balance') push({ from: 'bot', kind: 'balance', data: balanceALaFecha(vouchers, accounts, f) });
    else if (report === 'resultados') push({ from: 'bot', kind: 'resultados', data: resultadosAFecha(vouchers, accounts, f) });
    else push({ from: 'bot', kind: 'saldos', data: saldosPorContraparte(report, vouchers, accounts, f) });
  };

  const pedirFecha = (report: 'balance' | 'resultados' | 'cobrar' | 'pagar') => {
    const q = { balance: '¿A qué fecha quieres el balance?', resultados: '¿Hasta qué fecha quieres el estado de resultados? (acumulado desde el 1 de enero)', cobrar: '¿A qué fecha quieres ver lo que te deben?', pagar: '¿A qué fecha quieres ver lo que debes?' }[report];
    bot(q);
    setFecha(hoy);
    setPending({ type: 'fecha', report });
  };

  const mostrarCC = (c: Contraparte, f = hoy) => {
    setPending(null);
    push({ from: 'bot', kind: 'cc', data: cuentaCorriente(c, vouchers, accounts, f) });
  };

  const buscarParte = (q: string) => {
    const r = buscarContrapartes(q, vouchers, rcvDocuments, company.rut);
    if (r.length === 0) { bot(`No encontré a nadie con “${q}”. Prueba con otra parte del nombre o con el RUT.`); setPending({ type: 'parte' }); }
    else if (r.length === 1) mostrarCC(r[0]);
    else { bot('Encontré varios. ¿Cuál es?'); setPending({ type: 'elegir', opciones: r }); }
  };

  const accion = (id: string) => {
    const a = ACCIONES.find(x => x.id === id);
    if (a) push({ from: 'user', text: a.label });
    if (id === 'balance' || id === 'resultados' || id === 'cobrar' || id === 'pagar') pedirFecha(id);
    else if (id === 'cc') { bot('¿De quién quieres ver la cuenta corriente? Escribe el nombre o el RUT, sea cliente o proveedor.'); setPending({ type: 'parte' }); }
    else if (id === 'venc') { setPending(null); push({ from: 'bot', kind: 'venc', data: vencimientos(vouchers, accounts, hoy) }); }
    else if (id === 'iva') { setPending(null); push({ from: 'bot', kind: 'iva', data: ivaDelPeriodo(rcvDocuments, selectedPeriod) }); }
  };

  const enviar = (raw?: string) => {
    const t = (raw ?? text).trim();
    if (!t) return;
    setText('');
    push({ from: 'user', text: t });
    const n = sinTildes(t);
    const f = parseFechaTexto(t);

    if (pending?.type === 'fecha') {
      if (f) return ejecutarFecha(pending.report, f);
      if (/hoy/.test(n)) return ejecutarFecha(pending.report, hoy);
      bot('No entendí la fecha. Elige una con el calendario o escríbela como 31-10-2026.');
      return;
    }
    if (pending?.type === 'parte') return buscarParte(t);
    if (pending?.type === 'elegir') {
      const op = pending.opciones.find(o => sinTildes(o.nombre).includes(n) || o.rut.replace(/\D/g, '') === t.replace(/\D/g, ''));
      return op ? mostrarCC(op) : buscarParte(t);
    }

    const pideFecha = (r: 'balance' | 'resultados' | 'cobrar' | 'pagar') => (f ? ejecutarFecha(r, f) : pedirFecha(r));
    if (/balance/.test(n)) return pideFecha('balance');
    if (/resultado|utilidad|ganancia|perdida/.test(n)) return pideFecha('resultados');
    if (/vencid|vencim|vence|vencen/.test(n)) { push({ from: 'bot', kind: 'venc', data: vencimientos(vouchers, accounts, hoy) }); return; }
    if (/\biva\b|impuesto/.test(n)) { push({ from: 'bot', kind: 'iva', data: ivaDelPeriodo(rcvDocuments, selectedPeriod) }); return; }
    if (/por cobrar|me deben|cuentas por cobrar|cobranza/.test(n)) return pideFecha('cobrar');
    if (/por pagar|cuentas por pagar|debo a todos|lo que debo/.test(n)) return pideFecha('pagar');
    if (/saldo|cuenta corriente|cuanto (me )?(debe|deben|debo)|deuda/.test(n)) {
      const m = t.match(/(?:\bde\b|\bdel\b|\ba\b|\bcon\b|corriente)\s+(?:la |el )?(.+)$/i);
      const q = (m?.[1] || '').replace(/[?¿!]/g, '').trim();
      if (q && !/^(saldo|cuenta)/i.test(q)) return buscarParte(q);
      bot('¿De quién? Escribe el nombre o el RUT.'); setPending({ type: 'parte' }); return;
    }
    if (/^[\d.\-kK\s]{7,}$/.test(t)) return buscarParte(t);
    bot('Aún no sé responder eso. Puedo mostrarte balance, estado de resultados, cuenta corriente de un cliente o proveedor, lo que te deben o debes, vencimientos e IVA. Elige una de las opciones de abajo.');
  };

  const render = (m: Msg) => {
    if (m.from === 'user') return (
      <div key={m.id} className="flex justify-end"><div className="max-w-[85%] bg-indigo-600 text-white text-xs px-3 py-2 rounded-2xl rounded-br-sm">{m.text}</div></div>
    );
    const card = (children: React.ReactNode, wide = false) => (
      <div key={m.id} className="flex"><div className={`${wide ? 'w-full' : 'max-w-[90%]'} bg-white border border-slate-200 text-slate-800 text-xs px-3 py-2.5 rounded-2xl rounded-bl-sm shadow-xs`}>{children}</div></div>
    );
    switch (m.kind) {
      case 'text': return card(<p className="leading-relaxed">{m.text}</p>);
      case 'balance': {
        const d = m.data;
        return card(<>
          <p className="font-bold text-slate-900 mb-1">Balance al {fechaCL(d.fecha)}</p>
          <Seccion t="Activos"><Tabla filas={[...d.activos.map(f => ({ a: f.name, n: f.saldo })), { a: 'Total activos', n: d.totalActivo, fuerte: true }]} /></Seccion>
          <Seccion t="Pasivos"><Tabla filas={[...d.pasivos.map(f => ({ a: f.name, n: f.saldo })), { a: 'Total pasivos', n: d.totalPasivo, fuerte: true }]} /></Seccion>
          <Seccion t="Patrimonio">
            <Tabla filas={[
              ...d.patrimonio.map(f => ({ a: f.name, n: f.saldo })),
              ...(d.resultadoAnterior ? [{ a: 'Resultado de años anteriores', n: d.resultadoAnterior }] : []),
              { a: 'Resultado del ejercicio', n: d.resultadoEjercicio },
              { a: 'Total patrimonio', n: d.totalPatrimonio + d.resultadoAnterior + d.resultadoEjercicio, fuerte: true }
            ]} />
          </Seccion>
          <p className={`mt-2 text-[10px] ${d.diferencia === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
            {d.diferencia === 0 ? 'El balance cuadra: activos = pasivos + patrimonio.' : `Diferencia de ${clp(d.diferencia)} entre activos y pasivos + patrimonio. Conviene revisarlo con tu contador.`}
          </p>
        </>, true);
      }
      case 'resultados': {
        const d = m.data;
        return card(<>
          <p className="font-bold text-slate-900 mb-1">Resultados del {fechaCL(d.desde)} al {fechaCL(d.hasta)}</p>
          <Seccion t="Ingresos"><Tabla filas={[...d.ingresos.map(f => ({ a: f.name, n: f.saldo })), { a: 'Total ingresos', n: d.totalIngresos, fuerte: true }]} /></Seccion>
          <Seccion t="Gastos y costos"><Tabla filas={[...d.gastos.map(f => ({ a: f.name, n: f.saldo })), { a: 'Total gastos', n: d.totalGastos, fuerte: true }]} /></Seccion>
          <div className={`mt-2 px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex justify-between ${d.resultado >= 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
            <span>{d.resultado >= 0 ? 'Utilidad' : 'Pérdida'} del período</span><span className="font-mono">{clp(d.resultado)}</span>
          </div>
        </>, true);
      }
      case 'cc': {
        const d = m.data;
        return card(<>
          <p className="font-bold text-slate-900">{d.contraparte.nombre || 'Sin nombre'}</p>
          <p className="text-[10px] font-mono text-slate-500 mb-1">{d.contraparte.rut} · al {fechaCL(d.fecha)}</p>
          {d.documentos.length === 0 ? <p className="text-slate-500 italic">No tiene saldos pendientes: todo está compensado.</p> : <>
            <Seccion t="Por cuenta"><Tabla filas={d.porCuenta.map(c => ({ a: c.name, b: c.saldo >= 0 ? 'te debe' : 'le debes', n: Math.abs(c.saldo) }))} /></Seccion>
            <Seccion t="Documentos pendientes"><Tabla filas={d.documentos.map(x => ({ a: x.documento, b: `${fechaCL(x.fecha)}${x.vence ? ` · vence ${fechaCL(x.vence)}` : ''} · ${x.saldo >= 0 ? 'te debe' : 'le debes'}`, n: Math.abs(x.saldo) }))} /></Seccion>
            <div className={`mt-2 px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex justify-between ${d.saldoNeto >= 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
              <span>{d.saldoNeto >= 0 ? 'Saldo neto: te debe' : 'Saldo neto: le debes'}</span><span className="font-mono">{clp(Math.abs(d.saldoNeto))}</span>
            </div>
          </>}
        </>, true);
      }
      case 'saldos': {
        const d = m.data;
        return card(<>
          <p className="font-bold text-slate-900 mb-1">{d.tipo === 'cobrar' ? 'Lo que te deben' : 'Lo que debes'} al {fechaCL(d.fecha)}</p>
          <Tabla filas={[...d.filas.slice(0, 15).map(f => ({ a: f.nombre || f.rut, b: f.nombre ? f.rut : undefined, n: f.saldo })), ...(d.filas.length > 15 ? [{ a: `y ${d.filas.length - 15} más`, n: d.filas.slice(15).reduce((s, f) => s + f.saldo, 0) }] : []), { a: 'Total', n: d.total, fuerte: true }]} vacio="No hay saldos pendientes a esa fecha." />
          <p className="mt-1.5 text-[10px] text-slate-400">Toca “Cuenta corriente” para ver el detalle de una persona.</p>
        </>, true);
      }
      case 'venc': {
        const d = m.data;
        return card(<>
          <p className="font-bold text-slate-900 mb-1">Vencimientos al {fechaCL(d.hoy)}</p>
          {d.grupos.map(g => (
            <Seccion key={g.tipo} t={g.tipo === 'cobrar' ? 'Por cobrar' : 'Por pagar'}>
              <Tabla filas={[
                { a: 'Vencido', n: g.totalVencido }, { a: 'Vence en 7 días', n: g.totalSemana }, { a: 'Vence en 8 a 30 días', n: g.totalMes }
              ]} />
              {[...g.vencidas, ...g.semana].slice(0, 6).map((x, i) => (
                <p key={i} className="text-[10px] text-slate-500 flex justify-between gap-2"><span className="truncate">{x.nombre || x.rut} · {x.documento} · {x.vence < d.hoy ? 'venció' : 'vence'} {fechaCL(x.vence)}</span><span className="font-mono shrink-0">{clp(x.saldo)}</span></p>
              ))}
            </Seccion>
          ))}
          <p className="mt-1.5 text-[10px] text-slate-400">Si un documento no trae fecha de vencimiento, se asume 30 días desde su emisión.</p>
        </>, true);
      }
      case 'iva': {
        const d = m.data;
        return card(<>
          <p className="font-bold text-slate-900 mb-1">IVA del período {d.period}</p>
          <Tabla filas={[
            { a: 'IVA débito (ventas)', b: `${d.docsVenta} documentos`, n: d.debito },
            { a: 'IVA crédito (compras)', b: `${d.docsCompra} documentos`, n: d.credito },
            { a: d.aPagar >= 0 ? 'IVA a pagar del mes' : 'Remanente a favor', n: Math.abs(d.aPagar), fuerte: true }
          ]} />
          {d.sinDerecho > 0 && <p className="mt-1 text-[10px] text-amber-700">Además hay {clp(d.sinDerecho)} de IVA sin derecho a crédito, que va al gasto.</p>}
          <p className="mt-1.5 text-[10px] text-slate-400">Referencial según el RCV. No considera PPM ni remanente de meses anteriores.</p>
        </>);
      }
    }
  };

  const toggleBtn = (
    <button
      onClick={() => setOpen(true)}
      className="fixed z-40 bottom-5 right-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg px-4 py-3 flex items-center gap-2 text-xs font-bold"
    >
      <MessageCircle className="w-4 h-4" /><span>Asistente</span>
    </button>
  );

  if (!open) return toggleBtn;

  return (
    <aside className="fixed inset-y-0 right-0 z-40 w-full sm:w-[420px] xl:static xl:z-auto xl:sticky xl:top-4 xl:h-[calc(100vh-2rem)] xl:w-[400px] xl:shrink-0 flex flex-col bg-slate-50 border-l xl:border border-slate-200 xl:rounded-2xl shadow-xl xl:shadow-sm overflow-hidden">
      <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center"><Sparkles className="w-4 h-4 text-indigo-300" /></span>
          <div>
            <p className="text-sm font-black leading-tight">Asistente</p>
            <p className="text-[10px] text-slate-400">Solo consulta · cifras de tu contabilidad</p>
          </div>
        </div>
        <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300" title="Cerrar"><X className="w-4 h-4" /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {msgs.map(render)}
        {pending?.type === 'elegir' && (
          <div className="flex flex-wrap gap-1.5">
            {pending.opciones.map(o => (
              <button key={o.rut} onClick={() => { push({ from: 'user', text: o.nombre || o.rut }); mostrarCC(o); }} className="text-left text-[11px] bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 rounded-xl px-2.5 py-1.5">
                <span className="font-semibold text-slate-800 block">{o.nombre || 'Sin nombre'}</span><span className="font-mono text-slate-500">{o.rut}</span>
              </button>
            ))}
          </div>
        )}
        {pending?.type === 'fecha' && (
          <div className="bg-white border border-slate-200 rounded-xl p-2.5 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {[['Hoy', hoy], [`Fin ${selectedPeriod}`, finPeriodo], ['Fin mes pasado', finMesPasado]].map(([l, f]) => (
                <button key={l} onClick={() => { push({ from: 'user', text: `${l} (${fechaCL(f)})` }); ejecutarFecha(pending.report, f); }} className="text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 rounded-full px-2.5 py-1">{l}</button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-slate-400" />
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="flex-1 border border-slate-300 rounded-lg px-2 py-1 text-xs" />
              <button onClick={() => { if (fecha) { push({ from: 'user', text: fechaCL(fecha) }); ejecutarFecha(pending.report, fecha); } }} className="text-[11px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-3 py-1.5">Ver</button>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-slate-200 bg-white p-2.5 space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {ACCIONES.map(a => (
            <button key={a.id} onClick={() => accion(a.id)} className="text-[11px] font-semibold bg-slate-50 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200 hover:border-indigo-200 rounded-full px-2.5 py-1 flex items-center gap-1 transition-colors">
              <a.icon className="w-3 h-3" /><span>{a.label}</span>
            </button>
          ))}
        </div>
        <form onSubmit={e => { e.preventDefault(); enviar(); }} className="flex items-center gap-2">
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={pending?.type === 'parte' ? 'Nombre o RUT…' : pending?.type === 'fecha' ? 'Fecha, ej: 31-10-2026' : 'Escribe tu pregunta…'}
            className="flex-1 border border-slate-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl p-2.5" title="Enviar"><Send className="w-4 h-4" /></button>
        </form>
      </div>
    </aside>
  );
}
