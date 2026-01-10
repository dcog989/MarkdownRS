import { callBackend } from "./backend";

export const DEFAULT_THEME_NAMES = ["default-dark", "default-light"];

export async function getThemeCss(themeName: string): Promise<string> {
    try {
        const result = await callBackend(
            "get_theme_css",
            { themeName },
            "Settings:Load",
            undefined,
            {
                report: true,
                msg: `Failed to load theme '${themeName}'`,
            }
        );
        return result ?? "";
    } catch (e) {
        return "";
    }
}
