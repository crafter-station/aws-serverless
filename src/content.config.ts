import { defineCollection, reference, z } from 'astro:content';
import { glob } from 'astro/loaders';

/*
  El esquema se extrajo de la ficha de fan-out y de la de SNS una vez escritas,
  no al revés. Cada campo de aquí existe porque una ficha real lo necesitó.

  Reparto entre frontmatter y cuerpo (decisión Q14):
    - frontmatter → lo corto y estructurado, que Zod puede validar y que otras
      páginas necesitan leer sin renderizar el MDX (tablas, referencias, metadatos).
    - cuerpo MDX  → la prosa larga, cuyos encabezados obligatorios verifica
      `src/lib/coherencia.ts`.

  Nada que se pueda derivar se escribe a mano. En particular, "dónde aparece
  esto" en una ficha de servicio NO se escribe: se calcula invirtiendo los
  `servicios` que declaran los patrones.
*/

export const FAMILIAS = [
  'Comunicación',
  'Fiabilidad',
  'Datos',
  'Escala',
  'Frontera',
  'Operación',
] as const;

/*
  Un enlace entre patrones sin la relación nombrada es una lista de "ver también",
  que es exactamente lo que hace inútiles a la mayoría de wikis técnicas. El tipo
  de relación es obligatorio y el porqué también.
*/
export const RELACIONES = [
  'requiere',
  'se combina con',
  'compite con',
  'se construye encima de',
] as const;

/** ISO corto. Sin comillas, YAML lo convertiría en Date y se renderiza como timestamp. */
const fecha = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa "AAAA-MM-DD" entre comillas.');

/*
  Una ficha nace como esbozo: título, familia y una frase. Eso basta para que
  aparezca en el catálogo y para que otras fichas puedan enlazarla sin romper el
  build. Los campos pesados solo se exigen cuando `estado: listo`.
*/
const estado = z.enum(['esbozo', 'listo']);

const patrones = defineCollection({
  loader: glob({ base: './src/content/patrones', pattern: '**/*.mdx' }),
  schema: z
    .object({
      titulo: z.string(),
      familia: z.enum(FAMILIAS),
      estado,

      /** Se googlea en inglés, así que se muestra en inglés. */
      alias: z.string().optional(),
      dificultad: z.number().int().min(1).max(3).optional(),
      intencion: z.string().max(320).optional(),
      verificado_en: fecha.optional(),

      /** Slugs de la colección `servicios`. Valida que existan. */
      servicios: z.array(reference('servicios')).optional(),

      relacionados: z
        .array(
          z.object({
            patron: reference('patrones'),
            tipo: z.enum(RELACIONES),
            porque: z.string(),
          }),
        )
        .optional(),

      /** Opcional y perezoso: nunca bloquea publicar (decisión Q10). */
      lab: z
        .object({
          repo: z.string().url(),
          coste_en_reposo: z.string(),
          seguro_en_free_tier: z.boolean(),
        })
        .optional(),
    })
    .superRefine((d, ctx) => {
      if (d.estado !== 'listo') return;
      const obligatorios = [
        'alias',
        'dificultad',
        'intencion',
        'verificado_en',
        'servicios',
        'relacionados',
      ] as const;
      for (const campo of obligatorios) {
        if (d[campo] === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [campo],
            message: `Un patrón "listo" necesita "${campo}".`,
          });
        }
      }
      if (d.relacionados?.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['relacionados'],
          message: 'Un patrón aislado no enseña nada: declara al menos una relación.',
        });
      }
    }),
});

const servicios = defineCollection({
  loader: glob({ base: './src/content/servicios', pattern: '**/*.mdx' }),
  schema: z
    .object({
      titulo: z.string(),
      /** Slug del icono oficial de AWS en @aws-icons/svg. */
      icono: z.string(),
      estado,

      nombre_completo: z.string().optional(),
      en_una_frase: z.string().max(320).optional(),
      verificado_en: fecha.optional(),

      /** Si no entiendes estos tres, nada de lo demás encaja. Exactamente tres. */
      los_3_conceptos: z
        .array(z.object({ termino: z.string(), explicacion: z.string() }))
        .length(3)
        .optional(),

      /*
        La joya de la ficha de servicio: AWS reparte esta información por veinte
        páginas y decide arquitecturas enteras. `tipo` distingue lo que se puede
        subir con un ticket de lo que es un muro.
      */
      limites: z
        .array(
          z.object({
            concepto: z.string(),
            /* Un límite suele ser "300 msg/s", pero a veces es 10 pelado, y YAML
               lo entrega como número. Aceptar ambos evita un fallo de build por
               unas comillas que nadie recuerda poner. */
            valor: z.union([z.string(), z.number()]).transform(String),
            tipo: z.enum(['hard', 'soft']),
            nota: z.string().optional(),
          }),
        )
        .min(1)
        .optional(),
    })
    .superRefine((d, ctx) => {
      if (d.estado !== 'listo') return;
      for (const campo of [
        'nombre_completo',
        'en_una_frase',
        'verificado_en',
        'los_3_conceptos',
        'limites',
      ] as const) {
        if (d[campo] === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [campo],
            message: `Un servicio "listo" necesita "${campo}".`,
          });
        }
      }
    }),
});

export const collections = { patrones, servicios };
