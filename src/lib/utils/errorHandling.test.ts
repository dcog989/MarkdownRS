import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/i18n", () => ({
  translate: (key: string) => key,
}));

vi.mock("$lib/stores/toastStore.svelte", () => ({
  showToast: vi.fn(),
}));

vi.mock("$lib/utils/logger", () => ({
  logger: {
    app: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  },
}));

import { AppError } from "./errorHandling";

function friendly(message: string): string {
  return AppError.toUserMessage(new AppError("File:Read", message, { additionalInfo: { path: "/notes/a.md" } }));
}

describe("AppError friendly messages", () => {
  it("uses the stable backend code when the OS text is localized", () => {
    expect(friendly("NOT_FOUND: Failed to read file '/notes/a.md': Datei oder Verzeichnis nicht gefunden")).toBe(
      "error.fileNotFoundNamed",
    );
  });

  it("uses the stable permission code", () => {
    expect(friendly("PERMISSION_DENIED: Failed to read file '/notes/a.md': Zugriff verweigert")).toBe(
      "error.cannotAccess",
    );
  });

  it("does not treat an unrelated 'not found' as a missing file", () => {
    expect(friendly("Config key not found")).toBe("error.failedToRead");
  });
});
