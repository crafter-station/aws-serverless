/*
  Genera el audio de cada ficha y sus tiempos por palabra.

  Se ejecuta a mano, no en cada build: el audio cuesta dinero y las fichas no
  cambian tanto. Lo que produce va versionado en `public/audio/`.

      OPENAI_API_KEY=... node scripts/generar-audio.mjs [slug ...]

  La clave se lee del entorno y no se escribe en ningún sitio: este repo es
  público.

  Cómo salen los tiempos por palabra, que es la parte que no es evidente: la
  API de voz no los devuelve. Así que se sintetiza el texto por trozos, se
  transcribe cada trozo con Whisper pidiendo marcas por palabra, y se alinea la
  transcripción contra el texto original. Alinear por trozos y no de una vez es
  deliberado: un desajuste se queda dentro de su trozo en vez de arrastrar el
  resto de la página.
*/

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, dirname } from 'node:path';
import { parseHTML } from 'linkedom';
import { extraer, raices } from '../src/lib/lectura.js';

const ejecutar = promisify(execFile);

const CLAVE = process.env.OPENAI_API_KEY;
if (!CLAVE) {
  console.error('Falta OPENAI_API_KEY en el entorno.');
  process.exit(1);
}

const VOZ = 'alloy';
const MODELO_VOZ = 'gpt-4o-mini-tts';
const TONO =
  'Narra en español neutro, con voz tranquila y didáctica, como quien explica ' +
  'algo técnico a un colega. Ritmo pausado, sin prisa y sin entonación ' +
  'publicitaria. Pronuncia los términos técnicos en inglés con naturalidad.';

/* El límite de la API son 4096 caracteres. Se deja margen. */
const MAX_TROZO = 3200;
const TMP = join(process.cwd(), '.audio-tmp');
const SALIDA = join(process.cwd(), 'public', 'audio');

/* ── Utilidades ─────────────────────────────────────────────────────────── */

const normalizar = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

async function duracion(ruta) {
  const { stdout } = await ejecutar('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', ruta,
  ]);
  return parseFloat(stdout.trim());
}

/** Reintenta lo que la red rompe sin motivo. Backoff con jitter, como manda la casa. */
async function conReintentos(etiqueta, fn, intentos = 4) {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= intentos - 1) throw new Error(`${etiqueta}: ${e.message}`);
      const espera = Math.random() * Math.min(20000, 1000 * 2 ** i);
      console.warn(`    ${etiqueta} falló (${e.message}). Reintento en ${Math.round(espera)} ms.`);
      await new Promise((r) => setTimeout(r, espera));
    }
  }
}

/* ── OpenAI ─────────────────────────────────────────────────────────────── */

async function sintetizar(texto) {
  const r = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${CLAVE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODELO_VOZ,
      voice: VOZ,
      input: texto,
      instructions: TONO,
      response_format: 'wav',
    }),
  });
  if (!r.ok) throw new Error(`voz ${r.status} ${(await r.text()).slice(0, 200)}`);
  return Buffer.from(await r.arrayBuffer());
}

async function transcribir(wav) {
  const cuerpo = new FormData();
  cuerpo.append('file', new Blob([wav], { type: 'audio/wav' }), 'trozo.wav');
  cuerpo.append('model', 'whisper-1');
  cuerpo.append('language', 'es');
  cuerpo.append('response_format', 'verbose_json');
  cuerpo.append('timestamp_granularities[]', 'word');

  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${CLAVE}` },
    body: cuerpo,
  });
  if (!r.ok) throw new Error(`whisper ${r.status} ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).words ?? [];
}

/* ── Alineación ─────────────────────────────────────────────────────────── */

/**
 * Needleman-Wunsch entre las palabras del texto y las que oyó Whisper.
 *
 * Whisper no devuelve la misma tokenización: "10 000" puede volver como
 * "10.000" y un guión largo no vuelve en absoluto. En vez de exigir que
 * coincidan, se alinean las dos secuencias y las palabras sin pareja reciben
 * un tiempo interpolado.
 *
 * @returns {number[]} instante de inicio de cada palabra, o null si no hubo
 */
