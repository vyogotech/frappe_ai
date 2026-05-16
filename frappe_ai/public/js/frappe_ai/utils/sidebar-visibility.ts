/**
 * Sidebar visibility controller with race-safe hide animation timer.
 *
 * Why this exists: the sidebar uses a CSS slide-out transition (250ms). If we
 * set `el.hidden = true` immediately on close, the container collapses before
 * the slide-out can play. So onClose schedules a 300ms timeout that sets
 * hidden=true after the transition completes.
 *
 * The trap (BUG-001): if the user opens → closes → opens within 300ms, the
 * pending hide-timer from the close still fires AFTER the re-open, hiding the
 * sidebar while Vue's internal state thinks it's visible. The user clicks again
 * and sees nothing happen (because the second click toggles to "close", which
 * matches what's already displayed).
 *
 * Fix: track the pending timer and cancel it on every open.
 */
export interface SidebarVisibilityController {
  onOpen: () => void;
  onClose: () => void;
}

export function createSidebarVisibilityController(
  el: HTMLElement,
  hideDelayMs = 300,
): SidebarVisibilityController {
  let hideTimer: ReturnType<typeof setTimeout> | null = null;

  function clearHideTimer(): void {
    if (hideTimer !== null) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  return {
    onOpen() {
      clearHideTimer();
      el.hidden = false;
    },
    onClose() {
      clearHideTimer();
      hideTimer = setTimeout(() => {
        el.hidden = true;
        hideTimer = null;
      }, hideDelayMs);
    },
  };
}
