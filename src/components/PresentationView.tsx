import React, { useState, useEffect, useRef } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Maximize2, 
  Minimize2, 
  Play, 
  Pause,
  RotateCcw,
  Volume2, 
  VolumeX,
  Copy, 
  Check, 
  Sparkles, 
  Video, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  FileSpreadsheet, 
  ShieldCheck, 
  Building2, 
  ArrowRight, 
  ArrowLeft,
  TrendingUp, 
  Zap, 
  Clock, 
  DollarSign, 
  PieChart, 
  Lock, 
  Send, 
  Share2, 
  MessageCircle, 
  Instagram, 
  Facebook, 
  Smartphone, 
  Layers, 
  ExternalLink,
  Download,
  Award,
  Image as ImageIcon,
  Loader2,
  Eye,
  Grid,
  X,
  Archive
} from 'lucide-react';
import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import { 
  renderSlideToCanvas, 
  getSlideDataUrl, 
  downloadSlidePNGDirect, 
  SLIDES_METADATA 
} from '../utils/slideCanvasRenderer';
import { APP_VERSION } from '../constants/version';
import socialSquareImg from '../assets/images/gestok_social_square_1788373265590.jpg';
import storyReelImg from '../assets/images/gestok_story_reel_1788373282275.jpg';

interface ReelScene {
  id: number;
  durationSeconds: number;
  badge: string;
  hookText: string;
  subText: string;
  narration: string;
  highlightWords: string[];
}

