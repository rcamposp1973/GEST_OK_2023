import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc 
} from 'firebase/firestore';
import { LandingPricingPlan, SystemAppFormat } from '../types';
import { SYSTEM_FORMATS } from '../constants/systemFormats';
import { 
  CreditCard, 
  Plus, 
  Edit3, 
  Trash2, 
  Eye, 
  EyeOff, 
  Check, 
  X, 
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Star,
  Layers
} from 'lucide-react';
import { logAuditEvent } from '../utils/auditLogger';
import { useAuth } from '../context/AuthContext';

export const DEFAULT_INITIAL_PRICING_PLANS: Omit<LandingPricingPlan, 'id'>[] = [
  // FORMATO A: ESTUDIO CLÁSICO
  {
    name: 'Plan de Entrada (Clásico)',
    appFormat: 'VERSION_A',
    priceUF: 0.5,
    priceText: 'UF 0,5 + IVA',
    priceCLP: 19900,
    period: '/ mes + IVA',
    popular: false,
    badge: 'Versión A / 1 Empresa',
    subtitle: 'Plan individual para una empresa, solo contabilidad tradicional.',
    description: 'Para contadores con empresas individuales o pymes que requieren contabilidad tributaria esencial y RCV.',
    maxCompanies: 1,
    maxUsers: 1,
    features: [
      '1 Empresa / RUT Comercial',
      'Sincronización RCV Automática con SII',
      'Formulario 29 con Códigos SII oficiales',
      'Importación masiva de cartolas bancarias',
      'Libros Diario, Mayor y Auxiliares de Cuentas Corrientes'
    ],
    status: 'active',
    order: 1
  },
  {
    name: 'Plan Estudio 10 (Clásico)',
    appFormat: 'VERSION_A',
    priceUF: 1.2,
    priceText: 'UF 1,2 + IVA',
    priceCLP: 47900,
    period: '/ mes + IVA',
    popular: false,
    badge: 'Versión A / 10 Empresas',
    subtitle: 'Plan para 2 usuarios y 10 empresas.',
    description: 'Para contadores independientes y firmas contables con cartera de clientes en crecimiento.',
    maxCompanies: 10,
    maxUsers: 2,
    features: [
      '10 Empresas / Clientes',
      '1 Usuario Administrador - 1 Usuario Analista',
      'Balance 8 Columnas e IFRS',
      'Conciliación Bancaria Inteligente',
      'Libros Diario, Mayor y Auxiliares analíticos con exportación Excel',
      'Indicadores Financieros (KPIs)',
      'Asistencia en la Implementación y puesta en marcha de 5 empresas'
    ],
    status: 'active',
    order: 2
  },
  {
    name: 'Plan Estudio Full (Clásico)',
    appFormat: 'VERSION_A',
    priceUF: 2.4,
    priceText: 'UF 2,4 + IVA',
    priceCLP: 94900,
    period: '/ mes + IVA',
    popular: false,
    badge: 'Versión A / 100 Empresas',
    subtitle: 'Plan tradicional para 4 usuarios y 100 empresas.',
    description: 'Para firmas contables medianas y consolidadas con alta volumetría contable.',
    maxCompanies: 100,
    maxUsers: 4,
    features: [
      '100 Empresas / Clientes',
      '1 Usuario Administrador - 3 Usuarios Analistas',
      'Balance 8 Columnas e IFRS con Dictamen',
      'Conciliación Bancaria Inteligente',
      'Libros Diario, Mayor y Auxiliares analíticos',
      'Indicadores Financieros (KPIs)',
      'Visor para Clientes (Portal de Consulta)'
    ],
    status: 'active',
    order: 3
  },
  // FORMATO B: PYME CLÁSICA
  {
    name: 'Plan Pyme Comercial (Clásico)',
    appFormat: 'VERSION_B',
    priceUF: 4.0,
    priceText: 'Desde UF 4,0 + IVA',
    priceCLP: 159900,
    period: '/ mes + IVA',
    popular: false,
    badge: 'Versión B / Pyme Clásica',
    subtitle: 'Facturación DTE, Inventario y Gestión Comercial Tradicional.',
    description: 'Para empresas y pymes comerciales que requieren facturación electrónica, tesorería y control de inventarios.',
    maxCompanies: 50,
    maxUsers: 10,
    features: [
      'Facturación Electrónica DTE y Boletas',
      'Catálogo de Productos y Kardex PMP',
      'Tesorería, Pagos y Cuentas Corrientes',
      'Sincronización RCV SII',
      'Integración Contable Automática'
    ],
    status: 'active',
    order: 4
  },
  // FORMATO C1: ESTUDIO AGÉNTICO 2040
  {
    name: 'Plan de Entrada Agéntico',
    appFormat: 'VERSION_C1',
    priceUF: 0.7,
    priceText: 'UF 0,7 + IVA',
    priceCLP: 27900,
    period: '/ mes + IVA',
    popular: false,
    badge: 'Agéntico 2040 ⚡ / 1 Empresa',
    subtitle: '1 empresa con Agente Auditor Autónomo 2040.',
    description: 'Para contadores individuales que auditan libros y cuadran balances de forma autónoma con IA.',
    maxCompanies: 1,
    maxUsers: 1,
    features: [
      '1 Empresa / RUT Comercial',
      '🤖 Agente Auditor Autónomo 2040 en tiempo real',
      '⚡ Copiloto Tributario F29 con alertas preventivas SII',
      'Balance 8 Columnas y Libros Oficiales',
      'Sincronización RCV instantánea'
    ],
    status: 'active',
    order: 5
  },
  {
    name: 'Plan Estudio 10 Agéntico',
    appFormat: 'VERSION_C1',
    priceUF: 1.6,
    priceText: 'UF 1,6 + IVA',
    priceCLP: 63900,
    period: '/ mes + IVA',
    popular: false,
    badge: 'Agéntico 2040 ⚡ / 10 Empresas',
    subtitle: 'Plan para 2 usuarios y 10 empresas con Agentes Autónomos.',
    description: 'Estudios contables que operan con auditoría agéntica continua y conciliación bancaria inteligente.',
    maxCompanies: 10,
    maxUsers: 2,
    features: [
      '10 Empresas / Clientes',
      '1 Usuario Administrador - 1 Usuario Analista',
      '🤖 Agente Auditor Autónomo 2040 continuo',
      '⚡ Copiloto Tributario F29 y Cruce RCV',
      'Conciliación Bancaria Agéntica Inteligente',
      'Balance 8 Columnas e IFRS Auditado'
    ],
    status: 'active',
    order: 6
  },
  {
    name: 'Plan Estudio Full Agéntico',
    appFormat: 'VERSION_C1',
    priceUF: 3.2,
    priceText: 'UF 3,2 + IVA',
    priceCLP: 127900,
    period: '/ mes + IVA',
    popular: true,
    badge: 'Agéntico 2040 ⚡ / 100 Empresas',
    subtitle: 'El estándar del 2040 para 4 usuarios y 100 empresas.',
    description: 'Para firmas contables de alto volumen que automatizan auditorías, dictámenes IFRS y reportes para clientes.',
    maxCompanies: 100,
    maxUsers: 4,
    features: [
      '100 Empresas / Clientes',
      '1 Usuario Administrador - 3 Usuarios Analistas',
      '🤖 Centro de Mando Agéntico 2040 Completo',
      '⚡ Copiloto SII 24/7 y Auditor Preventivo F29',
      'Conciliación Bancaria Automática con IA',
      'Balance 8 Columnas e IFRS con Dictamen',
      'Visor para Clientes con Asistente Virtual'
    ],
    status: 'active',
    order: 7
  },
  // FORMATO C2: PYME AGÉNTICA 2040
  {
    name: 'Plan Pyme Agéntico',
    appFormat: 'VERSION_C2',
    priceUF: 5.3,
    priceText: 'Desde UF 5,3 + IVA',
    priceCLP: 211900,
    period: '/ mes + IVA',
    popular: false,
    badge: 'Pyme Agéntica 2040 ⚡',
    subtitle: 'CFO Virtual Autónomo, Cobranza WhatsApp y Cazador de Fugas.',
    description: 'Para empresas y pymes que automatizan cobranzas, detectan fugas de dinero y proyectan flujo de caja.',
    maxCompanies: 50,
    maxUsers: 10,
    features: [
      '🤖 Agente de Cobranza Inteligente WhatsApp',
      '🛡️ Cazador de Fugas de Dinero y Gastos Fantasma',
      '💬 Asistente Financiero Ejecutivo CFO 2040 en vivo',
      '📈 Proyección de Flujo de Caja Predictivo a 30/60/90 días',
      'Facturación DTE, Inventario Kardex y Tesorería',
      'Soporte prioritario y puesta en marcha personalizada'
    ],
    status: 'active',
    order: 8
  }
];

