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
    // 'auto' inlines small CSS but externalizes large ones (like fontsource ~495KB)
    // This reduces HTML size from ~617KB to ~120KB, improving FCP/LCP
    inlineStylesheets: 'auto',
  },
  image: {
    // Limit generated image widths to what's actually used
    deviceSizes: [640, 750, 828, 1080, 1200],
  },
});
