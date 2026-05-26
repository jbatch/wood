import { state } from "../state.js";
import { escHtml, formatDate, humanErr } from "../utils.js";

export function notificationButtonHtml() {
  const count = Number(state.data?.notifications?.unread_count || 0);
  return `
    <button class="icon-btn mailbox-btn" id="mailbox-btn" title="Notifications">
      <span class="mailbox-icon">▣</span>
      ${count ? `<span class="mailbox-badge">${count > 99 ? "99+" : count}</span>` : ""}
    </button>
  `;
}

export function notificationSheetHtml() {
  if (!state.showNotificationSheet) return "";
  const notifications = state.notificationsData?.notifications || [];
  return `
    <div class="sheet-overlay" id="notification-overlay">
      <div class="sheet notification-sheet" id="notification-sheet">
        <div class="notification-sheet-head">
          <div>
            <div class="sheet-title">Mailbox</div>
            <p>Recent Wood activity</p>
          </div>
          <button class="icon-btn" type="button" data-close-notifications title="Close">x</button>
        </div>
        <div class="notification-list">
          ${notifications.length ? notifications.map(notificationRowHtml).join("") : notificationEmptyHtml()}
        </div>
      </div>
    </div>
  `;
}

export function bindNotifications(ctx) {
  document.querySelector("#mailbox-btn")?.addEventListener("click", async () => {
    await openNotifications(ctx);
  });
  document.querySelector("#notification-overlay")?.addEventListener("click", (event) => {
    if (event.target.id === "notification-overlay") {
      state.showNotificationSheet = false;
      ctx.render();
    }
  });
  document.querySelector("[data-close-notifications]")?.addEventListener("click", () => {
    state.showNotificationSheet = false;
    ctx.render();
  });
  document.querySelectorAll("[data-notification-id]").forEach((row) => {
    row.addEventListener("click", () => {
      openNotificationTarget(ctx, row.dataset.notificationId);
    });
  });
}

async function openNotifications(ctx) {
  try {
    const before = await ctx.api("/api/notifications");
    state.notificationFreshIds = new Set(
      (before.notifications || [])
        .filter((notification) => !notification.read_at)
        .map((notification) => notification.id),
    );
    const data = await ctx.api("/api/notifications/read-all", { method: "POST" });
    state.notificationsData = data;
    if (state.data?.notifications) state.data.notifications.unread_count = data.unread_count;
    state.showNotificationSheet = true;
    state.error = "";
  } catch (err) {
    state.error = humanErr(err.message);
  }
  ctx.render();
}

function notificationRowHtml(notification) {
  const wasUnread = state.notificationFreshIds?.has(notification.id);
  return `
    <button class="notification-row ${wasUnread ? "fresh" : ""} ${notification.read_at ? "" : "unread"}" type="button" data-notification-id="${escHtml(notification.id)}">
      <span class="notification-type-dot"></span>
      <span class="notification-copy">
        <strong>${escHtml(notification.title)}</strong>
        <span>${notification.body ? escHtml(notification.body) : "&nbsp;"}</span>
        <small>${formatDate(notification.created_at)}</small>
      </span>
    </button>
  `;
}

function notificationEmptyHtml() {
  return `
    <div class="notification-empty">
      <strong>No Wood mail</strong>
      <span>The mailbox is dramatically empty.</span>
    </div>
  `;
}

function openNotificationTarget(ctx, notificationId) {
  const notification = (state.notificationsData?.notifications || [])
    .find((candidate) => candidate.id === notificationId);
  if (!notification) return;

  state.showNotificationSheet = false;
  const data = notification.data || {};
  if (data.friendId) {
    ctx.openHistory(data.friendId);
    return;
  }
  if (data.groupId || notification.type.startsWith("group.") || notification.type === "wood.group") {
    ctx.saveHomeTab("groups");
    state.view = "home";
    ctx.render();
    return;
  }
  if (notification.type.startsWith("achievement.")) {
    ctx.saveHomeTab("stats");
    state.view = "home";
    ctx.render();
    return;
  }
  ctx.saveHomeTab("friends");
  state.view = "home";
  ctx.render();
}
