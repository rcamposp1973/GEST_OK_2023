import React, { useState, useEffect } from 'react';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { collection, query, where, getDocs, updateDoc, doc, getDoc } from 'firebase/firestore';
import { 
  Lock, Mail, Eye, EyeOff, ShieldCheck, KeyRound, 
  ArrowLeft, CheckCircle2, Activity, ArrowRight
} from 'lucide-react';
import { logAuditEvent } from '../utils/auditLogger';
import { APP_VERSION_FULL } from '../constants/version';

interface LoginProps {
  onBackToLanding?: () => void;
  initialEmail?: string;
}

export default function Login({ onBackToLanding, initialEmail = '' }: LoginProps) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Sincronizar si cambia initialEmail externamente
  useEffect(() => {
    if (initialEmail && !email) {
      setEmail(initialEmail);
    }
  }, [initialEmail]);

  // Estado para modo "Recuperar Contraseña"
  const [isResetMode, setIsResetMode] = useState(false);
  const [resetSuccess, setResetSuccess] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResetSuccess('');

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError('Por favor ingresa tu correo electrónico.');
      return;
    }

    setResetLoading(true);

    try {
      await sendPasswordResetEmail(auth, cleanEmail);

      // Registrar auditoría
      logAuditEvent({
        userId: 'system-reset-request',
        userEmail: cleanEmail,
        action: 'MODIFICAR',
        module: 'AUTENTICACION',
        details: `Solicitud de restablecimiento de clave para ${cleanEmail}`
      });

      setResetSuccess(`Se ha enviado un enlace con las instrucciones para restablecer tu contraseña a ${cleanEmail}. Por favor revisa tu bandeja de entrada o carpeta de spam.`);
    } catch (err: any) {
      console.error("Forgot password error:", err);
      const code = err?.code || '';
      if (code.includes('auth/user-not-found')) {
        setError('El correo electrónico ingresado no se encuentra registrado en la plataforma.');
      } else if (code.includes('auth/invalid-email')) {
        setError('El correo electrónico no tiene un formato válido.');
      } else {
        setError('Error al procesar la solicitud de recuperación. Inténtalo más tarde.');
      }
    } finally {
      setResetLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      setError('Por favor ingresa tu correo y contraseña.');
      return;
    }

    setLoading(true);
    try {
      // 1. Autenticar de forma estricta contra Firebase Authentication
      const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
      const user = userCredential.user;

      // 2. Verificar Custom Claims y vigencia
      const tokenResult = await user.getIdTokenResult(true);
      const userRole = tokenResult.claims.role as string | undefined;
      const userStudyId = tokenResult.claims.studyId as string | undefined;

      // Si pertenece a un estudio, verificar que el estudio no esté 'Sin Vigencia'
      if (userStudyId && userRole !== 'SUPER_USER') {
        try {
          const studyDoc = await getDoc(doc(db, 'studies', userStudyId));
          if (studyDoc.exists()) {
            const sData = studyDoc.data();
            if (sData.estado === 'Sin Vigencia') {
              await auth.signOut();
              throw new Error('El estudio contable asignado se encuentra sin vigencia.');
            }
          }
        } catch (studyCheckErr: any) {
          if (studyCheckErr.message?.includes('sin vigencia')) {
            throw studyCheckErr;
          }
        }
      }

      // 3. Registrar identificador de sesión activa
      const sessionId = crypto.randomUUID();
      sessionStorage.setItem('activeSessionId', sessionId);

      // 4. Registrar auditoría de inicio de sesión
      logAuditEvent({
        userId: user.uid,
        userEmail: cleanEmail,
        action: 'LOGIN',
        module: 'AUTENTICACION',
        details: `Inicio de sesión exitoso de ${cleanEmail}`,
        metadata: { sessionId, role: userRole || 'DEFAULT' }
      });

      if (userStudyId) {
        try {
          await updateDoc(doc(db, 'studies', userStudyId), { activeSessionId: sessionId });
        } catch (sErr) {
          console.warn("Non-fatal session update notice:", sErr);
        }
      }
    } catch (err: any) {
      console.error("Login error:", err);
      const errCode = err?.code || '';
      if (errCode.includes('auth/user-not-found') || errCode.includes('auth/wrong-password') || errCode.includes('auth/invalid-credential')) {
        setError('Credenciales incorrectas o usuario no registrado en el sistema.');
      } else if (errCode.includes('auth/invalid-email')) {
        setError('El correo electrónico no tiene un formato válido.');
      } else if (errCode.includes('auth/too-many-requests')) {
        setError('Demasiados intentos fallidos. Por favor espera unos minutos.');
      } else {
        setError(err.message || 'Error al iniciar sesión.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4 sm:p-6 selection:bg-slate-900 selection:text-white">
      <div className="w-full max-w-md bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 flex flex-col justify-between">
        
        <div>
          {/* Top Bar: Botón Volver a Landing y Versión */}
          <div className="flex items-center justify-between mb-6">
            {onBackToLanding ? (
              <button
                type="button"
                onClick={onBackToLanding}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 transition cursor-pointer group"
              >
                <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
                <span>Volver a la portada</span>
              </button>
            ) : (
              <div />
            )}

            <span className="text-[10px] font-mono font-medium tracking-wide px-2 py-0.5 rounded bg-slate-100 text-slate-600 uppercase border border-slate-200">
              {APP_VERSION_FULL}
            </span>
          </div>

          {/* Logo de Marca Minimalista */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-9 h-9 rounded-lg bg-slate-900 flex items-center justify-center text-white shadow-2xs shrink-0">
              <Activity className="w-4.5 h-4.5 stroke-[2.25]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold tracking-tight text-slate-900">Gest_OK</span>
                <span className="text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200">
                  ERP
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-normal">Software Contable, Financiero & Tributario</p>
            </div>
          </div>

          {/* Encabezado del Formulario */}
          <div className="mb-6">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              {isResetMode ? 'Recupera tu acceso' : 'Bienvenido de nuevo'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed">
              {isResetMode
                ? 'Ingresa tu correo o RUT corporativo registrado para enviar el enlace de recuperación.'
                : 'Ingresa tus credenciales para acceder a la gestión contable de tu estudio o empresa.'}
            </p>
          </div>

          {/* Feedback Messages */}
          {error && (
            <div className="mb-5 p-3.5 bg-rose-50 border border-rose-200/80 rounded-xl text-rose-800 text-xs font-medium flex items-start gap-2.5">
              <div className="w-2 h-2 rounded-full bg-rose-500 mt-1.5 shrink-0" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          {resetSuccess && (
            <div className="mb-5 p-4 bg-emerald-50 border border-emerald-200/80 rounded-xl text-emerald-800 text-xs font-medium flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5 stroke-[2]" />
              <span className="leading-relaxed">{resetSuccess}</span>
            </div>
          )}

          {isResetMode ? (
            /* MODO RECUPERAR CONTRASEÑA */
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#0D253D] mb-1.5">
                  Correo Electrónico o RUT
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#64748D] absolute left-3.5 top-3.5" />
                  <input
                    type="email"
                    placeholder="usuario@estudio.cl"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl focus:border-[#533AFD] focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all placeholder:text-slate-400 font-medium"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={resetLoading}
                className="w-full py-3 px-4 bg-[#533AFD] hover:bg-[#4326EB] active:bg-[#3519d6] text-white font-bold text-xs sm:text-sm rounded-xl shadow-md shadow-indigo-500/20 transition-all transform hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {resetLoading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <KeyRound className="w-4 h-4" />
                    <span>Enviar Enlace de Recuperación</span>
                  </>
                )}
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsResetMode(false);
                    setError('');
                    setResetSuccess('');
                  }}
                  className="text-xs font-semibold text-[#533AFD] hover:underline inline-flex items-center gap-1.5 transition cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Volver a Iniciar Sesión</span>
                </button>
              </div>
            </form>
          ) : (
            /* MODO INICIAR SESIÓN NORMAL */
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#0D253D] mb-1.5">
                  Correo Electrónico o RUT
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#64748D] absolute left-3.5 top-3.5" />
                  <input
                    type="email"
                    placeholder="usuario@estudio.cl"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl focus:border-[#533AFD] focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all placeholder:text-slate-400 font-medium"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#0D253D] mb-1.5">
                  Contraseña
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#64748D] absolute left-3.5 top-3.5" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl focus:border-[#533AFD] focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all placeholder:text-slate-400 font-mono"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-3 text-[#64748D] hover:text-[#0D253D] transition-colors cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Recordarme */}
              <div className="flex items-center justify-between pt-0.5">
                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
                  />
                  <span className="text-xs text-slate-600 font-medium">Recordar este dispositivo</span>
                </label>
              </div>

              {/* Botón CTA Primario Sobrio Linear/Mercury */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white font-medium text-xs sm:text-sm rounded-lg shadow-2xs transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Iniciar Sesión en Gest_OK</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              {/* Olvidaste tu clave por debajo del botón Iniciar Sesión */}
              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsResetMode(true);
                    setError('');
                    setResetSuccess('');
                  }}
                  className="text-xs font-medium text-slate-500 hover:text-slate-900 hover:underline transition cursor-pointer"
                >
                  ¿Olvidaste tu clave?
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer del Formulario */}
        <div className="mt-8 pt-5 border-t border-slate-100 flex items-center justify-between gap-3 text-[11px] text-[#64748D]">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[#059669]" />
            <span>Conexión Encriptada SSL 256-bit</span>
          </div>
          <span>PulsoContable SpA &bull; Chile</span>
        </div>

      </div>
    </div>
  );
}


