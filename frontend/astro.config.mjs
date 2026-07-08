// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://koutoudai-yugata-naika.clinic',
  base: '/',
  integrations: [
    sitemap({
      // TODO(2026-08): オンライン診療ページ公開時にこの除外を解除する
      filter: (page) => !page.includes('/online-medical'),
    }),
  ],
  build: {
    // Inline all CSS to eliminate render-blocking requests
    inlineStylesheets: 'always',
  },
});
