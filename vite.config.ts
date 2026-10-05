import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import adapter from "@sveltejs/adapter-static";
import { sveltekit } from "@sveltejs/kit/vite";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));
const libDir = fileURLToPath(new URL("./src/lib", import.meta.url));

const rawHost = process.env.TAURI_DEV_HOST;
const unsafeHosts = new Set(["0.0.0.0", "::", "::0", ""]);
const host = rawHost && !unsafeHosts.has(rawHost) ? rawHost : false;

if (rawHost && !host) {
  console.warn(`[Security] TAURI_DEV_HOST="${rawHost}" is unsafe or empty. Dev server bound to localhost only.`);
}

export default defineConfig({
  plugins: await sveltekit({
    preprocess: vitePreprocess({ script: true }),
    onwarn: (warning, handler) => {
      if (warning.code === "state_referenced_locally" && warning.filename?.includes(".svelte-kit")) {
        return;
      }
      // False positive: Svelte's static analysis can't trace imports used only inside $effect
      if (warning.code === "unused_import" && warning.filename?.includes("FindReplacePanel.svelte")) {
        return;
      }
      handler(warning);
    },
    version: {
      name: pkg.version,
    },
    adapter: adapter({
      pages: "build",
      assets: "build",
      fallback: "404.html",
      precompress: true,
      strict: true,
    }),
  }),
  resolve: {
    alias: {
      $lib: libDir,
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  // Force dep pre-bundling before Tauri opens the webview on cold start.
  // Prevents stylesheets arriving late and layout collapsing on first `bun run dev`.
  // Keep in sync with bare-specifier imports on the initial-render module graph.
  optimizeDeps: {
    include: [
      "dompurify",
      "katex",
      "lucide-svelte",
      "svelte/animate",
      "svelte/transition",
      "@tauri-apps/api/core",
      "@tauri-apps/plugin-dialog",
      "@tauri-apps/plugin-opener",
      "@codemirror/state",
      "@codemirror/view",
    ],
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "codemirror",
              test: /[\\/]node_modules[\\/]@codemirror[\\/](state|view|language|commands|autocomplete|search|lint)[\\/]/,
            },
            { name: "svelte", test: /[\\/]node_modules[\\/]svelte[\\/]/ },
            { name: "tauri", test: /[\\/]node_modules[\\/]@tauri-apps[\\/]/ },
          ],
        },
      },
    },
  },
});
