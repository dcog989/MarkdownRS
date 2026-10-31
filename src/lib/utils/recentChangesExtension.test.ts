import { afterEach, describe, expect, it } from "vitest";
import { appContext } from "$lib/stores/state.svelte";
import { LineChangeTracker } from "$lib/utils/lineChangeTracker.svelte";
import { createRecentChangesHighlighter } from "./recentChangesExtension";

const settings = appContext.settings;

/** The tracking plugin plus the gutter; tracking off leaves only the gutter. */
const TRACKING_EXTENSIONS = 2;

describe("createRecentChangesHighlighter", () => {
  const count = settings.recentChangesCount;
  const timespan = settings.recentChangesTimespan;

  afterEach(() => {
    settings.recentChangesCount = count;
    settings.recentChangesTimespan = timespan;
  });

  it("keeps tracking when the timespan means unlimited", () => {
    settings.recentChangesCount = 16;
    settings.recentChangesTimespan = 0;

    expect(createRecentChangesHighlighter(new LineChangeTracker())).toHaveLength(TRACKING_EXTENSIONS);
  });

  it("drops tracking when recent changes are disabled", () => {
    settings.recentChangesCount = 0;
    settings.recentChangesTimespan = 600;

    expect(createRecentChangesHighlighter(new LineChangeTracker())).toHaveLength(TRACKING_EXTENSIONS - 1);
  });
});
