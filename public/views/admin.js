import { api } from "../api.js";
import { state } from "../state.js";
import { restoreScrollPosition, saveScrollPosition } from "../ui/scrollState.js";
import { copyText, escHtml, formatDate, humanErr, without } from "../utils.js";

export async function ensureAdminData() {
  if (state.data?.user?.role !== "admin") return;
  if (!state.admin) state.admin = await api("/api/admin");
  if (!state.debug) state.debug = await api("/api/admin/debug");
}

export function renderAdmin(ctx) {
  const { app, render, renderHome } = ctx;
  saveScrollPosition();
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

  const scrollKey = `admin:${state.adminTab}`;
  app.innerHTML = `
    <div class="shell admin-shell">
      <header class="app-header">
        <div class="app-wordmark"><span>W</span>ood Admin</div>
        <div class="header-actions">
          <button class="icon-btn" data-route="/" title="App">⌂</button>
          <button class="icon-btn" id="logout-btn" title="Log out">↩</button>
        </div>
      </header>
      <div class="scroll-content admin-content" data-scroll-key="${scrollKey}">
        ${state.error ? `<div class="error-banner">${escHtml(state.error)}</div>` : ""}
        ${adminPanelHtml()}
      </div>
      ${adminNavHtml()}
    </div>
  `;
  bindAdmin(ctx);
  restoreScrollPosition(scrollKey);
}

function adminPanelHtml() {
  if (state.adminTab === "invites") return adminInvitesHtml();
  if (state.adminTab === "users") return adminUsersHtml();
  if (state.adminTab === "groups") return adminGroupsHtml();
  if (state.adminTab === "achievements") return adminAchievementsHtml();
  if (state.adminTab === "bugs") return adminBugsHtml();
  if (state.adminTab === "debug") return adminDebugHtml();
  return adminOverviewHtml();
}

