const app = document.querySelector("#app");
const state = {
  session: null,
  data: null,
  admin: null,
  debug: null,
  error: "",
  pushStatus: null,
};

init();

async function init() {
  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.register("/sw.js");
    registration.update();
  }
  state.session = await api("/api/session");
  if (state.session.user) {
    await loadApp();
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
    renderAuth();
    return;
  }
  const route = location.pathname;
  if (route === "/admin" && state.data?.user.role === "admin") {
    renderAdmin();
    return;
  }
  renderHome();
}

function renderAuth() {
  const params = new URLSearchParams(location.search);
  const invite = params.get("invite") || "";
  app.innerHTML = `
    <section class="auth">
      <div class="brand"><span class="brand-mark">W</span><span>Wood</span></div>
      <h1>${invite ? "Join" : "Log in"}</h1>
      <form class="panel stack" id="auth-form">
        ${
          invite
            ? `
          <label class="field">Invite
            <input name="inviteCode" value="${escapeHtml(invite)}" required />
          </label>
          <label class="field">Email
            <input name="email" type="email" autocomplete="email" required />
          </label>`
            : ""
        }
        <label class="field">Username
          <input name="username" autocomplete="username" required />
        </label>
        <label class="field">Password
          <input name="password" type="password" autocomplete="${invite ? "new-password" : "current-password"}" required />
        </label>
        <button class="primary" type="submit">${invite ? "Create account" : "Log in"}</button>
        <div class="error">${escapeHtml(state.error)}</div>
      </form>
    </section>
  `;
  document.querySelector("#auth-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    try {
      const response = await api(invite ? "/api/signup" : "/api/login", {
        method: "POST",
        body: payload,
      });
      state.session = { user: response.user, push: state.session?.push || {} };
      history.replaceState(null, "", "/");
      await loadApp();
      render();
    } catch (err) {
      state.error = humanError(err.message);
      renderAuth();
    }
  });
}

function renderHome() {
  const data = state.data;
  app.innerHTML = `
    <section class="shell">
      ${topbar()}
      <form class="inline-form" id="friend-form">
        <input name="username" placeholder="exact username" aria-label="Exact username" required />
        <button class="primary" type="submit">Add</button>
      </form>
      <div class="error">${escapeHtml(state.error)}</div>
      <div class="meta" id="push-debug"></div>
      ${requests(data)}
      <h2 class="section-title">Friends</h2>
      <div class="grid">
        ${
          data.friends.length
            ? data.friends.map(friendRow).join("")
            : `<div class="empty">No friends yet.</div>`
        }
      </div>
    </section>
  `;
  bindHome();
  renderLocalPushDebug();
}

function topbar() {
  const user = state.data.user;
  return `
    <header class="topbar">
      <div class="brand"><span class="brand-mark">W</span><span>${escapeHtml(user.username)}</span></div>
      <div class="actions">
        ${
          user.role === "admin"
            ? `<button class="ghost" data-route="/admin">Admin</button>`
            : ""
        }
        ${pushButton()}
        ${resetPushButton()}
        <button class="ghost" data-action="logout">Log out</button>
      </div>
    </header>
  `;
}

function pushButton() {
  const status = state.pushStatus;
  if (!status || !state.data?.push?.enabled) return "";
  return `<button class="ghost" data-action="enable-push">${escapeHtml(status.label)}</button>`;
}

function resetPushButton() {
  if (!state.pushStatus?.subscribed) return "";
  return `<button class="ghost" data-action="reset-push">Reset push</button>`;
}

function requests(data) {
  const incoming = data.incomingRequests
    .map(
      (request) => `
      <div class="request-row">
        <div>
          <div class="name">${escapeHtml(request.from.username)}</div>
          <div class="meta">friend request</div>
        </div>
        <div class="row-actions">
          <button class="primary small" data-request="${request.id}" data-reply="accept">Accept</button>
          <button class="ghost small" data-request="${request.id}" data-reply="reject">Reject</button>
        </div>
      </div>`,
    )
    .join("");
  const outgoing = data.outgoingRequests
    .map(
      (request) => `
      <div class="request-row">
        <div>
          <div class="name">${escapeHtml(request.to.username)}</div>
          <div class="meta">pending</div>
        </div>
      </div>`,
    )
    .join("");
  if (!incoming && !outgoing) return "";
  return `<h2 class="section-title">Requests</h2><div class="grid">${incoming}${outgoing}</div>`;
}

