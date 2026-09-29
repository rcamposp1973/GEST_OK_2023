import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { 
  Save, AlertCircle, RefreshCw, CheckCircle2, Shield, Calendar, 
  DollarSign, TrendingUp, Layers, HelpCircle, FileText, Check
} from 'lucide-react';
import { PayrollParameters, PensionSystem } from '../types';
import { DEFAULT_AFP_COMMISSIONS, getPrevisionalParametersForPeriod } from '../utils/payrollCalculator';

export const AdminPrevisionalLoader: React.FC = () => {
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedMonth, setSelectedMonth] = useState<number>(5);
  const period = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
  
  const [loading, setLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Initial parameters based on defaults
  const [params, setParams] = useState<PayrollParameters>(() => getPrevisionalParametersForPeriod('2026-05'));

  // Load from Firestore or fallback to official defaults when period changes
  useEffect(() => {
    let isMounted = true;
    const loadIndicators = async () => {
      setLoading(true);
      setStatusMessage(null);
      try {
        const ref = doc(db, 'previsionalIndicators', period);
        const snap = await getDoc(ref);
        if (snap.exists() && isMounted) {
          const data = snap.data() as PayrollParameters;
          setParams(data);
          setStatusMessage('Indicadores cargados desde la base de datos central.');
        } else if (isMounted) {
          const def = getPrevisionalParametersForPeriod(period);
          setParams(def);
          setStatusMessage('Se cargaron los valores oficiales certificados por defecto para este período.');
        }
      } catch (err: any) {
        console.error('Error loading indicators:', err);
        if (isMounted) {
          const def = getPrevisionalParametersForPeriod(period);
          setParams(def);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadIndicators();
    return () => { isMounted = false; };
  }, [period]);

  const handleSetAfpCommission = (afp: PensionSystem, value: number) => {
    setParams(prev => ({
      ...prev,
      afpCommissions: {
        ...prev.afpCommissions,
        [afp]: value
      }
    }));
  };

  const handleLoadOfficialPreviredMayo2026 = () => {
    setParams({
      period,
      uf: 40610.69,
      utm: 70588,
      imm: 539000,
      topeImponibleAfpUf: 90.0,
      topeImponibleAfcUf: 135.2,
      tasaSisPercent: 1.62,
      tasaMutualPercent: 0.93,
      afpCommissions: {
        CAPITAL: 11.44,
        CUPRUM: 11.44,
        HABITAT: 11.27,
        MODELO: 10.58,
        PLANVITAL: 11.16,
        PROVIDA: 11.45,
        UNO: 10.46,
        INP: 18.84,
        JUBILADO_COTIZA: 1.44,
        JUBILADO_NO_COTIZA: 0.0
      },
      tramosAsignacionFamiliar: {
        tramoA: 22007,
        tramoB: 13505,
        tramoC: 4267,
        tramoD: 0,
        limiteA: 631976,
        limiteB: 923067,
        limiteC: 1439668
      }
    });
    setStatusMessage('Cargados los valores oficiales publicados en la circular de Previred Mayo 2026.');
  };

  const handleSave = async () => {
    setLoading(true);
    setSaveSuccess(false);
    try {
      await setDoc(doc(db, 'previsionalIndicators', period), {
        ...params,
        period,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // Save in localStorage as quick cache for current session
      try {
        localStorage.setItem(`gestok_previred_params_${period}`, JSON.stringify(params));
      } catch {}

      setSaveSuccess(true);
      setStatusMessage(`✅ Indicadores previsionales para ${period} guardados exitosamente.`);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (e: any) {
      console.error(e);
      alert('Error al guardar indicadores: ' + (e.message || 'Error de conexión'));
    } finally {
      setLoading(false);
    }
  };

  const afpList: { id: PensionSystem; name: string; cod: string }[] = [
    { id: 'CAPITAL', name: 'AFP Capital', cod: '34' },
    { id: 'CUPRUM', name: 'AFP Cuprum', cod: '03' },
    { id: 'HABITAT', name: 'AFP Habitat', cod: '05' },
    { id: 'MODELO', name: 'AFP Modelo', cod: '32' },
    { id: 'PLANVITAL', name: 'AFP PlanVital', cod: '08' },
    { id: 'PROVIDA', name: 'AFP ProVida', cod: '29' },
    { id: 'UNO', name: 'AFP Uno', cod: '33' }
  ];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 text-white space-y-6 shadow-2xl">
      {/* Encabezado */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
            <Shield className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div>
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              Gestor Maestro de Indicadores Previsionales (Previred)
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold">
                Oficial Chile
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Administración central de tablas de AFP, topes imponibles UF, SIS y asignación familiar para cálculos de remuneraciones.
            </p>
          </div>
        </div>

        {/* Selector de Período y Botón de Carga Rápida */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-1.5">
            <Calendar className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-bold text-slate-400">Período:</span>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(parseInt(e.target.value, 10))}
              className="bg-transparent text-white font-bold font-mono focus:outline-none cursor-pointer text-xs"
            >
              {[2027, 2026, 2025, 2024].map(y => (
                <option key={y} value={y} className="bg-slate-900 text-white">{y}</option>
              ))}
            </select>
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(parseInt(e.target.value, 10))}
              className="bg-transparent text-white font-bold font-mono focus:outline-none cursor-pointer text-xs"
            >
              {[
                { m: 1, label: 'Enero' },
                { m: 2, label: 'Febrero' },
                { m: 3, label: 'Marzo' },
                { m: 4, label: 'Abril' },
                { m: 5, label: 'Mayo' },
                { m: 6, label: 'Junio' },
                { m: 7, label: 'Julio' },
                { m: 8, label: 'Agosto' },
                { m: 9, label: 'Septiembre' },
                { m: 10, label: 'Octubre' },
                { m: 11, label: 'Noviembre' },
                { m: 12, label: 'Diciembre' }
              ].map(item => (
                <option key={item.m} value={item.m} className="bg-slate-900 text-white">{item.label}</option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleLoadOfficialPreviredMayo2026}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-indigo-300 hover:text-white rounded-xl text-xs font-bold border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
            title="Cargar valores oficiales según Circular Previred Mayo 2026"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Valores Previred Mayo 2026</span>
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className="bg-slate-800/80 border border-slate-700/80 text-indigo-300 text-xs px-4 py-2.5 rounded-xl flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Grid de Secciones */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna 1: Índices Monetarios & Topes Imponibles */}
        <div className="space-y-4">
          <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5 border-b border-slate-800 pb-2">
              <DollarSign className="w-3.5 h-3.5" />
              1. Índices & Sueldo Mínimo (IMM)
            </h3>

            <div className="space-y-2.5 text-xs">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Valor UF del Período ($):</label>
                <input
                  type="number"
                  step="0.01"
                  value={params.uf || 0}
                  onChange={e => setParams(prev => ({ ...prev, uf: parseFloat(e.target.value) || 0 }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Valor UTM del Período ($):</label>
                <input
                  type="number"
                  step="1"
                  value={params.utm || 0}
                  onChange={e => setParams(prev => ({ ...prev, utm: parseFloat(e.target.value) || 0 }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Ingreso Mínimo Mensual - IMM ($):</label>
                <input
                  type="number"
                  step="1000"
                  value={params.imm || 0}
                  onChange={e => setParams(prev => ({ ...prev, imm: parseFloat(e.target.value) || 0 }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-emerald-400 font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
                <span className="text-[10px] text-slate-500 mt-0.5 block">Ley vigente 2026: $539.000</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5 border-b border-slate-800 pb-2">
              <TrendingUp className="w-3.5 h-3.5" />
              2. Rentas Topes Imponibles (UF)
            </h3>

            <div className="space-y-2.5 text-xs">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Tope Imponible AFP / Salud (UF):</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.1"
                    value={params.topeImponibleAfpUf || 0}
                    onChange={e => setParams(prev => ({ ...prev, topeImponibleAfpUf: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  <span className="text-xs font-mono font-bold text-indigo-400 shrink-0">
                    ${Math.round((params.topeImponibleAfpUf || 0) * (params.uf || 0)).toLocaleString('es-CL')}
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 mt-0.5 block">Oficial Previred 2026: 90,0 UF</span>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Tope Seguro de Cesantía - AFC (UF):</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.1"
                    value={params.topeImponibleAfcUf || 0}
                    onChange={e => setParams(prev => ({ ...prev, topeImponibleAfcUf: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  <span className="text-xs font-mono font-bold text-indigo-400 shrink-0">
                    ${Math.round((params.topeImponibleAfcUf || 0) * (params.uf || 0)).toLocaleString('es-CL')}
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 mt-0.5 block">Oficial Previred 2026: 135,2 UF</span>
              </div>
            </div>
          </div>
        </div>

        {/* Columna 2: Tasas de AFP */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-3 flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5 border-b border-slate-800 pb-2 mb-3">
              <Shield className="w-3.5 h-3.5" />
              3. Tasas Cotización AFP (Fondo 10% + Comisión)
            </h3>

            <div className="space-y-2 text-xs">
              {afpList.map(afp => {
                const val = params.afpCommissions[afp.id] || 0;
                return (
                  <div key={afp.id} className="flex items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 px-3 py-2 rounded-xl">
                    <div>
                      <span className="font-bold text-white block">{afp.name}</span>
                      <span className="text-[10px] font-mono text-slate-500">Cód: {afp.cod} | Fondo: 10% + {(val - 10).toFixed(2)}%</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        step="0.01"
                        value={val}
                        onChange={e => handleSetAfpCommission(afp.id, parseFloat(e.target.value) || 0)}
                        className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-right text-emerald-400 font-mono font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-none text-xs"
                      />
                      <span className="text-xs font-bold text-slate-400">%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800/80 grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Tasa SIS Empleador (%):</label>
              <input
                type="number"
                step="0.01"
                value={params.tasaSisPercent || 0}
                onChange={e => setParams(prev => ({ ...prev, tasaSisPercent: parseFloat(e.target.value) || 0 }))}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-white font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">Oficial 2026: 1,62%</span>
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1">Tasa Mutual Básica (%):</label>
              <input
                type="number"
                step="0.01"
                value={params.tasaMutualPercent || 0}
                onChange={e => setParams(prev => ({ ...prev, tasaMutualPercent: parseFloat(e.target.value) || 0 }))}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-white font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">Básica + SANNA: 0,93%</span>
            </div>
          </div>
        </div>

        {/* Columna 3: Tramos de Asignación Familiar */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-3 flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5 border-b border-slate-800 pb-2 mb-3">
              <Layers className="w-3.5 h-3.5" />
              4. Asignación Familiar (Tramos & Límites)
            </h3>

            <div className="space-y-3 text-xs">
              {/* Tramo A */}
              <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-xl space-y-1.5">
                <span className="font-bold text-amber-300 block text-xs">Tramo 1 (A) - Monto y Límite Renta:</span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Monto por Carga ($):</span>
                    <input
                      type="number"
                      value={params.tramosAsignacionFamiliar?.tramoA || 0}
                      onChange={e => setParams(prev => ({
                        ...prev,
                        tramosAsignacionFamiliar: { ...prev.tramosAsignacionFamiliar, tramoA: parseInt(e.target.value, 10) || 0 }
                      }))}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-white font-mono font-bold text-xs"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Renta Máxima ($):</span>
                    <input
                      type="number"
                      value={params.tramosAsignacionFamiliar?.limiteA || 0}
                      onChange={e => setParams(prev => ({
                        ...prev,
                        tramosAsignacionFamiliar: { ...prev.tramosAsignacionFamiliar, limiteA: parseInt(e.target.value, 10) || 0 }
                      }))}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-white font-mono font-bold text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Tramo B */}
              <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-xl space-y-1.5">
                <span className="font-bold text-amber-300 block text-xs">Tramo 2 (B) - Monto y Límite Renta:</span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Monto por Carga ($):</span>
                    <input
                      type="number"
                      value={params.tramosAsignacionFamiliar?.tramoB || 0}
                      onChange={e => setParams(prev => ({
                        ...prev,
                        tramosAsignacionFamiliar: { ...prev.tramosAsignacionFamiliar, tramoB: parseInt(e.target.value, 10) || 0 }
                      }))}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-white font-mono font-bold text-xs"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Renta Máxima ($):</span>
                    <input
                      type="number"
                      value={params.tramosAsignacionFamiliar?.limiteB || 0}
                      onChange={e => setParams(prev => ({
                        ...prev,
                        tramosAsignacionFamiliar: { ...prev.tramosAsignacionFamiliar, limiteB: parseInt(e.target.value, 10) || 0 }
                      }))}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-white font-mono font-bold text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Tramo C */}
              <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-xl space-y-1.5">
                <span className="font-bold text-amber-300 block text-xs">Tramo 3 (C) - Monto y Límite Renta:</span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Monto por Carga ($):</span>
                    <input
                      type="number"
                      value={params.tramosAsignacionFamiliar?.tramoC || 0}
                      onChange={e => setParams(prev => ({
                        ...prev,
                        tramosAsignacionFamiliar: { ...prev.tramosAsignacionFamiliar, tramoC: parseInt(e.target.value, 10) || 0 }
                      }))}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-white font-mono font-bold text-xs"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Renta Máxima ($):</span>
                    <input
                      type="number"
                      value={params.tramosAsignacionFamiliar?.limiteC || 0}
                      onChange={e => setParams(prev => ({
                        ...prev,
                        tramosAsignacionFamiliar: { ...prev.tramosAsignacionFamiliar, limiteC: parseInt(e.target.value, 10) || 0 }
                      }))}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-white font-mono font-bold text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Botón Guardar */}
          <div className="pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={handleSave}
              disabled={loading}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/40 cursor-pointer disabled:opacity-50"
            >
              {saveSuccess ? (
                <>
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>¡Guardado con Éxito!</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>{loading ? 'Guardando en Base de Datos...' : `Guardar Indicadores para ${period}`}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
export default AdminPrevisionalLoader;
