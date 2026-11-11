import React, { useState, useEffect } from 'react';
import { Check, CheckCircle2 } from 'lucide-react';
import { APP_VERSION } from '../constants/version';
import { db } from '../lib/firebase';
import { collection, addDoc, onSnapshot } from 'firebase/firestore';
import { LandingPricingPlan } from '../types';
import { DEFAULT_INITIAL_PRICING_PLANS } from './PricingManager';

interface LandingHomeProps {
  onGoToLogin: (initialEmail?: string) => void;
}

const PLANES_BASE = () => DEFAULT_INITIAL_PRICING_PLANS.map((p, idx) => ({ ...p, id: `seed-p-${idx}` })) as LandingPricingPlan[];

const CAPACIDADES: { titulo: string; texto: string }[] = [
  { titulo: 'Registro de Compras y Ventas', texto: 'Descarga el RCV desde el SII y contabiliza facturas, notas de crédito y boletas sin digitar.' },
  { titulo: 'Formulario 29', texto: 'Calcula el IVA y los PPM con los códigos oficiales, listo para declarar.' },
  { titulo: 'Balance de 8 columnas e informes', texto: 'Balance tributario, estado de resultados y situación financiera bajo normas tributarias e IFRS.' },
  { titulo: 'Conciliación bancaria', texto: 'Cartolas de varias cuentas corrientes contra la contabilidad, con diferencias a la vista.' },
  { titulo: 'Remuneraciones', texto: 'Liquidaciones de sueldo, finiquitos y cotizaciones previsionales con cambios por fecha de vigencia.' },
  { titulo: 'Informe mensual para el cliente', texto: 'Cifras del mes con tus comentarios, comparadas con el mes y el año anterior, listas para imprimir.' },
];

const REGIMENES = ['Régimen ProPyme General (14-D N°3)', 'Régimen ProPyme Transparente (14-D N°8)', 'Régimen General Semi-Integrado (14-A)'];

// Ejemplo ilustrativo: los saldos deudores y acreedores suman lo mismo.
const EJEMPLO: { cuenta: string; deudor: number; acreedor: number }[] = [
  { cuenta: 'Banco', deudor: 13100000, acreedor: 0 },
  { cuenta: 'Clientes por cobrar', deudor: 8700000, acreedor: 0 },
  { cuenta: 'Proveedores', deudor: 0, acreedor: 6500000 },
  { cuenta: 'Capital', deudor: 0, acreedor: 15300000 },
];
const clp = (n: number) => (n ? `$ ${n.toLocaleString('es-CL')}` : '');

