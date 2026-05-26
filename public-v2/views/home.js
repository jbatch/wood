import { state } from "../state.js";
import { bindFriendCard, TRAY_W } from "../ui/friendCard.js";
import { restoreScrollPosition, saveScrollPosition } from "../ui/scrollState.js";
import { countdown, escHtml, formatDate, humanErr } from "../utils.js";
import { bindNotifications, notificationButtonHtml, notificationSheetHtml } from "./notifications.js";

export function renderHome(ctx) {
  const { app } = ctx;
  const d = state.data;
  saveScrollPosition();
  const scrollKey = `home:${state.homeTab}`;

  app.innerHTML = `
    <div class="shell">
      <header class="app-header">
        <div class="app-wordmark"><span>W</span>ood</div>
        <div class="header-actions">
          ${pushBtnHtml()}
          ${notificationButtonHtml()}
        </div>
      </header>

      <div class="scroll-content" id="scroll-area" data-scroll-key="${scrollKey}">
        ${state.homeTab === "stats" ? homeStatsHtml(d) : state.homeTab === "groups" ? `
          ${legacyGroupsNoticeHtml(d.groupSystem)}
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
      ${notificationSheetHtml()}
      ${state.showAddSheet ? addSheetHtml() : ""}
      ${state.showGroupSheet ? groupSheetHtml(d.friends || []) : ""}
      ${state.showGroupInviteSheet ? groupInviteSheetHtml(d.groups || []) : ""}
      ${state.homeTab === "groups" && !d.groupSystem?.tutorialSeen ? groupTutorialSheetHtml() : ""}
    </div>
  `;

  bindHome(ctx);
  restoreScrollPosition(scrollKey);
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
  const tab = state.achievementTab === "group" ? "group" : "individual";
  const visible = achievements.filter((achievement) =>
    tab === "group"
      ? achievement.category === "group"
      : achievement.category !== "group"
  );
  const earned = visible.filter((achievement) => achievement.earned).length;
  return `
    <div class="section-head">Achievements ${earned}/${visible.length}</div>
    <div class="achievement-tabs" aria-label="Achievement type">
      <button class="${tab === "individual" ? "active" : ""}" type="button" data-achievement-tab="individual">Individual</button>
      <button class="${tab === "group" ? "active" : ""}" type="button" data-achievement-tab="group">Group</button>
    </div>
    <div class="achievement-grid">
      ${visible.map(achievementCardHtml).join("")}
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
      <button class="tab-btn ${state.homeTab === "settings" ? "active" : ""}" data-home-tab="settings">
        <span class="tab-icon">⚙</span><span>Settings</span>
      </button>
      ${isAdmin ? `
        <button class="tab-btn" data-route="/admin">
          <span class="tab-icon">✦</span><span>Admin</span>
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
      <div class="section-head with-action">
        <span>Friends</span>
        <button class="section-add-btn" type="button" data-action="add-friend" title="Add friend">＋</button>
      </div>
      <div class="empty-state">
        <div class="empty-emoji">🪵</div>
        <p>Add a friend and start Wooding</p>
      </div>
    `;
  }
  return `
    <div class="section-head with-action">
      <span>Friends</span>
      <button class="section-add-btn" type="button" data-action="add-friend" title="Add friend">＋</button>
    </div>
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

function legacyGroupsNoticeHtml(groupSystem) {
  if (!groupSystem?.legacyGroupCount || groupSystem.migrationNoticeSeen) return "";
  return `
    <div class="legacy-group-notice">
      <div>
        <strong>Groups got rebuilt</strong>
        <p>Your old groups are now sealed in amber. New groups have one shared Woodpile, one owner, and require received Wood to contribute.</p>
      </div>
      <button class="btn-accept" type="button" data-action="dismiss-group-migration">Got it</button>
    </div>
  `;
}

function groupTutorialSheetHtml() {
  return `
    <div class="sheet-overlay group-tutorial-overlay" id="group-tutorial-overlay">
      <div class="sheet group-tutorial-sheet" id="group-tutorial-sheet">
        <div class="sheet-title">The Woodpile works differently now</div>
        <div class="tutorial-steps">
          <div>
            <strong>Receive Wood</strong>
            <span>DM Woods you receive after today go into your stockpile.</span>
          </div>
          <div>
            <strong>Make deposits</strong>
            <span>Spend stockpile Wood to add to the group pile. One deposit per hour.</span>
          </div>
          <div>
            <strong>Feed the mystery</strong>
            <span>As the pile grows, deposits cost more and the pile gets stranger.</span>
          </div>
        </div>
        <button class="btn-primary" type="button" data-action="dismiss-group-tutorial">Inspect pile</button>
      </div>
    </div>
  `;
}

function groupsListHtml(groups) {
  if (!groups.length) {
    return `
      <div class="section-head with-action">
        <span>The Woodpile</span>
        <button class="section-add-btn" type="button" data-action="add-group" title="Start pile">＋</button>
      </div>
      <div class="empty-state">
        <div class="empty-emoji">◎</div>
        <p>Start your pile. Friends can join this one, or build their own.</p>
      </div>
    `;
  }
  return `
    <div class="section-head with-action">
      <span>The Woodpile</span>
    </div>
    <div class="woodpile-list">
      ${groups.map(groupCardHtml).join("")}
    </div>
  `;
}

function groupCardHtml(group) {
  const cooldown = group.wood?.cooldownExpiresAt;
  const total = Number(group.stats?.woods_sent || 0);
  const stockpile = Number(group.wood?.stockpile || 0);
  const depositCost = Number(group.wood?.depositCost || group.stats?.stage?.depositCost || 1);
  const canDeposit = group.wood?.canWood;
  const blocked = group.wood?.blockedReason;
  const rank = group.wood?.rank ? `#${group.wood.rank}` : "unranked";
  const stage = group.stats?.stage || { name: "Bare Patch", hint: "A place where Wood might happen." };
  const buttonCopy = canDeposit
    ? `Deposit ${depositCost} Wood`
    : cooldown
      ? countdown(cooldown)
      : blocked === "insufficient_stockpile"
        ? `Need ${Math.max(0, depositCost - stockpile)} more`
        : "Not available";
  return `
    <div class="woodpile-card">
      <div class="woodpile-head">
        <div>
          <div class="woodpile-kicker">${group.owner?.id === state.data?.user?.id ? "Your pile" : `${escHtml(group.owner?.username || "Someone")}'s pile`}</div>
          <div class="woodpile-title">${escHtml(group.name)}</div>
        </div>
        <span class="woodpile-members">${group.members.length}</span>
      </div>
      <div class="pile-illustration" aria-hidden="true" style="${pileStyle(total)}">
        ${pileLogsHtml(total)}
      </div>
      <button class="woodpile-deposit ${canDeposit ? "" : "disabled"}" type="button" data-group="${group.id}" data-can-wood="${canDeposit}">
        ${escHtml(buttonCopy)}
      </button>
      <div class="woodpile-stats">
        <div><strong>${total}</strong><span>in pile</span></div>
        <div><strong>${stockpile}</strong><span>stockpile</span></div>
        <div><strong>${rank}</strong><span>rank</span></div>
      </div>
      <div class="woodpile-stage">
        <strong>${escHtml(stage.name)}</strong>
        <span>${escHtml(stage.hint)}</span>
      </div>
      ${woodpileProgressHtml(total)}
      ${group.stats?.ranks?.length ? `
        <div class="woodpile-ranks">
          ${group.stats.ranks.slice(0, 5).map((entry) => `
            <div class="woodpile-rank ${entry.userId === state.data?.user?.id ? "me" : ""}">
              <span>${entry.rank}. ${escHtml(entry.user?.username || "mystery")}</span>
              <strong>${entry.amount}</strong>
            </div>
          `).join("")}
        </div>
      ` : `<div class="woodpile-empty-rank">No deposits yet. Suspiciously tidy.</div>`}
      ${group.inviteableFriends?.length ? `
        <button class="chip-btn woodpile-invite" type="button" data-invite-group-target="${escHtml(group.id)}">
          Invite friends
        </button>
      ` : ""}
      ${group.pendingMembers.length ? `<div class="group-pending">${group.pendingMembers.length} pending invites</div>` : ""}
    </div>
  `;
}

function woodpileProgressHtml(total) {
  const tiers = [...(state.data?.groupSystem?.tiers || [])]
    .sort((a, b) => Number(a.minWood || 0) - Number(b.minWood || 0));
  if (!tiers.length) return "";

  const wood = Number(total || 0);
  const currentIndex = tiers.reduce((latest, tier, index) =>
    wood >= Number(tier.minWood || 0) ? index : latest
  , 0);
  const current = tiers[currentIndex] || tiers[0];
  const next = tiers[currentIndex + 1];

  if (!next) {
    return `
      <div class="woodpile-progress">
        <div class="woodpile-progress-row">
          <span>Top tier reached</span>
          <span>100%</span>
        </div>
        <div class="woodpile-progress-track" aria-hidden="true">
          <div class="woodpile-progress-fill" style="width: 100%"></div>
        </div>
        <div class="woodpile-progress-note">The pile refuses further classification.</div>
      </div>
    `;
  }

  const start = Number(current.minWood || 0);
  const end = Number(next.minWood || start + 1);
  const width = Math.max(1, end - start);
  const percent = Math.min(100, Math.max(0, Math.round(((wood - start) / width) * 100)));
  const remaining = Math.max(0, end - wood);

  return `
    <div class="woodpile-progress">
      <div class="woodpile-progress-row">
        <span>Next tier</span>
        <span>${percent}%</span>
      </div>
      <div class="woodpile-progress-track" aria-hidden="true">
        <div class="woodpile-progress-fill" style="width: ${percent}%"></div>
      </div>
      <div class="woodpile-progress-note">${remaining} Wood to next tier</div>
    </div>
  `;
}

function pileLogsHtml(total) {
  return pileLayout(total).logs.map((log, index) =>
    `<span style="${pileLogStyle(log, index)}"></span>`
  ).join("");
}

function pileStyle(total) {
  const { logs, rows } = pileLayout(total);
  const scale = rows >= 8 ? 0.62 : rows >= 7 ? 0.68 : rows >= 6 ? 0.76 : rows >= 5 ? 0.84 : rows >= 4 ? 0.92 : 1;
  return `--pile-scale: ${scale}; --pile-rows: ${rows};`;
}

function pileLayout(total) {
  const logCount = pileLogCount(total);
  if (!logCount) return { logs: [], rows: 0 };

  const bottomCols = bottomPileColumns(logCount);
  const logs = [];
  let remaining = logCount;
  let row = 0;
  while (remaining > 0) {
    const targetCols = Math.max(1, bottomCols - row);
    const rowCols = Math.min(targetCols, remaining);
    for (let col = 0; col < rowCols; col += 1) {
      logs.push({ col, row, rowCols });
    }
    remaining -= rowCols;
    row += 1;
  }
  return { logs, rows: row };
}

function pileLogCount(total) {
  const wood = Number(total || 0);
  if (wood <= 0) return 0;
  return Math.min(56, Math.max(1, Math.ceil(wood / 2)));
}

function bottomPileColumns(logCount) {
  if (logCount >= 44) return 9;
  if (logCount >= 32) return 8;
  if (logCount >= 22) return 7;
  if (logCount >= 14) return 6;
  if (logCount >= 7) return 5;
  if (logCount >= 4) return 4;
  if (logCount >= 2) return 2;
  return 1;
}

function pileLogStyle(log, index) {
  const spacing = 31;
  const x = (log.col - (log.rowCols - 1) / 2) * spacing;
  const rot = -8 + ((index * 7) % 9) * 2;
  const tint = 0.86 + ((index * 13) % 8) / 40;
  return `--x: ${x}px; --row: ${log.row}; --rot: ${rot}deg; --tint: ${tint};`;
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
        <button class="tray-btn tray-profile" data-tray-action="profile" data-friend="${f.id}">
          <span class="tray-icon">◉</span>Profile
        </button>
        <button class="tray-btn tray-mute" data-tray-action="${f.muted ? "unmute" : "mute"}" data-friend="${f.id}">
          <span class="tray-icon">${f.muted ? "🔔" : "🔕"}</span>${f.muted ? "Unmute" : "Mute"}
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
        <div class="sheet-title">Start a Woodpile</div>
        <form id="group-form" autocomplete="off">
          <div class="sheet-field">
            <div class="field-label">Pile name</div>
            <input class="field-input" name="name" maxlength="40" placeholder="Friday Woodpile" />
          </div>
          <div class="group-empty">${friends.length ? "All eligible friends will be invited. Anyone already building a pile stays with theirs." : "You can start solo and invite friends later."}</div>
          <div class="sheet-error">${escHtml(state.groupError)}</div>
          <button class="btn-primary" type="submit">Start pile</button>
        </form>
      </div>
    </div>
  `;
}

