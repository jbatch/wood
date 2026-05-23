import { state } from "../state.js";
import { escHtml, humanErr } from "../utils.js";

export async function openSettings(ctx) {
  state.view = "settings";
  state.settingsError = "";
  ctx.render();
}

export function renderSettings(ctx) {
  const { app, logout, render } = ctx;
  const settings = state.data?.settings || {};
  app.innerHTML = `
    <div class="shell">
      <header class="app-header">
        <div class="header-left">
          <button class="back-btn" id="back-btn">← Back</button>
        </div>
        <div class="app-wordmark" style="font-size:17px">Settings</div>
        <div class="header-actions"></div>
      </header>
      <div class="scroll-content profile-scroll">
        ${accountPanel()}
        ${notificationsPanel(settings)}
        ${mutedPanel(settings.mutedFriends || [])}
        <section class="profile-panel">
          <button class="profile-action" type="button" id="bug-btn">Report a bug</button>
          <button class="profile-action danger" type="button" id="logout-btn">Log out</button>
        </section>
        ${state.settingsError ? `<div class="error-banner">${escHtml(state.settingsError)}</div>` : ""}
      </div>
    </div>
  `;

  document.querySelector("#back-btn")?.addEventListener("click", () => {
    state.view = "home";
    state.settingsError = "";
    render();
  });
  document.querySelector("#logout-btn")?.addEventListener("click", logout);
  document.querySelector("#bug-btn")?.addEventListener("click", () => {
    state.settingsError = "Bug reports are still a stump with a clipboard.";
    renderSettings(ctx);
  });
  document.querySelector("[data-self-profile]")?.addEventListener("click", () => {
    ctx.openProfile(state.data.user.id);
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

async function removeDevice(ctx) {
  const { api, refreshPushStatus, render } = ctx;
  try {
    const reg = await navigator.serviceWorker?.ready;
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) await sub.unsubscribe();
    await api("/api/push-subscriptions", { method: "DELETE" });
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
