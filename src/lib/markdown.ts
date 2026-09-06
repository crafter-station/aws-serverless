import { getEntries, type CollectionEntry } from 'astro:content';

/*
  La versión en texto de cada ficha.

  Existe por dos motivos distintos que resultaron ser el mismo: que alguien
  pueda copiar la página entera para pegársela a un modelo, y que haya una URL
  `.md` estable que no dependa de saber raspar HTML.

  La fuente es el MDX tal cual, no el HTML renderizado. Convertir a partir del
  HTML obliga a deshacer lo que acaba de hacerse; aquí solo hay que quitar las
  tres cosas que el MDX añade y que markdown no entiende.

  Todo se compone como una lista de BLOQUES que se unen con una línea en
  blanco. Es la única forma de no equivocarse: en markdown, un salto de línea
  de menos convierte una lista en la continuación de la cita anterior.
*/

const TITULOS_CAJA: Record<string, string> = {
  trampa: 'Te va a morder',
  no: 'Cuándo NO usarlo',
  clave: 'La idea',
  dato: 'Dato verificado',
};

const SITIO = 'https://aws.crafter.run';

type Bloque = string | false | undefined | null;

const componer = (bloques: Bloque[]) =>
  bloques.filter((b): b is string => Boolean(b && b.trim())).join('\n\n') + '\n';

/** El frontmatter pliega los textos largos en varias líneas; una cita los quiere en una. */
const enUnaLinea = (s: string) => s.replace(/\s*\n\s*/g, ' ').trim();

/** Lee un atributo JSX con valor entre comillas dobles. */
const atributo = (attrs: string, nombre: string) =>
  new RegExp(`${nombre}="([^"]*)"`).exec(attrs)?.[1];

function cuerpoAMarkdown(mdx: string): string {
  let t = mdx;

  // 1. Los imports son fontanería del MDX, no contenido.
  t = t.replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?[ \t]*$/gm, '');

  // 2. <Caja> pasa a cita, conservando el encabezado que le da sentido.
  t = t.replace(/<Caja\s+([^>]*)>\n([\s\S]*?)\n<\/Caja>/g, (_, attrs: string, dentro: string) => {
    const tipo = atributo(attrs, 'tipo') ?? 'clave';
    const encabezado = atributo(attrs, 'titulo') ?? TITULOS_CAJA[tipo] ?? 'Nota';
    const cuerpo = dentro
      .trim()
      .split('\n')
      .map((l) => (l.trim() ? `> ${l}` : '>'))
      .join('\n');
    return `> **${encabezado}**\n>\n${cuerpo}`;
  });

  /*
    3. Los diagramas son SVG hechos a mano: en texto no hay forma honesta de
       reproducirlos, así que se deja constancia de que faltan en vez de dejar
       una laguna silenciosa en medio del argumento.
  */
  t = t.replace(
    /^<([A-Z][A-Za-z0-9]*)\s*\/>[ \t]*$/gm,
    '*[Diagrama — se ve en la versión web de esta página]*',
  );

  // 4. Los imports dejan huecos de tres y cuatro saltos.
  return t.replace(/\n{3,}/g, '\n\n').trim();
}

const pie = (ruta: string, verificado?: string) =>
  componer([
    '---',
    `Fuente: <${SITIO}${ruta}>`,
    verificado && `Datos verificados el ${verificado}.`,
    'Los iconos de arquitectura son © Amazon Web Services, Inc., usados sin modificación.',
  ]);

export async function patronAMarkdown(e: CollectionEntry<'patrones'>): Promise<string> {
  const d = e.data;
  const servicios = d.servicios ? await getEntries(d.servicios) : [];
  const relacionados = d.relacionados
    ? await Promise.all(
        d.relacionados.map(async (r) => ({
          ...r,
          destino: (await getEntries([r.patron]))[0],
        })),
      )
    : [];

  const ESCALONES = ['Directo', 'Intermedio', 'Delicado'];

  const meta = [
    `- **Familia:** ${d.familia}`,
    d.alias && `- **También llamado:** ${d.alias}`,
    d.dificultad && `- **Dificultad:** ${ESCALONES[d.dificultad - 1]}`,
    servicios.length > 0 && `- **Servicios:** ${servicios.map((s) => s.data.titulo).join(', ')}`,
  ]
    .filter(Boolean)
    .join('\n');

  return componer([
    `# ${d.titulo}`,
    d.intencion && `> ${enUnaLinea(d.intencion)}`,
    meta,
    cuerpoAMarkdown(e.body ?? ''),
    relacionados.length > 0 &&
      componer([
        '## Patrones relacionados',
        relacionados
          .map((r) => `- **${r.destino.data.titulo}** — *${r.tipo}*. ${enUnaLinea(r.porque)}`)
          .join('\n'),
      ]),
    pie(`/patrones/${e.id}/`, d.verificado_en),
  ]);
}

export async function servicioAMarkdown(e: CollectionEntry<'servicios'>): Promise<string> {
  const d = e.data;

  const conceptos =
    d.los_3_conceptos && d.los_3_conceptos.length > 0
      ? componer([
          '## Los 3 conceptos',
          ...d.los_3_conceptos.flatMap((c) => [`### ${c.termino}`, enUnaLinea(c.explicacion)]),
        ])
      : '';

  /*
    La tabla de límites vive en el frontmatter porque otras páginas la leen sin
    renderizar el MDX. En la versión de texto es justo lo que más se copia, así
    que se reconstruye entera y no se resume.
  */
  const limites =
    d.limites && d.limites.length > 0
      ? componer([
          '## Límites',
          [
            '| Concepto | Valor | Tipo | Nota |',
            '| --- | --- | --- | --- |',
            ...d.limites.map(
              (l) => `| ${l.concepto} | ${l.valor} | ${l.tipo} | ${enUnaLinea(l.nota ?? '')} |`,
            ),
          ].join('\n'),
        ])
      : '';

  return componer([
    `# ${d.nombre_completo ?? d.titulo}`,
    d.en_una_frase && `> ${enUnaLinea(d.en_una_frase)}`,
    conceptos,
    limites,
    cuerpoAMarkdown(e.body ?? ''),
    pie(`/servicios/${e.id}/`, d.verificado_en),
  ]);
}