function alinear(palabras, oidas) {
  const a = palabras.map(normalizar);
  const b = oidas.map((w) => normalizar(w.word));
  const n = a.length;
  const m = b.length;
  if (!n || !m) return null;

  const HUECO = -1;
  const puntos = Array.from({ length: n + 1 }, () => new Float32Array(m + 1));
  const camino = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1));

  for (let i = 1; i <= n; i++) { puntos[i][0] = i * HUECO; camino[i][0] = 1; }
  for (let j = 1; j <= m; j++) { puntos[0][j] = j * HUECO; camino[0][j] = 2; }

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const iguales = a[i - 1] && a[i - 1] === b[j - 1];
      const parecidas =
        !iguales && a[i - 1] && b[j - 1] &&
        (a[i - 1].startsWith(b[j - 1]) || b[j - 1].startsWith(a[i - 1]));
      const diag = puntos[i - 1][j - 1] + (iguales ? 2 : parecidas ? 1 : -1.5);
      const arriba = puntos[i - 1][j] + HUECO;
      const izq = puntos[i][j - 1] + HUECO;

      if (diag >= arriba && diag >= izq) { puntos[i][j] = diag; camino[i][j] = 0; }
      else if (arriba >= izq) { puntos[i][j] = arriba; camino[i][j] = 1; }
      else { puntos[i][j] = izq; camino[i][j] = 2; }
    }
  }

  const tiempos = new Array(n).fill(null);
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    const paso = camino[i][j];
    if (paso === 0) { tiempos[i - 1] = oidas[j - 1].start; i--; j--; }
    else if (paso === 1) i--;
    else j--;
  }

  // Las que se quedaron sin pareja: reparto uniforme entre las dos vecinas que sí la tienen.
  let ultimo = 0;
  for (let k = 0; k < n; k++) {
    if (tiempos[k] !== null) { ultimo = tiempos[k]; continue; }
    let siguiente = k + 1;
    while (siguiente < n && tiempos[siguiente] === null) siguiente++;
    const fin = siguiente < n ? tiempos[siguiente] : ultimo;
    const pasos = siguiente - k + 1;
    for (let p = k; p < siguiente; p++) {
      tiempos[p] = ultimo + ((fin - ultimo) * (p - k + 1)) / pasos;
    }
    k = siguiente - 1;
  }
  return tiempos;
}

/* ── Troceado ───────────────────────────────────────────────────────────── */

/** Corta la lista de palabras en trozos que la API acepta, sin partir frases. */
function trocear(habladas) {
  const trozos = [];
  let desde = 0;
  let largo = 0;

  for (let i = 0; i < habladas.length; i++) {
    largo += habladas[i].length + 1;
    const finDeFrase = /[.!?:]$/.test(habladas[i]);
    if (largo >= MAX_TROZO * 0.75 && finDeFrase) {
      trozos.push({ desde, hasta: i + 1 });
      desde = i + 1;
      largo = 0;
    } else if (largo >= MAX_TROZO) {
      // Ninguna frase acabó a tiempo: se corta igual antes de pasarse.
      trozos.push({ desde, hasta: i + 1 });
      desde = i + 1;
      largo = 0;
    }
  }
  if (desde < habladas.length) trozos.push({ desde, hasta: habladas.length });
  return trozos;
}

/* ── Una ficha ──────────────────────────────────────────────────────────── */

