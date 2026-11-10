import { beforeEach, describe, expect, it, vi } from "vitest";

const fakeDisk = vi.hoisted(() => ({ existing: new Set<string>() }));

vi.mock("$lib/utils/backend", () => ({
  callBackend: vi.fn(async (command: string, args: { path: string }) => {
    if (command === "path_exists") return fakeDisk.existing.has(args.path);
    return undefined;
  }),
  callBackendSafe: vi.fn(async () => null),
}));

import { buildFileName, extractImagePath, imagePathFromClipboard, relativeTo, uniqueFileName } from "./imagePaste";

describe("extractImagePath", () => {
  it("decodes file:// URIs, including percent escapes and Windows drives", () => {
    expect(extractImagePath("file:///home/user/my%20shot.png")).toBe("/home/user/my shot.png");
    expect(extractImagePath("file:///C:/Users/me/shot.png")).toBe("C:/Users/me/shot.png");
    expect(extractImagePath("C:\\Users\\me\\shot.png")).toBe("C:\\Users\\me\\shot.png");
  });

  it("ignores text that is not a local image path", () => {
    expect(extractImagePath("hello world")).toBeNull();
    expect(extractImagePath("./local/shot.png")).toBeNull();
    expect(extractImagePath("https://example.com/shot.png")).toBeNull();
  });
});

describe("imagePathFromClipboard", () => {
  it("accepts a single local image path, including spaces", () => {
    expect(imagePathFromClipboard("/home/user/my shot.png")).toBe("/home/user/my shot.png");
    expect(imagePathFromClipboard("file:///home/user/my%20shot.png")).toBe("/home/user/my shot.png");
  });

  it("rejects clipboard text with extra lines", () => {
    expect(imagePathFromClipboard("/home/user/shot.png\nplain text")).toBeNull();
  });
});

describe("relativeTo", () => {
  it("returns the path below the note's directory", () => {
    expect(relativeTo("/docs/assets/shot.png", "/docs")).toBe("assets/shot.png");
  });

  it("keeps the first character when the note sits in the filesystem root", () => {
    expect(relativeTo("/assets/shot.png", "/")).toBe("assets/shot.png");
  });
});

describe("buildFileName", () => {
  it("builds a timestamped name from the note name", () => {
    expect(buildFileName("/docs/My Notes.md")).toMatch(/^my-notes-\d{8}-\d{6}\.png$/);
  });

  it("falls back to image when the note has no stem", () => {
    expect(buildFileName("/docs/.md")).toMatch(/^image-\d{8}-\d{6}\.png$/);
  });
});

describe("uniqueFileName", () => {
  beforeEach(() => {
    fakeDisk.existing.clear();
  });

  it("uses the plain name when the target is free", async () => {
    await expect(uniqueFileName("/docs", "shot.png")).resolves.toBe("/docs/assets/shot.png");
  });

  it("adds a suffix instead of reusing an existing file", async () => {
    fakeDisk.existing.add("/docs/assets/shot.png");

    await expect(uniqueFileName("/docs", "shot.png")).resolves.toBe("/docs/assets/shot-1.png");
  });

  it("keeps a single separator when the note sits in the filesystem root", async () => {
    await expect(uniqueFileName("/", "shot.png")).resolves.toBe("/assets/shot.png");
  });
});
