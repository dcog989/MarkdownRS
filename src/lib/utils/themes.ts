import { callBackend } from "./backend";
import { AppError } from "./errorHandling";

export const DEFAULT_THEME_NAMES = ["default-dark", "default-light"];

export async function getThemeCss(themeName: string): Promise<string> {
    try {
        return await callBackend("get_theme_css", { themeName }, "Settings:Load");
    } catch (e) {
        AppError.handle('Settings:Load', e, {
            showToast: false,
            severity: 'warning',
            userMessage: `Failed to load theme '${themeName}'`
        });
        return "";
    }
}
