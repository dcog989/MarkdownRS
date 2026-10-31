import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/i18n", () => ({ translate: (key: string) => key }));
vi.mock("./backend", () => ({ callBackend: vi.fn() }));
vi.mock("./errorHandling", () => ({ AppError: { handle: vi.fn() } }));

import { callBackend } from "./backend";
import { AppError } from "./errorHandling";
import { createDirOnDisk, createFileOnDisk } from "./fileIO";

describe("file creation helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports success when a void command resolves with null", async () => {
    // Tauri resolves `Result<(), String>` to JS null, not undefined.
    vi.mocked(callBackend).mockResolvedValue(null as never);

    await expect(createFileOnDisk("/tmp/a.md")).resolves.toBe(true);
    await expect(createDirOnDisk("/tmp/dir")).resolves.toBe(true);
  });

  it("reports failure and handles the error when the command rejects", async () => {
    const error = new Error("denied");
    vi.mocked(callBackend).mockRejectedValue(error);

    await expect(createFileOnDisk("/tmp/a.md")).resolves.toBe(false);
    await expect(createDirOnDisk("/tmp/dir")).resolves.toBe(false);
    expect(AppError.handle).toHaveBeenCalledWith("File:Write", error, expect.anything());
  });
});