export default function PricingManager() {
  const { currentUser } = useAuth();
  const [plans, setPlans] = useState<LandingPricingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedFormatFilter, setSelectedFormatFilter] = useState<'ALL' | SystemAppFormat>('ALL');

  // Form states
  const [name, setName] = useState('');
  const [appFormat, setAppFormat] = useState<SystemAppFormat>('VERSION_A');
  const [priceUF, setPriceUF] = useState<number | ''>(1.2);
  const [priceText, setPriceText] = useState('UF 1,2 + IVA');
  const [priceCLP, setPriceCLP] = useState<number>(47900);
  const [period, setPeriod] = useState('/ mes + IVA');
  const [popular, setPopular] = useState(false);
  const [badge, setBadge] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [description, setDescription] = useState('');
  const [featuresText, setFeaturesText] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [order, setOrder] = useState<number>(1);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const q = collection(db, 'landing_pricing');
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const rawItems = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data()
        })) as LandingPricingPlan[];

        const uniqueMap = new Map<string, LandingPricingPlan>();
        for (const plan of rawItems) {
          if (plan.name) {
            const key = plan.name.trim().toUpperCase();
            if (!uniqueMap.has(key)) {
              uniqueMap.set(key, plan);
            }
          }
        }

        const items = Array.from(uniqueMap.values());
        items.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
        setPlans(items);
        setLoading(false);
      },
      (err) => {
        console.warn('Error reading landing_pricing:', err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleResetForm = () => {
    setName('');
    setAppFormat('VERSION_A');
    setPriceUF(1.2);
    setPriceText('UF 1,2 + IVA');
    setPriceCLP(47900);
    setPeriod('/ mes + IVA');
    setPopular(false);
    setBadge('');
    setSubtitle('');
    setDescription('');
    setFeaturesText('');
    setStatus('active');
    setOrder(plans.length + 1);
    setEditingId(null);
    setIsFormOpen(false);
  };

  const handleOpenEdit = (p: LandingPricingPlan) => {
    setEditingId(p.id);
    setName(p.name || '');
    setAppFormat(p.appFormat || 'VERSION_A');
    setPriceUF(p.priceUF !== undefined && p.priceUF !== null ? p.priceUF : '');
    setPriceText(p.priceText || (p.priceUF ? `UF ${p.priceUF} + IVA` : ''));
    setPriceCLP(p.priceCLP ?? 0);
    setPeriod(p.period || '/ mes + IVA');
    setPopular(!!p.popular);
    setBadge(p.badge || '');
    setSubtitle(p.subtitle || '');
    setDescription(p.description || '');
    setFeaturesText((p.features || []).join('\n'));
    setStatus(p.status === 'inactive' ? 'inactive' : 'active');
    setOrder(p.order ?? 1);
    setIsFormOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setNotice({ type: 'error', text: 'El nombre del plan es requerido.' });
      return;
    }

    setIsSaving(true);
    setNotice(null);

    const featuresArray = featuresText
      .split('\n')
      .map(f => f.trim())
      .filter(f => f.length > 0);

    try {
      const payload = {
        name: name.trim(),
        appFormat: appFormat || 'VERSION_A',
        priceUF: priceUF === '' ? null : Number(priceUF),
        priceText: priceText.trim() || (priceUF !== '' ? `UF ${priceUF} + IVA` : 'A Convenir'),
        priceCLP: Number(priceCLP) || 0,
        period: period.trim(),
        popular: Boolean(popular),
        badge: badge.trim(),
        subtitle: subtitle.trim(),
        description: description.trim(),
        features: featuresArray,
        status,
        order: Number(order) || 1,
        updatedAt: new Date().toISOString()
      };

      if (editingId) {
        await updateDoc(doc(db, 'landing_pricing', editingId), payload);
        logAuditEvent({
          userId: currentUser?.uid || 'super_admin',
          userEmail: currentUser?.email || 'super_admin@pulsocontable.cl',
          action: 'UPDATE',
          module: 'MARKETING_LANDING',
          details: `Plan de precio modificado: ${name}`
        });
        setNotice({ type: 'success', text: 'Plan de precios actualizado con éxito.' });
      } else {
        await addDoc(collection(db, 'landing_pricing'), {
          ...payload,
          createdAt: new Date().toISOString()
        });
        logAuditEvent({
          userId: currentUser?.uid || 'super_admin',
          userEmail: currentUser?.email || 'super_admin@pulsocontable.cl',
          action: 'CREATE',
          module: 'MARKETING_LANDING',
          details: `Nuevo plan de precio agregado: ${name}`
        });
        setNotice({ type: 'success', text: 'Nuevo plan de precios publicado.' });
      }

      handleResetForm();
    } catch (err: any) {
      console.error('Error saving pricing plan:', err);
      setNotice({ type: 'error', text: 'Error al guardar: ' + err.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async (p: LandingPricingPlan) => {
    const nextStatus = p.status === 'active' ? 'inactive' : 'active';
    try {
      await updateDoc(doc(db, 'landing_pricing', p.id), {
        status: nextStatus,
        updatedAt: new Date().toISOString()
      });
    } catch (err: any) {
      console.error('Error toggling plan:', err);
    }
  };

  const handleDelete = async (id: string, planName: string) => {
    if (!window.confirm(`¿Estás seguro de eliminar el plan "${planName}"?`)) return;
    try {
      await deleteDoc(doc(db, 'landing_pricing', id));
      setNotice({ type: 'success', text: 'Plan eliminado.' });
    } catch (err: any) {
      console.error('Error deleting plan:', err);
      setNotice({ type: 'error', text: 'Error al eliminar: ' + err.message });
    }
  };

  const handleSeedDefaults = async () => {
    if (!window.confirm('¿Sincronizar y cargar los 8 Planes Oficiales (UF 0.5, UF 1.2, UF 2.4, UF 4.0, UF 0.7, UF 1.6, UF 3.2 y UF 5.3) en la base de datos?')) return;
    setIsSaving(true);
    try {
      // 1. Eliminar planes antiguos para no duplicar
      for (const p of plans) {
        if (p.id) {
          try {
            await deleteDoc(doc(db, 'landing_pricing', p.id));
          } catch (delErr) {
            console.warn('Error borrando plan anterior:', delErr);
          }
        }
      }

      // 2. Insertar los 8 planes oficiales
      for (const item of DEFAULT_INITIAL_PRICING_PLANS) {
        await addDoc(collection(db, 'landing_pricing'), {
          ...item,
          createdAt: new Date().toISOString()
        });
      }
      setNotice({ type: 'success', text: '¡Se cargaron los 8 planes oficiales (Formatos A, B, C1 y C2) con éxito!' });
    } catch (err: any) {
      console.error('Error seeding pricing plans:', err);
      setNotice({ type: 'error', text: 'Error al cargar planes: ' + err.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddMissingAgenticPlans = async () => {
    setIsSaving(true);
    try {
      const agenticDefaults = DEFAULT_INITIAL_PRICING_PLANS.filter(p => p.appFormat === 'VERSION_C1' || p.appFormat === 'VERSION_C2');
      let added = 0;
      for (const item of agenticDefaults) {
        const exists = plans.some(p => p.name.trim().toUpperCase() === item.name.trim().toUpperCase());
        if (!exists) {
          await addDoc(collection(db, 'landing_pricing'), {
            ...item,
            createdAt: new Date().toISOString()
          });
          added++;
        }
      }
      setNotice({ type: 'success', text: `Se agregaron ${added} planes agénticos faltantes con éxito.` });
    } catch (err: any) {
      setNotice({ type: 'error', text: 'Error al agregar planes agénticos: ' + err.message });
    } finally {
      setIsSaving(false);
    }
  };

  const filteredPlans = plans.filter(p => {
    if (selectedFormatFilter === 'ALL') return true;
    return (p.appFormat || 'VERSION_A') === selectedFormatFilter;
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header Panel */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-[#533AFD] text-xs font-bold border border-indigo-100 mb-2">
            <CreditCard className="w-3.5 h-3.5" />
            <span>Facultad del Super Administrador</span>
          </div>
          <h2 className="text-xl font-extrabold text-[#0D253D] tracking-tight">
            Gestión de Precios y Planes (Página de Bienvenida)
          </h2>
          <p className="text-xs text-[#64748D] mt-1 max-w-2xl">
            Controla los valores en UF y CLP, características, períodos y planes destacados para los 4 formatos del sistema (Versión A, B, C1 y C2).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSeedDefaults}
            disabled={isSaving}
            className="px-3.5 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Carga o restablece los 8 planes oficiales con los nuevos valores exactos de UF"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>⚡ Sincronizar 8 Planes Oficiales</span>
          </button>

          {plans.some(p => p.appFormat === 'VERSION_C1' || p.appFormat === 'VERSION_C2') === false && (
            <button
              type="button"
              onClick={handleAddMissingAgenticPlans}
              disabled={isSaving}
              className="px-3 py-2 bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Agregar 4 Planes Agénticos</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              if (isFormOpen && !editingId) {
                setIsFormOpen(false);
              } else {
                handleResetForm();
                setIsFormOpen(true);
              }
            }}
            className="px-4 py-2.5 bg-[#533AFD] hover:bg-[#4326EB] text-white text-xs font-bold rounded-xl shadow-md shadow-indigo-500/20 transition flex items-center gap-2 cursor-pointer"
          >
            {isFormOpen && !editingId ? (
              <>
                <X className="w-4 h-4" />
                <span>Cerrar Formulario</span>
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                <span>Nuevo Plan</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Filter Tabs by Format */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedFormatFilter('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              selectedFormatFilter === 'ALL'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Todos los Planes ({plans.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedFormatFilter('VERSION_A')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              selectedFormatFilter === 'VERSION_A'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-indigo-700 bg-indigo-50/70 hover:bg-indigo-100 border border-indigo-200/50'
            }`}
          >
            <span>Versión A: Estudio Clásico</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20">
              {plans.filter(p => (p.appFormat || 'VERSION_A') === 'VERSION_A').length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedFormatFilter('VERSION_B')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              selectedFormatFilter === 'VERSION_B'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-emerald-700 bg-emerald-50/70 hover:bg-emerald-100 border border-emerald-200/50'
            }`}
          >
            <span>Versión B: Pyme Clásica</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20">
              {plans.filter(p => p.appFormat === 'VERSION_B').length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedFormatFilter('VERSION_C1')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              selectedFormatFilter === 'VERSION_C1'
                ? 'bg-violet-600 text-white shadow-xs'
                : 'text-violet-700 bg-violet-50/70 hover:bg-violet-100 border border-violet-200/50'
            }`}
          >
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>Versión C1: Estudio Agéntico 2040</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20">
              {plans.filter(p => p.appFormat === 'VERSION_C1').length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedFormatFilter('VERSION_C2')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              selectedFormatFilter === 'VERSION_C2'
                ? 'bg-cyan-700 text-white shadow-xs'
                : 'text-cyan-800 bg-cyan-50/70 hover:bg-cyan-100 border border-cyan-200/50'
            }`}
          >
            <Sparkles className="w-3 h-3 text-cyan-400" />
            <span>Versión C2: Pyme Agéntica 2040</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20">
              {plans.filter(p => p.appFormat === 'VERSION_C2').length}
            </span>
          </button>
        </div>

        <span className="text-[11px] text-slate-400 px-2 font-medium">
          Mostrando {filteredPlans.length} {filteredPlans.length === 1 ? 'plan' : 'planes'}
        </span>
      </div>

      {/* Notice */}
      {notice && (
        <div className={`p-4 rounded-xl border flex items-center justify-between gap-3 text-xs font-medium ${
          notice.type === 'success' 
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
            : 'bg-rose-50 text-rose-800 border-rose-200'
        }`}>
          <div className="flex items-center gap-2">
            {notice.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}
            <span>{notice.text}</span>
          </div>
          <button onClick={() => setNotice(null)} className="text-slate-400 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Form Card */}
      {isFormOpen && (
        <form onSubmit={handleSave} className="bg-white p-6 sm:p-8 rounded-3xl border-2 border-indigo-100 shadow-lg space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-[#0D253D]">
                {editingId ? 'Editar Plan de Precios' : 'Crear Nuevo Plan de Precios'}
              </h3>
              <p className="text-xs text-slate-500">Configura los valores, formato del sistema, características e insignia destacada.</p>
            </div>
            <button
              type="button"
              onClick={handleResetForm}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div>
              <label className="block text-xs font-bold text-[#0D253D] mb-1.5">
                Nombre del Plan *
              </label>
              <input
                type="text"
                required
                placeholder="Ej. Plan Estudio 10 Agéntico"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-[#0D253D] focus:outline-none focus:border-[#533AFD] focus:bg-white font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0D253D] mb-1.5">
                Formato / Segmento *
              </label>
              <select
                value={appFormat}
                onChange={(e) => setAppFormat(e.target.value as SystemAppFormat)}
                className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-[#0D253D] focus:outline-none focus:border-[#533AFD] focus:bg-white font-bold"
              >
                <option value="VERSION_A">Versión A: Estudio Clásico</option>
                <option value="VERSION_B">Versión B: Pyme Clásica</option>
                <option value="VERSION_C1">Versión C1: Estudio Agéntico 2040 ⚡</option>
                <option value="VERSION_C2">Versión C2: Pyme Agéntica 2040 ⚡</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0D253D] mb-1.5">
                Precio en UF (Ej. 0.5, 0.7, 1.2, 1.6, 3.2, 5.3)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                placeholder="Ej. 1.6"
                value={priceUF}
                onChange={(e) => {
                  const val = e.target.value === '' ? '' : Number(e.target.value);
                  setPriceUF(val);
                  if (val !== '') {
                    setPriceText(`UF ${String(val).replace('.', ',')} + IVA`);
                  }
                }}
                className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-[#0D253D] focus:outline-none focus:border-[#533AFD] focus:bg-white font-mono font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0D253D] mb-1.5">
                Texto del Precio (Portada) *
              </label>
              <input
                type="text"
                required
                placeholder="Ej. UF 1,6 + IVA"
                value={priceText}
                onChange={(e) => setPriceText(e.target.value)}
                className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-[#0D253D] focus:outline-none focus:border-[#533AFD] focus:bg-white font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0D253D] mb-1.5">
                Precio Ref. Mensual CLP
              </label>
              <input
                type="number"
                min={0}
                step={100}
                value={priceCLP}
                onChange={(e) => setPriceCLP(Number(e.target.value))}
                className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-[#0D253D] focus:outline-none focus:border-[#533AFD] focus:bg-white font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0D253D] mb-1.5">
                Insignia / Badge
              </label>
              <input
                type="text"
                placeholder="Ej. Agéntico 2040 ⚡ / 10 Empresas"
                value={badge}
                onChange={(e) => setBadge(e.target.value)}
                className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-[#0D253D] focus:outline-none focus:border-[#533AFD] focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0D253D] mb-1.5">
                Período / Sufijo
              </label>
              <input
                type="text"
                placeholder="/ mes + IVA"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-[#0D253D] focus:outline-none focus:border-[#533AFD] focus:bg-white"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-xs font-bold text-[#0D253D] mb-1.5">
                Subtítulo / Resumen
              </label>
              <input
                type="text"
                placeholder="Ej. Plan para 2 usuarios y 10 empresas con Agentes Autónomos."
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-[#0D253D] focus:outline-none focus:border-[#533AFD] focus:bg-white"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-xs font-bold text-[#0D253D] mb-1.5">
                Descripción del Plan
              </label>
              <input
                type="text"
                placeholder="Ej. Estudios contables que operan con auditoría agéntica continua y conciliación bancaria inteligente."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-[#0D253D] focus:outline-none focus:border-[#533AFD] focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0D253D] mb-1.5">
                Orden de Visualización
              </label>
              <input
                type="number"
                min={1}
                max={99}
                value={order}
                onChange={(e) => setOrder(Number(e.target.value))}
                className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-[#0D253D] focus:outline-none focus:border-[#533AFD] focus:bg-white font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0D253D] mb-1.5">
                ¿Plan Destacado? (Insignia "Más Popular")
              </label>
              <label className="flex items-center gap-2 cursor-pointer mt-2">
                <input
                  type="checkbox"
                  checked={popular}
                  onChange={(e) => setPopular(e.target.checked)}
                  className="w-4 h-4 text-[#533AFD] rounded border-slate-300 focus:ring-indigo-500"
                />
                <span className="text-xs font-bold text-[#0D253D]">Destacar en Portada</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#0D253D] mb-1.5">
              Características Incluidas (Una por cada línea) *
            </label>
            <textarea
              required
              rows={5}
              placeholder={'10 Empresas / Clientes\n🤖 Agente Auditor Autónomo 2040 continuo\n⚡ Copiloto Tributario F29 y Cruce RCV\nConciliación Bancaria Agéntica Inteligente\nBalance 8 Columnas e IFRS Auditado'}
              value={featuresText}
              onChange={(e) => setFeaturesText(e.target.value)}
              className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl p-3.5 text-xs text-[#0D253D] focus:outline-none focus:border-[#533AFD] focus:bg-white font-mono leading-relaxed"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Cada línea de texto se mostrará con un ícono de verificación en la tarjeta del plan.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-[#0D253D]">Estado del Plan:</span>
              <button
                type="button"
                onClick={() => setStatus(status === 'active' ? 'inactive' : 'active')}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  status === 'active' 
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                    : 'bg-slate-100 text-slate-600 border border-slate-300'
                }`}
              >
                {status === 'active' ? (
                  <>
                    <Eye className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Activo (Visible en Portada)</span>
                  </>
                ) : (
                  <>
                    <EyeOff className="w-3.5 h-3.5 text-slate-500" />
                    <span>Inactivo (Oculto)</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleResetForm}
                className="flex-1 sm:flex-none px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex-1 sm:flex-none px-6 py-2.5 bg-[#533AFD] hover:bg-[#4326EB] text-white text-xs font-bold rounded-xl shadow-md shadow-indigo-500/20 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>{editingId ? 'Actualizar Plan' : 'Publicar Plan en Portada'}</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Grid of Plans */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-sm text-[#0D253D]">
              Planes Configurados ({filteredPlans.length} de {plans.length})
            </h3>
            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-mono">
              Control en tiempo real
            </span>
          </div>

          <p className="text-xs text-slate-400">
            {plans.filter(p => p.status === 'active').length} activos en la portada
          </p>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Cargando planes...</div>
        ) : filteredPlans.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 space-y-3">
            <CreditCard className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-xs font-medium text-slate-600">
              No hay planes registrados para el filtro seleccionado.
            </p>
            <button
              type="button"
              onClick={handleSeedDefaults}
              className="px-4 py-2 bg-indigo-50 text-[#533AFD] hover:bg-indigo-100 text-xs font-bold rounded-full transition cursor-pointer"
            >
              Cargar los 8 Planes Oficiales (Formatos A, B, C1 y C2)
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {filteredPlans.map((p) => {
              const isActive = p.status === 'active';
              const fmt = p.appFormat || 'VERSION_A';
              const isAgentic = fmt === 'VERSION_C1' || fmt === 'VERSION_C2';
              return (
                <div
                  key={p.id}
                  className={`rounded-2xl p-5 border transition-all flex flex-col justify-between relative ${
                    p.popular
                      ? 'border-2 border-[#533AFD] bg-white shadow-lg ring-2 ring-indigo-500/20'
                      : isAgentic
                      ? 'border-violet-200 bg-gradient-to-b from-violet-50/50 to-white shadow-2xs'
                      : isActive
                      ? 'border-slate-200 bg-white shadow-2xs'
                      : 'border-slate-200 bg-slate-50/70 opacity-60'
                  }`}
                >
                  {p.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#533AFD] text-white text-[9px] font-extrabold tracking-wider uppercase px-2.5 py-0.5 rounded-full shadow-md">
                      Plan Más Popular
                    </div>
                  )}

                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-1.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md font-mono ${
                        fmt === 'VERSION_C1' ? 'bg-violet-100 text-violet-800 border border-violet-200' :
                        fmt === 'VERSION_C2' ? 'bg-cyan-100 text-cyan-800 border border-cyan-200' :
                        fmt === 'VERSION_B' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                        'bg-indigo-100 text-indigo-800 border border-indigo-200'
                      }`}>
                        {fmt === 'VERSION_C1' ? 'C1 Agéntico ⚡' :
                         fmt === 'VERSION_C2' ? 'C2 Agéntico ⚡' :
                         fmt === 'VERSION_B' ? 'Versión B Pyme' : 'Versión A Estudio'}
                      </span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full uppercase shrink-0 ${
                        isActive
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-200 text-slate-600'
                      }`}>
                        {isActive ? 'Activo' : 'Oculto'}
                      </span>
                    </div>

                    <div>
                      <h4 className="font-black text-sm text-[#0D253D]">{p.name}</h4>
                      <p className="text-[11px] text-[#64748D] mt-0.5 line-clamp-2">{p.description || p.subtitle}</p>
                    </div>

                    <div className="my-1.5 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                      <div className="flex items-baseline gap-1 flex-wrap">
                        <span className="text-xl font-black font-mono text-indigo-700">
                          {p.priceText || (p.priceUF ? `UF ${String(p.priceUF).replace('.', ',')} + IVA` : (p.priceCLP > 0 ? `$${p.priceCLP.toLocaleString('es-CL')}` : 'A Convenir'))}
                        </span>
                        <span className="text-[10px] text-[#64748D] font-medium"> {p.period}</span>
                      </div>
                      {p.priceCLP > 0 && (
                        <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                          Ref. CLP: ${p.priceCLP.toLocaleString('es-CL')} / mes
                        </p>
                      )}
                    </div>

                    <ul className="space-y-1 text-[11px] text-[#425466] pt-1">
                      {(p.features || []).slice(0, 5).map((feat, fIdx) => (
                        <li key={fIdx} className="flex items-start gap-1.5">
                          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                          <span className="leading-tight line-clamp-1">{feat}</span>
                        </li>
                      ))}
                      {(p.features || []).length > 5 && (
                        <li className="text-[10px] text-indigo-600 font-semibold pl-5">
                          + {p.features.length - 5} características adicionales
                        </li>
                      )}
                    </ul>
                  </div>

                  <div className="flex items-center justify-between pt-3 mt-4 border-t border-slate-200/80">
                    <button
                      type="button"
                      onClick={() => handleToggleStatus(p)}
                      className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer"
                    >
                      {isActive ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      <span>{isActive ? 'Ocultar' : 'Activar'}</span>
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(p)}
                        className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition cursor-pointer"
                        title="Editar"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(p.id, p.name)}
                        className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                        title="Eliminar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
