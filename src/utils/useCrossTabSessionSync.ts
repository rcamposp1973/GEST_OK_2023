import { useEffect, useRef } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { User as FirebaseUser } from 'firebase/auth';

export const STORAGE_KEY = 'gestok_last_user_activity';
// Tiempo de inactividad: lo elige cada usuario entre 5 y 60 minutos (por defecto 30). Nunca más de 60.
export const MAX_INACTIVIDAD_MIN = 60;
export const MIN_INACTIVIDAD_MIN = 5;
export const DEFAULT_INACTIVIDAD_MIN = 30;
export const claveMinutosInactividad = (uid: string) => `gestok:inactividadMin:${uid}`;
export const leerMinutosInactividad = (uid: string) => {
  try {
    const n = Number(localStorage.getItem(claveMinutosInactividad(uid)));
    return Number.isFinite(n) && n >= MIN_INACTIVIDAD_MIN ? Math.min(n, MAX_INACTIVIDAD_MIN) : DEFAULT_INACTIVIDAD_MIN;
  } catch { return DEFAULT_INACTIVIDAD_MIN; }
};
/** Evento con los segundos que faltan para el cierre (o -1 si ya no hay aviso). */
export const EVENTO_AVISO_INACTIVIDAD = 'gestok:aviso-inactividad';
// Intervalo para verificar el estado de inactividad global
const CHECK_INTERVAL_MS = 5 * 1000;
// Throttle para actualizar el almacenamiento local (máximo una vez cada 3 segundos)
const THROTTLE_MS = 3000;

export function useCrossTabSessionSync(currentUser: FirebaseUser | null) {
  const lastWriteTimeRef = useRef<number>(0);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (!currentUser) return;

    // Inicializar timestamp al montar/iniciar sesión
    const initialNow = Date.now();
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        localStorage.setItem(STORAGE_KEY, String(initialNow));
      }
    } catch {
      // Ignorar fallos de storage
    }

    // Canal Broadcast para sincronización instantánea entre pestañas
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        broadcastChannelRef.current = new BroadcastChannel('gestok_session_sync');
        broadcastChannelRef.current.onmessage = (event) => {
          if (event?.data?.type === 'ACTIVITY') {
            // Actualización recibida de otra pestaña
            lastWriteTimeRef.current = event.data.timestamp || Date.now();
          } else if (event?.data?.type === 'FORCE_LOGOUT') {
            signOut(auth).catch(() => {});
          }
        };
      } catch (e) {
        console.warn('BroadcastChannel no disponible:', e);
      }
    }

    // Función para registrar actividad en la pestaña actual y propagar a las demás
    const recordActivity = () => {
      const now = Date.now();
      // Throttle para evitar escrituras excesivas en el storage
      if (now - lastWriteTimeRef.current < THROTTLE_MS) {
        return;
      }
      lastWriteTimeRef.current = now;

      try {
        localStorage.setItem(STORAGE_KEY, String(now));
      } catch {
        // Ignorar fallos de storage
      }

      if (broadcastChannelRef.current) {
        try {
          broadcastChannelRef.current.postMessage({ type: 'ACTIVITY', timestamp: now });
        } catch {
          // Ignorar
        }
      }
    };

    // Escuchar eventos de interacción del usuario en esta pestaña
    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click', 'wheel'];
    activityEvents.forEach((ev) => {
      window.addEventListener(ev, recordActivity, { passive: true });
    });

    // Sincronizar cuando el usuario cambia o regresa a esta pestaña
    // Al volver a la pestaña: primero se revisa si ya venció el tiempo (si no, volver contaría como actividad y nunca cerraría)
    const handleVisibilityOrFocus = () => {
      if (!document.hidden) {
        if (!revisar()) recordActivity();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    // Escuchar cambios de localStorage generados por OTRAS pestañas
    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        const val = Number(e.newValue);
        if (!isNaN(val)) {
          lastWriteTimeRef.current = val;
        }
      }
    };
    window.addEventListener('storage', handleStorageEvent);

    // Verificación del tiempo de inactividad global. Devuelve true si cerró la sesión.
    const revisar = (): boolean => {
      let lastActivity = Date.now();
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = Number(stored);
          if (!isNaN(parsed) && parsed > 0) {
            lastActivity = parsed;
          }
        }
      } catch {
        lastActivity = lastWriteTimeRef.current || Date.now();
      }

      const elapsed = Date.now() - lastActivity;

      const limiteMs = leerMinutosInactividad(currentUser.uid) * 60 * 1000;
      const restante = Math.ceil((limiteMs - elapsed) / 1000);
      window.dispatchEvent(new CustomEvent(EVENTO_AVISO_INACTIVIDAD, { detail: restante <= 60 && restante > 0 ? restante : -1 }));

      // Si ha pasado más del tiempo límite de inactividad SIN actividad en NINGUNA pestaña
      if (elapsed >= limiteMs) {
        console.info(`[Sesión Gest_OK] Inactividad global detectada (${Math.round(elapsed / 60000)} min). Cerrando sesión.`);
        if (broadcastChannelRef.current) {
          try {
            broadcastChannelRef.current.postMessage({ type: 'FORCE_LOGOUT' });
          } catch {}
        }
        signOut(auth).catch(() => {});
        return true;
      }
      return false;
    };
    const interval = setInterval(revisar, CHECK_INTERVAL_MS);

    // Registrar actividad inicial
    recordActivity();

    return () => {
      clearInterval(interval);
      activityEvents.forEach((ev) => {
        window.removeEventListener(ev, recordActivity);
      });
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      window.removeEventListener('storage', handleStorageEvent);

      if (broadcastChannelRef.current) {
        try {
          broadcastChannelRef.current.close();
        } catch {}
      }
    };
  }, [currentUser]);
}
