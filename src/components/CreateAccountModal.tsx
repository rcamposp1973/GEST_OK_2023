import React, { useState } from 'react';
import { db } from '../lib/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { ChartOfAccount } from '../types';
import { 
  X, Check, AlertCircle, Sparkles, Landmark, Users, 
  Receipt, Calendar, Layers, ShieldCheck, DollarSign,
  Building, Package, HardHat, FileText, ArrowRight, Info, Plus
} from 'lucide-react';
import { compareAccountCodes } from '../utils/sortingUtils';

interface CreateAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccountCreated: (createdAccount: ChartOfAccount) => void;
  existingCodes: string[];
  studyId: string;
  companyId: string;
  customColumns?: string[];
}

export const CreateAccountModal: React.FC<CreateAccountModalProps> = ({
  isOpen,
  onClose,
  onAccountCreated,
  existingCodes,
  studyId,
  companyId,
  customColumns = []
}) => {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<'Activo' | 'Pasivo' | 'Patrimonio' | 'Ingreso' | 'Gasto'>('Activo');
  const [isImputable, setIsImputable] = useState(true);
  const [moneda, setMoneda] = useState('CLP');
  const [blce8Columnas, setBlce8Columnas] = useState<'ACTIVO' | 'PASIVO' | 'PERDIDA' | 'GANANCIA' | 'NO_APLICA'>('ACTIVO');
  const [codigoIFRS, setCodigoIFRS] = useState('');
  
  // Atributos de Análisis Contable
  const [requiereAuxiliarRUT, setRequiereAuxiliarRUT] = useState(false);
  const [requiereConciliacionBancaria, setRequiereConciliacionBancaria] = useState(false);
  const [requiereDocumento, setRequiereDocumento] = useState(false);
  const [requiereVencimiento, setRequiereVencimiento] = useState(false);
  const [requiereCentroCosto, setRequiereCentroCosto] = useState(false);
  const [requiereItemGasto, setRequiereItemGasto] = useState(false);
  const [requiereProyecto, setRequiereProyecto] = useState(false);
  const [requiereProducto, setRequiereProducto] = useState(false);
  const [esActivoFijo, setEsActivoFijo] = useState(false);
  const [requiereCMonetaria, setRequiereCMonetaria] = useState(false);
  const [requiereDifCambio, setRequiereDifCambio] = useState(false);

  // Datos Bancarios opcionales
  const [bankInstitution, setBankInstitution] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');

  // Atributos personalizados dinámicos
  const [customAttributes, setCustomAttributes] = useState<{ [key: string]: boolean }>({});

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const normalizedCode = code.trim().toUpperCase();
  const isDuplicateCode = normalizedCode !== '' && existingCodes.some(c => c.trim().toUpperCase() === normalizedCode);

  // Auto-ajustar Tipo y Balance 8 columnas según el código
  const handleCodeChange = (newCode: string) => {
    const val = newCode.toUpperCase();
    setCode(val);
    setErrorMessage(null);

    const firstChar = val.trim().charAt(0);
    if (firstChar === '1') {
      setType('Activo');
      setBlce8Columnas('ACTIVO');
    } else if (firstChar === '2') {
      setType('Pasivo');
      setBlce8Columnas('PASIVO');
    } else if (firstChar === '3') {
      setType('Patrimonio');
      setBlce8Columnas('PASIVO');
    } else if (firstChar === '4' || firstChar === '5') {
      setType('Gasto');
      setBlce8Columnas('PERDIDA');
    } else if (firstChar === '6' || firstChar === '7') {
      setType('Ingreso');
      setBlce8Columnas('GANANCIA');
    }
  };

  // Preconfiguraciones Rápidas (Presets)
  const applyPreset = (preset: 'BANCO' | 'CLIENTE' | 'PROVEEDOR' | 'FONDO_FIJO' | 'ACTIVO_FIJO' | 'GASTO' | 'TITULO') => {
    switch (preset) {
      case 'BANCO':
        setType('Activo');
        setBlce8Columnas('ACTIVO');
        setIsImputable(true);
        setRequiereConciliacionBancaria(true);
        setRequiereAuxiliarRUT(false);
        setRequiereDocumento(false);
        setRequiereVencimiento(false);
        setRequiereCentroCosto(false);
        setRequiereItemGasto(false);
        setRequiereProyecto(false);
        setRequiereProducto(false);
        setEsActivoFijo(false);
        setRequiereCMonetaria(false);
        if (!code) setCode('1.1.01.');
        if (!name) setName('BANCO ');
        break;
      case 'CLIENTE':
        setType('Activo');
        setBlce8Columnas('ACTIVO');
        setIsImputable(true);
        setRequiereAuxiliarRUT(true);
        setRequiereDocumento(true);
        setRequiereVencimiento(true);
        setRequiereConciliacionBancaria(false);
        setRequiereCentroCosto(false);
        setRequiereItemGasto(false);
        setRequiereProyecto(false);
        setRequiereProducto(false);
        setEsActivoFijo(false);
        if (!code) setCode('1.1.02.');
        if (!name) setName('CLIENTES NACIONALES');
        break;
      case 'PROVEEDOR':
        setType('Pasivo');
        setBlce8Columnas('PASIVO');
        setIsImputable(true);
        setRequiereAuxiliarRUT(true);
        setRequiereDocumento(true);
        setRequiereVencimiento(true);
        setRequiereConciliacionBancaria(false);
        setRequiereCentroCosto(false);
        setRequiereItemGasto(false);
        setRequiereProyecto(false);
        setRequiereProducto(false);
        setEsActivoFijo(false);
        if (!code) setCode('2.1.01.');
        if (!name) setName('PROVEEDORES NACIONALES');
        break;
      case 'FONDO_FIJO':
        setType('Activo');
        setBlce8Columnas('ACTIVO');
        setIsImputable(true);
        setRequiereDocumento(true);
        setRequiereAuxiliarRUT(false);
        setRequiereConciliacionBancaria(false);
        setRequiereCentroCosto(false);
        setRequiereItemGasto(false);
        setRequiereProyecto(false);
        setRequiereProducto(false);
        setEsActivoFijo(false);
        if (!code) setCode('1.1.01.002');
        if (!name) setName('FONDO FIJO / CAJA CHICA');
        break;
      case 'ACTIVO_FIJO':
        setType('Activo');
        setBlce8Columnas('ACTIVO');
        setIsImputable(true);
        setEsActivoFijo(true);
        setRequiereCMonetaria(true);
        setRequiereDocumento(true);
        setRequiereAuxiliarRUT(true);
        setRequiereConciliacionBancaria(false);
        setRequiereCentroCosto(true);
        setRequiereProyecto(false);
        setRequiereProducto(false);
        if (!code) setCode('1.2.01.');
        if (!name) setName('MAQUINARIAS Y EQUIPOS');
        break;
      case 'GASTO':
        setType('Gasto');
        setBlce8Columnas('PERDIDA');
        setIsImputable(true);
        setRequiereCentroCosto(true);
        setRequiereItemGasto(true);
        setRequiereDocumento(true);
        setRequiereAuxiliarRUT(false);
        setRequiereConciliacionBancaria(false);
        setRequiereProyecto(false);
        setRequiereProducto(false);
        setEsActivoFijo(false);
        if (!code) setCode('4.1.01.');
        if (!name) setName('GASTOS DE ');
        break;
      case 'TITULO':
        setIsImputable(false);
        setRequiereAuxiliarRUT(false);
        setRequiereConciliacionBancaria(false);
        setRequiereDocumento(false);
        setRequiereVencimiento(false);
        setRequiereCentroCosto(false);
        setRequiereItemGasto(false);
        setRequiereProyecto(false);
        setRequiereProducto(false);
        setEsActivoFijo(false);
        setRequiereCMonetaria(false);
        setRequiereDifCambio(false);
        break;
    }
  };

  const handleSave = async (createAnother: boolean = false) => {
    if (!normalizedCode) {
      setErrorMessage('Debes ingresar el código de la cuenta.');
      return;
    }
    if (!name.trim()) {
      setErrorMessage('Debes ingresar el nombre de la cuenta.');
      return;
    }
    if (isDuplicateCode) {
      setErrorMessage(`El código "${normalizedCode}" ya existe en el plan de cuentas.`);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const now = new Date().toISOString();
      const newAccountData: Omit<ChartOfAccount, 'id'> = {
        code: normalizedCode,
        name: name.trim().toUpperCase(),
        type,
        isImputable,
        moneda: moneda.toUpperCase(),
        blce8Columnas,
        codigoIFRS: codigoIFRS.trim().toUpperCase(),
        requiereAuxiliarRUT,
        requiereConciliacionBancaria,
        requiereDocumento,
        requiereVencimiento,
        requiereCentroCosto,
        requiereItemGasto,
        requiereProyecto,
        requiereProducto,
        esActivoFijo,
        requiereCMonetaria,
        requiereDifCambio,
        bankInstitution: bankInstitution.trim() || undefined,
        bankAccountNumber: bankAccountNumber.trim() || undefined,
        customAttributes,
        estado: 'Activo',
        creationMode: 'MANUAL',
        createdAt: now
      };

      const docRef = await addDoc(
        collection(db, 'studies', studyId, 'companies', companyId, 'chartOfAccounts'),
        newAccountData
      );

      const created: ChartOfAccount = {
        id: docRef.id,
        ...newAccountData
      };

      onAccountCreated(created);

      if (createAnother) {
        // Preparar para la siguiente cuenta: sugerir siguiente código numérico si termina en número
        const match = normalizedCode.match(/(\d+)$/);
        if (match) {
          const numStr = match[1];
          const nextNum = String(parseInt(numStr, 10) + 1).padStart(numStr.length, '0');
          setCode(normalizedCode.replace(/(\d+)$/, nextNum));
        } else {
          setCode('');
        }
        setName('');
        setBankInstitution('');
        setBankAccountNumber('');
        setIsSubmitting(false);
      } else {
        setIsSubmitting(false);
        onClose();
      }
    } catch (err: any) {
      console.error('Error creating account:', err);
      setErrorMessage('Error al crear la cuenta: ' + err.message);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-auto flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex justify-between items-center border-b border-indigo-900/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-xl shadow-inner">
              📚
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Nueva Cuenta Contable
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono border border-emerald-400/30">
                  Plan de Cuentas
                </span>
              </h3>
              <p className="text-xs text-indigo-200">
                Define código, clasificación oficial y atributos de análisis para el registro de comprobantes.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs text-slate-700">
          
          {/* Mensajes de Alerta / Error */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span className="font-semibold">{errorMessage}</span>
            </div>
          )}

          {isDuplicateCode && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Ya existe una cuenta con el código <strong>{normalizedCode}</strong> en el plan. Por favor utiliza un código único.</span>
            </div>
          )}

          {/* Plantillas / Presets Rápidos */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                Configuraciones Rápidas (Presets Típicos Chilenos):
              </span>
              <span className="text-[10px] text-slate-500">Completa atributos con 1 clic</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => applyPreset('BANCO')}
                className="px-2.5 py-1 bg-white hover:bg-indigo-50 text-indigo-700 border border-slate-200 hover:border-indigo-300 rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
              >
                <Landmark className="w-3 h-3" />
                <span>Banco / Tesorería</span>
              </button>
              <button
                type="button"
                onClick={() => applyPreset('FONDO_FIJO')}
                className="px-2.5 py-1 bg-white hover:bg-indigo-50 text-indigo-700 border border-slate-200 hover:border-indigo-300 rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
              >
                <DollarSign className="w-3 h-3" />
                <span>Fondo Fijo / Rendición</span>
              </button>
              <button
                type="button"
                onClick={() => applyPreset('CLIENTE')}
                className="px-2.5 py-1 bg-white hover:bg-emerald-50 text-emerald-700 border border-slate-200 hover:border-emerald-300 rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
              >
                <Users className="w-3 h-3" />
                <span>Cliente (RUT + Doc)</span>
              </button>
              <button
                type="button"
                onClick={() => applyPreset('PROVEEDOR')}
                className="px-2.5 py-1 bg-white hover:bg-emerald-50 text-emerald-700 border border-slate-200 hover:border-emerald-300 rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
              >
                <Building className="w-3 h-3" />
                <span>Proveedor (RUT + Doc)</span>
              </button>
              <button
                type="button"
                onClick={() => applyPreset('GASTO')}
                className="px-2.5 py-1 bg-white hover:bg-amber-50 text-amber-700 border border-slate-200 hover:border-amber-300 rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
              >
                <FileText className="w-3 h-3" />
                <span>Gasto (C.Costo + Ítem)</span>
              </button>
              <button
                type="button"
                onClick={() => applyPreset('ACTIVO_FIJO')}
                className="px-2.5 py-1 bg-white hover:bg-purple-50 text-purple-700 border border-slate-200 hover:border-purple-300 rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
              >
                <HardHat className="w-3 h-3" />
                <span>Activo Fijo + C.Monetaria</span>
              </button>
              <button
                type="button"
                onClick={() => applyPreset('TITULO')}
                className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
              >
                <span>📁 Cuenta de Título</span>
              </button>
            </div>
          </div>

          {/* DATOS PRINCIPALES DE LA CUENTA */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            {/* Código */}
            <div className="sm:col-span-4">
              <label className="block text-[11px] font-bold text-slate-800 mb-1">
                Código de Cuenta <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={code}
                onChange={e => handleCodeChange(e.target.value)}
                placeholder="Ej: 1.1.01.001"
                autoFocus
                className={`w-full px-3 py-2 text-xs font-mono font-bold rounded-lg border focus:ring-2 focus:outline-none ${
                  isDuplicateCode 
                    ? 'border-rose-400 bg-rose-50 focus:ring-rose-400 text-rose-900' 
                    : 'border-slate-300 bg-white focus:ring-indigo-500 text-slate-900'
                }`}
              />
            </div>

            {/* Nombre */}
            <div className="sm:col-span-8">
              <label className="block text-[11px] font-bold text-slate-800 mb-1">
                Nombre de la Cuenta <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value.toUpperCase())}
                placeholder="Ej: BANCO DE CHILE CUENTA CORRIENTE"
                className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none text-slate-900"
              />
            </div>

            {/* Tipo */}
            <div className="sm:col-span-4">
              <label className="block text-[11px] font-bold text-slate-800 mb-1">
                Tipo Contable
              </label>
              <select
                value={type}
                onChange={e => setType(e.target.value as any)}
                className="w-full px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none text-slate-800"
              >
                <option value="Activo">Activo</option>
                <option value="Pasivo">Pasivo</option>
                <option value="Patrimonio">Patrimonio</option>
                <option value="Ingreso">Ingreso (Ganancia)</option>
                <option value="Gasto">Gasto (Pérdida)</option>
              </select>
            </div>

            {/* Imputable */}
            <div className="sm:col-span-3">
              <label className="block text-[11px] font-bold text-slate-800 mb-1">
                ¿Es Imputable?
              </label>
              <select
                value={isImputable ? 'SI' : 'NO'}
                onChange={e => setIsImputable(e.target.value === 'SI')}
                className={`w-full px-3 py-2 text-xs font-bold rounded-lg border outline-none ${
                  isImputable 
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-900' 
                    : 'border-slate-300 bg-slate-100 text-slate-700'
                }`}
              >
                <option value="SI">SI (Acepta Asientos)</option>
                <option value="NO">NO (Cuenta Título)</option>
              </select>
            </div>

            {/* Moneda */}
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold text-slate-800 mb-1">
                Moneda
              </label>
              <select
                value={moneda}
                onChange={e => setMoneda(e.target.value)}
                className="w-full px-3 py-2 text-xs font-bold font-mono rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="CLP">CLP</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="UF">UF</option>
                <option value="UTM">UTM</option>
              </select>
            </div>

            {/* Balance 8 Columnas */}
            <div className="sm:col-span-3">
              <label className="block text-[11px] font-bold text-slate-800 mb-1">
                Balance 8 Columnas
              </label>
              <select
                value={blce8Columnas}
                onChange={e => setBlce8Columnas(e.target.value as any)}
                className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none text-slate-800"
              >
                <option value="ACTIVO">ACTIVO</option>
                <option value="PASIVO">PASIVO</option>
                <option value="PERDIDA">PÉRDIDA</option>
                <option value="GANANCIA">GANANCIA</option>
                <option value="NO_APLICA">NO APLICA</option>
              </select>
            </div>

            {/* Código IFRS */}
            <div className="sm:col-span-4">
              <label className="block text-[11px] font-bold text-slate-800 mb-1">
                Código IFRS / FECU (Opcional)
              </label>
              <input
                type="text"
                value={codigoIFRS}
                onChange={e => setCodigoIFRS(e.target.value.toUpperCase())}
                placeholder="Ej: 1101"
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none text-slate-800"
              />
            </div>

            {/* Banco / Cuenta Corriente si aplica */}
            {requiereConciliacionBancaria && (
              <>
                <div className="sm:col-span-4">
                  <label className="block text-[11px] font-bold text-indigo-900 mb-1">
                    Institución Bancaria
                  </label>
                  <input
                    type="text"
                    value={bankInstitution}
                    onChange={e => setBankInstitution(e.target.value)}
                    placeholder="Ej: Banco de Chile, Santander..."
                    className="w-full px-3 py-2 text-xs rounded-lg border border-indigo-200 bg-indigo-50/40 focus:ring-2 focus:ring-indigo-500 focus:outline-none text-indigo-950 font-medium"
                  />
                </div>
                <div className="sm:col-span-4">
                  <label className="block text-[11px] font-bold text-indigo-900 mb-1">
                    N° Cuenta Bancaria
                  </label>
                  <input
                    type="text"
                    value={bankAccountNumber}
                    onChange={e => setBankAccountNumber(e.target.value)}
                    placeholder="Ej: 00-12345678-90"
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-indigo-200 bg-indigo-50/40 focus:ring-2 focus:ring-indigo-500 focus:outline-none text-indigo-950 font-medium"
                  />
                </div>
              </>
            )}
          </div>

          {/* MATRIZ DE ATRIBUTOS DE ANÁLISIS CONTABLE (11 TOGGLES CLAVE) */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div>
                <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Atributos de Análisis Contable y Auditoría
                </h4>
                <p className="text-[11px] text-slate-500">
                  Define qué datos adicionales exigirá el sistema al ingresar un comprobante con esta cuenta.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              
              {/* Requiere Auxiliar RUT */}
              <label className={`p-2.5 rounded-lg border transition-all flex items-start gap-2.5 cursor-pointer ${
                requiereAuxiliarRUT ? 'bg-indigo-50/80 border-indigo-300 text-indigo-950 font-semibold shadow-2xs' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100/60'
              }`}>
                <input
                  type="checkbox"
                  checked={requiereAuxiliarRUT}
                  onChange={e => setRequiereAuxiliarRUT(e.target.checked)}
                  className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <div>
                  <span className="text-xs block">Requiere Auxiliar (RUT)</span>
                  <span className="text-[10px] text-slate-500 block font-normal">Exige RUT de cliente, proveedor o persona</span>
                </div>
              </label>

              {/* Requiere Conciliación Bancaria */}
              <label className={`p-2.5 rounded-lg border transition-all flex items-start gap-2.5 cursor-pointer ${
                requiereConciliacionBancaria ? 'bg-indigo-50/80 border-indigo-300 text-indigo-950 font-semibold shadow-2xs' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100/60'
              }`}>
                <input
                  type="checkbox"
                  checked={requiereConciliacionBancaria}
                  onChange={e => setRequiereConciliacionBancaria(e.target.checked)}
                  className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <div>
                  <span className="text-xs block">Conciliación Bancaria</span>
                  <span className="text-[10px] text-slate-500 block font-normal">Habilita módulo de cartolas y calce</span>
                </div>
              </label>

              {/* Requiere Documento */}
              <label className={`p-2.5 rounded-lg border transition-all flex items-start gap-2.5 cursor-pointer ${
                requiereDocumento ? 'bg-indigo-50/80 border-indigo-300 text-indigo-950 font-semibold shadow-2xs' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100/60'
              }`}>
                <input
                  type="checkbox"
                  checked={requiereDocumento}
                  onChange={e => setRequiereDocumento(e.target.checked)}
                  className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <div>
                  <span className="text-xs block">Requiere Documento</span>
                  <span className="text-[10px] text-slate-500 block font-normal">Exige Folio de factura, boleta o cheque</span>
                </div>
              </label>

              {/* Requiere Vencimiento */}
              <label className={`p-2.5 rounded-lg border transition-all flex items-start gap-2.5 cursor-pointer ${
                requiereVencimiento ? 'bg-indigo-50/80 border-indigo-300 text-indigo-950 font-semibold shadow-2xs' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100/60'
              }`}>
                <input
                  type="checkbox"
                  checked={requiereVencimiento}
                  onChange={e => setRequiereVencimiento(e.target.checked)}
                  className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <div>
                  <span className="text-xs block">Requiere Vencimiento</span>
                  <span className="text-[10px] text-slate-500 block font-normal">Control de cartera y cuentas por pagar</span>
                </div>
              </label>

              {/* Requiere Centro de Costo */}
              <label className={`p-2.5 rounded-lg border transition-all flex items-start gap-2.5 cursor-pointer ${
                requiereCentroCosto ? 'bg-indigo-50/80 border-indigo-300 text-indigo-950 font-semibold shadow-2xs' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100/60'
              }`}>
                <input
                  type="checkbox"
                  checked={requiereCentroCosto}
                  onChange={e => setRequiereCentroCosto(e.target.checked)}
                  className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <div>
                  <span className="text-xs block">Centro de Costo</span>
                  <span className="text-[10px] text-slate-500 block font-normal">Distribución analítica por sucursal / área</span>
                </div>
              </label>

              {/* Requiere Ítem de Gasto */}
              <label className={`p-2.5 rounded-lg border transition-all flex items-start gap-2.5 cursor-pointer ${
                requiereItemGasto ? 'bg-indigo-50/80 border-indigo-300 text-indigo-950 font-semibold shadow-2xs' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100/60'
              }`}>
                <input
                  type="checkbox"
                  checked={requiereItemGasto}
                  onChange={e => setRequiereItemGasto(e.target.checked)}
                  className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <div>
                  <span className="text-xs block">Ítem de Gasto</span>
                  <span className="text-[10px] text-slate-500 block font-normal">Subclasificación detallada de egresos</span>
                </div>
              </label>

              {/* Requiere Proyecto */}
              <label className={`p-2.5 rounded-lg border transition-all flex items-start gap-2.5 cursor-pointer ${
                requiereProyecto ? 'bg-indigo-50/80 border-indigo-300 text-indigo-950 font-semibold shadow-2xs' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100/60'
              }`}>
                <input
                  type="checkbox"
                  checked={requiereProyecto}
                  onChange={e => setRequiereProyecto(e.target.checked)}
                  className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <div>
                  <span className="text-xs block">Requiere Proyecto</span>
                  <span className="text-[10px] text-slate-500 block font-normal">Seguimiento por obra, contrato o negocio</span>
                </div>
              </label>

              {/* Requiere Producto */}
              <label className={`p-2.5 rounded-lg border transition-all flex items-start gap-2.5 cursor-pointer ${
                requiereProducto ? 'bg-indigo-50/80 border-indigo-300 text-indigo-950 font-semibold shadow-2xs' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100/60'
              }`}>
                <input
                  type="checkbox"
                  checked={requiereProducto}
                  onChange={e => setRequiereProducto(e.target.checked)}
                  className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <div>
                  <span className="text-xs block">Producto / Kardex</span>
                  <span className="text-[10px] text-slate-500 block font-normal">Asociación con existencias e inventarios</span>
                </div>
              </label>

              {/* Es Activo Fijo */}
              <label className={`p-2.5 rounded-lg border transition-all flex items-start gap-2.5 cursor-pointer ${
                esActivoFijo ? 'bg-indigo-50/80 border-indigo-300 text-indigo-950 font-semibold shadow-2xs' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100/60'
              }`}>
                <input
                  type="checkbox"
                  checked={esActivoFijo}
                  onChange={e => setEsActivoFijo(e.target.checked)}
                  className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <div>
                  <span className="text-xs block">Es Activo Fijo</span>
                  <span className="text-[10px] text-slate-500 block font-normal">Ficha de activo y cuadro de depreciación</span>
                </div>
              </label>

              {/* Corrección Monetaria */}
              <label className={`p-2.5 rounded-lg border transition-all flex items-start gap-2.5 cursor-pointer ${
                requiereCMonetaria ? 'bg-indigo-50/80 border-indigo-300 text-indigo-950 font-semibold shadow-2xs' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100/60'
              }`}>
                <input
                  type="checkbox"
                  checked={requiereCMonetaria}
                  onChange={e => setRequiereCMonetaria(e.target.checked)}
                  className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <div>
                  <span className="text-xs block">Corrección Monetaria</span>
                  <span className="text-[10px] text-slate-500 block font-normal">Ajuste tributario IPC Art. 41 LIR</span>
                </div>
              </label>

              {/* Diferencia de Cambio */}
              <label className={`p-2.5 rounded-lg border transition-all flex items-start gap-2.5 cursor-pointer ${
                requiereDifCambio ? 'bg-indigo-50/80 border-indigo-300 text-indigo-950 font-semibold shadow-2xs' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100/60'
              }`}>
                <input
                  type="checkbox"
                  checked={requiereDifCambio}
                  onChange={e => setRequiereDifCambio(e.target.checked)}
                  className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <div>
                  <span className="text-xs block">Diferencia de Cambio</span>
                  <span className="text-[10px] text-slate-500 block font-normal">Ajuste cambiario para moneda extranjera</span>
                </div>
              </label>

            </div>

            {/* Columnas personalizadas adicionales si existen */}
            {customColumns.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-200">
                <span className="text-[11px] font-bold text-slate-700 block mb-2">Columnas de Análisis Personalizadas:</span>
                <div className="flex flex-wrap gap-2">
                  {customColumns.map(col => (
                    <label key={col} className={`px-3 py-1.5 rounded-lg border text-xs flex items-center gap-2 cursor-pointer transition-colors ${
                      customAttributes[col] ? 'bg-indigo-50 border-indigo-300 text-indigo-900 font-semibold' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}>
                      <input
                        type="checkbox"
                        checked={!!customAttributes[col]}
                        onChange={e => setCustomAttributes(prev => ({ ...prev, [col]: e.target.checked }))}
                        className="rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>{col}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-slate-400" />
            <span>Al guardar, la cuenta se insertará de inmediato y se ordenará automáticamente según su código.</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold border border-slate-300 transition-colors cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={() => handleSave(true)}
              disabled={isSubmitting || isDuplicateCode || !code.trim() || !name.trim()}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Guardar y Crear Otra</span>
            </button>

            <button
              type="button"
              onClick={() => handleSave(false)}
              disabled={isSubmitting || isDuplicateCode || !code.trim() || !name.trim()}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-xs font-bold transition-all shadow-md disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>{isSubmitting ? 'Guardando...' : 'Guardar e Insertar al Plan'}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
