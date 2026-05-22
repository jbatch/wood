const app = document.querySelector("#app");

const state = {
  session: null,
  data: null,
  error: "",
  pushStatus: null,
  pollTimer: null,
  polling: false,
  view: "home",        // "home" | "history"
  historyFriendId: null,
  historyData: null,
  showAddSheet: false,
  addError: "",
};

// Track which cards are swiped open
const swipeOpen = new Set();

init();

async function init() {
  if ("serviceWorker" in navigator) {
    const reg = await navigator.serviceWorker.register("/sw.js");
    reg.update();
  }
  state.session = await api("/api/session");
  if (state.session.user) {
    await loadApp();
    startPolling();
  }
  render();
}

async function loadApp() {
  state.data = await api("/api/app");
  state.error = "";
  await refreshPushStatus();
}

function render() {
  if (!state.session?.user) { renderAuth(); return; }
  if (state.view === "history") { renderHistory(); return; }
  renderHome();
}

// ─── Auth ────────────────────────────────────────────────

function renderAuth() {
  const params = new URLSearchParams(location.search);
  const invite = params.get("invite") || "";

  app.innerHTML = `
    <div class="auth-screen">
      <div class="auth-logo">🪵</div>
      <div class="auth-title">Wood</div>
      <div class="auth-sub">${invite ? "You've been invited." : "Welcome back."}</div>
      <form class="auth-card" id="auth-form">
        ${invite ? `
          <div class="sheet-field">
            <div class="field-label">Invite code</div>
            <input class="field-input" name="inviteCode" value="${escHtml(invite)}" required autocomplete="off" />
          </div>
          <div class="sheet-field">
            <div class="field-label">Email</div>
            <input class="field-input" name="email" type="email" autocomplete="email" required placeholder="you@example.com" />
          </div>
        ` : ""}
        <div class="sheet-field">
          <div class="field-label">Username</div>
          <input class="field-input" name="username" autocomplete="username" required placeholder="your_username" autocapitalize="none" autocorrect="off" spellcheck="false" />
        </div>
        <div class="sheet-field">
          <div class="field-label">Password</div>
          <input class="field-input" name="password" type="password" autocomplete="${invite ? "new-password" : "current-password"}" required placeholder="••••••••" />
        </div>
        <div class="auth-error" id="auth-error">${escHtml(state.error)}</div>
        <button class="btn-primary" type="submit">${invite ? "Create account" : "Log in"}</button>
      </form>
    </div>
  `;

  document.querySelector("#auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.currentTarget).entries());
    document.querySelector("#auth-error").textContent = "";
    try {
      const resp = await api(invite ? "/api/signup" : "/api/login", { method: "POST", body: payload });
      state.session = { user: resp.user, push: state.session?.push || {} };
      history.replaceState(null, "", "/");
      await loadApp();
      startPolling();
      render();
    } catch (err) {
      document.querySelector("#auth-error").textContent = humanErr(err.message);
    }
  });
}

// ─── Home ─────────────────────────────────────────────────

function renderHome() {
  const d = state.data;
  swipeOpen.clear();

  app.innerHTML = `
    <div class="shell">
      <header class="app-header">
        <div class="app-wordmark"><span>W</span>ood</div>
        <div class="header-actions">
          ${pushBtnHtml()}
          ${d.user.role === "admin" ? `<button class="icon-btn" id="admin-btn" title="Admin">⚙</button>` : ""}
          <button class="icon-btn" id="logout-btn" title="Log out">↩</button>
        </div>
      </header>

      <div class="scroll-content" id="scroll-area">
        ${statsBarHtml(d.stats)}
        ${requestsHtml(d)}
        ${state.error ? `<div class="error-banner">${escHtml(state.error)}</div>` : ""}
        ${friendsListHtml(d.friends)}
      </div>

      <button class="fab" id="add-btn" title="Add friend">+</button>
      ${state.showAddSheet ? addSheetHtml() : ""}
    </div>
  `;

  bindHome();
}

function statsBarHtml(stats) {
  if (!stats) return "";
  const fav = stats.favourite_wooder ? escHtml(stats.favourite_wooder.username) : "—";
  return `
    <div class="stats-bar">
      <div class="stat-pill"><strong>${stats.woods_sent}</strong><span>sent</span></div>
      <div class="stat-pill"><strong>${stats.woods_received}</strong><span>received</span></div>
      <div class="stat-pill"><strong>${stats.current_longest_streak}</strong><span>streak</span></div>
      <div class="stat-pill"><strong>${stats.longest_streak}</strong><span>best</span></div>
      <div class="stat-pill"><strong>${stats.friends}</strong><span>friends</span></div>
      <div class="stat-pill"><strong>${fav}</strong><span>fave</span></div>
    </div>
  `;
}

