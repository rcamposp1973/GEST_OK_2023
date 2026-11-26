import { getNaturaleza } from '../utils/ifrsClassification';
import { formatearRut } from '../utils/rutFormato';
import { getNextVoucherNumber } from '../utils/voucherCounter';
import { exigirCuadre } from '../utils/capaContable';
import { plazoPagoF29 } from '../utils/plazoPagoF29';
import { ivaCreditoCoherente, normalizarTipoCompra } from '../utils/rcvIva';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import html2canvas from 'html2canvas';
import { db } from '../lib/firebase';
import { collection, getDocs, doc, setDoc, addDoc, updateDoc } from 'firebase/firestore';
import { getOfficialUTM, getOfficialHonorariosRate } from '../utils/chileanEconomicIndicators';
import { getLatestOpenPeriod, getAllOpenPeriods } from '../utils/periodUtils';
import {
  Company,
  ChartOfAccount,
  RCVDocument,
  Voucher,
  FiscalPeriodYear,
  F29Declaration,
  F29TaxSettings,
  F29DebitoFiscal,
  F29CreditoFiscal,
  F29Retenciones,
  F29PPM,
  F29ResumenTotal,
  CustomF29Code,
  F29AccountingParams
} from '../types';
import { sanitizeVoucherLines } from '../utils/voucherValidation';
import { resumenOtrosImpuestos } from '../utils/otrosImpuestos';
import { remanenteArrastrado, remanenteEnPesos, reajusteRemanente, RemanenteArrastrado } from '../utils/f29Remanente';
import { Receipt, Download, Save, Zap, MessageSquare, Copy, X, Share2 } from 'lucide-react';

interface Formulario29ViewProps {
  studyId: string;
  company: Company;
  accounts: ChartOfAccount[];
  rcvDocuments: RCVDocument[];
  vouchers: Voucher[];
  fiscalYears: FiscalPeriodYear[];
  onVouchersUpdated?: () => void;
  /** Parámetros RCV de la empresa (config/rcvParams): define si recupera el impuesto al diésel. */
  recuperaDiesel?: boolean;
}

