import { beforeEach, describe, expect, it, vi } from "vitest";

const backend = vi.hoisted(() => ({
  saves: [] as Array<Record<string, unknown>>,
  inFlight: 0,
  overlap: false,
  gate: Promise.resolve(),
  failSaves: false,
}));

vi.mock("$lib/i18n", () => ({ translate: (key: string) => key }));
vi.mock("./themes", () => ({ applyThemeCss: vi.fn() }));
vi.mock("$lib/stores/appState.svelte", () => ({ appState: { osPlatform: "linux" } }));
vi.mock("$lib/stores/settingsState.svelte", () => ({
  settingsState: { activeTheme: "Auto (Light/Dark)", splitView: true, editorFontSize: 14 },
  syncThemeFromSystem: vi.fn(),
}));
vi.mock("./backend", () => ({
  callBackendSafe: vi.fn(
    async (
      command: string,
      args: { settings: Record<string, unknown> },
      _context: string,
      options?: { onError?: (err: unknown) => void },
    ) => {
      if (command !== "save_settings") return null;
      if (backend.inFlight > 0) backend.overlap = true;
      backend.inFlight++;
      backend.saves.push(args.settings);
      try {
        await backend.gate;
        if (backend.failSaves) options?.onError?.(new Error("disk full"));
        return null;
      } finally {
        backend.inFlight--;
      }
    },
  ),
}));

import { settingsState } from "$lib/stores/settingsState.svelte";
import { initSettings, saveSettingsNow } from "./settings";

describe("settings persistence", () => {
  beforeEach(async () => {
    backend.saves.length = 0;
    backend.inFlight = 0;
    backend.overlap = false;
    backend.gate = Promise.resolve();
    backend.failSaves = false;

    settingsState.splitView = true;
    settingsState.editorFontSize = 14;

    await initSettings();
  });

  it("retries a failed write instead of treating it as saved", async () => {
    backend.failSaves = true;
    settingsState.splitView = false;

    await saveSettingsNow();
    await saveSettingsNow();
    expect(backend.saves).toHaveLength(2);

    backend.failSaves = false;
    await saveSettingsNow();
    expect(backend.saves).toHaveLength(3);

    await saveSettingsNow();
    expect(backend.saves).toHaveLength(3);
  });

  it("writes the newest snapshot after the in-flight write finishes", async () => {
    let release: (() => void) | undefined;
    backend.gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    settingsState.splitView = false;
    const first = saveSettingsNow();
    await Promise.resolve();
    await Promise.resolve();
    expect(backend.saves).toHaveLength(1);

    settingsState.editorFontSize = 18;
    const second = saveSettingsNow();
    release?.();
    await Promise.all([first, second]);

    expect(backend.overlap).toBe(false);
    expect(backend.saves).toHaveLength(2);
    expect(JSON.stringify(backend.saves[1])).toContain('"editorFontSize":18');
  });
});
