import type { ChartOfAccount, Company, SalesOrder, SalesConfig } from '../types';
import { calcularTotales, importeLinea, referenciaOV } from './ventas';
import { formatearRut } from './rutFormato';

const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clp = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-CL');
const fecha = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(8, 10) + '-' + d.slice(5, 7) + '-' + d.slice(0, 4) : d || '');

/** HTML de la Orden de Compra en formato estándar (empresa, proveedor, líneas, totales, condiciones y firmas). */
export function htmlOrdenVenta(oc: SalesOrder, company: Company, cfg: SalesConfig, _accounts?: ChartOfAccount[]): string {
  const t = calcularTotales(oc.lines);
  const filas = oc.lines.map((l, i) => `
    <tr>
      <td class="c">${i + 1}</td><td>${esc(l.code)}</td><td>${esc(l.name)}</td><td class="c">${esc(l.unit)}</td>
      <td class="r">${esc(l.quantity)}</td><td class="r">${clp(l.unitPriceNeto)}</td><td class="r">${clp(importeLinea(l))}${l.exento ? ' (ex.)' : ''}</td>
    </tr>`).join('');
  const aprob = (oc.approvals || []).filter(a => a.decision === 'APROBADA')
    .map(a => `<div class="ap">Aprobada nivel ${a.level}: ${esc(a.by)} · ${esc(a.at.slice(0, 10))}</div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(referenciaOV(oc.number))}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #0f172a; margin: 0; }
  .top { display: flex; justify-content: space-between; gap: 16px; border-bottom: 2px solid #0f172a; padding-bottom: 8px; }
  .emp b { font-size: 15px; } .emp div { margin-top: 2px; color: #334155; }
  .box { border: 1.5px solid #0f172a; padding: 8px 14px; text-align: center; min-width: 190px; }
  .box .t { font-weight: 700; font-size: 13px; } .box .n { font-size: 17px; font-weight: 800; margin-top: 4px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
  .card { border: 1px solid #cbd5e1; border-radius: 4px; padding: 8px; } .card h4 { margin: 0 0 4px; font-size: 10px; text-transform: uppercase; color: #64748b; }
  .card div { margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th { background: #0f172a; color: #fff; padding: 5px 6px; font-size: 10px; text-align: left; }
  td { border-bottom: 1px solid #e2e8f0; padding: 5px 6px; vertical-align: top; }
  .r { text-align: right; } .c { text-align: center; }
  .tot { margin-left: auto; width: 250px; margin-top: 10px; }
  .tot div { display: flex; justify-content: space-between; padding: 3px 0; }
  .tot .g { border-top: 2px solid #0f172a; font-weight: 800; font-size: 13px; margin-top: 3px; padding-top: 5px; }
  .obs { margin-top: 12px; border: 1px solid #cbd5e1; border-radius: 4px; padding: 8px; min-height: 40px; white-space: pre-wrap; }
  .firmas { display: grid; grid-template-columns: repeat(3, 1fr); gap: 28px; margin-top: 56px; }
  .firma { border-top: 1px solid #0f172a; text-align: center; padding-top: 4px; font-size: 10px; }
  .ap { font-size: 9px; color: #475569; margin-top: 2px; }
  .pie { margin-top: 14px; font-size: 9.5px; color: #475569; white-space: pre-wrap; }
</style></head><body>
  <div class="top">
    <div class="emp"><b>${esc(company.name)}</b>
      <div>RUT ${esc(formatearRut(company.rut))}</div>
      ${company.giro ? `<div>${esc(company.giro)}</div>` : ''}
      <div>${esc([company.address, company.comuna].filter(Boolean).join(', '))}</div>
      <div>${esc([company.email, company.phone].filter(Boolean).join(' · '))}</div></div>
    <div class="box"><div class="t">ORDEN DE VENTA</div><div class="n">N° ${esc(oc.number)}</div><div style="margin-top:4px">Fecha: ${esc(fecha(oc.date))}</div></div>
  </div>
  <div class="grid">
    <div class="card"><h4>Cliente</h4><div><b>${esc(oc.customerName)}</b></div><div>RUT ${esc(formatearRut(oc.customerRut))}</div>
      ${oc.customerAddress ? `<div>${esc(oc.customerAddress)}</div>` : ''}${oc.customerEmail ? `<div>${esc(oc.customerEmail)}</div>` : ''}</div>
    <div class="card"><h4>Condiciones</h4>
      <div>Condición de pago: <b>${esc(oc.paymentTerms || '—')}</b></div>
      <div>Fecha de entrega: <b>${esc(fecha(oc.deliveryDate) || '—')}</b></div>
      <div>Lugar de entrega: <b>${esc(oc.deliveryPlace || '—')}</b></div></div>
  </div>
  <table><thead><tr><th class="c" style="width:28px">#</th><th style="width:70px">Código</th><th>Descripción</th><th class="c" style="width:38px">Un.</th><th class="r" style="width:50px">Cant.</th><th class="r" style="width:80px">P. unit. neto</th><th class="r" style="width:90px">Importe</th></tr></thead><tbody>${filas}</tbody></table>
  <div class="tot">
    <div><span>Neto</span><span>${clp(t.neto)}</span></div>
    ${t.exento ? `<div><span>Exento</span><span>${clp(t.exento)}</span></div>` : ''}
    <div><span>IVA 19%</span><span>${clp(t.iva)}</span></div>
    <div class="g"><span>TOTAL</span><span>${clp(t.total)}</span></div>
  </div>
  <div class="obs"><b>Observaciones:</b> ${esc(oc.notes || '')}</div>
  <div class="firmas">
    <div class="firma">Emitido por<br>${esc(oc.createdBy || '')}</div>
    <div class="firma">Aprobado<br>${aprob || '&nbsp;'}</div>
    <div class="firma">Aceptación cliente</div>
  </div>
  <div class="pie">Documento interno de pedido: no es un documento tributario. La factura se emite por separado y hará referencia a esta orden de venta N° ${esc(oc.number)}.${cfg.footerNotes ? '\n' + esc(cfg.footerNotes) : ''}</div>
</body></html>`;
}

/** Abre el diálogo de impresión (o "Guardar como PDF") con la O/C, sin salir de la aplicación. */
export function imprimirOrdenVenta(oc: SalesOrder, company: Company, cfg: SalesConfig, accounts?: ChartOfAccount[]) {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  const d = iframe.contentWindow!.document;
  d.open(); d.write(htmlOrdenVenta(oc, company, cfg, accounts)); d.close();
  setTimeout(() => {
    try { iframe.contentWindow!.focus(); iframe.contentWindow!.print(); } finally {
      setTimeout(() => iframe.remove(), 2000);
    }
  }, 300);
}
