import { state } from "../state.js";
import { markMileHighWoodAttempt } from "../api.js";
import { countdown, escHtml, humanErr } from "../utils.js";

const LONG_HOLD_ARM_MS = 450;
const LONG_HOLD_MIN_MS = 2000;
const LONG_HOLD_MAX_MS = 10000;
const LONG_HOLD_FAIL_MS = 11000;
let longHold = null;
let selfControlFriendId = null;
let selfControlActionTaken = false;

export async function openHistory(ctx, friendId) {
  const { api, render } = ctx;
  state.view = "history";
  state.historyFriendId = friendId;
  state.historyData = null;
  state.woodKeyboardOpen = false;
  selfControlFriendId = null;
  selfControlActionTaken = false;
  render();
  try {
    state.historyData = await api(`/api/friends/${friendId}/woods`);
    api("/api/achievement-events", {
      method: "POST",
      body: { type: "history_view", friendId },
    }).catch(() => {});
    render();
    scrollHistoryToBottom();
  } catch (err) {
    state.error = humanErr(err.message);
    render();
  }
}

export function scrollHistoryToBottom() {
  requestAnimationFrame(() => {
    const el = document.querySelector(".history-messages");
    if (el) el.scrollTop = el.scrollHeight;
  });
}

export function renderHistory(ctx) {
  const { app, render } = ctx;
  const userId = state.data?.user?.id;
  const hd = state.historyData;
  const friend = currentHistoryFriend();
  const friendName = hd?.friend?.username
    || friend?.username
    || "friend";

  app.innerHTML = `
    <div class="shell history-screen">
      <header class="app-header">
        <div class="header-left">
          <button class="back-btn" id="back-btn">← Back</button>
        </div>
        <div class="app-wordmark" style="font-size:17px">${escHtml(friendName)}</div>
        <div class="header-actions"></div>
      </header>
      <div class="history-messages" id="history-messages">
        ${hd ? historyMessagesHtml(hd.woods, userId, friendName) : `
          <div class="empty-state" style="padding-top:60px">
            <div class="empty-emoji">🪵</div>
            <p>Loading history…</p>
          </div>
        `}
      </div>
      ${historyComposerHtml(friend)}
      ${state.toast ? `<div class="toast">${escHtml(state.toast)}</div>` : ""}
    </div>
  `;

  document.querySelector("#back-btn").addEventListener("click", async () => {
    await leaveHistory(ctx);
  });

  document.querySelector("#composer-input")?.addEventListener("click", () => openWoodKeyboard(ctx));
  document.querySelector("#composer-input")?.addEventListener("focus", () => openWoodKeyboard(ctx));
  document.querySelectorAll("[data-keyboard-open]").forEach((btn) => {
    btn.addEventListener("click", () => openWoodKeyboard(ctx));
  });
  bindWoodKey(ctx);
  document.querySelector("#birthday-key")?.addEventListener("click", () => sendHistoryWood(ctx, { birthday: true }));
  document.querySelector("#history-messages")?.addEventListener("click", () => {
    if (state.woodKeyboardOpen) {
      state.woodKeyboardOpen = false;
      renderHistory(ctx);
    }
  });

  if (hd) scrollHistoryToBottom();
}

function currentHistoryFriend() {
  return state.data?.friends?.find((friend) => friend.id === state.historyFriendId) || null;
}

function historyComposerHtml(friend) {
  const cooldown = friend?.wood?.cooldownExpiresAt;
  const keyHint = cooldown ? `Cooldown ${countdown(cooldown)}` : "Send Wood";
  return `
    <div class="history-composer-wrap ${state.woodKeyboardOpen ? "keyboard-open" : ""}">
      <div class="history-composer">
        <button class="composer-icon" type="button" data-keyboard-open title="Camera">📷</button>
        <button class="composer-input" id="composer-input" type="button" aria-label="Message">
          <span class="fake-cursor"></span>
          <span class="composer-placeholder">Message</span>
        </button>
        <button class="composer-icon" type="button" data-keyboard-open title="Mic">🎙</button>
      </div>
      ${state.woodKeyboardOpen ? `
        <div class="wood-keyboard">
          ${friend?.wood?.birthdayAvailable ? `
            <button class="wood-key birthday-key" id="birthday-key" type="button">
              <span>HB</span>
              <small>Birthday Wood</small>
            </button>
          ` : ""}
          <button class="wood-key ${cooldown ? "cooldown" : ""}" id="wood-key" type="button" style="--long-progress:0">
            <span class="wood-key-icon">🪵</span>
            <strong class="wood-key-title">${escHtml(keyHint)}</strong>
            <small class="wood-key-subtitle">${cooldown ? "Awaiting wood clearance" : "Tap to send"}</small>
            <div class="long-meter" aria-hidden="true"><i></i></div>
            <em class="long-stage"></em>
          </button>
        </div>
      ` : ""}
    </div>
  `;
}

