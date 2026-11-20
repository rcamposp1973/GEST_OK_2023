// Quién puede usar el Agente. Se decide aquí y se vuelve a comprobar en el servidor (api/index.ts).
// FASE PILOTO: mientras AGENTE_FASE_PILOTO sea true, solo el Super Admin y los correos de AGENTE_PILOTO_EMAILS.
// Al terminar la prueba basta poner AGENTE_FASE_PILOTO = false para que rijan las asignaciones por estudio y por usuario.
export const AGENTE_FASE_PILOTO = true;
export const AGENTE_PILOTO_EMAILS = ['campos.ramon@gmail.com'];

export interface EntradaAccesoAgente {
  email?: string | null;
  role?: string | null;                 // SUPER_USER | STUDY_ADMIN | ACCOUNTANT | ANALYST | OBSERVER ...
  estudioContrataAgente?: boolean;      // el Super Admin lo asignó al estudio (modules.agente)
  usuarioHabilitado?: boolean;          // el administrador del estudio se lo asignó a este usuario
}

export function puedeUsarAgente(e: EntradaAccesoAgente): boolean {
  const esSuper = e.role === 'SUPER_USER';
  const esPiloto = AGENTE_PILOTO_EMAILS.includes((e.email || '').trim().toLowerCase());
  if (esSuper) return true;
  if (AGENTE_FASE_PILOTO) return esPiloto && e.estudioContrataAgente === true;
  if (e.estudioContrataAgente !== true) return false;
  if (e.role === 'STUDY_ADMIN') return true;               // el administrador del estudio lo usa y lo asigna
  return e.usuarioHabilitado === true;                      // contadores y analistas: solo si se lo asignaron
}

/** Puede asignar el agente a otros usuarios de su estudio. */
export function puedeAsignarAgente(role?: string | null, estudioContrataAgente?: boolean): boolean {
  return role === 'SUPER_USER' || (role === 'STUDY_ADMIN' && estudioContrataAgente === true && !AGENTE_FASE_PILOTO);
}
