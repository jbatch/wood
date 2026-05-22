import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import {
  clearCookie,
  parseCookies,
  readJson,
  sendJson,
  sendNoContent,
  setCookie,
} from "./http.js";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  hashPassword,
  signSession,
  verifyPassword,
  verifySession,
} from "./auth.js";
import { id, inviteCode } from "./ids.js";
import { addDaysIso, isPast, nowIso } from "./time.js";
import { createStore } from "./store.js";
import {
  canSendWood,
  findFriendship,
  getAcceptedFriendIds,
  isBlockedBetween,
  notificationStyles,
  pairStats,
  seasonalTheme,
  updatePairStreakAfterWood,
  userStats,
  visibleStreak,
  visibleWoodState,
  woodNotification,
  woodVariant,
} from "./woodRules.js";
import { notifyUser, pushPublicConfig } from "./push.js";
import { serveStatic } from "./static.js";
import { debugEntries, debugLog, endpointHost } from "./debugLog.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");
const store = await createStore();

const requestListener = async (req, res) => {
  try {
    await handleRequest(req, res);
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: "server_error" });
  }
};

const server =
  config.tlsKeyFile && config.tlsCertFile
    ? https.createServer(
        {
          key: fs.readFileSync(config.tlsKeyFile),
          cert: fs.readFileSync(config.tlsCertFile),
        },
        requestListener,
      )
    : http.createServer(requestListener);

server.listen(config.port, config.host, () => {
  console.log(`Wood listening on ${config.baseUrl}`);
});

async function handleRequest(req, res) {
  const url = new URL(req.url, config.baseUrl);
  if (url.pathname.startsWith("/api/")) {
    await handleApi(req, res, url);
    return;
  }

  const didServe = await serveStatic(req, res, publicDir);
  if (!didServe) await serveStatic({ ...req, url: "/" }, res, publicDir);
}

