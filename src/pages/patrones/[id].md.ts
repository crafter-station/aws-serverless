import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import { patronAMarkdown } from '../../lib/markdown';

/* /patrones/<slug>.md — la misma ficha en texto, para copiar o para pegar a un modelo. */

export const getStaticPaths: GetStaticPaths = async () => {
  const patrones = await getCollection('patrones', (p) => p.data.estado === 'listo');
  return patrones.map((entrada) => ({ params: { id: entrada.id }, props: { entrada } }));
};

export const GET: APIRoute = async ({ props }) =>
  new Response(await patronAMarkdown(props.entrada), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
