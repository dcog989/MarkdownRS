import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const rawHost = process.env.TAURI_DEV_HOST;
const unsafeHosts = new Set(['0.0.0.0', '::', '::0', '']);
const host = rawHost && !unsafeHosts.has(rawHost) ? rawHost : false;

if (rawHost && !host) {
  // biome-ignore lint/suspicious/noConsole: intentional build-time security warning
  console.warn(`[Security] TAURI_DEV_HOST="${rawHost}" is unsafe or empty. Dev server bound to localhost only.`);
}

export default defineConfig({
  plugins: await sveltekit(),
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  // Force dep pre-bundling before Tauri opens the webview on cold start.
  // Prevents stylesheets arriving late and layout collapsing on first `bun run dev`.
  // Keep in sync with bare-specifier imports on the initial-render module graph.
  optimizeDeps: {
    include: [
      'dompurify',
      'lucide-svelte',
      'svelte/animate',
      'svelte/transition',
      '@tauri-apps/api/core',
      '@tauri-apps/plugin-dialog',
      '@tauri-apps/plugin-opener',
      '@tauri-apps/plugin-shell',
      '@codemirror/state',
      '@codemirror/view',
    ],
  },
  build: {
    chunkSizeWarningLimit: 1000,
  },
});
