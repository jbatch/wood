const app = document.querySelector("#app");

const state = {
  session: null,
  data: null,
  error: "",
  pushStatus: null,
  admin: null,
  debug: null,
  pollTimer: null,
  polling: false,
  view: "home",        // "home" | "history"
  homeTab: "friends",
  adminTab: "overview",
  historyFriendId: null,
  historyData: null,
  woodKeyboardOpen: false,
  toast: "",
  showAddSheet: false,
  addError: "",
};

// Track which cards are swiped open
const swipeOpen = new Set();
let toastTimer = null;

init();

async function init() {
  if ("serviceWorker" in navigator) {
    const reg = await navigator.serviceWorker.register("/sw.js");
    reg.update();
  }
  state.session = await api("/api/session");
  if (state.session.user) {
    const params = new URLSearchParams(location.search);
    if (params.get("tab") === "stats") state.homeTab = "stats";
    await loadApp();
    startPolling();
  }
  render();
}

async function loadApp() {
  state.data = await api("/api/app");
  state.error = "";
  if (state.data.user.role === "admin") {
    state.admin = await api("/api/admin");
    state.debug = await api("/api/admin/debug");
  }
  await refreshPushStatus();
}

function render() {
  if (!state.session?.user) { renderAuth(); return; }
  if (location.pathname === "/admin" && state.data?.user.role === "admin") { renderAdmin(); return; }
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
          <button class="icon-btn" id="logout-btn" title="Log out">↩</button>
        </div>
      </header>

      <div class="scroll-content" id="scroll-area">
        ${state.homeTab === "stats" ? homeStatsHtml(d) : `
          ${statsBarHtml(d.stats)}
          ${requestsHtml(d)}
          ${friendsListHtml(d.friends)}
        `}
        ${state.error ? `<div class="error-banner">${escHtml(state.error)}</div>` : ""}
      </div>

      ${mainNavHtml()}
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

function homeStatsHtml(d) {
  const stats = d.stats || {};
  const fav = stats.favourite_wooder ? escHtml(stats.favourite_wooder.username) : "None yet";
  return `
    <div class="section-head">Stats</div>
    <div class="metric-grid">
      <div class="metric-card"><strong>${stats.woods_sent || 0}</strong><span>Woods sent</span></div>
      <div class="metric-card"><strong>${stats.woods_received || 0}</strong><span>Received</span></div>
      <div class="metric-card"><strong>${stats.current_longest_streak || 0}</strong><span>Current streak</span></div>
      <div class="metric-card"><strong>${stats.longest_streak || 0}</strong><span>Best streak</span></div>
      <div class="metric-card"><strong>${stats.long_woods_sent || 0}</strong><span>Long Woods</span></div>
      <div class="metric-card"><strong>${stats.seasonal_woods_sent || 0}</strong><span>Seasonal</span></div>
      <div class="metric-card wide"><strong>${stats.friends || 0}</strong><span>Friends</span></div>
      <div class="metric-card wide"><strong>${fav}</strong><span>Favourite Wooder</span></div>
    </div>
    ${achievementsHtml(d.achievements || [])}
  `;
}

function achievementsHtml(achievements) {
  const earned = achievements.filter((achievement) => achievement.earned).length;
  return `
    <div class="section-head">Achievements ${earned}/${achievements.length}</div>
    <div class="achievement-grid">
      ${achievements.map(achievementCardHtml).join("")}
    </div>
  `;
}

function achievementCardHtml(achievement) {
  const earned = achievement.earned;
  return `
    <div class="achievement-card ${earned ? "earned" : ""}">
      <div class="achievement-icon">${escHtml(achievement.icon)}</div>
      <div class="achievement-copy">
        <strong>${escHtml(achievement.name)}</strong>
        <span>${escHtml(achievement.description)}</span>
        ${earned ? `<small>${formatDate(achievement.earned_at)}</small>` : ""}
      </div>
    </div>
  `;
}

function mainNavHtml() {
  const isAdmin = state.data?.user?.role === "admin";
  return `
    <nav class="bottom-tabs" aria-label="Main">
      <button class="tab-btn ${state.homeTab === "friends" ? "active" : ""}" data-home-tab="friends">
        <span class="tab-icon">●</span><span>Friends</span>
      </button>
      <button class="tab-btn ${state.homeTab === "stats" ? "active" : ""}" data-home-tab="stats">
        <span class="tab-icon">◆</span><span>Stats</span>
      </button>
      <button class="tab-btn primary-tab" data-action="add-friend">
        <span class="tab-icon">＋</span><span>Add</span>
      </button>
      ${isAdmin ? `
        <button class="tab-btn" data-route="/admin">
          <span class="tab-icon">⚙</span><span>Admin</span>
        </button>
      ` : ""}
    </nav>
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

  document.querySelectorAll("[data-home-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.homeTab = btn.dataset.homeTab;
      renderHome();
    });
  });

  document.querySelector("[data-route='/admin']")?.addEventListener("click", async () => {
    history.pushState(null, "", "/admin");
    await ensureAdminData();
    render();
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

  document.querySelector("[data-action='add-friend']")?.addEventListener("click", () => {
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

  document.querySelector("#composer-input")?.addEventListener("click", openWoodKeyboard);
  document.querySelector("#composer-input")?.addEventListener("focus", openWoodKeyboard);
  document.querySelectorAll("[data-keyboard-open]").forEach((btn) => {
    btn.addEventListener("click", openWoodKeyboard);
  });
  document.querySelector("#wood-key")?.addEventListener("click", sendHistoryWood);
  document.querySelector("#history-messages")?.addEventListener("click", () => {
    if (state.woodKeyboardOpen) {
      state.woodKeyboardOpen = false;
      renderHistory();
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

function openWoodKeyboard() {
  if (state.woodKeyboardOpen) return;
  state.woodKeyboardOpen = true;
  renderHistory();
}

async function sendHistoryWood() {
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
    renderHistory();
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

// ─── Admin ───────────────────────────────────────────────

async function ensureAdminData() {
  if (state.data?.user?.role !== "admin") return;
  if (!state.admin) state.admin = await api("/api/admin");
  if (!state.debug) state.debug = await api("/api/admin/debug");
}

function renderAdmin() {
  if (!state.admin) {
    app.innerHTML = `
      <div class="shell">
        <header class="app-header">
          <div class="app-wordmark"><span>W</span>ood Admin</div>
          <button class="icon-btn" data-route="/" title="Back">↩</button>
        </header>
        <div class="empty-state"><p>Loading admin…</p></div>
      </div>
    `;
    ensureAdminData().then(render).catch((err) => {
      state.error = humanErr(err.message);
      renderHome();
    });
    return;
  }

  app.innerHTML = `
    <div class="shell admin-shell">
      <header class="app-header">
        <div class="app-wordmark"><span>W</span>ood Admin</div>
        <div class="header-actions">
          <button class="icon-btn" data-route="/" title="App">⌂</button>
          <button class="icon-btn" id="logout-btn" title="Log out">↩</button>
        </div>
      </header>
      <div class="scroll-content admin-content">
        ${state.error ? `<div class="error-banner">${escHtml(state.error)}</div>` : ""}
        ${adminPanelHtml()}
      </div>
      ${adminNavHtml()}
    </div>
  `;
  bindAdmin();
}

function adminPanelHtml() {
  if (state.adminTab === "invites") return adminInvitesHtml();
  if (state.adminTab === "users") return adminUsersHtml();
  if (state.adminTab === "debug") return adminDebugHtml();
  return adminOverviewHtml();
}

function adminNavHtml() {
  const tabs = [
    ["overview", "●", "Overview"],
    ["invites", "＋", "Invites"],
    ["users", "◆", "Users"],
    ["debug", "⋯", "Debug"],
  ];
  return `
    <nav class="bottom-tabs" aria-label="Admin">
      ${tabs.map(([id, icon, label]) => `
        <button class="tab-btn ${state.adminTab === id ? "active" : ""}" data-admin-tab="${id}">
          <span class="tab-icon">${icon}</span><span>${label}</span>
        </button>
      `).join("")}
    </nav>
  `;
}

function adminOverviewHtml() {
  const admin = state.admin;
  return `
    <div class="section-head">Overview</div>
    <div class="metric-grid">
      <div class="metric-card"><strong>${admin.stats.total_users}</strong><span>Users</span></div>
      <div class="metric-card"><strong>${admin.stats.total_woods}</strong><span>Woods</span></div>
      <div class="metric-card"><strong>${admin.stats.woods_today}</strong><span>Today</span></div>
      <div class="metric-card"><strong>${admin.stats.active_streaks}</strong><span>Streaks</span></div>
    </div>
    <div class="section-head">System</div>
    <form class="admin-card form-card" id="config-form">
      <div class="sheet-field">
        <div class="field-label">Cooldown hours</div>
        <input class="field-input" name="cooldown_hours" type="number" min="1" max="720" value="${admin.config.cooldown_hours}" />
      </div>
      <label class="toggle-row">
        <span>
          <strong>Seasonal themes</strong>
          <small>Use server-side Wood variants</small>
        </span>
        <input name="seasonal_enabled" type="checkbox" ${admin.config.seasonal_enabled ? "checked" : ""} />
      </label>
      <button class="btn-primary" type="submit">Save config</button>
    </form>
  `;
}

function adminInvitesHtml() {
  const invites = state.admin.invites.slice().reverse();
  return `
    <div class="section-head">Generate</div>
    <form class="admin-card invite-form" id="invite-form">
      <div class="compact-fields">
        <div class="sheet-field">
          <div class="field-label">Count</div>
          <input class="field-input" name="count" type="number" min="1" max="50" value="1" />
        </div>
        <div class="sheet-field">
          <div class="field-label">Days</div>
          <input class="field-input" name="days" type="number" min="1" max="90" value="7" />
        </div>
      </div>
      <button class="btn-primary" type="submit">Generate invites</button>
    </form>
    <div class="section-head">Invites</div>
    <div class="admin-list">
      ${invites.length ? invites.map(inviteCardHtml).join("") : `<div class="empty-state small-empty"><p>No invites yet</p></div>`}
    </div>
  `;
}

function inviteCardHtml(invite) {
  return `
    <div class="admin-card invite-card">
      <div class="admin-card-main">
        <div class="admin-title">${escHtml(invite.status)}</div>
        <div class="admin-sub">${escHtml(invite.url)}</div>
        <div class="admin-meta">Expires ${formatDate(invite.expires_at)}</div>
      </div>
      ${invite.status === "unused" ? `<button class="chip-btn" data-invite="${invite.id}">Revoke</button>` : ""}
    </div>
  `;
}

function adminUsersHtml() {
  const users = state.admin.users;
  return `
    <div class="section-head">Users</div>
    <div class="admin-list">
      ${users.map(userCardHtml).join("")}
    </div>
  `;
}

function userCardHtml(user) {
  const achievements = state.admin.achievements || [];
  return `
    <div class="admin-card user-card">
      <div class="admin-card-main">
        <div class="admin-title">${escHtml(user.username)} ${user.role === "admin" ? `<span class="role-chip">admin</span>` : ""}</div>
        <div class="admin-sub">${escHtml(user.email)}</div>
        <div class="admin-meta">
          ${user.suspended ? "Suspended" : "Active"} · ${user.friend_count} friends · ${user.woods_sent}/${user.woods_received} Woods · ${user.achievements_earned || 0} achievements · 🔥 ${user.current_longest_streak}
        </div>
      </div>
      <div class="achievement-award">
        <select class="field-input" data-achievement-select="${user.id}" aria-label="Achievement">
          ${achievements.map((achievement) => `
            <option value="${escHtml(achievement.slug)}">${escHtml(achievement.name)}</option>
          `).join("")}
        </select>
        <button class="chip-btn" data-award-achievement="${user.id}">Award</button>
      </div>
      <div class="admin-actions">
        <button class="chip-btn accent" data-user="${user.id}" data-admin-action="test-push">Push</button>
        <button class="chip-btn" data-user="${user.id}" data-admin-action="${user.suspended ? "unsuspend" : "suspend"}">${user.suspended ? "Unsuspend" : "Suspend"}</button>
        <button class="chip-btn" data-user="${user.id}" data-admin-action="${user.role === "admin" ? "demote" : "promote"}">${user.role === "admin" ? "Demote" : "Promote"}</button>
      </div>
    </div>
  `;
}

function adminDebugHtml() {
  return `
    <div class="section-head">Push tools</div>
    <div class="admin-card debug-actions">
      <button class="chip-btn accent" data-action="refresh-debug">Refresh debug</button>
      <button class="chip-btn danger-chip" data-action="clear-push">Clear push subs</button>
    </div>
    <div class="section-head">Notification tests</div>
    <div class="admin-list">
      ${notificationStyleTestsHtml()}
    </div>
    <div class="section-head">Recent debug</div>
    <div class="admin-list">
      ${debugEntriesHtml()}
    </div>
  `;
}

function notificationStyleTestsHtml() {
  const users = state.admin.users.filter((user) => !user.suspended);
  const styles = state.admin.notification_styles || [];
  if (!users.length || !styles.length) return `<div class="empty-state small-empty"><p>No notification tests available</p></div>`;
  return styles.map((style) => `
    <div class="admin-card notification-card">
      <img src="${escHtml(style.icon)}" alt="" width="44" height="44" />
      <div class="admin-card-main">
        <div class="admin-title">${escHtml(style.id)}</div>
        <div class="admin-meta">Icon${style.vibrate ? " · vibration" : ""}</div>
        <div class="admin-actions inline-actions">
          ${users.map((user) => `
            <button class="chip-btn" data-user="${user.id}" data-style="${style.id}">${escHtml(user.username)}</button>
          `).join("")}
        </div>
      </div>
    </div>
  `).join("");
}

function debugEntriesHtml() {
  const entries = state.debug?.entries || [];
  if (!entries.length) return `<div class="empty-state small-empty"><p>No debug events yet</p></div>`;
  return entries.slice(0, 40).map((entry) => `
    <div class="admin-card debug-card">
      <div class="admin-title">${escHtml(entry.type)}</div>
      <div class="admin-meta">${formatDate(entry.at)}</div>
      <code>${escHtml(JSON.stringify(without(entry, ["at", "type"])))}</code>
    </div>
  `).join("");
}

function bindAdmin() {
  document.querySelector("#logout-btn")?.addEventListener("click", logout);
  document.querySelector("[data-route='/']")?.addEventListener("click", () => {
    history.pushState(null, "", "/");
    state.view = "home";
    render();
  });
  document.querySelectorAll("[data-admin-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.adminTab = btn.dataset.adminTab;
      renderAdmin();
    });
  });
  document.querySelector("[data-action='refresh-debug']")?.addEventListener("click", async () => {
    state.debug = await api("/api/admin/debug");
    renderAdmin();
  });
  document.querySelector("[data-action='clear-push']")?.addEventListener("click", async () => {
    state.admin = await api("/api/admin/push-subscriptions/clear", { method: "POST" });
    state.debug = await api("/api/admin/debug");
    renderAdmin();
  });
  document.querySelector("#invite-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    await api("/api/admin/invites", { method: "POST", body: payload });
    state.admin = await api("/api/admin");
    renderAdmin();
  });
  document.querySelector("#config-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    state.admin = await api("/api/admin/config", {
      method: "POST",
      body: {
        cooldown_hours: form.get("cooldown_hours"),
        seasonal_enabled: form.get("seasonal_enabled") === "on",
      },
    });
    await loadApp();
    renderAdmin();
  });
  document.querySelectorAll("[data-invite]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      state.admin = await api(`/api/admin/invites/${btn.dataset.invite}/revoke`, { method: "POST" });
      renderAdmin();
    });
  });
  document.querySelectorAll("[data-admin-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const response = await api(`/api/admin/users/${btn.dataset.user}/${btn.dataset.adminAction}`, { method: "POST" });
      if (btn.dataset.adminAction === "test-push") {
        state.admin = response.admin;
        state.error = `Test push sent: ${response.result.sent}/${response.result.attempted}`;
        state.debug = await api("/api/admin/debug");
      } else {
        state.admin = await api("/api/admin");
      }
      renderAdmin();
    });
  });
  document.querySelectorAll("[data-award-achievement]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const userId = btn.dataset.awardAchievement;
      const select = document.querySelector(`[data-achievement-select="${CSS.escape(userId)}"]`);
      state.admin = await api(`/api/admin/users/${userId}/achievements`, {
        method: "POST",
        body: { slug: select?.value },
      });
      await loadApp();
      renderAdmin();
    });
  });
  document.querySelectorAll("[data-style]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const response = await api(`/api/admin/users/${btn.dataset.user}/test-push`, {
        method: "POST",
        body: { styleId: btn.dataset.style },
      });
      state.admin = response.admin;
      state.error = `Test ${btn.dataset.style} sent: ${response.result.sent}/${response.result.attempted}`;
      state.debug = await api("/api/admin/debug");
      renderAdmin();
    });
  });
}

// ─── Mutations & polling ─────────────────────────────────

async function mutate(url, body = {}) {
  try {
    state.data = await api(url, { method: "POST", body });
    state.error = "";
    if (state.data.user.role === "admin") state.admin = await api("/api/admin");
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
  state.admin = null;
  state.debug = null;
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
  if (
    state.polling ||
    !state.session?.user ||
    location.pathname === "/admin" ||
    document.visibilityState === "hidden"
  ) return;
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

function formatDate(iso) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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

function showToast(message) {
  state.toast = message;
  clearTimeout(toastTimer);
  render();
  toastTimer = setTimeout(() => {
    state.toast = "";
    if (state.session?.user) render();
  }, 2200);
}

function without(object, keys) {
  const copy = { ...object };
  for (const key of keys) delete copy[key];
  return copy;
}

function b64ToUint8(b64) {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from([...atob(base64)].map((c) => c.charCodeAt(0)));
}

window.addEventListener("popstate", render);

// Refresh cooldown countdowns every minute
setInterval(() => { if (state.data && state.view === "home") render(); }, 60000);
