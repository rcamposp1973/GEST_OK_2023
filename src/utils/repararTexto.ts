// Repara texto con tildes y Ñ "rotas" (UTF-8 leído como Windows-1252/Latin-1), por ejemplo
// "COMPAÃ‘IA" → "COMPAÑIA", "TelefÃ³nica MÃ³viles" → "Telefónica Móviles". Si el texto está bien, no lo toca.
const CP1252: Record<string, number> = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e,
  '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
};
export function repararTexto(s: string): string {
  if (!s || !/[ÃÂ][\u0080-ÿ‘-›Œ-ƒˆ˜€™]/.test(s)) return s;
  const bytes: number[] = [];
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (c < 0x100) bytes.push(c);
    else if (CP1252[ch] !== undefined) bytes.push(CP1252[ch]);
    else return s;
  }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes)); } catch { return s; }
}
