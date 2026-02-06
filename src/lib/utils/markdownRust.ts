import type { RenderResult } from '$lib/types/markdown';
import { convertFileSrc } from '@tauri-apps/api/core';
import { error } from '@tauri-apps/plugin-log';
import DOMPurify from 'dompurify';
import { callBackendSafe } from './backend';

/**
 * Resolves a relative path to a clean, absolute path with forward slashes.
 * Ensures no '..' segments remain, as they break Tauri's asset protocol.
 */
function resolvePath(baseDir: string, relativePath: string): string {
    const cleanBase = baseDir.replace(/\\/g, '/');
    const cleanRelative = relativePath.replace(/\\/g, '/');
    const parts = [...cleanBase.split('/'), ...cleanRelative.split('/')].filter(
        (p) => p && p !== '.',
    );

    const resolved: string[] = [];
    for (const part of parts) {
        if (part === '..') {
            resolved.pop();
        } else {
            resolved.push(part);
        }
    }

    const result = resolved.join('/');
    return /^[a-zA-Z]:/.test(result) ? result : '/' + result;
}

/**
 * Detects if a path references the static assets directory
 */
function isStaticAssetPath(src: string): boolean {
    return src.includes('../static/') || src.includes('./static/');
}

/**
 * Converts static asset path to web-root path
 */
function resolveStaticAssetPath(src: string): string {
    // Extract just the filename and serve from web root
    const cleanSrc = src.replace(/\\/g, '/');
    const filename = cleanSrc.split('/').pop();
    return '/' + filename;
}

export async function renderMarkdown(
    content: string,
    gfm: boolean = true,
    basePath: string | null = null,
): Promise<RenderResult> {
    const flavor = gfm ? 'gfm' : 'commonmark';
    const result = await callBackendSafe(
        'render_markdown',
        { content, flavor },
        'Markdown:Render',
        {
            showToast: false,
            onError: async (e) => {
                await error(`[Markdown] Render error: ${e}`);
            },
        },
    );

    if (!result) {
        await error(`[Markdown] Render error: Rendering returned null`);
        return {
            html: `<div class="p-4 border border-danger text-danger"><strong>Preview Error:</strong><br/>Rendering returned null</div>`,
            line_map: {},
            word_count: 0,
            char_count: 0,
        };
    }

    let html = result.html;

    if (html.includes('<img')) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const images = doc.querySelectorAll('img');

        if (images.length > 0) {
            const directory = basePath ? basePath.replace(/[\\/][^\\/]+$/, '') : '';

            images.forEach((img) => {
                let src = img.getAttribute('src');
                if (!src || /^(https?|data|blob|asset|tauri):/i.test(src)) return;

                // Standardize slashes before resolution to prevent encoding errors
                src = src.replace(/\\/g, '/');

                // Handle static assets specially
                if (isStaticAssetPath(src)) {
                    img.setAttribute('src', resolveStaticAssetPath(src));
                    return;
                }

                const absolutePath =
                    src.startsWith('/') || /^[a-zA-Z]:/.test(src)
                        ? resolvePath('', src)
                        : directory
                          ? resolvePath(directory, src)
                          : '';

                if (absolutePath) {
                    img.setAttribute('src', convertFileSrc(absolutePath));
                }
            });
            html = doc.body.innerHTML;
        }
    }

    const cleanHtml = DOMPurify.sanitize(html, {
        USE_PROFILES: { html: true },
        ADD_ATTR: [
            'target',
            'class',
            'data-source-line',
            'align',
            'start',
            'type',
            'disabled',
            'checked',
            'src',
        ],
        ALLOWED_URI_REGEXP:
            /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp|asset):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
    });

    return { ...result, html: cleanHtml };
}
