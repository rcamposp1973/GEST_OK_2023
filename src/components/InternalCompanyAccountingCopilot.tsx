import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, 
  Send, 
  X, 
  Minimize2, 
  Building2, 
  ShieldCheck, 
  Search, 
  FileText, 
  Calculator, 
  ArrowRight,
  TrendingUp,
  Receipt,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  HelpCircle
} from 'lucide-react';
import { Company, ChartOfAccount, Voucher, RCVDocument, Auxiliary, FiscalPeriodYear } from '../types';

interface InternalCopilotProps {
  studyId: string;
  company: Company;
  accounts: ChartOfAccount[];
  vouchers: Voucher[];
  rcvDocuments: RCVDocument[];
  auxiliaries: Auxiliary[];
  fiscalYears: FiscalPeriodYear[];
  onNavigateTab?: (tab: any) => void;
}

interface ChatMessage {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  time: string;
  suggestions?: string[];
  actionLink?: {
    tab: string;
    label: string;
  };
}

export default function InternalCompanyAccountingCopilot({
  studyId,
  company,
  accounts,
  vouchers,
  rcvDocuments,
  auxiliaries,
  fiscalYears,
  onNavigateTab
}: InternalCopilotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Historial de conversación inicial contextualizado estrictamente a esta empresa
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init-1',
      sender: 'ai',
      text: `Hola, soy tu Copiloto Contable para **${company.name}** (RUT: ${company.rut}).\n\nEstoy conectado exclusivamente a los libros, comprobantes, RCV y plan de cuentas de esta empresa. ¿En qué tarea contable o análisis puedo asistirte hoy?`,
      time: 'Ahora',
      suggestions: [
        'Resumen del RCV y Compras del mes',
        'Buscar facturas de un proveedor',
        'Revisar cuadratura del Balance',
        'Sugerir cuenta contable para un gasto',
        '¿Cuánto IVA Débito y Crédito tenemos?'
      ]
    }
  ]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isOpen, messages]);

  // Motor de Inteligencia y Análisis Contable Multi-Tenant (Estricto contexto de la empresa actual)
  const processAccountingQuery = (rawQuery: string): { response: string; suggestions?: string[]; actionLink?: { tab: string; label: string } } => {
    const q = rawQuery.toLowerCase().trim();

    // 1. Resumen de IVA / RCV / F29
    if (q.includes('iva') || q.includes('f29') || q.includes('debito') || q.includes('débito') || q.includes('credito') || q.includes('crédito') || q.includes('rcv')) {
      const totalVentas = rcvDocuments.filter(d => d.tipoRegistro === 'Venta');
      const totalCompras = rcvDocuments.filter(d => d.tipoRegistro === 'Compra');
      const totalHonorarios = rcvDocuments.filter(d => d.tipoRegistro === 'Honorarios');

      const sumDebito = totalVentas.reduce((acc, curr) => acc + (Number(curr.montoIva) || 0), 0);
      const sumCredito = totalCompras.reduce((acc, curr) => acc + (Number(curr.montoIva) || 0), 0);
      const sumNetoVentas = totalVentas.reduce((acc, curr) => acc + (Number(curr.montoNeto) || 0), 0);
      const sumNetoCompras = totalCompras.reduce((acc, curr) => acc + (Number(curr.montoNeto) || 0), 0);
      const retencionHonorarios = totalHonorarios.reduce((acc, curr) => acc + (Number(curr.montoRetencion || curr.montoIva) || 0), 0);

      const diffIva = sumDebito - sumCredito;

      let analysisText = `📊 **Resumen Tributario e IVA para ${company.name}:**\n\n`;
      analysisText += `• **Ventas Registradas:** ${totalVentas.length} documentos (Neto: $ ${sumNetoVentas.toLocaleString('es-CL')})\n`;
      analysisText += `• **Débito Fiscal (IVA Ventas):** $ ${sumDebito.toLocaleString('es-CL')}\n`;
      analysisText += `• **Compras Registradas:** ${totalCompras.length} documentos (Neto: $ ${sumNetoCompras.toLocaleString('es-CL')})\n`;
      analysisText += `• **Crédito Fiscal (IVA Compras):** $ ${sumCredito.toLocaleString('es-CL')}\n`;
      
      if (totalHonorarios.length > 0) {
        analysisText += `• **Boletas de Honorarios:** ${totalHonorarios.length} boletas (Retención estimada: $ ${retencionHonorarios.toLocaleString('es-CL')})\n`;
      }

      analysisText += `\n📌 **Posición Estimada de IVA:** `;
      if (diffIva > 0) {
        analysisText += `Impuesto Determinado a Pagar de **$ ${diffIva.toLocaleString('es-CL')}** (antes de PPM y retenciones).`;
      } else if (diffIva < 0) {
        analysisText += `Remanente de Crédito Fiscal a favor de **$ ${Math.abs(diffIva).toLocaleString('es-CL')}**.`;
      } else {
        analysisText += `IVA en equilibrio ($ 0).`;
      }

      return {
        response: analysisText,
        suggestions: ['Ir al Formulario 29', 'Ver Registro Compras y Ventas', 'Revisar cuadratura del Balance'],
        actionLink: { tab: 'formulario29', label: 'Abrir Formulario 29 (F29)' }
      };
    }

    // 2. Búsqueda de facturas / documentos
    if (q.includes('factura') || q.includes('proveedor') || q.includes('buscar') || q.includes('documento')) {
      const matchDocs = rcvDocuments.slice(0, 5);
      if (rcvDocuments.length === 0) {
        return {
          response: `Actualmente no hay documentos cargados en el Registro de Compras y Ventas de **${company.name}**. Puedes importar compras y ventas sincronizando directamente con el SII o cargando el archivo Excel oficial.`,
          suggestions: ['Sincronizar con SII', 'Ver Plan de Cuentas'],
          actionLink: { tab: 'rcv', label: 'Ir al Registro Compras y Ventas' }
        };
      }

      let docList = `🔍 **Últimos documentos registrados en ${company.name} (${rcvDocuments.length} totales):**\n\n`;
      matchDocs.forEach((d) => {
        const contraparte = d.tipoRegistro === 'Venta' ? (d.razonSocialReceptor || d.rutReceptor) : (d.razonSocialEmisor || d.rutEmisor);
        docList += `• **${d.nombreTipoDoc || d.tipoRegistro} Folio #${d.folio}**: ${contraparte || 'Sin Razón'} | Total: $ ${(Number(d.montoTotal) || 0).toLocaleString('es-CL')}\n`;
      });

      return {
        response: docList,
        suggestions: ['Ver todas las compras y ventas', '¿Cómo está el IVA del mes?', 'Buscar en el Libro Diario'],
        actionLink: { tab: 'rcv', label: 'Ver Registro Completo RCV' }
      };
    }

    // 3. Revisión de cuadratura / Balance / Asientos
    if (q.includes('balance') || q.includes('cuadratura') || q.includes('diario') || q.includes('asientos') || q.includes('comprobantes')) {
      let totalDebe = 0;
      let totalHaber = 0;
      let descuadradosCount = 0;

      vouchers.forEach((v) => {
        const vDebe = (v.lines || []).reduce((s, l) => s + (Number(l.debit) || 0), 0);
        const vHaber = (v.lines || []).reduce((s, l) => s + (Number(l.credit) || 0), 0);
        totalDebe += vDebe;
        totalHaber += vHaber;
        if (Math.abs(vDebe - vHaber) > 0.01) {
          descuadradosCount++;
        }
      });

      const diferencia = Math.abs(totalDebe - totalHaber);
      let balanceReport = `📋 **Auditoría de Comprobantes y Balance para ${company.name}:**\n\n`;
      balanceReport += `• **Comprobantes Totales:** ${vouchers.length} asientos ingresados.\n`;
      balanceReport += `• **Sumas del Libro Diario:**\n`;
      balanceReport += `  - Total Debe: $ ${totalDebe.toLocaleString('es-CL')}\n`;
      balanceReport += `  - Total Haber: $ ${totalHaber.toLocaleString('es-CL')}\n`;

      if (descuadradosCount === 0 && diferencia === 0) {
        balanceReport += `\n✅ **Estado:** ¡Cuadratura perfecta! El Libro Diario y Balance están 100% balanceados (Diferencia: $ 0).`;
      } else {
        balanceReport += `\n⚠️ **Atención:** Se detectaron ${descuadradosCount} comprobantes con descuadre. Diferencia total: $ ${diferencia.toLocaleString('es-CL')}.`;
      }

      return {
        response: balanceReport,
        suggestions: ['Ver Balance de 8 Columnas', 'Ver Libro Diario', 'Revisar Plan de Cuentas'],
        actionLink: { tab: 'balance8', label: 'Abrir Balance de 8 Columnas' }
      };
    }

    // 4. Sugerencia de contabilizaciones / Plan de Cuentas
    if (q.includes('sugier') || q.includes('contabiliz') || q.includes('cuenta') || q.includes('gasto') || q.includes('asiento') || q.includes('clasificar')) {
      return {
        response: `💡 **Guía de Clasificación Contable para ${company.name}:**\n\n` +
          `• **Gastos Operacionales Comunes:**\n` +
          `  - *Arriendos:* Cuenta de Resultado Pérdida "Arriendos y Gastos Comunes".\n` +
          `  - *Servicios Básicos (Luz, Agua, Internet):* Cuenta "Servicios Básicos".\n` +
          `  - *Honorarios Profesionales:* Cuenta "Gastos por Honorarios" con retención 14.5% al Haber.\n` +
          `  - *Compras de Mercadería:* Cuenta de Activo "Mercaderías" o Costo de Ventas.\n\n` +
          `• **Cuentas disponibles en esta empresa:** Tienes ${accounts.length} cuentas configuradas en tu Plan de Cuentas.\n` +
          `¿Deseas buscar una cuenta específica por código o nombre?`,
        suggestions: ['Ver Plan de Cuentas', 'Crear nuevo Comprobante', 'Revisar Auxiliares'],
        actionLink: { tab: 'accounts', label: 'Ver Plan de Cuentas de la Empresa' }
      };
    }

    // 5. Auxiliares / Clientes / Proveedores
    if (q.includes('auxiliar') || q.includes('cliente') || q.includes('proveedor') || q.includes('deudor') || q.includes('acreedor')) {
      return {
        response: `👥 **Maestro de Auxiliares de ${company.name}:**\n\n` +
          `Actualmente la empresa cuenta con **${auxiliaries.length} auxiliares registrados** (clientes, proveedores y honorarios).\n` +
          `Cada auxiliar mantiene su propio historial de documentos, pagos y saldo pendiente para análisis de cuentas por cobrar o por pagar.`,
        suggestions: ['Ver Auxiliares Deudores y Acreedores', 'Revisar compras RCV', 'Ver Libro Mayor'],
        actionLink: { tab: 'auxiliaries', label: 'Ir al Módulo de Auxiliares' }
      };
    }

    // 6. Consulta genérica o saludo
    return {
      response: `Estoy listo para ayudarte con la contabilidad de **${company.name}**.\n\nPuedo analizar el RCV, calcular la posición de IVA para el F29, auditar la cuadratura de tus asientos en el Libro Diario o sugerirte cuentas para contabilizar cualquier gasto.`,
      suggestions: [
        'Resumen del RCV y Compras del mes',
        'Revisar cuadratura del Balance',
        '¿Cuánto IVA Débito y Crédito tenemos?',
        'Sugerir cuenta contable para un gasto'
      ]
    };
  };

  const handleSend = (textToSend?: string) => {
    const text = textToSend || inputMessage;
    if (!text.trim()) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text: text.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    if (!textToSend) setInputMessage('');
    setIsAnalyzing(true);

    setTimeout(() => {
      const result = processAccountingQuery(text);
      setIsAnalyzing(false);

      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: result.response,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestions: result.suggestions,
        actionLink: result.actionLink
      };

      setMessages(prev => [...prev, aiMsg]);
    }, 600);
  };

  return (
    <>
      {/* Botón flotante dentro de la empresa */}
      <div className="fixed bottom-6 right-6 z-40">
        {!isOpen && (
          <button
            onClick={() => setIsOpen(true)}
            className="flex items-center gap-2.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-700 text-white px-4 py-3 rounded-full shadow-xl shadow-emerald-900/30 hover:shadow-emerald-600/40 hover:scale-105 transition-all duration-200 border border-emerald-400/40 group"
            title={`Copiloto Contable de ${company.name}`}
          >
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
            </div>
            <div className="text-left pr-1">
              <div className="text-xs font-bold leading-tight flex items-center gap-1.5">
                <span>Copiloto Contable</span>
                <span className="text-[10px] px-1.5 py-0.2 bg-emerald-500/30 text-emerald-100 rounded font-medium">IA Activa</span>
              </div>
              <div className="text-[11px] text-emerald-100/90 truncate max-w-[140px]">{company.name}</div>
            </div>
          </button>
        )}

        {/* Ventana de Chat Flotante del Copiloto */}
        {isOpen && (
          <div className="w-[380px] sm:w-[420px] h-[580px] max-h-[85vh] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200 font-sans z-50">
            
            {/* Header del Copiloto */}
            <div className="bg-gradient-to-r from-emerald-900 via-slate-900 to-indigo-950 p-3.5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-md">
                    <Sparkles className="w-5 h-5 text-amber-300" />
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 border-2 border-slate-900 rounded-full"></span>
                </div>
                <div>
                  <div className="text-sm font-bold text-white flex items-center gap-1.5">
                    <span>Copiloto Contable IA</span>
                    <span className="text-[10px] font-semibold text-emerald-300 bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-500/40">
                      Privado
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-300/90 font-medium truncate max-w-[220px]">
                    🏢 {company.name} ({company.rut})
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-slate-400 hover:text-white p-1.5 hover:bg-slate-800 rounded-lg transition-colors"
                  title="Minimizar"
                >
                  <Minimize2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-slate-400 hover:text-red-400 p-1.5 hover:bg-slate-800 rounded-lg transition-colors"
                  title="Cerrar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Banner de Aislamiento de Datos Multi-Tenant */}
            <div className="bg-emerald-950/40 border-b border-emerald-900/40 px-3 py-1.5 flex items-center gap-2 text-[11px] text-emerald-300">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Aislamiento estricto: Solo analiza datos contables de esta empresa.</span>
            </div>

            {/* Mensajes */}
            <div className="flex-1 p-3.5 overflow-y-auto space-y-3.5 bg-slate-950/70 text-xs">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-line ${
                      msg.sender === 'user'
                        ? 'bg-indigo-600 text-white rounded-br-none shadow-sm'
                        : 'bg-slate-800 text-slate-200 border border-slate-700/80 rounded-bl-none shadow-sm'
                    }`}
                  >
                    {msg.text}
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 px-1">{msg.time}</span>

                  {/* Enlace de acción rápida a pestaña contable */}
                  {msg.actionLink && onNavigateTab && (
                    <div className="mt-2">
                      <button
                        onClick={() => {
                          onNavigateTab(msg.actionLink!.tab);
                        }}
                        className="bg-emerald-600/90 hover:bg-emerald-500 text-white font-bold text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm transition-all hover:scale-102"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                        <span>{msg.actionLink.label}</span>
                      </button>
                    </div>
                  )}

                  {/* Sugerencias contextuales */}
                  {msg.suggestions && msg.suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2 max-w-[95%]">
                      {msg.suggestions.map((sug, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSend(sug)}
                          className="text-[11px] bg-slate-800 hover:bg-emerald-950 text-emerald-300 hover:text-emerald-200 border border-slate-700 hover:border-emerald-500/50 px-2.5 py-1 rounded-full transition-all text-left flex items-center gap-1"
                        >
                          <span>{sug}</span>
                          <ArrowRight className="w-2.5 h-2.5 opacity-60" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {isAnalyzing && (
                <div className="flex items-center gap-2 text-slate-400 bg-slate-800 border border-slate-700 w-fit px-3 py-2 rounded-2xl rounded-bl-none text-xs">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce"></span>
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                  </div>
                  <span className="text-[11px] text-emerald-300">Consultando libros y analizando datos...</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input del Chat */}
            <div className="p-2.5 bg-slate-900 border-t border-slate-800">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder={`Pregúntale al copiloto sobre ${company.name}...`}
                  className="flex-1 bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <button
                  type="submit"
                  disabled={!inputMessage.trim()}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white p-2 rounded-xl transition-colors shrink-0"
                  aria-label="Enviar al copiloto"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>

          </div>
        )}
      </div>
    </>
  );
}
