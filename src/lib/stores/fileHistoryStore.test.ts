import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/utils/backend", () => ({
  callBackend: vi.fn(),
}));

import { callBackend } from "$lib/utils/backend";
import { fileHistoryStore, loadFileHistory } from "./fileHistoryStore.svelte";
import { settingsState } from "./settingsState.svelte";

const mockedCallBackend = vi.mocked(callBackend);

describe("loadFileHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fileHistoryStore.files = [];
    fileHistoryStore.isLoaded = false;
    settingsState.fileHistoryLimit = 2;
  });

  it("applies the file history limit to the restored rows", async () => {
    mockedCallBackend.mockResolvedValue(["/a.md", "/b.md", "/c.md"] as never);

    await loadFileHistory();

    expect(fileHistoryStore.files).toEqual(["/a.md", "/b.md"]);
  });

  it("reloads a forced call even though the history is already loaded", async () => {
    mockedCallBackend.mockResolvedValue(["/a.md"] as never);
    await loadFileHistory();

    mockedCallBackend.mockResolvedValue(["/b.md"] as never);
    await loadFileHistory(true);

    expect(fileHistoryStore.files).toEqual(["/b.md"]);
  });
});
