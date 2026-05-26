import { api, markMileHighWoodAttempt } from "./api.js";
import { refreshPushStatus, subscribePush } from "./push.js";
import { state } from "./state.js";
import { restoreTabs, saveAdminTab, saveHomeTab } from "./tabs.js";
import { humanErr } from "./utils.js";
import { ensureAdminData, renderAdmin } from "./views/admin.js";
import { renderAuth } from "./views/auth.js";
import { renderHome } from "./views/home.js";
import { openHistory, renderHistory } from "./views/history.js";
import { openProfile, renderProfile } from "./views/profile.js";
import { openSettings, renderSettings } from "./views/settings.js";

const app = document.querySelector("#app");
const APP_POLL_INTERVAL_MS = 60000;
let toastTimer = null;
let pollingEventsBound = false;
let lastReturnRefreshAt = 0;
let pendingInstallReport = false;

const ctx = {
  app,
  api,
  ensureAdminData,
  humanErr,
  loadApp,
  logout,
  mutate,
  openHistory: (friendId) => openHistory(ctx, friendId),
  openProfile: (userId) => openProfile(ctx, userId),
  openSettings: () => openSettings(ctx),
  refreshPushStatus,
  render,
  renderHome: () => renderHome(ctx),
  reportClientStatus,
  saveAdminTab,
  saveHomeTab,
  showToast,
  startPolling,
  startRealtime,
  subscribePush,
};

init();

async function init() {
  if ("serviceWorker" in navigator) {
    const reg = await navigator.serviceWorker.register("/sw.js");
    reg.update();
  }
  state.session = await api("/api/session");
  if (state.session.user) {
    reportClientStatus();
    restoreTabs();
    await loadApp();
    startPolling();
    startRealtime();
  }
  render();
}

window.addEventListener("appinstalled", () => {
  pendingInstallReport = true;
  reportClientStatus({ installed: true, source: "appinstalled" });
});

function reportClientStatus(extra = {}) {
  if (!state.session?.user) return;
  const displayMode = currentDisplayMode();
  const installed = Boolean(extra.installed || pendingInstallReport || displayMode !== "browser");
  api("/api/client-status", {
    method: "POST",
    body: {
      displayMode,
      installed,
      source: extra.source || "startup",
    },
  })
    .then(() => {
      if (installed) pendingInstallReport = false;
    })
    .catch(() => {});
}

function currentDisplayMode() {
  if (window.navigator.standalone) return "standalone";
  const modes = ["window-controls-overlay", "fullscreen", "standalone", "minimal-ui"];
  return modes.find((mode) => window.matchMedia?.(`(display-mode: ${mode})`)?.matches) || "browser";
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
  state.deferredRender = false;
  if (location.pathname === "/reset-password") {
    renderAuth(ctx);
    return;
  }
  if (!state.session?.user) {
    renderAuth(ctx);
    return;
  }
  if (location.pathname === "/admin" && state.data?.user.role === "admin") {
    renderAdmin(ctx);
    return;
  }
  if (state.view === "home" && state.homeTab === "settings") {
    renderSettings(ctx);
    return;
  }
  if (state.view === "history") {
    renderHistory(ctx);
    return;
  }
  if (state.view === "profile") {
    renderProfile(ctx);
    return;
  }
  if (state.view === "settings") {
    renderSettings(ctx);
    return;
  }
  renderHome(ctx);
}

