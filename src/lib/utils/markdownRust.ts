import { error } from "@tauri-apps/plugin-log";
import DOMPurify from "dompurify";
import { translate } from "$lib/i18n";
import { appContext } from "$lib/stores/state.svelte";
import type { RenderResult } from "$lib/types/markdown";
import { callBackendSafe } from "./backend";
import { renderMathInHtml } from "./katexRenderer";
import { resolveImageSrc } from "./resolveImagePath";

function getActiveTabDirectory(): string {
  const tab = appContext.editor.tabs.find((t) => t.id === appContext.app.activeTabId);
  if (!tab?.path) return "";
  return tab.path.replace(/[\\/][^\\/]+$/, "");
}

export async function renderMarkdown(
  content: string,
  gfm: boolean = true,
  basePath: string | null = null,
): Promise<RenderResult> {
  const flavor = gfm ? "gfm" : "commonmark";
  const result = await callBackendSafe("render_markdown", { content, flavor }, "Markdown:Render", {
    showToast: false,
    onError: async (e) => {
      await error(`[Markdown] Render error: ${e}`);
    },
  });

  if (!result) {
    await error(`[Markdown] Render error: Rendering returned null`);
    return {
      html: `<div class="p-4 border border-danger text-danger"><strong>${translate("preview.renderFailed")}:</strong><br/>${translate("preview.renderNull")}</div>`,
      word_count: 0,
      char_count: 0,
      headings: [],
    };
  }

  let html = result.html;

  if (html.includes("<img")) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const images = doc.querySelectorAll("img");

    if (images.length > 0) {
      const directory = basePath?.replace(/[\\/][^\\/]+$/, "") || getActiveTabDirectory();

      images.forEach((img) => {
        const src = img.getAttribute("src");
        if (!src) return;
        img.setAttribute("src", resolveImageSrc(src, directory));
      });
      html = doc.body.innerHTML;
    }
  }

  const cleanHtml = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, svg: true },
    ADD_ATTR: ["target", "class", "data-sourcepos", "align", "start", "type", "disabled", "checked", "src"],
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp|asset):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  });

  return { ...result, html: renderMathInHtml(cleanHtml) };
}
