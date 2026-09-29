import { useEffect, useRef } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { User as FirebaseUser } from 'firebase/auth';

const STORAGE_KEY = 'gestok_last_user_activity';
// Tiempo de inactividad global antes de cerrar sesión (30 minutos)
export const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
// Intervalo para verificar el estado de inactividad global (10 segundos)
const CHECK_INTERVAL_MS = 10 * 1000;
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
    const handleVisibilityOrFocus = () => {
      if (!document.hidden) {
        recordActivity();
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

    // Verificación periódica del tiempo de inactividad global
    const interval = setInterval(() => {
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

      // Si ha pasado más del tiempo límite de inactividad SIN actividad en NINGUNA pestaña
      if (elapsed >= INACTIVITY_TIMEOUT_MS) {
        console.info(`[Sesión Gest_OK] Inactividad global detectada (${Math.round(elapsed / 60000)} min). Cerrando sesión.`);
        if (broadcastChannelRef.current) {
          try {
            broadcastChannelRef.current.postMessage({ type: 'FORCE_LOGOUT' });
          } catch {}
        }
        signOut(auth).catch(() => {});
      }
    }, CHECK_INTERVAL_MS);

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
