// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://koutoudai-yugata-naika.clinic',
  base: '/',
  integrations: [sitemap()],
  build: {
    // Inline all CSS to eliminate render-blocking requests
    inlineStylesheets: 'always',
  },
});
