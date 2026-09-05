/**
 * Scroll Sync Orchestrator
 *
 * Coordinates scroll syncing between the CodeMirror editor and the rendered
 * Markdown preview. Delegates DOM measurement to LineMapBuilder,
 * interpolation to ScrollInterpolator, and animation to SmoothScroller.
 */

import type { EditorView } from "@codemirror/view";
import { CONFIG } from "$lib/utils/config";
import { throttle } from "$lib/utils/timing";
import type { AppEditorView } from "../../global";
import { LineMapTracker } from "./lineMapTracker";
import { buildLineMap, interpolate, type LineMapEntry } from "./scrollInterpolation";
import { SmoothScroller } from "./smoothScroller";

const CLEAR_SOURCE_DELAY_MS = 200;
const PERSIST_SCROLL_THROTTLE_MS = 50;

type SyncDirection = "editor-to-preview" | "preview-to-editor";

export class ScrollSyncManager {
  editor = $state<EditorView | null>(null);
  preview = $state<HTMLElement | null>(null);
  private lineMap: LineMapEntry[] = [];
  private scroller = new SmoothScroller();

  private activeSource = $state<"editor" | "preview" | null>(null);
  private clearSourceTimer: number | null = null;
  private lineMapTracker = new LineMapTracker(() => this.updateMap());

  private suppressSync = false;
  private suppressTimer: number | null = null;

  /**
   * Pause editor<->preview syncing while a tab switch settles. Each pane
   * restores its own saved position during the switch, and the preview's
   * transient line map is stale mid-transition; letting either pane drive the
   * other would clobber the restored scroll (and get recorded as a user
   * position). Ended via {@link endTabSwitch} after the preview renders.
   */
  beginTabSwitch() {
    if (this.suppressTimer) {
      clearTimeout(this.suppressTimer);
      this.suppressTimer = null;
    }
    this.suppressSync = true;
  }

  /** Resume syncing after `delayMs`, once the switch's restores have settled. */
  endTabSwitch(delayMs: number) {
    if (!this.suppressSync) return;
    if (this.suppressTimer) clearTimeout(this.suppressTimer);
    this.suppressTimer = window.setTimeout(() => {
      this.suppressSync = false;
      this.suppressTimer = null;
    }, delayMs);
  }

  private boundOnEditorScroll: () => void;
  private boundOnPreviewScroll: () => void;

  constructor() {
    this.boundOnEditorScroll = this.onEditorScroll.bind(this);
    this.boundOnPreviewScroll = this.onPreviewScroll.bind(this);
  }

  markMapDirty() {
    this.lineMapTracker.markDirty();
  }

  private persistEditorScroll: (() => void) | null = null;

  /**
   * Single editor scroll listener: fans out to (a) recording the editor's
   * position into the store (throttled) and (b) driving the preview sync.
   */
  registerEditor(
    view: EditorView,
    persistOptions?: {
      getTabId: () => string;
      isRestoring: () => boolean;
      onScrollChange: (percentage: number, scrollTop: number, topLine: number) => void;
    },
  ) {
    this.persistEditorScroll = persistOptions ? this.createScrollPersistence(view, persistOptions) : null;

    if (this.editor === view) return;

    if (this.editor) {
      this.editor.scrollDOM.removeEventListener("scroll", this.boundOnEditorScroll);
    }

    this.editor = view;
    view.scrollDOM.addEventListener("scroll", this.boundOnEditorScroll, { passive: true });
  }

  private createScrollPersistence(
    view: EditorView,
    options: {
      getTabId: () => string;
      isRestoring: () => boolean;
      onScrollChange: (percentage: number, scrollTop: number, topLine: number) => void;
    },
  ): () => void {
    return throttle(() => {
      if ((view as AppEditorView)._currentTabId !== options.getTabId() || options.isRestoring()) return;
      const dom = view.scrollDOM;
      const max = dom.scrollHeight - dom.clientHeight;
      const percentage = max > 0 ? dom.scrollTop / max : 0;
      const scrollTop = dom.scrollTop;
      const lineBlock = view.lineBlockAtHeight(scrollTop);
      const docLine = view.state.doc.lineAt(lineBlock.from);
      options.onScrollChange(percentage, scrollTop, docLine.number);
    }, PERSIST_SCROLL_THROTTLE_MS);
  }

