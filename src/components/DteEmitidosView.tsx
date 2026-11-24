import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import bwipjs from 'bwip-js/browser';
import { db } from '../lib/firebase';
import { consultarSiiDirecto } from '../utils/siiRcvClient';
import { leerDte, crearPdfDte, textoTimbre, NOMBRE_DTE } from '../utils/dteRepresentacion';

interface DteGuardado { id: string; tipo: string; folio: string; fecha: string; rutReceptor: string; razonReceptor: string; total: number; xml: string; nroResol?: string; fchResol?: string }

function timbrePng(ted: string): string | undefined {
  if (!ted) return undefined;
  try {
    const canvas = document.createElement('canvas');
    (bwipjs as any).toCanvas(canvas, { bcid: 'pdf417', text: textoTimbre(ted), eclevel: 5, columns: 12, scale: 2, height: 2 });
    return canvas.toDataURL('image/png');
  } catch (e) { console.warn('No se pudo dibujar el timbre', e); return undefined; }
}

export function pdfDeDte(g: DteGuardado, unidadSii?: string, cedible = false) {
  const d = leerDte(g.xml);
  return crearPdfDte(d, { timbrePng: timbrePng(d.ted), resolucion: { numero: g.nroResol || '', fecha: g.fchResol || '' }, unidadSii: unidadSii ? `S.I.I. - ${unidadSii}` : undefined, cedible });
}

