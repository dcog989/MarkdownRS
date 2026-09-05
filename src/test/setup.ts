import { cleanup } from "@testing-library/svelte";
import { afterEach } from "vitest";
import { initI18n } from "$lib/i18n";

initI18n("en");

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

// jsdom lacks ResizeObserver (used by Modal, CustomScrollbar, FileTree) and
// Element.scrollTo (used by Modal).
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

if (typeof HTMLElement.prototype.scrollTo !== "function") {
  HTMLElement.prototype.scrollTo = () => {};
}

afterEach(() => {
  cleanup();
});
