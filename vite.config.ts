import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const host = process.env.TAURI_DEV_HOST;

const suppressUnusedExternalImport = {
    onwarn(warning: { code: string }, warn: (w: unknown) => void) {
        if (warning.code === 'UNUSED_EXTERNAL_IMPORT') return;
        warn(warning);
    },
};

export default defineConfig(async () => ({
    plugins: [sveltekit()],
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
    build: {
        chunkSizeWarningLimit: 1000,
        rollupOptions: suppressUnusedExternalImport,
    },
    environments: {
        ssr: {
            build: {
                rollupOptions: suppressUnusedExternalImport,
            },
        },
    },
}));