function friendRow(friend) {
  const cooldown = friend.wood.cooldownExpiresAt
    ? `cooldown ${countdown(friend.wood.cooldownExpiresAt)}`
    : friend.muted
      ? "muted"
      : friend.wood.needsReply
        ? "reply ready"
        : "";
  return `
    <div class="friend-row" id="friend-${friend.id}">
      <div>
        <div class="name">${escapeHtml(friend.username)}</div>
        <div class="meta">${escapeHtml(cooldown)}</div>
        <div class="row-actions" style="justify-content:flex-start;margin-top:8px">
          <button class="ghost small" data-friend="${friend.id}" data-action="${friend.muted ? "unmute" : "mute"}">${friend.muted ? "Unmute" : "Mute"}</button>
          <button class="ghost small" data-friend="${friend.id}" data-action="remove">Remove</button>
          <button class="danger small" data-friend="${friend.id}" data-action="block">Block</button>
        </div>
      </div>
      <button
        class="wood-button ${friend.wood.needsReply ? "pulse" : ""}"
        data-friend="${friend.id}"
        data-action="wood"
        ${friend.wood.canWood ? "" : "disabled"}
      >WOOD</button>
    </div>
  `;
}

function bindHome() {
  document.querySelector("[data-action='logout']")?.addEventListener("click", logout);
  document.querySelector("[data-action='enable-push']")?.addEventListener("click", async () => {
    try {
      await subscribePush();
      state.error = "";
    } catch (err) {
      state.error = humanError(err.message);
    }
    await refreshPushStatus();
    render();
  });
  document.querySelector("[data-action='reset-push']")?.addEventListener("click", async () => {
    try {
      await resetPush();
      state.error = "Push reset. Tap Enable push to subscribe again.";
    } catch (err) {
      state.error = humanError(err.message);
    }
    await refreshPushStatus();
    render();
  });
  document.querySelector("[data-route='/admin']")?.addEventListener("click", () => {
    history.pushState(null, "", "/admin");
    render();
  });
  document.querySelector("#friend-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = new FormData(event.currentTarget).get("username");
    await mutate("/api/friend-requests", { username });
  });
  document.querySelectorAll("[data-request]").forEach((button) => {
    button.addEventListener("click", async () => {
      await mutate(`/api/friend-requests/${button.dataset.request}/${button.dataset.reply}`);
    });
  });
  document.querySelectorAll("[data-friend]").forEach((button) => {
    if (button.dataset.action === "wood") bindWoodButton(button);
    else {
      button.addEventListener("click", async () => {
        await mutate(`/api/friends/${button.dataset.friend}/${button.dataset.action}`);
      });
    }
  });
}

function bindWoodButton(button) {
  let startedAt = 0;
  let timer = null;
  const finish = async () => {
    if (!startedAt) return;
    const holdMs = Date.now() - startedAt;
    startedAt = 0;
    button.classList.remove("holding");
    clearTimeout(timer);
    await mutate(`/api/friends/${button.dataset.friend}/wood`, { holdMs });
  };
  button.addEventListener("pointerdown", () => {
    startedAt = Date.now();
    timer = setTimeout(() => button.classList.add("holding"), 350);
  });
  button.addEventListener("pointerup", finish);
  button.addEventListener("pointercancel", finish);
  button.addEventListener("pointerleave", finish);
}

