import { state } from "../state.js";

const BOTTOM_STICKY_PX = 48;

export function saveScrollPosition(selector = "[data-scroll-key]") {
  const el = document.querySelector(selector);
  const key = el?.dataset?.scrollKey;
  if (!el || !key) return null;
  const bottomOffset = el.scrollHeight - el.clientHeight - el.scrollTop;
  state.scrollPositions[key] = el.scrollTop;
  return {
    key,
    bottomOffset,
    wasNearBottom: bottomOffset <= BOTTOM_STICKY_PX,
  };
}

export function restoreScrollPosition(key, options = {}) {
  requestAnimationFrame(() => {
    const el = document.querySelector(`[data-scroll-key="${cssEscape(key)}"]`);
    if (!el) return;
    if (options.toBottom) {
      el.scrollTop = el.scrollHeight;
      state.scrollPositions[key] = el.scrollTop;
      return;
    }
    el.scrollTop = state.scrollPositions[key] || 0;
  });
}

function cssEscape(value) {
  if (globalThis.CSS?.escape) return CSS.escape(value);
  return String(value).replace(/["\\]/g, "\\$&");
}