async function handleApi(req, res, url) {
  const user = currentUser(req);
  const body = ["POST", "PUT", "PATCH"].includes(req.method)
    ? await readJson(req)
    : {};

  if (req.method === "GET" && url.pathname === "/api/session") {
    sendJson(res, 200, {
      user: user ? publicUser(user) : null,
      push: pushPublicConfig(),
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/login") {
    await login(req, res, body);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/logout") {
    clearCookie(res, SESSION_COOKIE);
    sendNoContent(res);
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/invites/")) {
    const code = url.pathname.split("/").at(-1);
    const invite = store.db.invites.find((item) => item.code === code);
    sendJson(res, 200, {
      valid: Boolean(invite && !invite.used_at && !invite.revoked_at && !isPast(invite.expires_at)),
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/signup") {
    await signup(req, res, body);
    return;
  }

  if (!user) {
    sendJson(res, 401, { error: "auth_required" });
    return;
  }

  if (user.suspended) {
    sendJson(res, 403, { error: "suspended" });
    return;
  }

  await store.write((db) => {
    const fresh = db.users.find((candidate) => candidate.id === user.id);
    if (fresh) fresh.last_active_at = nowIso();
  });

  if (req.method === "GET" && url.pathname === "/api/app") {
    sendJson(res, 200, appState(user));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/push-subscriptions") {
    await savePushSubscription(user, body);
    sendNoContent(res);
    return;
  }

  if (req.method === "DELETE" && url.pathname === "/api/push-subscriptions") {
    await deletePushSubscriptions(user);
    sendNoContent(res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/friend-requests") {
    await requestFriend(user, res, body);
    return;
  }

  const requestAction = url.pathname.match(
    /^\/api\/friend-requests\/([^/]+)\/(accept|reject)$/,
  );
  if (req.method === "POST" && requestAction) {
    await respondToFriendRequest(user, res, requestAction[1], requestAction[2]);
    return;
  }

  const friendAction = url.pathname.match(
    /^\/api\/friends\/([^/]+)\/(wood|mute|unmute|remove|block)$/,
  );
  if (req.method === "POST" && friendAction) {
    await handleFriendAction(user, res, friendAction[1], friendAction[2], body);
    return;
  }

  if (url.pathname.startsWith("/api/admin")) {
    if (user.role !== "admin") {
      sendJson(res, 403, { error: "admin_required" });
      return;
    }
    await handleAdmin(user, req, res, url, body);
    return;
  }

  sendJson(res, 404, { error: "not_found" });
}

function currentUser(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  const session = verifySession(cookies[SESSION_COOKIE]);
  if (!session) return null;
  return store.db.users.find((user) => user.id === session.userId) || null;
}

async function login(req, res, body) {
  const username = cleanUsername(body.username);
  const user = store.db.users.find((candidate) => candidate.username === username);
  if (!user || !(await verifyPassword(String(body.password || ""), user.password_hash))) {
    sendJson(res, 401, { error: "invalid_credentials" });
    return;
  }
  if (user.suspended) {
    sendJson(res, 403, { error: "suspended" });
    return;
  }
  await store.write(() => {
    user.last_active_at = nowIso();
  });
  setCookie(res, SESSION_COOKIE, signSession(user.id), {
    maxAge: SESSION_MAX_AGE_SECONDS,
    secure: req.headers["x-forwarded-proto"] === "https",
  });
  sendJson(res, 200, { user: publicUser(user) });
}

async function signup(req, res, body) {
  const code = String(body.inviteCode || "").trim();
  const username = cleanUsername(body.username);
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    sendJson(res, 400, { error: "invalid_username" });
    return;
  }
  if (!email.includes("@")) {
    sendJson(res, 400, { error: "invalid_email" });
    return;
  }
  if (password.length < 8) {
    sendJson(res, 400, { error: "weak_password" });
    return;
  }

  const result = await store.write(async (db) => {
    const invite = db.invites.find((item) => item.code === code);
    if (!invite || invite.used_at || invite.revoked_at || isPast(invite.expires_at)) {
      return { error: "invalid_invite" };
    }
    if (db.users.some((user) => user.username === username)) {
      return { error: "username_taken" };
    }
    if (db.users.some((user) => user.email === email)) {
      return { error: "email_taken" };
    }

    const user = {
      id: id("user"),
      username,
      email,
      password_hash: await hashPassword(password),
      role: "user",
      suspended: false,
      created_at: nowIso(),
      last_active_at: nowIso(),
    };
    db.users.push(user);
    invite.used_by = user.id;
    invite.used_at = nowIso();
    return { user };
  });

  if (result.error) {
    sendJson(res, 400, { error: result.error });
    return;
  }
  setCookie(res, SESSION_COOKIE, signSession(result.user.id), {
    maxAge: SESSION_MAX_AGE_SECONDS,
    secure: req.headers["x-forwarded-proto"] === "https",
  });
  sendJson(res, 201, { user: publicUser(result.user) });
}

function appState(user) {
  const db = store.db;
  const acceptedFriendIds = getAcceptedFriendIds(db, user.id);
  const friends = acceptedFriendIds
    .map((friendId) => db.users.find((candidate) => candidate.id === friendId))
    .filter(Boolean)
    .map((friend) => {
      const muted = db.mutes.some(
        (mute) => mute.muter_id === user.id && mute.muted_id === friend.id,
      );
      return {
        ...publicUser(friend),
        muted,
        wood: visibleWoodState(db, user.id, friend.id),
        streak: visibleStreak(db, user.id, friend.id),
        stats: pairStats(db, user.id, friend.id),
      };
    })
    .sort((a, b) => a.username.localeCompare(b.username));

  return {
    user: publicUser(user),
    stats: userStats(db, user.id),
    friends,
    incomingRequests: db.friendships
      .filter(
        (friendship) =>
          friendship.addressee_id === user.id && friendship.status === "pending",
      )
      .map((friendship) => ({
        id: friendship.id,
        from: publicUser(db.users.find((candidate) => candidate.id === friendship.requester_id)),
        created_at: friendship.created_at,
      })),
    outgoingRequests: db.friendships
      .filter(
        (friendship) =>
          friendship.requester_id === user.id && friendship.status === "pending",
      )
      .map((friendship) => ({
        id: friendship.id,
        to: publicUser(db.users.find((candidate) => candidate.id === friendship.addressee_id)),
        created_at: friendship.created_at,
      })),
    config: {
      cooldown_hours: db.config.cooldown_hours,
    },
    push: pushPublicConfig(),
  };
}

async function savePushSubscription(user, body) {
  const subscription = body.subscription || {};
  const endpoint = String(subscription.endpoint || "");
  const keys = subscription.keys || {};
  if (!endpoint || !keys.p256dh || !keys.auth) return;

  await store.write((db) => {
    const existing = db.push_subs.find((sub) => sub.endpoint === endpoint);
    if (existing) {
      existing.user_id = user.id;
      existing.p256dh = keys.p256dh;
      existing.auth = keys.auth;
      existing.updated_at = nowIso();
      debugLog("push.subscription.updated", {
        userId: user.id,
        username: user.username,
        subscriptionId: existing.id,
        endpointHost: endpointHost(endpoint),
      });
      return;
    }
    const subscriptionId = id("sub");
    db.push_subs.push({
      id: subscriptionId,
      user_id: user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      created_at: nowIso(),
      updated_at: nowIso(),
    });
    debugLog("push.subscription.created", {
      userId: user.id,
      username: user.username,
      subscriptionId,
      endpointHost: endpointHost(endpoint),
    });
  });
}

async function requestFriend(user, res, body) {
  const username = cleanUsername(body.username);
  const result = await store.write((db) => {
    const recipient = db.users.find((candidate) => candidate.username === username);
    if (!recipient || recipient.suspended || recipient.id === user.id) {
      return { error: "not_found" };
    }
    if (isBlockedBetween(db, user.id, recipient.id)) {
      return { error: "not_found" };
    }
    const existing = findFriendship(db, user.id, recipient.id);
    if (existing && !["rejected", "removed"].includes(existing.status)) {
      return { error: "already_exists" };
    }
    if (existing) {
      existing.requester_id = user.id;
      existing.addressee_id = recipient.id;
      existing.status = "pending";
      existing.created_at = nowIso();
      return { recipient, friendship: existing };
    }
    const friendship = {
      id: id("friendship"),
      requester_id: user.id,
      addressee_id: recipient.id,
      status: "pending",
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    db.friendships.push(friendship);
    return { recipient, friendship };
  });

  if (result.error) {
    sendJson(res, 400, { error: result.error });
    return;
  }

  await notifyUser(store.db, result.recipient.id, {
    title: "Wood",
    body: `${user.username} wants to be your friend`,
    url: "/",
  });
  sendJson(res, 201, { request: { id: result.friendship.id } });
}

async function respondToFriendRequest(user, res, friendshipId, action) {
  const result = await store.write((db) => {
    const friendship = db.friendships.find(
      (candidate) =>
        candidate.id === friendshipId &&
        candidate.addressee_id === user.id &&
        candidate.status === "pending",
    );
    if (!friendship) return { error: "not_found" };
    friendship.status = action === "accept" ? "accepted" : "rejected";
    friendship.updated_at = nowIso();
    return { friendship };
  });
  if (result.error) {
    sendJson(res, 404, { error: result.error });
    return;
  }
  sendJson(res, 200, appState(user));
}

async function handleFriendAction(user, res, friendId, action, body) {
  if (action === "wood") {
    await sendWood(user, res, friendId, body);
    return;
  }

  const result = await store.write((db) => {
    const friendship = findFriendship(db, user.id, friendId);
    if (!friendship || friendship.status !== "accepted") {
      return { error: "not_found" };
    }
    if (action === "mute") {
      if (!db.mutes.some((mute) => mute.muter_id === user.id && mute.muted_id === friendId)) {
        db.mutes.push({ id: id("mute"), muter_id: user.id, muted_id: friendId });
      }
    }
    if (action === "unmute") {
      db.mutes = db.mutes.filter(
        (mute) => !(mute.muter_id === user.id && mute.muted_id === friendId),
      );
    }
    if (action === "remove") {
      friendship.status = "removed";
      friendship.updated_at = nowIso();
    }
    if (action === "block") {
      friendship.status = "blocked";
      friendship.blocked_by = user.id;
      friendship.updated_at = nowIso();
      db.mutes = db.mutes.filter(
        (mute) =>
          !(
            (mute.muter_id === user.id && mute.muted_id === friendId) ||
            (mute.muter_id === friendId && mute.muted_id === user.id)
          ),
      );
    }
    return { ok: true };
  });

  if (result.error) {
    sendJson(res, 404, { error: result.error });
    return;
  }
  sendJson(res, 200, appState(user));
}

async function sendWood(user, res, recipientId, body) {
  const recipient = store.db.users.find((candidate) => candidate.id === recipientId);
  if (!recipient || recipient.suspended) {
    sendJson(res, 404, { error: "not_found" });
    return;
  }

  const state = canSendWood(store.db, user.id, recipientId);
  if (!state.ok) {
    debugLog("wood.blocked", {
      senderId: user.id,
      senderUsername: user.username,
      recipientId,
      recipientUsername: recipient.username,
      reason: state.reason,
      expiresAt: state.expiresAt || null,
    });
    sendJson(res, 409, { error: state.reason, expiresAt: state.expiresAt });
    return;
  }

  const seasonal = seasonalTheme(store.db);
  const holdMs = Number(body.holdMs || 0);
  const variant = woodVariant({ holdMs, seasonal });
  const muted = store.db.mutes.some(
    (mute) => mute.muter_id === recipientId && mute.muted_id === user.id,
  );

  const { wood, streakResult } = await store.write((db) => {
    const sentAt = nowIso();
    const entry = {
      id: id("wood"),
      sender_id: user.id,
      recipient_id: recipientId,
      sent_at: sentAt,
      type: variant.type,
      label: variant.label,
      hold_duration_ms: holdMs,
      streak_count_after: null,
      streak_incremented: false,
    };
    db.woods.push(entry);
    const result = updatePairStreakAfterWood(db, user.id, recipientId, sentAt);
    entry.streak_incremented = result.incremented;
    entry.streak_count_after = result.incremented
      ? result.streak.current_streak
      : null;
    return { wood: entry, streakResult: result };
  });

  debugLog("wood.created", {
    woodId: wood.id,
    senderId: user.id,
    senderUsername: user.username,
    recipientId,
    recipientUsername: recipient.username,
    muted,
    type: variant.type,
    label: variant.label,
    streak: streakResult.streak.current_streak,
    incremented: streakResult.incremented,
    milestone: streakResult.milestone,
  });

  if (!muted) {
    const notification = woodNotification({
      sender: user.username,
      wood: variant.label,
      seasonal,
    });
    const result = await notifyUser(store.db, recipientId, {
      title: notification.title,
      body: notification.body,
      icon: notification.icon,
      badge: notification.badge,
      vibrate: notification.vibrate,
      actions: notification.actions,
      styleId: notification.id,
      url: `/?friend=${encodeURIComponent(user.id)}`,
      friendId: user.id,
      woodId: wood.id,
    });
    debugLog("wood.push_result", {
      woodId: wood.id,
      recipientId,
      attempted: result.attempted,
      sent: result.sent,
      disabled: Boolean(result.disabled),
      staleCount: result.stale.length,
    });
    if (result.stale.length) {
      await store.write((db) => {
        db.push_subs = db.push_subs.filter((sub) => !result.stale.includes(sub.id));
      });
      debugLog("push.stale_pruned", {
        woodId: wood.id,
        staleCount: result.stale.length,
      });
    }
  } else {
    debugLog("wood.push_skipped_muted", {
      woodId: wood.id,
      senderId: user.id,
      recipientId,
    });
  }

  if (streakResult.milestone) {
    await notifyStreakMilestone(user, recipient, streakResult.milestone);
  }

  sendJson(res, 201, appState(user));
}

async function notifyStreakMilestone(sender, recipient, count) {
  const senderResult = await notifyUser(store.db, sender.id, {
    title: "Wood streak",
    body: `You and ${recipient.username} have a ${count}-day Wood streak!`,
    url: `/?friend=${encodeURIComponent(recipient.id)}`,
    friendId: recipient.id,
    streak: count,
  });
  const recipientResult = await notifyUser(store.db, recipient.id, {
    title: "Wood streak",
    body: `You and ${sender.username} have a ${count}-day Wood streak!`,
    url: `/?friend=${encodeURIComponent(sender.id)}`,
    friendId: sender.id,
    streak: count,
  });
  debugLog("streak.milestone", {
    senderId: sender.id,
    recipientId: recipient.id,
    count,
    senderSent: senderResult.sent,
    recipientSent: recipientResult.sent,
  });
}

async function handleAdmin(user, req, res, url, body) {
  if (req.method === "GET" && url.pathname === "/api/admin") {
    sendJson(res, 200, adminState());
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/debug") {
    sendJson(res, 200, {
      entries: debugEntries(),
      push: {
        subscriptions: store.db.push_subs.map((sub) => ({
          id: sub.id,
          user_id: sub.user_id,
          username:
            store.db.users.find((candidate) => candidate.id === sub.user_id)
              ?.username || "unknown",
          endpointHost: endpointHost(sub.endpoint),
          created_at: sub.created_at,
          updated_at: sub.updated_at,
        })),
      },
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/push-subscriptions/clear") {
    const cleared = await store.write((db) => {
      const count = db.push_subs.length;
      db.push_subs = [];
      return count;
    });
    debugLog("push.admin_cleared_all", {
      adminId: user.id,
      adminUsername: user.username,
      cleared,
    });
    sendJson(res, 200, adminState());
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/invites") {
    const count = clamp(Number(body.count || 1), 1, 50);
    const days = clamp(Number(body.days || 7), 1, 90);
    const invites = await store.write((db) => {
      const created = [];
      for (let index = 0; index < count; index += 1) {
        const invite = {
          id: id("invite"),
          code: inviteCode(),
          created_by: user.id,
          expires_at: addDaysIso(days),
          used_by: null,
          used_at: null,
          revoked_at: null,
          created_at: nowIso(),
        };
        db.invites.push(invite);
        created.push(invite);
      }
      return created;
    });
    sendJson(res, 201, { invites: invites.map(publicInvite) });
    return;
  }

  const revokeInvite = url.pathname.match(/^\/api\/admin\/invites\/([^/]+)\/revoke$/);
  if (req.method === "POST" && revokeInvite) {
    await store.write((db) => {
      const invite = db.invites.find((candidate) => candidate.id === revokeInvite[1]);
      if (invite && !invite.used_at) invite.revoked_at = nowIso();
    });
    sendJson(res, 200, adminState());
    return;
  }

  const userAction = url.pathname.match(
    /^\/api\/admin\/users\/([^/]+)\/(suspend|unsuspend|promote|demote|delete)$/,
  );
  if (req.method === "POST" && userAction) {
    await store.write((db) => {
      const target = db.users.find((candidate) => candidate.id === userAction[1]);
      if (!target || target.id === user.id) return;
      if (userAction[2] === "suspend") target.suspended = true;
      if (userAction[2] === "unsuspend") target.suspended = false;
      if (userAction[2] === "promote") target.role = "admin";
      if (userAction[2] === "demote") target.role = "user";
      if (userAction[2] === "delete") {
        target.suspended = true;
        target.deleted_at = nowIso();
      }
    });
    sendJson(res, 200, adminState());
    return;
  }

  const testPush = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/test-push$/);
  if (req.method === "POST" && testPush) {
    const target = store.db.users.find((candidate) => candidate.id === testPush[1]);
    if (!target) {
      sendJson(res, 404, { error: "not_found" });
      return;
    }
    const requestedStyle = notificationStyles().find((style) => style.id === body.styleId);
    const notification = woodNotification({
      sender: user.username,
      wood: requestedStyle ? `Test ${requestedStyle.id} Wood` : "Test Wood",
      styleId: requestedStyle?.id,
    });
    const result = await notifyUser(store.db, target.id, {
      title: "Wood test",
      body: `${notification.title}: ${notification.body}`,
      icon: notification.icon,
      badge: notification.badge,
      vibrate: notification.vibrate,
      actions: notification.actions,
      styleId: notification.id,
      url: "/admin",
      test: true,
    });
    if (result.stale.length) {
      await store.write((db) => {
        db.push_subs = db.push_subs.filter((sub) => !result.stale.includes(sub.id));
      });
    }
    debugLog("push.admin_test", {
      adminId: user.id,
      adminUsername: user.username,
      targetId: target.id,
      targetUsername: target.username,
      attempted: result.attempted,
      sent: result.sent,
      disabled: Boolean(result.disabled),
      staleCount: result.stale.length,
    });
    sendJson(res, 200, { result, admin: adminState() });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/notification-styles") {
    sendJson(res, 200, { styles: notificationStyles() });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/config") {
    await store.write((db) => {
      db.config.cooldown_hours = clamp(Number(body.cooldown_hours || 24), 1, 720);
      db.config.seasonal_enabled = Boolean(body.seasonal_enabled);
    });
    sendJson(res, 200, adminState());
    return;
  }

  sendJson(res, 404, { error: "not_found" });
}

async function deletePushSubscriptions(user) {
  const deleted = await store.write((db) => {
    const before = db.push_subs.length;
    db.push_subs = db.push_subs.filter((sub) => sub.user_id !== user.id);
    return before - db.push_subs.length;
  });
  debugLog("push.subscription.deleted_for_user", {
    userId: user.id,
    username: user.username,
    deleted,
  });
}

function adminState() {
  const db = store.db;
  return {
    users: db.users.map((user) => ({
      ...publicUser(user),
      email: user.email,
      created_at: user.created_at,
      last_active_at: user.last_active_at,
      friend_count: getAcceptedFriendIds(db, user.id).length,
      woods_sent: db.woods.filter((wood) => wood.sender_id === user.id).length,
      woods_received: db.woods.filter((wood) => wood.recipient_id === user.id).length,
      current_longest_streak: userStats(db, user.id).current_longest_streak,
    })),
    invites: db.invites.map(publicInvite),
    config: db.config,
    notification_styles: notificationStyles(),
    stats: {
      total_users: db.users.length,
      total_woods: db.woods.length,
      woods_today: db.woods.filter((wood) => wood.sent_at.slice(0, 10) === nowIso().slice(0, 10)).length,
      active_streaks: db.streaks.filter(
        (streak) => visibleStreak(db, streak.user_a_id, streak.user_b_id).current_streak > 0,
      ).length,
    },
  };
}

function publicInvite(invite) {
  return {
    id: invite.id,
    code: invite.code,
    url: `${config.baseUrl}/signup?invite=${invite.code}`,
    expires_at: invite.expires_at,
    used_by: invite.used_by,
    used_at: invite.used_at,
    revoked_at: invite.revoked_at,
    status: invite.revoked_at
      ? "revoked"
      : invite.used_at
        ? "used"
        : isPast(invite.expires_at)
          ? "expired"
          : "unused",
  };
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    suspended: Boolean(user.suspended),
  };
}

function cleanUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
