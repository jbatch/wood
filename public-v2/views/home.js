import { state, swipeOpen } from "../state.js";
import { bindFriendCard, TRAY_W } from "../ui/friendCard.js";
import { countdown, escHtml, formatDate, humanErr } from "../utils.js";

export function renderHome(ctx) {
  const { app } = ctx;
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
        ${state.homeTab === "stats" ? homeStatsHtml(d) : state.homeTab === "groups" ? `
          ${groupInvitesHtml(d.groupInvites || [])}
          ${groupsListHtml(d.groups || [])}
        ` : `
          ${statsBarHtml(d.stats)}
          ${requestsHtml(d)}
          ${friendsListHtml(d.friends)}
        `}
        ${state.error ? `<div class="error-banner">${escHtml(state.error)}</div>` : ""}
      </div>

      ${mainNavHtml()}
      ${state.showAddSheet ? addSheetHtml() : ""}
      ${state.showGroupSheet ? groupSheetHtml(d.friends || []) : ""}
    </div>
  `;

  bindHome(ctx);
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
      <button class="tab-btn ${state.homeTab === "groups" ? "active" : ""}" data-home-tab="groups">
        <span class="tab-icon">◎</span><span>Groups</span>
      </button>
      <button class="tab-btn primary-tab" data-action="add-friend">
        <span class="tab-icon">＋</span><span>${state.homeTab === "groups" ? "Group" : "Add"}</span>
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

function groupInvitesHtml(invites) {
  if (!invites.length) return "";
  return `
    <div class="section-head">Group invites</div>
    <div class="request-list">
      ${invites.map((invite) => `
        <div class="request-card">
          <div class="request-info">
            <div class="request-name">${escHtml(invite.group.name)}</div>
            <div class="request-hint">${invite.invitedBy ? escHtml(invite.invitedBy.username) : "Someone"} invited you</div>
          </div>
          <div class="request-actions">
            <button class="btn-accept" data-group-invite="${invite.id}" data-group-reply="accept">Accept</button>
            <button class="btn-reject" data-group-invite="${invite.id}" data-group-reply="decline">Decline</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function groupsListHtml(groups) {
  if (!groups.length) {
    return `
      <div class="empty-state">
        <div class="empty-emoji">◎</div>
        <p>Create a group and Wood the room</p>
      </div>
    `;
  }
  return `
    <div class="section-head">Groups</div>
    <div class="friends-list">
      ${groups.map(groupCardHtml).join("")}
    </div>
  `;
}

function groupCardHtml(group) {
  const cooldown = group.wood?.cooldownExpiresAt;
  const meta = cooldown
    ? `<span class="cooldown-label">${countdown(cooldown)}</span>`
    : group.wood?.needsReply
      ? `<span class="reply-label">someone wooded back</span>`
      : `<span>${group.members.length} members · ${group.stats.woods_sent} Woods</span>`;
  const dot = cooldown
    ? `<span class="status-dot cooldown"></span>`
    : `<span class="status-dot ready"></span>`;
  return `
    <div class="friend-item">
      <div class="friend-card group-card ${cooldown ? "on-cooldown" : "can-wood"}" data-group="${group.id}" data-can-wood="${group.wood?.canWood}">
        <div class="friend-left">
          <div class="friend-name">${escHtml(group.name)}</div>
          <div class="friend-meta">${meta}</div>
          ${group.pendingMembers.length ? `<div class="group-pending">${group.pendingMembers.length} pending</div>` : ""}
        </div>
        <div class="friend-right">
          <span class="streak-badge">${group.members.length}</span>
          ${dot}
        </div>
      </div>
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

function groupSheetHtml(friends) {
  return `
    <div class="sheet-overlay" id="group-sheet-overlay">
      <div class="sheet" id="group-sheet">
        <div class="sheet-title">Create group</div>
        <form id="group-form" autocomplete="off">
          <div class="sheet-field">
            <div class="field-label">Group name</div>
            <input class="field-input" name="name" required maxlength="40" placeholder="Friday Woods" />
          </div>
          <div class="sheet-field">
            <div class="field-label">Invite friends</div>
            <div class="group-picker">
              ${friends.length ? friends.map((friend) => `
                <label class="group-choice">
                  <input type="checkbox" name="memberIds" value="${escHtml(friend.id)}" />
                  <span>${escHtml(friend.username)}</span>
                </label>
              `).join("") : `<div class="group-empty">Add friends before making a group</div>`}
            </div>
          </div>
          <div class="sheet-error">${escHtml(state.groupError)}</div>
          <button class="btn-primary" type="submit" ${friends.length ? "" : "disabled"}>Send invites</button>
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

function bindHome(ctx) {
  const { api, ensureAdminData, logout, mutate, openHistory, refreshPushStatus, render, saveHomeTab, subscribePush } = ctx;
  document.querySelector("#logout-btn")?.addEventListener("click", logout);

  document.querySelectorAll("[data-home-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      saveHomeTab(btn.dataset.homeTab);
      renderHome(ctx);
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
    if (state.homeTab === "groups") {
      state.showGroupSheet = true;
      state.groupError = "";
    } else {
      state.showAddSheet = true;
      state.addError = "";
    }
    renderHome(ctx);
    setTimeout(() => document.querySelector("#add-input, #group-sheet input")?.focus(), 50);
  });

  document.querySelector("#sheet-overlay")?.addEventListener("click", (e) => {
    if (e.target.id === "sheet-overlay") {
      state.showAddSheet = false;
      renderHome(ctx);
    }
  });
  document.querySelector("#group-sheet-overlay")?.addEventListener("click", (e) => {
    if (e.target.id === "group-sheet-overlay") {
      state.showGroupSheet = false;
      renderHome(ctx);
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
  document.querySelector("#group-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const memberIds = form.getAll("memberIds");
    try {
      state.data = await api("/api/groups", {
        method: "POST",
        body: { name: form.get("name"), memberIds },
      });
      state.error = "";
      state.showGroupSheet = false;
      render();
    } catch (err) {
      state.groupError = humanErr(err.message);
      document.querySelector("#group-sheet .sheet-error").textContent = state.groupError;
    }
  });

  document.querySelectorAll("[data-request]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await mutate(`/api/friend-requests/${btn.dataset.request}/${btn.dataset.reply}`);
    });
  });
  document.querySelectorAll("[data-group-invite]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await mutate(`/api/groups/invites/${btn.dataset.groupInvite}/${btn.dataset.groupReply}`);
    });
  });

  document.querySelectorAll("[data-group]").forEach((card) => {
    card.addEventListener("click", async () => {
      if (card.dataset.canWood !== "true") return;
      card.classList.add("wood-sent");
      card.addEventListener("animationend", () => card.classList.remove("wood-sent"), { once: true });
      await mutate(`/api/groups/${card.dataset.group}/wood`, { holdMs: 0 });
    });
  });

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

  document.querySelectorAll(".friend-card:not(.group-card)").forEach((card) => {
    bindFriendCard(card, { mutate });
  });
}