export default function LandingHome({ onGoToLogin }: LandingHomeProps) {
  const [leadName, setLeadName] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [leadCompany, setLeadCompany] = useState('');
  const [leadType, setLeadType] = useState<'Estudio Contable' | 'Pyme / Empresa' | 'Contador Independiente'>('Estudio Contable');
  const [leadMessage, setLeadMessage] = useState('');
  const [isSendingLead, setIsSendingLead] = useState(false);
  const [leadSentSuccess, setLeadSentSuccess] = useState(false);
  const [pricingPlans, setPricingPlans] = useState<LandingPricingPlan[]>(PLANES_BASE);

  // Planes y precios: se leen del panel de administración (una sola escucha)
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'landing_pricing'),
      (snapshot) => {
        if (snapshot.empty) { setPricingPlans(PLANES_BASE()); return; }
        const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as LandingPricingPlan));
        const unicos = new Map<string, LandingPricingPlan>();
        for (const p of docs) {
          if (p.status === 'inactive' || !p.name || p.priceUF === undefined || p.priceUF === null) continue;
          const k = p.name.trim().toUpperCase();
          if (!unicos.has(k)) unicos.set(k, p);
        }
        const items = Array.from(unicos.values()).sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
        setPricingPlans(items.length ? items : PLANES_BASE());
      },
      () => setPricingPlans(PLANES_BASE())
    );
    return () => unsub();
  }, []);

  const handleSendLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadEmail.trim() || !leadName.trim()) return;
    setIsSendingLead(true);
    try {
      await addDoc(collection(db, 'leads_contact'), {
        name: leadName.trim(),
        email: leadEmail.trim().toLowerCase(),
        phone: leadPhone.trim(),
        companyOrStudy: leadCompany.trim() || 'No especificada',
        type: leadType,
        message: leadMessage.trim(),
        createdAt: new Date().toISOString(),
        status: 'Pendiente',
        source: 'Landing_Profesional_Chile',
      });
      setLeadName(''); setLeadEmail(''); setLeadPhone(''); setLeadCompany(''); setLeadMessage('');
    } catch (err) {
      console.error('Error al registrar contacto:', err);
    } finally {
      setLeadSentSuccess(true);
      setIsSendingLead(false);
    }
  };

  const totalD = EJEMPLO.reduce((s, r) => s + r.deudor, 0);
  const totalA = EJEMPLO.reduce((s, r) => s + r.acreedor, 0);
  const campo = 'w-full min-h-11 bg-white border border-slate-300 rounded-lg px-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20';

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col antialiased selection:bg-teal-700 selection:text-white">
      {/* Cabecera */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between gap-4">
          <a href="#" className="flex items-baseline gap-2" aria-label="Gest_OK, inicio">
            <span className="text-lg font-extrabold tracking-tight text-slate-900">Gest_OK</span>
            <span className="hidden sm:inline text-sm text-slate-500">Contabilidad para estudios en Chile</span>
          </a>
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600" aria-label="Secciones">
            <a href="#funciones" className="hover:text-slate-900">Funciones</a>
            <a href="#precios" className="hover:text-slate-900">Planes</a>
            <a href="#contacto" className="hover:text-slate-900">Contacto</a>
          </nav>
          <button onClick={() => onGoToLogin()} className="min-h-11 px-5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold cursor-pointer">
            Ingresar
          </button>
        </div>
      </header>

      {/* Portada */}
      <section className="bg-[#F5F7FA] border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-5 py-16 md:py-24 grid md:grid-cols-2 gap-12 items-center">
          <div>
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-900 leading-[1.08]">
              Contabilidad, impuestos y remuneraciones en un solo sistema.
            </h1>
            <p className="mt-5 text-lg text-slate-600 leading-relaxed max-w-xl">
              Para estudios contables y empresas en Chile. Cada cifra de un informe se puede abrir hasta el comprobante que la originó, y la contabilidad es siempre la que manda.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <button onClick={() => onGoToLogin()} className="min-h-12 px-7 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-semibold cursor-pointer">
                Ingresar al sistema
              </button>
              <a href="#contacto" className="min-h-12 px-7 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-900 font-semibold inline-flex items-center justify-center">
                Solicitar una demostración
              </a>
            </div>
          </div>

          {/* Una sola imagen del producto: un balance que cuadra */}
          <figure className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden" aria-label="Ejemplo de balance de comprobación">
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
              <span className="text-sm font-bold text-slate-900">Balance de comprobación</span>
              <span className="text-xs text-slate-500">Ejemplo ilustrativo</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-500 text-xs">
                  <th className="text-left font-medium px-5 py-2">Cuenta</th>
                  <th className="text-right font-medium px-3 py-2">Saldo deudor</th>
                  <th className="text-right font-medium px-5 py-2">Saldo acreedor</th>
                </tr>
              </thead>
              <tbody>
                {EJEMPLO.map(r => (
                  <tr key={r.cuenta} className="border-t border-slate-100">
                    <td className="px-5 py-2.5 text-slate-800">{r.cuenta}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">{clp(r.deudor)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-slate-800">{clp(r.acreedor)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-900 font-bold">
                  <td className="px-5 py-3">Totales</td>
                  <td className="px-3 py-3 text-right tabular-nums">{clp(totalD)}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{clp(totalA)}</td>
                </tr>
              </tbody>
            </table>
            <figcaption className="px-5 py-3 bg-teal-50 border-t border-teal-100 text-sm text-teal-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Debe y haber cuadran. En el sistema, cada cuenta se abre hasta sus movimientos y comprobantes.</span>
            </figcaption>
          </figure>
        </div>
      </section>

      {/* Funciones */}
      <section id="funciones" className="py-16 md:py-24 scroll-mt-16">
        <div className="max-w-6xl mx-auto px-5">
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 max-w-2xl">Lo que necesita un estudio contable, sin planillas aparte.</h2>
          <dl className="mt-12 grid md:grid-cols-2 gap-x-14">
            {CAPACIDADES.map(c => (
              <div key={c.titulo} className="py-6 border-t border-slate-200">
                <dt className="text-lg font-bold text-slate-900">{c.titulo}</dt>
                <dd className="mt-1.5 text-slate-600 leading-relaxed max-w-md">{c.texto}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-6 pt-6 border-t border-slate-200">
            <p className="text-slate-600">Regímenes tributarios soportados: {REGIMENES.join(', ')}. Actualizado según las resoluciones y circulares del SII.</p>
          </div>
        </div>
      </section>

      {/* Planes */}
      <section id="precios" className="py-16 md:py-24 bg-[#F5F7FA] border-y border-slate-200 scroll-mt-16">
        <div className="max-w-6xl mx-auto px-5">
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">Planes mensuales en UF</h2>
          <p className="mt-3 text-slate-600 max-w-xl">Sin contrato de permanencia y sin costo adicional por soporte ni por actualizaciones tributarias.</p>

          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-5 items-stretch">
            {pricingPlans.map((plan) => {
              const corporativo = plan.name.toLowerCase().includes('corporativo') || plan.name.toLowerCase().includes('pymes');
              const precio = plan.priceText || (plan.priceUF ? `UF ${String(plan.priceUF).replace('.', ',')} + IVA` : plan.priceCLP ? `$${plan.priceCLP.toLocaleString('es-CL')}` : 'A convenir');
              const empresas = plan.maxCompanies
                ? (plan.maxCompanies >= 500 ? 'Empresas ilimitadas' : `${plan.maxCompanies} ${plan.maxCompanies === 1 ? 'empresa' : 'empresas'}`)
                : (plan.name.includes('10') ? '10 empresas' : plan.name.includes('Full') ? '100 empresas' : plan.name.includes('Entrada') ? '1 empresa' : 'Empresas ilimitadas');
              const usuarios = plan.maxUsers
                ? (plan.maxUsers >= 20 ? 'Usuarios ilimitados' : `${plan.maxUsers} ${plan.maxUsers === 1 ? 'usuario' : 'usuarios'}`)
                : (plan.name.includes('10') ? '2 usuarios' : plan.name.includes('Full') ? '4 usuarios' : plan.name.includes('Entrada') ? '1 usuario' : 'Usuarios ilimitados');
              return (
                <div key={plan.id} className={`bg-white rounded-xl p-6 flex flex-col border ${plan.popular ? 'border-teal-700 ring-1 ring-teal-700' : 'border-slate-200'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
                    {plan.popular && <span className="text-xs font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded">Recomendado</span>}
                  </div>
                  <p className="mt-3 text-2xl font-extrabold text-slate-900">{precio}</p>
                  <p className="text-sm text-slate-500">por mes</p>
                  <p className="mt-4 text-sm font-semibold text-slate-800">{empresas}, {usuarios}</p>
                  <ul className="mt-4 space-y-2 text-sm text-slate-600 flex-1">
                    {(plan.features || []).map((f, i) => (
                      <li key={i} className="flex items-start gap-2"><Check className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" /><span>{f}</span></li>
                    ))}
                  </ul>
                  {corporativo ? (
                    <a href="#contacto" className="mt-6 min-h-11 inline-flex items-center justify-center rounded-lg border border-slate-300 text-sm font-semibold text-slate-900 hover:bg-slate-50">Cotizar</a>
                  ) : (
                    <button onClick={() => onGoToLogin()} className={`mt-6 min-h-11 rounded-lg text-sm font-semibold cursor-pointer ${plan.popular ? 'bg-teal-700 hover:bg-teal-800 text-white' : 'border border-slate-300 text-slate-900 hover:bg-slate-50'}`}>Contratar</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Contacto */}
      <section id="contacto" className="py-16 md:py-24 scroll-mt-16">
        <div className="max-w-6xl mx-auto px-5 grid md:grid-cols-5 gap-12">
          <div className="md:col-span-2">
            <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">Conversemos</h2>
            <p className="mt-3 text-slate-600 leading-relaxed">Cuéntanos cómo trabajas hoy y coordinamos una demostración. Te contacta un consultor contable.</p>
            <ul className="mt-6 space-y-2 text-sm text-slate-600">
              <li>Conexión cifrada (TLS) y acceso por usuario y rol.</li>
              <li>Soporte técnico directo por consultores contables en Chile.</li>
            </ul>
            <a href="mailto:contacto@pulsocontable.cl" className="mt-6 inline-block text-sm font-semibold text-teal-800 underline underline-offset-4">contacto@pulsocontable.cl</a>
          </div>

          <div className="md:col-span-3 bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
            {leadSentSuccess ? (
              <div role="status" className="text-center py-6">
                <div className="w-12 h-12 mx-auto rounded-full bg-teal-700 text-white flex items-center justify-center"><Check className="w-6 h-6" /></div>
                <h3 className="mt-4 text-lg font-bold text-slate-900">Recibimos tu solicitud</h3>
                <p className="mt-1 text-slate-600">Te contactaremos a la brevedad.</p>
                <button onClick={() => setLeadSentSuccess(false)} className="mt-5 min-h-11 px-5 rounded-lg border border-slate-300 text-sm font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer">Enviar otra consulta</button>
              </div>
            ) : (
              <form onSubmit={handleSendLead} className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <label className="block text-sm font-semibold text-slate-800">Nombre y apellido
                    <input required value={leadName} onChange={e => setLeadName(e.target.value)} autoComplete="name" className={`${campo} mt-1.5 font-normal`} />
                  </label>
                  <label className="block text-sm font-semibold text-slate-800">Correo
                    <input required type="email" value={leadEmail} onChange={e => setLeadEmail(e.target.value)} autoComplete="email" className={`${campo} mt-1.5 font-normal`} />
                  </label>
                  <label className="block text-sm font-semibold text-slate-800">Teléfono
                    <input type="tel" value={leadPhone} onChange={e => setLeadPhone(e.target.value)} autoComplete="tel" className={`${campo} mt-1.5 font-normal`} />
                  </label>
                  <label className="block text-sm font-semibold text-slate-800">Estudio o empresa
                    <input value={leadCompany} onChange={e => setLeadCompany(e.target.value)} autoComplete="organization" className={`${campo} mt-1.5 font-normal`} />
                  </label>
                </div>
                <label className="block text-sm font-semibold text-slate-800">Eres
                  <select value={leadType} onChange={e => setLeadType(e.target.value as typeof leadType)} className={`${campo} mt-1.5 font-normal`}>
                    <option>Estudio Contable</option>
                    <option>Pyme / Empresa</option>
                    <option>Contador Independiente</option>
                  </select>
                </label>
                <label className="block text-sm font-semibold text-slate-800">Mensaje
                  <textarea rows={3} value={leadMessage} onChange={e => setLeadMessage(e.target.value)} className={`${campo} mt-1.5 py-2 font-normal`} />
                </label>
                <button type="submit" disabled={isSendingLead} className="w-full min-h-12 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold disabled:opacity-60 cursor-pointer">
                  {isSendingLead ? 'Enviando…' : 'Solicitar demostración'}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      <footer className="mt-auto border-t border-slate-200 bg-white py-8 text-sm text-slate-500">
        <div className="max-w-6xl mx-auto px-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span><b className="text-slate-900">Gest_OK</b> {APP_VERSION}, Santiago de Chile</span>
          <span>&copy; {new Date().getFullYear()} PulsoContable SpA</span>
        </div>
      </footer>
    </div>
  );
}