function adminNavHtml() {
  const tabs = [
    ["overview", "●", "Overview"],
    ["invites", "＋", "Invites"],
    ["users", "◆", "Users"],
    ["groups", "◎", "Groups"],
    ["achievements", "◇", "Ach"],
    ["bugs", "!", "Bugs"],
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
      <label class="toggle-row compact-toggle">
        <span>
          <strong>Reusable link</strong>
          <small>Can create multiple accounts until it expires</small>
        </span>
        <input name="reusable" type="checkbox" />
      </label>
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
      <div class="admin-actions invite-actions">
        <button class="chip-btn accent" data-copy-invite="${escHtml(invite.url)}">Copy</button>
        ${["unused", "reusable"].includes(invite.status) ? `<button class="chip-btn" data-invite="${invite.id}">Revoke</button>` : ""}
      </div>
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
        <div class="admin-status-row">
          ${userInstallChipHtml(user)}
          ${userPushChipHtml(user)}
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
      ${passwordResetLinkHtml(user)}
      <div class="admin-actions">
        <button class="chip-btn accent" data-user="${user.id}" data-admin-action="test-push">Push</button>
        <button class="chip-btn" data-password-reset="${user.id}" data-reset-name="${escHtml(user.username)}">Reset link</button>
        <button class="chip-btn danger-chip" data-reset-achievements="${user.id}" data-reset-name="${escHtml(user.username)}" ${user.achievements_earned ? "" : "disabled"}>Reset achievements</button>
        <button class="chip-btn" data-user="${user.id}" data-admin-action="${user.suspended ? "unsuspend" : "suspend"}">${user.suspended ? "Unsuspend" : "Suspend"}</button>
        <button class="chip-btn" data-user="${user.id}" data-admin-action="${user.role === "admin" ? "demote" : "promote"}">${user.role === "admin" ? "Demote" : "Promote"}</button>
      </div>
    </div>
  `;
}

function passwordResetLinkHtml(user) {
  const reset = state.passwordResetLink;
  if (!reset || reset.userId !== user.id) return "";
  return `
    <div class="reset-link-box">
      <div>
        <strong>Password reset link</strong>
        <span>Expires ${formatDate(reset.expiresAt)}</span>
      </div>
      <button class="chip-btn accent" data-copy-reset-link="${escHtml(reset.link)}">Copy</button>
      <input class="reset-link-input" value="${escHtml(reset.link)}" readonly aria-label="Password reset link" />
    </div>
  `;
}

function userInstallChipHtml(user) {
  const installed = Boolean(user.pwa_installed);
  const label = installed ? "PWA seen" : "No PWA yet";
  const detail = installed
    ? `Last opened ${formatDate(user.pwa_last_seen_at || user.pwa_installed_at)}`
    : "No standalone launch seen";
  const mode = user.pwa_display_mode && user.pwa_display_mode !== "unknown"
    ? ` · ${user.pwa_display_mode}`
    : "";
  return `
    <span class="status-chip ${installed ? "ok" : ""}" title="${escHtml(detail)}${escHtml(mode)}">
      <span class="status-dot"></span>
      ${label}
    </span>
  `;
}

function userPushChipHtml(user) {
  const count = Number(user.push_subscription_count || 0);
  const label = count ? `Push ${count}` : "No push";
  const detail = count
    ? `${count} push subscription${count === 1 ? "" : "s"} saved`
    : "No push subscription saved";
  return `
    <span class="status-chip ${count ? "ok" : ""}" title="${escHtml(detail)}">
      <span class="status-dot"></span>
      ${label}
    </span>
  `;
}

function adminGroupsHtml() {
  const groups = state.admin.groups || [];
  return `
    <div class="section-head">Groups</div>
    <div class="admin-list">
      ${groups.length ? groups.map(adminGroupCardHtml).join("") : `<div class="empty-state small-empty"><p>No groups yet</p></div>`}
    </div>
  `;
}

function adminGroupCardHtml(group) {
  const stage = group.stats?.stage;
  return `
    <div class="admin-card user-card">
      <div class="admin-card-main">
        <div class="admin-title">${escHtml(group.name)} ${group.dissolved_at ? `<span class="role-chip">dissolved</span>` : ""}</div>
        <div class="admin-sub">${group.members.map((member) => escHtml(member.username)).join(", ") || "No members"}</div>
        <div class="admin-meta">
          ${group.members.length} members · ${group.pendingMembers.length} pending · ${group.stats.woods_sent} Woods · ${escHtml(stage?.name || "No tier")}
        </div>
      </div>
      ${group.dissolved_at ? "" : adminGroupToolsHtml(group)}
      <div class="admin-actions">
        ${group.dissolved_at ? "" : `<button class="chip-btn danger-chip" data-dissolve-group="${group.id}">Dissolve</button>`}
      </div>
    </div>
  `;
}

function adminGroupToolsHtml(group) {
  const tiers = state.data?.groupSystem?.tiers || [];
  const currentIndex = tiers.findIndex((tier) => tier.name === group.stats?.stage?.name);
  return `
    <div class="woodpile-admin-tools admin-group-tools">
      <div class="woodpile-admin-title">Pile tools</div>
      <label class="woodpile-admin-select">
        <span>Current tier</span>
        <select class="field-input" data-admin-group-tier="${escHtml(group.id)}">
          ${tiers.map((tier, index) => `
            <option value="${index}" ${index === currentIndex ? "selected" : ""}>
              ${escHtml(tier.name)} (${tier.minWood}+)
            </option>
          `).join("")}
        </select>
      </label>
      <div class="woodpile-admin-actions">
        <button class="chip-btn" type="button" data-admin-grant-wood="${escHtml(group.id)}">Give me 999 Wood</button>
        <button class="chip-btn" type="button" data-admin-reset-cooldown="${escHtml(group.id)}">Reset my cooldown</button>
      </div>
    </div>
  `;
}

function adminAchievementsHtml() {
  const achievements = state.admin.achievement_stats || [];
  const selected = achievements.find((achievement) => achievement.slug === state.adminAchievementSlug);
  if (selected) return adminAchievementDetailHtml(selected);
  return `
    <div class="section-head">Achievements</div>
    <div class="admin-list">
      ${achievements.map(achievementStatCardHtml).join("")}
    </div>
  `;
}

function achievementStatCardHtml(achievement) {
  const hidden = achievement.secret ? "secret" : achievement.category || "individual";
  return `
    <button class="admin-card admin-card-button achievement-stat-card" type="button" data-achievement-detail="${escHtml(achievement.slug)}">
      <div class="achievement-icon small-icon">${escHtml(achievement.icon)}</div>
      <div class="admin-card-main">
        <div class="admin-title">${escHtml(achievement.name)}</div>
        <div class="admin-sub">${escHtml(achievement.description)}</div>
        <div class="admin-meta">${achievement.earned_count || 0} earned · ${escHtml(hidden)}</div>
      </div>
    </button>
  `;
}

function adminAchievementDetailHtml(achievement) {
  return `
    <div class="section-head with-back">
      <button class="chip-btn" type="button" data-achievement-back>Back</button>
      <span>${escHtml(achievement.name)}</span>
    </div>
    <div class="admin-card achievement-detail-card">
      <div class="achievement-icon">${escHtml(achievement.icon)}</div>
      <div class="admin-card-main">
        <div class="admin-title">${escHtml(achievement.name)}</div>
        <div class="admin-sub">${escHtml(achievement.description)}</div>
        <div class="admin-meta">${achievement.earned_count || 0} users have this</div>
      </div>
    </div>
    <div class="admin-list">
      ${achievement.users?.length ? achievement.users.map((user) => `
        <div class="admin-card compact-admin-card">
          <div class="admin-card-main">
            <div class="admin-title">${escHtml(user.username)}</div>
            <div class="admin-meta">Earned ${formatDate(user.earned_at)}</div>
          </div>
        </div>
      `).join("") : `<div class="empty-state small-empty"><p>No one has this yet</p></div>`}
    </div>
  `;
}

function adminBugsHtml() {
  const reports = state.admin.bug_reports || [];
  const open = reports.filter((report) => report.status === "open");
  const closed = reports.filter((report) => report.status !== "open");
  return `
    <div class="section-head">Open Bugs</div>
    <div class="admin-list">
      ${open.length ? open.map(bugReportCardHtml).join("") : `<div class="empty-state small-empty"><p>No open bugs. Suspicious.</p></div>`}
    </div>
    <div class="section-head">Closed Bugs</div>
    <div class="admin-list">
      ${closed.length ? closed.slice(0, 30).map(bugReportCardHtml).join("") : `<div class="empty-state small-empty"><p>No closed bugs yet</p></div>`}
    </div>
  `;
}

function bugReportCardHtml(report) {
  const reporter = report.user || {};
  const isOpen = report.status === "open";
  const blocked = Boolean((state.admin.users || []).find((user) => user.id === reporter.id)?.bug_reports_blocked_at);
  return `
    <div class="admin-card bug-report-card">
      <div class="admin-card-main">
        <div class="admin-title">
          ${escHtml(reporter.username || "unknown")}
          <span class="role-chip">${escHtml(report.status)}</span>
        </div>
        <div class="bug-report-text">${escHtml(report.text)}</div>
        <div class="admin-meta">
          Filed ${formatDate(report.created_at)}
          ${report.closed_at ? ` · closed ${formatDate(report.closed_at)} by ${escHtml(report.closed_by?.username || "unknown")}` : ""}
        </div>
      </div>
      <div class="admin-actions">
        ${isOpen ? `
          <button class="chip-btn accent" type="button" data-close-bug="${escHtml(report.id)}" data-bug-status="legitimate">Legit</button>
          <button class="chip-btn" type="button" data-close-bug="${escHtml(report.id)}" data-bug-status="not_bug">Not bug</button>
        ` : ""}
        ${reporter.id ? `
          <button class="chip-btn danger-chip" type="button" data-bug-user="${escHtml(reporter.id)}" data-bug-user-action="${blocked ? "unblock" : "block"}">
            ${blocked ? "Allow bugs" : "Block bugs"}
          </button>
        ` : ""}
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

function bindAdmin(ctx) {
  const { loadApp, logout, render, saveAdminTab } = ctx;
  document.querySelector("#logout-btn")?.addEventListener("click", logout);
  document.querySelector("[data-route='/']")?.addEventListener("click", () => {
    history.pushState(null, "", "/");
    state.view = "home";
    render();
  });
  document.querySelectorAll("[data-admin-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.adminTab !== "achievements") state.adminAchievementSlug = "";
      saveAdminTab(btn.dataset.adminTab);
      renderAdmin(ctx);
    });
  });
  document.querySelectorAll("[data-achievement-detail]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.adminAchievementSlug = btn.dataset.achievementDetail;
      renderAdmin(ctx);
    });
  });
  document.querySelector("[data-achievement-back]")?.addEventListener("click", () => {
    state.adminAchievementSlug = "";
    renderAdmin(ctx);
  });
  document.querySelector("[data-action='refresh-debug']")?.addEventListener("click", async () => {
    state.debug = await api("/api/admin/debug");
    renderAdmin(ctx);
  });
  document.querySelector("[data-action='clear-push']")?.addEventListener("click", async () => {
    state.admin = await api("/api/admin/push-subscriptions/clear", { method: "POST" });
    state.debug = await api("/api/admin/debug");
    renderAdmin(ctx);
  });
  document.querySelector("#invite-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    payload.reusable = payload.reusable === "on";
    await api("/api/admin/invites", { method: "POST", body: payload });
    state.admin = await api("/api/admin");
    renderAdmin(ctx);
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
    renderAdmin(ctx);
  });
  document.querySelectorAll("[data-invite]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      state.admin = await api(`/api/admin/invites/${btn.dataset.invite}/revoke`, { method: "POST" });
      renderAdmin(ctx);
    });
  });
  document.querySelectorAll("[data-copy-invite]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await copyText(btn.dataset.copyInvite);
      state.error = "Invite link copied";
      renderAdmin(ctx);
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
      renderAdmin(ctx);
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
      renderAdmin(ctx);
    });
  });
  document.querySelectorAll("[data-password-reset]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const userId = btn.dataset.passwordReset;
      const name = btn.dataset.resetName || "user";
      const response = await api(`/api/admin/users/${userId}/password-reset`, { method: "POST" });
      state.admin = response.admin;
      state.passwordResetLink = {
        userId,
        username: name,
        link: response.link,
        expiresAt: response.expires_at,
      };
      await copyText(response.link);
      state.error = `Reset link copied for ${name}`;
      renderAdmin(ctx);
    });
  });
  document.querySelectorAll("[data-copy-reset-link]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await copyText(btn.dataset.copyResetLink);
      state.error = "Reset link copied";
      renderAdmin(ctx);
    });
  });
  document.querySelectorAll("[data-close-bug]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      state.admin = await api(`/api/admin/bug-reports/${btn.dataset.closeBug}/close`, {
        method: "POST",
        body: { status: btn.dataset.bugStatus },
      });
      await loadApp();
      renderAdmin(ctx);
    });
  });
  document.querySelectorAll("[data-bug-user]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      state.admin = await api(`/api/admin/users/${btn.dataset.bugUser}/bug-reports/${btn.dataset.bugUserAction}`, {
        method: "POST",
      });
      await loadApp();
      renderAdmin(ctx);
    });
  });
  document.querySelectorAll("[data-reset-achievements]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const userId = btn.dataset.resetAchievements;
      const name = btn.dataset.resetName || "this user";
      if (!confirm(`Reset all achievements for ${name}?`)) return;
      state.admin = await api(`/api/admin/users/${userId}/achievements/reset`, { method: "POST" });
      await loadApp();
      state.error = `Reset achievements for ${name}`;
      renderAdmin(ctx);
    });
  });
  document.querySelectorAll("[data-dissolve-group]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      state.admin = await api(`/api/admin/groups/${btn.dataset.dissolveGroup}/dissolve`, { method: "POST" });
      await loadApp();
      renderAdmin(ctx);
    });
  });
  document.querySelectorAll("[data-admin-group-tier]").forEach((select) => {
    select.addEventListener("change", async () => {
      const response = await api(`/api/admin/groups/${select.dataset.adminGroupTier}/tier`, {
        method: "POST",
        body: { tierIndex: Number(select.value) },
      });
      state.admin = response.admin;
      state.data = response.app;
      renderAdmin(ctx);
    });
  });
  document.querySelectorAll("[data-admin-grant-wood]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const response = await api(`/api/admin/groups/${btn.dataset.adminGrantWood}/grant-wood`, {
        method: "POST",
        body: { amount: 999 },
      });
      state.admin = response.admin;
      state.data = response.app;
      state.error = "Added 999 test Wood to your sockpile";
      renderAdmin(ctx);
    });
  });
  document.querySelectorAll("[data-admin-reset-cooldown]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const response = await api(`/api/admin/groups/${btn.dataset.adminResetCooldown}/reset-my-cooldown`, {
        method: "POST",
      });
      state.admin = response.admin;
      state.data = response.app;
      state.error = "Reset your group deposit cooldown";
      renderAdmin(ctx);
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
      renderAdmin(ctx);
    });
  });
}
