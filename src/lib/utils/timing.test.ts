import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { debounce, throttle } from "./timing";

describe("debounce", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("invokes once after the delay for rapid calls", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced("a");
    debounced("b");
    debounced("c");
    vi.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("c");
  });

  it("delivers the trailing arguments", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 50);
    debounced(1);
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledWith(1);
  });

  it("clear cancels a pending invocation", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced("x");
    debounced.clear();
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("throttle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("delivers only the latest call after the interval", () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled(1);
    throttled(2);
    throttled(3);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(3);
  });

  it("keeps at least one interval between invocations", () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled("a");
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledWith("a");

    throttled("b");
    vi.advanceTimersByTime(99);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith("b");
  });

  it("waits a full interval after a long idle gap", () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled("a");
    vi.advanceTimersByTime(1100);

    throttled("b");
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenLastCalledWith("b");
  });

  it("clear cancels the trailing invocation", () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled(1);
    throttled(2);
    throttled.clear();
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
  });
});
