import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import { servicioAMarkdown } from '../../lib/markdown';

/* /servicios/<slug>.md — la misma ficha en texto, para copiar o para pegar a un modelo. */

export const getStaticPaths: GetStaticPaths = async () => {
  const servicios = await getCollection('servicios', (s) => s.data.estado === 'listo');
  return servicios.map((entrada) => ({ params: { id: entrada.id }, props: { entrada } }));
};

export const GET: APIRoute = async ({ props }) =>
  new Response(await servicioAMarkdown(props.entrada), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
