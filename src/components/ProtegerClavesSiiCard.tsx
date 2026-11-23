import React, { useState } from 'react';
import { auth } from '../lib/firebase';
import { ShieldCheck, AlertTriangle, CheckCircle2 } from 'lucide-react';

/**
 * Protección de claves SII (solo Super Administrador).
 * Busca en todas las empresas credenciales del SII guardadas sin cifrar (versiones anteriores),
 * las cifra en el servidor, verifica que se puedan descifrar y recién ahí borra la copia en claro.
 */
interface Resultado { modo: 'revisar' | 'aplicar'; revisadas: number; conClaves: number; protegidas: number; errores: string[] }

async function llamar(modo: 'revisar' | 'aplicar'): Promise<Resultado> {
  const token = await auth.currentUser?.getIdToken();
  const r = await fetch('/api/admin/proteger-claves-sii', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ modo }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(j.error || `Error ${r.status}`);
  return j;
}

export default function ProtegerClavesSiiCard() {
  const [ocupado, setOcupado] = useState(false);
  const [res, setRes] = useState<Resultado | null>(null);
  const [error, setError] = useState('');

  const correr = async (modo: 'revisar' | 'aplicar') => {
    setOcupado(true); setError('');
    try { setRes(await llamar(modo)); } catch (e: any) { setError(e?.message || 'No se pudo completar'); }
    finally { setOcupado(false); }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-5 h-5 text-slate-700" />
        <h3 className="font-semibold text-slate-900">Proteger claves del SII</h3>
      </div>
      <p className="text-sm text-slate-600">
        Cifra las claves del SII, el certificado digital y la clave de SimpleAPI que versiones anteriores dejaron guardadas sin cifrar en las empresas.
        Primero revisa cuántas hay; al aplicar, cada credencial se cifra, se comprueba y recién entonces se borra la copia sin cifrar.
      </p>
      <div className="flex flex-wrap gap-2">
        <button disabled={ocupado} onClick={() => correr('revisar')} className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-60">
          {ocupado ? 'Trabajando…' : 'Revisar'}
        </button>
        <button disabled={ocupado || !res || res.modo !== 'revisar' || res.conClaves === 0} onClick={() => correr('aplicar')}
          className="bg-slate-900 text-white rounded-lg px-3 py-1.5 text-sm disabled:opacity-40">
          Cifrar {res && res.modo === 'revisar' ? res.conClaves : ''} empresa(s)
        </button>
      </div>
      {error && <p className="text-sm text-rose-700 flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> {error}</p>}
      {res && res.modo === 'revisar' && (
        <p className="text-sm text-slate-700">Revisadas {res.revisadas} empresas: {res.conClaves} tienen credenciales sin cifrar.</p>
      )}
      {res && res.modo === 'aplicar' && (
        <div className="text-sm text-slate-700 space-y-1">
          <p className="flex items-center gap-1"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> Listo: credenciales cifradas en {res.protegidas} empresa(s).</p>
          {res.errores.length > 0 && <p className="text-amber-700">No se pudieron proteger: {res.errores.join(' · ')}</p>}
        </div>
      )}
    </div>
  );
}
