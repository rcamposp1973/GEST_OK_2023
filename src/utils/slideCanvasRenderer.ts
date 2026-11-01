/**
 * Renderizador de láminas 1:1 para Instagram y PDF en HTML5 Canvas (1080x1080 px)
 * 100% nativo, con pantallas y componentes reales del sistema contable chileno Pulso Contable.
 */

export interface SlideData {
  slideNum: string;
  badge: string;
  title: string;
  subtitle: string;
  badgeColor?: string;
}

export const SLIDES_METADATA: SlideData[] = [
  {
    slideNum: "1/6",
    badge: "COCKPIT & NAVEGACIÓN",
    title: "ESPACIO CONTABLE UNIFICADO",
    subtitle: "Control total de tu empresa: indicadores oficiales UF/Dólar en tiempo real, bloqueo de periodos y barra ejecutiva.",
    badgeColor: "#6366f1"
  },
  {
    slideNum: "2/6",
    badge: "RCV OFICIAL SII",
    title: "CARGA MASIVA RCV Y HONORARIOS",
    subtitle: "Importa compras, ventas y boletas BHE oficiales: sin digitar a mano, cero duplicados y asignación automática.",
    badgeColor: "#14b8a6"
  },
  {
    slideNum: "3/6",
    badge: "LIBRO DIARIO & AUDITORÍA",
    title: "GRILLA EXCEL CON BLINDAJE TRIBUTARIO",
    subtitle: "Partida doble estricta con validación bloqueante de RUT, documentos y centros de costos antes de guardar.",
    badgeColor: "#8b5cf6"
  },
  {
    slideNum: "4/6",
    badge: "TESORERÍA INTELIGENTE",
    title: "CONCILIACIÓN BANCARIA EN 1 CLIC",
    subtitle: "Cruza cartolas de cualquier banco chileno contra facturas pendientes: Saldo Cartola = Saldo Libro Mayor.",
    badgeColor: "#10b981"
  },
  {
    slideNum: "5/6",
    badge: "CIERRE MENSUAL & TRIBUTARIO",
    title: "F29 Y BALANCE 8 COLUMNAS IFRS",
    subtitle: "Débito, crédito, retenciones BHE, PPM y balance de 8 columnas calculados al peso en tiempo real.",
    badgeColor: "#f59e0b"
  },
  {
    slideNum: "6/6",
    badge: "ACCESO Y DEMO EN VIVO",
    title: "PROGRAMA DE ESTUDIOS FUNDADORES",
    subtitle: "15 días de prueba 100% gratuita, migración asistida de empresas y soporte contable chileno.",
    badgeColor: "#06b6d4"
  }
];

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = words[0] || "";

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const width = ctx.measureText(currentLine + " " + word).width;
    if (width < maxWidth) {
      currentLine += " " + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

export function renderSlideToCanvas(slideIdx: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const data = SLIDES_METADATA[slideIdx] || SLIDES_METADATA[0];

  // 1. Fondo elegante oscuro con degradado (tema Cockpit Slate 950)
  const bgGrad = ctx.createLinearGradient(0, 0, 1080, 1080);
  bgGrad.addColorStop(0, "#030712");
  bgGrad.addColorStop(0.5, "#0b0f19");
  bgGrad.addColorStop(1, "#020617");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 1080, 1080);

  // Luz ambiental
  const glow = ctx.createRadialGradient(540, 350, 40, 540, 350, 550);
  glow.addColorStop(0, "rgba(99, 102, 241, 0.15)");
  glow.addColorStop(0.5, "rgba(16, 185, 129, 0.06)");
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1080, 1080);

  // 2. Barra superior multicolor
  const topGrad = ctx.createLinearGradient(0, 0, 1080, 0);
  topGrad.addColorStop(0, "#10b981");
  topGrad.addColorStop(0.35, "#06b6d4");
  topGrad.addColorStop(0.7, "#6366f1");
  topGrad.addColorStop(1, "#a855f7");
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, 1080, 14);

  // 3. Cabecera (Badge de Lámina y Badge Temático)
  ctx.save();
  // Badge Lámina
  drawRoundedRect(ctx, 70, 50, 160, 46, 23);
  ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
  ctx.fill();
  ctx.strokeStyle = "rgba(71, 85, 105, 0.7)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = "#f1f5f9";
  ctx.font = "bold 20px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`LÁMINA ${data.slideNum}`, 150, 73);

  // Badge Temático
  drawRoundedRect(ctx, 680, 50, 330, 46, 23);
  ctx.fillStyle = "rgba(30, 41, 59, 0.8)";
  ctx.fill();
  ctx.strokeStyle = data.badgeColor || "#6366f1";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = data.badgeColor || "#818cf8";
  ctx.font = "bold 17px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(data.badge, 845, 73);
  ctx.restore();

  // 4. Título Principal
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.font = "900 48px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

  const titleLines = wrapText(ctx, data.title, 940);
  const startY = titleLines.length === 1 ? 165 : 145;
  titleLines.forEach((line, i) => {
    ctx.fillText(line, 540, startY + i * 56);
  });
  ctx.restore();

  // 5. Subtítulo
  ctx.save();
  ctx.fillStyle = "#94a3b8";
  ctx.textAlign = "center";
  ctx.font = "400 23px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  const subY = startY + titleLines.length * 56 + 10;
  const subLines = wrapText(ctx, data.subtitle, 920);
  subLines.forEach((line, i) => {
    ctx.fillText(line, 540, subY + i * 32);
  });
  ctx.restore();

  // 6. Contenido central con interfaces REALES del sistema
  ctx.save();
  const cardY = 320;
  const cardW = 940;
  const cardX = 70;

  if (slideIdx === 0) {
    // LÁMINA 1: COCKPIT Y BARRA UNIFICADA REAL
    // Marco exterior simulando la ventana del software
    drawRoundedRect(ctx, cardX, cardY, cardW, 580, 20);
    ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
    ctx.fill();
    ctx.strokeStyle = "rgba(51, 65, 85, 0.9)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Barra Ejecutiva Unificada Real
    drawRoundedRect(ctx, cardX + 16, cardY + 16, cardW - 32, 85, 14);
    ctx.fillStyle = "#020617";
    ctx.fill();
    ctx.strokeStyle = "rgba(71, 85, 105, 0.8)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Botón VOLVER
    drawRoundedRect(ctx, cardX + 30, cardY + 35, 120, 46, 10);
    ctx.fillStyle = "#1e293b";
    ctx.fill();
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("← VOLVER", cardX + 90, cardY + 63);

    // Empresa Activa & RUT
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText("Ferretería Central SpA", cardX + 170, cardY + 54);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "16px monospace";
    ctx.fillText("RUT: 76.123.456-7  •  Casa Matriz", cardX + 170, cardY + 76);

    // Periodo con Candado
    drawRoundedRect(ctx, cardX + 540, cardY + 35, 150, 46, 10);
    ctx.fillStyle = "rgba(6, 78, 59, 0.6)";
    ctx.fill();
    ctx.strokeStyle = "#10b981";
    ctx.stroke();
    ctx.fillStyle = "#6ee7b7";
    ctx.font = "bold 17px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("2025 / OCT 🔒", cardX + 615, cardY + 64);

    // Indicadores Chilenos Oficiales (UF & Dólar)
    drawRoundedRect(ctx, cardX + 710, cardY + 35, 195, 46, 10);
    ctx.fillStyle = "rgba(30, 41, 59, 0.9)";
    ctx.fill();
    ctx.strokeStyle = "#6366f1";
    ctx.stroke();
    ctx.fillStyle = "#c7d2fe";
    ctx.font = "bold 15px monospace";
    ctx.fillText("UF $37.980  |  $945", cardX + 807, cardY + 63);

    // Fila de Pestañas de Trabajo Contables
    const tabs = ["Resumen Financiero", "RCV Oficial", "Comprobantes", "Bancos", "F29", "Balance 8 Col."];
    let tabX = cardX + 30;
    tabs.forEach((tab, i) => {
      const active = i === 0;
      const tabW = 140;
      drawRoundedRect(ctx, tabX, cardY + 120, tabW, 40, 8);
      ctx.fillStyle = active ? "rgba(16, 185, 129, 0.25)" : "rgba(30, 41, 59, 0.6)";
      ctx.fill();
      ctx.strokeStyle = active ? "#10b981" : "rgba(51, 65, 85, 0.7)";
      ctx.stroke();
      ctx.fillStyle = active ? "#34d399" : "#94a3b8";
      ctx.font = active ? "bold 15px sans-serif" : "14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(tab, tabX + tabW / 2, cardY + 145);
      tabX += tabW + 10;
    });

    // 3 Tarjetas de Resumen Ejecutivo
    const kpiW = (cardW - 64) / 3;
    // KPI 1
    drawRoundedRect(ctx, cardX + 24, cardY + 185, kpiW, 160, 14);
    ctx.fillStyle = "#0f172a";
    ctx.fill();
    ctx.strokeStyle = "rgba(51, 65, 85, 0.8)";
    ctx.stroke();
    ctx.textAlign = "left";
    ctx.fillStyle = "#94a3b8";
    ctx.font = "bold 15px sans-serif";
    ctx.fillText("VENTAS DEL PERIODO", cardX + 44, cardY + 225);
    ctx.fillStyle = "#34d399";
    ctx.font = "bold 32px monospace";
    ctx.fillText("$28.450.000", cardX + 44, cardY + 275);
    ctx.fillStyle = "#6ee7b7";
    ctx.font = "14px sans-serif";
    ctx.fillText("▲ +14.2% vs mes anterior", cardX + 44, cardY + 315);

    // KPI 2
    drawRoundedRect(ctx, cardX + 24 + kpiW + 8, cardY + 185, kpiW, 160, 14);
    ctx.fillStyle = "#0f172a";
    ctx.fill();
    ctx.strokeStyle = "rgba(51, 65, 85, 0.8)";
    ctx.stroke();
    ctx.fillStyle = "#94a3b8";
    ctx.font = "bold 15px sans-serif";
    ctx.fillText("COMPRAS Y GASTOS", cardX + 24 + kpiW + 28, cardY + 225);
    ctx.fillStyle = "#f87171";
    ctx.font = "bold 32px monospace";
    ctx.fillText("$19.820.000", cardX + 24 + kpiW + 28, cardY + 275);
    ctx.fillStyle = "#fca5a5";
    ctx.font = "14px sans-serif";
    ctx.fillText("100% Facturas registradas", cardX + 24 + kpiW + 28, cardY + 315);

    // KPI 3
    drawRoundedRect(ctx, cardX + 24 + (kpiW + 8) * 2, cardY + 185, kpiW, 160, 14);
    ctx.fillStyle = "#0f172a";
    ctx.fill();
    ctx.strokeStyle = "rgba(51, 65, 85, 0.8)";
    ctx.stroke();
    ctx.fillStyle = "#94a3b8";
    ctx.font = "bold 15px sans-serif";
    ctx.fillText("MARGEN OPERACIONAL", cardX + 24 + (kpiW + 8) * 2 + 20, cardY + 225);
    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 32px monospace";
    ctx.fillText("$8.630.000", cardX + 24 + (kpiW + 8) * 2 + 20, cardY + 275);
    ctx.fillStyle = "#bae6fd";
    ctx.font = "14px sans-serif";
    ctx.fillText("EBITDA proyectado: 30.3%", cardX + 24 + (kpiW + 8) * 2 + 20, cardY + 315);

    // Banner inferior
    drawRoundedRect(ctx, cardX + 24, cardY + 370, cardW - 48, 175, 14);
    ctx.fillStyle = "rgba(30, 41, 59, 0.7)";
    ctx.fill();
    ctx.strokeStyle = "rgba(99, 102, 241, 0.6)";
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillStyle = "#818cf8";
    ctx.font = "bold 20px sans-serif";
    ctx.fillText("⚡ Navegación Instantánea & Atajos F1", 540, cardY + 420);
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "18px sans-serif";
    ctx.fillText("Todo el trabajo del contador en una barra unificada sin recargas de página.", 540, cardY + 465);
    ctx.fillStyle = "#34d399";
    ctx.font = "bold 18px monospace";
    ctx.fillText("⌘K Buscador Universal  •  Atajos de Teclado F1  •  Modo Zen Pantalla Completa", 540, cardY + 505);

  } else if (slideIdx === 1) {
    // LÁMINA 2: RCV OFICIAL DEL SII Y HONORARIOS
    drawRoundedRect(ctx, cardX, cardY, cardW, 580, 20);
    ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
    ctx.fill();
    ctx.strokeStyle = "rgba(20, 184, 166, 0.8)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Encabezado de la tabla RCV
    drawRoundedRect(ctx, cardX + 20, cardY + 20, cardW - 40, 60, 12);
    ctx.fillStyle = "#042f2e";
    ctx.fill();
    ctx.strokeStyle = "#0d9488";
    ctx.stroke();
    ctx.textAlign = "left";
    ctx.fillStyle = "#2dd4bf";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText("📥 Registro de Compras y Ventas (RCV SII)", cardX + 40, cardY + 58);
    ctx.textAlign = "right";
    ctx.fillStyle = "#6ee7b7";
    ctx.font = "bold 17px monospace";
    ctx.fillText("48 Documentos  •  0 Duplicados", cardX + cardW - 40, cardY + 58);

    // Cabecera de columnas de la grilla
    const colsY = cardY + 100;
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(cardX + 20, colsY, cardW - 40, 42);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "bold 15px monospace";
    ctx.textAlign = "left";
    ctx.fillText("TIPO", cardX + 40, colsY + 27);
    ctx.fillText("FOLIO", cardX + 130, colsY + 27);
    ctx.fillText("RUT EMISOR", cardX + 230, colsY + 27);
    ctx.fillText("RAZÓN SOCIAL", cardX + 410, colsY + 27);
    ctx.textAlign = "right";
    ctx.fillText("NETO", cardX + 750, colsY + 27);
    ctx.fillText("TOTAL", cardX + cardW - 40, colsY + 27);

    // Filas reales
    const rows = [
      { tipo: "FC 33", folio: "4580", rut: "96.541.230-1", nombre: "SODIMAC S.A.", neto: "$1.250.000", total: "$1.487.500", color: "#34d399" },
      { tipo: "FC 33", folio: "1204", rut: "76.012.345-8", nombre: "ENEL DISTRIBUCION CHILE S.A.", neto: "$480.000", total: "$571.200", color: "#34d399" },
      { tipo: "NC 61", folio: "312", rut: "78.987.654-2", nombre: "DISTRIBUIDORA SUR LTDA", neto: "-$85.000", total: "-$101.150", color: "#f87171" },
      { tipo: "FC 33", folio: "8902", rut: "76.456.789-0", nombre: "TELEFONICA CHILE S.A.", neto: "$120.000", total: "$142.800", color: "#34d399" },
      { tipo: "BHE", folio: "45", rut: "15.678.901-2", nombre: "CONSULTOR CONTABLE SPA", neto: "$650.000", total: "$554.125", color: "#38bdf8" }
    ];

    rows.forEach((r, idx) => {
      const rowY = colsY + 45 + idx * 56;
      ctx.fillStyle = idx % 2 === 0 ? "rgba(30, 41, 59, 0.4)" : "rgba(15, 23, 42, 0.6)";
      ctx.fillRect(cardX + 20, rowY, cardW - 40, 52);

      ctx.textAlign = "left";
      ctx.fillStyle = r.color;
      ctx.font = "bold 16px monospace";
      ctx.fillText(r.tipo, cardX + 40, rowY + 32);

      ctx.fillStyle = "#f8fafc";
      ctx.fillText(r.folio, cardX + 130, rowY + 32);

      ctx.fillStyle = "#cbd5e1";
      ctx.font = "15px monospace";
      ctx.fillText(r.rut, cardX + 230, rowY + 32);

      ctx.fillStyle = "#ffffff";
      ctx.font = "15px sans-serif";
      ctx.fillText(r.nombre, cardX + 410, rowY + 32);

      ctx.textAlign = "right";
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "16px monospace";
      ctx.fillText(r.neto, cardX + 750, rowY + 32);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 16px monospace";
      ctx.fillText(r.total, cardX + cardW - 40, rowY + 32);
    });

    // Barra de estado inferior
    drawRoundedRect(ctx, cardX + 20, cardY + 440, cardW - 40, 115, 14);
    ctx.fillStyle = "#020617";
    ctx.fill();
    ctx.strokeStyle = "rgba(45, 212, 191, 0.5)";
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.fillStyle = "#2dd4bf";
    ctx.font = "bold 20px sans-serif";
    ctx.fillText("⚡ Generación Masiva del Comprobante en 2 Segundos", 540, cardY + 480);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "17px sans-serif";
    ctx.fillText("Asignación de cuenta de gasto según proveedor • Sin digitar RUTs a mano • Detección anti-duplicados", 540, cardY + 520);

  } else if (slideIdx === 2) {
    // LÁMINA 3: COMPROBANTES CONTABLES CON PARTIDA DOBLE ESTRICTA
    drawRoundedRect(ctx, cardX, cardY, cardW, 580, 20);
    ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
    ctx.fill();
    ctx.strokeStyle = "rgba(139, 92, 246, 0.8)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Encabezado comprobante
    drawRoundedRect(ctx, cardX + 20, cardY + 20, cardW - 40, 60, 12);
    ctx.fillStyle = "#2e1065";
    ctx.fill();
    ctx.strokeStyle = "#7c3aed";
    ctx.stroke();
    ctx.textAlign = "left";
    ctx.fillStyle = "#c4b5fd";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText("📑 Comprobante de Traspaso N° 108  •  Compras Octubre", cardX + 40, cardY + 58);
    ctx.textAlign = "right";
    ctx.fillStyle = "#4ade80";
    ctx.font = "bold 18px sans-serif";
    ctx.fillText("CUADRADO AL PESO ✓", cardX + cardW - 40, cardY + 58);

    // Cabecera grilla Excel
    const gridY = cardY + 100;
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(cardX + 20, gridY, cardW - 40, 42);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "bold 15px monospace";
    ctx.textAlign = "left";
    ctx.fillText("CUENTA", cardX + 40, gridY + 27);
    ctx.fillText("NOMBRE DE LA CUENTA", cardX + 160, gridY + 27);
    ctx.fillText("RUT AUXILIAR", cardX + 460, gridY + 27);
    ctx.textAlign = "right";
    ctx.fillText("DEBE ($)", cardX + 740, gridY + 27);
    ctx.fillText("HABER ($)", cardX + cardW - 40, gridY + 27);

    // Filas contables
    const cRows = [
      { cta: "1-1-08-01", nom: "Mercaderías Bodega Central", rut: "76.123.456-7", debe: "$1.250.000", haber: "$0", cColor: "#a78bfa" },
      { cta: "1-1-10-01", nom: "IVA Crédito Fiscal 19%", rut: "-", debe: "$237.500", haber: "$0", cColor: "#a78bfa" },
      { cta: "2-1-01-01", nom: "Proveedores Nacionales", rut: "96.541.230-1", debe: "$0", haber: "$1.487.500", cColor: "#fbbf24" }
    ];

    cRows.forEach((r, idx) => {
      const rY = gridY + 45 + idx * 60;
      ctx.fillStyle = idx % 2 === 0 ? "rgba(30, 41, 59, 0.4)" : "rgba(15, 23, 42, 0.6)";
      ctx.fillRect(cardX + 20, rY, cardW - 40, 56);

      ctx.textAlign = "left";
      ctx.fillStyle = r.cColor;
      ctx.font = "bold 16px monospace";
      ctx.fillText(r.cta, cardX + 40, rY + 34);

      ctx.fillStyle = "#ffffff";
      ctx.font = "16px sans-serif";
      ctx.fillText(r.nom, cardX + 160, rY + 34);

      ctx.fillStyle = "#94a3b8";
      ctx.font = "15px monospace";
      ctx.fillText(r.rut, cardX + 460, rY + 34);

      ctx.textAlign = "right";
      ctx.fillStyle = r.debe !== "$0" ? "#4ade80" : "#64748b";
      ctx.font = "bold 17px monospace";
      ctx.fillText(r.debe, cardX + 740, rY + 34);

      ctx.fillStyle = r.haber !== "$0" ? "#fbbf24" : "#64748b";
      ctx.fillText(r.haber, cardX + cardW - 40, rY + 34);
    });

    // Fila de totales Debe = Haber
    const totY = gridY + 235;
    ctx.fillStyle = "#020617";
    ctx.fillRect(cardX + 20, totY, cardW - 40, 55);
    ctx.strokeStyle = "#475569";
    ctx.strokeRect(cardX + 20, totY, cardW - 40, 55);

    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 18px sans-serif";
    ctx.fillText("TOTALES COMPROBANTE (Diferencia: $0):", cardX + 40, totY + 35);

    ctx.textAlign = "right";
    ctx.fillStyle = "#4ade80";
    ctx.font = "bold 20px monospace";
    ctx.fillText("$1.487.500", cardX + 740, totY + 35);
    ctx.fillText("$1.487.500", cardX + cardW - 40, totY + 35);

    // Badges de auditoría estricta
    const pY = cardY + 420;
    const pW = (cardW - 60) / 3;
    const rules = [
      { label: "RUT* Obligatorio", desc: "Bloquea cuentas que requieren auxiliar", col: "#818cf8", bg: "rgba(49, 46, 129, 0.5)" },
      { label: "DOC* Requerido", desc: "Exige tipo y folio en compras/ventas", col: "#fbbf24", bg: "rgba(120, 53, 15, 0.5)" },
      { label: "CC* Obligatorio", desc: "Validación estricta de Centros de Costo", col: "#34d399", bg: "rgba(6, 78, 59, 0.5)" }
    ];

    rules.forEach((rule, i) => {
      const rx = cardX + 20 + i * (pW + 10);
      drawRoundedRect(ctx, rx, pY, pW, 130, 14);
      ctx.fillStyle = rule.bg;
      ctx.fill();
      ctx.strokeStyle = rule.col;
      ctx.stroke();

      ctx.textAlign = "center";
      ctx.fillStyle = rule.col;
      ctx.font = "bold 18px monospace";
      ctx.fillText(rule.label, rx + pW / 2, pY + 45);

      ctx.fillStyle = "#e2e8f0";
      ctx.font = "14px sans-serif";
      const descLines = wrapText(ctx, rule.desc, pW - 20);
      descLines.forEach((l, li) => {
        ctx.fillText(l, rx + pW / 2, pY + 80 + li * 24);
      });
    });

  } else if (slideIdx === 3) {
    // LÁMINA 4: CONCILIACIÓN BANCARIA EN 1 CLIC
    drawRoundedRect(ctx, cardX, cardY, cardW, 580, 20);
    ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
    ctx.fill();
    ctx.strokeStyle = "rgba(16, 185, 129, 0.8)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Encabezado
    drawRoundedRect(ctx, cardX + 20, cardY + 20, cardW - 40, 60, 12);
    ctx.fillStyle = "#064e3b";
    ctx.fill();
    ctx.strokeStyle = "#059669";
    ctx.stroke();
    ctx.textAlign = "left";
    ctx.fillStyle = "#6ee7b7";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText("🏦 Conciliación Bancaria • Banco de Chile Cta Cte", cardX + 40, cardY + 58);
    ctx.textAlign = "right";
    ctx.fillStyle = "#a7f3d0";
    ctx.font = "bold 17px monospace";
    ctx.fillText("Saldo Cartola = Saldo Mayor ✓", cardX + cardW - 40, cardY + 58);

    // Comparativa de Match: Cartola vs Factura
    const boxW = (cardW - 60) / 2;
    // Caja Cartola
    drawRoundedRect(ctx, cardX + 20, cardY + 105, boxW, 230, 16);
    ctx.fillStyle = "#020617";
    ctx.fill();
    ctx.strokeStyle = "rgba(51, 65, 85, 0.9)";
    ctx.stroke();

    ctx.textAlign = "left";
    ctx.fillStyle = "#94a3b8";
    ctx.font = "bold 16px sans-serif";
    ctx.fillText("CARTOLA BANCARIA IMPORTADA", cardX + 40, cardY + 140);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 20px sans-serif";
    ctx.fillText("Abono Transferencia #9042", cardX + 40, cardY + 180);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "15px monospace";
    ctx.fillText("Fecha: 15/10/2025  •  RUT 96.541.230-1", cardX + 40, cardY + 215);

    ctx.fillStyle = "#34d399";
    ctx.font = "bold 34px monospace";
    ctx.fillText("+$1.487.500", cardX + 40, cardY + 280);

    // Caja Factura
    drawRoundedRect(ctx, cardX + 30 + boxW, cardY + 105, boxW, 230, 16);
    ctx.fillStyle = "#020617";
    ctx.fill();
    ctx.strokeStyle = "rgba(51, 65, 85, 0.9)";
    ctx.stroke();

    ctx.fillStyle = "#94a3b8";
    ctx.font = "bold 16px sans-serif";
    ctx.fillText("FACTURA DE VENTA PENDIENTE", cardX + 50 + boxW, cardY + 140);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 20px sans-serif";
    ctx.fillText("Factura N° 4580 • Sodimac S.A.", cardX + 50 + boxW, cardY + 180);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "15px monospace";
    ctx.fillText("Vencimiento: 15/10/2025  •  Saldo pendiente", cardX + 50 + boxW, cardY + 215);

    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 34px monospace";
    ctx.fillText("$1.487.500", cardX + 50 + boxW, cardY + 280);

    // Botón de Match Central
    drawRoundedRect(ctx, cardX + 20, cardY + 360, cardW - 40, 75, 14);
    ctx.fillStyle = "rgba(6, 78, 59, 0.8)";
    ctx.fill();
    ctx.strokeStyle = "#10b981";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.fillStyle = "#a7f3d0";
    ctx.font = "bold 24px sans-serif";
    ctx.fillText("⚡ MATCH AUTOMÁTICO EN 1 CLIC (Diferencia: $0)", 540, cardY + 408);

    // Banner explicativo inferior
    drawRoundedRect(ctx, cardX + 20, cardY + 455, cardW - 40, 100, 14);
    ctx.fillStyle = "#0f172a";
    ctx.fill();
    ctx.strokeStyle = "rgba(71, 85, 105, 0.8)";
    ctx.stroke();

    ctx.fillStyle = "#f8fafc";
    ctx.font = "18px sans-serif";
    ctx.fillText("El sistema concilia la factura y genera automáticamente el comprobante de egreso o ingreso,", 540, cardY + 495);
    ctx.fillStyle = "#34d399";
    ctx.font = "bold 18px monospace";
    ctx.fillText("dejando la cuenta corriente 100% cuadrada con el libro mayor al instante.", 540, cardY + 530);

  } else if (slideIdx === 4) {
    // LÁMINA 5: F29 Y BALANCE GENERAL DE 8 COLUMNAS IFRS
    drawRoundedRect(ctx, cardX, cardY, cardW, 580, 20);
    ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
    ctx.fill();
    ctx.strokeStyle = "rgba(245, 158, 11, 0.8)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Encabezado
    drawRoundedRect(ctx, cardX + 20, cardY + 20, cardW - 40, 60, 12);
    ctx.fillStyle = "#451a03";
    ctx.fill();
    ctx.strokeStyle = "#b45309";
    ctx.stroke();
    ctx.textAlign = "left";
    ctx.fillStyle = "#fde68a";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText("📊 Cierres Mensuales: Formulario 29 & Balance 8 Columnas", cardX + 40, cardY + 58);
    ctx.textAlign = "right";
    ctx.fillStyle = "#f59e0b";
    ctx.font = "bold 17px monospace";
    ctx.fillText("Normativa SII & IFRS", cardX + cardW - 40, cardY + 58);

    // 2 Bloques: F29 a la izquierda, Balance a la derecha
    const halfW = (cardW - 60) / 2;

    // Bloque F29
    drawRoundedRect(ctx, cardX + 20, cardY + 105, halfW, 330, 16);
    ctx.fillStyle = "#020617";
    ctx.fill();
    ctx.strokeStyle = "rgba(245, 158, 11, 0.6)";
    ctx.stroke();

    ctx.textAlign = "left";
    ctx.fillStyle = "#fcd34d";
    ctx.font = "bold 20px sans-serif";
    ctx.fillText("FORMULARIO 29 (F29 SII)", cardX + 40, cardY + 145);

    const f29Items = [
      { k: "IVA Débito (Ventas):", v: "$3.840.500", c: "#f87171" },
      { k: "IVA Crédito (Compras):", v: "$2.915.200", c: "#4ade80" },
      { k: "Impuesto Determinado:", v: "$925.300", c: "#ffffff" },
      { k: "Retención Honorarios (14.5%):", v: "$94.250", c: "#fbbf24" },
      { k: "PPM Determinado:", v: "$303.197", c: "#38bdf8" }
    ];

    f29Items.forEach((it, idx) => {
      const iy = cardY + 185 + idx * 44;
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "15px sans-serif";
      ctx.fillText(it.k, cardX + 40, iy);
      ctx.textAlign = "right";
      ctx.fillStyle = it.c;
      ctx.font = "bold 17px monospace";
      ctx.fillText(it.v, cardX + halfW, iy);
      ctx.textAlign = "left";
    });

    // Bloque Balance 8 Columnas
    drawRoundedRect(ctx, cardX + 30 + halfW, cardY + 105, halfW, 330, 16);
    ctx.fillStyle = "#020617";
    ctx.fill();
    ctx.strokeStyle = "rgba(168, 85, 247, 0.6)";
    ctx.stroke();

    ctx.textAlign = "left";
    ctx.fillStyle = "#d8b4fe";
    ctx.font = "bold 20px sans-serif";
    ctx.fillText("BALANCE 8 COLUMNAS IFRS", cardX + 50 + halfW, cardY + 145);

    const balItems = [
      { k: "Débitos = Créditos:", v: "$148.520.000", c: "#c084fc" },
      { k: "Saldos Deudor = Acreedor:", v: "$94.310.000", c: "#c084fc" },
      { k: "Total Activos:", v: "$68.450.000", c: "#4ade80" },
      { k: "Total Pasivo + Patrimonio:", v: "$68.450.000", c: "#4ade80" },
      { k: "Resultado del Ejercicio:", v: "$8.630.000", c: "#38bdf8" }
    ];

    balItems.forEach((it, idx) => {
      const iy = cardY + 185 + idx * 44;
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "15px sans-serif";
      ctx.fillText(it.k, cardX + 50 + halfW, iy);
      ctx.textAlign = "right";
      ctx.fillStyle = it.c;
      ctx.font = "bold 17px monospace";
      ctx.fillText(it.v, cardX + cardW - 40, iy);
      ctx.textAlign = "left";
    });

    // Banner inferior
    drawRoundedRect(ctx, cardX + 20, cardY + 455, cardW - 40, 100, 14);
    ctx.fillStyle = "#1e293b";
    ctx.fill();
    ctx.strokeStyle = "rgba(245, 158, 11, 0.7)";
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.fillStyle = "#fde68a";
    ctx.font = "bold 20px sans-serif";
    ctx.fillText("Exportación Oficial con un Clic a Excel y PDF", 540, cardY + 495);
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "17px sans-serif";
    ctx.fillText("Mayorización en tiempo real sin trasnoches ni descuadres de última hora.", 540, cardY + 530);

  } else if (slideIdx === 5) {
    // LÁMINA 6: PROGRAMA DE ESTUDIOS FUNDADORES & ACCESO
    drawRoundedRect(ctx, cardX, cardY, cardW, 580, 20);
    const grad6 = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + 580);
    grad6.addColorStop(0, "rgba(6, 78, 59, 0.95)");
    grad6.addColorStop(0.5, "rgba(15, 23, 42, 0.98)");
    grad6.addColorStop(1, "rgba(4, 47, 46, 0.95)");
    ctx.fillStyle = grad6;
    ctx.fill();
    ctx.strokeStyle = "rgba(16, 185, 129, 0.9)";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Badge interno
    drawRoundedRect(ctx, 540 - 180, cardY + 30, 360, 48, 24);
    ctx.fillStyle = "#10b981";
    ctx.fill();
    ctx.fillStyle = "#020617";
    ctx.font = "900 19px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("PROGRAMA ESTUDIOS FUNDADORES", 540, cardY + 60);

    // Beneficios concretos
    const benY = cardY + 115;
    const benefits = [
      { t: "15 Días de Prueba 100% Gratuita", d: "Acceso total sin tarjeta de crédito ni compromisos." },
      { t: "Migración Asistida de Empresas", d: "Te ayudamos a importar tu plan de cuentas y saldos iniciales." },
      { t: "Soporte Contable Experto en Chile", d: "Atención directa vía WhatsApp por contadores que entienden el SII." },
      { t: "Tarifa Preferencial Congelada de por Vida", d: "Usuarios ilimitados para tu equipo y tus clientes." }
    ];

    benefits.forEach((b, idx) => {
      const by = benY + idx * 85;
      drawRoundedRect(ctx, cardX + 35, by, cardW - 70, 72, 12);
      ctx.fillStyle = "rgba(2, 6, 23, 0.75)";
      ctx.fill();
      ctx.strokeStyle = "rgba(52, 211, 153, 0.4)";
      ctx.stroke();

      ctx.textAlign = "left";
      ctx.fillStyle = "#34d399";
      ctx.font = "bold 20px sans-serif";
      ctx.fillText(`✓  ${b.t}`, cardX + 55, by + 32);

      ctx.fillStyle = "#cbd5e1";
      ctx.font = "16px sans-serif";
      ctx.fillText(b.d, cardX + 78, by + 56);
    });

    // Contacto y acción
    drawRoundedRect(ctx, cardX + 35, cardY + 475, cardW - 70, 80, 16);
    ctx.fillStyle = "#020617";
    ctx.fill();
    ctx.strokeStyle = "#10b981";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText("📲 WhatsApp Directo: +56 9 4631 8783  |  app.pulsocontable.cl", 540, cardY + 522);
  }
  ctx.restore();

  // 7. Pie de Lámina (Branding & Desliza)
  ctx.save();
  ctx.strokeStyle = "rgba(51, 65, 85, 0.7)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(70, 960);
  ctx.lineTo(1010, 960);
  ctx.stroke();

  // Logo y Marca
  ctx.fillStyle = "#10b981";
  ctx.beginPath();
  ctx.arc(85, 1000, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f8fafc";
  ctx.font = "bold 24px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("Pulso Contable", 105, 1000);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "400 20px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText("• Software Contable en la Nube Chile", 280, 1000);

  // Call to action de deslizamiento
  ctx.textAlign = "right";
  ctx.fillStyle = "#38bdf8";
  ctx.font = "bold 22px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(
    slideIdx < 5 ? "Desliza para ver más 👉" : "¡Guarda este post! 📌",
    1010,
    1000
  );
  ctx.restore();

  return canvas;
}

/**
 * Obtiene el Data URL PNG de una lámina (instantáneo y 100% libre de errores)
 */
export function getSlideDataUrl(slideIdx: number): string {
  const canvas = renderSlideToCanvas(slideIdx);
  return canvas.toDataURL("image/png");
}

/**
 * Descarga una sola lámina directamente como archivo PNG
 */
export function downloadSlidePNGDirect(slideIdx: number): void {
  const dataUrl = getSlideDataUrl(slideIdx);
  const data = SLIDES_METADATA[slideIdx] || SLIDES_METADATA[0];
  const cleanBadge = data.badge.replace(/[^a-zA-Z0-9]/g, "_");
  const filename = `Lamina_${slideIdx + 1}_${cleanBadge}_PulsoContable.png`;

  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
