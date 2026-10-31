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
import { applyLegacySettingMappings, coerceSettingValue, initSettings, saveSettingsNow } from "./settings";

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

describe("coerceSettingValue", () => {
  it("replaces values of the wrong type with the fallback", () => {
    expect(coerceSettingValue("fast", 850)).toBe(850);
    expect(coerceSettingValue(true, 14)).toBe(14);
    expect(coerceSettingValue(42, "monospace")).toBe("monospace");
  });

  it("coerces numeric strings but rejects non-finite numbers", () => {
    expect(coerceSettingValue("42", 14)).toBe(42);
    expect(coerceSettingValue("0", 14)).toBe(0);
    expect(coerceSettingValue("", 14)).toBe(14);
    expect(coerceSettingValue(Number.NaN, 14)).toBe(14);
    expect(coerceSettingValue("Infinity", 14)).toBe(14);
  });

  it("keeps arrays and objects only when the fallback has the same shape", () => {
    expect(coerceSettingValue(["en-US"], ["en-GB"])).toEqual(["en-US"]);
    expect(coerceSettingValue({ a: 1 }, { b: 2 })).toEqual({ a: 1 });
    expect(coerceSettingValue(null, { b: 2 })).toEqual({ b: 2 });
  });
});

describe("applyLegacySettingMappings", () => {
  it("converts the old transparency keys to opacity", () => {
    const target: Record<string, unknown> = {};
    applyLegacySettingMappings({ statusBarTransparency: 30, findPanelTransparency: 85 }, target);

    expect(target.statusBarOpacity).toBe(70);
    expect(target.findPanelOpacity).toBe(15);
  });

  it("does not override the new keys and maps the old autocomplete flag", () => {
    const target: Record<string, unknown> = { statusBarOpacity: 55 };
    applyLegacySettingMappings({ statusBarOpacity: 55, statusBarTransparency: 0, enableAutocomplete: false }, target);

    expect(target.statusBarOpacity).toBe(55);
    expect(target.autocompleteDelay).toBe(-1);
  });

  it("keeps converted opacity inside 0-100", () => {
    const target: Record<string, unknown> = {};
    applyLegacySettingMappings({ statusBarTransparency: 150, findPanelTransparency: -10 }, target);

    expect(target.statusBarOpacity).toBe(0);
    expect(target.findPanelOpacity).toBe(100);
  });
});
