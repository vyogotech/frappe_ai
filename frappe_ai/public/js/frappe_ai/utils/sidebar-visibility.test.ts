import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createSidebarVisibilityController } from "./sidebar-visibility";

describe("createSidebarVisibilityController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the element on open", () => {
    const el = document.createElement("div");
    el.hidden = true;
    const ctrl = createSidebarVisibilityController(el);
    ctrl.onOpen();
    expect(el.hidden).toBe(false);
  });

  it("hides the element 300ms after close (slide-out grace)", () => {
    const el = document.createElement("div");
    el.hidden = false;
    const ctrl = createSidebarVisibilityController(el);
    ctrl.onClose();
    expect(el.hidden).toBe(false); // still visible during animation
    vi.advanceTimersByTime(300);
    expect(el.hidden).toBe(true);
  });

  it("BUG-001: triple-toggle does NOT leave element hidden after final open", () => {
    // Reproduce the confused-elderly triple-click pattern:
    //   open → close → open  (3 toggles, all faster than the 300ms hide-timer)
    // Pre-fix: stale hide-timer from the close fires AFTER the second open,
    //          re-hiding the element while Vue still thinks it's visible.
    const el = document.createElement("div");
    el.hidden = true;
    const ctrl = createSidebarVisibilityController(el);

    ctrl.onOpen();   // 1: open
    ctrl.onClose();  // 2: schedule hide @ +300ms
    ctrl.onOpen();   // 3: open again — must cancel the pending hide

    // Advance well past the hide-timer's original deadline.
    vi.advanceTimersByTime(500);

    expect(el.hidden).toBe(false);
  });

  it("rapid open/close/open/close/open ends in visible (5 toggles, odd)", () => {
    const el = document.createElement("div");
    el.hidden = true;
    const ctrl = createSidebarVisibilityController(el);
    ctrl.onOpen();
    ctrl.onClose();
    ctrl.onOpen();
    ctrl.onClose();
    ctrl.onOpen();
    vi.advanceTimersByTime(500);
    expect(el.hidden).toBe(false);
  });
});