function renderAdmin() {
  const admin = state.admin;
  app.innerHTML = `
    <section class="shell">
      <header class="topbar">
        <div class="brand"><span class="brand-mark">W</span><span>Admin</span></div>
        <div class="actions">
          <button class="ghost" data-route="/">App</button>
          <button class="ghost" data-action="logout">Log out</button>
        </div>
      </header>
      <div class="grid">
        <form class="panel stack" id="invite-form">
          <div class="inline-form">
            <input name="count" type="number" min="1" max="50" value="1" aria-label="Invite count" />
            <input name="days" type="number" min="1" max="90" value="7" aria-label="Invite days" />
            <button class="primary" type="submit">Generate</button>
          </div>
        </form>
        <form class="panel stack" id="config-form">
          <label class="field">Cooldown hours
            <input name="cooldown_hours" type="number" min="1" max="720" value="${admin.config.cooldown_hours}" />
          </label>
          <label><input name="seasonal_enabled" type="checkbox" ${admin.config.seasonal_enabled ? "checked" : ""} /> Seasonal themes</label>
          <button class="primary" type="submit">Save</button>
        </form>
      </div>
      <h2 class="section-title">Stats</h2>
      <div class="panel">${admin.stats.total_users} users · ${admin.stats.total_woods} Woods · ${admin.stats.woods_today} today</div>
      <h2 class="section-title">Invites</h2>
      <div class="admin-table">${inviteTable(admin.invites)}</div>
      <h2 class="section-title">Users</h2>
      <div class="admin-table">${userTable(admin.users)}</div>
      <h2 class="section-title">Debug</h2>
      <div class="panel">
        <button class="ghost small" data-action="refresh-debug">Refresh</button>
        <button class="danger small" data-action="clear-push">Clear server push subscriptions</button>
      </div>
      <div class="admin-table">${debugTable(state.debug?.entries || [])}</div>
    </section>
  `;
  bindAdmin();
}

function inviteTable(invites) {
  return `
    <table>
      <thead><tr><th>Status</th><th>Link</th><th>Expires</th><th></th></tr></thead>
      <tbody>
        ${invites
          .slice()
          .reverse()
          .map(
            (invite) => `
          <tr>
            <td>${invite.status}</td>
            <td><a href="${invite.url}">${invite.url}</a></td>
            <td>${formatDate(invite.expires_at)}</td>
            <td>${invite.status === "unused" ? `<button class="ghost small" data-invite="${invite.id}">Revoke</button>` : ""}</td>
          </tr>`,
          )
          .join("")}
      </tbody>
    </table>`;
}

function userTable(users) {
  return `
    <table>
      <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Woods</th><th></th></tr></thead>
      <tbody>
        ${users
          .map(
            (user) => `
          <tr>
            <td>${escapeHtml(user.username)}<div class="meta">${escapeHtml(user.email)}</div></td>
            <td>${user.role}</td>
            <td>${user.suspended ? "suspended" : "active"}</td>
            <td>${user.woods_sent}</td>
            <td>
              <button class="primary small" data-user="${user.id}" data-admin-action="test-push">Test push</button>
              <button class="ghost small" data-user="${user.id}" data-admin-action="${user.suspended ? "unsuspend" : "suspend"}">${user.suspended ? "Unsuspend" : "Suspend"}</button>
              <button class="ghost small" data-user="${user.id}" data-admin-action="${user.role === "admin" ? "demote" : "promote"}">${user.role === "admin" ? "Demote" : "Promote"}</button>
            </td>
          </tr>`,
          )
          .join("")}
      </tbody>
    </table>`;
}

function debugTable(entries) {
  return `
    <table>
      <thead><tr><th>Time</th><th>Type</th><th>Details</th></tr></thead>
      <tbody>
        ${
          entries.length
            ? entries
                .slice(0, 50)
                .map(
                  (entry) => `
          <tr>
            <td>${formatDate(entry.at)}</td>
            <td>${escapeHtml(entry.type)}</td>
            <td><code>${escapeHtml(JSON.stringify(without(entry, ["at", "type"])))}</code></td>
          </tr>`,
                )
                .join("")
            : `<tr><td colspan="3">No debug events yet.</td></tr>`
        }
      </tbody>
    </table>`;
}