async function generar(coleccion, slug) {
  const rutaHtml = join('dist', coleccion, slug, 'index.html');
  const html = await readFile(rutaHtml, 'utf8');
  const { document } = parseHTML(html);
  const { palabras, habladas } = extraer(raices(document));

  /*
    Si ya hay audio y sus palabras son exactamente estas, no hay nada que
    rehacer. Sin esto, reanudar un lote interrumpido cuesta lo mismo que
    empezarlo.
  */
  const yaHecho = join(SALIDA, coleccion, );
  if (existsSync(yaHecho) && existsSync(join(SALIDA, coleccion, ))) {
    const previo = JSON.parse(await readFile(yaHecho, 'utf8'));
    if (previo.palabras.length === palabras.length && previo.palabras.every((p, i) => p === palabras[i])) {
      console.log();
      return null;
    }
  }

  if (palabras.length < 50) {
    console.log(`  ${slug}: solo ${palabras.length} palabras, se salta.`);
    return null;
  }

  const trozos = trocear(habladas);
  const caracteres = habladas.join(' ').length;
  console.log(`  ${slug}: ${palabras.length} palabras · ${caracteres} caracteres · ${trozos.length} trozos`);

  await mkdir(TMP, { recursive: true });
  const tiempos = new Array(palabras.length).fill(0);
  const ficheros = [];
  let desplazamiento = 0;

  for (const [n, trozo] of trozos.entries()) {
    const texto = habladas.slice(trozo.desde, trozo.hasta).join(' ');
    const wav = await conReintentos(`voz ${slug}#${n}`, () => sintetizar(texto));

    const ruta = join(TMP, `${slug}-${String(n).padStart(3, '0')}.wav`);
    await writeFile(ruta, wav);
    ficheros.push(ruta);

    const oidas = await conReintentos(`whisper ${slug}#${n}`, () => transcribir(wav));
    const alineados = alinear(palabras.slice(trozo.desde, trozo.hasta), oidas);

    const dur = await duracion(ruta);
    for (let k = trozo.desde; k < trozo.hasta; k++) {
      const t = alineados ? alineados[k - trozo.desde] : ((k - trozo.desde) / (trozo.hasta - trozo.desde)) * dur;
      tiempos[k] = +(desplazamiento + t).toFixed(2);
    }
    desplazamiento += dur;
    process.stdout.write(`    trozo ${n + 1}/${trozos.length} · ${desplazamiento.toFixed(0)} s\r`);
  }

  // Un solo mp3, mono y a poco bitrate: es voz, y va a un repositorio.
  const destino = join(SALIDA, coleccion, `${slug}.mp3`);
  await mkdir(dirname(destino), { recursive: true });
  const lista = join(TMP, `${slug}.txt`);
  await writeFile(lista, ficheros.map((f) => `file '${f.replace(/\\/g, '/')}'`).join('\n'));
  await ejecutar('ffmpeg', [
    '-y', '-f', 'concat', '-safe', '0', '-i', lista,
    '-c:a', 'libmp3lame', '-b:a', '32k', '-ac', '1', '-ar', '24000',
    destino,
  ]);

  await writeFile(
    join(SALIDA, coleccion, `${slug}.json`),
    JSON.stringify({ dur: +desplazamiento.toFixed(2), palabras, t: tiempos }),
  );

  for (const f of [...ficheros, lista]) await rm(f, { force: true });
  const mb = ((await readFile(destino)).length / 1e6).toFixed(2);
  console.log(`    → ${destino} · ${(desplazamiento / 60).toFixed(1)} min · ${mb} MB`);
  return { caracteres, segundos: desplazamiento };
}

/* ── Entrada ────────────────────────────────────────────────────────────── */

const pedidos = process.argv.slice(2);
const fichas = [];
for (const coleccion of ['patrones', 'servicios']) {
  const dir = join('dist', coleccion);
  const { readdirSync, statSync } = await import('node:fs');
  for (const slug of readdirSync(dir)) {
    if (!statSync(join(dir, slug)).isDirectory()) continue;
    if (!existsSync(join(dir, slug, 'index.html'))) continue;
    if (pedidos.length && !pedidos.includes(slug)) continue;
    fichas.push({ coleccion, slug });
  }
}

console.log(`${fichas.length} fichas.`);
let caracteres = 0;
let segundos = 0;
for (const { coleccion, slug } of fichas) {
  const r = await generar(coleccion, slug);
  if (r) { caracteres += r.caracteres; segundos += r.segundos; }
}
await rm(TMP, { recursive: true, force: true });
console.log(
  `\nTotal: ${caracteres} caracteres · ${(segundos / 60).toFixed(1)} minutos de audio.`,
);
