import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://kanzaler123.github.io',
  integrations: [mdx()],
  image: {
    layout: 'constrained',
  },
  vite: {
    build: {
      assetsInlineLimit: 0,
    },
  },
});
