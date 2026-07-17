// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';

// https://astro.build/config
export default defineConfig({
  site: 'https://koutoudai-yugata-naika.clinic',
  base: '/',
  integrations: [
    mdx(),
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