export default function DteEmitidosView({ studyId, companyId, periodo, unidadSii, onClose }: { studyId: string; companyId: string; periodo: string; unidadSii?: string; onClose: () => void }) {
  const [docs, setDocs] = useState<DteGuardado[]>([]);
  const [cargando, setCargando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [viendo, setViendo] = useState<{ g: DteGuardado; url: string; cedible: boolean } | null>(null);
  useEffect(() => {
    const q = query(collection(db, 'studies', studyId, 'companies', companyId, 'dteXml'), where('period', '==', periodo));
    return onSnapshot(q, s => setDocs(s.docs.map(d => ({ id: d.id, ...(d.data() as any) })).sort((a, b) => (a.fecha + a.tipo + a.folio.padStart(10, '0')).localeCompare(b.fecha + b.tipo + b.folio.padStart(10, '0')))), () => setDocs([]));
  }, [studyId, companyId, periodo]);

  const descargarDesdeSii = async () => {
    const [y, m] = periodo.split('-').map(Number);
    setCargando(true); setAviso('');
    const r = await consultarSiiDirecto({ studyId, companyId, accion: 'xml', year: y, month: m });
    setCargando(false);
    if (!r.success) { setAviso(r.error || 'No se pudo descargar desde el SII.'); return; }
    const pend: string[] = r.pendientes || [];
    setAviso(`Listo: ${r.cantidad} documento(s) del ${periodo}.` + (pend.length ? ` No se pudieron bajar ${pend.length} grupo(s) (${pend.slice(0, 3).join(', ')}${pend.length > 3 ? '…' : ''}); vuelve a intentar o cárgalos con "Cargar XML de facturador".` : ''));
  };
  const ver = (g: DteGuardado, cedible = false) => {
    if (viendo) URL.revokeObjectURL(viendo.url);
    const url = URL.createObjectURL(pdfDeDte(g, unidadSii, cedible).output('blob'));
    setViendo({ g, url, cedible });
  };
  const nombreArchivo = (g: DteGuardado, ext: string) => `DTE_${g.tipo}_${g.folio}.${ext}`;
  const bajarPdf = (g: DteGuardado, cedible = false) => pdfDeDte(g, unidadSii, cedible).save(nombreArchivo(g, 'pdf'));
  const bajarXml = (g: DteGuardado) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([`<?xml version="1.0" encoding="ISO-8859-1"?>\n${g.xml}`], { type: 'application/xml' }));
    a.download = nombreArchivo(g, 'xml'); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const total = useMemo(() => docs.reduce((a, d) => a + (['61', '112'].includes(d.tipo) ? -d.total : d.total), 0), [docs]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-5xl p-5 space-y-4 my-8">
        <div className="flex flex-wrap justify-between items-start gap-3">
          <div>
            <h3 className="font-bold text-slate-900">Documentos emitidos {periodo} (XML del SII)</h3>
            <p className="text-xs text-slate-500">Ventas emitidas en el facturador gratuito del SII. Se guarda el XML (el documento tributario) y Gest_OK arma su versión impresa.</p>
          </div>
          <div className="flex gap-2">
            <button disabled={cargando} onClick={descargarDesdeSii} className="px-3 py-2 rounded-lg bg-indigo-600 disabled:bg-slate-400 text-white text-xs font-bold">
              {cargando ? 'Descargando desde el SII…' : `Descargar XML del SII (${periodo})`}
            </button>
            <button onClick={() => { if (viendo) URL.revokeObjectURL(viendo.url); onClose(); }} className="px-3 py-2 rounded-lg bg-slate-100 text-xs font-bold">Cerrar</button>
          </div>
        </div>
        {aviso && <p className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">{aviso}</p>}

        {viendo ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2 items-center">
              <button onClick={() => { URL.revokeObjectURL(viendo.url); setViendo(null); }} className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold">← Volver a la lista</button>
              <span className="text-xs font-semibold text-slate-700">{NOMBRE_DTE[viendo.g.tipo] || viendo.g.tipo} N° {viendo.g.folio}</span>
              {['33', '34', '46', '52'].includes(viendo.g.tipo) && (
                <button onClick={() => ver(viendo.g, !viendo.cedible)} className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold">
                  {viendo.cedible ? 'Ver original' : 'Ver copia cedible'}
                </button>
              )}
              <button onClick={() => bajarPdf(viendo.g, viendo.cedible)} className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold">Descargar PDF</button>
              <button onClick={() => bajarXml(viendo.g)} className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold">Descargar XML</button>
            </div>
            <iframe title="Representación impresa" src={viendo.url} className="w-full h-[75vh] border border-slate-200 rounded-lg" />
          </div>
        ) : docs.length === 0 ? (
          <p className="text-xs text-slate-500">No hay documentos guardados para {periodo}. Usa "Descargar XML del SII".</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="p-2">Fecha</th><th className="p-2">Documento</th><th className="p-2">Folio</th><th className="p-2">Receptor</th><th className="p-2 text-right">Total</th><th className="p-2"></th>
              </tr></thead>
              <tbody>
                {docs.map(g => (
                  <tr key={g.id} className="border-b border-slate-100">
                    <td className="p-2 font-mono">{g.fecha}</td>
                    <td className="p-2">{NOMBRE_DTE[g.tipo] || g.tipo}</td>
                    <td className="p-2 font-mono">{g.folio}</td>
                    <td className="p-2">{g.razonReceptor}<span className="block text-[10px] text-slate-500">{g.rutReceptor}</span></td>
                    <td className="p-2 text-right font-mono">{['110', '111', '112'].includes(g.tipo) ? g.total.toLocaleString('es-CL', { minimumFractionDigits: 2 }) : '$ ' + Math.round(g.total).toLocaleString('es-CL')}</td>
                    <td className="p-2 whitespace-nowrap text-right">
                      <button onClick={() => ver(g)} className="px-2 py-1 rounded-md bg-indigo-600 text-white font-semibold mr-1">Ver</button>
                      <button onClick={() => bajarPdf(g)} className="px-2 py-1 rounded-md border border-slate-300 font-semibold mr-1">PDF</button>
                      <button onClick={() => bajarXml(g)} className="px-2 py-1 rounded-md border border-slate-300 font-semibold">XML</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={4} className="p-2 text-right font-semibold">{docs.length} documento(s) · total nacional (notas de crédito restan)</td><td className="p-2 text-right font-mono font-bold">$ {Math.round(total).toLocaleString('es-CL')}</td><td /></tr></tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
