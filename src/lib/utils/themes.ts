import { translate } from "$lib/i18n";
import { callBackendSafe } from "./backend";

export const LEGACY_THEME_NAMES = ["default-dark", "default-light", "rs-dark", "rs-light"];

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
  --border-focus: ${safe} !important;
}
[data-theme="light"] {
  --accent-primary: color-mix(in oklab, ${safe} ${100 - ACCENT_LIGHT_PRIMARY_MIX * 100}%, black) !important;
  --accent-secondary: color-mix(in oklab, ${safe} ${100 - ACCENT_LIGHT_SECONDARY_MIX * 100}%, white) !important;
  --border-focus: ${safe} !important;
}
`;
}