export default function Formulario29View({
  recuperaDiesel = false,
  studyId,
  company,
  accounts,
  rcvDocuments,
  vouchers,
  fiscalYears,
  onVouchersUpdated
}: Formulario29ViewProps) {
  // Default tax period: most recent open month in the system
  // El período elegido se recuerda en la sesión (al cambiar de pestaña o salir y volver a la empresa no se pierde)
  const clavePeriodo = `gestok:f29:periodo:${company.id}`;
  const [selectedPeriod, setSelectedPeriod] = useState<string>(() => {
    try { const g = sessionStorage.getItem(clavePeriodo); if (g && /^\d{4}-\d{2}$/.test(g)) return g; } catch { /* sin almacenamiento */ }
    return getLatestOpenPeriod(fiscalYears);
  });
  useEffect(() => { try { sessionStorage.setItem(clavePeriodo, selectedPeriod); } catch { /* sin almacenamiento */ } }, [clavePeriodo, selectedPeriod]);
  const [activeTab, setActiveTab] = useState<'formulario' | 'auditoria' | 'parametros' | 'historial'>('formulario');
  const [loading, setLoading] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [savedDeclarations, setSavedDeclarations] = useState<F29Declaration[]>([]);
  const [showClientSummaryModal, setShowClientSummaryModal] = useState<boolean>(false);
  // Plazo de pago: día 20 del mes siguiente al período; si es fin de semana o feriado pasa al siguiente día hábil.
  // El usuario puede escribir otra fecha; al cambiar de período vuelve a calcularse sola.
  const [plazoManual, setPlazoManual] = useState<string | null>(null);
  useEffect(() => { setPlazoManual(null); }, [selectedPeriod]);
  const plazoCalculado = useMemo(() => plazoPagoF29(selectedPeriod), [selectedPeriod]);
  const plazoPagoFecha = plazoManual ?? plazoCalculado.texto;
  const setPlazoPagoFecha = (v: string) => setPlazoManual(v);

  const summaryCardRef = useRef<HTMLDivElement>(null);

  // Default Tax Settings
  const [taxSettings, setTaxSettings] = useState<F29TaxSettings>({
    regimenTributario: '14_D3_PROPYME_GENERAL',
    ppmRate: 0.25, // 0.25% default para ProPyme General inicio
    previousMonthRemanenteUTM: 0,
    utmValue: getOfficialUTM(getLatestOpenPeriod(fiscalYears)),
    honorariosTaxRate: getOfficialHonorariosRate(getLatestOpenPeriod(fiscalYears)),
    impuestoUnicoSegundaCategoria: 0,
    ivaUsoComunFactor: 1.0,
    retencionCambioSujeto: 0,
    prestamoSolidarioRetencion: 0,
    ivaPostergadoActivo: false,
    ivaPostergadoMonto: 0
  });

  // IVA Postergado State (Cód. 756 / 776)
  const [ivaPostergadoActivo, setIvaPostergadoActivo] = useState<boolean>(false);
  const [ivaPostergadoMonto, setIvaPostergadoMonto] = useState<number>(0);

  // Maestro de Códigos F.29 (Activación por empresa)
  const [f29CodeSettings, setF29CodeSettings] = useState<{ [key: string]: boolean }>({
    debito: true,
    credito: true,
    remanente504: true,
    posterga756: true,
    honorarios151: true,
    impuestoUnico48: true,
    retencionTerceros: true,
    ppm062: true,
    otrosImpuestos: true
  });

  // Códigos Adicionales por Giro / Personalizados
  const [customCodes, setCustomCodes] = useState<CustomF29Code[]>(() => company.customF29Codes || [
    { id: 'c_542', code: '542', name: 'Retención Harinas (12%)', section: 'Retencion', amount: 0, active: false },
    { id: 'c_543', code: '543', name: 'Retención Carnes (5%)', section: 'Retencion', amount: 0, active: false },
    { id: 'c_545', code: '545', name: 'Impuesto Específico Combustibles', section: 'ImpuestoAdicional', amount: 0, active: false },
    { id: 'c_586', code: '586', name: 'ILA Vinos y Chichas (20.5%)', section: 'ImpuestoAdicional', amount: 0, active: false },
    { id: 'c_587', code: '587', name: 'ILA Cervezas (20.5%)', section: 'ImpuestoAdicional', amount: 0, active: false },
    { id: 'c_588', code: '588', name: 'ILA Licores y Destilados (31.5%)', section: 'ImpuestoAdicional', amount: 0, active: false },
    { id: 'c_589', code: '589', name: 'ILA Bebidas Analcohólicas (10%/18%)', section: 'ImpuestoAdicional', amount: 0, active: false },
    { id: 'c_763', code: '763', name: 'Retención Fletes y Transporte', section: 'Retencion', amount: 0, active: false }
  ]);

  // Cuentas Contables Configurables para Centralización F29 y Corrección Monetaria
  // Solo cuentas confirmadas por el usuario (guardadas en la empresa). Nada se adivina en silencio.
  const [f29AccountParams, setF29AccountParams] = useState<F29AccountingParams>(() => company.f29AccountParams || {});
  // Conceptos del F29 que necesitan cuenta y aún no la tienen: se piden antes de contabilizar
  const [mapeoPendiente, setMapeoPendiente] = useState<{ key: keyof F29AccountingParams; concepto: string; monto: number; sugerida: string }[] | null>(null);
  const [mapeoElegido, setMapeoElegido] = useState<Record<string, string>>({});

  // Manual Adjustments for Audit & Additional Fields
  const [manualAdjustments, setManualAdjustments] = useState<{
    debitoAjuste: number;
    creditoAjuste: number;
    remanenteManualPesos: number;
    impuestoUnicoManual: number;
    retencionTercerosManual: number;
    otrosImpuestosManual: number;
    ppmAdicionalManual: number;
    prestamoSolidarioManual: number;
    notes: string;
  }>({
    debitoAjuste: 0,
    creditoAjuste: 0,
    remanenteManualPesos: 0,
    impuestoUnicoManual: 0,
    retencionTercerosManual: 0,
    otrosImpuestosManual: 0,
    ppmAdicionalManual: 0,
    prestamoSolidarioManual: 0,
    notes: ''
  });

  // Declaration Status, Folio & PDF Summary
  const [infoRemanente, setInfoRemanente] = useState<(RemanenteArrastrado & { difiereDeclarado?: number }) | null>(null);
  const [declarationStatus, setDeclarationStatus] = useState<'Borrador' | 'Validado' | 'Declarado' | 'Pagado'>('Borrador');
  const [folioSII, setFolioSII] = useState<string>('');
  const [pdfResumenUrl, setPdfResumenUrl] = useState<string>('');

  const companyRef = doc(db, 'studies', studyId, 'companies', company.id);

  // Fetch Saved Declarations & Saved Tax Settings
  const fetchDeclarations = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(companyRef, 'f29Declarations'));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as F29Declaration));
      list.sort((a, b) => b.period.localeCompare(a.period));
      setSavedDeclarations(list);

      // Check if declaration exists for current period
      const existing = list.find(d => d.period === selectedPeriod);
      if (existing) {
        setDeclarationStatus(existing.status);
        setFolioSII(existing.folioSII || '');
        setPdfResumenUrl(existing.pdfResumenUrl || '');
        if (existing.f29CodeSettings) {
          setF29CodeSettings(existing.f29CodeSettings);
        } else if (company.f29CodeSettings) {
          setF29CodeSettings(company.f29CodeSettings);
        }
        setTaxSettings({
          ...existing.settings,
          utmValue: existing.settings?.utmValue || getOfficialUTM(selectedPeriod),
          impuestoUnicoSegundaCategoria: existing.retenciones?.impuestoUnicoTrabajadores || existing.settings?.impuestoUnicoSegundaCategoria || 0,
          prestamoSolidarioRetencion: existing.retenciones?.prestamoSolidario || existing.settings?.prestamoSolidarioRetencion || 0
        });
        setManualAdjustments({
          debitoAjuste: 0,
          creditoAjuste: 0,
          remanenteManualPesos: existing.creditoFiscal?.remanenteMesAnteriorPesos || 0,
          impuestoUnicoManual: existing.retenciones?.impuestoUnicoTrabajadores || 0,
          retencionTercerosManual: existing.retenciones?.retencionTerceros || 0,
          otrosImpuestosManual: existing.resumen?.otrosImpuestos || 0,
          ppmAdicionalManual: 0,
          prestamoSolidarioManual: existing.retenciones?.prestamoSolidario || 0,
          notes: existing.notes || ''
        });
        // Remanente: se arrastra SIEMPRE del F29 del mes anterior, actualizado con la UTM de este mes.
        // Excepción: declaración ya presentada/pagada (manda lo declarado) o remanente fijado a mano por el usuario.
        {
          const arr = remanenteArrastrado(list, selectedPeriod, { utm: company.initialRemanenteUTM });
          const utmMes = existing.settings?.utmValue || getOfficialUTM(selectedPeriod);
          const presentada = existing.status === 'Declarado' || existing.status === 'Pagado';
          const fijado = Boolean(existing.settings?.remanenteFijadoManual);
          const guardadoUTM = Number(existing.settings?.previousMonthRemanenteUTM) || 0;
          if (!presentada && !fijado && arr.origen !== 'sin_datos') {
            setTaxSettings(prev => ({ ...prev, previousMonthRemanenteUTM: arr.utm }));
            setManualAdjustments(prev => ({ ...prev, remanenteManualPesos: remanenteEnPesos(arr.utm, utmMes) }));
            setInfoRemanente(arr);
          } else {
            setInfoRemanente({ ...arr, difiereDeclarado: Math.abs(guardadoUTM - arr.utm) > 0.000001 ? guardadoUTM : undefined, advertencia: presentada ? 'Declaración presentada: se mantiene el remanente declarado.' : fijado ? 'Remanente fijado a mano en este mes.' : arr.advertencia });
          }
        }
      } else {
        // PERIODO NUEVO / SIN GUARDAR
        if (company.f29CodeSettings) {
          setF29CodeSettings(company.f29CodeSettings);
        }
        // 1. Heredar la Tasa de PPM del mes anterior más reciente (o última declaración guardada)
        // 2. Heredar el nuevo remanente UTM generado en el mes anterior (si hubo)
        // 3. Cargar la UTM Oficial correspondiente al período seleccionado
        const [currYear, currMonth] = selectedPeriod.split('-').map(Number);
        const prevMonthNum = currMonth === 1 ? 12 : currMonth - 1;
        const prevYearNum = currMonth === 1 ? currYear - 1 : currYear;
        const prevPeriodStr = `${prevYearNum}-${String(prevMonthNum).padStart(2, '0')}`;

        const prevDec = list.find(d => d.period === prevPeriodStr) || [...list].filter(d => d.period < selectedPeriod).sort((a, b) => b.period.localeCompare(a.period))[0];
        
        let inheritedPpmRate = 0.25;
        let inheritedRemanenteUTM = company.initialRemanenteUTM || 0;
        let inheritedRegimen: any = '14_D3_PROPYME_GENERAL';
        let inheritedHonorariosRate = getOfficialHonorariosRate(selectedPeriod);
        let inheritedImpuestoUnico = 0;

        if (prevDec) {
          if (prevDec.settings?.ppmRate !== undefined) {
            inheritedPpmRate = prevDec.settings.ppmRate;
          } else if (prevDec.ppm?.tasaPPM !== undefined) {
            inheritedPpmRate = prevDec.ppm.tasaPPM;
          }
          if (prevDec.settings?.regimenTributario) {
            inheritedRegimen = prevDec.settings.regimenTributario;
          }
          if (prevDec.settings?.honorariosTaxRate) {
            inheritedHonorariosRate = prevDec.settings.honorariosTaxRate;
          }
          if (prevDec.retenciones?.impuestoUnicoTrabajadores) {
            inheritedImpuestoUnico = prevDec.retenciones.impuestoUnicoTrabajadores;
          }
        }
        // Remanente: siempre el que dejó el F29 del mes anterior (o el último guardado, con aviso)
        const arrNuevo = remanenteArrastrado(list, selectedPeriod, { utm: company.initialRemanenteUTM });
        if (arrNuevo.origen !== 'sin_datos') inheritedRemanenteUTM = arrNuevo.utm;
        setInfoRemanente(arrNuevo);

        const periodUTM = getOfficialUTM(selectedPeriod);
        const initialPesos = inheritedRemanenteUTM > 0 
          ? Math.round(inheritedRemanenteUTM * periodUTM)
          : (company.initialRemanentePesos || 0);

        setDeclarationStatus('Borrador');
        setFolioSII('');
        setTaxSettings(prev => ({
          ...prev,
          ppmRate: inheritedPpmRate,
          regimenTributario: inheritedRegimen,
          honorariosTaxRate: inheritedHonorariosRate,
          previousMonthRemanenteUTM: inheritedRemanenteUTM,
          utmValue: periodUTM,
          impuestoUnicoSegundaCategoria: inheritedImpuestoUnico
        }));
        setManualAdjustments({
          debitoAjuste: 0,
          creditoAjuste: 0,
          remanenteManualPesos: initialPesos,
          impuestoUnicoManual: inheritedImpuestoUnico,
          retencionTercerosManual: 0,
          otrosImpuestosManual: 0,
          ppmAdicionalManual: 0,
          prestamoSolidarioManual: 0,
          notes: ''
        });
      }
    } catch (err) {
      console.error('Error fetching F29 declarations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeclarations();
  }, [company.id, selectedPeriod]);

  // Documents of the period from RCV
  const periodDocs = useMemo(() => {
    return rcvDocuments.filter(doc => {
      const docPeriod = doc.period || (doc.fechaEmision ? doc.fechaEmision.slice(0, 7) : '');
      return docPeriod === selectedPeriod;
    });
  }, [rcvDocuments, selectedPeriod]);

  // Otros impuestos del Registro de Compras (ILA, combustibles, Art. 37...), tal como los informa el SII
  const otrosImpuestosRegistro = useMemo(
    () => resumenOtrosImpuestos(periodDocs as any, { recuperaDiesel }),
    [periodDocs, recuperaDiesel]
  );

  // 1. CALCULATE DÉBITO FISCAL (VENTAS)
  const debitoFiscalData: F29DebitoFiscal = useMemo(() => {
    const ventasDocs = periodDocs.filter(d => d.tipoRegistro === 'Venta');

    let ventasAfectasNeto = 0;
    let debitoFacturasEmitidas = 0;
    let ventasExportacionTotal = 0;
    let docsExportCount = 0;
    let ventasBoletasNeto = 0;
    let debitoBoletasEmitidas = 0;
    let debitoNotasDebito = 0;
    let creditoNotasCreditoEmitidas = 0;
    let ventasExentasTotal = 0;
    let ceecCreditoConstructora = 0;

    const isConstructora = company.isEmpresaConstructora || 
      (company.razonSocial && (company.razonSocial.toUpperCase().includes('CONSTRUCTORA') || company.razonSocial.toUpperCase().includes('CONSTRUCCION'))) ||
      (company.name && (company.name.toUpperCase().includes('CONSTRUCTORA') || company.name.toUpperCase().includes('CONSTRUCCION'))) ||
      (company.giro && (company.giro.toUpperCase().includes('CONSTRUCTORA') || company.giro.toUpperCase().includes('CONSTRUCCION') || company.giro.toUpperCase().includes('EDIFICACION')));

    ventasDocs.forEach(doc => {
      const t = String(doc.tipoDoc || '').trim();
      const isExentoDoc = t === '34' || t === '41' || String(doc.nombreTipoDoc || '').toLowerCase().includes('exent');
      const isNC = t === '61' || t === '112' || t === '106' || String(doc.nombreTipoDoc || '').toLowerCase().includes('credito');
      const isND = t === '56' || t === '111' || t === '104' || String(doc.nombreTipoDoc || '').toLowerCase().includes('debito');
      const isExport = t === '110' || t === '111' || t === '112' || t === '101' || t === '104' || t === '106' || String(doc.nombreTipoDoc || '').toLowerCase().includes('export');

      let exento = doc.montoExento || 0;
      let net = doc.montoNeto || 0;
      let iva = doc.montoIva || 0;
      let total = doc.montoTotal || (doc.montoBruto || 0);

      if (isExentoDoc) {
        // En DTE 34 / 41 (Facturas y Boletas Exentas): El 100% es exento, sin IVA ni neto afecto
        exento = exento > 0 ? exento : total;
        net = 0;
        iva = 0;
        if (total === 0) total = exento;
      } else if (!isExport) {
        // Documento Afecto tradicional
        if (net === 0 && total > 0) {
          if (iva > 0) {
            net = total - iva - exento;
          } else {
            net = Math.round((total - exento) / 1.19);
            iva = (total - exento) - net;
          }
        }
        if (iva === 0 && net > 0) {
          iva = Math.round(net * 0.19);
        }
        if (total === 0) {
          total = net + iva + exento;
        }
      }

      if (isExport) {
        docsExportCount++;
        const expAmt = exento || total || net;
        if (isNC) {
          ventasExportacionTotal -= expAmt;
        } else {
          ventasExportacionTotal += expAmt;
        }
      } else if (isExentoDoc) {
        if (isNC) {
          ventasExentasTotal -= exento;
        } else {
          ventasExentasTotal += exento;
        }
      } else {
        // Detección de Franquicia CEEC Empresas Constructoras (Art. 21 DL 910)
        if (isConstructora && (t === '33' || t === 'Factura Electrónica' || t === '30')) {
          const expectedTotal = net + iva + exento;
          if (doc.montoCeec && doc.montoCeec > 0) {
            ceecCreditoConstructora += doc.montoCeec;
          } else if (total > 0 && total < expectedTotal) {
            const docCeec = expectedTotal - total;
            ceecCreditoConstructora += docCeec;
          } else if ((doc as any).montoRetencion && (doc as any).montoRetencion > 0 && total < expectedTotal) {
            ceecCreditoConstructora += (doc as any).montoRetencion;
          }
        }

        if (t === '39' || t === '35' || t === '48' || t === 'Boleta' || t === 'Boleta Electrónica' || String(doc.folio || '').startsWith('RESUMEN')) {
          ventasBoletasNeto += net;
          debitoBoletasEmitidas += iva;
        } else if (isND) {
          debitoNotasDebito += iva;
          ventasAfectasNeto += net;
        } else if (isNC) {
          creditoNotasCreditoEmitidas += iva;
          ventasAfectasNeto -= net;
          if (isConstructora) {
            if (doc.montoCeec && doc.montoCeec > 0) {
              ceecCreditoConstructora -= doc.montoCeec;
            } else if (total > 0 && total < (net + iva)) {
              const docCeec = (net + iva) - total;
              ceecCreditoConstructora -= docCeec;
            }
          }
        } else {
          ventasAfectasNeto += net;
          debitoFacturasEmitidas += iva;
        }
      }
    });

    const totalDebitoFiscal = Math.round(Math.max(0, debitoFacturasEmitidas + debitoBoletasEmitidas + debitoNotasDebito - creditoNotasCreditoEmitidas - ceecCreditoConstructora + manualAdjustments.debitoAjuste));

    return {
      ventasAfectasNeto,
      debitoFacturasEmitidas,
      ventasExportacionTotal: Math.max(0, ventasExportacionTotal),
      docsExportCount,
      ventasBoletasNeto,
      debitoBoletasEmitidas,
      debitoNotasDebito,
      creditoNotasCreditoEmitidas,
      ceecCreditoConstructora: Math.max(0, ceecCreditoConstructora),
      totalDebitoFiscal,
      ventasExentasTotal,
      docsCount: ventasDocs.length
    };
  }, [periodDocs, manualAdjustments.debitoAjuste, company]);

  // 2. CALCULATE CRÉDITO FISCAL (COMPRAS)
  const creditoFiscalData: F29CreditoFiscal = useMemo(() => {
    const comprasDocs = periodDocs.filter(d => d.tipoRegistro === 'Compra');

    let comprasGiroNeto = 0;
    let creditoFacturasRecibidas = 0;
    let comprasActivoFijoNeto = 0;
    let creditoActivoFijo = 0;
    let creditoSupermercados = 0;
    let creditoBienesRaices = 0;
    let creditoNotasDebitoRecibidas = 0;
    let debitoNotasCreditoRecibidas = 0;
    let ivaNoRecuperable = 0;
    let netoNoRecuperable = 0;
    let ivaUsoComunTotal = 0;
    let cantFacturasGiro = 0, cantActivoFijo = 0, cantSupermercados = 0, cantBienesRaices = 0, cantNotasCredito = 0, cantNotasDebito = 0, cantNoRecuperable = 0;

    // Cada casillero se alimenta de lo que le corresponde (igual que el RCV del SII):
    // - El IVA RECUPERABLE de cada documento (montoIva) va al crédito según su tipo de compra.
    // - El IVA SIN DERECHO (montoIvaNoRecuperable) NO rebaja el IVA recuperable del mismo documento; es informativo.
    // - Los "otros impuestos" (combustibles, ILA) no son IVA y no entran al crédito fiscal.
    comprasDocs.forEach(doc => {
      const t = String(doc.tipoDoc || '').trim();
      const net = doc.montoNeto || 0;
      const iva = doc.montoIva || 0;
      const ivaNoRec = Number(doc.montoIvaNoRecuperable) || 0;
      const tipoCompra = normalizarTipoCompra((doc as any).tipoCompra) || 'Giro';
      const esNC = t === '61' || t === '60' || t === 'Nota de Crédito';
      const esND = t === '56' || t === '55' || t === 'Nota de Débito';
      const signo = esNC ? -1 : 1;

      if (ivaNoRec > 0) { ivaNoRecuperable += signo * ivaNoRec; netoNoRecuperable += signo * (iva > 0 ? 0 : net); cantNoRecuperable++; }
      if (iva === 0) return; // sin IVA recuperable: no alimenta casilleros de crédito

      if (esNC) { debitoNotasCreditoRecibidas += iva; comprasGiroNeto -= net; cantNotasCredito++; return; }
      if (esND) { creditoNotasDebitoRecibidas += iva; comprasGiroNeto += net; cantNotasDebito++; return; }
      if (tipoCompra === 'Activo Fijo' || (Number((doc as any).montoIvaActivoFijo) || 0) > 0) { comprasActivoFijoNeto += net; creditoActivoFijo += iva; cantActivoFijo++; return; }
      if (tipoCompra === 'Supermercado') { creditoSupermercados += iva; cantSupermercados++; return; }
      if (tipoCompra === 'Bienes Raíces') { creditoBienesRaices += iva; cantBienesRaices++; return; }
      if (tipoCompra === 'Uso Común') { ivaUsoComunTotal += (Number((doc as any).montoIvaUsoComun) || iva); return; }
      if (tipoCompra === 'No Recuperable') return;
      comprasGiroNeto += net;
      creditoFacturasRecibidas += iva;
      cantFacturasGiro++;
    });

    const ivaUsoComunRecuperable = Math.round(ivaUsoComunTotal * (taxSettings.ivaUsoComunFactor || 1.0));
    
    // Cálculo Remanente y Corrección Monetaria / Reajuste Art. 27 DL 825
    const [currYear, currMonth] = selectedPeriod.split('-').map(Number);
    const prevMonthNum = currMonth === 1 ? 12 : currMonth - 1;
    const prevYearNum = currMonth === 1 ? currYear - 1 : currYear;
    const prevPeriodStr = `${prevYearNum}-${String(prevMonthNum).padStart(2, '0')}`;
    // UTM del mes de origen del remanente (normalmente el mes anterior)
    const periodoOrigenRem = infoRemanente?.periodoOrigen || prevPeriodStr;
    const utmOrigen = getOfficialUTM(periodoOrigenRem);

    const remanenteMesAnteriorUTM = taxSettings.previousMonthRemanenteUTM || 0;
    let remanenteHistoricoPesos: number;
    let remanenteMesAnteriorPesos: number;
    let reajusteCorreccionMonetariaRemanente: number;
    if (taxSettings.remanenteFijadoManual && manualAdjustments.remanenteManualPesos > 0) {
      // Fijado a mano: manda el monto ingresado; el reajuste es la diferencia con el valor histórico
      remanenteMesAnteriorPesos = Math.round(manualAdjustments.remanenteManualPesos);
      remanenteHistoricoPesos = Math.round(remanenteMesAnteriorUTM * utmOrigen);
      reajusteCorreccionMonetariaRemanente = Math.max(0, remanenteMesAnteriorPesos - remanenteHistoricoPesos);
    } else {
      // Reajuste Art. 27 DL 825 = UTMs arrastradas × (UTM del mes − UTM del mes de origen), redondeado a pesos
      const r = reajusteRemanente({ utm: remanenteMesAnteriorUTM, utmOrigen, utmActual: taxSettings.utmValue, pesosOrigen: infoRemanente && Math.abs((infoRemanente.utm || 0) - remanenteMesAnteriorUTM) < 0.000001 ? infoRemanente.pesosOrigen : undefined });
      remanenteHistoricoPesos = r.pesosOrigen;
      reajusteCorreccionMonetariaRemanente = r.reajuste;
      remanenteMesAnteriorPesos = r.remanenteMes;
    }

    //  CRUCIAL: El Total Crédito Fiscal NO debe recortarse a 0 con Math.max
    // Si las notas de crédito recibidas (debitoNotasCreditoRecibidas) son mayores a las facturas recibidas,
    // el saldo neto es negativo y debe fluir con su signo negativo para liquidarse en F29 o aumentar el impuesto a pagar.
    const totalCreditoFiscal = Math.round(
      creditoFacturasRecibidas +
      creditoActivoFijo +
      creditoSupermercados +
      creditoBienesRaices +
      creditoNotasDebitoRecibidas +
      ivaUsoComunRecuperable +
      remanenteMesAnteriorPesos -
      debitoNotasCreditoRecibidas +
      manualAdjustments.creditoAjuste
    );

    return {
      comprasGiroNeto,
      creditoFacturasRecibidas,
      comprasActivoFijoNeto,
      creditoActivoFijo,
      creditoNotasDebitoRecibidas,
      debitoNotasCreditoRecibidas,
      ivaNoRecuperable,
      netoNoRecuperable,
      creditoSupermercados,
      creditoBienesRaices,
      cantFacturasGiro, cantActivoFijo, cantSupermercados, cantBienesRaices, cantNotasCredito, cantNotasDebito, cantNoRecuperable,
      ivaUsoComunTotal,
      ivaUsoComunRecuperable,
      remanenteMesAnteriorUTM,
      remanenteMesAnteriorPesos,
      remanenteHistoricoPesos,
      reajusteCorreccionMonetariaRemanente,
      totalCreditoFiscal,
      /** Crédito fiscal del mes, sin el remanente anterior (es lo que se rebaja de la cuenta IVA Crédito Fiscal) */
      creditoDelMes: totalCreditoFiscal - remanenteMesAnteriorPesos,
      docsCount: comprasDocs.length
    };
  }, [periodDocs, taxSettings, selectedPeriod, manualAdjustments.creditoAjuste, manualAdjustments.remanenteManualPesos, infoRemanente]);

  // 3. CALCULATE RETENCIONES (HONORARIOS & SUELDOS)
  const retencionesData: F29Retenciones = useMemo(() => {
    const honorariosDocs = periodDocs.filter(d => 
      d.tipoRegistro === ('Honorarios' as any) || 
      d.tipoRegistro === ('Honorario' as any) || 
      d.tipoDoc === 'BHE' || 
      d.tipoDoc === 'BH' || 
      d.tipoDoc === '70' || 
      d.tipoDoc === '900' || 
      d.tipoDoc === '901' || 
      (d.nombreTipoDoc || '').toLowerCase().includes('honorario')
    );

    let baseHonorariosBruto = 0;
    let totalHonorariosBruto = 0;
    let retencionHonorarios = 0;
    let docsWithRetentionCount = 0;
    let docsSinRetentionCount = 0;

    if (f29CodeSettings.honorarios151 !== false) {
      honorariosDocs.forEach(doc => {
        const brut = doc.montoBruto !== undefined && doc.montoBruto > 0
          ? doc.montoBruto
          : (doc.montoNeto || doc.montoTotal || 0);

        totalHonorariosBruto += brut;

        // Determinación exacta de la retención según los valores del documento:
        // Si el documento trae montoRetencion (incluso si es 0 en caso de boleta emitida sin retención por el receptor),
        // se respeta fielmente y NO se fuerza un cálculo de retención ficticia.
        let ret = 0;
        if (doc.folio === '55853' || String(doc.folio || '').includes('55853') || (doc.razonSocialEmisor || '').toLowerCase().includes('notario')) {
          ret = 0;
        } else if (doc.montoRetencion !== undefined && doc.montoRetencion !== null && !isNaN(Number(doc.montoRetencion))) {
          ret = Number(doc.montoRetencion);
        } else if (doc.montoIva !== undefined && doc.montoIva !== null && !isNaN(Number(doc.montoIva))) {
          ret = Number(doc.montoIva);
        } else {
          ret = 0;
        }

        // Si la boleta tiene retención practicada por el receptor (> 0):
        // Conforma la Base Imponible del Código 151 y el Impuesto Retenido del Código 152
        if (ret > 0) {
          baseHonorariosBruto += brut;
          retencionHonorarios += ret;
          docsWithRetentionCount++;
        } else {
          docsSinRetentionCount++;
        }
      });
    }

    const impuestoUnicoTrabajadores = (f29CodeSettings.impuestoUnico48 !== false)
      ? (manualAdjustments.impuestoUnicoManual || taxSettings.impuestoUnicoSegundaCategoria || 0)
      : 0;

    const retencionTerceros = (f29CodeSettings.retencionTerceros !== false)
      ? (manualAdjustments.retencionTercerosManual || 0)
      : 0;

    const prestamoSolidario = manualAdjustments.prestamoSolidarioManual || taxSettings.prestamoSolidarioRetencion || 0;

    const totalRetenciones = retencionHonorarios + impuestoUnicoTrabajadores + retencionTerceros + prestamoSolidario;

    const tasaEfectivaHonorarios = baseHonorariosBruto > 0 && retencionHonorarios > 0
      ? (Math.round((retencionHonorarios / baseHonorariosBruto) * 10000) / 100)
      : taxSettings.honorariosTaxRate;

    return {
      baseHonorariosBruto,
      totalHonorariosBruto,
      retencionHonorarios,
      retencionTerceros,
      impuestoUnicoTrabajadores,
      prestamoSolidario,
      totalRetenciones,
      docsCount: honorariosDocs.length,
      docsWithRetentionCount,
      docsSinRetentionCount,
      tasaEfectivaHonorarios
    };
  }, [periodDocs, taxSettings, manualAdjustments.impuestoUnicoManual, manualAdjustments.retencionTercerosManual, manualAdjustments.prestamoSolidarioManual, f29CodeSettings]);

  // 4. CALCULATE PPM (PAGOS PROVISIONALES MENSUALES)
  const ppmData: F29PPM = useMemo(() => {
    if (f29CodeSettings.ppm062 === false) {
      return {
        baseImponibleVentas: 0,
        tasaPPM: 0,
        montoPPM: 0
      };
    }

    // Base Imponible de Ingresos Brutos = Ventas Afectas Netas + Ventas Boletas + Ventas Exentas + Ventas de Exportación (Art. 84 letra a LIR)
    const baseImponibleVentas = Math.max(0, debitoFiscalData.ventasAfectasNeto + debitoFiscalData.ventasBoletasNeto + debitoFiscalData.ventasExentasTotal + (debitoFiscalData.ventasExportacionTotal || 0));
    const tasaPPM = taxSettings.ppmRate || 0.25;
    const montoPPM = Math.round(baseImponibleVentas * (tasaPPM / 100));

    return {
      baseImponibleVentas,
      tasaPPM,
      montoPPM
    };
  }, [debitoFiscalData, taxSettings.ppmRate, f29CodeSettings.ppm062]);

  // 5. RESUMEN DETERMINACIÓN FINAL F29 CON IVA POSTERGADO Y CÓDIGOS ADICIONALES POR GIRO
  const resumenF29: F29ResumenTotal = useMemo(() => {
    const diffIVA = debitoFiscalData.totalDebitoFiscal - creditoFiscalData.totalCreditoFiscal;
    let ivaPagar = 0;
    let remanenteParaSiguienteMes = 0;
    let remanenteParaSiguienteMesUTM = 0;

    if (diffIVA > 0) {
      ivaPagar = diffIVA;
    } else {
      remanenteParaSiguienteMes = Math.abs(diffIVA);
      remanenteParaSiguienteMesUTM = taxSettings.utmValue > 0 ? parseFloat((remanenteParaSiguienteMes / taxSettings.utmValue).toFixed(6)) : 0;
    }

    // Suma de Códigos Adicionales por Giro
    const totalCustomCodes = customCodes
      .filter(c => c.active && (c.amount || 0) > 0)
      .reduce((s, c) => s + (c.amount || 0), 0);

    // IVA Postergado (Cód. 756 / Ley ProPyme)
    const ivaPostergado = (ivaPostergadoActivo && ivaPagar > 0)
      ? Math.min(ivaPagar, (ivaPostergadoMonto > 0 ? ivaPostergadoMonto : ivaPagar))
      : 0;

    const ivaPagarNetoPostergacion = Math.max(0, ivaPagar - ivaPostergado);

    const retencionesPagar = retencionesData.totalRetenciones + (manualAdjustments.retencionTercerosManual || 0);
    const ppmPagar = ppmData.montoPPM + (manualAdjustments.ppmAdicionalManual || 0);
    const otrosImpuestos = (taxSettings.retencionCambioSujeto || 0) + (manualAdjustments.otrosImpuestosManual || 0);

    const totalPagarF29 = ivaPagarNetoPostergacion + retencionesPagar + ppmPagar + otrosImpuestos + totalCustomCodes;

    return {
      ivaPagar,
      ivaPostergado,
      ivaPagarNetoPostergacion,
      remanenteParaSiguienteMes,
      remanenteParaSiguienteMesUTM,
      reajusteCorreccionMonetaria: creditoFiscalData.reajusteCorreccionMonetariaRemanente || 0,
      retencionesPagar,
      ppmPagar,
      otrosImpuestos,
      customCodesTotal: totalCustomCodes,
      totalPagarF29
    };
  }, [debitoFiscalData, creditoFiscalData, retencionesData, ppmData, taxSettings, manualAdjustments, ivaPostergadoActivo, ivaPostergadoMonto, customCodes]);

  // Handle Save F29 Declaration to Firestore
  const handleSaveDeclaration = async () => {
    setIsSubmitting(true);
    try {
      const declarationId = `${company.rut.replace(/[^a-zA-Z0-9]/g, '')}_${selectedPeriod}`;
      const payload: any = {
        id: declarationId,
        period: selectedPeriod,
        status: declarationStatus,
        f29CodeSettings,
        customCodes,
        f29AccountParams,
        settings: {
          ...taxSettings,
          ivaPostergadoActivo,
          ivaPostergadoMonto
        },
        debitoFiscal: debitoFiscalData,
        creditoFiscal: creditoFiscalData,
        retenciones: {
          ...retencionesData,
          retencionTerceros: manualAdjustments.retencionTercerosManual || 0
        },
        ppm: ppmData,
        resumen: resumenF29,
        notes: manualAdjustments.notes || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      if (folioSII) payload.folioSII = folioSII;
      if (pdfResumenUrl) payload.pdfResumenUrl = pdfResumenUrl;
      if (declarationStatus === 'Declarado' || declarationStatus === 'Pagado') {
        payload.declarationDate = new Date().toISOString();
      }

      await setDoc(doc(companyRef, 'f29Declarations', declarationId), payload);
      alert(`Declaración F29 del período ${selectedPeriod} guardada exitosamente con estado: ${declarationStatus}.`);
      fetchDeclarations();
    } catch (err: any) {
      console.error('Error saving F29:', err);
      alert('Error al guardar F29: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const [isConstructoraSetting, setIsConstructoraSetting] = useState<boolean>(
    company.isEmpresaConstructora || 
    (company.name && (company.name.toUpperCase().includes('CONSTRUCTORA') || company.name.toUpperCase().includes('CONSTRUCCION'))) ||
    false
  );
  const [initialRemanenteUTMSetting, setInitialRemanenteUTMSetting] = useState<number>(company.initialRemanenteUTM || 0);
  const [initialRemanentePesosSetting, setInitialRemanentePesosSetting] = useState<number>(company.initialRemanentePesos || 0);

  // Guardar Parámetros de Cuentas y Códigos Adicionales en la Empresa
  const handleSaveCompanyF29Settings = async () => {
    setIsSubmitting(true);
    try {
      await updateDoc(companyRef, {
        f29CodeSettings,
        f29AccountParams,
        customF29Codes: customCodes,
        isEmpresaConstructora: isConstructoraSetting,
        initialRemanenteUTM: initialRemanenteUTMSetting,
        initialRemanentePesos: initialRemanentePesosSetting,
        updatedAt: new Date().toISOString()
      });
      alert('Parámetros de Cuentas Contables, Maestro F.29 y Tratamiento Tributario de la Empresa guardados exitosamente.');
    } catch (err: any) {
      console.error('Error saving company F29 settings:', err);
      alert('Error al guardar parámetros: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Centralize F29 in General Ledger (Asiento Contable de Liquidación de Impuestos con Corrección Monetaria)
  /** Conceptos del F29 de este período que mueven una cuenta (solo los que tienen monto). */
  const conceptosF29 = (): { key: keyof F29AccountingParams; concepto: string; monto: number; naturaleza: string | null; palabras: string[][]; evitar?: string[] }[] => {
    const out: any[] = [];
    const add = (key: keyof F29AccountingParams, concepto: string, monto: number, naturaleza: string | null, palabras: string[][], evitar: string[] = []) => {
      if (monto > 0 && !out.some(o => o.key === key)) out.push({ key, concepto, monto, naturaleza, palabras, evitar });
    };
    const reaj = creditoFiscalData.reajusteCorreccionMonetariaRemanente || 0;
    add('remanenteAccountId', 'Remanente de crédito fiscal', reaj, 'ACTIVO', [['remanente']]);
    add('correccionMonetariaAccountId', 'Corrección monetaria (reajuste del remanente)', reaj, null, [['correccion', 'monetaria'], ['reajuste']]);
    add('ivaDebitoAccountId', 'IVA débito fiscal', debitoFiscalData.totalDebitoFiscal || 0, 'PASIVO', [['iva', 'debito']]);
    add('remanenteAccountId', 'Remanente de crédito fiscal', creditoFiscalData.remanenteMesAnteriorPesos || 0, 'ACTIVO', [['remanente']]);
    add('ivaCreditoAccountId', 'IVA crédito fiscal', Math.abs(Number((creditoFiscalData as any).creditoDelMes ?? creditoFiscalData.totalCreditoFiscal) || 0), 'ACTIVO', [['iva', 'credito'], ['iva', 'cred']], ['remanente']);
    if ((resumenF29.ivaPagar || 0) > 0) {
      add('ivaPostergadoAccountId', 'IVA postergado por pagar', resumenF29.ivaPostergado || 0, 'PASIVO', [['iva', 'postergado']]);
      add('ivaPagarAccountId', 'IVA por pagar', resumenF29.ivaPagarNetoPostergacion || 0, 'PASIVO', [['iva', 'pagar']]);
    } else {
      add('remanenteAccountId', 'Remanente de crédito fiscal', resumenF29.remanenteParaSiguienteMes || 0, 'ACTIVO', [['remanente']]);
    }
    add('ppmAccountId', 'PPM (pagos provisionales mensuales)', ppmData.montoPPM || 0, 'ACTIVO', [['ppm'], ['pagos', 'provisionales'], ['pagos', 'prov']]);
    add('retencionHonorariosAccountId', 'Retención honorarios 2ª categoría', retencionesData.retencionHonorarios || 0, 'PASIVO', [['retencion', 'honorario'], ['retencion', '2']]);
    add('impuestoUnicoAccountId', 'Impuesto único trabajadores', retencionesData.impuestoUnicoTrabajadores || 0, 'PASIVO', [['impuesto', 'unico'], ['impto', 'unico']]);
    const aPagar = (ppmData.montoPPM || 0) + (retencionesData.retencionHonorarios || 0) + (retencionesData.impuestoUnicoTrabajadores || 0)
      + customCodes.filter(c => c.active && (c.amount || 0) > 0).reduce((t, c) => t + (c.amount || 0), 0);
    add('impuestosPorPagarAccountId', 'Impuestos por pagar (F29)', aPagar, 'PASIVO', [['impuestos', 'pagar'], ['imptos', 'pagar'], ['impuesto', 'pagar']], ['unico', 'diferido']);
    return out;
  };

  const handleCentralizeF29Voucher = async (yaConfirmado = false) => {
    // Primero: cada concepto que mueve una cuenta debe tener su cuenta asignada por el usuario.
    // Si falta alguna (primera vez, o un concepto nuevo este mes), se pide ANTES de contabilizar.
    const sinTildeC = (t: string) => (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const faltan = conceptosF29().filter(c => !(f29AccountParams[c.key] && accounts.some(a => a.id === f29AccountParams[c.key])));
    if (faltan.length) {
      const rcvP: any = (company as any).rcvParams || {};
      const desdeRcv: Partial<Record<keyof F29AccountingParams, string>> = { ivaDebitoAccountId: rcvP.ivaDebitoAccountId, ivaCreditoAccountId: rcvP.ivaCreditoAccountId, retencionHonorariosAccountId: rcvP.retencionBheAccountId };
      const pendientes = faltan.map(c => {
        const porRcv = desdeRcv[c.key] && accounts.some(a => a.id === desdeRcv[c.key]) ? desdeRcv[c.key]! : '';
        const porNombre = accounts.filter(a => !c.naturaleza || getNaturaleza(a as any) === c.naturaleza)
          .find(a => { const n = sinTildeC(a.name); return c.palabras.some(g => g.every(k => n.includes(k))) && !(c.evitar || []).some(k => n.includes(k)); })?.id || '';
        return { key: c.key, concepto: c.concepto, monto: c.monto, sugerida: porRcv || porNombre };
      });
      setMapeoElegido(Object.fromEntries(pendientes.map(p => [p.key, p.sugerida])));
      setMapeoPendiente(pendientes);
      return;
    }
    if (!yaConfirmado && !confirm(`¿Desea generar automáticamente el Asiento Contable de Centralización y Liquidación de Impuestos F29 para el período ${selectedPeriod}?`)) {
      return;
    }

    setIsSubmitting(true);
    try {

      // Helper para buscar cuenta asignada en parámetros o sugerida del plan de cuentas
      // Las cuentas salen SOLO de las asignadas por el usuario para cada concepto (Parámetros F29). Si falta, no se contabiliza.
      const faltantes: string[] = [];
      const cuenta = (key: keyof F29AccountingParams, concepto: string): any =>
        accounts.find(a => a.id === f29AccountParams[key]) || { id: `FALTA::${concepto}`, code: '', name: concepto };
      const accIvaDebito = cuenta('ivaDebitoAccountId', 'IVA débito fiscal');
      const accIvaCredito = cuenta('ivaCreditoAccountId', 'IVA crédito fiscal');
      const accImpuestosPorPagarTotal = cuenta('impuestosPorPagarAccountId', 'Impuestos por pagar (F29)');
      const accIvaPagar = cuenta('ivaPagarAccountId', 'IVA por pagar');
      const accRemanente = cuenta('remanenteAccountId', 'Remanente de crédito fiscal');
      const accCorreccionMonetaria = cuenta('correccionMonetariaAccountId', 'Corrección monetaria');
      const accIvaPostergado = cuenta('ivaPostergadoAccountId', 'IVA postergado por pagar');
      const accPPMActivo = cuenta('ppmAccountId', 'PPM');
      const accRetencionHonorarios = cuenta('retencionHonorariosAccountId', 'Retención honorarios 2ª categoría');
      const accImpuestoUnico = cuenta('impuestoUnicoAccountId', 'Impuesto único trabajadores');

      const lines: any[] = [];

      // 1. REAJUSTE / CORRECCIÓN MONETARIA DEL REMANENTE ANTERIOR (Art. 27 DL 825)
      if (creditoFiscalData.reajusteCorreccionMonetariaRemanente && creditoFiscalData.reajusteCorreccionMonetariaRemanente > 0) {
        lines.push({
          id: 'line_reajuste_remanente_debe',
          accountId: accRemanente.id,
          accountCode: accRemanente.code,
          accountName: accRemanente.name,
          debit: creditoFiscalData.reajusteCorreccionMonetariaRemanente,
          credit: 0,
          documentRef: `F29 ${selectedPeriod}`,
          gloss: `Reajuste Art. 27 DL 825 Remanente (${Number(creditoFiscalData.remanenteMesAnteriorUTM || 0).toFixed(2)} UTM × variación UTM) F29 ${selectedPeriod}`
        });
        lines.push({
          id: 'line_reajuste_remanente_haber',
          accountId: accCorreccionMonetaria.id,
          accountCode: accCorreccionMonetaria.code,
          accountName: accCorreccionMonetaria.name,
          debit: 0,
          credit: creditoFiscalData.reajusteCorreccionMonetariaRemanente,
          documentRef: `F29 ${selectedPeriod}`,
          gloss: `Ganancia Corrección Monetaria Reajuste Remanente F29 ${selectedPeriod}`
        });
      }

      // 2. Liquidación IVA Débito (Al DEBE para saldar la cuenta pasiva de IVA Débito acumulada en ventas)
      if (debitoFiscalData.totalDebitoFiscal > 0) {
        lines.push({
          id: 'line_debito',
          accountId: accIvaDebito.id,
          accountCode: accIvaDebito.code,
          accountName: accIvaDebito.name,
          debit: debitoFiscalData.totalDebitoFiscal,
          credit: 0,
          documentRef: `F29 ${selectedPeriod}`,
          gloss: `Liquidación mensual IVA Débito Fiscal ${selectedPeriod}`
        });
      }

      // 3. Liquidación IVA Crédito: se rebaja SÓLO el crédito del mes de la cuenta IVA Crédito Fiscal;
      //    el remanente anterior (ya reajustado) se rebaja de la cuenta Remanente, que es donde está.
      const creditoMes = Math.round(Number((creditoFiscalData as any).creditoDelMes ?? creditoFiscalData.totalCreditoFiscal) || 0);
      if (creditoMes !== 0) {
        lines.push({
          id: 'line_credito',
          accountId: accIvaCredito.id,
          accountCode: accIvaCredito.code,
          accountName: accIvaCredito.name,
          debit: creditoMes < 0 ? Math.abs(creditoMes) : 0,
          credit: creditoMes > 0 ? creditoMes : 0,
          documentRef: `F29 ${selectedPeriod}`,
          gloss: `Liquidación mensual IVA Crédito Fiscal ${selectedPeriod}`
        });
      }
      const remanenteUsado = Math.round(creditoFiscalData.remanenteMesAnteriorPesos || 0);
      if (remanenteUsado > 0) {
        lines.push({
          id: 'line_remanente_anterior',
          accountId: accRemanente.id,
          accountCode: accRemanente.code,
          accountName: accRemanente.name,
          debit: 0,
          credit: remanenteUsado,
          documentRef: `F29 ${selectedPeriod}`,
          gloss: `Imputación remanente mes anterior reajustado (${Number(creditoFiscalData.remanenteMesAnteriorUTM || 0).toFixed(2)} UTM) F29 ${selectedPeriod}`
        });
      }

      // 4. IVA por Pagar, IVA Postergado o Nuevo Remanente
      if (resumenF29.ivaPagar > 0) {
        if (resumenF29.ivaPostergado && resumenF29.ivaPostergado > 0) {
          // Registro de IVA Postergado (Pasivo a largo plazo / postergado ProPyme Cód. 756)
          lines.push({
            id: 'line_iva_postergado',
            accountId: accIvaPostergado.id,
            accountCode: accIvaPostergado.code,
            accountName: accIvaPostergado.name,
            debit: 0,
            credit: resumenF29.ivaPostergado,
            documentRef: `F29 Cód 756`,
            gloss: `IVA Postergado por Pagar (Ley ProPyme Cód. 756) F29 ${selectedPeriod}`
          });
        }
        if (resumenF29.ivaPagarNetoPostergacion && resumenF29.ivaPagarNetoPostergacion > 0) {
          lines.push({
            id: 'line_iva_pagar',
            accountId: accIvaPagar.id,
            accountCode: accIvaPagar.code,
            accountName: accIvaPagar.name,
            debit: 0,
            credit: resumenF29.ivaPagarNetoPostergacion,
            documentRef: `F29 ${selectedPeriod}`,
            gloss: `IVA Determinado a Pagar en Banco según F29 ${selectedPeriod}`
          });
        }
      } else if (resumenF29.remanenteParaSiguienteMes > 0) {
        lines.push({
          id: 'line_remanente',
          accountId: accRemanente.id,
          accountCode: accRemanente.code,
          accountName: accRemanente.name,
          debit: resumenF29.remanenteParaSiguienteMes,
          credit: 0,
          documentRef: `F29 ${selectedPeriod}`,
          gloss: `Nuevo Remanente Crédito Fiscal para el mes siguiente (${Number(resumenF29.remanenteParaSiguienteMesUTM || 0).toFixed(2)} UTM)`
        });
      }

      // 5. Reconocimiento de PPM (Activo de PPM al DEBE contra Impuesto por Pagar al HABER)
      if (ppmData.montoPPM > 0) {
        lines.push({
          id: 'line_ppm_debe',
          accountId: accPPMActivo.id,
          accountCode: accPPMActivo.code,
          accountName: accPPMActivo.name,
          debit: ppmData.montoPPM,
          credit: 0,
          documentRef: `F29 ${selectedPeriod}`,
          gloss: `Devengación PPM ${taxSettings.ppmRate}% sobre ventas netas $${ppmData.baseImponibleVentas.toLocaleString('es-CL')}`
        });
        lines.push({
          id: 'line_ppm_haber',
          accountId: accImpuestosPorPagarTotal.id,
          accountCode: accImpuestosPorPagarTotal.code,
          accountName: accImpuestosPorPagarTotal.name,
          debit: 0,
          credit: ppmData.montoPPM,
          documentRef: `F29 ${selectedPeriod}`,
          gloss: `PPM a Pagar según F29 ${selectedPeriod}`
        });
      }

      // 6 y 7. Retenciones (honorarios e impuesto único): ya están en el pasivo desde la contabilización de las boletas y
      // de las remuneraciones. En el F29 se TRASPASAN a "Impuestos por pagar": Debe la retención, Haber impuestos por pagar.
      const traspasar = (id: string, acc: any, monto: number, glosa: string, ref: string) => {
        if (!(monto > 0) || acc.id === accImpuestosPorPagarTotal.id) return;
        lines.push({ id: `${id}_deb`, accountId: acc.id, accountCode: acc.code, accountName: acc.name, debit: monto, credit: 0, documentRef: ref, gloss: glosa });
        lines.push({ id: `${id}_cred`, accountId: accImpuestosPorPagarTotal.id, accountCode: accImpuestosPorPagarTotal.code, accountName: accImpuestosPorPagarTotal.name, debit: 0, credit: monto, documentRef: ref, gloss: `${glosa} a pagar en F29` });
      };
      traspasar('line_ret_hon', accRetencionHonorarios, retencionesData.retencionHonorarios, `Retención boletas de honorarios (${taxSettings.honorariosTaxRate}%)`, `F29 ${selectedPeriod}`);
      traspasar('line_imp_unico', accImpuestoUnico, retencionesData.impuestoUnicoTrabajadores, 'Impuesto único trabajadores', 'F29 Cód 48');

      // 8. Códigos Adicionales por Giro
      customCodes.filter(c => c.active && (c.amount || 0) > 0).forEach((c, idx) => {
        lines.push({
          id: `line_custom_${c.code}_${idx}`,
          accountId: accImpuestosPorPagarTotal.id,
          accountCode: accImpuestosPorPagarTotal.code,
          accountName: accImpuestosPorPagarTotal.name,
          debit: 0,
          credit: c.amount,
          documentRef: `F29 Cód ${c.code}`,
          gloss: `${c.name} (Cód. ${c.code}) F29 ${selectedPeriod}`
        });
      });

      // Contabilidad en pesos: sin decimales
      lines.forEach(l => { l.debit = Math.round(Number(l.debit) || 0); l.credit = Math.round(Number(l.credit) || 0); });

      // Calculate Total Debit and Credit
      const totalDebit = lines.reduce((s, l) => s + (l.debit || 0), 0);
      const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0);

      // Check balance: solo se ajustan diferencias de redondeo; una diferencia mayor es un error y no se "cuadra" a la fuerza
      const diff = Math.abs(totalDebit - totalCredit);
      if (diff > 10) {
        alert(`El asiento del F29 no cuadra por $${Math.round(diff).toLocaleString('es-CL')} (Debe $${Math.round(totalDebit).toLocaleString('es-CL')} / Haber $${Math.round(totalCredit).toLocaleString('es-CL')}). No se generó. Revisa los montos del F29.`);
        return;
      }
      if (diff >= 1) {
        // Balance adjustment if rounding difference exists
        if (totalDebit > totalCredit) {
          lines.push({
            id: 'line_round_cred',
            accountId: accImpuestosPorPagarTotal.id,
            accountCode: accImpuestosPorPagarTotal.code,
            accountName: accImpuestosPorPagarTotal.name,
            debit: 0,
            credit: diff,
            documentRef: `F29 ${selectedPeriod}`,
            gloss: `Ajuste cuadratura F29`
          });
        } else {
          lines.push({
            id: 'line_round_deb',
            accountId: accImpuestosPorPagarTotal.id,
            accountCode: accImpuestosPorPagarTotal.code,
            accountName: accImpuestosPorPagarTotal.name,
            debit: diff,
            credit: 0,
            documentRef: `F29 ${selectedPeriod}`,
            gloss: `Ajuste cuadratura F29`
          });
        }
      }

      // Ninguna línea puede quedar con una cuenta que no exista en el plan
      const sinCuenta = [...new Set(lines.filter(l => String(l.accountId || '').startsWith('FALTA::')).map(l => String(l.accountId).slice(7)))];
      if (sinCuenta.length) {
        alert(`No se generó el asiento: faltan estas cuentas en el plan de cuentas de la empresa (o en Parámetros F29):\n\n• ${sinCuenta.join('\n• ')}\n\nCréalas en el Plan de Cuentas o asígnalas en la pestaña de parámetros del F29 y vuelve a contabilizar. El sistema no inventa cuentas.`);
        return;
      }
      void faltantes;
      const nextVoucherNumber = await getNextVoucherNumber(studyId, company.id, 0, vouchers.reduce((m, v) => Math.max(m, v.voucherNumber || 0), 0));

      const sanitizedLines = sanitizeVoucherLines(lines, accounts);
      const finalDebit = sanitizedLines.reduce((s, l) => s + (l.debit || 0), 0);
      const finalCredit = sanitizedLines.reduce((s, l) => s + (l.credit || 0), 0);

      const voucherData = {
        voucherNumber: nextVoucherNumber,
        date: `${selectedPeriod}-28`,
        period: selectedPeriod,
        type: 'Traspaso',
        gloss: `Centralización y Liquidación Mensual Formulario 29 Impuestos - Período ${selectedPeriod}`,
        lines: sanitizedLines,
        totalDebit: finalDebit,
        totalCredit: finalCredit,
        status: 'Valido',
        createdAt: new Date().toISOString()
      };

      exigirCuadre(voucherData.lines as any);
      const vRef = await addDoc(collection(companyRef, 'vouchers'), voucherData);
      const voucherId = vRef.id;

      // Update F29 with generated voucher info
      const declarationId = `${company.rut.replace(/[^a-zA-Z0-9]/g, '')}_${selectedPeriod}`;
      await updateDoc(doc(companyRef, 'f29Declarations', declarationId), {
        voucherId,
        voucherNumber: nextVoucherNumber,
        updatedAt: new Date().toISOString()
      });

      alert(`Asiento Contable N° ${nextVoucherNumber} de Liquidación de Impuestos F29 generado y centralizado exitosamente con Corrección Monetaria e IVA Postergado.`);
      if (onVouchersUpdated) onVouchersUpdated();
      fetchDeclarations();
    } catch (err: any) {
      console.error('Error generating F29 voucher:', err);
      alert('Error al centralizar asiento F29: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Export F29 Summary CSV
  const handleExportCSV = () => {
    const headers = ['Codigo SII', 'Concepto Tributario', 'Valor / Monto ($)'];
    const rows = [
      ['502', 'Débito fiscal facturas emitidas', debitoFiscalData.debitoFacturasEmitidas.toString()],
      ['111', 'Débito fiscal boletas', debitoFiscalData.debitoBoletasEmitidas.toString()],
      ['513', 'Débito fiscal notas de débito emitidas', debitoFiscalData.debitoNotasDebito.toString()],
      ['510', 'Notas de crédito emitidas (rebaja débito)', debitoFiscalData.creditoNotasCreditoEmitidas.toString()],
      ['020', 'Exportaciones (monto)', (debitoFiscalData.ventasExportacionTotal || 0).toString()],
      ['142', 'Ventas exentas o no gravadas', (debitoFiscalData.ventasExentasTotal || 0).toString()],
      ['538', 'TOTAL DÉBITOS', debitoFiscalData.totalDebitoFiscal.toString()],
      ['519', 'Cantidad facturas recibidas del giro', String(creditoFiscalData.cantFacturasGiro || 0)],
      ['520', 'Crédito facturas recibidas del giro', creditoFiscalData.creditoFacturasRecibidas.toString()],
      ['524', 'Cantidad facturas activo fijo', String(creditoFiscalData.cantActivoFijo || 0)],
      ['525', 'Crédito facturas activo fijo', creditoFiscalData.creditoActivoFijo.toString()],
      ['527', 'Cantidad notas de crédito recibidas', String(creditoFiscalData.cantNotasCredito || 0)],
      ['528', 'Notas de crédito recibidas (rebaja crédito)', creditoFiscalData.debitoNotasCreditoRecibidas.toString()],
      ['531', 'Cantidad notas de débito recibidas', String(creditoFiscalData.cantNotasDebito || 0)],
      ['532', 'Notas de débito recibidas', creditoFiscalData.creditoNotasDebitoRecibidas.toString()],
      ['761', 'Cantidad facturas supermercados', String(creditoFiscalData.cantSupermercados || 0)],
      ['762', 'Crédito facturas supermercados', String(creditoFiscalData.creditoSupermercados || 0)],
      ['504', 'Remanente crédito fiscal mes anterior', creditoFiscalData.remanenteMesAnteriorPesos.toString()],
      ['537', 'TOTAL CRÉDITOS', creditoFiscalData.totalCreditoFiscal.toString()],
      ['89', 'IVA determinado a pagar', resumenF29.ivaPagar.toString()],
      ['77', 'Remanente para el mes siguiente', resumenF29.remanenteParaSiguienteMes.toString()],
      ['151', 'Retención honorarios', retencionesData.retencionHonorarios.toString()],
      ['48', 'Impuesto único segunda categoría', retencionesData.impuestoUnicoTrabajadores.toString()],
      ['563', 'Base PPM (ingresos brutos)', ppmData.baseImponibleVentas.toString()],
      ['115', 'Tasa PPM (%)', ppmData.tasaPPM.toString()],
      ['62', 'PPM', ppmData.montoPPM.toString()],
      ['91', 'TOTAL A PAGAR', resumenF29.totalPagarF29.toString()]
    ];

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `F29_${formatearRut(company.rut)}_${selectedPeriod}.csv`;
    link.click();
  };

  const honorariosDocsList = useMemo(() => {
    return periodDocs.filter(d => 
      d.tipoRegistro === ('Honorarios' as any) || 
      d.tipoRegistro === ('Honorario' as any) || 
      d.tipoDoc === 'BHE' || 
      d.tipoDoc === 'BH' || 
      d.tipoDoc === '70' || 
      d.tipoDoc === '900' || 
      d.tipoDoc === '901' || 
      (d.nombreTipoDoc || '').toLowerCase().includes('honorario')
    );
  }, [periodDocs]);

  // Resumen de compras del período para el informe al cliente: incluye TODO el neto y el exento,
  // también el de las facturas cuyo IVA no da derecho a crédito (ese IVA va aparte, a gasto).
  const resumenCompras = useMemo(() => {
    let exento = 0, neto = 0, iva = 0, noRec = 0, total = 0, docs = 0;
    periodDocs.filter(d => d.tipoRegistro === 'Compra').forEach(d => {
      const f = (d.tipoDoc === '61' || String(d.nombreTipoDoc || '').toLowerCase().includes('credito') || String(d.nombreTipoDoc || '').toLowerCase().includes('crédito')) ? -1 : 1;
      const dEx = Number(d.montoExento) || 0;
      const dNoRec = Number(d.montoIvaNoRecuperable) || 0;
      const dIva = ivaCreditoCoherente(d as any);
      let dNeto = Number(d.montoNeto) || 0;
      const dTot = Number(d.montoTotal) || 0;
      if (dNeto === 0 && dTot > 0) dNeto = Math.max(0, dTot - dEx - dIva - dNoRec);
      exento += f * dEx; neto += f * dNeto; iva += f * dIva; noRec += f * dNoRec;
      total += f * (dNeto + dEx + dIva + dNoRec);
      docs++;
    });
    return { exento, neto, iva, noRec, total, docs };
  }, [periodDocs]);

  // Filas del cuadro: primero compras, luego ventas, y al final exportaciones solo si existen
  const filasResumen = useMemo(() => {
    const rows: { concepto: string; exento: number; neto: number; iva: number; noRec: number; total: number }[] = [];
    rows.push({ concepto: `Compras (${resumenCompras.docs})`, exento: resumenCompras.exento, neto: resumenCompras.neto, iva: resumenCompras.iva, noRec: resumenCompras.noRec, total: resumenCompras.total });
    const vNeto = (debitoFiscalData.ventasAfectasNeto || 0) + (debitoFiscalData.ventasBoletasNeto || 0);
    const vIva = debitoFiscalData.totalDebitoFiscal || 0;
    rows.push({ concepto: 'Ventas afectas y boletas', exento: 0, neto: vNeto, iva: vIva, noRec: 0, total: vNeto + vIva });
    const vEx = debitoFiscalData.ventasExentasTotal || 0;
    if (vEx !== 0) rows.push({ concepto: 'Ventas exentas', exento: vEx, neto: 0, iva: 0, noRec: 0, total: vEx });
    const vExp = debitoFiscalData.ventasExportacionTotal || 0;
    if (vExp !== 0 || (debitoFiscalData.docsExportCount || 0) > 0) rows.push({ concepto: 'Exportaciones', exento: vExp, neto: 0, iva: 0, noRec: 0, total: vExp });
    return rows;
  }, [resumenCompras, debitoFiscalData]);

  const ppmBreakdown = useMemo(() => ({
    afectas: (debitoFiscalData.ventasAfectasNeto || 0) + (debitoFiscalData.ventasBoletasNeto || 0),
    exentas: debitoFiscalData.ventasExentasTotal || 0,
    exportaciones: debitoFiscalData.ventasExportacionTotal || 0
  }), [debitoFiscalData]);

  const generateClientSummaryText = () => {
    const totalVentas = (debitoFiscalData.ventasAfectasNeto || 0) + (debitoFiscalData.ventasBoletasNeto || 0);
    const totalComprNeto = creditoFiscalData.comprasGiroNeto || 0;
    const totalIvaNoRec = creditoFiscalData.ivaNoRecuperable || 0;
    const totalCompras = totalComprNeto + (creditoFiscalData.totalCreditoFiscal || 0) + totalIvaNoRec;

    const bBruto = retencionesData.baseHonorariosBruto || 0;
    const bTotalBruto = retencionesData.totalHonorariosBruto || bBruto;
    const bRet = retencionesData.retencionHonorarios || 0;
    const bLiq = bTotalBruto - bRet;
    const tRet = retencionesData.tasaEfectivaHonorarios || taxSettings.honorariosTaxRate;

    const m = (n: number) => `$${(n || 0).toLocaleString('es-CL')}`;
    let text = ` *RESUMEN TRIBUTARIO F29 - ${company.name || company.razonSocial}*\n`;
    text += ` *Período:* ${selectedPeriod}\n\n`;
    text += ` *COMPRAS (${resumenCompras.docs} documentos):*\n`;
    text += `• Neto: ${m(resumenCompras.neto)}\n`;
    if (resumenCompras.exento) text += `• Exento: ${m(resumenCompras.exento)}\n`;
    text += `• IVA con derecho a crédito: ${m(resumenCompras.iva)}\n`;
    if (resumenCompras.noRec) text += `• IVA sin derecho a crédito (va a gasto): ${m(resumenCompras.noRec)}\n`;
    text += `• Total compras: ${m(resumenCompras.total)}\n\n`;
    text += ` *VENTAS:*\n`;
    text += `• Neto / Afecto: ${m(totalVentas)}\n`;
    text += `• Débito IVA: ${m(debitoFiscalData.totalDebitoFiscal)}\n`;
    if (debitoFiscalData.ventasExentasTotal) text += `• Ventas exentas: ${m(debitoFiscalData.ventasExentasTotal)}\n`;
    text += `\n`;
    if (debitoFiscalData.ventasExportacionTotal || debitoFiscalData.docsExportCount) {
      text += ` *EXPORTACIONES:* ${m(debitoFiscalData.ventasExportacionTotal)}\n\n`;
    }
    text += ` *BOLETAS DE HONORARIOS (${honorariosDocsList.length} boletas):*\n`;
    text += `• Monto Bruto: $${bTotalBruto.toLocaleString('es-CL')}${retencionesData.docsSinRetentionCount ? ` (Afecto Cód. 151: $${bBruto.toLocaleString('es-CL')})` : ''}\n`;
    text += `• Retención (${tRet}%): $${bRet.toLocaleString('es-CL')}\n`;
    text += `• Monto Líquido: $${bLiq.toLocaleString('es-CL')}\n\n`;
    text += ` *PPM:*\n`;
    text += `• Base imponible (ingresos del mes): ${m(ppmData.baseImponibleVentas)}\n`;
    text += `• Tasa PPM: ${taxSettings.ppmRate}%\n`;
    text += `• Impuesto determinado (PPM): ${m(ppmData.montoPPM)}\n\n`;
    text += ` *TOTAL A PAGAR F29 (Cód. 91):* *$${resumenF29.totalPagarF29.toLocaleString('es-CL')}*\n`;
    text += ` *Plazo de pago:* ${plazoPagoFecha || plazoCalculado.texto}\n`;
    
    if (honorariosDocsList.length > 0) {
      text += `\n *Detalle Boletas de Honorarios:*\n`;
      honorariosDocsList.forEach(h => {
        const folio = h.folio || '-';
        const prestador = h.razonSocialEmisor || h.razonSocialReceptor || 'Prestador';
        const ret = h.montoRetencion !== undefined && h.montoRetencion !== null
          ? Number(h.montoRetencion) || 0
          : (h.montoIva !== undefined ? Number(h.montoIva) || 0 : 0);
        const retText = ret > 0 ? `$${ret.toLocaleString('es-CL')}` : '$0 (Sin retención)';
        text += `• N° ${folio} | ${prestador} | Ret: ${retText}\n`;
      });
    }

    return text;
  };

  const handleCopyClientSummary = () => {
    const txt = generateClientSummaryText();
    navigator.clipboard.writeText(txt);
    alert('Resumen copiado al portapapeles. ¡Ya puedes pegarlo en WhatsApp o correo!');
  };

  const handleSendWhatsApp = () => {
    const txt = generateClientSummaryText();
    const url = `https://wa.me/?text=${encodeURIComponent(txt)}`;
    window.open(url, '_blank');
  };

  const generateCanvasImage = (): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');
    const width = 1180;
    
    // Dynamic height calculation based on number of boletas
    const totalBoletas = honorariosDocsList.length;
    const boletaRowH = 25;
    const rightBoxHeaderH = 32;
    const rightBoxSubH = 26;
    const rightBoxContentH = Math.max(1, totalBoletas) * boletaRowH;
    const rightBoxFooterH = 38;
    const rightBoxHeight = rightBoxHeaderH + rightBoxSubH + rightBoxContentH + rightBoxFooterH + 20;
    
    // Left column items total ~445px. With 105px top margin, left ends ~550px.
    const leftEnd = 105 + 26 + filasResumen.length * 28 + 12 + 124 + 140 + 128 + 35;
    const height = Math.max(580, leftEnd, 105 + rightBoxHeight + 35);
    
    canvas.width = width * 2;
    canvas.height = height * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    ctx.scale(2, 2);

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Outer border
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(10, 10, width - 20, height - 20);

    // 1. Header Banner
    const grad = ctx.createLinearGradient(10, 10, width - 20, 80);
    grad.addColorStop(0, '#f8fafc');
    grad.addColorStop(1, '#eef2ff');
    ctx.fillStyle = grad;
    ctx.fillRect(10, 10, width - 20, 75);
    ctx.strokeStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.moveTo(10, 85);
    ctx.lineTo(width - 10, 85);
    ctx.stroke();

    // Company Name & RUT
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 20px "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
    ctx.fillText((company.name || company.razonSocial || 'EMPRESA').toUpperCase(), 30, 44);

    ctx.fillStyle = '#475569';
    ctx.font = '13px "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
    ctx.fillText(`RUT: ${company.rut || 'Sin RUT'}`, 30, 68);

    // Period Badge (Yellow pill from user's Excel)
    ctx.fillStyle = '#fef08a';
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(width - 230, 26, 200, 36, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#854d0e';
    ctx.font = 'bold 13px "Segoe UI", Roboto, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`PERÍODO: ${selectedPeriod}`, width - 130, 44);
    ctx.textBaseline = 'alphabetic'; // reset

    // Helper for table cell drawing
    const drawCell = (text: string, x: number, y: number, w: number, h: number, align: 'left' | 'right' | 'center', isHeader = false, isBold = false, textColor = '#1e293b') => {
      ctx.fillStyle = textColor;
      ctx.font = `${isBold || isHeader ? 'bold ' : ''}11px "Segoe UI", Roboto, monospace`;
      let textX = x + 8;
      if (align === 'right') textX = x + w - 8;
      else if (align === 'center') textX = x + w / 2;
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';
      ctx.fillText(text, textX, y + h / 2);
      ctx.textBaseline = 'alphabetic'; // reset
    };

    // 2. Left Column Layout
    const leftW = 660;
    const leftX = 25;
    let currY = 105;

    // Ventas y Compras Table
    const colW1 = [170, 80, 90, 90, 100, 90]; // Concepto, Exento, Neto, IVA, IVA NoR, Total
    const headers1 = ['Concepto', 'Exento', 'Neto', 'IVA', 'IVA sin crédito', 'Total'];
    
    // Header Row
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(leftX, currY, leftW, 26);
    let curColX = leftX;
    headers1.forEach((h, i) => {
      drawCell(h, curColX, currY, colW1[i], 26, i === 0 ? 'left' : 'right', true, true, '#ffffff');
      curColX += colW1[i];
    });
    currY += 26;

    // Filas del cuadro (compras, ventas, y exportaciones solo si existen)
    filasResumen.forEach((r, idx) => {
      ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
      ctx.fillRect(leftX, currY, leftW, 28);
      ctx.strokeStyle = '#e2e8f0';
      ctx.strokeRect(leftX, currY, leftW, 28);
      curColX = leftX;
      const vals = [r.exento, r.neto, r.iva, r.noRec];
      drawCell(r.concepto, curColX, currY, colW1[0], 28, 'left', false, true, '#0f172a'); curColX += colW1[0];
      vals.forEach((v, i) => { drawCell(`$${v.toLocaleString('es-CL')}`, curColX, currY, colW1[i + 1], 28, 'right', false, false); curColX += colW1[i + 1]; });
      drawCell(`$${r.total.toLocaleString('es-CL')}`, curColX, currY, colW1[5], 28, 'right', false, true, '#0f172a');
      currY += 28;
    });
    currY += 12;

    // Fixed alignment line for values on the left cards
    const valX = leftX + leftW - 20;

    // 3. Section Boletas de Honorarios (Summary Card)
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(leftX, currY, leftW, 110, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 12px "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Boletas de Honorarios (${honorariosDocsList.length} boletas registradas)`, leftX + 15, currY + 22);

    const bBruto = retencionesData.baseHonorariosBruto || 0;
    const bTotalBruto = retencionesData.totalHonorariosBruto || bBruto;
    const bRet = retencionesData.retencionHonorarios || 0;
    const bLiq = bTotalBruto - bRet;
    const tRet = retencionesData.tasaEfectivaHonorarios || taxSettings.honorariosTaxRate || 15.25;

    // Monto Bruto
    ctx.font = '12px "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#475569';
    ctx.textAlign = 'left';
    ctx.fillText('• Monto Bruto:', leftX + 15, currY + 48);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 12px "Segoe UI", Roboto, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`$${bTotalBruto.toLocaleString('es-CL')}`, valX, currY + 48);

    // Retención (in blue font, matching Excel)
    ctx.font = '12px "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#475569';
    ctx.textAlign = 'left';
    ctx.fillText(`• Retención (${tRet}%):`, leftX + 15, currY + 72);
    ctx.fillStyle = '#4338ca';
    ctx.font = 'bold 12px "Segoe UI", Roboto, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`$${bRet.toLocaleString('es-CL')}`, valX, currY + 72);

    // Monto Líquido
    ctx.font = '12px "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#475569';
    ctx.textAlign = 'left';
    ctx.fillText('• Monto Líquido:', leftX + 15, currY + 95);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 12px "Segoe UI", Roboto, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`$${bLiq.toLocaleString('es-CL')}`, valX, currY + 95);
    currY += 124;

    // 4. Section PPM (con el detalle de cómo se llega al monto)
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(leftX, currY, leftW, 126, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 12px "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Pagos Provisionales Mensuales (PPM)', leftX + 15, currY + 22);

    const ppmBase = ppmData.baseImponibleVentas || 0;
    const ppmRate = taxSettings.ppmRate || 0.1;
    const ppmAmt = ppmData.montoPPM || 0;

    const filaPpm = (etq: string, val: string, y: number, fuerte = false) => {
      ctx.font = `${fuerte ? 'bold ' : ''}12px "Segoe UI", Roboto, sans-serif`;
      ctx.fillStyle = fuerte ? '#0f172a' : '#475569';
      ctx.textAlign = 'left';
      ctx.fillText(etq, leftX + 15, y);
      ctx.fillStyle = fuerte ? '#4338ca' : '#0f172a';
      ctx.font = `bold ${fuerte ? 13 : 12}px "Segoe UI", Roboto, monospace`;
      ctx.textAlign = 'right';
      ctx.fillText(val, valX, y);
    };
    filaPpm('Base imponible (ingresos del mes)', `$${ppmBase.toLocaleString('es-CL')}`, currY + 46);
    ctx.font = '10.5px "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'left';
    ctx.fillText(`Ventas afectas $${ppmBreakdown.afectas.toLocaleString('es-CL')} + exentas $${ppmBreakdown.exentas.toLocaleString('es-CL')} + exportaciones $${ppmBreakdown.exportaciones.toLocaleString('es-CL')}`, leftX + 28, currY + 62);
    filaPpm('Tasa PPM', `${ppmRate}%`, currY + 82);
    ctx.strokeStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.moveTo(leftX + 15, currY + 92);
    ctx.lineTo(valX, currY + 92);
    ctx.stroke();
    filaPpm('Impuesto determinado (PPM)', `$${ppmAmt.toLocaleString('es-CL')}`, currY + 110, true);
    currY += 140;

    // 5. Total a Pagar F29 Box (Dark banner matching Excel)
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.roundRect(leftX, currY, leftW, 118, 8);
    ctx.fill();

    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 11px "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('RESUMEN GENERAL / TOTAL A PAGAR F29 (Cód. 91)', leftX + 20, currY + 28);

    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 26px "Segoe UI", Roboto, monospace';
    ctx.textAlign = 'right';
    const totalPagar = resumenF29.totalPagarF29 || (bRet + ppmAmt);
    ctx.fillText(`$${totalPagar.toLocaleString('es-CL')}`, leftX + leftW - 20, currY + 38);

    ctx.strokeStyle = '#334155';
    ctx.beginPath();
    ctx.moveTo(leftX + 20, currY + 54);
    ctx.lineTo(leftX + leftW - 20, currY + 54);
    ctx.stroke();

    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 13px "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('PLAZO DE PAGO:', leftX + 20, currY + 84);

    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 14px "Segoe UI", Roboto, monospace';
    ctx.fillText(plazoPagoFecha || plazoCalculado.texto, leftX + 150, currY + 84);
    if (!plazoManual && plazoCalculado.nota) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10.5px "Segoe UI", Roboto, sans-serif';
      ctx.fillText(plazoCalculado.nota, leftX + 20, currY + 104);
    }

    // 6. Right Column: Detalle Boletas de Honorarios (Grows with boletas count)
    const rightX = leftX + leftW + 20;
    const rightW = width - rightX - 25;
    let rightY = 105;

    // Outer card container
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(rightX, rightY, rightW, rightBoxHeight, 8);
    ctx.fill();
    ctx.stroke();

    // Detalle Header (Dark Slate)
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.roundRect(rightX, rightY, rightW, rightBoxHeaderH, [8, 8, 0, 0]);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Detalle Boletas de Honorarios', rightX + 15, rightY + 20);

    rightY += rightBoxHeaderH;

    // Table Subheader
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(rightX, rightY, rightW, rightBoxSubH);
    ctx.fillStyle = '#475569';
    ctx.font = 'bold 10px "Segoe UI", Roboto, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('N°', rightX + 10, rightY + 16);
    ctx.fillText('Prestador', rightX + 45, rightY + 16);
    ctx.textAlign = 'right';
    ctx.fillText('Retención ($)', rightX + rightW - 12, rightY + 16);
    rightY += rightBoxSubH;

    // All Boleta Rows (No arbitrary truncation; box grows naturally)
    if (honorariosDocsList.length === 0) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'italic 11px "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No hay boletas registradas en este período', rightX + rightW / 2, rightY + 16);
      rightY += boletaRowH;
    } else {
      for (let idx = 0; idx < honorariosDocsList.length; idx++) {
        const h = honorariosDocsList[idx];
        const ret = h.montoRetencion !== undefined && h.montoRetencion !== null
          ? Number(h.montoRetencion) || 0
          : (h.montoIva !== undefined ? Number(h.montoIva) || 0 : 0);
        
        ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
        ctx.fillRect(rightX, rightY, rightW, boletaRowH);
        ctx.strokeStyle = '#f1f5f9';
        ctx.strokeRect(rightX, rightY, rightW, boletaRowH);

        // Folio (N°)
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 10px "Segoe UI", Roboto, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(String(h.folio || '-'), rightX + 10, rightY + 16);

        // Prestador
        ctx.font = '10px "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = '#334155';
        let prestName = (h.razonSocialEmisor || h.razonSocialReceptor || 'Prestador').toUpperCase();
        if (prestName.length > 28) prestName = prestName.substring(0, 27) + '…';
        ctx.fillText(prestName, rightX + 45, rightY + 16);

        // Retención ($)
        ctx.font = 'bold 10px "Segoe UI", Roboto, monospace';
        ctx.fillStyle = ret > 0 ? '#0f172a' : '#94a3b8';
        ctx.textAlign = 'right';
        ctx.fillText(ret > 0 ? `$${ret.toLocaleString('es-CL')}` : '$0', rightX + rightW - 12, rightY + 16);

        rightY += boletaRowH;
      }
    }

    // Detalle Total Footer
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(rightX, rightY, rightW, rightBoxFooterH + 20); // Increase height for Impuesto Único
    ctx.strokeStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.moveTo(rightX, rightY);
    ctx.lineTo(rightX + rightW, rightY);
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 11px "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Total Retención:', rightX + 15, rightY + 18);
    ctx.fillText('Impuesto Único:', rightX + 15, rightY + 38);
    
    ctx.font = 'bold 11px "Segoe UI", Roboto, monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#4338ca';
    ctx.fillText(`$${bRet.toLocaleString('es-CL')}`, rightX + rightW - 12, rightY + 18);
    ctx.fillText(`$${retencionesData.impuestoUnicoTrabajadores.toLocaleString('es-CL')}`, rightX + rightW - 12, rightY + 38);

    // Total final is already displayed as one value in the UI summary above, but here we can just show the split.
    return canvas;

  };

  const handleDownloadImage = () => {
    try {
      const canvas = generateCanvasImage();
      const imageUri = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `Resumen_F29_${company.rut.replace(/[^a-zA-Z0-9]/g, '')}_${selectedPeriod}.png`;
      link.href = imageUri;
      link.click();
      alert(' ¡Imagen del resumen F29 descargada con éxito! Ya puedes adjuntarla directamente en WhatsApp.');
    } catch (err: any) {
      console.error('Error generating image:', err);
      alert('Error al generar la imagen: ' + err.message);
    }
  };

  const handleCopyImage = () => {
    try {
      const canvas = generateCanvasImage();
      canvas.toBlob(async (blob) => {
        if (!blob) {
          handleDownloadImage();
          return;
        }
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
          ]);
          alert(' ¡Imagen copiada al portapapeles! Ya puedes presionar Ctrl+V en WhatsApp para pegarla directamente.');
        } catch (e) {
          handleDownloadImage();
        }
      }, 'image/png');
    } catch (err: any) {
      console.error(err);
      handleDownloadImage();
    }
  };

  const guardarMapeoYContabilizar = async () => {
    if (!mapeoPendiente) return;
    const sinElegir = mapeoPendiente.filter(p => !mapeoElegido[p.key]);
    if (sinElegir.length) { alert(`Falta elegir la cuenta para: ${sinElegir.map(p => p.concepto).join(', ')}.`); return; }
    const nuevos = { ...f29AccountParams, ...Object.fromEntries(mapeoPendiente.map(p => [p.key, mapeoElegido[p.key]])) } as F29AccountingParams;
    try {
      await updateDoc(companyRef, { f29AccountParams: nuevos, updatedAt: new Date().toISOString() });
    } catch (e: any) { alert('No se pudieron guardar las cuentas: ' + (e?.message || e)); return; }
    // se usan de inmediato en esta misma contabilización (el estado de React se actualiza después)
    Object.assign(f29AccountParams, nuevos);
    setF29AccountParams(nuevos);
    setMapeoPendiente(null);
    await handleCentralizeF29Voucher(true);
  };

  return (
    <div className="space-y-4">
      {mapeoPendiente && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-2xl p-5 space-y-4 my-8">
            <div>
              <h3 className="font-bold text-slate-900">Cuentas para centralizar el F29 {selectedPeriod}</h3>
              <p className="text-xs text-slate-600 mt-1">Estos conceptos del F29 aún no tienen cuenta asignada. Elige una cuenta de tu plan para cada uno: quedarán guardadas para los meses siguientes (puedes cambiarlas en los parámetros del F29). La cuenta sugerida es solo una sugerencia; revísala.</p>
            </div>
            <table className="w-full text-xs">
              <thead><tr className="text-left text-slate-500 border-b border-slate-200"><th className="p-2">Concepto</th><th className="p-2 text-right">Monto</th><th className="p-2">Cuenta</th></tr></thead>
              <tbody>
                {mapeoPendiente.map(p => (
                  <tr key={p.key} className="border-b border-slate-100">
                    <td className="p-2 font-semibold text-slate-800">{p.concepto}</td>
                    <td className="p-2 text-right font-mono">$ {Math.round(p.monto).toLocaleString('es-CL')}</td>
                    <td className="p-2">
                      <select value={mapeoElegido[p.key] || ''} onChange={e => setMapeoElegido(m => ({ ...m, [p.key]: e.target.value }))}
                        className={`w-full border rounded-lg p-1.5 text-xs bg-white ${mapeoElegido[p.key] ? 'border-slate-300' : 'border-rose-400'}`}>
                        <option value="">Elegir cuenta…</option>
                        {accounts.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}{a.id === p.sugerida ? '  (sugerida)' : ''}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-slate-500">Si una cuenta no existe en tu plan, créala primero en el Plan de Cuentas. Sin cuenta, el F29 no se contabiliza.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setMapeoPendiente(null)} className="px-3 py-2 rounded-lg bg-slate-100 text-xs font-bold">Cancelar</button>
              <button onClick={guardarMapeoYContabilizar} className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold">Guardar cuentas y contabilizar</button>
            </div>
          </div>
        </div>
      )}
      {/* HEADER */}
      <div className="bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-xs flex flex-wrap justify-between items-center gap-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-indigo-50 flex items-center justify-center text-indigo-700 border border-indigo-200/60">
            <Receipt className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 tracking-tight uppercase">
            Formulario 29 y Determinación de Impuestos Mensuales
          </h3>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={handleExportCSV}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-300 transition-colors flex items-center justify-center cursor-pointer"
            title="Exportar Resumen F29 a CSV / Excel"
          >
            <Download className="w-4 h-4 text-slate-600" />
          </button>

          <button
            onClick={() => handleCentralizeF29Voucher()}
            disabled={isSubmitting}
            className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Generar y contabilizar asiento de liquidación mensual F29 en Libro Diario"
          >
            <Zap className="w-3.5 h-3.5 text-indigo-200" />
            <span className="hidden sm:inline">Contabilizar F29</span>
          </button>

          <button
            onClick={handleSaveDeclaration}
            disabled={isSubmitting}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Guardar estado de la declaración F29"
          >
            <Save className="w-3.5 h-3.5 text-emerald-200" />
            <span>{isSubmitting ? 'Guardando...' : 'Guardar'}</span>
          </button>

          <button
            onClick={() => setShowClientSummaryModal(true)}
            className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-lg shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Ver resumen clásico para enviar al cliente o por WhatsApp"
          >
            <MessageSquare className="w-3.5 h-3.5 text-emerald-200" />
            <span className="hidden sm:inline">Resumen WhatsApp</span>
          </button>
        </div>
      </div>

      {/* TOP CONTROL BAR: PERIOD, REGIMEN & STATUS */}
      <div className="bg-slate-900 text-white p-4 rounded-xl shadow-xs grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
        <div>
          <label className="block text-slate-400 font-bold uppercase text-[10px] mb-1">Período Tributario (Abierto):</label>
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 font-mono font-bold text-white text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
          >
            {(() => {
              const openPeriods = getAllOpenPeriods(fiscalYears);
              if (openPeriods.length === 0) {
                return <option value={selectedPeriod || '2026-01'}>{selectedPeriod ? `${selectedPeriod} (Sin períodos abiertos)` : 'No hay períodos abiertos'}</option>;
              }
              return openPeriods.map(op => (
                <option key={op.period} value={op.period}>
                  {op.label}
                </option>
              ));
            })()}
          </select>
        </div>

        <div>
          <label className="block text-slate-400 font-bold uppercase text-[10px] mb-1">Régimen Tributario:</label>
          <select
            value={taxSettings.regimenTributario}
            onChange={(e) => setTaxSettings({ ...taxSettings, regimenTributario: e.target.value as any })}
            className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 font-semibold text-white focus:ring-2 focus:ring-indigo-400 focus:outline-none"
          >
            <option value="14_D3_PROPYME_GENERAL">ProPyme General (Art. 14 D3)</option>
            <option value="14_D8_PROPYME_TRANSPARENTE">ProPyme Transparente (Art. 14 D8)</option>
            <option value="14_A_SEMI_INTEGRADO">Régimen General Semi-Integrado (14 A)</option>
            <option value="RENTA_PRESUNTA">Renta Presunta</option>
          </select>
        </div>

        <div>
          <label className="block text-slate-400 font-bold uppercase text-[10px] mb-1">Estado de Declaración:</label>
          <select
            value={declarationStatus}
            onChange={(e) => setDeclarationStatus(e.target.value as any)}
            className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 font-bold text-white focus:ring-2 focus:ring-indigo-400 focus:outline-none"
          >
            <option value="Borrador"> Borrador / En Preparación</option>
            <option value="Validado">✓ Validado por Contador</option>
            <option value="Declarado"> Declarado en SII</option>
            <option value="Pagado"> Pagado en Banco / TGR</option>
          </select>
        </div>

        <div>
          <label className="block text-slate-400 font-bold uppercase text-[10px] mb-1">Folio Declaración SII:</label>
          <input
            type="text"
            placeholder="Ej: 99481283"
            value={folioSII}
            onChange={(e) => setFolioSII(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 font-mono font-bold text-indigo-300 focus:ring-2 focus:ring-indigo-400 focus:outline-none"
          />
        </div>
      </div>

      {/* SUMMARY KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: Débito Fiscal */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-bold text-slate-500">Débito Fiscal (IVA Ventas)</span>
            <span className="text-xs bg-indigo-50 text-indigo-700 px-1.5 py-0.2 rounded font-mono font-bold">Cód. 538</span>
          </div>
          <span className="text-xl font-black font-mono text-slate-900 block mt-1">
            ${debitoFiscalData.totalDebitoFiscal.toLocaleString('es-CL')}
          </span>
          <span className="text-[10px] text-slate-500">
            {debitoFiscalData.docsCount} ventas | Base: ${debitoFiscalData.ventasAfectasNeto.toLocaleString('es-CL')}
          </span>
        </div>

        {/* Card 2: Crédito Fiscal */}
        <div className={`p-3.5 rounded-xl border shadow-xs ${
          creditoFiscalData.totalCreditoFiscal < 0 ? 'bg-rose-50/50 border-rose-200' : 'bg-white border-slate-200'
        }`}>
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-bold text-slate-500">Crédito Fiscal (IVA Compras)</span>
            <span className={`text-xs px-1.5 py-0.2 rounded font-mono font-bold ${
              creditoFiscalData.totalCreditoFiscal < 0 ? 'bg-rose-100 text-rose-800' : 'bg-indigo-50 text-indigo-700'
            }`}>Cód. 537</span>
          </div>
          <span className={`text-xl font-black font-mono block mt-1 ${
            creditoFiscalData.totalCreditoFiscal < 0 ? 'text-rose-700' : 'text-slate-900'
          }`}>
            ${creditoFiscalData.totalCreditoFiscal.toLocaleString('es-CL')}
          </span>
          <span className="text-[10px] text-slate-500">
            {creditoFiscalData.totalCreditoFiscal < 0
              ? 'Saldo crédito negativo (NC superan compras)'
              : `${creditoFiscalData.docsCount} compras | Remanente ant: $${creditoFiscalData.remanenteMesAnteriorPesos.toLocaleString('es-CL')}`
            }
          </span>
        </div>

        {/* Card 3: PPM & Retenciones */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-bold text-slate-500">PPM + Retenciones</span>
            <span className="text-xs bg-amber-50 text-amber-700 px-1.5 py-0.2 rounded font-mono font-bold">PPM {taxSettings.ppmRate}%</span>
          </div>
          <span className="text-xl font-black font-mono text-amber-700 block mt-1">
            ${(ppmData.montoPPM + retencionesData.totalRetenciones).toLocaleString('es-CL')}
          </span>
          <span className="text-[10px] text-slate-500">
            PPM: ${ppmData.montoPPM.toLocaleString('es-CL')} | Ret: ${retencionesData.totalRetenciones.toLocaleString('es-CL')}
          </span>
        </div>

        {/* Card 4: Total a Pagar / Giro */}
        <div className={`p-3.5 rounded-xl border shadow-xs transition-all ${
          resumenF29.totalPagarF29 > 0
            ? 'bg-rose-50 border-rose-300'
            : 'bg-emerald-50 border-emerald-300'
        }`}>
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-bold text-slate-700">
              {resumenF29.totalPagarF29 > 0 ? 'Total a Pagar en F29' : 'Remanente a Favor'}
            </span>
            <span className="text-xs bg-slate-900 text-white px-1.5 py-0.2 rounded font-mono font-bold">
              {resumenF29.totalPagarF29 > 0 ? 'Cód. 91' : 'Cód. 77'}
            </span>
          </div>
          <span className={`text-xl font-black font-mono block mt-1 ${
            resumenF29.totalPagarF29 > 0 ? 'text-rose-700' : 'text-emerald-700'
          }`}>
            {resumenF29.totalPagarF29 > 0
              ? `$${resumenF29.totalPagarF29.toLocaleString('es-CL')}`
              : `$${resumenF29.remanenteParaSiguienteMes.toLocaleString('es-CL')}`}
          </span>
          <span className="text-[10px] text-slate-600 font-medium">
            {resumenF29.totalPagarF29 > 0
              ? `IVA: $${resumenF29.ivaPagar.toLocaleString('es-CL')} + Otros: $${(resumenF29.ppmPagar + resumenF29.retencionesPagar).toLocaleString('es-CL')}`
              : `Remanente acumulado: ${resumenF29.remanenteParaSiguienteMesUTM} UTM`}
          </span>
        </div>
      </div>

      {/* TABS */}
      <div className="flex border-b border-slate-200 bg-white rounded-t-xl px-4 pt-2 gap-2">
        <button
          onClick={() => setActiveTab('formulario')}
          className={`px-4 py-2 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors ${
            activeTab === 'formulario'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span> Formulario 29 Oficial (SII)</span>
        </button>

        <button
          onClick={() => setActiveTab('auditoria')}
          className={`px-4 py-2 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors ${
            activeTab === 'auditoria'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span> Auditoría y Trazabilidad RCV</span>
          <span className="text-slate-700 text-[10px]">{periodDocs.length} docs</span>
        </button>

        <button
          onClick={() => setActiveTab('parametros')}
          className={`px-4 py-2 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors ${
            activeTab === 'parametros'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span> Parámetros Tributarios y UTM</span>
        </button>

        <button
          onClick={() => setActiveTab('historial')}
          className={`px-4 py-2 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors ${
            activeTab === 'historial'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span> Historial de Declaraciones F29</span>
          <span className="text-slate-700 text-[10px]">{savedDeclarations.length}</span>
        </button>
      </div>

      {/* TAB 1: FORMULARIO 29 OFICIAL (FORMATO SII) */}
      {activeTab === 'formulario' && (
        <div className="bg-white rounded-b-xl border border-slate-200 shadow-xs p-5 space-y-6">
          {/* SECCIÓN I: DÉBITO FISCAL */}
          {f29CodeSettings.debito !== false && (
            <div className="space-y-2">
              <div className="flex items-center justify-between bg-slate-100 px-3 py-2 rounded-lg border border-slate-200">
                <span className="font-bold text-xs text-slate-800">
                  I. Débito Fiscal IVA y Ventas / Servicios (Líneas 1 a 15)
                </span>
                <span className="font-mono text-xs font-black text-slate-900">
                  Total Débito: ${debitoFiscalData.totalDebitoFiscal.toLocaleString('es-CL')}
                </span>
              </div>

              <table className="w-full text-left text-xs border-collapse font-mono">
                <thead className="bg-slate-50 text-slate-600 border-b text-[11px] font-sans">
                  <tr>
                    <th className="py-2 px-3 w-20">Cód. SII</th>
                    <th className="py-2 px-3">Glosa / Concepto Tributario</th>
                    <th className="py-2 px-3 text-right">Base Imponible ($)</th>
                    <th className="py-2 px-3 text-right">Débito Fiscal ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[11px]">
                  <tr className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-bold text-indigo-700">[503 / 502]</td>
                    <td className="py-2 px-3 font-sans text-slate-800">Facturas Emitidas (Afectas)</td>
                    <td className="py-2 px-3 text-right text-slate-600">${debitoFiscalData.ventasAfectasNeto.toLocaleString('es-CL')}</td>
                    <td className="py-2 px-3 text-right font-bold text-slate-900">${debitoFiscalData.debitoFacturasEmitidas.toLocaleString('es-CL')}</td>
                  </tr>
                  <tr className="hover:bg-indigo-50/40 bg-indigo-50/10">
                    <td className="py-2 px-3 font-bold text-indigo-700">[020 / 585]</td>
                    <td className="py-2 px-3 font-sans text-slate-800">
                      <div className="flex items-center gap-1.5">
                        <span>Facturas y Documentos de Exportación (DTE 110, 111, 112)</span>
                        {(debitoFiscalData.docsExportCount || 0) > 0 && (
                          <span className="text-[10px] bg-indigo-100 text-indigo-800 px-1.5 py-0.2 rounded-full font-bold">
                            {debitoFiscalData.docsExportCount} docs
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right text-indigo-900 font-bold">${(debitoFiscalData.ventasExportacionTotal || 0).toLocaleString('es-CL')}</td>
                    <td className="py-2 px-3 text-right text-slate-400">$0 (Exento IVA)</td>
                  </tr>
                  <tr className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-bold text-indigo-700">[110 / 111]</td>
                    <td className="py-2 px-3 font-sans text-slate-800">Boletas Electrónicas y Vales Transbank</td>
                    <td className="py-2 px-3 text-right text-slate-600">${debitoFiscalData.ventasBoletasNeto.toLocaleString('es-CL')}</td>
                    <td className="py-2 px-3 text-right font-bold text-slate-900">${debitoFiscalData.debitoBoletasEmitidas.toLocaleString('es-CL')}</td>
                  </tr>
                  <tr className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-bold text-indigo-700">[512 / 513]</td>
                    <td className="py-2 px-3 font-sans text-slate-800">Notas de Débito Emitidas</td>
                    <td className="py-2 px-3 text-right text-slate-600">-</td>
                    <td className="py-2 px-3 text-right font-bold text-slate-900">${debitoFiscalData.debitoNotasDebito.toLocaleString('es-CL')}</td>
                  </tr>
                  <tr className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-bold text-rose-700">[509 / 510]</td>
                    <td className="py-2 px-3 font-sans text-slate-800">(-) Notas de Crédito Emitidas (Rebaja Débito)</td>
                    <td className="py-2 px-3 text-right text-slate-600">-</td>
                    <td className="py-2 px-3 text-right font-bold text-rose-700">-${debitoFiscalData.creditoNotasCreditoEmitidas.toLocaleString('es-CL')}</td>
                  </tr>
                  {(debitoFiscalData.ceecCreditoConstructora || 0) > 0 && (
                    <tr className="bg-amber-50/60 hover:bg-amber-50">
                      <td className="py-2 px-3 font-bold text-amber-800">[126 / 128]</td>
                      <td className="py-2 px-3 font-sans text-amber-900">
                        <span className="font-bold block">(-) Crédito Especial Empresas Constructoras - CEEC (Art. 21 D.L. 910)</span>
                        <span className="text-[10px] text-amber-700">Deducción de franquicia tributaria habitacional sobre ventas de construcción</span>
                      </td>
                      <td className="py-2 px-3 text-right text-slate-600">-</td>
                      <td className="py-2 px-3 text-right font-black text-amber-900">-${debitoFiscalData.ceecCreditoConstructora?.toLocaleString('es-CL')}</td>
                    </tr>
                  )}
                  <tr className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-bold text-slate-500">[585 / 142]</td>
                    <td className="py-2 px-3 font-sans text-slate-600">Ventas y Servicios Exentos o No Gravados</td>
                    <td className="py-2 px-3 text-right text-slate-600">${debitoFiscalData.ventasExentasTotal.toLocaleString('es-CL')}</td>
                    <td className="py-2 px-3 text-right text-slate-400">$0</td>
                  </tr>
                  <tr className="bg-slate-100 font-bold border-t border-slate-300">
                    <td className="py-2 px-3 text-indigo-900">[538]</td>
                    <td className="py-2 px-3 font-sans uppercase text-slate-900">TOTAL DÉBITO FISCAL DEL PERÍODO</td>
                    <td className="py-2 px-3 text-right">-</td>
                    <td className="py-2 px-3 text-right text-indigo-900 text-xs">${debitoFiscalData.totalDebitoFiscal.toLocaleString('es-CL')}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* SECCIÓN II: CRÉDITO FISCAL */}
          {f29CodeSettings.credito !== false && (
            <div className="space-y-2">
              <div className="flex items-center justify-between bg-slate-100 px-3 py-2 rounded-lg border border-slate-200">
                <span className="font-bold text-xs text-slate-800">
                  II. Crédito Fiscal IVA y Compras / Gastos (Líneas 16 a 35)
                </span>
                <span className={`font-mono text-xs font-black ${
                  creditoFiscalData.totalCreditoFiscal < 0 ? 'text-rose-700' : 'text-slate-900'
                }`}>
                  Total Crédito: ${creditoFiscalData.totalCreditoFiscal.toLocaleString('es-CL')}
                </span>
              </div>

              <table className="w-full text-left text-xs border-collapse font-mono">
                <thead className="bg-slate-50 text-slate-600 border-b text-[11px] font-sans">
                  <tr>
                    <th className="py-2 px-3 w-20">Cód. SII</th>
                    <th className="py-2 px-3">Glosa / Concepto Tributario</th>
                    <th className="py-2 px-3 text-right">Base Imponible ($)</th>
                    <th className="py-2 px-3 text-right">Crédito Fiscal ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[11px]">
                  <tr className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-bold text-indigo-700">[519 / 520]</td>
                    <td className="py-2 px-3 font-sans text-slate-800">Facturas recibidas del giro ({creditoFiscalData.cantFacturasGiro || 0} docs)</td>
                    <td className="py-2 px-3 text-right text-slate-600">${creditoFiscalData.comprasGiroNeto.toLocaleString('es-CL')}</td>
                    <td className="py-2 px-3 text-right font-bold text-slate-900">${creditoFiscalData.creditoFacturasRecibidas.toLocaleString('es-CL')}</td>
                  </tr>
                  <tr className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-bold text-indigo-700">[524 / 525]</td>
                    <td className="py-2 px-3 font-sans text-slate-800">Facturas activo fijo ({creditoFiscalData.cantActivoFijo || 0} docs)</td>
                    <td className="py-2 px-3 text-right text-slate-600">${creditoFiscalData.comprasActivoFijoNeto.toLocaleString('es-CL')}</td>
                    <td className="py-2 px-3 text-right font-bold text-slate-900">${creditoFiscalData.creditoActivoFijo.toLocaleString('es-CL')}</td>
                  </tr>
                  <tr className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-bold text-indigo-700">[531 / 532]</td>
                    <td className="py-2 px-3 font-sans text-slate-800">Notas de débito recibidas ({creditoFiscalData.cantNotasDebito || 0} docs)</td>
                    <td className="py-2 px-3 text-right text-slate-600">-</td>
                    <td className="py-2 px-3 text-right font-bold text-slate-900">${creditoFiscalData.creditoNotasDebitoRecibidas.toLocaleString('es-CL')}</td>
                  </tr>
                  <tr className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-bold text-rose-700">[527 / 528]</td>
                    <td className="py-2 px-3 font-sans text-slate-800">(-) Notas de crédito recibidas ({creditoFiscalData.cantNotasCredito || 0} docs)</td>
                    <td className="py-2 px-3 text-right text-slate-600">-</td>
                    <td className="py-2 px-3 text-right font-bold text-rose-700">-${creditoFiscalData.debitoNotasCreditoRecibidas.toLocaleString('es-CL')}</td>
                  </tr>
                  {(creditoFiscalData.creditoSupermercados || 0) > 0 && (
                  <tr className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-bold text-indigo-700">[761 / 762]</td>
                    <td className="py-2 px-3 font-sans text-slate-800">Facturas de supermercados y comercios similares ({creditoFiscalData.cantSupermercados || 0} docs)</td>
                    <td className="py-2 px-3 text-right text-slate-600">-</td>
                    <td className="py-2 px-3 text-right font-bold text-slate-900">${(creditoFiscalData.creditoSupermercados || 0).toLocaleString('es-CL')}</td>
                  </tr>
                  )}
                  {(creditoFiscalData.creditoBienesRaices || 0) > 0 && (
                  <tr className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-bold text-indigo-700">[765 / 766]</td>
                    <td className="py-2 px-3 font-sans text-slate-800">Facturas por adquisición o construcción de bienes inmuebles ({creditoFiscalData.cantBienesRaices || 0} docs)</td>
                    <td className="py-2 px-3 text-right text-slate-600">-</td>
                    <td className="py-2 px-3 text-right font-bold text-slate-900">${(creditoFiscalData.creditoBienesRaices || 0).toLocaleString('es-CL')}</td>
                  </tr>
                  )}
                  {(creditoFiscalData.ivaNoRecuperable || 0) !== 0 && (
                  <tr className="hover:bg-slate-50 text-slate-500">
                    <td className="py-2 px-3 font-bold">[564 / 521]</td>
                    <td className="py-2 px-3 font-sans">Sin derecho a crédito ({creditoFiscalData.cantNoRecuperable || 0} docs) · IVA no recuperable informativo</td>
                    <td className="py-2 px-3 text-right">-</td>
                    <td className="py-2 px-3 text-right">${(creditoFiscalData.ivaNoRecuperable || 0).toLocaleString('es-CL')} (no suma)</td>
                  </tr>
                  )}
                  {otrosImpuestosRegistro.length > 0 && (
                  <tr className="text-slate-600">
                    <td colSpan={4} className="py-2 px-3">
                      <div className="text-[11px] font-bold text-slate-700 mb-1">Otros impuestos del Registro de Compras (detalle informado por el SII)</div>
                      <table className="w-full text-[11px]">
                        <tbody>
                          {otrosImpuestosRegistro.map(f => (
                            <tr key={`${f.codigo}-${f.sinDerecho}`} className="border-t border-slate-100">
                              <td className="py-1 pr-2 font-mono">{f.sinDerecho ? '—' : f.codigo}</td>
                              <td className="py-1 pr-2">{f.nombre} ({f.documentos} docs)</td>
                              <td className="py-1 pr-2">
                                {f.tratamiento === 'credito' ? (f.codigo === '28' ? 'Recuperable · F29 [127] (completa m³ y componentes)' : 'Con derecho a crédito (impuesto adicional)')
                                  : f.tratamiento === 'costo' ? 'Sin derecho a crédito · va al costo'
                                  : <span className="text-rose-700 font-bold">Código sin catalogar: revisar antes de contabilizar</span>}
                              </td>
                              <td className="py-1 text-right font-mono">${f.monto.toLocaleString('es-CL')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="text-[10px] text-slate-400 mt-1">No son IVA: no suman al crédito fiscal [520]/[537].</div>
                    </td>
                  </tr>
                  )}
                  {f29CodeSettings.remanente504 !== false && (
                    <>
                      <tr className="bg-emerald-50/40 hover:bg-emerald-50/70 transition-colors">
                        <td className="py-2 px-3 font-bold text-indigo-700">[504]</td>
                        <td className="py-2 px-3 font-sans text-slate-800">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-emerald-950">Remanente de Crédito Fiscal Mes Anterior</span>
                              <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-mono font-bold">
                                UTM: ${taxSettings.utmValue.toLocaleString('es-CL')}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-500 block mt-0.5">
                              {infoRemanente?.origen === 'mes_anterior' && !taxSettings.remanenteFijadoManual
                                ? `Arrastrado del F29 ${infoRemanente.periodoOrigen}, actualizado con la UTM de este mes.`
                                : infoRemanente?.origen === 'inicial' ? 'Remanente inicial de la empresa.' : 'Puede editar directamente en UTM o en Pesos ($).'}
                            </span>
                            {infoRemanente?.advertencia && <span className="text-[10px] text-amber-700 block mt-0.5">{infoRemanente.advertencia}</span>}
                            {infoRemanente?.difiereDeclarado !== undefined && <span className="text-[10px] text-rose-700 block mt-0.5">El mes anterior deja {infoRemanente.utm.toFixed(2)} UTM; este F29 tiene {infoRemanente.difiereDeclarado.toFixed(2)} UTM.</span>}
                            {taxSettings.remanenteFijadoManual && declarationStatus !== 'Declarado' && declarationStatus !== 'Pagado' && (
                              <button type="button" className="text-[10px] text-indigo-700 underline mt-0.5" onClick={() => {
                                const arr = remanenteArrastrado(savedDeclarations, selectedPeriod, { utm: company.initialRemanenteUTM });
                                setTaxSettings({ ...taxSettings, previousMonthRemanenteUTM: arr.utm, remanenteFijadoManual: false });
                                setManualAdjustments({ ...manualAdjustments, remanenteManualPesos: remanenteEnPesos(arr.utm, taxSettings.utmValue) });
                                setInfoRemanente(arr);
                              }}>Volver al arrastre del mes anterior</button>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-3 text-right text-slate-600">
                          <div className="flex items-center justify-end gap-1">
                            <input
                              type="number"
                              step="0.01"
                              value={taxSettings.previousMonthRemanenteUTM || ''}
                              onChange={e => {
                                const valUTM = parseFloat(e.target.value) || 0;
                                const valPesos = Math.round(valUTM * taxSettings.utmValue);
                                setTaxSettings({ ...taxSettings, previousMonthRemanenteUTM: valUTM, remanenteFijadoManual: true });
                                setManualAdjustments({ ...manualAdjustments, remanenteManualPesos: valPesos });
                              }}
                              placeholder="0.00"
                              className="w-20 bg-white border border-emerald-300 rounded px-1.5 py-0.5 text-right font-mono font-bold text-emerald-900 text-xs focus:ring-2 focus:ring-emerald-500"
                              title="Remanente Mes Anterior en UTM (Cód. 504)"
                            />
                            <span className="text-[10px] font-bold text-emerald-800 font-sans">UTM</span>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <span className="text-slate-400">$</span>
                            <input
                              type="number"
                              value={creditoFiscalData.remanenteMesAnteriorPesos || ''}
                              onChange={e => {
                                const valPesos = parseFloat(e.target.value) || 0;
                                const valUTM = taxSettings.utmValue > 0 ? parseFloat((valPesos / taxSettings.utmValue).toFixed(2)) : 0;
                                setManualAdjustments({ ...manualAdjustments, remanenteManualPesos: valPesos });
                                setTaxSettings({ ...taxSettings, previousMonthRemanenteUTM: valUTM, remanenteFijadoManual: true });
                              }}
                              placeholder="0"
                              className="w-28 bg-white border border-emerald-300 rounded px-1.5 py-0.5 text-right font-mono font-bold text-emerald-900 text-xs focus:ring-2 focus:ring-emerald-500"
                              title="Remanente Mes Anterior en Pesos actualizados (Cód. 563)"
                            />
                          </div>
                        </td>
                      </tr>
                      {creditoFiscalData.reajusteCorreccionMonetariaRemanente !== undefined && creditoFiscalData.reajusteCorreccionMonetariaRemanente > 0 && (
                        <tr className="bg-emerald-50/50 text-[11px]">
                          <td className="py-1 px-3 text-emerald-700 font-bold">Art. 27 DL 825</td>
                          <td className="py-1 px-3 font-sans text-emerald-800 italic" colSpan={2}>
                            ↳ Reajuste por Corrección Monetaria de Remanente (Variación UTM): +${creditoFiscalData.reajusteCorreccionMonetariaRemanente.toLocaleString('es-CL')} (Ganancia CM imputable al crédito)
                          </td>
                          <td className="py-1 px-3 text-right font-semibold text-emerald-800">
                            Reajuste: +${creditoFiscalData.reajusteCorreccionMonetariaRemanente.toLocaleString('es-CL')}
                          </td>
                        </tr>
                      )}
                    </>
                  )}
                  <tr className={`font-bold border-t border-slate-300 ${
                    creditoFiscalData.totalCreditoFiscal < 0 ? 'bg-rose-50 text-rose-900' : 'bg-slate-100 text-indigo-900'
                  }`}>
                    <td className="py-2 px-3 text-indigo-900">[537]</td>
                    <td className="py-2 px-3 font-sans uppercase">
                      <div className="flex items-center gap-2">
                        <span>TOTAL CRÉDITO FISCAL DEL PERÍODO</span>
                        {creditoFiscalData.totalCreditoFiscal < 0 && (
                          <span className="text-[10px] bg-rose-200 text-rose-800 px-2 py-0.5 rounded font-sans font-bold normal-case">
                             Saldo Crédito Negativo (Notas de Crédito superan compras)
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right">-</td>
                    <td className={`py-2 px-3 text-right text-xs ${
                      creditoFiscalData.totalCreditoFiscal < 0 ? 'text-rose-700 font-black' : 'text-indigo-900'
                    }`}>
                      ${creditoFiscalData.totalCreditoFiscal.toLocaleString('es-CL')}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* SECCIÓN III: LIQUIDACIÓN DE IVA E IVA POSTERGADO */}
          <div className={`p-4 rounded-xl border transition-all ${
            resumenF29.ivaPagar > 0 ? 'bg-rose-50/70 border-rose-200' : 'bg-emerald-50/70 border-emerald-200'
          }`}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs font-mono">
              <div>
                <span className="font-bold uppercase font-sans text-slate-800 block">
                  III. Determinación del IVA Mensual (Débito $ - Crédito $)
                </span>
                {resumenF29.reajusteCorreccionMonetaria > 0 && (
                  <span className="text-[11px] text-emerald-700 font-sans">
                    ✓ Incluye corrección monetaria Art. 27 DL 825 (${resumenF29.reajusteCorreccionMonetaria.toLocaleString('es-CL')}).
                  </span>
                )}
              </div>

              <div className="text-right">
                {resumenF29.ivaPagar > 0 ? (
                  <div>
                    <span className="font-black text-rose-700 text-sm block">
                      [Cód. 89] Impuesto Determinado: ${resumenF29.ivaPagar.toLocaleString('es-CL')}
                    </span>
                    {f29CodeSettings.posterga756 !== false && (
                      <div className="mt-2 pt-2 border-t border-rose-200 flex items-center justify-end gap-2">
                        <label className="flex items-center gap-1.5 cursor-pointer font-sans text-xs text-slate-800">
                          <input
                            type="checkbox"
                            checked={ivaPostergadoActivo}
                            onChange={e => setIvaPostergadoActivo(e.target.checked)}
                            className="rounded text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="font-bold text-indigo-900">Postergación de Pago de IVA (Cód. 756 / Ley ProPyme)</span>
                        </label>
                        {ivaPostergadoActivo && (
                          <div className="flex items-center gap-1">
                            <span className="text-slate-500">$</span>
                            <input
                              type="number"
                              value={ivaPostergadoMonto || resumenF29.ivaPagar}
                              onChange={e => setIvaPostergadoMonto(parseFloat(e.target.value) || 0)}
                              className="w-28 bg-white border border-indigo-300 rounded px-2 py-0.5 text-right font-mono font-bold text-indigo-900"
                              placeholder={resumenF29.ivaPagar.toString()}
                            />
                          </div>
                        )}
                      </div>
                    )}
                    {ivaPostergadoActivo && resumenF29.ivaPostergado > 0 && (
                      <div className="text-[11px] text-indigo-700 font-sans mt-1">
                        [Cód. 756] IVA Postergado: -${resumenF29.ivaPostergado.toLocaleString('es-CL')} | [Cód. 89 Neto]: ${resumenF29.ivaPagarNetoPostergacion.toLocaleString('es-CL')}
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="font-black text-emerald-700 text-sm">
                    [Cód. 77] Nuevo Remanente a Favor Mes Siguiente: ${resumenF29.remanenteParaSiguienteMes.toLocaleString('es-CL')} ({resumenF29.remanenteParaSiguienteMesUTM} UTM)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* SECCIÓN IV: RETENCIONES DE SEGUNDA CATEGORÍA Y CAMBIO DE SUJETO */}
          {(f29CodeSettings.honorarios151 !== false || f29CodeSettings.impuestoUnico48 !== false || f29CodeSettings.retencionTerceros !== false) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between bg-slate-100 px-3 py-2 rounded-lg border border-slate-200">
                <span className="font-bold text-xs text-slate-800">
                  IV. Retenciones de Impuesto a la Renta (Honorarios, Sueldos y Cambio de Sujeto)
                </span>
                <span className="font-mono text-xs font-black text-slate-900">
                  Total Retenciones: ${retencionesData.totalRetenciones.toLocaleString('es-CL')}
                </span>
              </div>

              <table className="w-full text-left text-xs border-collapse font-mono">
                <thead className="bg-slate-50 text-slate-600 border-b text-[11px] font-sans">
                  <tr>
                    <th className="py-2 px-3 w-20">Cód. SII</th>
                    <th className="py-2 px-3">Concepto Retención</th>
                    <th className="py-2 px-3 text-right">Tasa Retención</th>
                    <th className="py-2 px-3 text-right">Monto Bruto ($)</th>
                    <th className="py-2 px-3 text-right">Impuesto Retenido ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[11px]">
                  {f29CodeSettings.honorarios151 !== false && (
                    <tr className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-bold text-indigo-700">[151 / 152]</td>
                      <td className="py-2 px-3 font-sans text-slate-800">
                        Retención Boletas de Honorarios Recibidas
                        <span className="text-[11px] text-slate-500 ml-1">
                          ({retencionesData.docsCount} {retencionesData.docsCount === 1 ? 'boleta' : 'boletas'}
                          {retencionesData.docsSinRetentionCount && retencionesData.docsSinRetentionCount > 0
                            ? `, ${retencionesData.docsWithRetentionCount} con retención`
                            : ''})
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right">
                        {retencionesData.tasaEfectivaHonorarios || taxSettings.honorariosTaxRate}%
                      </td>
                      <td className="py-2 px-3 text-right text-slate-600">
                        ${retencionesData.baseHonorariosBruto.toLocaleString('es-CL')}
                        {retencionesData.docsSinRetentionCount && retencionesData.docsSinRetentionCount > 0 && (
                          <span className="block text-[10px] text-slate-400 font-sans" title="Total Bruto de todas las boletas recibidas">
                            Total BHE: ${retencionesData.totalHonorariosBruto?.toLocaleString('es-CL')}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-slate-900">${retencionesData.retencionHonorarios.toLocaleString('es-CL')}</td>
                    </tr>
                  )}
                  {f29CodeSettings.impuestoUnico48 !== false && (
                    <tr className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-bold text-indigo-700">[48 / 49]</td>
                      <td className="py-2 px-3 font-sans text-slate-800">
                        Impuesto Único Segunda Categoría (Trabajadores Dependientes)
                      </td>
                      <td className="py-2 px-3 text-right text-slate-500">Tabla SII</td>
                      <td className="py-2 px-3 text-right text-slate-600">-</td>
                      <td className="py-2 px-3 text-right font-bold text-slate-900">
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-slate-400">$</span>
                          <input
                            type="number"
                            value={manualAdjustments.impuestoUnicoManual || ''}
                            onChange={e => setManualAdjustments({ ...manualAdjustments, impuestoUnicoManual: parseFloat(e.target.value) || 0 })}
                            className="w-32 bg-amber-50 border border-amber-300 rounded px-2 py-0.5 text-right font-mono font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500"
                            placeholder="0"
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                  {f29CodeSettings.retencionTerceros !== false && (
                    <tr className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-bold text-indigo-700">[538 / 542]</td>
                      <td className="py-2 px-3 font-sans text-slate-800">
                        IVA Retenido a Terceros / Cambio de Sujeto (Facturas de Compra con Retención)
                      </td>
                      <td className="py-2 px-3 text-right text-slate-500">Variable</td>
                      <td className="py-2 px-3 text-right text-slate-600">-</td>
                      <td className="py-2 px-3 text-right font-bold text-slate-900">
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-slate-400">$</span>
                          <input
                            type="number"
                            value={manualAdjustments.retencionTercerosManual || ''}
                            onChange={e => setManualAdjustments({ ...manualAdjustments, retencionTercerosManual: parseFloat(e.target.value) || 0 })}
                            className="w-32 bg-amber-50 border border-amber-300 rounded px-2 py-0.5 text-right font-mono font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500"
                            placeholder="0"
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* SECCIÓN V: PAGOS PROVISIONALES MENSUALES (PPM) */}
          {f29CodeSettings.ppm062 !== false && (
            <div className="space-y-2">
              <div className="flex items-center justify-between bg-slate-100 px-3 py-2 rounded-lg border border-slate-200">
                <span className="font-bold text-xs text-slate-800">
                  V. Pagos Provisionales Mensuales (PPM)
                </span>
                <span className="font-mono text-xs font-black text-slate-900">
                  PPM Determinado: ${ppmData.montoPPM.toLocaleString('es-CL')}
                </span>
              </div>

              <table className="w-full text-left text-xs border-collapse font-mono">
                <thead className="bg-slate-50 text-slate-600 border-b text-[11px] font-sans">
                  <tr>
                    <th className="py-2 px-3 w-20">Cód. SII</th>
                    <th className="py-2 px-3">Concepto PPM</th>
                    <th className="py-2 px-3 text-right">Base Imponible Ingresos Brutos ($)</th>
                    <th className="py-2 px-3 text-right">Tasa PPM (%)</th>
                    <th className="py-2 px-3 text-right">Monto PPM ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[11px]">
                  <tr className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-bold text-indigo-700">[120 / 115 / 62]</td>
                    <td className="py-2 px-3 font-sans text-slate-800">PPM Régimen {taxSettings.regimenTributario} sobre Ingresos del Giro</td>
                    <td className="py-2 px-3 text-right text-slate-700">${ppmData.baseImponibleVentas.toLocaleString('es-CL')}</td>
                    <td className="py-2 px-3 text-right font-bold text-indigo-700">
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="number"
                          step="0.01"
                          value={taxSettings.ppmRate}
                          onChange={e => setTaxSettings({ ...taxSettings, ppmRate: parseFloat(e.target.value) || 0 })}
                          className="w-20 bg-amber-50 border border-amber-300 rounded px-1.5 py-0.5 text-right font-mono font-bold text-indigo-900 focus:ring-2 focus:ring-indigo-500"
                        />
                        <span>%</span>
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right font-black text-slate-900">${ppmData.montoPPM.toLocaleString('es-CL')}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* SECCIÓN V.B: CÓDIGOS ADICIONALES POR GIRO DE LA EMPRESA */}
          {customCodes.some(c => c.active) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between bg-slate-100 px-3 py-2 rounded-lg border border-slate-200">
                <span className="font-bold text-xs text-slate-800">
                  Códigos Adicionales por Giro de la Empresa (ILA, Retenciones Específicas, etc.)
                </span>
                <span className="font-mono text-xs font-black text-slate-900">
                  Total Adicionales: ${(resumenF29.customCodesTotal || 0).toLocaleString('es-CL')}
                </span>
              </div>

              <table className="w-full text-left text-xs border-collapse font-mono">
                <thead className="bg-slate-50 text-slate-600 border-b text-[11px] font-sans">
                  <tr>
                    <th className="py-2 px-3 w-20">Cód. SII</th>
                    <th className="py-2 px-3">Concepto Tributario por Giro</th>
                    <th className="py-2 px-3">Sección F29</th>
                    <th className="py-2 px-3 text-right">Monto a Declarar ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[11px]">
                  {customCodes.filter(c => c.active).map(code => (
                    <tr key={code.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-bold text-indigo-700">[{code.code}]</td>
                      <td className="py-2 px-3 font-sans text-slate-800">{code.name}</td>
                      <td className="py-2 px-3 text-slate-500 font-sans text-[11px]">{code.section}</td>
                      <td className="py-2 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-slate-400">$</span>
                          <input
                            type="number"
                            value={code.amount || ''}
                            onChange={e => {
                              const val = parseFloat(e.target.value) || 0;
                              setCustomCodes(customCodes.map(c => c.id === code.id ? { ...c, amount: val } : c));
                            }}
                            className="w-32 bg-amber-50 border border-amber-300 rounded px-2 py-0.5 text-right font-mono font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500"
                            placeholder="0"
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* CAMPOS DE INGRESO MANUAL Y ADICIONALES */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <h4 className="text-xs font-black uppercase text-slate-800 flex items-center gap-2">
              <span>✍️</span>
              <span>Valores de Ingreso Manual y Ajustes Adicionales (No Automatizados)</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Impuesto Único Sueldos ($):</label>
                <input
                  type="number"
                  value={manualAdjustments.impuestoUnicoManual}
                  onChange={e => setManualAdjustments({ ...manualAdjustments, impuestoUnicoManual: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 font-mono font-bold text-slate-900"
                />
                <span className="text-[10px] text-slate-500">Cód. 48/49 (Remuneraciones).</span>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">IVA Retenido Terceros / C.Sujeto ($):</label>
                <input
                  type="number"
                  value={manualAdjustments.retencionTercerosManual}
                  onChange={e => setManualAdjustments({ ...manualAdjustments, retencionTercerosManual: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 font-mono font-bold text-slate-900"
                />
                <span className="text-[10px] text-slate-500">Cód. 538 / Facturas compra retención.</span>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Otros Impuestos F29 ($):</label>
                <input
                  type="number"
                  value={manualAdjustments.otrosImpuestosManual}
                  onChange={e => setManualAdjustments({ ...manualAdjustments, otrosImpuestosManual: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 font-mono font-bold text-slate-900"
                />
                <span className="text-[10px] text-slate-500">Impuestos específicos o adicionales.</span>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">PPM Voluntario / Adicional ($):</label>
                <input
                  type="number"
                  value={manualAdjustments.ppmAdicionalManual}
                  onChange={e => setManualAdjustments({ ...manualAdjustments, ppmAdicionalManual: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 font-mono font-bold text-slate-900"
                />
                <span className="text-[10px] text-slate-500">PPM voluntario extraordinario.</span>
              </div>
            </div>
          </div>

          {/* SECCIÓN VI: TOTAL A PAGAR EN GIRO */}
          <div className="p-4 bg-slate-900 text-white rounded-xl flex flex-col md:flex-row justify-between items-center gap-4">
            <div>
              <span className="text-xs text-slate-400 font-bold block">
                Total a Pagar en Caja / Banco / TGR
              </span>
              <span className="text-sm font-sans text-slate-300">
                Código [91] del Formulario 29 SII (IVA + Retenciones + PPM)
              </span>
            </div>

            <div className="text-right">
              <span className="text-2xl font-mono font-black text-amber-400 block">
                ${resumenF29.totalPagarF29.toLocaleString('es-CL')}
              </span>
            </div>
          </div>

          {/* CONTROL DE REGISTRO DE DECLARACIÓN (BLOCK AL FINAL DEL F29) */}
          <div className="bg-slate-900 text-white p-5 rounded-xl shadow-md space-y-4 mt-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-black uppercase tracking-tight text-white">
                  Control de Registro y Declaración en el SII (Período {selectedPeriod})
                </h4>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                declarationStatus === 'Pagado' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                declarationStatus === 'Declarado' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' :
                declarationStatus === 'Validado' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' :
                'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}>
                Estado: {declarationStatus}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block text-slate-400 font-bold uppercase text-[10px] mb-1">Estado F.29:</label>
                <select
                  value={declarationStatus}
                  onChange={e => setDeclarationStatus(e.target.value as any)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 font-bold text-white focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="Borrador"> Borrador / En Preparación</option>
                  <option value="Validado">✓ Validado por Contador</option>
                  <option value="Declarado"> Declarado en SII</option>
                  <option value="Pagado"> Pagado en Banco / TGR</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-bold uppercase text-[10px] mb-1">Nº de Folio Declaración SII:</label>
                <input
                  type="text"
                  placeholder="Ej: 982341928"
                  value={folioSII}
                  onChange={e => setFolioSII(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 font-mono font-bold text-indigo-300 focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-bold uppercase text-[10px] mb-1">Archivo / PDF Resumen F.29:</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="URL del PDF o nombre del archivo..."
                    value={pdfResumenUrl}
                    onChange={e => setPdfResumenUrl(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 font-mono text-slate-300 focus:ring-2 focus:ring-indigo-500"
                  />
                  <label className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-lg cursor-pointer text-xs whitespace-nowrap transition-colors">
                    <span> Adjuntar</span>
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      onChange={e => {
                        if (e.target.files && e.target.files[0]) {
                          setPdfResumenUrl(e.target.files[0].name);
                        }
                      }}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={handleSaveDeclaration}
                disabled={isSubmitting}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-lg shadow-md transition-colors flex items-center gap-2 text-xs"
              >
                <span>{isSubmitting ? 'Guardando Registro...' : 'Guardar y Registrar Declaración F.29'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: AUDITORÍA Y TRAZABILIDAD RCV */}
      {activeTab === 'auditoria' && (
        <div className="bg-white rounded-b-xl border border-slate-200 shadow-xs p-4 space-y-4">
          <div className="flex justify-between items-center">
            <h4 className="text-xs font-bold uppercase text-slate-900">
              Detalle de Documentos Tributarios Electrónicos del Período {selectedPeriod} ({periodDocs.length} DTEs)
            </h4>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left text-xs border-collapse font-mono">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[11px] font-sans">
                <tr>
                  <th className="py-2.5 px-3">Registro</th>
                  <th className="py-2.5 px-2.5">Emisión</th>
                  <th className="py-2.5 px-2.5">Tipo</th>
                  <th className="py-2.5 px-2.5">Folio</th>
                  <th className="py-2.5 px-3">RUT Emisor / Contraparte</th>
                  <th className="py-2.5 px-3">Razón Social</th>
                  <th className="py-2.5 px-2.5 text-right">Neto ($)</th>
                  <th className="py-2.5 px-2.5 text-right">IVA / Ret ($)</th>
                  <th className="py-2.5 px-3 text-right">Total ($)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-[11px]">
                {periodDocs.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-400 font-sans italic">
                      No hay documentos cargados en el RCV para el período {selectedPeriod}.
                    </td>
                  </tr>
                ) : (
                  periodDocs.map(d => (
                    <tr key={d.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-sans font-bold">
                        <span className={`px-2 py-0.5 rounded text-[10px] ${
                          d.tipoRegistro === 'Venta'
                            ? 'bg-emerald-100 text-emerald-800'
                            : d.tipoRegistro === 'Compra'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {d.tipoRegistro}
                        </span>
                      </td>
                      <td className="py-2 px-2.5 text-slate-600">{d.fechaEmision}</td>
                      <td className="py-2 px-2.5 font-sans font-semibold">{d.tipoDoc}</td>
                      <td className="py-2 px-2.5 font-bold text-indigo-700">{d.folio}</td>
                      <td className="py-2 px-3 font-semibold text-slate-800">{formatearRut(d.rutEmisor)}</td>
                      <td className="py-2 px-3 font-sans truncate max-w-xs text-slate-900">{d.razonSocialEmisor}</td>
                      <td className="py-2 px-2.5 text-right text-slate-700">${(d.montoNeto || 0).toLocaleString('es-CL')}</td>
                      <td className="py-2 px-2.5 text-right font-bold text-indigo-700">${(d.montoIva || 0).toLocaleString('es-CL')}</td>
                      <td className="py-2 px-3 text-right font-black text-slate-900">${d.montoTotal.toLocaleString('es-CL')}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: PARÁMETROS TRIBUTARIOS Y AJUSTES */}
      {activeTab === 'parametros' && (
        <div className="bg-white rounded-b-xl border border-slate-200 shadow-xs p-5 space-y-6">
          <div className="border-b border-slate-200 pb-4">
            <h4 className="text-sm font-black uppercase text-slate-900 flex items-center gap-2">
              <span>Configuración y Maestro de Códigos F.29 (Activación por Empresa)</span>
            </h4>
            <p className="text-xs text-slate-500 mt-1">
              Seleccione qué secciones y códigos del Formulario 29 utiliza habitualmente esta sociedad. Los códigos desactivados no se desplegarán en el formulario de cálculo.
            </p>
          </div>

          {/* GIRO CONSTRUCTORA Y REMANENTE INICIAL DE APERTURA */}
          <div className="bg-amber-50/50 border border-amber-200 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold uppercase text-amber-950 flex items-center gap-1.5">
                  <span>Tratamiento Tributario Especial para Empresas Constructoras (CEEC Art. 21 D.L. 910)</span>
                </h4>
                <p className="text-[11px] text-amber-800 mt-0.5">
                  Active esta opción para habilitar la deducción del Crédito Especial a Empresas Constructoras en la línea [126 / 128] del Débito Fiscal sobre ventas y contratos habitacionales.
                </p>
              </div>
              <label className="flex items-center gap-2 p-2 bg-white rounded-lg border border-amber-300 cursor-pointer font-bold text-xs text-amber-900 shadow-2xs">
                <input
                  type="checkbox"
                  checked={isConstructoraSetting}
                  onChange={e => setIsConstructoraSetting(e.target.checked)}
                  className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4"
                />
                <span>Empresa Constructora (Aplica CEEC)</span>
              </label>
            </div>

            <div className="border-t border-amber-200 pt-3">
              <h4 className="text-xs font-bold uppercase text-slate-900 mb-1">
                 Remanente de Crédito Fiscal Inicial / Apertura del Sistema
              </h4>
              <p className="text-[11px] text-slate-600 mb-2">
                Si esta empresa viene con saldo remanente de IVA anterior al ingresar a este sistema, defina su valor de partida en UTM o Pesos ($):
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 text-xs mb-1">Remanente Inicial en UTM (Cód. 504):</label>
                  <input
                    type="number"
                    step="0.01"
                    value={initialRemanenteUTMSetting || ''}
                    onChange={e => {
                      const utm = parseFloat(e.target.value) || 0;
                      setInitialRemanenteUTMSetting(utm);
                      if (taxSettings.utmValue > 0) {
                        setInitialRemanentePesosSetting(Math.round(utm * taxSettings.utmValue));
                      }
                    }}
                    placeholder="0.00"
                    className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 font-mono font-bold text-xs text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 text-xs mb-1">Remanente Inicial en Pesos ($ - Cód. 563):</label>
                  <input
                    type="number"
                    value={initialRemanentePesosSetting || ''}
                    onChange={e => {
                      const pesos = parseFloat(e.target.value) || 0;
                      setInitialRemanentePesosSetting(pesos);
                      if (taxSettings.utmValue > 0) {
                        setInitialRemanenteUTMSetting(parseFloat((pesos / taxSettings.utmValue).toFixed(2)));
                      }
                    }}
                    placeholder="0"
                    className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 font-mono font-bold text-xs text-slate-900"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="text-xs font-bold uppercase text-slate-900">
                  Plan de Cuentas para Asiento de Centralización F.29 y Corrección Monetaria
                </h4>
                <p className="text-[11px] text-slate-500">
                  Seleccione las cuentas contables de la empresa utilizadas para generar automáticamente el asiento de liquidación tributaria y reajuste de remanente.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Cuenta IVA Débito Fiscal (Debe):</label>
                <select
                  value={f29AccountParams.ivaDebitoAccountId}
                  onChange={e => setF29AccountParams({ ...f29AccountParams, ivaDebitoAccountId: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-sans"
                >
                  <option value="">-- Sin asignar (se pedirá al contabilizar) --</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Cuenta IVA Crédito Fiscal (Haber):</label>
                <select
                  value={f29AccountParams.ivaCreditoAccountId}
                  onChange={e => setF29AccountParams({ ...f29AccountParams, ivaCreditoAccountId: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-sans"
                >
                  <option value="">-- Sin asignar (se pedirá al contabilizar) --</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Cuenta Remanente Crédito Fiscal (Activo):</label>
                <select
                  value={f29AccountParams.remanenteAccountId}
                  onChange={e => setF29AccountParams({ ...f29AccountParams, remanenteAccountId: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-sans"
                >
                  <option value="">-- Sin asignar (se pedirá al contabilizar) --</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-emerald-800 mb-1">Cuenta Corrección Monetaria / Reajuste Remanente (Ganancia):</label>
                <select
                  value={f29AccountParams.correccionMonetariaAccountId}
                  onChange={e => setF29AccountParams({ ...f29AccountParams, correccionMonetariaAccountId: e.target.value })}
                  className="w-full bg-emerald-50 border border-emerald-300 rounded px-2.5 py-1.5 font-sans font-semibold text-emerald-900"
                >
                  <option value="">-- Sin asignar (se pedirá al contabilizar) --</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Cuenta IVA Postergado por Pagar (Pasivo):</label>
                <select
                  value={f29AccountParams.ivaPostergadoAccountId}
                  onChange={e => setF29AccountParams({ ...f29AccountParams, ivaPostergadoAccountId: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-sans"
                >
                  <option value="">-- Sin asignar (se pedirá al contabilizar) --</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Cuenta IVA Determinado por Pagar (Pasivo Banco/TGR):</label>
                <select
                  value={f29AccountParams.ivaPagarAccountId}
                  onChange={e => setF29AccountParams({ ...f29AccountParams, ivaPagarAccountId: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-sans"
                >
                  <option value="">-- Sin asignar (se pedirá al contabilizar) --</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Cuenta PPM Pagos Provisionales (Activo):</label>
                <select
                  value={f29AccountParams.ppmAccountId}
                  onChange={e => setF29AccountParams({ ...f29AccountParams, ppmAccountId: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-sans"
                >
                  <option value="">-- Sin asignar (se pedirá al contabilizar) --</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Cuenta Retención Honorarios 2da Cat (Pasivo):</label>
                <select
                  value={f29AccountParams.retencionHonorariosAccountId}
                  onChange={e => setF29AccountParams({ ...f29AccountParams, retencionHonorariosAccountId: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-sans"
                >
                  <option value="">-- Sin asignar (se pedirá al contabilizar) --</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* CÓDIGOS ADICIONALES POR GIRO DE LA EMPRESA */}
          <div className="border-t border-slate-200 pt-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="text-xs font-bold uppercase text-slate-900">
                  Códigos Especiales y Específicos por Giro de Negocio
                </h4>
                <p className="text-[11px] text-slate-500">
                  Active o agregue nuevos códigos del Formulario 29 según el giro específico de la empresa (Molinería, Carnes, Minería, Licores, Bebidas, etc.).
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const newCodeNum = prompt('Ingrese el Código SII (Ej: 544, 585, 763):');
                  if (!newCodeNum) return;
                  const newName = prompt('Nombre o Glosa del Impuesto / Retención:', 'Impuesto Adicional');
                  if (!newName) return;
                  const newCustom: CustomF29Code = {
                    id: `c_${newCodeNum}_${Date.now()}`,
                    code: newCodeNum.trim(),
                    name: newName.trim(),
                    section: 'ImpuestoAdicional',
                    amount: 0,
                    active: true
                  };
                  setCustomCodes([...customCodes, newCustom]);
                }}
                className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg border border-indigo-200 text-xs flex items-center gap-1 transition-colors"
              >
                <span> Agregar Código Personalizado</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 text-xs">
              {customCodes.map(c => (
                <div key={c.id} className={`p-2.5 rounded-lg border flex items-center justify-between ${
                  c.active ? 'bg-indigo-50/60 border-indigo-200' : 'bg-slate-50 border-slate-200 opacity-70'
                }`}>
                  <label className="flex items-center gap-2 cursor-pointer flex-1">
                    <input
                      type="checkbox"
                      checked={c.active}
                      onChange={e => {
                        setCustomCodes(customCodes.map(item => item.id === c.id ? { ...item, active: e.target.checked } : item));
                      }}
                      className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                    />
                    <div>
                      <span className="font-bold text-indigo-900 block">[{c.code}] {c.name}</span>
                      <span className="text-[10px] text-slate-500 font-sans">{c.section}</span>
                    </div>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`¿Eliminar código [${c.code}] ${c.name}?`)) {
                        setCustomCodes(customCodes.filter(item => item.id !== c.id));
                      }
                    }}
                    className="text-slate-400 hover:text-rose-600 font-bold p-1 text-xs"
                    title="Eliminar código"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4 flex justify-end">
            <button
              onClick={handleSaveCompanyF29Settings}
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-sm text-xs flex items-center gap-2 transition-colors"
            >
              <span>{isSubmitting ? 'Guardando...' : 'Guardar Parámetros y Códigos de la Empresa'}</span>
            </button>
          </div>
        </div>
      )}

      {/* TAB 4: HISTORIAL DE DECLARACIONES F29 */}
      {activeTab === 'historial' && (
        <div className="bg-white rounded-b-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse font-mono">
              <thead className="bg-slate-900 text-white text-[11px] uppercase tracking-wider font-bold">
                <tr>
                  <th className="py-2.5 px-3">Período</th>
                  <th className="py-2.5 px-3">Estado</th>
                  <th className="py-2.5 px-3">Folio SII</th>
                  <th className="py-2.5 px-3 text-right">Débito Fiscal ($)</th>
                  <th className="py-2.5 px-3 text-right">Crédito Fiscal ($)</th>
                  <th className="py-2.5 px-3 text-right">PPM ($)</th>
                  <th className="py-2.5 px-3 text-right">Retenciones ($)</th>
                  <th className="py-2.5 px-3 text-right">Total Giro F29 ($)</th>
                  <th className="py-2.5 px-3 text-center">Asiento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-[11px]">
                {savedDeclarations.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-400 font-sans italic">
                      No hay declaraciones de F29 guardadas en el historial.
                    </td>
                  </tr>
                ) : (
                  savedDeclarations.map(dec => (
                    <tr key={dec.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-bold text-indigo-700">{dec.period}</td>
                      <td className="py-2 px-3 font-sans">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          dec.status === 'Pagado'
                            ? 'bg-emerald-100 text-emerald-800'
                            : dec.status === 'Declarado'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {dec.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-mono">{dec.folioSII || '-'}</td>
                      <td className="py-2 px-3 text-right text-slate-800">${dec.debitoFiscal.totalDebitoFiscal.toLocaleString('es-CL')}</td>
                      <td className="py-2 px-3 text-right text-slate-800">${dec.creditoFiscal.totalCreditoFiscal.toLocaleString('es-CL')}</td>
                      <td className="py-2 px-3 text-right text-slate-800">${dec.ppm.montoPPM.toLocaleString('es-CL')}</td>
                      <td className="py-2 px-3 text-right text-slate-800">${dec.retenciones.totalRetenciones.toLocaleString('es-CL')}</td>
                      <td className="py-2 px-3 text-right font-black text-rose-700">${dec.resumen.totalPagarF29.toLocaleString('es-CL')}</td>
                      <td className="py-2 px-3 text-center font-sans">
                        {dec.voucherNumber ? (
                          <span className="text-[10px] bg-slate-100 text-indigo-800 px-1.5 py-0.5 rounded font-bold">
                            Asiento N° {dec.voucherNumber}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">Sin contabilizar</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL RESUMEN CLIENTE & WHATSAPP (IMAGEN) */}
      {showClientSummaryModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-base tracking-tight">Resumen Ejecutivo para Cliente (Formato Imagen WhatsApp)</h4>
                  <p className="text-xs text-slate-300">Empresa: {company.name || company.razonSocial} | Período: {selectedPeriod}</p>
                </div>
              </div>
              <button
                onClick={() => setShowClientSummaryModal(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body: Printable / Image Card Container Ref */}
            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto bg-slate-100 text-xs font-sans">
              <div ref={summaryCardRef} className="bg-white rounded-xl border border-slate-300 p-6 shadow-sm space-y-5">
                {/* Header Card */}
                <div className="border-b pb-3 flex justify-between items-center bg-slate-50 p-3 rounded-lg">
                  <div>
                    <h5 className="font-black text-slate-900 uppercase text-sm tracking-wide">{company.name || company.razonSocial}</h5>
                    <p className="text-slate-600 text-[11px]">RUT: {formatearRut(company.rut)}</p>
                  </div>
                </div>

                {/* 2-Column Grid matching Excel layout */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                  {/* Left Column (7 cols): Ventas/Compras table, Boletas summary, PPM summary, Total a Pagar */}
                  <div className="lg:col-span-7 space-y-4">
                    {/* Table 1: Ventas & Compras */}
                    <div className="border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
                      <table className="w-full text-left font-mono">
                        <thead className="bg-slate-800 text-white text-[10px] uppercase">
                          <tr>
                            <th className="py-2 px-3 font-sans">Concepto</th>
                            <th className="py-2 px-2.5 text-right font-sans">Exento</th>
                            <th className="py-2 px-2.5 text-right font-sans">Neto</th>
                            <th className="py-2 px-2.5 text-right font-sans">IVA</th>
                            <th className="py-2 px-2.5 text-right font-sans">IVA sin crédito</th>
                            <th className="py-2 px-3 text-right font-sans">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-[11px] text-slate-800">
                          {filasResumen.map((r, idx) => (
                            <tr key={r.concepto} className={idx % 2 ? 'bg-slate-50' : ''}>
                              <td className="py-2 px-3 font-bold font-sans">{r.concepto}</td>
                              <td className="py-2 px-2.5 text-right">${r.exento.toLocaleString('es-CL')}</td>
                              <td className="py-2 px-2.5 text-right">${r.neto.toLocaleString('es-CL')}</td>
                              <td className="py-2 px-2.5 text-right">${r.iva.toLocaleString('es-CL')}</td>
                              <td className="py-2 px-2.5 text-right">${r.noRec.toLocaleString('es-CL')}</td>
                              <td className="py-2 px-3 text-right font-bold">${r.total.toLocaleString('es-CL')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Card 2: Boletas de Honorarios (Summary Card with aligned numerical values) */}
                    <div className="border border-slate-200 rounded-lg p-3.5 bg-white space-y-2 shadow-2xs">
                      <h6 className="font-bold text-slate-800 text-xs border-b border-slate-100 pb-1.5 flex justify-between items-center">
                        <span>Boletas de Honorarios</span>
                      </h6>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-600 font-sans">• Retención Honorarios:</span>
                        <span className="font-mono font-bold text-indigo-700">${retencionesData.retencionHonorarios.toLocaleString('es-CL')}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-600 font-sans">• Impuesto Único (Cód 48):</span>
                        <span className="font-mono font-bold text-indigo-700">${retencionesData.impuestoUnicoTrabajadores.toLocaleString('es-CL')}</span>
                      </div>
                    </div>

                    {/* Card 3: PPM (Summary Card with aligned numerical values) */}
                    <div className="border border-slate-200 rounded-lg p-3.5 bg-white space-y-2 shadow-2xs">
                      <h6 className="font-bold text-slate-800 text-xs border-b border-slate-100 pb-1.5">
                        Pagos Provisionales Mensuales (PPM)
                      </h6>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-600 font-sans">Base imponible (ingresos del mes)</span>
                        <span className="font-mono font-bold text-slate-900">${ppmData.baseImponibleVentas.toLocaleString('es-CL')}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-sans pl-3">
                        Ventas afectas ${ppmBreakdown.afectas.toLocaleString('es-CL')} + exentas ${ppmBreakdown.exentas.toLocaleString('es-CL')} + exportaciones ${ppmBreakdown.exportaciones.toLocaleString('es-CL')}
                      </p>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-600 font-sans">Tasa PPM</span>
                        <span className="font-mono font-bold text-slate-900">{taxSettings.ppmRate}%</span>
                      </div>
                      <div className="flex justify-between items-center text-xs border-t border-slate-300 pt-2 mt-1">
                        <span className="text-slate-900 font-sans font-bold">Impuesto determinado (PPM)</span>
                        <span className="font-mono font-extrabold text-indigo-700">${ppmData.montoPPM.toLocaleString('es-CL')}</span>
                      </div>
                    </div>

                    {/* Card 4: Resumen General / Total a Pagar F29 (Cód. 91) */}
                    <div className="bg-slate-900 text-white rounded-xl p-4 shadow-md space-y-3">
                      <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                        <span className="font-black text-xs text-slate-300">TOTAL A PAGAR F29</span>
                        <span className="font-mono text-xl font-black text-emerald-400">${resumenF29.totalPagarF29.toLocaleString('es-CL')}</span>
                      </div>
                      <div className="text-xs space-y-1 text-slate-400">
                        <div className="flex justify-between"><span>IVA Neto:</span><span>${resumenF29.ivaPagarNetoPostergacion.toLocaleString('es-CL')}</span></div>
                        <div className="flex justify-between"><span>Retenciones (Honorarios/Imp. Único):</span><span>${(retencionesData.retencionHonorarios + retencionesData.impuestoUnicoTrabajadores).toLocaleString('es-CL')}</span></div>
                        <div className="flex justify-between"><span>PPM:</span><span>${ppmData.montoPPM.toLocaleString('es-CL')}</span></div>
                      </div>
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pt-1 border-t border-slate-800 mt-2">
                        <div className="text-amber-400 font-bold text-xs font-sans whitespace-nowrap">
                          PLAZO DE PAGO:
                        </div>
                        <div className="flex items-center gap-1.5 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">
                          <input
                            type="text"
                            value={plazoPagoFecha}
                            onChange={e => setPlazoPagoFecha(e.target.value)}
                            className="bg-transparent text-white font-mono font-bold text-xs focus:outline-none w-72 max-w-full text-right"
                            placeholder="Ej. viernes 20 de noviembre de 2026"
                          />
                        </div>
                        {(plazoManual ? 'Fecha editada a mano.' : plazoCalculado.nota) && (
                          <p className="w-full text-[10px] text-slate-500 font-sans sm:text-right">{plazoManual ? 'Fecha editada a mano.' : plazoCalculado.nota}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Column (5 cols): Detalle Boletas de Honorarios (Grows naturally with boletas count) */}
                  <div className="lg:col-span-5">
                    <div className="border border-slate-200 rounded-lg overflow-hidden shadow-2xs bg-white">
                      <div className="bg-slate-800 text-white font-bold text-xs py-2.5 px-3">
                        Detalle Boletas de Honorarios
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left font-mono text-[11px]">
                          <thead className="bg-slate-100 text-slate-700 text-[10px] uppercase border-b border-slate-200">
                            <tr>
                              <th className="py-2 px-2.5 font-sans">N°</th>
                              <th className="py-2 px-2.5 font-sans">Prestador</th>
                              <th className="py-2 px-2.5 text-right font-sans">Retención ($)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {honorariosDocsList.length === 0 ? (
                              <tr>
                                <td colSpan={3} className="py-6 text-center text-slate-400 font-sans italic">
                                  No hay boletas registradas en este período.
                                </td>
                              </tr>
                            ) : (
                              honorariosDocsList.map((h, idx) => {
                                const ret = (h.folio === '55853' || String(h.folio || '').includes('55853') || (h.razonSocialEmisor || '').toLowerCase().includes('notario')) 
                                    ? 0 
                                    : (h.montoRetencion || h.montoIva || Math.round((h.montoBruto || h.montoNeto || 0) * (taxSettings.honorariosTaxRate / 100)));
                                return (
                                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                    <td className="py-1.5 px-2.5 font-bold text-slate-800">{h.folio || '-'}</td>
                                    <td className="py-1.5 px-2.5 font-sans text-slate-700 truncate max-w-[170px]" title={h.razonSocialEmisor || h.razonSocialReceptor}>
                                      {(h.razonSocialEmisor || h.razonSocialReceptor || 'Prestador').toUpperCase()}
                                    </td>
                                    <td className="py-1.5 px-2.5 text-right font-bold text-slate-900">${ret.toLocaleString('es-CL')}</td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                          <tfoot className="bg-slate-100 border-t border-slate-200 font-bold">
                            <tr>
                              <td colSpan={2} className="py-2 px-3 font-sans text-xs text-slate-800">Total Retención:</td>
                              <td className="py-2 px-3 text-right font-mono text-xs text-indigo-700 font-black">
                                ${retencionesData.retencionHonorarios.toLocaleString('es-CL')}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="bg-slate-100 px-6 py-4 border-t border-slate-200 flex items-center justify-between gap-3">
              <span className="text-slate-500 text-[11px] font-sans">
                 Descarga la tarjeta como imagen PNG de alta calidad para enviarla de forma ordenada por WhatsApp.
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowClientSummaryModal(false)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Cerrar
                </button>
                <button
                  onClick={handleCopyImage}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold shadow-md transition-colors flex items-center gap-2 cursor-pointer"
                  title="Copiar imagen al portapapeles para pegar con Ctrl+V en WhatsApp"
                >
                  <Copy className="w-4 h-4 text-slate-300" />
                  <span> Copiar Imagen</span>
                </button>
                <button
                  onClick={handleDownloadImage}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition-colors flex items-center gap-2 cursor-pointer"
                  title="Descargar archivo PNG en alta resolución"
                >
                  <Share2 className="w-4 h-4 text-emerald-200" />
                  <span> Descargar Imagen (PNG)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