function requestsHtml(d) {
  if (!d.incomingRequests.length && !d.outgoingRequests.length) return "";
  const incoming = d.incomingRequests.map((r) => `
    <div class="request-card">
      <div class="request-info">
        <div class="request-name">${escHtml(r.from.username)}</div>
        <div class="request-hint">wants to Wood with you</div>
      </div>
      <div class="request-actions">
        <button class="btn-accept" data-request="${r.id}" data-reply="accept">Accept</button>
        <button class="btn-reject" data-request="${r.id}" data-reply="reject">Decline</button>
      </div>
    </div>
  `).join("");
  const outgoing = d.outgoingRequests.map((r) => `
    <div class="outgoing-card">
      <div>
        <div class="outgoing-name">${escHtml(r.to.username)}</div>
        <div class="outgoing-hint">friend request sent</div>
      </div>
      <span class="pending-chip">Pending</span>
    </div>
  `).join("");
  return `
    <div class="section-head">Requests</div>
    <div class="request-list">${incoming}${outgoing}</div>
  `;
}

function friendsListHtml(friends) {
  if (!friends.length) {
    return `
      <div class="empty-state">
        <div class="empty-emoji">🪵</div>
        <p>Add a friend and start Wooding</p>
      </div>
    `;
  }
  return `
    <div class="section-head">Friends</div>
    <div class="friends-list">
      ${friends.map(friendCardHtml).join("")}
    </div>
  `;
}

function friendCardHtml(f) {
  const isOnCooldown = Boolean(f.wood.cooldownExpiresAt);
  const canWood = f.wood.canWood;
  const needsReply = f.wood.needsReply;
  const isMuted = f.muted;

  let statusClass = "can-wood";
  let statusDot = `<span class="status-dot ready"></span>`;
  let metaHtml = "";

  if (isOnCooldown) {
    statusClass = "on-cooldown";
    statusDot = `<span class="status-dot cooldown"></span>`;
    metaHtml = `<span class="cooldown-label">${countdown(f.wood.cooldownExpiresAt)}</span>`;
  } else if (isMuted) {
    statusClass = "";
    statusDot = `<span class="status-dot muted"></span>`;
    metaHtml = `<span class="muted-label">muted</span>`;
  } else if (needsReply) {
    statusClass = "needs-reply";
    statusDot = `<span class="status-dot reply"></span>`;
    metaHtml = `<span class="reply-label">wood them back ↩</span>`;
  }

  const streak = f.streak?.current_streak
    ? `<span class="streak-badge ${f.streak.at_risk ? "at-risk" : ""}">🔥 ${f.streak.current_streak}</span>`
    : "";

  // Tray width matches tray buttons: 3 × 72px = 216px
  const TRAY_W = 216;

  return `
    <div class="friend-item" id="fi-${f.id}" data-friend-id="${f.id}">
      <div class="friend-tray">
        <button class="tray-btn tray-history" data-tray-action="history" data-friend="${f.id}">
          <span class="tray-icon">📋</span>History
        </button>
        <button class="tray-btn tray-mute" data-tray-action="${f.muted ? "unmute" : "mute"}" data-friend="${f.id}">
          <span class="tray-icon">${f.muted ? "🔔" : "🔕"}</span>${f.muted ? "Unmute" : "Mute"}
        </button>
        <button class="tray-btn tray-remove" data-tray-action="remove" data-friend="${f.id}">
          <span class="tray-icon">✕</span>Remove
        </button>
      </div>
      <div
        class="friend-card ${statusClass}"
        id="fc-${f.id}"
        data-friend="${f.id}"
        data-can-wood="${canWood}"
        style="--tray-w: ${TRAY_W}px"
      >
        <div class="friend-left">
          <div class="friend-name">${escHtml(f.username)}</div>
          <div class="friend-meta">${metaHtml}</div>
        </div>
        <div class="friend-right">
          ${streak}
          ${statusDot}
        </div>
      </div>
    </div>
  `;
}

function addSheetHtml() {
  return `
    <div class="sheet-overlay" id="sheet-overlay">
      <div class="sheet" id="add-sheet">
        <div class="sheet-title">Add a friend</div>
        <form id="add-form" autocomplete="off">
          <div class="sheet-field">
            <div class="field-label">Exact username</div>
            <input
              class="field-input"
              name="friendUsername"
              id="add-input"
              type="search"
              placeholder="their_username"
              autocapitalize="none"
              autocorrect="off"
              spellcheck="false"
              autocomplete="off"
              data-1p-ignore
              data-lpignore="true"
              required
            />
          </div>
          <div class="sheet-error">${escHtml(state.addError)}</div>
          <button class="btn-primary" type="submit">Send request</button>
        </form>
      </div>
    </div>
  `;
}

