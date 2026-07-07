// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://Daniel-E-N.github.io',
  base: '/Portfolio-site',
  // Keep old Squarespace URLs working
  redirects: {
    '/portfolio/smartcooktop': '/portfolio/smart-cooktop',
    '/portfolio/3d-modelling': '/portfolio/3d-modeling',
  },
});