function groupInviteSheetHtml(groups) {
  const group = groups.find((candidate) => candidate.id === state.groupInviteGroupId);
  const friends = group?.inviteableFriends || [];
  return `
    <div class="sheet-overlay" id="group-invite-sheet-overlay">
      <div class="sheet" id="group-invite-sheet">
        <div class="sheet-title">Invite friends</div>
        <form id="group-invite-form" autocomplete="off">
          <div class="group-empty">
            ${friends.length
              ? `Invite ${friends.length} eligible friend${friends.length === 1 ? "" : "s"} to ${escHtml(group.name)}.`
              : "No eligible friends are free to join this pile."}
          </div>
          ${friends.length ? `
            <div class="group-picker">
              ${friends.map((friend) => `
                <label class="group-choice">
                  <input type="checkbox" name="memberIds" value="${escHtml(friend.id)}" checked />
                  <span>${escHtml(friend.username)}</span>
                </label>
              `).join("")}
            </div>
          ` : ""}
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
  const { api, ensureAdminData, mutate, openHistory, openProfile, refreshPushStatus, render, saveHomeTab, subscribePush } = ctx;
  bindNotifications(ctx);

  document.querySelectorAll("[data-home-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      saveHomeTab(btn.dataset.homeTab);
      if (btn.dataset.homeTab === "settings") render();
      else renderHome(ctx);
    });
  });

  document.querySelectorAll("[data-achievement-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.achievementTab = btn.dataset.achievementTab === "group" ? "group" : "individual";
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
    state.showAddSheet = true;
    state.addError = "";
    renderHome(ctx);
    setTimeout(() => document.querySelector("#add-input")?.focus(), 50);
  });

  document.querySelector("[data-action='add-group']")?.addEventListener("click", () => {
    state.showGroupSheet = true;
    state.groupError = "";
    renderHome(ctx);
    setTimeout(() => document.querySelector("#group-sheet input")?.focus(), 50);
  });

  document.querySelector("[data-action='dismiss-group-migration']")?.addEventListener("click", async () => {
    await mutate("/api/groups/migration-notice/read");
  });

  document.querySelector("[data-action='dismiss-group-tutorial']")?.addEventListener("click", async () => {
    await mutate("/api/groups/tutorial/read");
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
  document.querySelector("#group-invite-sheet-overlay")?.addEventListener("click", (e) => {
    if (e.target.id === "group-invite-sheet-overlay") {
      state.showGroupInviteSheet = false;
      state.groupInviteGroupId = null;
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
    try {
      state.data = await api("/api/groups", {
        method: "POST",
        body: { name: form.get("name") },
      });
      state.error = "";
      state.showGroupSheet = false;
      render();
    } catch (err) {
      state.groupError = humanErr(err.message);
      document.querySelector("#group-sheet .sheet-error").textContent = state.groupError;
    }
  });
  document.querySelectorAll("[data-invite-group-target]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      state.showGroupInviteSheet = true;
      state.groupInviteGroupId = btn.dataset.inviteGroupTarget;
      state.groupError = "";
      renderHome(ctx);
    });
  });
  document.querySelector("#group-invite-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const memberIds = new FormData(e.currentTarget).getAll("memberIds").map(String);
    try {
      state.data = await api(`/api/groups/${state.groupInviteGroupId}/invites`, {
        method: "POST",
        body: { memberIds },
      });
      state.error = "";
      state.showGroupInviteSheet = false;
      state.groupInviteGroupId = null;
      render();
    } catch (err) {
      state.groupError = humanErr(err.message);
      document.querySelector("#group-invite-sheet .sheet-error").textContent = state.groupError;
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
      const pile = card.closest(".woodpile-card");
      pile?.classList.add("wood-sent");
      pile?.addEventListener("animationend", () => pile.classList.remove("wood-sent"), { once: true });
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
      } else if (action === "profile") {
        openProfile(friendId);
      } else {
        mutate(`/api/friends/${friendId}/${action}`);
      }
    });
  });

  document.querySelectorAll(".friend-card:not(.group-card)").forEach((card) => {
    bindFriendCard(card, { mutate });
  });
}