function openWoodKeyboard(ctx) {
  if (state.woodKeyboardOpen) return;
  const friend = currentHistoryFriend();
  if (friend?.wood?.canWood) {
    selfControlFriendId = state.historyFriendId;
    selfControlActionTaken = false;
  }
  state.woodKeyboardOpen = true;
  renderHistory(ctx);
}

async function leaveHistory(ctx) {
  await recordHistoryKeyboardSelfControl(ctx);
  state.view = "home";
  state.historyData = null;
  state.woodKeyboardOpen = false;
  selfControlFriendId = null;
  selfControlActionTaken = false;
  ctx.render();
}

async function sendHistoryWood(ctx, options = {}) {
  const { api, showToast } = ctx;
  const friendId = state.historyFriendId;
  const friend = currentHistoryFriend();
  if (!friend?.wood?.canWood) {
    const wait = friend?.wood?.cooldownExpiresAt ? countdown(friend.wood.cooldownExpiresAt) : "a bit";
    showToast(`On cooldown for ${wait}`);
    return;
  }

  try {
    selfControlActionTaken = true;
    state.data = await api(`/api/friends/${friendId}/wood`, {
      method: "POST",
      body: options.birthday ? { birthday: true } : { holdMs: options.holdMs || 0 },
    });
    state.historyData = await api(`/api/friends/${friendId}/woods`);
    state.error = "";
    renderHistory(ctx);
    scrollHistoryToBottom();
  } catch (err) {
    markMileHighWoodAttempt(err);
    showToast(humanErr(err.message));
  }
}

function bindWoodKey(ctx) {
  const key = document.querySelector("#wood-key");
  if (!key) return;
  key.addEventListener("contextmenu", (event) => event.preventDefault());
  key.addEventListener("selectstart", (event) => event.preventDefault());
  key.addEventListener("pointerdown", (event) => startLongHold(ctx, key, event));
  key.addEventListener("pointerup", (event) => finishLongHold(ctx, key, event));
  key.addEventListener("pointercancel", () => cancelLongHold(ctx, key));
  key.addEventListener("lostpointercapture", () => {
    if (longHold?.key === key) cancelLongHold(ctx, key);
  });
}

function startLongHold(ctx, key, event) {
  const friend = currentHistoryFriend();
  if (!friend?.wood?.canWood || event.button > 0) return;
  event.preventDefault();
  key.setPointerCapture?.(event.pointerId);
  longHold = {
    key,
    pointerId: event.pointerId,
    startedAt: performance.now(),
    armed: false,
    failed: false,
    frame: null,
  };
  tickLongHold(ctx);
}

function tickLongHold(ctx) {
  if (!longHold) return;
  const elapsed = performance.now() - longHold.startedAt;
  const progress = Math.min(1, elapsed / LONG_HOLD_MAX_MS);
  longHold.armed = elapsed >= LONG_HOLD_ARM_MS;
  longHold.failed = elapsed >= LONG_HOLD_FAIL_MS;
  longHold.key.classList.toggle("charging", elapsed >= LONG_HOLD_MIN_MS && !longHold.failed);
  longHold.key.classList.toggle("failed", longHold.failed);
  longHold.key.style.setProperty("--long-progress", String(progress));
  updateLongHoldCopy(longHold.key, elapsed);
  longHold.frame = requestAnimationFrame(() => tickLongHold(ctx));
}

function updateLongHoldCopy(key, elapsed) {
  const title = key.querySelector(".wood-key-title");
  const subtitle = key.querySelector(".wood-key-subtitle");
  const stage = key.querySelector(".long-stage");
  if (!title || !subtitle || !stage) return;
  const label = longHoldLabel(elapsed);
  if (elapsed < LONG_HOLD_MIN_MS) {
    title.textContent = "Send Wood";
    subtitle.textContent = "Tap to send";
    stage.textContent = "";
  } else if (elapsed < LONG_HOLD_FAIL_MS) {
    title.textContent = label;
    subtitle.textContent = "Release to send.";
    stage.textContent = `${Math.round(Math.min(100, elapsed / LONG_HOLD_MAX_MS * 100))}% charged`;
  } else {
    title.textContent = "Too much Wood";
    subtitle.textContent = "Release to reset. Nothing sends.";
    stage.textContent = "Failed";
  }
}

function longHoldLabel(elapsed) {
  if (elapsed >= 9250) return "Max Length Loooong Wood";
  if (elapsed >= 7000) return "Looong Wood";
  if (elapsed >= 4500) return "Loong Wood";
  return "Long Wood";
}

async function finishLongHold(ctx, key, event) {
  if (!longHold || longHold.key !== key || event.pointerId !== longHold.pointerId) return;
  event.preventDefault();
  const elapsed = performance.now() - longHold.startedAt;
  clearLongHold(key);
  if (elapsed < LONG_HOLD_ARM_MS) {
    await sendHistoryWood(ctx);
    return;
  }
  if (elapsed < LONG_HOLD_MIN_MS) {
    await recordLongWoodEvent(ctx, "long_wood_cancelled");
    ctx.showToast?.("Long Wood cancelled");
    return;
  }
  if (elapsed >= LONG_HOLD_FAIL_MS) {
    await recordLongWoodEvent(ctx, "long_wood_overcooked");
    ctx.showToast?.("Held too long. The Wood reset itself.");
    return;
  }
  await sendHistoryWood(ctx, { holdMs: Math.min(Math.round(elapsed), LONG_HOLD_MAX_MS) });
}

