import {cpSync,mkdirSync} from 'node:fs';
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import starlight from '@astrojs/starlight';
import siteGraph from 'starlight-site-graph/integration';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

const site = process.env.SITE_URL || "http://127.0.0.1:4321";
const siteUrl = new URL(site);
const brandName = process.env.PUBLIC_BRAND_NAME || process.env.SITE_TITLE || 'باغ ریاضی';
const siteLang = process.env.PUBLIC_SITE_LANG || 'fa';
const siteLangLabel = process.env.PUBLIC_SITE_LANG_LABEL || (siteLang === 'fa' ? 'فارسی' : siteLang);
const siteDir = process.env.PUBLIC_SITE_DIR || (['fa', 'ar', 'he', 'ur'].includes(siteLang) ? 'rtl' : 'ltr');

export default defineConfig({
  site,
  security: {
    checkOrigin: false,
    allowedDomains: [
      {hostname:"127.0.0.1",protocol:"http"},
      {hostname:"localhost",protocol:"http"},
      {hostname:"test.atomathix.ir",protocol:"https"},
      {hostname:siteUrl.hostname,protocol:siteUrl.protocol.slice(0,-1),...(siteUrl.port ? {port:siteUrl.port} : {})},
    ]
  },
  devToolbar: {enabled:false},
  output: 'server',
  prefetch: true,
  vite: { envDir: '..', plugins:[tailwindcss()] },
  adapter: node({ mode: 'standalone' }),
  integrations: [react(),{name:'excalidraw-local-fonts',hooks:{'astro:config:setup':({config})=>{
    mkdirSync(new URL('excalidraw/',config.publicDir),{recursive:true});
    cpSync(new URL('./node_modules/@excalidraw/excalidraw/dist/prod/fonts/',import.meta.url),new URL('excalidraw/fonts/',config.publicDir),{recursive:true});
  }}},starlight({
    title: brandName,
    defaultLocale: 'root',
    locales: { root: { lang: siteLang, label: siteLangLabel, dir: siteDir } },
    pagefind: false,
    components: {
      Search: './src/components/Search.astro',
      Head: './src/components/Head.astro',
      MobileMenuToggle: './src/components/MobileMenuToggle.astro',
    },
    customCss: ['./src/styles/custom.css'],
  }), siteGraph({ sitemapConfig: { sitemap: {} }, trackVisitedPages: 'disable' }), {
    name: 'graph-browser-compatibility',
    hooks: {
      'astro:config:setup': ({ command, updateConfig }) => {
        if (command === 'dev') updateConfig({ vite: { plugins: [nodePolyfills({
          include: ['path','util','process'], protocolImports: false,
          globals: { process: 'dev', Buffer: false, global: false },
        })] } });
      },
      // Polyfills belong to the browser bundle; SSR must retain real Node APIs.
      'astro:build:setup': ({ target, vite }) => {
        if (target === 'client') (vite.plugins ??= []).push(nodePolyfills({
          include: ['path','util','process'], globals: { process: true, Buffer: false, global: false },
        }));
      },
    },
  }],
});
