import { readFileSync } from "node:fs";
import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess({ script: true, style: () => [] }),
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
  kit: {
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
    alias: {
      $lib: "./src/lib",
    },
  },
};

export default config;
