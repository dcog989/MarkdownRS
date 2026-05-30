import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
    plugins: await sveltekit(),
    clearScreen: false,
    server: {
        port: 1420,
        strictPort: true,
        host: host || false,
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
