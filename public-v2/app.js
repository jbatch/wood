import { api } from "./api.js";
import { refreshPushStatus, subscribePush } from "./push.js";
import { state } from "./state.js";
import { restoreTabs, saveAdminTab, saveHomeTab } from "./tabs.js";
import { humanErr } from "./utils.js";
import { ensureAdminData, renderAdmin } from "./views/admin.js";
import { renderAuth } from "./views/auth.js";
import { renderHome } from "./views/home.js";
import { openHistory, renderHistory, scrollHistoryToBottom } from "./views/history.js";

const app = document.querySelector("#app");
const APP_POLL_INTERVAL_MS = 60000;
let toastTimer = null;
let pollingEventsBound = false;
let lastReturnRefreshAt = 0;

const ctx = {
  app,
  api,
  ensureAdminData,
  humanErr,
  loadApp,
  logout,
  mutate,
  openHistory: (friendId) => openHistory(ctx, friendId),
  refreshPushStatus,
  render,
  renderHome: () => renderHome(ctx),
  saveAdminTab,
  saveHomeTab,
  showToast,
  startPolling,
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
    restoreTabs();
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
  if (!state.session?.user) {
    renderAuth(ctx);
    return;
  }
  if (location.pathname === "/admin" && state.data?.user.role === "admin") {
    renderAdmin(ctx);
    return;
  }
  if (state.view === "history") {
    renderHistory(ctx);
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
  state.pollTimer = setInterval(poll, APP_POLL_INTERVAL_MS);
  bindPollingEvents();
}

function stopPolling() {
  clearInterval(state.pollTimer);
  state.pollTimer = null;
}

async function poll() {
  if (
    state.polling ||
    !state.session?.user ||
    document.visibilityState === "hidden"
  ) return;
  state.polling = true;
  try {
    await refreshCurrentData();
    state.error = "";
    await refreshPushStatus();
    if (location.pathname === "/admin") render();
    else if (state.view === "home") render();
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

async function refreshCurrentData() {
  state.data = await api("/api/app");
  if (location.pathname === "/admin" && state.data.user.role === "admin") {
    state.admin = await api("/api/admin");
    state.debug = await api("/api/admin/debug");
  }
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
  if (state.data && state.view === "home") render();
}, 60000);
