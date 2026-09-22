/** Hide the sidebar only after its slide-out plays; an open cancels a pending hide, or a quick reopen ends hidden. */
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
