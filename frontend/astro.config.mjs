// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  site: 'https://koutoudai-yugata-naika.clinic',
  base: '/',
  build: {
    // Inline all CSS to eliminate render-blocking requests
    inlineStylesheets: 'always',
  },
});
