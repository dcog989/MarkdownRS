import { fileURLToPath } from "node:url";
import { sveltekit } from "@sveltejs/kit/vite";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

const libDir = fileURLToPath(new URL("./src/lib", import.meta.url));

export default defineConfig({
  plugins: await sveltekit({
    preprocess: vitePreprocess({ script: true }),
  }),
  resolve: {
    alias: {
      $lib: libDir,
    },
    conditions: ["browser"],
  },
  test: {
    include: ["src/**/*.{test,spec}.{js,ts}"],
    environment: "jsdom",
    setupFiles: ["src/test/setup.ts"],
    benchmark: {
      include: ["src/**/*.bench.ts"],
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,svelte}"],
      exclude: ["src/**/*.{test,spec,bench}.ts", "src/routes/**", "src/test/**", "src/app.d.ts"],
    },
  },
});
