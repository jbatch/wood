import { state } from "../state.js";
import { escHtml, humanErr } from "../utils.js";
import { bindNotifications, notificationButtonHtml, notificationSheetHtml } from "./notifications.js";

export async function openSettings(ctx) {
  ctx.saveHomeTab?.("settings");
  state.view = "home";
  state.settingsError = "";
  state.settingsNotice = "";
  ctx.render();
}

export function renderSettings(ctx) {
  const { app, logout, render } = ctx;
  const settings = state.data?.settings || {};
  app.innerHTML = `
    <div class="shell">
      <header class="app-header">
        <div class="app-wordmark"><span>W</span>ood</div>
        <div class="header-actions">
          ${notificationButtonHtml()}
        </div>
      </header>
      <div class="scroll-content profile-scroll">
        ${accountPanel()}
        ${passwordPanel()}
        ${notificationsPanel(settings)}
        ${mutedPanel(settings.mutedFriends || [])}
        <section class="profile-panel">
          <div class="field-label">Highly questionable extras</div>
          <button class="profile-action" type="button" id="super-wood-btn">Buy Super Wood</button>
          <button class="profile-action" type="button" id="bug-btn">Report a bug</button>
          <button class="profile-action danger" type="button" id="logout-btn">Log out</button>
        </section>
        ${state.settingsError ? `<div class="error-banner">${escHtml(state.settingsError)}</div>` : ""}
        ${state.settingsNotice ? `<div class="profile-notice settings-notice">${escHtml(state.settingsNotice)}</div>` : ""}
      </div>
      ${settingsNavHtml()}
      ${notificationSheetHtml()}
    </div>
  `;

  bindNotifications(ctx);
  document.querySelector("#logout-btn")?.addEventListener("click", logout);
  document.querySelector("#bug-btn")?.addEventListener("click", async () => {
    await recordSettingsBit(ctx, "bug_report_submitted", "Bug report filed with absolutely no form.");
  });
  document.querySelector("#super-wood-btn")?.addEventListener("click", async () => {
    await recordSettingsBit(ctx, "super_wood_declined", "Transaction declined. Super Wood remains theoretical.");
  });
  document.querySelector("[data-self-profile]")?.addEventListener("click", () => {
    ctx.openProfile(state.data.user.id);
  });
  document.querySelectorAll("[data-home-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      ctx.saveHomeTab(btn.dataset.homeTab);
      state.settingsError = "";
      state.settingsNotice = "";
      render();
    });
  });
  document.querySelector("[data-route='/admin']")?.addEventListener("click", async () => {
    history.pushState(null, "", "/admin");
    await ctx.ensureAdminData();
    render();
  });
  document.querySelector("#password-form")?.addEventListener("submit", async (event) => {
    await updatePassword(ctx, event);
  });
  document.querySelectorAll("[data-snooze]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await updateSnooze(ctx, btn.dataset.snooze);
    });
  });
  document.querySelector("[data-remove-device]")?.addEventListener("click", async () => {
    await removeDevice(ctx);
  });
  document.querySelectorAll("[data-unmute]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await unmuteFriend(ctx, btn.dataset.unmute);
    });
  });
}

async function recordSettingsBit(ctx, type, notice) {
  const { api, render } = ctx;
  try {
    state.data = await api("/api/achievement-events", {
      method: "POST",
      body: { type },
    });
    state.settingsError = "";
    state.settingsNotice = notice;
    render();
  } catch (err) {
    state.settingsError = humanErr(err.message);
    state.settingsNotice = "";
    render();
  }
}