export default function PresentationView() {
  // Pestañas principales de Redes Sociales y Formatos
  const [activeTab, setActiveTab] = useState<'whatsapp' | 'instagram' | 'facebook' | 'videotour'>('whatsapp');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentSlideCardRef = useRef<HTMLDivElement>(null);
  const offscreenSlidesContainerRef = useRef<HTMLDivElement>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<string>('');
  const [showGalleryModal, setShowGalleryModal] = useState(false);

  // ESTADO INSTAGRAM: Selector de Carrusel (1:1) vs Reel/Story (9:16)
  const [instagramFormat, setInstagramFormat] = useState<'carousel' | 'reel'>('carousel');
  const [currentSlideIdx, setCurrentSlideIdx] = useState(0);

  // ESTADO REEL / VIDEO TOUR ANIMADO
  const [activeReelIdx, setActiveReelIdx] = useState(0);
  const [isPlayingReel, setIsPlayingReel] = useState(false);
  const [reelProgress, setReelProgress] = useState(0);
  const [voiceEnabled, setVoiceEnabled] = useState(false);

  // ESTADO WHATSAPP: Mensaje para Grupos vs Mensaje Directo
  const [whatsappTemplate, setWhatsappTemplate] = useState<'group' | 'direct'>('group');
  const [flyerDataUrl, setFlyerDataUrl] = useState<string>('');

  useEffect(() => {
    try {
      const url = getSlideDataUrl(0);
      setFlyerDataUrl(url);
    } catch (e) {
      console.error('Error generando preview de lámina:', e);
    }
  }, []);

  // ESCENAS DEL VIDEO REEL VERTICAL (9:16) Y TOUR VISUAL (PANTALLAS REALES DEL SISTEMA)
  const reelScenes: ReelScene[] = [
    {
      id: 1,
      durationSeconds: 6,
      badge: "COCKPIT UNIFICADO",
      hookText: "CONTROL TOTAL DE TU ESTUDIO EN 1 PANTALLA",
      subText: "Barra ejecutiva unificada: indicadores UF/Dólar en tiempo real y bloqueo seguro de periodos.",
      narration: "¿Cansado de sistemas lentos y dispersos? Pulso Contable unifica la gestión contable de tu empresa con indicadores chilenos en vivo y navegación instantánea.",
      highlightWords: ["CONTROL TOTAL", "INDICADORES", "PULSO CONTABLE"]
    },
    {
      id: 2,
      durationSeconds: 7,
      badge: "RCV OFICIAL SII",
      hookText: "CARGA MASIVA RCV Y HONORARIOS EN 2 SEG",
      subText: "Importa compras, ventas y boletas BHE oficiales: cero duplicados y creación automática de auxiliares.",
      narration: "Arrastra tus compras, ventas y boletas de honorarios oficiales del SII. El sistema valida duplicados y crea los asientos contables en segundos.",
      highlightWords: ["CARGA MASIVA", "CERO DUPLICADOS", "ASIENTOS"]
    },
    {
      id: 3,
      durationSeconds: 7,
      badge: "LIBRO DIARIO & AUDITORÍA",
      hookText: "GRILLA EXCEL CON BLINDAJE TRIBUTARIO",
      subText: "Partida doble estricta con validación bloqueante de RUT, documentos y centros de costos.",
      narration: "Comprobantes contables ágiles como Excel pero blindados. Imposible guardar con descuadres de RUT o centro de costos.",
      highlightWords: ["GRILLA EXCEL", "BLINDAJE", "CERO DESCUADRES"]
    },
    {
      id: 4,
      durationSeconds: 7,
      badge: "TESORERÍA INTELIGENTE",
      hookText: "CONCILIACIÓN BANCARIA EN 1 CLIC",
      subText: "Cruza cartolas de cualquier banco chileno contra facturas: Saldo Cartola = Saldo Libro Mayor.",
      narration: "Sube la cartola de cualquier banco y concilia tus facturas en un solo clic manteniendo el banco 100% cuadrado.",
      highlightWords: ["1 CLIC", "CUALQUIER BANCO", "BANCO CUADRADO"]
    },
    {
      id: 5,
      durationSeconds: 6,
      badge: "CIERRE Y F29",
      hookText: "F29 Y BALANCE 8 COLUMNAS IFRS AL DÍA",
      subText: "IVA débito, crédito, retención BHE y balance mayorizado en tiempo real listos para exportar.",
      narration: "Obtén tu Formulario 29 mensual y el Balance de 8 Columnas clasificado sin trasnoches ni cálculos manuales.",
      highlightWords: ["F29", "BALANCE 8 COLUMNAS", "SIN TRASNOCHES"]
    },
    {
      id: 6,
      durationSeconds: 6,
      badge: "OFERTA LANZAMIENTO",
      hookText: "15 DÍAS DE PRUEBA GRATIS + MIGRACIÓN",
      subText: "Súmate al Programa de Estudios Fundadores con migración asistida y soporte por WhatsApp.",
      narration: "Pruébalo gratis por 15 días con migración asistida de tus datos. Escríbenos al WhatsApp +56 9 4631 8783 o entra a app.pulsocontable.cl.",
      highlightWords: ["15 DÍAS GRATIS", "MIGRACIÓN", "PULSOCONTABLE.CL"]
    }
  ];

  const currentReel = reelScenes[activeReelIdx];

  // LOCUCIÓN CON SÍNTESIS DE VOZ NAVEGADOR
  const speakNarration = (text: string) => {
    if (!voiceEnabled || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-CL';
    utterance.rate = 1.05;
    window.speechSynthesis.speak(utterance);
  };

  // CONTROL DEL SIMULADOR DE VIDEO / REEL
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isPlayingReel) {
      const sceneDuration = currentReel.durationSeconds * 1000;
      const tick = 100;
      interval = setInterval(() => {
        setReelProgress(prev => {
          const next = prev + (tick / sceneDuration) * 100;
          if (next >= 100) {
            if (activeReelIdx < reelScenes.length - 1) {
              setActiveReelIdx(idx => idx + 1);
              return 0;
            } else {
              setIsPlayingReel(false);
              return 100;
            }
          }
          return next;
        });
      }, tick);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlayingReel, activeReelIdx, currentReel.durationSeconds]);

  // Al cambiar de escena en reproducción con voz activa
  useEffect(() => {
    if (isPlayingReel && voiceEnabled) {
      speakNarration(currentReel.narration);
    }
  }, [activeReelIdx, isPlayingReel, voiceEnabled]);

  const togglePlayReel = () => {
    if (!isPlayingReel) {
      setIsPlayingReel(true);
      if (reelProgress >= 100) {
        setActiveReelIdx(0);
        setReelProgress(0);
      }
      if (voiceEnabled) speakNarration(currentReel.narration);
    } else {
      setIsPlayingReel(false);
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    }
  };

  const handleResetReel = () => {
    setIsPlayingReel(false);
    setActiveReelIdx(0);
    setReelProgress(0);
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  };

  const toggleVoice = () => {
    if (voiceEnabled) {
      setVoiceEnabled(false);
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    } else {
      setVoiceEnabled(true);
      if (isPlayingReel) speakNarration(currentReel.narration);
    }
  };

  // PANTALLA COMPLETA
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(console.error);
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(console.error);
    }
  };

  useEffect(() => {
    const handleFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFs);
    return () => document.removeEventListener('fullscreenchange', handleFs);
  }, []);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  // =========================================================================
  // TEXTOS FORMATEADOS PARA CADA RED SOCIAL
  // =========================================================================

  // WHATSAPP: MENSAJE PARA GRUPOS
  const whatsappGroupText = `🇨🇱 *¿CUÁNTAS HORAS PIERDE TU ESTUDIO CONTABLE AL MES DIGITANDO FACTURAS Y CUADRANDO BANCOS A MANO?* ⏱️

Colegas contadores y administradores, les presento *Pulso Contable*, la plataforma contable en la nube creada en Chile *por contadores para contadores*:

 *Conexión y Rescate RCV Seguro del SII:* Rescata compras, ventas y boletas de honorarios en 2 segundos con máxima seguridad y confidencialidad.
 *Importación Inteligente sin Duplicados:* Cargas los archivos del SII y el sistema detecta duplicados y crea los auxiliares automáticamente.
 *Conciliación Bancaria en 1 Clic:* Importas cartolas de cualquier banco y concilias facturas pendientes al instante.
 *Exigibilidad Estricta de Análisis:* Cero descuadres de RUT o Centro de Costo en auditorías.
 *Formulario 29 y Balance 8 Columnas IFRS:* Listos en tiempo real para cerrar el mes sin trasnoches.

 *LANZAMIENTO EXCLUSIVO:*
Estamos abriendo cupos para el *Programa de Estudios Fundadores*:
 *15 días de prueba 100% gratuita*.
 *Migración asistida* de tus empresas y plan de cuentas.
 *Tarifa preferencial congelada de por vida*.

 Agenda una demo rápida de 15 minutos o solicita tu acceso aquí:
 *WhatsApp Directo:* +56 9 4631 8783
 *Web:* https://app.pulsocontable.cl`;

  // WHATSAPP: MENSAJE DIRECTO 1 A 1
  const whatsappDirectText = `Hola [Nombre del Contador o Socio], ¿cómo estás? Te escribo porque sé lo desgastante que son los cierres mensuales y la digitación manual de facturas y cartolas bancarias.

Desarrollamos *Pulso Contable*, un software contable chileno en la nube que automatiza el 70% de la carga operativa:
- Rescata y carga masivamente RCV y Boletas de Honorarios BHE sin duplicados y con total seguridad.
- Concilia cartolas de cualquier banco en 1 clic.
- Genera el Formulario 29 mensual y el Balance de 8 columnas al día.

Te invito a probarlo gratis por 15 días con migración asistida de tu primera empresa para que compares la velocidad frente a sistemas tradicionales.

¿Tienes 10 minutos esta semana para mostrarte una demo rápida por pantalla? Escríbenos al WhatsApp +56 9 4631 8783 o entra a app.pulsocontable.cl. Un abrazo.`;

  // INSTAGRAM: COPY COMPLETO CON HASHTAGS
  const instagramPostCopy = `¿Sigues cerrando el mes a las 3 AM por culpa de la digitación manual? 

Los sistemas contables tradicionales y softwares obsoletos se quedaron en interfaces lentas, con cobros abusivos por cada usuario extra y sin automatizaciones reales.

Es momento de dar el salto a la contabilidad moderna 

Con Pulso Contable gestionas tu estudio contable con tecnología de punta:
 Rescate y carga automática de Compras, Ventas y Boletas de Honorarios desde el SII con validación anti-duplicados y total seguridad.
 Conciliación Bancaria en 1 clic de cualquier banco.
 Exigibilidad estricta que previene descuadres de análisis antes de guardar.
 Formulario 29 mensual y Balance IFRS de 8 columnas en tiempo real.

 BENEFICIO DE LANZAMIENTO:
Súmate hoy al Programa de Estudios Fundadores:
 15 Días Gratis de acceso completo.
 Migración asistida de tu plan de cuentas y empresas en menos de 48 hrs.
 Tarifa preferencial congelada de por vida.

 Comenta la palabra "DEMO"o entra a app.pulsocontable.cl
 Escríbenos directamente al WhatsApp: +56 9 4631 8783

---
#PulsoContable #ContadoresChile #ContabilidadChile #PymesChile #EmprendedoresChile #SoftwareContable #FacturaElectronica #SIIChile #OperacionRenta #EstudiosContables #FinanzasChile #GestionPyme #ConciliacionBancaria #Formulario29`;

  // FACEBOOK: POST PARA GRUPOS DE CONTADORES Y EMPRENDEDORES
  const facebookGroupPost = `ATENCIÓN CONTADORES Y SOCIOS DE ESTUDIOS EN CHILE: ¿Cuánto tiempo le dedican a tareas mecánicas que un software debería hacer solo?

Hicimos una encuesta con más de 40 contadores y encontramos 3 dolores comunes:
1️⃣ Digitar manualmente facturas y notas de crédito en softwares de escritorio obsoletos.
2️⃣ Cruzar cartolas bancarias en Excel a fin de mes persiguiendo diferencias de centavos.
3️⃣ Corregir descuadres de RUT y centros de costos justo antes de presentar el F29 o el Balance.

Por eso creamos Pulso Contable (https://app.pulsocontable.cl), la plataforma contable en la nube diseñada exclusivamente para la normativa chilena:

 CONEXIÓN Y RESCATE RCV SEGURO: Carga en segundos compras, ventas y boletas de honorarios con respaldo protegido en la nube.
 IMPORTADOR INTELIGENTE RCV: Arrastras el archivo del SII y en 3 segundos tienes registradas las compras y ventas con creación automática de fichas de proveedores/clientes.
 CONCILIACIÓN BANCARIA EN 1 CLIC: Reconoce cargos y abonos de cualquier banco y cruza contra tus facturas pendientes.
 AUDITORÍA Y F29 EN VIVO: El débito, crédito y retenciones de honorarios se calculan en tiempo real.

Estamos recibiendo a los primeros 25 estudios en el "Programa de Estudios Fundadores":
 15 días de prueba gratuita.
 Te ayudamos personalmente a migrar tus planes de cuentas y auxiliares.
 Precio congelado de por vida con usuarios ilimitados.

¿Te gustaría probarlo en tu estudio? Escribe "QUIERO DEMO" en los comentarios, entra a app.pulsocontable.cl o escríbenos al WhatsApp +56 9 4631 8783.`;

  // 6 LÁMINAS DEL CARRUSEL DE INSTAGRAM (1:1) - PANTALLAS Y MÓDULOS REALES DEL SISTEMA
  const carouselSlides = [
    {
      slideNum: "1/6",
      title: "ESPACIO CONTABLE UNIFICADO",
      subtitle: "Control total de tu empresa: indicadores oficiales UF/Dólar en tiempo real, bloqueo de periodos y barra ejecutiva.",
      badge: "COCKPIT & NAVEGACIÓN",
      accentColor: "from-indigo-600 to-blue-600",
      content: (
        <div className="space-y-2.5 text-left font-sans">
          {/* Simulador de Barra Unificada Real */}
          <div className="bg-slate-900 border border-slate-700/80 rounded-xl p-2.5 shadow-lg space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] pb-2 border-b border-slate-800">
              <div className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-bold text-[10px] border border-slate-700 flex items-center gap-1">
                  <ArrowLeft className="w-3 h-3 text-emerald-400" /> VOLVER
                </span>
                <span className="font-bold text-white">Ferretería Central SpA</span>
                <span className="text-[10px] text-slate-400 font-mono">76.123.456-7</span>
              </div>
              <div className="flex items-center gap-1 text-[10px]">
                <span className="px-1.5 py-0.5 bg-slate-800 text-emerald-400 font-bold rounded border border-slate-700">2025</span>
                <span className="px-1.5 py-0.5 bg-emerald-950 text-emerald-300 font-bold rounded border border-emerald-700/60 flex items-center gap-1">
                  OCTUBRE <Lock className="w-2.5 h-2.5 text-emerald-400" />
                </span>
                <span className="px-1.5 py-0.5 bg-indigo-950 text-indigo-300 font-mono rounded border border-indigo-700/60">
                  UF: $37.980,45
                </span>
                <span className="px-1.5 py-0.5 bg-cyan-950 text-cyan-300 font-mono rounded border border-cyan-700/60">
                  USD: $945,20
                </span>
              </div>
            </div>
            {/* Pestañas de trabajo contable */}
            <div className="flex items-center gap-1 overflow-x-auto text-[10px] font-semibold text-slate-300 pt-0.5">
              <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded border border-emerald-500/40">Resumen</span>
              <span className="px-2 py-0.5 bg-slate-800/80 text-slate-300 rounded">RCV</span>
              <span className="px-2 py-0.5 bg-slate-800/80 text-slate-300 rounded">Comprobantes</span>
              <span className="px-2 py-0.5 bg-slate-800/80 text-slate-300 rounded">Bancos</span>
              <span className="px-2 py-0.5 bg-slate-800/80 text-slate-300 rounded">F29</span>
              <span className="px-2 py-0.5 bg-slate-800/80 text-slate-300 rounded">Balance 8 Col.</span>
            </div>
          </div>

          {/* Tarjetas KPI Reales */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 bg-slate-900/90 rounded-lg border border-slate-800">
              <span className="text-[9.5px] text-slate-400 block font-semibold">VENTAS MES</span>
              <span className="text-xs font-mono font-bold text-emerald-400">$28.450.000</span>
              <span className="text-[8.5px] text-emerald-300 block">▲ +14.2%</span>
            </div>
            <div className="p-2 bg-slate-900/90 rounded-lg border border-slate-800">
              <span className="text-[9.5px] text-slate-400 block font-semibold">COMPRAS RCV</span>
              <span className="text-xs font-mono font-bold text-rose-400">$19.820.000</span>
              <span className="text-[8.5px] text-slate-400 block">100% Validadas</span>
            </div>
            <div className="p-2 bg-slate-900/90 rounded-lg border border-slate-800">
              <span className="text-[9.5px] text-slate-400 block font-semibold">MARGEN OPER.</span>
              <span className="text-xs font-mono font-bold text-cyan-400">$8.630.000</span>
              <span className="text-[8.5px] text-cyan-300 block">EBITDA 30.3%</span>
            </div>
          </div>

          <div className="p-2 bg-indigo-950/40 border border-indigo-700/50 rounded-lg flex items-center justify-between text-[10.5px] text-indigo-200">
            <span>⌘K Buscador Universal &bull; Atajos F1</span>
            <span className="font-mono font-bold text-emerald-400">Modo Pantalla Completa</span>
          </div>
        </div>
      )
    },
    {
      slideNum: "2/6",
      title: "CARGA MASIVA RCV Y HONORARIOS",
      subtitle: "Importa compras, ventas y boletas BHE oficiales: sin digitar a mano, cero duplicados y asignación automática.",
      badge: "RCV OFICIAL SII",
      accentColor: "from-teal-600 to-emerald-600",
      content: (
        <div className="space-y-2 text-left font-sans">
          <div className="flex items-center justify-between text-[11px] px-1">
            <span className="font-bold text-slate-200 flex items-center gap-1.5">
              <FileSpreadsheet className="w-3.5 h-3.5 text-teal-400" /> RCV Octubre 2025 (Oficial SII)
            </span>
            <span className="text-[10px] text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-700 font-bold">
              48 Documentos Validados
            </span>
          </div>
          {/* Mini Tabla Real */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow text-[10.5px]">
            <div className="grid grid-cols-12 bg-slate-800/80 p-1.5 font-bold text-slate-400 text-[10px]">
              <div className="col-span-2">Tipo</div>
              <div className="col-span-2">Folio</div>
              <div className="col-span-4">Razón Social</div>
              <div className="col-span-2 text-right">Neto</div>
              <div className="col-span-2 text-right">Total</div>
            </div>
            <div className="divide-y divide-slate-800/60">
              <div className="grid grid-cols-12 p-1.5 text-slate-200 items-center hover:bg-slate-800/40">
                <div className="col-span-2 text-emerald-400 font-bold">FC 33</div>
                <div className="col-span-2 font-mono">4580</div>
                <div className="col-span-4 truncate">SODIMAC S.A.</div>
                <div className="col-span-2 text-right font-mono">$1.250.000</div>
                <div className="col-span-2 text-right font-mono font-bold text-white">$1.487.500</div>
              </div>
              <div className="grid grid-cols-12 p-1.5 text-slate-200 items-center hover:bg-slate-800/40">
                <div className="col-span-2 text-emerald-400 font-bold">FC 33</div>
                <div className="col-span-2 font-mono">1204</div>
                <div className="col-span-4 truncate">ENEL DISTRIBUCION</div>
                <div className="col-span-2 text-right font-mono">$480.000</div>
                <div className="col-span-2 text-right font-mono font-bold text-white">$571.200</div>
              </div>
              <div className="grid grid-cols-12 p-1.5 text-slate-200 items-center hover:bg-slate-800/40">
                <div className="col-span-2 text-rose-400 font-bold">NC 61</div>
                <div className="col-span-2 font-mono">312</div>
                <div className="col-span-4 truncate">DISTRIB. SUR LTDA</div>
                <div className="col-span-2 text-right font-mono text-rose-300">-$85.000</div>
                <div className="col-span-2 text-right font-mono font-bold text-rose-400">-$101.150</div>
              </div>
            </div>
          </div>
          <div className="p-2 bg-teal-950/40 border border-teal-800/50 rounded-lg flex items-center justify-between text-[11px] text-teal-300">
            <span>✓ Cero duplicados garantizado</span>
            <span className="font-mono font-bold">Asiento Contable Auto</span>
          </div>
        </div>
      )
    },
    {
      slideNum: "3/6",
      title: "GRILLA EXCEL CON BLINDAJE TRIBUTARIO",
      subtitle: "Partida doble estricta con validación bloqueante de RUT, documentos y centros de costos antes de guardar.",
      badge: "LIBRO DIARIO & AUDITORÍA",
      accentColor: "from-purple-600 to-indigo-600",
      content: (
        <div className="space-y-2 text-left font-sans">
          <div className="flex items-center justify-between text-[11px] px-1">
            <span className="font-bold text-slate-200 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" /> Traspaso N° 108 &bull; Compras del Mes
            </span>
            <span className="text-[10px] text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-700 font-bold">
              CUADRADO ✓
            </span>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow text-[10.5px]">
            <div className="grid grid-cols-12 bg-slate-800/80 p-1.5 font-bold text-slate-400 text-[10px]">
              <div className="col-span-3">Cuenta</div>
              <div className="col-span-3">RUT Auxiliar</div>
              <div className="col-span-3 text-right">Debe</div>
              <div className="col-span-3 text-right">Haber</div>
            </div>
            <div className="divide-y divide-slate-800/60">
              <div className="grid grid-cols-12 p-1.5 text-slate-200 items-center">
                <div className="col-span-3 font-mono text-indigo-300 truncate">1-1-08 Mercaderías</div>
                <div className="col-span-3 font-mono text-slate-400">76.123.456-7</div>
                <div className="col-span-3 text-right font-mono text-emerald-400">$1.250.000</div>
                <div className="col-span-3 text-right font-mono text-slate-500">$0</div>
              </div>
              <div className="grid grid-cols-12 p-1.5 text-slate-200 items-center">
                <div className="col-span-3 font-mono text-indigo-300 truncate">1-1-10 IVA Crédito</div>
                <div className="col-span-3 font-mono text-slate-400">-</div>
                <div className="col-span-3 text-right font-mono text-emerald-400">$237.500</div>
                <div className="col-span-3 text-right font-mono text-slate-500">$0</div>
              </div>
              <div className="grid grid-cols-12 p-1.5 text-slate-200 items-center">
                <div className="col-span-3 font-mono text-amber-300 truncate">2-1-01 Proveedores</div>
                <div className="col-span-3 font-mono text-slate-400">96.541.230-1</div>
                <div className="col-span-3 text-right font-mono text-slate-500">$0</div>
                <div className="col-span-3 text-right font-mono text-amber-400">$1.487.500</div>
              </div>
            </div>
            <div className="grid grid-cols-12 p-1.5 bg-slate-950 font-bold text-[11px] border-t border-slate-700">
              <div className="col-span-6 text-slate-300">TOTALES COMPROBANTE:</div>
              <div className="col-span-3 text-right text-emerald-400 font-mono">$1.487.500</div>
              <div className="col-span-3 text-right text-emerald-400 font-mono">$1.487.500</div>
            </div>
          </div>
          <div className="flex gap-1.5 text-[10px] font-mono justify-center pt-0.5">
            <span className="px-2 py-0.5 bg-indigo-950 text-indigo-300 rounded border border-indigo-700">RUT Obligatorio</span>
            <span className="px-2 py-0.5 bg-amber-950 text-amber-300 rounded border border-amber-700">DOC Requerido</span>
            <span className="px-2 py-0.5 bg-emerald-950 text-emerald-300 rounded border border-emerald-700">CC Obligatorio</span>
          </div>
        </div>
      )
    },
    {
      slideNum: "4/6",
      title: "CONCILIACIÓN BANCARIA EN 1 CLIC",
      customTitle: (
        <div className="flex flex-col items-center justify-center gap-1">
          <span className="text-xl md:text-2xl font-black text-white leading-tight">
            CONCILIACIÓN BANCARIA EN 1
          </span>
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 font-black text-xl md:text-2xl shadow-lg">
            <span>CLIC</span>
            <span className="relative flex items-center justify-center">
              <span className="animate-ping absolute inline-flex h-4 w-4 rounded-full bg-emerald-400 opacity-75"></span>
              <svg 
                className="w-5 h-5 text-emerald-300 drop-shadow animate-bounce" 
                viewBox="0 0 24 24" 
                fill="currentColor"
              >
                <path d="M13.64 21.97C13.14 22.21 12.54 22 12.31 21.5L10.13 16.76L7.62 18.78C7.14 19.16 6.44 18.82 6.44 18.21V3.5C6.44 2.87 7.18 2.53 7.66 2.95L19.46 13.25C19.93 13.66 19.74 14.44 19.13 14.59L15.35 15.54L17.5 20.26C17.74 20.76 17.53 21.36 17.03 21.59L13.64 21.97Z" />
              </svg>
            </span>
          </span>
        </div>
      ),
      subtitle: "Cruza cartolas de cualquier banco chileno contra facturas pendientes: Saldo Cartola = Saldo Libro Mayor.",
      badge: "TESORERÍA INTELIGENTE",
      accentColor: "from-emerald-600 to-cyan-600",
      content: (
        <div className="space-y-2 text-left font-sans">
          <div className="flex items-center justify-between text-[11px] px-1">
            <span className="font-bold text-slate-200 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-emerald-400" /> Banco de Chile &bull; Cta Cte N° 00-123456-01
            </span>
            <span className="text-[10px] text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-700 font-bold">
              Match Automático
            </span>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5 space-y-2 shadow">
            <div className="flex items-center justify-between text-[10.5px] p-2 bg-slate-950 rounded-lg border border-slate-800">
              <div>
                <span className="text-[10px] text-slate-400 block">MOVIMIENTO CARTOLA</span>
                <span className="font-bold text-white">Abono Transferencia #9042</span>
              </div>
              <span className="font-mono font-bold text-emerald-400 text-sm">+$1.487.500</span>
            </div>
            <div className="flex items-center justify-center">
              <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950/80 px-2.5 py-0.5 rounded-full border border-emerald-700 flex items-center gap-1">
                 Coincide con Factura N° 4580 (Sodimac)
              </span>
            </div>
            <div className="flex items-center justify-between text-[10.5px] p-2 bg-slate-950 rounded-lg border border-slate-800">
              <div>
                <span className="text-[10px] text-slate-400 block">FACTURA PENDIENTE MATCH</span>
                <span className="font-bold text-slate-200">Factura Venta N° 4580</span>
              </div>
              <span className="font-mono font-bold text-emerald-400 text-sm">$1.487.500</span>
            </div>
          </div>
          <div className="p-2 bg-emerald-950/50 border border-emerald-700/60 rounded-xl text-center">
            <span className="text-emerald-300 font-mono font-bold text-xs block">Saldo Cartola = Saldo Libro Mayor</span>
            <span className="text-slate-400 text-[10px]">Asiento bancario generado sin digitar una sola cuenta</span>
          </div>
        </div>
      )
    },
    {
      slideNum: "5/6",
      title: "F29 Y BALANCE 8 COLUMNAS IFRS",
      subtitle: "Débito, crédito, retenciones BHE, PPM y balance de 8 columnas calculados al peso en tiempo real.",
      badge: "CIERRE MENSUAL & TRIBUTARIO",
      accentColor: "from-amber-600 to-orange-600",
      content: (
        <div className="space-y-2 text-left font-sans">
          <div className="flex items-center justify-between text-[11px] px-1">
            <span className="font-bold text-slate-200">Resumen Tributario & Balance Mensual</span>
            <span className="text-[10px] text-amber-400 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-700 font-bold">
              IFRS Oficial
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center text-xs">
            <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
              <span className="text-[10px] text-slate-400 block font-bold">F29: IVA DÉBITO FISCAL</span>
              <span className="text-sm font-mono font-bold text-rose-400">$3.840.500</span>
              <span className="text-[10px] text-slate-500 block">Ventas Netas: $20.213.158</span>
            </div>
            <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
              <span className="text-[10px] text-slate-400 block font-bold">F29: IVA CRÉDITO FISCAL</span>
              <span className="text-sm font-mono font-bold text-emerald-400">$2.915.200</span>
              <span className="text-[10px] text-slate-500 block">Compras Netas: $15.343.158</span>
            </div>
          </div>
          <div className="p-2.5 bg-purple-950 border border-purple-700/60 rounded-xl text-[11px] space-y-1">
            <div className="flex items-center justify-between font-bold text-white">
              <span>Balance de 8 Columnas IFRS:</span>
              <span className="text-emerald-400 font-mono">Cuadrado al Peso</span>
            </div>
            <div className="flex items-center justify-between text-slate-300 text-[10px]">
              <span>Total Activo = Pasivo + Patrimonio</span>
              <span className="font-mono text-purple-200 font-bold">Exportar a Excel / PDF</span>
            </div>
          </div>
        </div>
      )
    },
    {
      slideNum: "6/6",
      title: "PROGRAMA DE ESTUDIOS FUNDADORES",
      subtitle: "15 días de prueba 100% gratuita, migración asistida de empresas y soporte contable chileno.",
      badge: "ACCESO Y DEMO EN VIVO",
      accentColor: "from-emerald-500 to-teal-500",
      content: (
        <div className="space-y-3 text-center font-sans">
          <div className="p-3 bg-emerald-950 border border-emerald-700 rounded-xl space-y-2">
            <span className="inline-block px-3 py-0.5 bg-emerald-500 text-slate-950 font-black text-[11px] rounded-full">
              CUPOS LIMITADOS &bull; ACCESO INMEDIATO
            </span>
            <ul className="text-xs text-slate-200 text-left space-y-1.5 list-disc list-inside">
              <li><strong>15 días de acceso total gratuito</strong> sin compromiso.</li>
              <li><strong>Migración asistida</strong> de tu plan de cuentas y empresas.</li>
              <li><strong>Soporte contable chileno</strong> directo vía WhatsApp.</li>
              <li>Tarifa preferencial congelada de por vida.</li>
            </ul>
          </div>
          <div className="p-2.5 bg-slate-900 rounded-xl border border-emerald-500/40 space-y-1 text-center">
            <p className="text-emerald-400 font-bold text-xs">
              Solicita tu acceso o agenda una demo 
            </p>
            <p className="text-slate-300 text-[11.5px] font-medium">
              WhatsApp: <strong className="text-white">+56 9 4631 8783</strong> &bull; app.pulsocontable.cl
            </p>
          </div>
        </div>
      )
    }
  ];

  // =========================================================================
  // FUNCIONES DE DESCARGA DIRECTA (IMÁGENES HD PNG, ZIP PACK, PDF Y DOCUMENTOS)
  // =========================================================================
  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  const downloadFile = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 1. Descargar la lámina actualmente visible en formato PNG HD (1:1) instantáneo
  const downloadCurrentSlidePNG = () => {
    try {
      downloadSlidePNGDirect(currentSlideIdx);
    } catch (err) {
      console.error('Error al descargar lámina PNG:', err);
    }
  };

  // 2. Descargar las 6 láminas completas en un solo archivo ZIP comprimido
  const downloadAllSlidesZip = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setExportProgress('Generando y empaquetando las 6 láminas HD en archivo ZIP...');
    try {
      const zip = new JSZip();
      const folder = zip.folder('Laminas_Instagram_PulsoContable');

      for (let i = 0; i < 6; i++) {
        setExportProgress(`Procesando Lámina ${i + 1} de 6 en alta definición...`);
        const dataUrl = getSlideDataUrl(i);
        const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
        const meta = SLIDES_METADATA[i] || SLIDES_METADATA[0];
        const cleanBadge = meta.badge.replace(/[^a-zA-Z0-9]/g, '_');
        folder?.file(`Lamina_${i + 1}_${cleanBadge}.png`, base64Data, { base64: true });
      }

      // Añadir archivo con copys y hashtags
      folder?.file('Copys_Y_Hashtags_Instagram.txt', instagramPostCopy);
      folder?.file('Kit_Completo_Redes_Sociales.txt', getTextKitContent());

      setExportProgress('Comprimiendo archivo ZIP...');
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(zipBlob, 'PulsoContable_Carrusel_Instagram_6_Laminas_HD.zip');

      setExportProgress('¡Descarga completada con éxito!');
      setTimeout(() => {
        setIsExporting(false);
        setExportProgress('');
      }, 1500);
    } catch (err) {
      console.error('Error al generar ZIP:', err);
      setIsExporting(false);
      setExportProgress('');
    }
  };

  // 3. Descargar las 6 láminas completas como archivos PNG individuales
  const downloadAllSlidesPNG = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      for (let i = 0; i < 6; i++) {
        setExportProgress(`Descargando Lámina ${i + 1} de 6 (PNG HD)...`);
        downloadSlidePNGDirect(i);
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
      setExportProgress('¡Láminas descargadas!');
      setTimeout(() => {
        setIsExporting(false);
        setExportProgress('');
      }, 1500);
    } catch (err) {
      console.error('Error al exportar láminas:', err);
      setIsExporting(false);
      setExportProgress('');
    }
  };

  // 4. Descargar el carrusel completo como documento PDF de 6 páginas cuadradas (1:1)
  const downloadCarouselPDF = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setExportProgress('Generando carrusel en PDF de 6 páginas...');
    try {
      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'pt',
        format: [1080, 1080]
      });

      for (let i = 0; i < 6; i++) {
        setExportProgress(`Agregando Lámina ${i + 1} al PDF...`);
        const imgData = getSlideDataUrl(i);
        if (i > 0) {
          pdf.addPage([1080, 1080], 'p');
        }
        pdf.addImage(imgData, 'PNG', 0, 0, 1080, 1080);
      }

      setExportProgress('Guardando documento PDF...');
      pdf.save('PulsoContable_Carrusel_Instagram_6_Laminas.pdf');
      
      setExportProgress('¡PDF descargado con éxito!');
      setTimeout(() => {
        setIsExporting(false);
        setExportProgress('');
      }, 1500);
    } catch (err) {
      console.error('Error al exportar PDF del carrusel:', err);
      setIsExporting(false);
      setExportProgress('');
    }
  };

  // 5. Copiar la lámina visual al portapapeles como imagen para pegar en WhatsApp Web o Canva
  const copyCurrentSlideImage = async () => {
    try {
      const canvas = renderSlideToCanvas(currentSlideIdx);
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        try {
          if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob })
            ]);
            setCopiedKey(`slide_img_${currentSlideIdx}`);
            setTimeout(() => setCopiedKey(null), 2500);
          } else {
            downloadSlidePNGDirect(currentSlideIdx);
          }
        } catch (clipErr) {
          // Si el navegador en iframe bloquea el portapapeles de imágenes, descarga directa
          downloadSlidePNGDirect(currentSlideIdx);
        }
      }, 'image/png');
    } catch (err) {
      downloadSlidePNGDirect(currentSlideIdx);
    }
  };

  const getTextKitContent = () => {
    return `================================================================================
PULSO CONTABLE - KIT COMERCIAL Y MATERIAL COMPLETO PARA REDES SOCIALES
Software Contable en la Nube con Rescate RCV SII y Conciliación Bancaria
Chile
Web: https://app.pulsocontable.cl | WhatsApp: +56 9 4631 8783
================================================================================

1. WHATSAPP - MENSAJE PARA GRUPOS DE CONTADORES Y PYMES
--------------------------------------------------------------------------------
${whatsappGroupText}

--------------------------------------------------------------------------------
2. WHATSAPP - MENSAJE DIRECTO (1 A 1 CON SOCIOS Y COLEGAS)
--------------------------------------------------------------------------------
${whatsappDirectText}

--------------------------------------------------------------------------------
3. INSTAGRAM - COPY COMPLETO Y HASHTAGS OFICIALES
--------------------------------------------------------------------------------
${instagramPostCopy}

--------------------------------------------------------------------------------
4. INSTAGRAM - ESTRUCTURA DEL CARRUSEL DE 6 LÁMINAS (1:1)
--------------------------------------------------------------------------------
${carouselSlides.map(s => `[LÁMINA ${s.slideNum}] ${s.badge}
TÍTULO: ${s.title}
SUBTÍTULO: ${s.subtitle}
`).join('\n')}

--------------------------------------------------------------------------------
5. REEL / TIKTOK / STORIES - GUIÓN DE VIDEO VERTICAL (9:16 - 40 SEGUNDOS)
--------------------------------------------------------------------------------
${reelScenes.map(s => `[ESCENA ${s.id} - ${s.durationSeconds}s] ${s.badge}
TEXTO GIGANTE EN PANTALLA: ${s.hookText}
SUBTEXTO: ${s.subText}
LOCUCIÓN / GUION DE VOZ: "${s.narration}"
`).join('\n')}

--------------------------------------------------------------------------------
6. FACEBOOK - POST COMPLETO PARA GRUPOS DE CONTABILIDAD Y EMPRENDEDORES
--------------------------------------------------------------------------------
${facebookGroupPost}
`;
  };

  const downloadTextKit = () => {
    const content = getTextKitContent();
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    downloadBlob(blob, 'PulsoContable_Kit_Redes_Sociales.txt');
  };

  const downloadAllPack = () => {
    downloadAllSlidesZip();
  };

  return (
    <div 
      ref={containerRef}
      className={`flex flex-col bg-slate-950 text-white rounded-2xl shadow-2xl overflow-hidden border border-slate-800 transition-all ${
        isFullscreen ? 'fixed inset-0 z-[99999] rounded-none border-none h-screen w-screen' : 'min-h-[800px] w-full'
      }`}
    >
      {/* BARRA SUPERIOR DE CONTROL EJECUTIVO */}
      <div className="bg-slate-900/95 border-b border-slate-800 px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-500 p-2 rounded-xl font-black text-slate-950 text-xs tracking-wider shadow-md">
            PULSO CONTABLE
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-100">Kit de Redes Sociales & Presentación Comercial</span>
              <span className="text-[10px] bg-indigo-950 text-indigo-300 font-mono font-bold px-2 py-0.5 rounded border border-indigo-700">
                {APP_VERSION}
              </span>
              <span className="text-[10px] bg-amber-950 text-amber-300 font-bold px-2 py-0.5 rounded border border-amber-800">
                 Solo Super Admin
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Material visual y textos persuasivos listos para enviar a grupos de WhatsApp, Instagram y Facebook.</p>
          </div>
        </div>

        {/* NAVEGACIÓN ENTRE REDES SOCIALES Y BOTÓN DE DESCARGA */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={downloadAllPack}
            className="px-3.5 py-1.5 bg-emerald-500 hover:opacity-95 text-slate-950 font-black rounded-xl text-xs flex items-center gap-1.5 shadow-md transition-transform hover:scale-102 cursor-pointer"
            title="Descarga automáticamente las imágenes en alta resolución y el archivo .txt con todos los copys"
          >
            <Download className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Descargar Pack Completo</span>
          </button>

          <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('whatsapp')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'whatsapp'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <MessageCircle className="w-3.5 h-3.5 text-emerald-300" />
              <span>WhatsApp Grupos</span>
            </button>

            <button
              onClick={() => setActiveTab('instagram')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'instagram'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <Instagram className="w-3.5 h-3.5 text-pink-300" />
              <span>Instagram (Feed & Reels)</span>
            </button>

            <button
              onClick={() => setActiveTab('facebook')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'facebook'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <Facebook className="w-3.5 h-3.5 text-blue-300" />
              <span>Facebook Grupos</span>
            </button>

            <button
              onClick={() => setActiveTab('videotour')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'videotour'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <Video className="w-3.5 h-3.5 text-indigo-300" />
              <span>Simulador Video Tour</span>
            </button>

            <button
              onClick={toggleFullscreen}
              className="p-1.5 ml-1 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg text-xs transition-colors border border-slate-800 cursor-pointer"
              title="Pantalla Completa"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* CONTENIDO PRINCIPAL POR CANAL */}
      <div className="flex-1 flex flex-col p-4 md:p-6 overflow-y-auto bg-slate-950">

        {/* ========================================================================= */}
        {/* CANAL 1: WHATSAPP (GRUPOS & DIRECTO)                                      */}
        {/* ========================================================================= */}
        {activeTab === 'whatsapp' && (
          <div className="max-w-6xl mx-auto w-full space-y-6">
            
            {/* SELECTOR DE PLANTILLA WHATSAPP */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 p-4 rounded-2xl border border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
                  <MessageCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Presentación para Grupos de WhatsApp & Contactos Directos</h3>
                  <p className="text-xs text-slate-400">Mensaje con formato visual en negritas, emoticones y tarjeta publicitaria adjunta.</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setWhatsappTemplate('group')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    whatsappTemplate === 'group'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                  }`}
                >
                   Para Grupos de Contadores
                </button>
                <button
                  onClick={() => setWhatsappTemplate('direct')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    whatsappTemplate === 'direct'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                  }`}
                >
                   Mensaje 1 a 1 para Socios
                </button>
              </div>
            </div>

            {/* VISTA DUAL: SIMULADOR DE CHAT WHATSAPP + IMAGEN PROMOCIONAL ADJUNTA */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* COLUMNA IZQUIERDA: SIMULADOR DE CHAT DE WHATSAPP */}
              <div className="lg:col-span-7 bg-[#0b141a] rounded-3xl border border-slate-800 overflow-hidden shadow-2xl flex flex-col">
                
                {/* BARRA SUPERIOR WHATSAPP */}
                <div className="bg-[#202c33] px-4 py-3 flex items-center justify-between border-b border-slate-700/50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-600 text-slate-950 font-black flex items-center justify-center text-sm shadow">
                      PC
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                        <span>{whatsappTemplate === 'group' ? 'Contadores de Chile 🇨🇱 / Red Pymes' : 'Socio / Colega Contador'}</span>
                        <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.2 rounded font-mono">Oficial</span>
                      </p>
                      <p className="text-[10px] text-slate-400">en línea</p>
                    </div>
                  </div>
                  <button
                    onClick={() => copyToClipboard(whatsappTemplate === 'group' ? whatsappGroupText : whatsappDirectText, 'whatsapp_msg')}
                    className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors shadow cursor-pointer"
                  >
                    {copiedKey === 'whatsapp_msg' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === 'whatsapp_msg' ? '¡Copiado!' : 'Copiar para WhatsApp'}</span>
                  </button>
                </div>

                {/* CUERPO DEL CHAT WHATSAPP */}
                <div className="p-4 md:p-6 space-y-4 bg-[radial-gradient(#1f2c34_1px,transparent_1px)] [background-size:16px_16px] min-h-[460px] overflow-y-auto">
                  
                  {/* BURBUJA DE MENSAJE WHATSAPP */}
                  <div className="bg-[#005c4b] text-slate-100 rounded-2xl rounded-tl-xs p-4 text-xs space-y-3 shadow-md max-w-xl ml-auto border border-emerald-600/30 leading-relaxed font-sans">
                    
                    {/* IMAGEN PREVIEW DENTRO DE LA BURBUJA */}
                    <div className="rounded-xl overflow-hidden border border-emerald-700/40 relative">
                      <img 
                        src={flyerDataUrl || socialSquareImg} 
                        alt="Pulso Contable Portada WhatsApp" 
                        className="w-full h-48 object-cover object-top"
                      />
                      <div className="absolute bottom-0 inset-x-0 bg-black/85 p-2 text-[11px] font-bold text-white">
                        PULSO CONTABLE &bull; Software Contable en la Nube con Rescate RCV SII
                      </div>
                    </div>

                    <div className="whitespace-pre-line text-[11.5px] leading-relaxed text-slate-100">
                      {whatsappTemplate === 'group' ? whatsappGroupText : whatsappDirectText}
                    </div>

                    <div className="flex items-center justify-end gap-1 text-[10px] text-emerald-200/70 pt-1">
                      <span>10:30 AM</span>
                      <span className="text-cyan-300 font-bold font-mono">✓✓</span>
                    </div>
                  </div>

                </div>

                {/* ACCIONES DE ENVÍO DIRECTO */}
                <div className="bg-[#202c33] px-4 py-3 border-t border-slate-700/50 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-400"> Tip: Copia el texto y adjunta la imagen para lograr una tasa de apertura del 90%.</span>
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(whatsappTemplate === 'group' ? whatsappGroupText : whatsappDirectText)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs flex items-center gap-1.5 shadow transition-transform hover:scale-105"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Abrir en WhatsApp Web</span>
                  </a>
                </div>
              </div>

              {/* COLUMNA DERECHA: TARJETA GRÁFICA PROMOCIONAL LISTA PARA DESCARGAR */}
              <div className="lg:col-span-5 space-y-4">
                <div className="bg-slate-900/90 rounded-3xl border border-slate-800 p-5 space-y-4 shadow-xl">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-emerald-400" />
                      <span>Flyer Oficial para Adjuntar</span>
                    </span>
                    <span className="text-[10px] bg-indigo-950 text-indigo-300 px-2 py-0.5 rounded font-mono font-bold">
                      Formato 1:1 Cuadrado
                    </span>
                  </div>

                  <div className="rounded-2xl overflow-hidden border border-slate-700 shadow-2xl relative group">
                    <img 
                      src={flyerDataUrl || socialSquareImg} 
                      alt="Flyer Oficial Pulso Contable" 
                      className="w-full object-cover rounded-2xl group-hover:scale-102 transition-transform duration-300"
                    />
                  </div>

                  {/* BOTONES DE DESCARGA DIRECTA */}
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      onClick={() => downloadSlidePNGDirect(0)}
                      className="flex-1 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow transition-all cursor-pointer text-center"
                    >
                      <Download className="w-4 h-4" />
                      <span>Descargar Imagen (1:1 HD)</span>
                    </button>
                    <button
                      onClick={downloadTextKit}
                      className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs flex items-center justify-center gap-2 border border-slate-700 cursor-pointer"
                      title="Descarga un archivo .txt con todos los textos de WhatsApp, Instagram y Facebook"
                    >
                      <FileText className="w-4 h-4 text-emerald-400" />
                      <span>Textos (.txt)</span>
                    </button>
                  </div>

                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1 text-xs">
                    <p className="font-bold text-slate-200">¿Cómo enviar a grupos de WhatsApp?</p>
                    <ol className="text-[11px] text-slate-400 space-y-1 list-decimal list-inside">
                      <li>Haz clic en <strong>Descargar Imagen (1:1 HD)</strong> para guardarla en tu computador o teléfono.</li>
                      <li>Haz clic en <strong>Copiar para WhatsApp</strong> para copiar el mensaje persuasivo.</li>
                      <li>Abre el grupo o contacto en WhatsApp, pega el texto y adjunta la imagen descargada.</li>
                    </ol>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* CANAL 2: INSTAGRAM (CARRUSEL 1:1 & REEL / STORY 9:16)                     */}
        {/* ========================================================================= */}
        {activeTab === 'instagram' && (
          <div className="max-w-6xl mx-auto w-full space-y-6">
            
            {/* SELECTOR DE FORMATO INSTAGRAM */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 p-4 rounded-2xl border border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-purple-500 text-white rounded-xl shadow">
                  <Instagram className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Presentación para Instagram (Feed & Reels/Stories)</h3>
                  <p className="text-xs text-slate-400">Selecciona entre carrusel de diapositivas deslizables o video reel vertical.</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setInstagramFormat('carousel')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    instagramFormat === 'carousel'
                      ? 'bg-purple-600 text-white shadow'
                      : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                  }`}
                >
                   Carrusel de 6 Láminas (1:1)
                </button>
                <button
                  onClick={() => setInstagramFormat('reel')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    instagramFormat === 'reel'
                      ? 'bg-purple-600 text-white shadow'
                      : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                  }`}
                >
                   Reel / Story Vertical (9:16)
                </button>
              </div>
            </div>

            {/* FORMATO A: CARRUSEL DE 6 LÁMINAS */}
            {instagramFormat === 'carousel' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                {/* VISOR DE LA LÁMINA SELECCIONADA */}
                <div className="lg:col-span-7 flex flex-col items-center space-y-4">
                  <div 
                    ref={currentSlideCardRef}
                    className="w-full max-w-md aspect-square bg-slate-900 rounded-3xl border-2 border-slate-800 shadow-2xl p-6 flex flex-col justify-between relative overflow-hidden select-none"
                  >
                    
                    {/* BARRAS DECORATIVAS */}
                    <div className="absolute top-0 inset-x-0 h-2 bg-purple-500"></div>

                    {/* ENCABEZADO DE LÁMINA */}
                    <div className="flex items-center justify-between pt-2">
                      <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-slate-800 text-slate-200 border border-slate-700">
                        LÁMINA {carouselSlides[currentSlideIdx].slideNum}
                      </span>
                      <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-purple-950 text-purple-300 border border-purple-800">
                        {carouselSlides[currentSlideIdx].badge}
                      </span>
                    </div>

                    {/* TÍTULOS Y CONTENIDO DINÁMICO */}
                    <div className="space-y-3 text-center my-auto py-4">
                      {carouselSlides[currentSlideIdx].customTitle ? (
                        carouselSlides[currentSlideIdx].customTitle
                      ) : (
                        <h2 className="text-xl md:text-2xl font-black text-white leading-tight">
                          {carouselSlides[currentSlideIdx].title}
                        </h2>
                      )}
                      <p className="text-xs text-slate-300 font-light">
                        {carouselSlides[currentSlideIdx].subtitle}
                      </p>

                      <div className="pt-2">
                        {carouselSlides[currentSlideIdx].content}
                      </div>
                    </div>

                    {/* PIE DE LÁMINA */}
                    <div className="flex items-center justify-between border-t border-slate-800 pt-3 text-[10px] text-slate-400 font-mono">
                      <span className="font-bold text-slate-300 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        Pulso Contable
                      </span>
                      <span className="text-purple-400 font-bold">
                        {currentSlideIdx < carouselSlides.length - 1 ? 'Desliza para ver más ' : '¡Guarda este post! '}
                      </span>
                    </div>

                  </div>

                  {/* CONTROLES DE NAVEGACIÓN DEL CARRUSEL */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setCurrentSlideIdx(prev => Math.max(prev - 1, 0))}
                      disabled={currentSlideIdx === 0}
                      className="p-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl border border-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                      title="Lámina anterior"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>

                    <div className="flex items-center gap-1.5">
                      {carouselSlides.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => setCurrentSlideIdx(idx)}
                          className={`w-3 h-3 rounded-full transition-all cursor-pointer ${
                            currentSlideIdx === idx ? 'bg-pink-500 scale-125' : 'bg-slate-700 hover:bg-slate-500'
                          }`}
                          title={`Ir a lámina ${idx + 1}`}
                        />
                      ))}
                    </div>

                    <button
                      onClick={() => setCurrentSlideIdx(prev => Math.min(prev + 1, carouselSlides.length - 1))}
                      disabled={currentSlideIdx === carouselSlides.length - 1}
                      className="p-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl border border-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                      title="Lámina siguiente"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>

                  {/* ESTADO DE EXPORTACIÓN */}
                  {isExporting && (
                    <div className="w-full max-w-md p-3 bg-purple-950/80 border border-purple-700/60 rounded-xl text-xs text-purple-200 flex items-center justify-center gap-2 shadow-lg animate-pulse">
                      <Loader2 className="w-4 h-4 animate-spin text-pink-400" />
                      <span className="font-semibold">{exportProgress || 'Procesando imágenes...'}</span>
                    </div>
                  )}

                  {/* PANEL COMPLETO DE DESCARGA MULTIFORMATO PARA EL CARRUSEL */}
                  <div className="w-full max-w-md bg-slate-900/90 rounded-2xl border border-slate-800 p-3.5 space-y-2.5 shadow-xl">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <span className="text-xs font-bold text-white flex items-center gap-1.5">
                        <Download className="w-3.5 h-3.5 text-pink-400" />
                        <span>Descargar Carrusel para tu PC</span>
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">1080x1080 HD (1:1)</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={downloadCurrentSlidePNG}
                        className="p-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow cursor-pointer transition-all active:scale-95"
                        title="Descarga la lámina visible como imagen PNG de 1080x1080 px"
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        <span>Lámina Actual (PNG)</span>
                      </button>

                      <button
                        onClick={downloadAllSlidesZip}
                        disabled={isExporting}
                        className="p-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow cursor-pointer transition-all disabled:opacity-50 active:scale-95"
                        title="Descarga un solo archivo .ZIP con las 6 láminas en PNG HD + archivos de texto"
                      >
                        <Archive className="w-3.5 h-3.5" />
                        <span>Pack Completo (ZIP)</span>
                      </button>

                      <button
                        onClick={downloadCarouselPDF}
                        disabled={isExporting}
                        className="p-2.5 bg-slate-950 hover:bg-slate-800 text-slate-200 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 border border-slate-800 cursor-pointer transition-all disabled:opacity-50 active:scale-95"
                        title="Descarga un PDF con las 6 láminas en páginas cuadradas HD"
                      >
                        <FileText className="w-3.5 h-3.5 text-pink-400" />
                        <span>Carrusel PDF (6 Pág)</span>
                      </button>

                      <button
                        onClick={() => setShowGalleryModal(true)}
                        className="p-2.5 bg-slate-950 hover:bg-slate-800 text-slate-200 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 border border-slate-800 cursor-pointer transition-all active:scale-95"
                        title="Ver todas las 6 láminas en pantalla completa para revisarlas y descargarlas"
                      >
                        <Eye className="w-3.5 h-3.5 text-teal-400" />
                        <span>Ver Galería Completa</span>
                      </button>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
                      <button
                        onClick={copyCurrentSlideImage}
                        className="text-[11px] text-slate-300 hover:text-white flex items-center gap-1 py-1 px-2 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Copia la lámina al portapapeles para pegarla en WhatsApp Web"
                      >
                        {copiedKey === `slide_img_${currentSlideIdx}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-pink-400" />}
                        <span>{copiedKey === `slide_img_${currentSlideIdx}` ? '¡Imagen copiada!' : 'Copiar lámina'}</span>
                      </button>

                      <button
                        onClick={downloadTextKit}
                        className="text-[11px] text-slate-300 hover:text-white flex items-center gap-1 py-1 px-2 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Descargar textos y copys en archivo .txt"
                      >
                        <FileText className="w-3 h-3 text-amber-400" />
                        <span>Descargar Copys (.txt)</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* COPYWRITING DEL POST Y HASHTAGS */}
                <div className="lg:col-span-5 space-y-4">
                  <div className="bg-slate-900/90 rounded-3xl border border-slate-800 p-5 space-y-3 shadow-xl">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white flex items-center gap-2">
                        <FileText className="w-4 h-4 text-pink-400" />
                        <span>Copywriting & Hashtags Oficiales</span>
                      </span>
                      <button
                        onClick={() => copyToClipboard(instagramPostCopy, 'ig_copy')}
                        className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow cursor-pointer"
                      >
                        {copiedKey === 'ig_copy' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedKey === 'ig_copy' ? '¡Copiado!' : 'Copiar Texto + Tags'}</span>
                      </button>
                    </div>

                    <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 text-xs text-slate-300 font-mono whitespace-pre-line max-h-[460px] overflow-y-auto leading-relaxed">
                      {instagramPostCopy}
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* FORMATO B: REEL / STORY VERTICAL (9:16) */}
            {instagramFormat === 'reel' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                
                {/* SMARTPHONE PLAYER SIMULATOR (9:16) */}
                <div className="lg:col-span-6 flex justify-center">
                  <div className="w-[310px] md:w-[330px] aspect-[9/16] bg-slate-950 rounded-[44px] border-[6px] border-slate-800 shadow-2xl relative overflow-hidden flex flex-col justify-between">
                    
                    {/* FONDO VERTICAL CON IMAGEN GENERADA */}
                    <img 
                      src={storyReelImg} 
                      alt="Gest_OK Reel Story Background" 
                      className="absolute inset-0 w-full h-full object-cover opacity-60"
                    />
                    <div className="absolute inset-0 bg-slate-950" />

                    {/* BARRA SUPERIOR DE HISTORIA (STORIES BAR) */}
                    <div className="relative z-10 px-4 pt-3 flex gap-1">
                      {reelScenes.map((s, idx) => (
                        <div key={s.id} className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-white transition-all duration-100"
                            style={{
                              width: idx < activeReelIdx ? '100%' : idx === activeReelIdx ? `${reelProgress}%` : '0%'
                            }}
                          />
                        </div>
                      ))}
                    </div>

                    {/* CABECERA DE PERFIL */}
                    <div className="relative z-10 px-4 pt-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-emerald-400 text-slate-950 font-black text-xs flex items-center justify-center">
                          PC
                        </div>
                        <span className="text-xs font-bold text-white drop-shadow">pulsocontable.cl</span>
                      </div>
                      <span className="text-[10px] bg-slate-900/80 px-2 py-0.5 rounded-full text-emerald-400 font-mono font-bold border border-slate-700">
                        {currentReel.badge}
                      </span>
                    </div>

                    {/* CENTRO: SUBTÍTULOS GIGANTES VIRALES (ESTILO MRBEAST / HORMOZI) */}
                    <div className="relative z-10 p-5 text-center space-y-3 my-auto">
                      <div className="inline-block px-3 py-1 bg-amber-400 text-slate-950 font-black text-xs rounded-lg uppercase tracking-wider shadow-lg transform -rotate-1">
                        ESCENA {activeReelIdx + 1} de {reelScenes.length}
                      </div>

                      <h2 className="text-2xl font-black text-white leading-tight drop-shadow-md">
                        {currentReel.hookText}
                      </h2>

                      <p className="text-xs text-slate-200 leading-relaxed font-medium bg-black/50 p-3 rounded-2xl backdrop-blur-xs border border-white/10">
                        {currentReel.subText}
                      </p>
                    </div>

                    {/* PIE CON CONTROLES */}
                    <div className="relative z-10 p-4 space-y-3 bg-slate-950">
                      <div className="flex items-center justify-between text-xs">
                        <button
                          onClick={toggleVoice}
                          className={`p-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border cursor-pointer ${
                            voiceEnabled 
                              ? 'bg-teal-500 text-slate-950 border-teal-400' 
                              : 'bg-black/60 text-slate-300 border-white/20'
                          }`}
                        >
                          {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                          <span>{voiceEnabled ? 'Voz On' : 'Voz Off'}</span>
                        </button>

                        <button
                          onClick={togglePlayReel}
                          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs flex items-center gap-1.5 shadow-lg cursor-pointer"
                        >
                          {isPlayingReel ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                          <span>{isPlayingReel ? 'Pausar' : 'Reproducir'}</span>
                        </button>

                        <button
                          onClick={handleResetReel}
                          className="p-2 bg-black/60 hover:bg-black/80 text-white rounded-xl border border-white/20 cursor-pointer"
                          title="Reiniciar"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                  </div>

                  {/* BOTONES DE DESCARGA DIRECTA REEL 9:16 */}
                  <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
                    <button
                      onClick={() => downloadFile(storyReelImg, 'PulsoContable_Story_Reel_Vertical_9x16.jpg')}
                      className="px-4 py-2.5 bg-teal-400 hover:bg-teal-300 text-slate-950 font-black rounded-xl text-xs flex items-center gap-2 shadow-lg cursor-pointer transition-all"
                    >
                      <Download className="w-4 h-4 stroke-[2.5]" />
                      <span>Descargar Gráfica Reel (9:16 HD)</span>
                    </button>
                    <button
                      onClick={downloadTextKit}
                      className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs flex items-center gap-2 border border-slate-700 cursor-pointer"
                    >
                      <FileText className="w-4 h-4 text-emerald-400" />
                      <span>Descargar Guiones (.txt)</span>
                    </button>
                  </div>
                </div>

                {/* COLUMNA DERECHA: GUION DETALLADO PARA GRABAR TU REEL EN LOOM/CANVA/INSTAGRAM */}
                <div className="lg:col-span-6 space-y-4">
                  <div className="bg-slate-900/90 rounded-3xl border border-slate-800 p-5 space-y-4 shadow-xl">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <Video className="w-4 h-4 text-emerald-400" />
                        <span>Guión de Locución para el Reel (40 Segundos)</span>
                      </h4>
                      <button
                        onClick={() => copyToClipboard(reelScenes.map(s => `[${s.badge}] ${s.hookText}\nLocución: "${s.narration}"\n`).join('\n'), 'all_reel_script')}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors border border-slate-700 cursor-pointer"
                      >
                        {copiedKey === 'all_reel_script' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedKey === 'all_reel_script' ? '¡Copiado!' : 'Copiar Todo'}</span>
                      </button>
                    </div>

                    <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                      {reelScenes.map((s, idx) => (
                        <div 
                          key={s.id}
                          onClick={() => {
                            setActiveReelIdx(idx);
                            setReelProgress(0);
                            if (voiceEnabled && isPlayingReel) speakNarration(s.narration);
                          }}
                          className={`p-3 rounded-xl border transition-all cursor-pointer ${
                            activeReelIdx === idx
                              ? 'bg-indigo-950/60 border-indigo-500 shadow-md'
                              : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[11px] mb-1">
                            <span className="font-bold text-indigo-400">Escena {idx + 1}: {s.badge}</span>
                            <span className="font-mono text-slate-500">{s.durationSeconds}s</span>
                          </div>
                          <p className="text-xs font-bold text-white">{s.hookText}</p>
                          <p className="text-[11px] text-slate-300 italic mt-1">"{s.narration}"</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

              </div>
            )}

          </div>
        )}

        {/* ========================================================================= */}
        {/* CANAL 3: FACEBOOK (GRUPOS DE CONTADORES & COMUNIDADES)                     */}
        {/* ========================================================================= */}
        {activeTab === 'facebook' && (
          <div className="max-w-4xl mx-auto w-full space-y-6">
            
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 p-4 rounded-2xl border border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow">
                  <Facebook className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Publicación de Alto Impacto para Grupos de Facebook</h3>
                  <p className="text-xs text-slate-400">Diseñado con estructura persuasiva: Problema &rarr; Solución &rarr; Oferta de lanzamiento.</p>
                </div>
              </div>

              <button
                onClick={() => copyToClipboard(facebookGroupPost, 'fb_post')}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow transition-colors cursor-pointer"
              >
                {copiedKey === 'fb_post' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedKey === 'fb_post' ? '¡Texto Copiado!' : 'Copiar Publicación de Facebook'}</span>
              </button>
            </div>

            {/* VISTA PREVIA ESTILO FACEBOOK POST */}
            <div className="bg-[#242526] rounded-3xl border border-slate-700/60 shadow-2xl overflow-hidden text-slate-200">
              
              {/* CABECERA POST FACEBOOK */}
              <div className="p-4 flex items-center justify-between border-b border-slate-700/40">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-600 text-slate-950 font-black flex items-center justify-center text-sm">
                    PC
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>Pulso Contable Chile &bull; Software Contable en la Nube</span>
                      <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                    </p>
                    <p className="text-[10px] text-slate-400">Publicado para Grupos de Contadores &bull; Hace un momento &bull; </p>
                  </div>
                </div>
              </div>

              {/* CUERPO DEL TEXTO */}
              <div className="p-5 text-xs whitespace-pre-line leading-relaxed text-slate-100 font-sans">
                {facebookGroupPost}
              </div>

              {/* IMAGEN DEL POST */}
              <div className="border-t border-b border-slate-700/50 bg-black">
                <img 
                  src={flyerDataUrl || socialSquareImg} 
                  alt="Post Promocional Facebook Pulso Contable" 
                  className="w-full max-h-[460px] object-cover object-top"
                />
              </div>

              {/* INTERACCIONES DE FACEBOOK SIMULADAS */}
              <div className="p-3 bg-[#18191a] flex items-center justify-between text-xs text-slate-400 border-t border-slate-700/40">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-300 ml-1">48 contadores y pymes interesadas</span>
                </div>
                <div className="text-[11px] text-slate-400">
                  <span>19 comentarios &bull; 7 compartidos</span>
                </div>
              </div>

            </div>

            {/* PANEL DE DESCARGA DIRECTA FACEBOOK */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 p-4 rounded-2xl border border-slate-800">
              <div className="text-xs text-slate-400 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />
                <span>Descarga la imagen oficial en alta resolución lista para adjuntar a tu publicación de Facebook.</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => downloadSlidePNGDirect(0)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Descargar Imagen HD (1:1)</span>
                </button>
                <button
                  onClick={downloadTextKit}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs flex items-center gap-2 border border-slate-700 cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-blue-400" />
                  <span>Descargar Texto (.txt)</span>
                </button>
              </div>
            </div>

          </div>
        )}

        {/* ========================================================================= */}
        {/* CANAL 4: SIMULADOR VIDEO TOUR CINEMATOGRÁFICO MEJORADO                     */}
        {/* ========================================================================= */}
        {activeTab === 'videotour' && (
          <div className="max-w-5xl mx-auto w-full space-y-6">
            
            {/* REPRODUCTOR VISUAL COMPLETO */}
            <div className="bg-slate-900 rounded-3xl border border-slate-800 p-6 shadow-2xl space-y-6">
              
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800 text-[11px] font-bold font-mono">
                      Escena {activeReelIdx + 1} de {reelScenes.length} &bull; {currentReel.badge}
                    </span>
                  </div>
                  <h3 className="text-xl font-black text-white mt-1">{currentReel.hookText}</h3>
                  <p className="text-xs text-slate-400">{currentReel.subText}</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={downloadTextKit}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs flex items-center gap-1.5 border border-slate-700 cursor-pointer transition-colors"
                    title="Descargar guiones completos en formato .txt"
                  >
                    <Download className="w-4 h-4 text-indigo-400" />
                    <span>Descargar Guión</span>
                  </button>

                  <button
                    onClick={toggleVoice}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border cursor-pointer ${
                      voiceEnabled ? 'bg-teal-500/20 text-teal-300 border-teal-500/40' : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    {voiceEnabled ? <Volume2 className="w-4 h-4 text-teal-400" /> : <VolumeX className="w-4 h-4" />}
                    <span>{voiceEnabled ? 'Locución Activa' : 'Activar Voz'}</span>
                  </button>

                  <button
                    onClick={togglePlayReel}
                    className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs flex items-center gap-2 shadow-lg cursor-pointer"
                  >
                    {isPlayingReel ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                    <span>{isPlayingReel ? 'Pausar Tour' : 'Iniciar Video'}</span>
                  </button>
                </div>
              </div>

              {/* PANTALLA VISUAL GRANDE DE PRESENTACIÓN */}
              <div className="relative aspect-video bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 flex items-center justify-center p-8">
                <img 
                  src={socialSquareImg} 
                  alt="Video Stage" 
                  className="absolute inset-0 w-full h-full object-cover opacity-25 filter blur-xs"
                />
                <div className="relative z-10 max-w-2xl text-center space-y-4">
                  <span className="px-3 py-1 bg-emerald-500 text-slate-950 font-black text-xs rounded-full uppercase tracking-wider">
                    {currentReel.badge}
                  </span>
                  <h1 className="text-3xl md:text-5xl font-black text-white leading-tight">
                    {currentReel.hookText}
                  </h1>
                  <p className="text-sm md:text-base text-slate-200 font-light bg-black/60 p-4 rounded-2xl border border-white/10">
                    "{currentReel.narration}"
                  </p>
                </div>
              </div>

              {/* BARRA DE TIEMPO */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-mono text-slate-400">
                  <span>Progreso de Escena ({currentReel.durationSeconds}s)</span>
                  <span>{Math.round(reelProgress)}%</span>
                </div>
                <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                  <div 
                    className="h-full bg-emerald-500 transition-all duration-100 ease-linear"
                    style={{ width: `${reelProgress}%` }}
                  />
                </div>
              </div>

              {/* MINIATURAS DE ESCENAS */}
              <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                {reelScenes.map((s, idx) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setActiveReelIdx(idx);
                      setReelProgress(0);
                      if (voiceEnabled && isPlayingReel) speakNarration(s.narration);
                    }}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      activeReelIdx === idx
                        ? 'bg-indigo-600 text-white border-indigo-400 shadow'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    <p className="text-[10px] font-mono font-bold">Escena {idx + 1}</p>
                    <p className="text-xs font-bold truncate mt-0.5">{s.badge}</p>
                  </button>
                ))}
              </div>

            </div>

          </div>
        )}

      </div>

      {/* ========================================================================= */}
      {/* MODAL DE GALERÍA DE LAS 6 LÁMINAS EN ALTA DEFINICIÓN (1080x1080)          */}
      {/* ========================================================================= */}
      {showGalleryModal && (
        <div className="fixed inset-0 z-[999999] bg-slate-950/95 backdrop-blur-md flex flex-col p-4 md:p-8 overflow-y-auto">
          <div className="max-w-6xl mx-auto w-full space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-xl font-black text-white flex items-center gap-2">
                  <Grid className="w-5 h-5 text-pink-400" />
                  <span>Galería de las 6 Láminas de Instagram (1080x1080 HD)</span>
                </h2>
                <p className="text-xs text-slate-400">Haz clic en cualquier lámina para descargarla en PNG o descarga el Pack Completo en ZIP para tu PC.</p>
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  onClick={downloadAllSlidesZip}
                  disabled={isExporting}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow cursor-pointer transition-all disabled:opacity-50 active:scale-95"
                >
                  <Archive className="w-4 h-4" />
                  <span>Descargar Pack ZIP (6 Láminas)</span>
                </button>
                <button
                  onClick={downloadCarouselPDF}
                  disabled={isExporting}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs flex items-center gap-2 border border-slate-700 cursor-pointer transition-all disabled:opacity-50 active:scale-95"
                >
                  <FileText className="w-4 h-4 text-pink-400" />
                  <span>Descargar en PDF</span>
                </button>
                <button
                  onClick={() => setShowGalleryModal(false)}
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl cursor-pointer"
                  title="Cerrar galería"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[0, 1, 2, 3, 4, 5].map((idx) => {
                const meta = SLIDES_METADATA[idx];
                const slideImgUrl = getSlideDataUrl(idx);

                return (
                  <div key={idx} className="bg-slate-900/90 rounded-2xl border border-slate-800 p-4 space-y-3 flex flex-col justify-between shadow-2xl hover:border-slate-700 transition-all">
                    {/* Imagen HD pre-renderizada */}
                    <div className="rounded-xl overflow-hidden border border-slate-800 aspect-square bg-slate-950 flex items-center justify-center relative group">
                      <img 
                        src={slideImgUrl} 
                        alt={`Lámina ${idx + 1}: ${meta.title}`} 
                        className="w-full h-full object-contain"
                      />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-[2px]">
                        <button
                          onClick={() => downloadSlidePNGDirect(idx)}
                          className="px-3.5 py-2 bg-pink-600 hover:bg-pink-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-lg cursor-pointer transform scale-95 group-hover:scale-100 transition-all"
                        >
                          <Download className="w-4 h-4" />
                          <span>Descargar PNG</span>
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1">
                      <span className="font-bold text-slate-200">Lámina {idx + 1}/6</span>
                      <span className="text-slate-400 font-mono text-[11px]">{meta.badge}</span>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => downloadSlidePNGDirect(idx)}
                        className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow cursor-pointer transition-all active:scale-95"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Descargar PNG (HD)</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