function cancelLongHold(ctx, key) {
  if (!longHold || longHold.key !== key) return;
  const elapsed = performance.now() - longHold.startedAt;
  clearLongHold(key);
  if (elapsed >= LONG_HOLD_ARM_MS && elapsed < LONG_HOLD_MIN_MS) {
    recordLongWoodEvent(ctx, "long_wood_cancelled").catch(() => {});
  }
}

function clearLongHold(key) {
  cancelAnimationFrame(longHold?.frame);
  longHold = null;
  key.classList.remove("charging", "failed");
  key.style.setProperty("--long-progress", "0");
  const title = key.querySelector(".wood-key-title");
  const subtitle = key.querySelector(".wood-key-subtitle");
  const stage = key.querySelector(".long-stage");
  const friend = currentHistoryFriend();
  const cooldown = friend?.wood?.cooldownExpiresAt;
  if (title) title.textContent = cooldown ? `Cooldown ${countdown(cooldown)}` : "Send Wood";
  if (subtitle) subtitle.textContent = cooldown
    ? "Awaiting wood clearance"
    : "Tap to send";
  if (stage) stage.textContent = "";
}

async function recordLongWoodEvent(ctx, type) {
  selfControlActionTaken = true;
  state.data = await ctx.api("/api/achievement-events", {
    method: "POST",
    body: { type, friendId: state.historyFriendId },
  });
}

async function recordHistoryKeyboardSelfControl(ctx) {
  if (!selfControlFriendId || selfControlActionTaken) return;
  const friendId = selfControlFriendId;
  selfControlFriendId = null;
  selfControlActionTaken = true;
  try {
    state.data = await ctx.api("/api/achievement-events", {
      method: "POST",
      body: { type: "history_keyboard_self_control", friendId },
    });
  } catch {
    // Leaving history should not be blocked by achievement bookkeeping.
  }
}

function historyMessagesHtml(woods, userId, friendName) {
  if (!woods.length) {
    return `
      <div class="empty-state" style="padding-top:60px">
        <div class="empty-emoji">🪵</div>
        <p>No woods yet — tap their name to send the first one</p>
      </div>
    `;
  }

  const myInitial = (state.data?.user?.username || "?")[0].toUpperCase();
  const friendInitial = friendName[0].toUpperCase();
  let lastDay = "";
  let rows = "";

  for (let i = 0; i < woods.length; i++) {
    const w = woods[i];
    const isSent = w.senderId === userId;
    const day = new Date(w.sentAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });

    if (day !== lastDay) {
      rows += `<div class="history-day">${day}</div>`;
      lastDay = day;
    }

    const time = new Date(w.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const bubbleClass = [
      "wood-bubble",
      isSent ? "sent" : "received",
      w.type === "long" ? "long-wood" : "",
      w.type === "seasonal" ? "seasonal" : "",
    ].filter(Boolean).join(" ");

    const woodEmoji = woodEmojiForType(w.type, w.label);

    const streakMarker = w.streakCountAfter && [7, 30, 100, 365].includes(w.streakCountAfter)
      ? `<div class="history-streak">🔥 ${w.streakCountAfter} day streak!</div>`
      : "";

    const isLast = i === woods.length - 1 || woods[i + 1].senderId !== w.senderId;

    const avatarHtml = isLast
      ? `<div class="bubble-avatar ${isSent ? "sent-avatar" : ""}">${isSent ? myInitial : friendInitial}</div>`
      : `<div style="width:28px;flex-shrink:0"></div>`;

    const labelHtml = isLast && w.type !== "normal"
      ? `<div class="bubble-label ${isSent ? "sent" : ""}">${escHtml(w.label)}</div>`
      : "";

    rows += `
      ${streakMarker}
      <div class="wood-bubble-row ${isSent ? "sent" : ""}">
        ${isSent ? "" : avatarHtml}
        <div class="wood-bubble-col">
          <div class="${bubbleClass}">${woodEmoji}</div>
          ${labelHtml}
          ${isLast ? `<div class="bubble-time">${time}</div>` : ""}
        </div>
        ${isSent ? avatarHtml : ""}
      </div>
    `;
  }

  return rows;
}

function woodEmojiForType(type, label) {
  if (type === "seasonal") {
    if (label?.includes("Christmas")) return "🎄";
    if (label?.includes("Spooky") || label?.includes("Halloween")) return "🎃";
    if (label?.includes("New Year")) return "🎆";
    return "🪵";
  }
  if (type === "long") return "🪵";
  return "🪵";
}
