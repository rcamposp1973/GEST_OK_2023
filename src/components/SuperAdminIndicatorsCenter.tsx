import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { doc, setDoc, getDoc, collection, getDocs, writeBatch } from 'firebase/firestore';
import { 
  Shield, TrendingUp, DollarSign, Calendar, Save, RefreshCw, 
  CheckCircle2, Layers, AlertCircle, HelpCircle, Check, Globe, Table, ArrowUpDown
} from 'lucide-react';
import { PayrollParameters, PensionSystem, ExchangeRate } from '../types';
import { DEFAULT_AFP_COMMISSIONS, getPrevisionalParametersForPeriod } from '../utils/payrollCalculator';
import { generateOfficialChileanIndicators, syncOnlineChileanIndicators } from '../utils/chileanEconomicIndicators';

interface SuperAdminIndicatorsCenterProps {
  studies?: any[];
}

export const SuperAdminIndicatorsCenter: React.FC<SuperAdminIndicatorsCenterProps> = ({ studies = [] }) => {
  const [activeSubTab, setActiveSubTab] = useState<'previred' | 'currencies'>('previred');

  // ==========================================
  // ESTADO INDICADORES PREVISIONALES PREVIRED
  // ==========================================
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedMonth, setSelectedMonth] = useState<number>(5);
  const period = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
  
  const [loadingPrevired, setLoadingPrevired] = useState(false);
  const [previredStatusMsg, setPreviredStatusMsg] = useState<string | null>(null);
  const [previredSaveSuccess, setPreviredSaveSuccess] = useState(false);

  const [payrollParams, setPayrollParams] = useState<PayrollParameters>(() => getPrevisionalParametersForPeriod('2026-05'));

  // Cargar indicadores previsionales desde Firestore al cambiar de período
  useEffect(() => {
    let isMounted = true;
    const loadPrevired = async () => {
      setLoadingPrevired(true);
      setPreviredStatusMsg(null);
      try {
        const ref = doc(db, 'previsionalIndicators', period);
        const snap = await getDoc(ref);
        if (snap.exists() && isMounted) {
          setPayrollParams(snap.data() as PayrollParameters);
          setPreviredStatusMsg(`Indicadores para ${period} cargados desde base de datos central.`);
        } else if (isMounted) {
          const def = getPrevisionalParametersForPeriod(period);
          setPayrollParams(def);
          setPreviredStatusMsg(`Mostrando valores certificados por defecto para ${period}. Puede modificarlos y guardarlos.`);
        }
      } catch (err: any) {
        console.error('Error cargando indicadores previsionales:', err);
        if (isMounted) setPayrollParams(getPrevisionalParametersForPeriod(period));
      } finally {
        if (isMounted) setLoadingPrevired(false);
      }
    };

    loadPrevired();
    return () => { isMounted = false; };
  }, [period]);

  const handleSetAfp = (afp: PensionSystem, value: number) => {
    setPayrollParams(prev => ({
      ...prev,
      afpCommissions: {
        ...prev.afpCommissions,
        [afp]: value
      }
    }));
  };

  const handleLoadOfficialPreviredMayo2026 = () => {
    setPayrollParams({
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
    setPreviredStatusMsg('Cargados los valores oficiales certificados de la Circular Previred Mayo 2026.');
  };

  const handleSavePrevired = async () => {
    setLoadingPrevired(true);
    setPreviredSaveSuccess(false);
    try {
      await setDoc(doc(db, 'previsionalIndicators', period), {
        ...payrollParams,
        period,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      try {
        localStorage.setItem(`gestok_previred_params_${period}`, JSON.stringify(payrollParams));
      } catch {}

      setPreviredSaveSuccess(true);
      setPreviredStatusMsg(`✅ Indicadores previsionales guardados en base de datos central para ${period}.`);
      setTimeout(() => setPreviredSaveSuccess(false), 4000);
    } catch (e: any) {
      console.error(e);
      alert('Error al guardar indicadores previsionales: ' + (e.message || 'Error de conexión'));
    } finally {
      setLoadingPrevired(false);
    }
  };

  // ==========================================
  // ESTADO UF & MONEDAS EXTRANJERAS (BANCO CENTRAL)
  // ==========================================
  const [currencyYear, setCurrencyYear] = useState<number>(2026);
  const [currencyMonth, setCurrencyMonth] = useState<number>(new Date().getMonth() + 1);
  const [currencyRates, setCurrencyRates] = useState<ExchangeRate[]>([]);
  const [loadingCurrencies, setLoadingCurrencies] = useState(false);
  const [currencyStatusMsg, setCurrencyStatusMsg] = useState<string | null>(null);
  const [savingGlobalRates, setSavingGlobalRates] = useState(false);

  // Formulario de edición rápida para una fecha
  const [selectedRateDate, setSelectedRateDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [rateUf, setRateUf] = useState<number>(40610.69);
  const [rateDolar, setRateDolar] = useState<number>(942.50);
  const [rateEuro, setRateEuro] = useState<number>(1025.30);
  const [rateUtm, setRateUtm] = useState<number>(70588);
  const [rateYen, setRateYen] = useState<number>(6.15);
  const [rateIpc, setRateIpc] = useState<number>(0.3);

  // Cargar tasas del año/mes seleccionado
  useEffect(() => {
    let isMounted = true;
    const loadCurrencies = async () => {
      setLoadingCurrencies(true);
      try {
        const globalRef = collection(db, 'globalExchangeRates');
        const snap = await getDocs(globalRef);
        let list = snap.docs.map(d => ({ id: d.id, ...d.data() } as ExchangeRate));

        const prefix = `${currencyYear}-${String(currencyMonth).padStart(2, '0')}`;
        list = list.filter(r => r.date && r.date.startsWith(prefix));

        if (list.length === 0) {
          // Generar base oficial de banco central
          const raw = generateOfficialChileanIndicators(`${currencyYear}-01-01`);
          const monthGen = raw
            .filter(r => r.date.startsWith(prefix))
            .map(r => ({
              id: r.date,
              date: r.date,
              uf: r.uf,
              dolar: r.dolar,
              utm: r.utm,
              euro: r.euro,
              yen: r.yen,
              ipc: r.ipc,
              ipcAcomulado: r.ipcAcomulado
            }));
          list = monthGen;
        }

        list.sort((a, b) => b.date.localeCompare(a.date));
        if (isMounted) setCurrencyRates(list);
      } catch (err) {
        console.error('Error loading currencies:', err);
      } finally {
        if (isMounted) setLoadingCurrencies(false);
      }
    };

    loadCurrencies();
    return () => { isMounted = false; };
  }, [currencyYear, currencyMonth]);

  const handleSaveSingleRate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingGlobalRates(true);
    try {
      const payload: ExchangeRate = {
        id: selectedRateDate,
        date: selectedRateDate,
        uf: rateUf,
        dolar: rateDolar,
        euro: rateEuro,
        utm: rateUtm,
        yen: rateYen,
        ipc: rateIpc,
        ipcAcomulado: 0
      };

      // Guardar en colección global de referencia
      await setDoc(doc(db, 'globalExchangeRates', selectedRateDate), payload, { merge: true });

      // Replicar a todos los estudios existentes para que tengan los datos en vivo de forma transparente
      try {
        const studiesSnap = await getDocs(collection(db, 'studies'));
        for (const stDoc of studiesSnap.docs) {
          await setDoc(doc(db, 'studies', stDoc.id, 'exchangeRates', selectedRateDate), payload, { merge: true });
        }
      } catch (err) {
        console.warn('Replicación a estudios individuales con advertencia:', err);
      }

      // Actualizar estado local
      setCurrencyRates(prev => {
        const filtered = prev.filter(r => r.date !== selectedRateDate);
        const updated = [...filtered, payload];
        updated.sort((a, b) => b.date.localeCompare(a.date));
        return updated;
      });

      setCurrencyStatusMsg(`✅ Tasa para ${selectedRateDate} guardada y propagada a todos los estudios.`);
      setTimeout(() => setCurrencyStatusMsg(null), 4000);
    } catch (err: any) {
      console.error(err);
      alert('Error al guardar tasa: ' + (err.message || 'Error de red'));
    } finally {
      setSavingGlobalRates(false);
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
    <div className="space-y-6">
      {/* Banner Principal Super Administrador */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-3xl border border-indigo-900/50 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-mono font-bold uppercase tracking-wider">
              Centro Maestro Exclusivo Super Administrador
            </span>
          </div>
          <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
            Gestión Central de Indicadores Económicos & Previsionales
          </h2>
          <p className="text-xs text-slate-300 max-w-2xl leading-relaxed mt-1">
            Permite mantener al día de manera centralizada y silenciosa todas las UF, monedas extranjeras y tablas oficiales de Previred. Los estudios y empresas consumen estos datos automáticamente en sus cálculos.
          </p>
        </div>

        {/* Selector de Pestaña */}
        <div className="bg-slate-800/90 p-1.5 rounded-2xl border border-slate-700 flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setActiveSubTab('previred')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'previred'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-300 hover:text-white hover:bg-slate-700'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Previred & Remuneraciones</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('currencies')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'currencies'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-300 hover:text-white hover:bg-slate-700'
            }`}
          >
            <Globe className="w-4 h-4" />
            <span>UF & Monedas Extranjeras</span>
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* SECCIÓN 1: INDICADORES PREVISIONALES PREVIRED              */}
      {/* ========================================================= */}
      {activeSubTab === 'previred' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 text-white space-y-6 shadow-xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Tabla Oficial de Parámetros Previsionales ({period})
              </h3>
              <p className="text-xs text-slate-400">
                Afecta directamente el cálculo de nóminas, cotizaciones AFP, topes imponibles y asignación familiar.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5">
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
                <span>Cargar Previred Mayo 2026</span>
              </button>
            </div>
          </div>

          {previredStatusMsg && (
            <div className="bg-slate-800/80 border border-slate-700 text-indigo-300 text-xs px-4 py-2.5 rounded-xl flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>{previredStatusMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Columna 1: Índices Monetarios & Topes */}
            <div className="space-y-4">
              <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5 border-b border-slate-800 pb-2">
                  <DollarSign className="w-3.5 h-3.5" />
                  1. Índices & Sueldo Mínimo (IMM)
                </h4>

                <div className="space-y-2.5 text-xs">
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Valor UF del Período ($):</label>
                    <input
                      type="number"
                      step="0.01"
                      value={payrollParams.uf || 0}
                      onChange={e => setPayrollParams(prev => ({ ...prev, uf: parseFloat(e.target.value) || 0 }))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Valor UTM del Período ($):</label>
                    <input
                      type="number"
                      step="1"
                      value={payrollParams.utm || 0}
                      onChange={e => setPayrollParams(prev => ({ ...prev, utm: parseFloat(e.target.value) || 0 }))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Ingreso Mínimo Mensual - IMM ($):</label>
                    <input
                      type="number"
                      step="1000"
                      value={payrollParams.imm || 0}
                      onChange={e => setPayrollParams(prev => ({ ...prev, imm: parseFloat(e.target.value) || 0 }))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-emerald-400 font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                    <span className="text-[10px] text-slate-500 mt-0.5 block">Oficial Previred 2026: $539.000</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5 border-b border-slate-800 pb-2">
                  <TrendingUp className="w-3.5 h-3.5" />
                  2. Rentas Topes Imponibles (UF)
                </h4>

                <div className="space-y-2.5 text-xs">
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Tope Imponible AFP / Salud (UF):</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.1"
                        value={payrollParams.topeImponibleAfpUf || 0}
                        onChange={e => setPayrollParams(prev => ({ ...prev, topeImponibleAfpUf: parseFloat(e.target.value) || 0 }))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                      <span className="text-xs font-mono font-bold text-indigo-400 shrink-0">
                        ${Math.round((payrollParams.topeImponibleAfpUf || 0) * (payrollParams.uf || 0)).toLocaleString('es-CL')}
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
                        value={payrollParams.topeImponibleAfcUf || 0}
                        onChange={e => setPayrollParams(prev => ({ ...prev, topeImponibleAfcUf: parseFloat(e.target.value) || 0 }))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                      <span className="text-xs font-mono font-bold text-indigo-400 shrink-0">
                        ${Math.round((payrollParams.topeImponibleAfcUf || 0) * (payrollParams.uf || 0)).toLocaleString('es-CL')}
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
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5 border-b border-slate-800 pb-2 mb-3">
                  <Shield className="w-3.5 h-3.5" />
                  3. Tasas Cotización AFP (Fondo 10% + Comisión)
                </h4>

                <div className="space-y-2 text-xs">
                  {afpList.map(afp => {
                    const val = payrollParams.afpCommissions[afp.id] || 0;
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
                            onChange={e => handleSetAfp(afp.id, parseFloat(e.target.value) || 0)}
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
                    value={payrollParams.tasaSisPercent || 0}
                    onChange={e => setPayrollParams(prev => ({ ...prev, tasaSisPercent: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-white font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">Oficial Previred 2026: 1,62%</span>
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Tasa Mutual Básica (%):</label>
                  <input
                    type="number"
                    step="0.01"
                    value={payrollParams.tasaMutualPercent || 0}
                    onChange={e => setPayrollParams(prev => ({ ...prev, tasaMutualPercent: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-white font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">Básica + SANNA: 0,93%</span>
                </div>
              </div>
            </div>

            {/* Columna 3: Tramos de Asignación Familiar */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-3 flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5 border-b border-slate-800 pb-2 mb-3">
                  <Layers className="w-3.5 h-3.5" />
                  4. Asignación Familiar (Tramos & Límites)
                </h4>

                <div className="space-y-3 text-xs">
                  {/* Tramo A */}
                  <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-xl space-y-1.5">
                    <span className="font-bold text-amber-300 block text-xs">Tramo 1 (A) - Monto y Límite Renta:</span>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[10px] text-slate-400 block">Monto por Carga ($):</span>
                        <input
                          type="number"
                          value={payrollParams.tramosAsignacionFamiliar?.tramoA || 0}
                          onChange={e => setPayrollParams(prev => ({
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
                          value={payrollParams.tramosAsignacionFamiliar?.limiteA || 0}
                          onChange={e => setPayrollParams(prev => ({
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
                          value={payrollParams.tramosAsignacionFamiliar?.tramoB || 0}
                          onChange={e => setPayrollParams(prev => ({
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
                          value={payrollParams.tramosAsignacionFamiliar?.limiteB || 0}
                          onChange={e => setPayrollParams(prev => ({
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
                          value={payrollParams.tramosAsignacionFamiliar?.tramoC || 0}
                          onChange={e => setPayrollParams(prev => ({
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
                          value={payrollParams.tramosAsignacionFamiliar?.limiteC || 0}
                          onChange={e => setPayrollParams(prev => ({
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
                  onClick={handleSavePrevired}
                  disabled={loadingPrevired}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/40 cursor-pointer disabled:opacity-50"
                >
                  {previredSaveSuccess ? (
                    <>
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>¡Guardado Exitosamente!</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>{loadingPrevired ? 'Guardando en Base de Datos...' : `Guardar Parámetros Previred ${period}`}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* SECCIÓN 2: UF & MONEDAS EXTRANJERAS (BANCO CENTRAL / SII)  */}
      {/* ========================================================= */}
      {activeSubTab === 'currencies' && (
        <div className="space-y-6">
          {/* Panel de Ingreso Diario / Mensual */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 text-white space-y-4 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Globe className="w-5 h-5 text-indigo-400" />
                  Carga y Edición de Valores UF, Dólar, Euro, UTM & IPC
                </h3>
                <p className="text-xs text-slate-400">
                  Guarda valores oficiales para cualquier día o mes y los propaga automáticamente a todos los estudios contables del sistema.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-bold">Ver Mes:</span>
                <select
                  value={currencyYear}
                  onChange={e => setCurrencyYear(parseInt(e.target.value, 10))}
                  className="bg-slate-800 border border-slate-700 text-white rounded-lg px-2.5 py-1 text-xs font-mono font-bold"
                >
                  {[2027, 2026, 2025, 2024].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <select
                  value={currencyMonth}
                  onChange={e => setCurrencyMonth(parseInt(e.target.value, 10))}
                  className="bg-slate-800 border border-slate-700 text-white rounded-lg px-2.5 py-1 text-xs font-bold"
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
                    <option key={item.m} value={item.m}>{item.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {currencyStatusMsg && (
              <div className="bg-emerald-950/80 border border-emerald-700/80 text-emerald-300 text-xs px-4 py-2 rounded-xl flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{currencyStatusMsg}</span>
              </div>
            )}

            {/* Formulario de Carga Directa */}
            <form onSubmit={handleSaveSingleRate} className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 text-xs">
                <div>
                  <label className="block text-slate-400 font-bold mb-1">Fecha:</label>
                  <input
                    type="date"
                    value={selectedRateDate}
                    onChange={e => {
                      const d = e.target.value;
                      setSelectedRateDate(d);
                      const existing = currencyRates.find(r => r.date === d);
                      if (existing) {
                        setRateUf(existing.uf);
                        setRateDolar(existing.dolar);
                        setRateEuro(existing.euro);
                        setRateUtm(existing.utm);
                        setRateYen(existing.yen);
                        setRateIpc(existing.ipc);
                      }
                    }}
                    required
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-white font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-bold mb-1">UF ($):</label>
                  <input
                    type="number"
                    step="0.01"
                    value={rateUf}
                    onChange={e => setRateUf(parseFloat(e.target.value) || 0)}
                    required
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-emerald-400 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-bold mb-1">Dólar USD ($):</label>
                  <input
                    type="number"
                    step="0.01"
                    value={rateDolar}
                    onChange={e => setRateDolar(parseFloat(e.target.value) || 0)}
                    required
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-sky-400 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-bold mb-1">Euro EUR ($):</label>
                  <input
                    type="number"
                    step="0.01"
                    value={rateEuro}
                    onChange={e => setRateEuro(parseFloat(e.target.value) || 0)}
                    required
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-indigo-400 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-bold mb-1">UTM ($):</label>
                  <input
                    type="number"
                    step="1"
                    value={rateUtm}
                    onChange={e => setRateUtm(parseFloat(e.target.value) || 0)}
                    required
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-amber-400 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-bold mb-1">Yen JPY ($):</label>
                  <input
                    type="number"
                    step="0.01"
                    value={rateYen}
                    onChange={e => setRateYen(parseFloat(e.target.value) || 0)}
                    required
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-purple-400 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-bold mb-1">IPC Mensual (%):</label>
                  <input
                    type="number"
                    step="0.01"
                    value={rateIpc}
                    onChange={e => setRateIpc(parseFloat(e.target.value) || 0)}
                    required
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-rose-400 font-mono font-bold"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="submit"
                  disabled={savingGlobalRates}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{savingGlobalRates ? 'Guardando...' : `Guardar & Propagar ${selectedRateDate}`}</span>
                </button>
              </div>
            </form>

            {/* Tabla con los valores del mes */}
            <div className="overflow-x-auto rounded-2xl border border-slate-800">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-950 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Fecha</th>
                    <th className="py-2.5 px-3 text-right">UF ($)</th>
                    <th className="py-2.5 px-3 text-right">Dólar ($)</th>
                    <th className="py-2.5 px-3 text-right">Euro ($)</th>
                    <th className="py-2.5 px-3 text-right">UTM ($)</th>
                    <th className="py-2.5 px-3 text-right">Yen ($)</th>
                    <th className="py-2.5 px-3 text-right">IPC (%)</th>
                    <th className="py-2.5 px-3 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {currencyRates.slice(0, 15).map(r => (
                    <tr key={r.date} className="hover:bg-slate-850/60 transition-colors">
                      <td className="py-2 px-3 font-bold text-white">{r.date}</td>
                      <td className="py-2 px-3 text-right text-emerald-400">${r.uf.toLocaleString('es-CL', { minimumFractionDigits: 2 })}</td>
                      <td className="py-2 px-3 text-right text-sky-400">${r.dolar.toLocaleString('es-CL', { minimumFractionDigits: 2 })}</td>
                      <td className="py-2 px-3 text-right text-indigo-400">${r.euro.toLocaleString('es-CL', { minimumFractionDigits: 2 })}</td>
                      <td className="py-2 px-3 text-right text-amber-400">${r.utm.toLocaleString('es-CL')}</td>
                      <td className="py-2 px-3 text-right text-purple-400">${r.yen}</td>
                      <td className="py-2 px-3 text-right text-rose-400">{r.ipc}%</td>
                      <td className="py-2 px-3 text-center font-sans">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedRateDate(r.date);
                            setRateUf(r.uf);
                            setRateDolar(r.dolar);
                            setRateEuro(r.euro);
                            setRateUtm(r.utm);
                            setRateYen(r.yen);
                            setRateIpc(r.ipc);
                          }}
                          className="px-2 py-0.5 bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white rounded-md text-[11px] font-semibold transition-colors"
                        >
                          Cargar
                        </button>
                      </td>
                    </tr>
                  ))}
                  {currencyRates.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-slate-500 font-sans">
                        No hay registros en este mes. Use el formulario arriba para agregar valores.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminIndicatorsCenter;
