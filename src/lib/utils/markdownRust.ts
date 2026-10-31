import DOMPurify from "dompurify";
import { translate } from "$lib/i18n";
import type { RenderResult } from "$lib/types/markdown";
import { callBackendSafe } from "./backend";
import { renderMathInHtml } from "./katexRenderer";
import { logToBackend } from "./logger";
import { dirname } from "./path";
import { resolveImageSrc } from "./resolveImagePath";

export async function renderMarkdown(
  content: string,
  gfm: boolean = true,
  basePath: string | null = null,
  resolveImagePaths: boolean = true,
): Promise<RenderResult> {
  const flavor = gfm ? "gfm" : "commonmark";
  const result = await callBackendSafe("render_markdown", { content, flavor }, "Markdown:Render", {
    showToast: false,
    onError: async (e) => {
      await logToBackend("error", `[Markdown] Render error: ${e}`);
    },
  });

  if (!result) {
    await logToBackend("error", `[Markdown] Render error: Rendering returned null`);
    return {
      html: `<div class="p-4 border border-danger text-danger"><strong>${translate("preview.renderFailed")}:</strong><br/>${translate("preview.renderNull")}</div>`,
      headings: [],
    };
  }

  let html = result.html;

  if (resolveImagePaths && html.includes("<img")) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const images = doc.querySelectorAll("img");

    if (images.length > 0) {
      const directory = basePath ? dirname(basePath) : "";

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

  return { ...result, html: await renderMathInHtml(cleanHtml) };
}
