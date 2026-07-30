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
      filter: (page) => {
        // リダイレクト専用ページとnoindexページをサイトマップから除外
        const excluded = ['/online-medical', '/about', '/checkup', '/fever', '/hay-fever', '/std', '/guide', '/thanks'];
        return !excluded.some((path) => page.includes(path));
      },
    }),
  ],
  build: {
    // Inline all CSS to eliminate render-blocking requests
    inlineStylesheets: 'always',
  },
});
