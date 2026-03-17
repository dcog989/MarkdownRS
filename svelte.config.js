import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
    preprocess: vitePreprocess(),
    onwarn: (warning, handler) => {
        if (
            warning.code === 'state_referenced_locally' &&
            warning.filename?.includes('.svelte-kit')
        ) {
            return;
        }
        // False positive: Svelte's static analysis can't trace imports used only inside $effect
        if (
            warning.code === 'unused_import' &&
            warning.filename?.includes('FindReplacePanel.svelte')
        ) {
            return;
        }
        handler(warning);
    },
    kit: {
        adapter: adapter({
            pages: 'build',
            assets: 'build',
            fallback: '404.html',
            precompress: false,
            strict: true,
        }),
        alias: {
            $lib: './src/lib',
        },
    },
};

export default config;
