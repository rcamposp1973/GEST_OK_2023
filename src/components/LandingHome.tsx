import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  ArrowRight, 
  Check, 
  FileText, 
  Scale, 
  Calculator, 
  Receipt, 
  ShieldCheck, 
  Lock, 
  Mail, 
  Phone, 
  Send, 
  Users, 
  CreditCard,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  Landmark,
  Layers,
  Calendar,
  CheckCircle2,
  ExternalLink,
  MessageSquare
} from 'lucide-react';
import { APP_VERSION } from '../constants/version';
import { db } from '../lib/firebase';
import { collection, addDoc, onSnapshot } from 'firebase/firestore';
import { LandingTestimonial, LandingPricingPlan } from '../types';
import { DEFAULT_INITIAL_TESTIMONIALS } from './TestimonialManager';
import { DEFAULT_INITIAL_PRICING_PLANS } from './PricingManager';

interface LandingHomeProps {
  onGoToLogin: (initialEmail?: string) => void;
}

export default function LandingHome({ onGoToLogin }: LandingHomeProps) {
  // Input rápido de email / RUT
  const [heroEmail, setHeroEmail] = useState('');

  // Pestaña activa en la maqueta interactiva del software
  const [activeTab, setActiveTab] = useState<'f29' | 'balance' | 'rcv' | 'banco'>('f29');

  // Formulario de contacto / demo
  const [leadName, setLeadName] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [leadCompany, setLeadCompany] = useState('');
  const [leadType, setLeadType] = useState<'Estudio Contable' | 'Pyme / Empresa' | 'Contador Independiente'>('Estudio Contable');
  const [leadMessage, setLeadMessage] = useState('');
  const [isSendingLead, setIsSendingLead] = useState(false);
  const [leadSentSuccess, setLeadSentSuccess] = useState(false);

  // Testimonios profesionales
  const [testimonials, setTestimonials] = useState<LandingTestimonial[]>(() => {
    return DEFAULT_INITIAL_TESTIMONIALS.map((t, idx) => ({ ...t, id: `seed-t-${idx}` }));
  });
  const [activeSlide, setActiveSlide] = useState(0);
  const [isSlidePaused, setIsSlidePaused] = useState(false);

  // Planes de precios oficiales
  const [pricingPlans, setPricingPlans] = useState<LandingPricingPlan[]>(() => {
    return DEFAULT_INITIAL_PRICING_PLANS.map((p, idx) => ({ ...p, id: `seed-p-${idx}` }));
  });

  useEffect(() => {
    const unsubTestimonials = onSnapshot(
      collection(db, 'landing_testimonials'),
      (snapshot) => {
        if (!snapshot.empty) {
          const items = snapshot.docs
            .map(d => ({ id: d.id, ...d.data() } as LandingTestimonial))
            .filter(t => t.status === 'active');
          if (items.length > 0) {
            items.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
            setTestimonials(items);
          }
        }
      },
      (err) => console.warn('Aviso lectura testimonios:', err)
    );

    const unsubPricing = onSnapshot(
      collection(db, 'landing_pricing'),
      async (snapshot) => {
        if (!snapshot.empty) {
          const rawDocs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as LandingPricingPlan));
          
          const validOfficialDocs = rawDocs.filter(
            p => p.priceUF !== undefined && p.priceUF !== null && p.name && (p.name.toUpperCase().includes('ENTRADA') || p.name.toUpperCase().includes('10') || p.name.toUpperCase().includes('FULL') || p.name.toUpperCase().includes('CORPORATIVO') || p.name.toUpperCase().includes('ESTUDIO') || p.name.toUpperCase().includes('PYME'))
          );

          if (validOfficialDocs.length === 0) {
            setPricingPlans(DEFAULT_INITIAL_PRICING_PLANS.map((p, idx) => ({ ...p, id: `seed-p-${idx}` })));
            return;
          }

          const uniqueMap = new Map<string, LandingPricingPlan>();
          for (const docItem of validOfficialDocs) {
            if (docItem.status !== 'inactive') {
              const key = docItem.name.trim().toUpperCase();
              if (!uniqueMap.has(key)) {
                uniqueMap.set(key, docItem);
              }
            }
          }

          const items = Array.from(uniqueMap.values());
          items.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

          if (items.length > 0) {
            setPricingPlans(items);
          } else {
            setPricingPlans(DEFAULT_INITIAL_PRICING_PLANS.map((p, idx) => ({ ...p, id: `seed-p-${idx}` })));
          }
        } else {
          setPricingPlans(DEFAULT_INITIAL_PRICING_PLANS.map((p, idx) => ({ ...p, id: `seed-p-${idx}` })));
        }
      },
      (err) => {
        console.warn('Aviso lectura planes precios:', err);
        setPricingPlans(DEFAULT_INITIAL_PRICING_PLANS.map((p, idx) => ({ ...p, id: `seed-p-${idx}` })));
      }
    );

    return () => {
      unsubTestimonials();
      unsubPricing();
    };
  }, []);

  // Rotación pausada de testimonios
  useEffect(() => {
    if (testimonials.length <= 1 || isSlidePaused) return;
    const timer = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % testimonials.length);
    }, 7000);
    return () => clearInterval(timer);
  }, [testimonials.length, isSlidePaused]);

  const handlePrevSlide = () => {
    setActiveSlide((prev) => (prev === 0 ? testimonials.length - 1 : prev - 1));
  };

  const handleNextSlide = () => {
    setActiveSlide((prev) => (prev + 1) % testimonials.length);
  };

  const handleHeroSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onGoToLogin(heroEmail.trim());
  };

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
        source: 'Landing_Profesional_Chile'
      });

      setLeadSentSuccess(true);
      setLeadName('');
      setLeadEmail('');
      setLeadPhone('');
      setLeadCompany('');
      setLeadMessage('');
    } catch (err) {
      console.error("Error al registrar contacto:", err);
      setLeadSentSuccess(true);
    } finally {
      setIsSendingLead(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col font-sans selection:bg-slate-900 selection:text-white antialiased">
      
      {/* ========================================================= */}
      {/* 1. TOP BAR INSTITUCIONAL (CONTRATO DE 3 ZONAS)            */}
      {/* ========================================================= */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          
          {/* Zona 1: Wordmark limpio */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-white font-bold text-sm">
              PC
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight text-slate-900">Pulso Contable</span>
              <span className="text-xs text-slate-500 hidden sm:inline ml-2 pl-2 border-l border-slate-200">
                Software Contable & Tributario Chile
              </span>
            </div>
          </div>

          {/* Zona 2: Enlaces de navegación sobrios */}
          <nav className="hidden md:flex items-center gap-8 text-xs font-semibold text-slate-600">
            <a href="#modulos" className="hover:text-slate-950 transition-colors">Módulos</a>
            <a href="#normativa" className="hover:text-slate-950 transition-colors">Normativa SII</a>
            <a href="#precios" className="hover:text-slate-950 transition-colors">Planes y Tarifas</a>
            <a href="#nosotros" className="hover:text-slate-950 transition-colors">Quiénes Somos</a>
            <a href="#contacto" className="hover:text-slate-950 transition-colors">Contacto</a>
          </nav>

          {/* Zona 3: Acción primaria */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => onGoToLogin()}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
            >
              <span>Acceder a la Plataforma</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

        </div>
      </header>

      {/* ========================================================= */}
      {/* 2. HERO SECTION SOBRIO Y EDITORIAL                        */}
      {/* ========================================================= */}
      <section className="pt-16 pb-20 md:pt-24 md:pb-28 bg-slate-50/60 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-3xl mx-auto space-y-6">
            
            {/* Kicker Editorial Unboxed */}
            <div className="flex items-center justify-center gap-2 text-xs font-medium text-slate-600">
              <span className="font-semibold text-slate-900">Actualizado para el Año Tributario 2026</span>
              <span aria-hidden="true">·</span>
              <span>Integración con API del SII</span>
              <span aria-hidden="true">·</span>
              <span>Multi-Empresa</span>
            </div>

            {/* Titular Principal Serio */}
            <h1 className="text-3xl sm:text-5xl lg:text-[3.25rem] font-bold tracking-tight text-slate-950 leading-[1.15] text-balance">
              Software Contable, Tributario y de Facturación para Estudios y Empresas en Chile
            </h1>

            {/* Subtítulo enfocado en la función contable real */}
            <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-2xl mx-auto font-normal">
              Centraliza la gestión de tus clientes, automatiza la descarga del Registro de Compras y Ventas (RCV), calcula el Formulario 29 y emite Balances Tributarios de 8 Columnas con total certeza normativa.
            </p>

            {/* Formulario de Acceso Directo / Prueba */}
            <form onSubmit={handleHeroSubmit} className="pt-3 max-w-md mx-auto">
              <div className="p-1 bg-white rounded-lg border border-slate-300 shadow-sm flex flex-col sm:flex-row items-center gap-1.5 focus-within:border-slate-800 transition-colors">
                <div className="flex items-center gap-2 pl-3 w-full sm:w-auto flex-1">
                  <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    value={heroEmail}
                    onChange={(e) => setHeroEmail(e.target.value)}
                    placeholder="Ingresa tu correo o RUT de empresa"
                    className="w-full py-2 text-xs bg-transparent outline-none text-slate-900 placeholder:text-slate-400 font-medium"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full sm:w-auto px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-md transition-colors shrink-0 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span>Probar Plataforma</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
              
              {/* Metadatos limpios */}
              <div className="text-xs text-slate-500 mt-3 flex items-center justify-center gap-3 flex-wrap">
                <span>Régimen 14-D ProPyme y 14-A</span>
                <span aria-hidden="true">·</span>
                <span>Sin instalación local</span>
                <span aria-hidden="true">·</span>
                <span>Soporte por contadores en Chile</span>
              </div>
            </form>

          </div>

          {/* ========================================================= */}
          {/* VISTA INTERACTIVA DEL SOFTWARE CONTABLE (ESTRUCTURADA)    */}
          {/* ========================================================= */}
          <div className="mt-14 max-w-5xl mx-auto">
            <div className="bg-white rounded-xl border border-slate-300 shadow-sm overflow-hidden">
              
              {/* Barra Superior del Panel */}
              <div className="bg-slate-100 px-4 sm:px-6 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-800">
                    Demostración Interactiva de Módulos
                  </span>
                  <span className="text-slate-400 text-xs hidden sm:inline">|</span>
                  <span className="text-xs text-slate-500 hidden sm:inline">
                    Sociedad Comercial Demo SpA (RUT 76.845.120-3)
                  </span>
                </div>

                {/* Segmented Control de Pestañas */}
                <div className="flex items-center gap-1 bg-slate-200/80 p-0.5 rounded-lg">
                  <button
                    onClick={() => setActiveTab('f29')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      activeTab === 'f29'
                        ? 'bg-white text-slate-900 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Formulario 29
                  </button>
                  <button
                    onClick={() => setActiveTab('balance')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      activeTab === 'balance'
                        ? 'bg-white text-slate-900 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Balance 8 Columnas
                  </button>
                  <button
                    onClick={() => setActiveTab('rcv')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      activeTab === 'rcv'
                        ? 'bg-white text-slate-900 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Registro RCV
                  </button>
                  <button
                    onClick={() => setActiveTab('banco')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      activeTab === 'banco'
                        ? 'bg-white text-slate-900 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Conciliación Bancaria
                  </button>
                </div>
              </div>

              {/* Contenedor de la Maqueta Seleccionada */}
              <div className="p-4 sm:p-6 bg-white">
                {activeTab === 'f29' && <F29Mockup />}
                {activeTab === 'balance' && <BalanceMockup />}
                {activeTab === 'rcv' && <RcvMockup />}
                {activeTab === 'banco' && <BankMockup />}
              </div>

              {/* Barra de Estado Inferior */}
              <div className="bg-slate-50 px-6 py-2.5 border-t border-slate-200 flex flex-wrap items-center justify-between text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-600" />
                  <span>Validación automática de sumas y saldos activa</span>
                </div>
                <div className="text-slate-500 text-[11px] font-mono">
                  Período Tributario: 2026-04 · Régimen 14-D N°3
                </div>
              </div>

            </div>
          </div>

        </div>
      </section>

      {/* ========================================================= */}
      {/* 3. MÓDULOS PRINCIPALES DEL SISTEMA                        */}
      {/* ========================================================= */}
      <section id="modulos" className="py-20 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Capacidades del Sistema
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              Módulos diseñados para la práctica contable real en Chile
            </h2>
            <p className="text-sm text-slate-600">
              Cada funcionalidad responde a la normativa vigente del Servicio de Impuestos Internos y a las necesidades operativas de los despachos contables.
            </p>
          </div>

          {/* Grid de 4 Módulos Estructurados */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* Módulo 1: RCV y DTEs */}
            <div className="p-6 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-slate-300 hover:shadow-xs transition-all flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-lg bg-slate-900 text-white flex items-center justify-center mb-4">
                  <Receipt className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-2">Registro de Compras y Ventas (RCV)</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Descarga automática de DTEs de compras, ventas y boletas de honorarios electrónicas (BHR). Creación inmediata de auxiliares de clientes y proveedores.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-200 text-xs font-semibold text-slate-900 flex items-center justify-between">
                <span>Facturas 33, 34, 39, 61</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              </div>
            </div>

            {/* Módulo 2: Formulario 29 */}
            <div className="p-6 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-slate-300 hover:shadow-xs transition-all flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-lg bg-slate-900 text-white flex items-center justify-center mb-4">
                  <Calculator className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-2">Liquidación de Formulario 29</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Determinación mensual de débito, crédito fiscal, tasas de PPM con historial legal, retenciones de segunda categoría e impuestos específicos.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-200 text-xs font-semibold text-slate-900 flex items-center justify-between">
                <span>Códigos Oficiales SII</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              </div>
            </div>

            {/* Módulo 3: Balance y Contabilidad */}
            <div className="p-6 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-slate-300 hover:shadow-xs transition-all flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-lg bg-slate-900 text-white flex items-center justify-center mb-4">
                  <Scale className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-2">Balance 8 Columnas e Informes</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Libro Diario, Libro Mayor y Balance Tributario clasificado con verificación estricta de partida doble y exportación formal para auditorías.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-200 text-xs font-semibold text-slate-900 flex items-center justify-between">
                <span>Normas IFRS y Tributarias</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              </div>
            </div>

            {/* Módulo 4: Conciliación Bancaria */}
            <div className="p-6 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-slate-300 hover:shadow-xs transition-all flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-lg bg-slate-900 text-white flex items-center justify-center mb-4">
                  <Landmark className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-2">Conciliación Bancaria</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Carga de cartolas de bancos chilenos (Banco de Chile, Santander, BCI, Scotiabank, BancoEstado) y cruce por RUT o número de documento en glosa.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-200 text-xs font-semibold text-slate-900 flex items-center justify-between">
                <span>Multi-Cuentas Corrientes</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* ========================================================= */}
      {/* 4. SECCIÓN NORMATIVA TRIBUTARIA CHILENA                    */}
      {/* ========================================================= */}
      <section id="normativa" className="py-16 bg-slate-50/60 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="max-w-3xl mx-auto text-center space-y-3 mb-12">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Marco Legal y Cumplimiento
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
              Adaptado a los Regímenes de la Ley N° 21.210
            </h2>
            <p className="text-xs sm:text-sm text-slate-600">
              Parametrización tributaria lista para operar bajo los distintos esquemas impositivos chilenos.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            
            <div className="p-5 bg-white rounded-xl border border-slate-200">
              <h4 className="text-sm font-bold text-slate-900 mb-1">Régimen ProPyme General (14-D N°3)</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Contabilidad completa o simplificada con tasa de impuesto de primera categoría e incentivo al ahorro con reinversión de utilidades.
              </p>
            </div>

            <div className="p-5 bg-white rounded-xl border border-slate-200">
              <h4 className="text-sm font-bold text-slate-900 mb-1">Régimen ProPyme Transparente (14-D N°8)</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Liberación de impuesto de primera categoría y asignación directa de base imponible a los propietarios o socios personas naturales.
              </p>
            </div>

            <div className="p-5 bg-white rounded-xl border border-slate-200">
              <h4 className="text-sm font-bold text-slate-900 mb-1">Régimen General Semi-Integrado (14-A)</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Contabilidad completa bajo IFRS, cálculo de capital propio tributario (CPT), registro de rentas empresariales (RRE) y créditos con restitución.
              </p>
            </div>

          </div>

        </div>
      </section>

      {/* ========================================================= */}
      {/* 5. PLANES Y TARIFAS EN UF (CONFIGURACIÓN COMERCIAL)       */}
      {/* ========================================================= */}
      <section id="precios" className="py-20 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-3xl mx-auto mb-14 space-y-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Planes Comerciales
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
              Tarifas Transparentes en Unidades de Fomento (UF)
            </h2>
            <p className="text-xs sm:text-sm text-slate-600">
              Suscripción mensual sin contratos de permanencia ni costos adicionales por soporte o actualizaciones tributarias.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto items-stretch">
            {pricingPlans.map((plan) => {
              const isCorporate = plan.name.toLowerCase().includes('corporativo') || plan.name.toLowerCase().includes('pymes');
              const displayPrice = plan.priceText || (plan.priceUF ? `UF ${String(plan.priceUF).replace('.', ',')} + IVA` : (plan.priceCLP ? `$${plan.priceCLP.toLocaleString('es-CL')}` : 'A Convenir'));
              
              const companiesLimit = plan.maxCompanies 
                ? (plan.maxCompanies >= 500 ? 'Empresas Ilimitadas' : `${plan.maxCompanies} ${plan.maxCompanies === 1 ? 'Empresa' : 'Empresas'}`)
                : (plan.name.includes('10') ? '10 Empresas' : plan.name.includes('Full') ? '100 Empresas' : plan.name.includes('Entrada') ? '1 Empresa' : 'Empresas Ilimitadas');
              
              const usersLimit = plan.maxUsers
                ? (plan.maxUsers >= 20 ? 'Usuarios Ilimitados' : `${plan.maxUsers} ${plan.maxUsers === 1 ? 'Usuario' : 'Usuarios'}`)
                : (plan.name.includes('10') ? '2 Usuarios' : plan.name.includes('Full') ? '4 Usuarios' : plan.name.includes('Entrada') ? '1 Usuario' : 'Usuarios Ilimitados');

              return (
                <div
                  key={plan.id}
                  className={`rounded-xl p-6 border flex flex-col justify-between transition-all ${
                    plan.popular
                      ? 'bg-white border-slate-900 shadow-md ring-1 ring-slate-900'
                      : 'bg-slate-50/50 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div>
                    {/* Header del Plan */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="text-base font-bold text-slate-900">{plan.name}</h3>
                      {plan.popular && (
                        <span className="text-[10px] font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-300 uppercase tracking-wider">
                          Recomendado
                        </span>
                      )}
                    </div>

                    {/* Precio Principal */}
                    <div className="mt-2 mb-4 pb-4 border-b border-slate-200">
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold font-mono text-slate-900">
                          {displayPrice}
                        </span>
                        <span className="text-xs text-slate-500 font-normal"> / mes</span>
                      </div>
                      {plan.priceCLP && plan.priceCLP > 0 && (
                        <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                          Ref. CLP: ${plan.priceCLP.toLocaleString('es-CL')} aprox.
                        </p>
                      )}
                    </div>

                    {/* Resumen de Capacidad */}
                    <div className="py-2 px-3 bg-white rounded border border-slate-200 mb-4 text-xs text-slate-700 flex items-center justify-between">
                      <span className="font-semibold">{companiesLimit}</span>
                      <span className="text-slate-300">•</span>
                      <span className="font-semibold">{usersLimit}</span>
                    </div>

                    {/* Lista de Características */}
                    <ul className="space-y-2 text-xs text-slate-600 mb-6">
                      {(plan.features || []).map((feature, fIdx) => (
                        <li key={fIdx} className="flex items-start gap-2">
                          <Check className="w-3.5 h-3.5 text-slate-800 shrink-0 mt-0.5" />
                          <span className="leading-snug">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Botón de Acción */}
                  <div className="pt-2">
                    {isCorporate ? (
                      <a
                        href="#contacto"
                        className="block text-center py-2.5 px-4 bg-white hover:bg-slate-100 border border-slate-300 text-xs font-semibold text-slate-900 rounded-lg transition-colors cursor-pointer"
                      >
                        Cotizar Plan Corporativo
                      </a>
                    ) : (
                      <button
                        onClick={() => onGoToLogin()}
                        className={`w-full py-2.5 px-4 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                          plan.popular
                            ? 'bg-slate-900 hover:bg-slate-800 text-white shadow-2xs'
                            : 'bg-white hover:bg-slate-100 border border-slate-300 text-slate-900'
                        }`}
                      >
                        Contratar {plan.name}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      </section>

      {/* ========================================================= */}
      {/* 6. TESTIMONIOS PROFESIONALES                              */}
      {/* ========================================================= */}
      <section 
        id="testimonios" 
        className="py-16 bg-slate-50/60 border-b border-slate-200"
        onMouseEnter={() => setIsSlidePaused(true)}
        onMouseLeave={() => setIsSlidePaused(false)}
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-xl mx-auto mb-10 space-y-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Referencias Profesionales
            </span>
            <h2 className="text-2xl font-bold text-slate-900">
              Opiniones de Contadores y Firmas Auditoras
            </h2>
          </div>

          {testimonials.length > 0 && (
            <div className="bg-white rounded-xl p-8 border border-slate-200 shadow-2xs relative">
              <div className="space-y-4">
                <p className="text-base sm:text-lg text-slate-800 italic leading-relaxed">
                  "{testimonials[activeSlide % testimonials.length]?.comment}"
                </p>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-4">
                  <div>
                    <h4 className="font-bold text-sm text-slate-900">
                      {testimonials[activeSlide % testimonials.length]?.author}
                    </h4>
                    <p className="text-xs text-slate-500">
                      {testimonials[activeSlide % testimonials.length]?.role}
                      {testimonials[activeSlide % testimonials.length]?.company && (
                        <span> · {testimonials[activeSlide % testimonials.length]?.company}</span>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handlePrevSlide}
                      className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                      title="Anterior"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={handleNextSlide}
                      className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white transition cursor-pointer"
                      title="Siguiente"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </section>

      {/* ========================================================= */}
      {/* 7. QUIÉNES SOMOS & RESPALDO INSTITUCIONAL                 */}
      {/* ========================================================= */}
      <section id="nosotros" className="py-16 bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div className="space-y-4">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Sobre la Empresa
              </span>
              <h2 className="text-2xl font-bold text-slate-900">
                Desarrollado y Soportado en Santiago de Chile
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Pulso Contable es una solución creada por contadores y especialistas en desarrollo de software financiero para resolver las exigencias operativas y tributarias del mercado chileno.
              </p>
              
              <div className="space-y-2 pt-2 text-xs text-slate-700">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-slate-900 shrink-0" />
                  <span>Actualizaciones continuas conforme a resoluciones y circulares del SII.</span>
                </div>
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-slate-900 shrink-0" />
                  <span>Seguridad de datos con cifrado TLS y respaldos en la nube.</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-slate-900 shrink-0" />
                  <span>Atención técnica directa por consultores contables en Chile.</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-3">
              <h4 className="font-bold text-sm text-slate-900">PulsoContable SpA</h4>
              <p>
                Oficinas de Desarrollo y Operaciones: Providencia, Santiago, Chile.<br />
                Contacto: <strong>contacto@pulsocontable.cl</strong>
              </p>
              <div className="pt-3 border-t border-slate-200 text-[11px] text-slate-500">
                Plataforma web compatible con cualquier navegador moderno sin requerir servidores locales.
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ========================================================= */}
      {/* 8. FORMULARIO DE CONTACTO / SOLICITUD DE DEMO             */}
      {/* ========================================================= */}
      <section id="contacto" className="py-20 bg-slate-50/60 border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="bg-white rounded-xl p-8 border border-slate-200 shadow-sm">
            
            <div className="text-center max-w-xl mx-auto mb-8 space-y-2">
              <h2 className="text-2xl font-bold text-slate-900">
                Solicita una Demostración Guiada
              </h2>
              <p className="text-xs sm:text-sm text-slate-600">
                Completa tus datos y un consultor contable te contactará para coordinar una sesión de prueba o resolver tus consultas.
              </p>
            </div>

            {leadSentSuccess ? (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 text-center space-y-2">
                <div className="w-10 h-10 bg-slate-900 text-white rounded-full flex items-center justify-center mx-auto">
                  <Check className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">Solicitud Recibida Correctamente</h3>
                <p className="text-xs text-slate-600 max-w-md mx-auto">
                  Muchas gracias. Nos pondremos en contacto contigo a la brevedad.
                </p>
                <button
                  onClick={() => setLeadSentSuccess(false)}
                  className="mt-2 px-3 py-1.5 bg-white border border-slate-300 text-slate-800 text-xs font-semibold rounded-md hover:bg-slate-50 transition cursor-pointer"
                >
                  Enviar otra consulta
                </button>
              </div>
            ) : (
              <form onSubmit={handleSendLead} className="space-y-4 text-xs">
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold text-slate-800 mb-1">Nombre y Apellido *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ej: Ramón Campos"
                      value={leadName}
                      onChange={(e) => setLeadName(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-800 mb-1">Correo Electrónico *</label>
                    <input
                      type="email"
                      required
                      placeholder="ejemplo@estudio.cl"
                      value={leadEmail}
                      onChange={(e) => setLeadEmail(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900 font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold text-slate-800 mb-1">Teléfono de Contacto</label>
                    <input
                      type="tel"
                      placeholder="+56 9 1234 5678"
                      value={leadPhone}
                      onChange={(e) => setLeadPhone(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-800 mb-1">Estudio Contable o Razón Social</label>
                    <input
                      type="text"
                      placeholder="Ej: Campos & Asociados SpA"
                      value={leadCompany}
                      onChange={(e) => setLeadCompany(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900 font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold text-slate-800 mb-1">Tipo de Actividad</label>
                    <select
                      value={leadType}
                      onChange={(e: any) => setLeadType(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-slate-900 font-medium"
                    >
                      <option value="Estudio Contable">Estudio Contable (Múltiples Clientes)</option>
                      <option value="Contador Independiente">Contador Independiente</option>
                      <option value="Pyme / Empresa">Pyme / Empresa Individual</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-800 mb-1">Consulta o Requerimiento</label>
                    <input
                      type="text"
                      placeholder="Indícanos cuántas empresas administras"
                      value={leadMessage}
                      onChange={(e) => setLeadMessage(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900 font-medium"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSendingLead}
                    className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shadow-2xs"
                  >
                    {isSendingLead ? (
                      <span>Enviando solicitud...</span>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Enviar Solicitud</span>
                      </>
                    )}
                  </button>
                </div>

              </form>
            )}

          </div>

        </div>
      </section>

      {/* ========================================================= */}
      {/* 9. FOOTER CORPORATIVO DISCRETO                            */}
      {/* ========================================================= */}
      <footer className="mt-auto bg-slate-900 text-white py-10 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6 text-slate-400">
            
            <div className="flex items-center gap-3">
              <span className="font-bold text-white text-sm">Pulso Contable</span>
              <span>·</span>
              <span>Versión {APP_VERSION}</span>
              <span>·</span>
              <span>Santiago de Chile</span>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-6">
              <button
                onClick={() => onGoToLogin()}
                className="text-white hover:text-slate-200 font-medium transition cursor-pointer"
              >
                Acceso Plataforma
              </button>
              <a href="#modulos" className="hover:text-white transition">Módulos</a>
              <a href="#normativa" className="hover:text-white transition">Normativa</a>
              <a href="#precios" className="hover:text-white transition">Precios</a>
              <a href="#contacto" className="hover:text-white transition">Contacto</a>
              <span>&copy; {new Date().getFullYear()} PulsoContable SpA.</span>
            </div>

          </div>
        </div>
      </footer>

    </div>
  );
}

// ----------------------------------------------------------------------------------
// MOCKUPS TÉCNICOS INTERACTIVOS
// ----------------------------------------------------------------------------------

function F29Mockup() {
  return (
    <div className="space-y-4 font-sans text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-900">Formulario 29 Oficial SII:</span>
          <span className="font-mono text-xs text-slate-700 font-semibold">Período 2026-04</span>
          <span className="text-slate-400">·</span>
          <span className="text-emerald-700 font-semibold text-[11px]">Partida Doble Cuadrada</span>
        </div>
        <div className="text-slate-500 text-[11px]">RUT 76.845.120-3 (Régimen 14-D N°3 ProPyme)</div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1">
          <div className="text-[10px] uppercase font-bold text-slate-500">Débito Fiscal (Ventas)</div>
          <div className="text-base font-bold font-mono text-slate-900 tabular-nums">$ 4.712.000</div>
          <div className="text-[10px] text-slate-500">Cód. [502] · 120 Documentos</div>
        </div>

        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1">
          <div className="text-[10px] uppercase font-bold text-slate-500">Crédito Fiscal (Compras)</div>
          <div className="text-base font-bold font-mono text-slate-900 tabular-nums">$ 2.850.000</div>
          <div className="text-[10px] text-slate-500">Cód. [520] · 45 Facturas</div>
        </div>

        <div className="bg-slate-100 p-3 rounded-lg border border-slate-300 space-y-1">
          <div className="text-[10px] uppercase font-bold text-slate-900">Impuesto Determinado a Pagar</div>
          <div className="text-base font-bold font-mono text-slate-950 tabular-nums">$ 2.247.450</div>
          <div className="text-[10px] text-slate-600">Incluye PPM 1.5% + Retención Honorarios</div>
        </div>
      </div>

      <table className="w-full text-left border-collapse border border-slate-200 text-[11px] rounded-lg overflow-hidden">
        <thead className="bg-slate-50 text-slate-800 font-bold border-b border-slate-200">
          <tr>
            <th className="p-2.5">Concepto Formulario 29</th>
            <th className="p-2.5">Código SII</th>
            <th className="p-2.5 text-right">Base Imponible</th>
            <th className="p-2.5 text-right">Monto Determinado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 text-slate-700 bg-white">
          <tr>
            <td className="p-2.5 font-medium">Débito Fiscal Facturas Emitidas</td>
            <td className="p-2.5 font-mono text-slate-900">[502]</td>
            <td className="p-2.5 text-right font-mono tabular-nums">$ 24.800.000</td>
            <td className="p-2.5 text-right font-mono font-bold text-slate-900 tabular-nums">$ 4.712.000</td>
          </tr>
          <tr>
            <td className="p-2.5 font-medium">Crédito Fiscal Facturas Recibidas</td>
            <td className="p-2.5 font-mono text-slate-900">[520]</td>
            <td className="p-2.5 text-right font-mono tabular-nums">$ 15.000.000</td>
            <td className="p-2.5 text-right font-mono font-bold text-slate-900 tabular-nums">$ 2.850.000</td>
          </tr>
          <tr>
            <td className="p-2.5 font-medium">P.P.M. Régimen ProPyme General (1.5%)</td>
            <td className="p-2.5 font-mono text-slate-900">[062]</td>
            <td className="p-2.5 text-right font-mono tabular-nums">$ 24.800.000</td>
            <td className="p-2.5 text-right font-mono font-bold text-slate-900 tabular-nums">$ 372.000</td>
          </tr>
          <tr>
            <td className="p-2.5 font-medium">Retención 2da Categoría Honorarios (14.5%)</td>
            <td className="p-2.5 font-mono text-slate-900">[151]</td>
            <td className="p-2.5 text-right font-mono tabular-nums">$ 1.000.000</td>
            <td className="p-2.5 text-right font-mono font-bold text-slate-900 tabular-nums">$ 145.000</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function BalanceMockup() {
  return (
    <div className="space-y-4 font-sans text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-900">Balance Tributario de 8 Columnas:</span>
          <span className="text-emerald-700 font-semibold text-[11px]">Sumas Iguales Verificadas</span>
        </div>
        <div className="text-slate-500 text-[11px]">Ejercicio Comercial 2026</div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse border border-slate-200 text-[11px] rounded-lg overflow-hidden">
          <thead className="bg-slate-50 text-slate-800 font-bold border-b border-slate-200">
            <tr>
              <th className="p-2.5">Código & Cuenta</th>
              <th className="p-2.5 text-right">Débitos</th>
              <th className="p-2.5 text-right">Créditos</th>
              <th className="p-2.5 text-right">Saldo Deudor</th>
              <th className="p-2.5 text-right">Saldo Acreedor</th>
              <th className="p-2.5 text-right">Activo</th>
              <th className="p-2.5 text-right">Pasivo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-slate-700 bg-white font-mono">
            <tr>
              <td className="p-2.5 font-sans font-medium text-slate-900">1-1-01-01 Banco Santander</td>
              <td className="p-2.5 text-right tabular-nums">$ 45.200.000</td>
              <td className="p-2.5 text-right tabular-nums">$ 32.100.000</td>
              <td className="p-2.5 text-right font-bold text-slate-900 tabular-nums">$ 13.100.000</td>
              <td className="p-2.5 text-right tabular-nums">$ 0</td>
              <td className="p-2.5 text-right font-bold text-slate-900 tabular-nums">$ 13.100.000</td>
              <td className="p-2.5 text-right tabular-nums">$ 0</td>
            </tr>
            <tr>
              <td className="p-2.5 font-sans font-medium text-slate-900">1-1-02-01 Clientes por Cobrar</td>
              <td className="p-2.5 text-right tabular-nums">$ 28.500.000</td>
              <td className="p-2.5 text-right tabular-nums">$ 19.800.000</td>
              <td className="p-2.5 text-right font-bold text-slate-900 tabular-nums">$ 8.700.000</td>
              <td className="p-2.5 text-right tabular-nums">$ 0</td>
              <td className="p-2.5 text-right font-bold text-slate-900 tabular-nums">$ 8.700.000</td>
              <td className="p-2.5 text-right tabular-nums">$ 0</td>
            </tr>
            <tr>
              <td className="p-2.5 font-sans font-medium text-slate-900">2-1-01-01 Proveedores Nacionales</td>
              <td className="p-2.5 text-right tabular-nums">$ 12.000.000</td>
              <td className="p-2.5 text-right tabular-nums">$ 18.500.000</td>
              <td className="p-2.5 text-right tabular-nums">$ 0</td>
              <td className="p-2.5 text-right font-bold text-slate-900 tabular-nums">$ 6.500.000</td>
              <td className="p-2.5 text-right tabular-nums">$ 0</td>
              <td className="p-2.5 text-right font-bold text-slate-900 tabular-nums">$ 6.500.000</td>
            </tr>
            <tr className="bg-slate-100 font-bold text-slate-950">
              <td className="p-2.5 font-sans">SUMAS TOTALES Y RESULTADO</td>
              <td className="p-2.5 text-right tabular-nums">$ 85.700.000</td>
              <td className="p-2.5 text-right tabular-nums">$ 85.700.000</td>
              <td className="p-2.5 text-right tabular-nums">$ 21.800.000</td>
              <td className="p-2.5 text-right tabular-nums">$ 21.800.000</td>
              <td className="p-2.5 text-right tabular-nums">$ 21.800.000</td>
              <td className="p-2.5 text-right tabular-nums">$ 21.800.000</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RcvMockup() {
  return (
    <div className="space-y-4 font-sans text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-900">Registro de Compras y Ventas (RCV):</span>
          <span className="text-slate-600">Sincronización Directa SII</span>
        </div>
        <div className="text-slate-500 text-[11px]">35 facturas procesadas este mes</div>
      </div>

      <table className="w-full text-left border-collapse border border-slate-200 text-[11px] rounded-lg overflow-hidden">
        <thead className="bg-slate-50 text-slate-800 font-bold border-b border-slate-200">
          <tr>
            <th className="p-2.5">Tipo & Folio</th>
            <th className="p-2.5">RUT Contraparte</th>
            <th className="p-2.5">Razón Social</th>
            <th className="p-2.5 text-right">Neto ($)</th>
            <th className="p-2.5 text-right">IVA ($)</th>
            <th className="p-2.5 text-right">Total ($)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 text-slate-700 bg-white">
          <tr>
            <td className="p-2.5 font-semibold text-slate-900">Factura Electrónica #1240</td>
            <td className="p-2.5 font-mono">76.845.120-3</td>
            <td className="p-2.5 font-medium">DISTRIBUIDORA Y LOGÍSTICA CHILE S.A.</td>
            <td className="p-2.5 text-right font-mono tabular-nums">$ 1.250.000</td>
            <td className="p-2.5 text-right font-mono tabular-nums">$ 237.500</td>
            <td className="p-2.5 text-right font-mono font-bold text-slate-900 tabular-nums">$ 1.487.500</td>
          </tr>
          <tr>
            <td className="p-2.5 font-semibold text-slate-900">Factura Electrónica #1241</td>
            <td className="p-2.5 font-mono">96.555.444-2</td>
            <td className="p-2.5 font-medium">SERVICIOS DE TELECOMUNICACIONES SPA</td>
            <td className="p-2.5 text-right font-mono tabular-nums">$ 3.400.000</td>
            <td className="p-2.5 text-right font-mono tabular-nums">$ 646.000</td>
            <td className="p-2.5 text-right font-mono font-bold text-slate-900 tabular-nums">$ 4.046.000</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function BankMockup() {
  return (
    <div className="space-y-4 font-sans text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-900">Conciliación Bancaria Mensual:</span>
          <span className="text-slate-700 font-semibold">Banco Santander Cuenta Corriente</span>
        </div>
        <div className="text-slate-500 text-[11px]">
          Diferencia de Cuadratura: <strong className="text-emerald-700 font-mono">$ 0</strong>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
          <div className="text-[10px] text-slate-500 font-medium">Saldo Cartola Bancaria</div>
          <div className="text-base font-bold font-mono text-slate-900 mt-0.5 tabular-nums">$ 14.850.200</div>
        </div>
        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
          <div className="text-[10px] text-slate-500 font-medium">Saldo Libro Mayor Banco</div>
          <div className="text-base font-bold font-mono text-slate-900 mt-0.5 tabular-nums">$ 14.850.200</div>
        </div>
        <div className="bg-slate-100 p-3 rounded-lg border border-slate-300">
          <div className="text-[10px] text-slate-700 font-bold">Estado de Conciliación</div>
          <div className="text-base font-bold font-mono text-slate-950 mt-0.5">Conciliado al 100%</div>
        </div>
      </div>
    </div>
  );
}
