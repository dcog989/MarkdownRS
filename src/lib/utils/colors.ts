import Color from "color";

export function ensureContrast(fgHex: string, bgHex: string, ratio: number = 5.0): string {
    const fg = Color(fgHex);
    const bg = Color(bgHex);

    if (fg.contrast(bg) >= ratio) {
        return fgHex;
    }

    const isDarkBg = bg.isDark();
    let adjusted = fg;
    let attempts = 0;

    while (adjusted.contrast(bg) < ratio && attempts < 20) {
        adjusted = isDarkBg ? adjusted.lighten(0.05) : adjusted.darken(0.05);
        attempts++;
    }

    if (adjusted.contrast(bg) < ratio) {
        return isDarkBg ? "#ffffff" : "#000000";
    }

    return adjusted.hex();
}

export function applyTheme() {
    const root = document.documentElement;
    const style = getComputedStyle(root);

    const bgMain = style.getPropertyValue("--bg-main").trim();
    const baseAccent = style.getPropertyValue("--color-accent-primary").trim();

    const safeAccent = ensureContrast(baseAccent || "#7c5a73", bgMain || "#1e1e1e", 5.0);
    const safeFileIcon = ensureContrast("#eac55f", bgMain || "#1e1e1e", 4.5);
    const safeLink = ensureContrast("#3794ff", bgMain || "#1e1e1e", 4.5);

    root.style.setProperty("--accent-primary", safeAccent);
    root.style.setProperty("--accent-secondary", safeAccent);
    root.style.setProperty("--accent-file", safeFileIcon);
    root.style.setProperty("--accent-link", safeLink);
}
