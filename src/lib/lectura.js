/*
  Qué se lee en voz alta y en qué orden.

  Este módulo lo usan dos sitios que tienen que coincidir palabra por palabra:
  el script que genera el audio (sobre el HTML ya construido, con linkedom) y
  el reproductor del navegador (sobre el DOM vivo). Si divergieran, el
  resaltado señalaría la palabra equivocada.

  Por eso es JavaScript plano y sin dependencias: para que lo pueda importar
  Node tal cual y lo pueda empaquetar Astro sin traducir nada por el camino.
*/

/** El corte entre bloques. Es espacio en blanco, así que no crea una palabra. */
const SALTO = String.fromCharCode(10);

/** Nada de esto se lee: leer código o una tabla en voz alta no se entiende. */
const NO_SE_LEE = new Set(['PRE', 'FIGURE', 'TABLE', 'SCRIPT', 'STYLE', 'NOSCRIPT']);

/** Elementos que cierran una frase. Sin esto, un h2 se pega al párrafo siguiente. */
const BLOQUES = new Set([
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'P', 'LI', 'BLOCKQUOTE', 'FIGCAPTION', 'ASIDE', 'DIV', 'SECTION', 'ARTICLE',
]);

/**
 * Recoge los nodos de texto legibles bajo `raiz`, en orden de documento, junto
 * al bloque al que pertenece cada uno.
 * @param {Element} raiz
 * @param {{nodo: Text, bloque: Element}[]} salida
 * @param {Element} bloque
 */
function recoger(raiz, salida, bloque) {
  for (const hijo of raiz.childNodes) {
    if (hijo.nodeType === 3) {
      if (hijo.data.trim()) salida.push({ nodo: hijo, bloque });
    } else if (hijo.nodeType === 1 && !NO_SE_LEE.has(hijo.tagName)) {
      recoger(hijo, salida, BLOQUES.has(hijo.tagName) ? hijo : bloque);
    }
  }
}

/**
 * Extrae las palabras de un conjunto de raíces.
 *
 * Concatena los nodos de texto tal cual antes de partir por espacios: si se
 * partiera nodo a nodo, "<strong>esperas</strong>." daría dos palabras y una
 * de ellas sería un punto suelto.
 *
 * @param {Element[]} raices en orden de documento
 * @returns {{
 *   palabras: string[],
 *   habladas: string[],
 *   trozos: {nodo: Text, desde: number, hasta: number, palabra: number}[]
 * }}
 */
export function extraer(raices) {
  /*
    Un solo texto continuo, y para cada nodo el tramo que ocupa dentro de él.

    Entre dos bloques se mete un salto de línea que no pertenece a ningún nodo.
    Hace falta porque el HTML que genera Astro no deja espacio entre elementos
    de bloque: sin él, "<h2>El problema</h2><p>Tu servicio..." daba la palabra
    "problemaTu". El salto es espacio en blanco, así que no crea una palabra
    nueva y los índices siguen cuadrando.
  */
  let texto = '';
  const tramos = [];
  let bloquePrevio = null;

  for (const raiz of raices) {
    /** @type {{nodo: Text, bloque: Element}[]} */
    const nodos = [];
    recoger(raiz, nodos, raiz);
    for (const { nodo, bloque } of nodos) {
      if (bloquePrevio && bloque !== bloquePrevio) texto += SALTO;
      bloquePrevio = bloque;
      const desde = texto.length;
      texto += nodo.data;
      tramos.push({ nodo, bloque, desde, hasta: texto.length });
    }
  }

  const palabras = [];
  const bloques = [];
  const trozos = [];

  const re = /\S+/g;
  let cursor = 0;
  let m;
  while ((m = re.exec(texto)) !== null) {
    const i = palabras.length;
    const desde = m.index;
    const hasta = m.index + m[0].length;
    palabras.push(m[0]);

    // Una palabra puede cruzar nodos: "<strong>esperas</strong>." son dos
    // trozos con el mismo índice de palabra.
    let bloque = null;
    while (cursor < tramos.length && tramos[cursor].hasta <= desde) cursor++;
    for (let k = cursor; k < tramos.length && tramos[k].desde < hasta; k++) {
      const t = tramos[k];
      if (t.hasta <= desde) continue;
      trozos.push({
        nodo: t.nodo,
        desde: Math.max(desde, t.desde) - t.desde,
        hasta: Math.min(hasta, t.hasta) - t.desde,
        palabra: i,
      });
      if (!bloque) bloque = t.bloque;
    }
    bloques.push(bloque);
  }

  /*
    Lo que se manda a la voz no es exactamente lo que se ve: a la última
    palabra de cada bloque se le añade un punto si no lo trae. Sin él, un
    encabezado se lee de corrido con el párrafo siguiente. El número de
    palabras no cambia, así que los índices siguen valiendo.
  */
  const habladas = palabras.slice();
  for (let i = 0; i < habladas.length; i++) {
    const ultimaDelBloque = i === habladas.length - 1 || bloques[i + 1] !== bloques[i];
    if (ultimaDelBloque && /[\p{L}\p{N})"'»]$/u.test(habladas[i])) habladas[i] += '.';
  }

  return { palabras, habladas, trozos };
}

/** Las raíces legibles de una página, en orden. */
export function raices(documento) {
  return Array.from(documento.querySelectorAll('[data-leible]'));
}