  registerPreview(el: HTMLElement) {
    if (this.preview === el) return;

    if (this.preview) {
      this.preview.removeEventListener("scroll", this.boundOnPreviewScroll);
    }

    this.preview = el;
    el.addEventListener("scroll", this.boundOnPreviewScroll, { passive: true });
    this.lineMapTracker.setTarget(el);
  }

  updateMap() {
    if (!this.preview || !this.editor) return;
    this.lineMap = buildLineMap(this.preview, this.editor.state.doc.lines);
  }

  private syncPreviewOnFrame = this.scheduleOnFrame(() => this.sync("editor-to-preview"));
  private syncEditorOnFrame = this.scheduleOnFrame(() => this.sync("preview-to-editor"));

  private scheduleOnFrame(cb: () => void): () => void {
    let raf: number | null = null;
    return () => {
      if (raf !== null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        cb();
      });
    };
  }

  private onEditorScroll() {
    if (this.persistEditorScroll) this.persistEditorScroll();
    if (this.suppressSync) return;
    if (this.activeSource === "preview") return;
    this.setActiveSource("editor");
    this.syncPreviewOnFrame();
  }

  private onPreviewScroll() {
    if (this.suppressSync) return;
    if (this.activeSource === "editor") return;
    this.setActiveSource("preview");
    this.syncEditorOnFrame();
  }

  private setActiveSource(source: "editor" | "preview") {
    this.activeSource = source;
    if (this.clearSourceTimer) clearTimeout(this.clearSourceTimer);
    this.clearSourceTimer = window.setTimeout(() => {
      this.activeSource = null;
    }, CLEAR_SOURCE_DELAY_MS);
  }

  private sync(direction: SyncDirection) {
    if (!this.editor || !this.preview) return;

    const source = direction === "editor-to-preview" ? this.editor.scrollDOM : this.preview;
    const target = direction === "editor-to-preview" ? this.preview : this.editor.scrollDOM;

    const scrollTop = source.scrollTop;
    const scrollHeight = source.scrollHeight;
    const clientHeight = source.clientHeight;
    const maxScroll = scrollHeight - clientHeight;

    if (scrollTop <= 0) {
      if (target.scrollTop > 0) this.scroller.scrollTo(target, 0, true);
      return;
    }
    if (scrollTop >= maxScroll - 1) {
      const targetBottom = target.scrollHeight - target.clientHeight;
      if (Math.abs(target.scrollTop - targetBottom) > 2) this.scroller.scrollTo(target, targetBottom, true);
      return;
    }

    this.syncScrollPosition(source, target, direction);
  }

  private syncScrollPosition(source: HTMLElement, target: HTMLElement, direction: SyncDirection) {
    const editor = this.editor;
    if (!editor) return;
    const scrollTop = source.scrollTop;
    const scrollHeight = source.scrollHeight;
    const clientHeight = source.clientHeight;
    const maxScroll = scrollHeight - clientHeight;

    let targetY: number;

    if (this.lineMap.length < 2) {
      const pct = scrollTop / maxScroll;
      const targetMax = target.scrollHeight - target.clientHeight;
      targetY = pct * targetMax;
    } else if (direction === "editor-to-preview") {
      const lineBlock = editor.lineBlockAtHeight(scrollTop);
      const docLine = editor.state.doc.lineAt(lineBlock.from);
      const fraction = (scrollTop - lineBlock.top) / Math.max(1, lineBlock.height);
      const currentLine = docLine.number + fraction;
      targetY = interpolate(currentLine, "line", "y", this.lineMap);
    } else {
      const targetLine = interpolate(scrollTop, "y", "line", this.lineMap);
      const docLines = editor.state.doc.lines;
      const safeLine = Math.max(1, Math.min(targetLine, docLines));
      const lineInt = Math.floor(safeLine);
      const lineFrac = safeLine - lineInt;
      const lineInfo = editor.lineBlockAt(editor.state.doc.line(lineInt).from);
      targetY = lineInfo.top + lineInfo.height * lineFrac;
    }

    if (Math.abs(target.scrollTop - targetY) > CONFIG.PERFORMANCE.SCROLL_SYNC_THRESHOLD_PX) {
      this.scroller.scrollTo(target, targetY);
    }
  }
}

export const scrollSync = new ScrollSyncManager();