function settingsNavHtml() {
  const isAdmin = state.data?.user?.role === "admin";
  return `
    <nav class="bottom-tabs" aria-label="Main">
      <button class="tab-btn" data-home-tab="friends">
        <span class="tab-icon">●</span><span>Friends</span>
      </button>
      <button class="tab-btn" data-home-tab="stats">
        <span class="tab-icon">◆</span><span>Stats</span>
      </button>
      <button class="tab-btn" data-home-tab="groups">
        <span class="tab-icon">◎</span><span>Groups</span>
      </button>
      <button class="tab-btn active" data-home-tab="settings">
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

function accountPanel() {
  const user = state.data?.user || {};
  const profile = state.data?.profile || {};
  return `
    <section class="profile-panel">
      <div class="field-label">Account</div>
      <div class="profile-detail">
        <span>Username</span>
        <strong>${escHtml(user.username)}</strong>
      </div>
      <div class="profile-detail">
        <span>Member since</span>
        <strong>${escHtml(memberSince(profile.memberSince))}</strong>
      </div>
      <button class="profile-action" type="button" data-self-profile>Edit public profile</button>
    </section>
  `;
}

function passwordPanel() {
  return `
    <form class="profile-panel profile-form password-form" id="password-form" autocomplete="off">
      <div class="field-label">Password</div>
      <label class="profile-field">
        <span>Current password</span>
        <input class="field-input" name="currentPassword" type="password" autocomplete="current-password" required />
      </label>
      <label class="profile-field">
        <span>New password</span>
        <input class="field-input" name="newPassword" type="password" autocomplete="new-password" minlength="8" required />
      </label>
      <label class="profile-field">
        <span>Confirm new password</span>
        <input class="field-input" name="confirmPassword" type="password" autocomplete="new-password" minlength="8" required />
      </label>
      <button class="btn-primary" type="submit">Change password</button>
    </form>
  `;
}

function notificationsPanel(settings) {
  const snoozedUntil = settings.notificationSnoozedUntil;
  return `
    <section class="profile-panel">
      <div class="field-label">Notifications</div>
      <div class="profile-detail">
        <span>Push</span>
        <strong>${escHtml(state.pushStatus?.label || "Unknown")}</strong>
      </div>
      <div class="profile-detail">
        <span>Snooze</span>
        <strong>${escHtml(snoozeLabel(snoozedUntil))}</strong>
      </div>
      <div class="settings-grid">
        <button class="profile-action" type="button" data-snooze="1h">1 hour</button>
        <button class="profile-action" type="button" data-snooze="8h">8 hours</button>
        <button class="profile-action" type="button" data-snooze="tomorrow">Tomorrow</button>
        <button class="profile-action" type="button" data-snooze="forever">Until on</button>
      </div>
      ${snoozedUntil ? `<button class="profile-action" type="button" data-snooze="off">Turn notifications back on</button>` : ""}
      <button class="profile-action" type="button" data-remove-device>Remove this device</button>
    </section>
  `;
}

function mutedPanel(mutedFriends) {
  return `
    <section class="profile-panel">
      <div class="field-label">Muted friends</div>
      ${mutedFriends.length ? mutedFriends.map((friend) => `
        <div class="settings-row">
          <strong>${escHtml(friend.username)}</strong>
          <button class="mini-action" type="button" data-unmute="${escHtml(friend.id)}">Unmute</button>
        </div>
      `).join("") : `<p class="settings-empty">No one is muted. Everyone may approach the Wood.</p>`}
    </section>
  `;
}

async function updateSnooze(ctx, notificationSnooze) {
  const { api, render } = ctx;
  try {
    state.data = await api("/api/settings", {
      method: "PATCH",
      body: { notificationSnooze },
    });
    state.settingsError = "";
    render();
  } catch (err) {
    state.settingsError = humanErr(err.message);
    render();
  }
}

async function updatePassword(ctx, event) {
  event.preventDefault();
  const { api, render } = ctx;
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());
  if (payload.newPassword !== payload.confirmPassword) {
    state.settingsError = "New passwords do not match";
    state.settingsNotice = "";
    render();
    return;
  }
  try {
    state.data = await api("/api/password", {
      method: "POST",
      body: {
        currentPassword: payload.currentPassword,
        newPassword: payload.newPassword,
      },
    });
    form.reset();
    state.settingsError = "";
    state.settingsNotice = "Password changed";
    render();
  } catch (err) {
    state.settingsError = humanErr(err.message);
    state.settingsNotice = "";
    render();
  }
}

async function removeDevice(ctx) {
  const { api, refreshPushStatus, render } = ctx;
  try {
    const reg = await navigator.serviceWorker?.ready;
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    const endpoint = sub?.endpoint || "";
    if (sub) await sub.unsubscribe();
    await api("/api/push-subscriptions", {
      method: "DELETE",
      body: endpoint ? { endpoint } : {},
    });
    await refreshPushStatus();
    state.settingsError = "";
    render();
  } catch (err) {
    state.settingsError = humanErr(err.message);
    render();
  }
}

async function unmuteFriend(ctx, friendId) {
  const { api, render } = ctx;
  try {
    state.data = await api(`/api/friends/${friendId}/unmute`, { method: "POST" });
    state.settingsError = "";
    render();
  } catch (err) {
    state.settingsError = humanErr(err.message);
    render();
  }
}

function snoozeLabel(iso) {
  if (!iso) return "On";
  if (iso.startsWith("9999-")) return "Snoozed until turned back on";
  return `Snoozed until ${new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

function memberSince(iso) {
  if (!iso) return "the beginning";
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}
