// Revisión de tipos "sin retroceso": falla si aparecen errores NUEVOS respecto de scripts/tsc-baseline.txt.
// Los errores antiguos listados en el baseline se van eliminando de a poco. Uso: npm run typecheck [-- --update]
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const BASE = new URL('./tsc-baseline.txt', import.meta.url);
let out = '';
try { execSync('npx tsc --noEmit', { encoding: 'utf8', stdio: 'pipe' }); } catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
// Se compara sin números de línea para no fallar por mover código.
const norm = l => l.replace(/\(\d+,\d+\)/, '').trim();
const actuales = out.split('\n').filter(l => /error TS/.test(l)).map(norm).sort();
if (process.argv.includes('--update')) { writeFileSync(BASE, actuales.join('\n') + '\n'); console.log(`Baseline actualizado: ${actuales.length} errores`); process.exit(0); }
const base = existsSync(BASE) ? readFileSync(BASE, 'utf8').split('\n').filter(Boolean) : [];
const resto = [...base]; const nuevos = [];
for (const a of actuales) { const i = resto.indexOf(a); if (i >= 0) resto.splice(i, 1); else nuevos.push(a); }
if (nuevos.length) { console.error(`ERRORES DE TIPOS NUEVOS (${nuevos.length}):\n` + nuevos.join('\n')); process.exit(1); }
console.log(`Tipos OK (${actuales.length} errores antiguos en baseline, ${resto.length} ya resueltos).`);
