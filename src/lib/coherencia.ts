import { getCollection, render, type CollectionEntry } from 'astro:content';

/*
  Lo que Zod no puede ver.

  El esquema valida cada ficha por separado; esto valida el catálogo como un
  todo: que la prosa tenga las secciones que promete la anatomía y que las
  relaciones entre patrones apunten en ambos sentidos.

  Se ejecuta en build (lo llaman los índices de /patrones y /servicios) y lanza.
  Un catálogo incoherente no llega a desplegarse.
*/

/** Encabezados de nivel 2 que debe tener el cuerpo de cada tipo de ficha. */
const SECCIONES = {
  patrones: [
    'El problema',
    'La solución',
    'Cuándo usarlo',
    'Cómo implementarlo',
    'El código',
    'Te va a morder',
    'Coste',
    'Fuentes',
  ],
  servicios: [
    'Modelo mental',
    'Cómo te factura',
    'Cuándo NO usarlo',
    'Errores comunes',
    'Fuentes',
  ],
} as const;

const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

async function faltanSecciones(
  entrada: CollectionEntry<'patrones'> | CollectionEntry<'servicios'>,
  requeridas: readonly string[],
): Promise<string[]> {
  const { headings } = await render(entrada);
  const presentes = new Set(
    headings.filter((h) => h.depth === 2).map((h) => normalizar(h.text)),
  );
  return requeridas.filter((r) => !presentes.has(normalizar(r)));
}

/**
 * Verifica el catálogo entero. Lanza con todos los fallos juntos: arreglar de
 * uno en uno a golpe de rebuild es la forma más lenta de trabajar.
 */
export async function verificarCatalogo(): Promise<void> {
  const patrones = await getCollection('patrones');
  const servicios = await getCollection('servicios');
  const fallos: string[] = [];

  const listos = {
    patrones: patrones.filter((p) => p.data.estado === 'listo'),
    servicios: servicios.filter((s) => s.data.estado === 'listo'),
  };

  // 1. Secciones obligatorias en el cuerpo.
  for (const p of listos.patrones) {
    const faltan = await faltanSecciones(p, SECCIONES.patrones);
    if (faltan.length) {
      fallos.push(`patrones/${p.id}: faltan las secciones ${faltan.map((f) => `"${f}"`).join(', ')}`);
    }
  }
  for (const s of listos.servicios) {
    const faltan = await faltanSecciones(s, SECCIONES.servicios);
    if (faltan.length) {
      fallos.push(`servicios/${s.id}: faltan las secciones ${faltan.map((f) => `"${f}"`).join(', ')}`);
    }
  }

  /*
    2. Relaciones huérfanas.

    Si A dice que se combina con B, B tiene que mencionar a A. Solo se exige
    entre dos patrones "listos": un esbozo todavía no tiene frontmatter que
    pueda devolver el enlace, y bloquear por eso obligaría a escribir el
    catálogo entero de golpe.
  */
  const estaListo = new Set(listos.patrones.map((p) => p.id));
  for (const a of listos.patrones) {
    for (const rel of a.data.relacionados ?? []) {
      const idB = rel.patron.id;
      if (!estaListo.has(idB)) continue;
      const b = listos.patrones.find((p) => p.id === idB)!;
      const devuelve = (b.data.relacionados ?? []).some((r) => r.patron.id === a.id);
      if (!devuelve) {
        fallos.push(
          `patrones/${a.id} declara "${rel.tipo}" con ${idB}, pero ${idB} no lo menciona de vuelta`,
        );
      }
    }
  }

  // 3. Un patrón no puede relacionarse consigo mismo.
  for (const p of listos.patrones) {
    if ((p.data.relacionados ?? []).some((r) => r.patron.id === p.id)) {
      fallos.push(`patrones/${p.id} se relaciona consigo mismo`);
    }
  }

  if (fallos.length) {
    throw new Error(
      `El catálogo es incoherente (${fallos.length}):\n` +
        fallos.map((f) => `  · ${f}`).join('\n'),
    );
  }
}

/**
 * "Dónde aparece esto": los patrones que declaran usar este servicio.
 * Nunca se escribe a mano — se invierte la referencia que ya existe.
 */
export async function patronesQueUsan(idServicio: string) {
  const patrones = await getCollection('patrones');
  return patrones
    .filter(
      (p) =>
        p.data.estado === 'listo' &&
        (p.data.servicios ?? []).some((s) => s.id === idServicio),
    )
    .sort((a, b) => a.data.titulo.localeCompare(b.data.titulo, 'es'));
}