function bindAdmin() {
  document.querySelector("[data-route='/']")?.addEventListener("click", () => {
    history.pushState(null, "", "/");
    renderHome();
  });
  document.querySelector("[data-action='logout']")?.addEventListener("click", logout);
  document.querySelector("[data-action='refresh-debug']")?.addEventListener("click", async () => {
    state.debug = await api("/api/admin/debug");
    renderAdmin();
  });
  document.querySelector("[data-action='clear-push']")?.addEventListener("click", async () => {
    state.admin = await api("/api/admin/push-subscriptions/clear", { method: "POST" });
    state.debug = await api("/api/admin/debug");
    renderAdmin();
  });
  document.querySelector("#invite-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    await api("/api/admin/invites", { method: "POST", body: payload });
    state.admin = await api("/api/admin");
    renderAdmin();
  });
  document.querySelector("#config-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api("/api/admin/config", {
      method: "POST",
      body: {
        cooldown_hours: form.get("cooldown_hours"),
        seasonal_enabled: form.get("seasonal_enabled") === "on",
      },
    });
    state.admin = await api("/api/admin");
    await loadApp();
    renderAdmin();
  });
  document.querySelectorAll("[data-invite]").forEach((button) => {
    button.addEventListener("click", async () => {
      await api(`/api/admin/invites/${button.dataset.invite}/revoke`, { method: "POST" });
      state.admin = await api("/api/admin");
      renderAdmin();
    });
  });
  document.querySelectorAll("[data-admin-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const response = await api(`/api/admin/users/${button.dataset.user}/${button.dataset.adminAction}`, { method: "POST" });
      if (button.dataset.adminAction === "test-push") {
        state.admin = response.admin;
        state.error = `Test push sent: ${response.result.sent}/${response.result.attempted}`;
        state.debug = await api("/api/admin/debug");
        renderAdmin();
        return;
      }
      state.admin = await api("/api/admin");
      renderAdmin();
    });
  });
}

async function mutate(url, body = {}) {
  try {
    state.data = await api(url, { method: "POST", body });
    state.error = "";
    if (state.data.user.role === "admin") state.admin = await api("/api/admin");
    render();
  } catch (err) {
    state.error = humanError(err.message);
    render();
  }
}

async function logout() {
  await api("/api/logout", { method: "POST" });
  state.session = { user: null };
  state.data = null;
  history.replaceState(null, "", "/");
  render();
}

async function subscribePush() {
  if (!state.data?.push?.enabled) throw new Error("push_keys_missing");
  if (!window.isSecureContext) throw new Error("https_required");
  if (!("Notification" in window) || !("PushManager" in window)) {
    throw new Error("push_not_supported");
  }

  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
  if (permission === "denied") throw new Error("notifications_blocked");
  if (permission !== "granted") throw new Error("permission_not_granted");

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(state.data.push.publicKey),
    }));
  await api("/api/push-subscriptions", {
    method: "POST",
    body: { subscription: subscription.toJSON() },
  });
  await refreshPushStatus();
}

async function resetPush() {
  if (!window.isSecureContext) throw new Error("https_required");
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("push_not_supported");
  }
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) await existing.unsubscribe();
  await api("/api/push-subscriptions", { method: "DELETE" });
}

async function refreshPushStatus() {
  if (!state.data?.push?.enabled) {
    state.pushStatus = { label: "Push off", supported: false };
    return;
  }
  if (!window.isSecureContext) {
    state.pushStatus = { label: "HTTPS needed", supported: false };
    return;
  }
  if (!("Notification" in window) || !("PushManager" in window)) {
    state.pushStatus = { label: "Push unsupported", supported: false };
    return;
  }

  const permission = Notification.permission;
  let subscribed = false;
  if (permission === "granted") {
    const registration = await navigator.serviceWorker.ready;
    subscribed = Boolean(await registration.pushManager.getSubscription());
  }

  state.pushStatus = {
    supported: true,
    permission,
    subscribed,
    label: subscribed
      ? "Push on"
      : permission === "denied"
        ? "Push blocked"
        : "Enable push",
  };
}

async function renderLocalPushDebug() {
  const target = document.querySelector("#push-debug");
  if (!target || !("caches" in window)) return;
  const cache = await caches.open("wood-debug");
  const response = await cache.match("/push-events");
  const entries = response ? await response.json() : [];
  if (!entries.length) {
    target.textContent = "No push events received by this browser yet.";
    return;
  }
  const latest = entries[0];
  target.textContent = `Last push received by this browser: ${formatDate(latest.at)} · ${latest.title}`;
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: options.body ? { "content-type": "application/json" } : {},
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (response.status === 204) return null;
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "request_failed");
  return data;
}

function countdown(iso) {
  const ms = Math.max(0, Date.parse(iso) - Date.now());
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.ceil((ms % 3600000) / 60000);
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function humanError(value) {
  return String(value).replaceAll("_", " ");
}

function without(object, keys) {
  const copy = { ...object };
  for (const key of keys) delete copy[key];
  return copy;
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replaceAll("-", "+").replaceAll("_", "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

window.addEventListener("popstate", render);
setInterval(() => {
  if (state.data) render();
}, 60000);