function pushBtnHtml() {
  const s = state.pushStatus;
  if (!s || !state.data?.push?.enabled) return "";
  return `
    <button class="push-btn ${s.subscribed ? "active" : ""}" id="push-btn">
      <span class="push-dot"></span>${escHtml(s.label)}
    </button>
  `;
}

function bindHome() {
  document.querySelector("#logout-btn")?.addEventListener("click", logout);
  document.querySelector("#admin-btn")?.addEventListener("click", () => {
    history.pushState(null, "", "/admin");
    location.reload();
  });

  document.querySelector("#push-btn")?.addEventListener("click", async () => {
    try {
      await subscribePush();
      state.error = "";
    } catch (err) {
      state.error = humanErr(err.message);
    }
    await refreshPushStatus();
    render();
  });

  document.querySelector("#add-btn").addEventListener("click", () => {
    state.showAddSheet = true;
    state.addError = "";
    renderHome();
    setTimeout(() => document.querySelector("#add-input")?.focus(), 50);
  });

  document.querySelector("#sheet-overlay")?.addEventListener("click", (e) => {
    if (e.target.id === "sheet-overlay") {
      state.showAddSheet = false;
      renderHome();
    }
  });

  document.querySelector("#add-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = new FormData(e.currentTarget).get("friendUsername");
    try {
      state.data = await api("/api/friend-requests", { method: "POST", body: { username } });
      state.error = "";
      state.showAddSheet = false;
      render();
    } catch (err) {
      state.addError = humanErr(err.message);
      document.querySelector(".sheet-error").textContent = state.addError;
    }
  });

  document.querySelectorAll("[data-request]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await mutate(`/api/friend-requests/${btn.dataset.request}/${btn.dataset.reply}`);
    });
  });

  // Tray action buttons
  document.querySelectorAll("[data-tray-action]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const action = btn.dataset.trayAction;
      const friendId = btn.dataset.friend;
      if (action === "history") {
        openHistory(friendId);
      } else {
        mutate(`/api/friends/${friendId}/${action}`);
      }
    });
  });

  // Bind swipe + tap on each friend card
  document.querySelectorAll(".friend-card").forEach(bindFriendCard);
}

// ─── Friend card: swipe + tap + long press ───────────────

const TRAY_W = 216;
const SWIPE_THRESHOLD = 50;
const SWIPE_VELOCITY_THRESHOLD = 0.3; // px/ms

function bindFriendCard(card) {
  const friendId = card.dataset.friend;
  const canWood = card.dataset.canWood === "true";
  const item = card.closest(".friend-item");

  let startX = 0, startY = 0, startTime = 0;
  let currentX = 0;
  let isSwiping = false;
  let isHolding = false;
  let holdTimer = null;
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

  // Initialize position if already open
  if (isOpen()) setTranslate(-TRAY_W, false);

  card.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 && e.pointerType !== "touch") return;
    pointerId = e.pointerId;
    card.setPointerCapture(e.pointerId);
    startX = e.clientX;
    startY = e.clientY;
    startTime = Date.now();
    currentX = isOpen() ? -TRAY_W : 0;
    isSwiping = false;
    isHolding = false;

    holdTimer = setTimeout(() => {
      if (!isSwiping) {
        isHolding = true;
        card.classList.add("holding");
      }
    }, 380);
  });

  card.addEventListener("pointermove", (e) => {
    if (e.pointerId !== pointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (!isSwiping && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      isSwiping = true;
      clearTimeout(holdTimer);
      isHolding = false;
      card.classList.remove("holding");
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
    clearTimeout(holdTimer);
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
      // Tap or hold release — close if open, else send wood
      if (isOpen()) {
        snapClosed();
        return;
      }
      if (isHolding) {
        card.classList.remove("holding");
        if (!canWood) return;
        const holdMs = elapsed;
        card.classList.add("long-wood-sent");
        card.addEventListener("animationend", () => card.classList.remove("long-wood-sent"), { once: true });
        await mutate(`/api/friends/${friendId}/wood`, { holdMs });
      } else {
        // Quick tap
        if (!canWood) return;
        card.classList.add("wood-sent");
        card.addEventListener("animationend", () => card.classList.remove("wood-sent"), { once: true });
        await mutate(`/api/friends/${friendId}/wood`, { holdMs: 0 });
      }
    }
    card.classList.remove("swiping");
    isSwiping = false;
    isHolding = false;
  });

  card.addEventListener("pointercancel", () => {
    clearTimeout(holdTimer);
    card.classList.remove("holding");
    card.classList.remove("swiping");
    isOpen() ? snapOpen() : snapClosed();
    isSwiping = false;
    isHolding = false;
  });
}

// Close open swipe cards when tapping elsewhere
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

// ─── History view ─────────────────────────────────────────

