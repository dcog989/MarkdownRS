import { translate } from "$lib/i18n";
import { callBackendSafe } from "./backend";

/** Built-in theme entry. Follows the OS light/dark mode only; its palette is
 *  the bundled app colors, not the user's OS colors. Not backed by a theme CSS
 *  file, so it must not collide with a user theme of the same name. */
export const BUILTIN_THEME_NAME = "Auto (Light/Dark)";

export const DEFAULT_THEME_NAMES = [
  "Catppuccin",
  "Dracula",
  "Fern Forest",
  "GitHub",
  "Gruvbox",
  "High Contrast",
  "Newspaper",
  "Nord",
  "One Dark Pro",
  "Pink Palace",
  "Solarized",
  "Tokyo Night",
].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

export function keyed(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "-");
}

export async function getThemeCss(themeName: string): Promise<string> {
  const result = await callBackendSafe("get_theme_css", { themeName }, "Settings:Load", {
    userMessage: translate("error.failedToLoadTheme", { values: { theme: themeName } }),
  });
  return result ?? "";
}

const THEME_STYLE_ELEMENT_ID = "user-theme-styles";

// Theme currently in the style element, so CSS delivered with the settings is
// not fetched a second time after paint.
let appliedTheme = "";

export function applyThemeCss(themeName: string, css: string): void {
  appliedTheme = themeName;
  let styleTag = document.getElementById(THEME_STYLE_ELEMENT_ID) as HTMLStyleElement | null;
  if (!styleTag) {
    styleTag = document.createElement("style");
    styleTag.id = THEME_STYLE_ELEMENT_ID;
    document.head.appendChild(styleTag);
  }
  styleTag.textContent = css;
}

export function clearThemeCss(): void {
  appliedTheme = "";
  document.getElementById(THEME_STYLE_ELEMENT_ID)?.remove();
}

export function isThemeApplied(themeName: string): boolean {
  return appliedTheme === themeName;
}

const ACCENT_DARK_SECONDARY_MIX = 0.3;
const ACCENT_LIGHT_PRIMARY_MIX = 0.25;
const ACCENT_LIGHT_SECONDARY_MIX = 0.15;

export function buildCustomAccentCss(color: string): string {
  const safe = color.trim();
  if (!safe) return "";
  return `
:root {
  --accent-primary: ${safe} !important;
  --accent-secondary: color-mix(in oklab, ${safe} ${100 - ACCENT_DARK_SECONDARY_MIX * 100}%, white) !important;
}
[data-theme="light"] {
  --accent-primary: color-mix(in oklab, ${safe} ${100 - ACCENT_LIGHT_PRIMARY_MIX * 100}%, black) !important;
  --accent-secondary: color-mix(in oklab, ${safe} ${100 - ACCENT_LIGHT_SECONDARY_MIX * 100}%, white) !important;
}
`;
}
