/**
 * Calculates luminance of a hex color.
 */
function getLuminance(hex: string): number {
    const rgb = parseInt(hex.slice(1), 16);
    const r = ((rgb >> 16) & 0xff) / 255;
    const g = ((rgb >> 8) & 0xff) / 255;
    const b = (rgb & 0xff) / 255;

    const sRGB = [r, g, b].map((val) => {
        return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
    });

    return 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
}

/**
 * Calculates contrast ratio between two luminances.
 */
function getContrast(l1: number, l2: number): number {
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Adjusts lightness of a hex color (HSL conversion)
 */
function adjustLightness(hex: string, percent: number): string {
    let r = parseInt(hex.substring(1, 3), 16);
    let g = parseInt(hex.substring(3, 5), 16);
    let b = parseInt(hex.substring(5, 7), 16);

    (r /= 255), (g /= 255), (b /= 255);
    const max = Math.max(r, g, b),
        min = Math.min(r, g, b);
    let h = 0,
        s = 0,
        l = (max + min) / 2;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    // Adjust lightness
    l = Math.min(1, Math.max(0, l + percent));

    // Convert back to RGB
    let r2, g2, b2;
    if (s === 0) {
        r2 = g2 = b2 = l;
    } else {
        const hue2rgb = (p: number, q: number, t: number) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r2 = hue2rgb(p, q, h + 1 / 3);
        g2 = hue2rgb(p, q, h);
        b2 = hue2rgb(p, q, h - 1 / 3);
    }

    const toHex = (x: number) => {
        const hex = Math.round(x * 255).toString(16);
        return hex.length === 1 ? "0" + hex : hex;
    };

    return `#${toHex(r2)}${toHex(g2)}${toHex(b2)}`;
}

/**
 * Ensures a color meets WCAG AA (4.5:1) or strict (5:1) contrast against a background.
 * Returns the original color if safe, or a lightened/darkened version.
 */
export function ensureContrast(fgHex: string, bgHex: string, ratio: number = 5.0): string {
    let currentHex = fgHex;
    const bgLum = getLuminance(bgHex);
    let attempts = 0;

    // For dark mode (low bg lum), we lighten. For light mode, we darken.
    const lighten = bgLum < 0.5;

    while (attempts < 20) {
        const fgLum = getLuminance(currentHex);
        const currentRatio = getContrast(fgLum, bgLum);

        if (currentRatio >= ratio) {
            return currentHex;
        }

        // Adjust by 5%
        currentHex = adjustLightness(currentHex, lighten ? 0.05 : -0.05);
        attempts++;
    }

    return lighten ? "#ffffff" : "#000000";
}

/**
 * Applies the calculated theme to the document root
 */
export function applyTheme() {
    // We start with the brand colors desired
    const baseAccent = "#7c5a73";
    // In a real app, we might read the computed background from the DOM if it varies,
    // but for the core theme check, we check against the known dark background.
    const bgMain = "#1e1e1e";

    const safeAccent = ensureContrast(baseAccent, bgMain, 5.0);
    const safeFileIcon = ensureContrast("#eac55f", bgMain, 4.5);
    const safeLink = ensureContrast("#3794ff", bgMain, 4.5);

    // Apply overrides if the base colors failed the check
    document.documentElement.style.setProperty("--accent-primary", safeAccent);
    document.documentElement.style.setProperty("--accent-secondary", safeAccent);
    document.documentElement.style.setProperty("--accent-file", safeFileIcon);
    document.documentElement.style.setProperty("--accent-link", safeLink);
}
