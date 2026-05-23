import { state } from "../state.js";
import { countdown, escHtml, humanErr } from "../utils.js";

export async function openHistory(ctx, friendId) {
  const { api, render } = ctx;
  state.view = "history";
  state.historyFriendId = friendId;
  state.historyData = null;
  state.woodKeyboardOpen = false;
  render();
  try {
    state.historyData = await api(`/api/friends/${friendId}/woods`);
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

  document.querySelector("#back-btn").addEventListener("click", () => {
    state.view = "home";
    state.historyData = null;
    state.woodKeyboardOpen = false;
    render();
  });

  document.querySelector("#composer-input")?.addEventListener("click", () => openWoodKeyboard(ctx));
  document.querySelector("#composer-input")?.addEventListener("focus", () => openWoodKeyboard(ctx));
  document.querySelectorAll("[data-keyboard-open]").forEach((btn) => {
    btn.addEventListener("click", () => openWoodKeyboard(ctx));
  });
  document.querySelector("#wood-key")?.addEventListener("click", () => sendHistoryWood(ctx));
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
          <button class="wood-key ${cooldown ? "cooldown" : ""}" id="wood-key" type="button">
            <span>🪵</span>
            <small>${escHtml(keyHint)}</small>
          </button>
        </div>
      ` : ""}
    </div>
  `;
}

function openWoodKeyboard(ctx) {
  if (state.woodKeyboardOpen) return;
  state.woodKeyboardOpen = true;
  renderHistory(ctx);
}

async function sendHistoryWood(ctx) {
  const { api, showToast } = ctx;
  const friendId = state.historyFriendId;
  const friend = currentHistoryFriend();
  if (!friend?.wood?.canWood) {
    const wait = friend?.wood?.cooldownExpiresAt ? countdown(friend.wood.cooldownExpiresAt) : "a bit";
    showToast(`On cooldown for ${wait}`);
    return;
  }

  try {
    state.data = await api(`/api/friends/${friendId}/wood`, { method: "POST", body: { holdMs: 0 } });
    state.historyData = await api(`/api/friends/${friendId}/woods`);
    state.error = "";
    renderHistory(ctx);
    scrollHistoryToBottom();
  } catch (err) {
    showToast(humanErr(err.message));
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
