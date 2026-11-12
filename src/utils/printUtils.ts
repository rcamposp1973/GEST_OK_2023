/**
 * Helper utility to trigger clean iframe printing for web applications embedded in sandboxed environments.
 * Avoids printing the main page UI frame (sidebars, headers, action buttons) and bypasses popup blocker restrictions.
 */
export interface TriggerIframePrintOptions {
  title: string;
  styles?: string;
  /** Usa los estilos de la aplicación (Tailwind) en vez de los estilos básicos: el documento se imprime igual que se ve en pantalla. */
  useAppStyles?: boolean;
  /** Reduce el tamaño para que el documento quepa en una hoja (si es demasiado largo, sigue en más hojas). */
  fitOnePage?: boolean;
  htmlContent: string;
}

export function triggerIframePrint(options: TriggerIframePrintOptions): void {
  const defaultStyles = `
    @page {
      size: letter portrait;
      margin: 10mm 10mm 10mm 10mm;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 10px;
      color: #0f172a;
      margin: 0;
      padding: 0;
      background: #ffffff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    h1, h2, h3, h4 { margin: 0 0 4px 0; font-weight: bold; color: #0f172a; }
    p { margin: 0 0 4px 0; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 9.5px; }
    th, td { border: 1px solid #cbd5e1; padding: 4px 6px; text-align: left; }
    th { background-color: #f1f5f9; font-weight: bold; color: #1e293b; }
    .text-right { text-align: right; }
    .text-left { text-align: left; }
    .text-center { text-align: center; }
    .font-bold { font-weight: bold; }
    .bg-slate { background-color: #f8fafc; }
    .header-box { border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 14px; }
    .footer-box { margin-top: 24px; border-top: 1px solid #cbd5e1; padding-top: 8px; text-align: center; font-size: 8.5px; color: #64748b; }
    @media print {
      .no-print { display: none !important; }
    }
  `;

  // Estilos de la aplicación (hojas enlazadas y estilos incrustados), para imprimir igual que en pantalla
  let appStyles = '';
  if (options.useAppStyles) {
    const base = document.baseURI;
    // Se copian las reglas CSS ya cargadas (no depende de volver a descargar las hojas de estilo)
    let rules = '';
    const fallbackLinks: string[] = [];
    Array.from(document.styleSheets).forEach((sheet) => {
      try {
        rules += Array.from(sheet.cssRules).map((r) => r.cssText).join('\n') + '\n';
      } catch {
        if (sheet.href) fallbackLinks.push(`<link rel="stylesheet" href="${new URL(sheet.href, base).href}">`);
      }
    });
    const fonts = Array.from(document.querySelectorAll('link[rel="stylesheet"][href*="fonts.googleapis"]'))
      .map((l) => `<link rel="stylesheet" href="${(l as HTMLLinkElement).href}">`).join('\n');
    const links = fallbackLinks.join('\n') + fonts;
    const inline = `<style>${rules}</style>`;
    appStyles = links + inline;
  }
  const baseStyles = options.useAppStyles
    ? `@page { size: letter portrait; margin: 10mm; } body { margin: 0; background: #ffffff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }`
    : defaultStyles;

  try {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>${options.title}</title>
            ${appStyles}
            <style>
              ${baseStyles}
              ${options.styles || ''}
            </style>
          </head>
          <body>
            ${options.useAppStyles ? `<div id="gest-print-wrap" class="text-xs font-sans text-slate-900">${options.htmlContent}</div>` : options.htmlContent}
            <script>
              window.onload = function() {
                ${options.fitOnePage ? `
                try {
                  var w = document.getElementById('gest-print-wrap');
                  var maxH = 975;
                  var h0 = w.getBoundingClientRect().height;
                  if (h0 > maxH) { w.style.zoom = Math.max(0.55, 0.97 * maxH / h0); }
                } catch (e) {}` : ''}
                setTimeout(() => {
                  window.focus();
                  window.print();
                }, 300);
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
      return;
    }
  } catch (err) {
    console.warn('window.open print failed, falling back to overlay print:', err);
  }

  // Fallback to full-screen print overlay container (bypasses iframe restrictions and popup blockers)
  try {
    const existingOverlay = document.getElementById('gest-ok-print-overlay');
    if (existingOverlay) {
      existingOverlay.remove();
    }

    const overlay = document.createElement('div');
    overlay.id = 'gest-ok-print-overlay';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.backgroundColor = '#ffffff';
    overlay.style.zIndex = '999999';
    overlay.style.overflow = 'auto';
    overlay.style.padding = '20px';

    const styleTag = document.createElement('style');
    styleTag.innerHTML = `
      @media print {
        body > *:not(#gest-ok-print-overlay) { display: none !important; }
        #gest-ok-print-overlay { display: block !important; position: absolute !important; inset: 0 !important; margin: 0 !important; padding: 10px !important; width: 100% !important; background: white !important; }
      }
      ${defaultStyles}
      ${options.styles || ''}
    `;
    overlay.appendChild(styleTag);

    const contentDiv = document.createElement('div');
    contentDiv.innerHTML = options.htmlContent;
    overlay.appendChild(contentDiv);

    document.body.appendChild(overlay);

    setTimeout(() => {
      window.print();
      setTimeout(() => {
        if (overlay && overlay.parentNode) {
          overlay.remove();
        }
      }, 1000);
    }, 250);
  } catch (err) {
    console.error('Overlay print failed, falling back to window.print:', err);
    window.print();
  }
}

