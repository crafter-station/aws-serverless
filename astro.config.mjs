// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://aws.crafter.run',
  integrations: [mdx(), sitemap()],
  markdown: {
    // Tema claro: una losa negra rompe la página cálida, y los comentarios
    // del código llevan contenido didáctico que necesita contraste.
    shikiConfig: { theme: 'github-light' },
  },
});
