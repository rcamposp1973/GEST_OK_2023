/**
 * ESC cierra la ventana (modal) que esté abierta arriba de todo.
 * Busca la capa con fondo semitransparente más alta y presiona su botón de cerrar/cancelar.
 */
const esCapaModal = (el: HTMLElement): boolean => {
  const cls = el.className && typeof el.className === 'string' ? el.className : '';
  if (!/\bfixed\b/.test(cls) || !/\binset-0\b/.test(cls)) return false;
  // fondo con transparencia o desenfoque = modal; el cockpit a pantalla completa (sólido) no cuenta
  return /bg-[a-z]+-?\d*\/\d+|bg-black\/|backdrop-blur/.test(cls);
};

const zDe = (el: HTMLElement): number => {
  const m = /z-\[?(\d+)\]?/.exec(el.className as string);
  return m ? parseInt(m[1], 10) : 0;
};

const visible = (el: HTMLElement): boolean => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);

const textoBoton = (b: HTMLElement) => (b.textContent || '').trim().toLowerCase();

function buscarBotonCerrar(capa: HTMLElement): HTMLElement | null {
  const botones = Array.from(capa.querySelectorAll<HTMLElement>('button, [role="button"]')).filter(visible);
  const porEtiqueta = botones.find(b => {
    const t = `${b.getAttribute('aria-label') || ''} ${b.getAttribute('title') || ''}`.toLowerCase();
    return /cerrar|close/.test(t);
  });
  if (porEtiqueta) return porEtiqueta;
  const porTexto = botones.find(b => /^(cerrar|cancelar|salir|volver|entendido|no)$/.test(textoBoton(b)));
  if (porTexto) return porTexto;
  // botón con solo un ícono X (lucide)
  const porIcono = botones.find(b => !textoBoton(b) && b.querySelector('svg.lucide-x, svg.lucide-x-circle, svg.lucide-circle-x'));
  return porIcono || null;
}

export function instalarCierreConEscape(): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    const capas = Array.from(document.querySelectorAll<HTMLElement>('div.fixed')).filter(el => esCapaModal(el) && visible(el));
    if (capas.length === 0) return;
    // la más alta: mayor z-index; a igualdad, la última en el documento
    let top = capas[0];
    for (const c of capas) if (zDe(c) >= zDe(top)) top = c;
    const btn = buscarBotonCerrar(top);
    if (btn) {
      e.preventDefault();
      btn.click();
    }
  };
  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
}
