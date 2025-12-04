import Color from "color";

/**
 * Ensures a color meets WCAG AA (4.5:1) or strict (5:1) contrast against a background.
 * Returns the original color if safe, or a lightened/darkened version.
 */
export function ensureContrast(fgHex: string, bgHex: string, ratio: number = 5.0): string {
    const fg = Color(fgHex);
    const bg = Color(bgHex);

    // Check if contrast is already sufficient
    if (fg.contrast(bg) >= ratio) {
        return fgHex;
    }

    const isDarkBg = bg.isDark();
    let adjusted = fg;
    let attempts = 0;

    // Iteratively lighten or darken until contrast is met
    // Color v5 is immutable, so these methods return new instances
    while (adjusted.contrast(bg) < ratio && attempts < 20) {
        adjusted = isDarkBg ? adjusted.lighten(0.05) : adjusted.darken(0.05);
        attempts++;
    }

    // If we still fail, fall back to black or white
    if (adjusted.contrast(bg) < ratio) {
        return isDarkBg ? "#ffffff" : "#000000";
    }

    return adjusted.hex();
}

/**
 * Applies the calculated theme to the document root
 */
export function applyTheme() {
    // We start with the brand colors desired
    const baseAccent = "#7c5a73";
    const bgMain = "#1e1e1e"; // In a real app, read this from computed styles if dynamic

    const safeAccent = ensureContrast(baseAccent, bgMain, 5.0);
    const safeFileIcon = ensureContrast("#eac55f", bgMain, 4.5);
    const safeLink = ensureContrast("#3794ff", bgMain, 4.5);

    // Apply overrides
    const root = document.documentElement;
    root.style.setProperty("--accent-primary", safeAccent);
    root.style.setProperty("--accent-secondary", safeAccent);
    root.style.setProperty("--accent-file", safeFileIcon);
    root.style.setProperty("--accent-link", safeLink);
}