async function mutate(url, body = {}) {
  try {
    state.data = await api(url, { method: "POST", body });
    state.error = "";
    if (state.data.user.role === "admin") state.admin = await api("/api/admin");
    render();
  } catch (err) {
    if (/^\/api\/(friends|groups)\/[^/]+\/wood$/.test(url)) markMileHighWoodAttempt(err);
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
  state.passwordResetLink = null;
  state.notificationsData = null;
  state.notificationFreshIds = new Set();
  state.debug = null;
  state.profileUserId = null;
  state.profileData = null;
  state.showNotificationSheet = false;
  stopPolling();
  stopRealtime();
  history.replaceState(null, "", "/");
  render();
}

function startPolling() {
  if (state.pollTimer) return;
  state.pollTimer = setInterval(poll, APP_POLL_INTERVAL_MS);
  bindPollingEvents();
}

function stopPolling() {
  clearInterval(state.pollTimer);
  state.pollTimer = null;
}

function startRealtime() {
  if (state.realtime || !("EventSource" in window)) return;
  const source = new EventSource("/api/events");
  state.realtime = source;
  for (const eventName of [
    "app.changed",
    "wood.received",
    "friend_request.created",
    "group.invite.created",
    "group_wood.received",
    "achievement.unlocked",
  ]) {
    source.addEventListener(eventName, scheduleRealtimeRefresh);
  }
  source.addEventListener("error", () => {
    if (source.readyState === EventSource.CLOSED && state.realtime === source) {
      state.realtime = null;
    }
  });
}

function stopRealtime() {
  clearTimeout(state.realtimeRefreshTimer);
  state.realtimeRefreshTimer = null;
  if (state.realtime) {
    state.realtime.close();
    state.realtime = null;
  }
}

function scheduleRealtimeRefresh() {
  if (!state.session?.user || document.visibilityState === "hidden") return;
  clearTimeout(state.realtimeRefreshTimer);
  state.realtimeRefreshTimer = setTimeout(() => {
    state.realtimeRefreshTimer = null;
    poll();
  }, 150);
}

async function poll() {
  if (
    state.polling ||
    !state.session?.user ||
    document.visibilityState === "hidden"
  ) return;
  state.polling = true;
  try {
    const hadError = Boolean(state.error);
    const appChanged = await refreshCurrentData();
    state.error = "";
    const previousPushStatus = state.pushStatus;
    await refreshPushStatus();
    const pushChanged = !sameJson(previousPushStatus, state.pushStatus);
    const shouldRenderApp = appChanged || pushChanged || hadError;
    if (location.pathname === "/admin" && shouldRenderApp) autoRender();
    else if (state.view === "home" && shouldRenderApp) autoRender();
    if (state.view === "history" && state.historyFriendId) {
      const previousHistoryData = state.historyData;
      state.historyData = await api(`/api/friends/${state.historyFriendId}/woods`);
      if (shouldRenderApp || !sameJson(previousHistoryData, state.historyData)) autoRender();
    }
  } catch (err) {
    state.error = humanErr(err.message);
  } finally {
    state.polling = false;
  }
}

async function refreshCurrentData() {
  const previousData = state.data;
  state.data = await api("/api/app");
  let changed = !sameJson(previousData, state.data);
  if (location.pathname === "/admin" && state.data.user.role === "admin") {
    const previousAdmin = state.admin;
    const previousDebug = state.debug;
    state.admin = await api("/api/admin");
    state.debug = await api("/api/admin/debug");
    changed = changed
      || !sameJson(previousAdmin, state.admin)
      || !sameJson(previousDebug, state.debug);
  }
  return changed;
}

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function bindPollingEvents() {
  if (pollingEventsBound) return;
  pollingEventsBound = true;

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshAfterReturn();
  });
  window.addEventListener("focus", refreshAfterReturn);
  window.addEventListener("pageshow", refreshAfterReturn);
}

function refreshAfterReturn() {
  if (document.visibilityState === "hidden") return;
  const now = Date.now();
  if (now - lastReturnRefreshAt < 2000) return;
  lastReturnRefreshAt = now;
  poll();
}

function autoRender() {
  if (activeControl()) {
    state.deferredRender = true;
    return;
  }
  render();
}

function activeControl() {
  const active = document.activeElement;
  if (!active || active === document.body || !app.contains(active)) return null;
  return active.closest("input, select, textarea, [contenteditable='true']");
}

function flushDeferredRender() {
  if (!state.deferredRender) return;
  setTimeout(() => {
    if (state.deferredRender && !activeControl()) render();
  }, 0);
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

window.addEventListener("popstate", render);

setInterval(() => {
  if (state.data && state.view === "home") autoRender();
}, 60000);

document.addEventListener("focusout", flushDeferredRender);
document.addEventListener("change", flushDeferredRender);
