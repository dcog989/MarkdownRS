import { describe, expect, it } from "vitest";
import { resolveImageSrc } from "./resolveImagePath";

describe("resolveImageSrc", () => {
  it("passes through remote URLs", () => {
    expect(resolveImageSrc("https://example.com/a.png", "/home/user/docs")).toBe("https://example.com/a.png");
    expect(resolveImageSrc("http://example.com/a.png", "")).toBe("http://example.com/a.png");
  });

  it("passes through data and blob URIs", () => {
    expect(resolveImageSrc("data:image/png;base64,AAAA", "/home/user")).toBe("data:image/png;base64,AAAA");
    expect(resolveImageSrc("blob:https://example.com/id", "/home/user")).toBe("blob:https://example.com/id");
  });

  it("maps static asset references to the web root", () => {
    expect(resolveImageSrc("./static/logo.png", "/home/user/docs")).toBe("/logo.png");
    expect(resolveImageSrc("../static/logo.png", "/home/user/docs")).toBe("/logo.png");
  });

  it("resolves a relative path against the base directory", () => {
    expect(resolveImageSrc("img/photo.png", "/home/user/docs")).toBe("/home/user/docs/img/photo.png");
  });

  it("resolves parent directory segments", () => {
    expect(resolveImageSrc("../assets/pic.png", "/home/user/docs/notes")).toBe("/home/user/docs/assets/pic.png");
    expect(resolveImageSrc("../../pic.png", "/home/user/docs/notes")).toBe("/home/user/pic.png");
  });

  it("keeps absolute paths as-is", () => {
    expect(resolveImageSrc("/abs/pic.png", "/home/user/docs")).toBe("/abs/pic.png");
    expect(resolveImageSrc("C:\\pics\\pic.png", "/home/user/docs")).toBe("C:/pics/pic.png");
  });

  it("leaves a relative path unchanged when there is no base directory", () => {
    expect(resolveImageSrc("img/photo.png", "")).toBe("img/photo.png");
  });

  it("returns empty strings unchanged", () => {
    expect(resolveImageSrc("", "/home/user")).toBe("");
  });
});