async function openHistory(friendId) {
  state.view = "history";
  state.historyFriendId = friendId;
  state.historyData = null;
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

function scrollHistoryToBottom() {
  requestAnimationFrame(() => {
    const el = document.querySelector(".history-messages");
    if (el) el.scrollTop = el.scrollHeight;
  });
}

function renderHistory() {
  const userId = state.data?.user?.id;
  const hd = state.historyData;
  const friendId = state.historyFriendId;
  const friendName = hd?.friend?.username
    || state.data?.friends?.find((f) => f.id === friendId)?.username
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
    </div>
  `;

  document.querySelector("#back-btn").addEventListener("click", () => {
    state.view = "home";
    state.historyData = null;
    render();
  });

  if (hd) scrollHistoryToBottom();
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

    // Show streak marker if streak incremented to a milestone
    const streakMarker = w.streakCountAfter && [7, 30, 100, 365].includes(w.streakCountAfter)
      ? `<div class="history-streak">🔥 ${w.streakCountAfter} day streak!</div>`
      : "";

    // Collapse consecutive same-direction messages into a block, show avatar only on last
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

// ─── Mutations & polling ─────────────────────────────────

async function mutate(url, body = {}) {
  try {
    state.data = await api(url, { method: "POST", body });
    state.error = "";
    render();
  } catch (err) {
    state.error = humanErr(err.message);
    render();
  }
}

async function logout() {
  await api("/api/logout", { method: "POST" });
  state.session = { user: null };
  state.data = null;
  state.view = "home";
  stopPolling();
  history.replaceState(null, "", "/");
  render();
}

function startPolling() {
  if (state.pollTimer) return;
  state.pollTimer = setInterval(poll, 12000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") poll();
  });
}

function stopPolling() {
  clearInterval(state.pollTimer);
  state.pollTimer = null;
}

async function poll() {
  if (state.polling || !state.session?.user || document.visibilityState === "hidden") return;
  state.polling = true;
  try {
    state.data = await api("/api/app");
    state.error = "";
    await refreshPushStatus();
    if (state.view === "home") render();
    // if in history, refresh it silently too
    if (state.view === "history" && state.historyFriendId) {
      state.historyData = await api(`/api/friends/${state.historyFriendId}/woods`);
      render();
      scrollHistoryToBottom();
    }
  } catch (err) {
    state.error = humanErr(err.message);
  } finally {
    state.polling = false;
  }
}

// ─── Push ────────────────────────────────────────────────

async function subscribePush() {
  if (!state.data?.push?.enabled) throw new Error("push_keys_missing");
  if (!window.isSecureContext) throw new Error("https_required");
  if (!("Notification" in window) || !("PushManager" in window)) throw new Error("push_not_supported");

  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
  if (permission === "denied") throw new Error("notifications_blocked");
  if (permission !== "granted") throw new Error("permission_not_granted");

  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub = existing || await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: b64ToUint8(state.data.push.publicKey),
  });
  await api("/api/push-subscriptions", { method: "POST", body: { subscription: sub.toJSON() } });
  await refreshPushStatus();
}

async function refreshPushStatus() {
  if (!state.data?.push?.enabled) { state.pushStatus = { label: "Push off", supported: false }; return; }
  if (!window.isSecureContext) { state.pushStatus = { label: "HTTPS needed", supported: false }; return; }
  if (!("Notification" in window) || !("PushManager" in window)) {
    state.pushStatus = { label: "Push unsupported", supported: false }; return;
  }

  const permission = Notification.permission;
  let subscribed = false;
  if (permission === "granted") {
    const reg = await navigator.serviceWorker.ready;
    subscribed = Boolean(await reg.pushManager.getSubscription());
  }

  state.pushStatus = {
    supported: true,
    permission,
    subscribed,
    label: subscribed ? "Push on" : permission === "denied" ? "Push blocked" : "Enable push",
  };
}

// ─── Utilities ───────────────────────────────────────────

async function api(url, options = {}) {
  const res = await fetch(url, {
    method: options.method || "GET",
    headers: options.body ? { "content-type": "application/json" } : {},
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "request_failed");
  return data;
}

function countdown(iso) {
  const ms = Math.max(0, Date.parse(iso) - Date.now());
  const h = Math.floor(ms / 3600000);
  const m = Math.ceil((ms % 3600000) / 60000);
  return h ? `${h}h ${m}m` : `${m}m`;
}

function escHtml(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function humanErr(v) {
  return String(v).replaceAll("_", " ");
}

function b64ToUint8(b64) {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from([...atob(base64)].map((c) => c.charCodeAt(0)));
}

window.addEventListener("popstate", render);

// Refresh cooldown countdowns every minute
setInterval(() => { if (state.data && state.view === "home") render(); }, 60000);
