import { swipeOpen } from "../state.js";

const TRAY_W = 216;
const SWIPE_VELOCITY_THRESHOLD = 0.3;

export function bindFriendCard(card, { mutate }) {
  const friendId = card.dataset.friend;
  if (!friendId) return;
  const canWood = card.dataset.canWood === "true";
  const item = card.closest(".friend-item");

  let startX = 0, startY = 0, startTime = 0;
  let isSwiping = false;
  let pointerId = null;

  const isOpen = () => swipeOpen.has(friendId);

  function setTranslate(dx, animated = false) {
    card.style.transition = animated ? "transform 280ms cubic-bezier(0.32, 0.72, 0, 1)" : "none";
    card.style.transform = `translateX(${dx}px)`;
    item?.classList.toggle("tray-visible", dx < -1);
  }

  function snapOpen(animated = true) {
    swipeOpen.add(friendId);
    setTranslate(-TRAY_W, animated);
  }

  function snapClosed(animated = true) {
    swipeOpen.delete(friendId);
    setTranslate(0, animated);
  }

  if (isOpen()) setTranslate(-TRAY_W, false);

  card.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 && e.pointerType !== "touch") return;
    pointerId = e.pointerId;
    card.setPointerCapture(e.pointerId);
    startX = e.clientX;
    startY = e.clientY;
    startTime = Date.now();
    isSwiping = false;
  });

  card.addEventListener("pointermove", (e) => {
    if (e.pointerId !== pointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (!isSwiping && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      isSwiping = true;
      card.classList.add("swiping");
    }

    if (isSwiping) {
      const base = isOpen() ? -TRAY_W : 0;
      const clamped = Math.max(-TRAY_W, Math.min(0, base + dx));
      setTranslate(clamped);
    }
  });

  card.addEventListener("pointerup", async (e) => {
    if (e.pointerId !== pointerId) return;
    const totalDx = e.clientX - startX;
    const elapsed = Date.now() - startTime;
    const velocity = Math.abs(totalDx) / elapsed;

    if (isSwiping) {
      const base = isOpen() ? -TRAY_W : 0;
      const finalX = Math.max(-TRAY_W, Math.min(0, base + totalDx));
      const shouldOpen = velocity > SWIPE_VELOCITY_THRESHOLD
        ? totalDx < 0
        : finalX < -TRAY_W / 2;
      shouldOpen ? snapOpen() : snapClosed();
    } else {
      if (isOpen()) {
        snapClosed();
        return;
      }
      if (!canWood) return;
      card.classList.add("wood-sent");
      card.addEventListener("animationend", () => card.classList.remove("wood-sent"), { once: true });
      await mutate(`/api/friends/${friendId}/wood`, { holdMs: 0 });
    }
    card.classList.remove("swiping");
    isSwiping = false;
  });

  card.addEventListener("pointercancel", () => {
    card.classList.remove("swiping");
    isOpen() ? snapOpen() : snapClosed();
    isSwiping = false;
  });
}

document.addEventListener("pointerdown", (e) => {
  if (swipeOpen.size === 0) return;
  const item = e.target.closest(".friend-item");
  swipeOpen.forEach((id) => {
    if (!item || item.dataset.friendId !== id) {
      const fc = document.querySelector(`#fc-${id}`);
      if (fc) {
        fc.style.transition = "transform 280ms cubic-bezier(0.32, 0.72, 0, 1)";
        fc.style.transform = "translateX(0)";
        fc.closest(".friend-item")?.classList.remove("tray-visible");
        swipeOpen.delete(id);
      }
    }
  });
}, { passive: true });

export { TRAY_W };
