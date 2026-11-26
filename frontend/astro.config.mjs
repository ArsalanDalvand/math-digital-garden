import { cpSync, mkdirSync } from 'node:fs';
import node from '@astrojs/node';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

const site = process.env.SITE_URL || 'http://127.0.0.1:4321';
const siteUrl = new URL(site);

function dedupeMermaidKatexPlugin() {
  return {
    name: 'dedupe-mermaid-katex',
    /**
     * @param {string} source
     * @param {string | undefined} importer
     */
    resolveId(source, importer) {
      if (importer?.includes('mermaid') && /katex-[A-Z0-9]+\.mjs$/.test(source)) {
        // Redirect Mermaid's pre-bundled katex chunk to the workspace's single katex package.
        return /** @type {any} */ (this).resolve('katex', undefined, { skipSelf: true });
      }
      return null;
    },
  };
}

export default defineConfig({
  site,
  security: {
    checkOrigin: false,
    allowedDomains: [
      { hostname: '127.0.0.1', protocol: 'http' },
      { hostname: 'localhost', protocol: 'http' },
      { hostname: 'test.atomathix.ir', protocol: 'https' },
      {
        hostname: siteUrl.hostname,
        protocol: siteUrl.protocol.slice(0, -1),
        ...(siteUrl.port ? { port: siteUrl.port } : {}),
      },
    ],
  },
  devToolbar: { enabled: false },
  output: 'server',
  prefetch: true,
  vite: {
    envDir: '..',
    define: {
      'process.env.IS_PREACT': JSON.stringify('false'),
    },
    resolve: {
      dedupe: ['katex', 'react', 'react-dom'],
    },
    plugins: [tailwindcss(), dedupeMermaidKatexPlugin()],
  },
  adapter: node({ mode: 'standalone' }),
  integrations: [
    react(),
    {
      name: 'excalidraw-local-fonts',
      hooks: {
        'astro:config:setup': ({ config }) => {
          mkdirSync(new URL('excalidraw/', config.publicDir), { recursive: true });
          cpSync(
            new URL('./node_modules/@excalidraw/excalidraw/dist/prod/fonts/', import.meta.url),
            new URL('excalidraw/fonts/', config.publicDir),
            { recursive: true },
          );
        },
      },
    },
    {
      name: 'garden-client-chunks',
      hooks: {
        'astro:build:setup': ({ target, vite }) => {
          if (target !== 'client') return;
          vite.build ??= {};
          vite.build.rollupOptions ??= {};
          if (!vite.build.rollupOptions.output) vite.build.rollupOptions.output = {};
          const out = vite.build.rollupOptions.output;
          if (!Array.isArray(out)) {
            const prevManualChunks =
              typeof out.manualChunks === 'function' ? out.manualChunks : undefined;
            out.manualChunks = (id, meta) => {
              if (id.includes('/node_modules/katex/')) return 'vendor-katex';
              if (id.includes('/node_modules/mathlive/')) return 'vendor-mathlive';
              if (
                id.includes('/node_modules/@codemirror/') ||
                id.includes('/node_modules/@lezer/') ||
                id.includes('/node_modules/@atomic-editor/')
              ) {
                return 'vendor-editor';
              }
              if (id.includes('/node_modules/d3') || id.includes('/node_modules/d3-')) {
                return 'vendor-d3';
              }
              return prevManualChunks?.(id, meta);
            };
          }
        },
      },
    },
  ],
});
