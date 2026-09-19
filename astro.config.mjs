import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://BitMonster04.github.io',
  base: '/Shockimports',
  output: 'static',
  build: {
    assets: 'assets',
  },
});

