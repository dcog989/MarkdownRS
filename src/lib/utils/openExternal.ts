import { invoke } from "@tauri-apps/api/core";

/**
 * Open a URL in the user's browser.
 *
 * Goes through the backend rather than the opener plugin: on Linux only the GTK
 * launch path hands the browser an activation token, without which the desktop
 * opens it unfocused.
 */
export async function openExternalUrl(url: string): Promise<void> {
  await invoke("open_external_url", { url });
}
