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
import {
  achievementDefinitions,
  achievementProgress,
  awardAchievements,
  evaluateAchievements,
  resetAchievements,
} from "./achievements.js";
import { id, inviteCode } from "./ids.js";
import { addDaysIso, isPast, nowIso } from "./time.js";
import { createStore } from "./store.js";
import {
  friendRequestAcceptedNotification,
  friendRequestNotification,
  groupInviteAcceptedNotification,
  groupInviteNotification,
  inviteUsedNotification,
} from "./eventNotifications.js";
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
import {
  canCreateGroupWith,
  canSendGroupWood,
  groupMembers,
  groupStats,
  groupWoods,
  pendingGroupInvites,
  visibleGroups,
  visibleGroupWoodState,
} from "./groupRules.js";
import { notifyUser, pushPublicConfig } from "./push.js";
import { serveStatic } from "./static.js";
import { debugEntries, debugLog, endpointHost } from "./debugLog.js";
import { cleanUsername, isValidUsername, usernameKey } from "./usernames.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", config.ui === "v2" ? "public-v2" : "public");
const store = await createStore();
const realtimeClients = new Map();
let realtimeEventId = 0;
const REALTIME_HEARTBEAT_MS = 25000;
const FAVOURITE_WOODS = [
  "ash",
  "balsa",
  "baseball bat",
  "birch",
  "bog oak",
  "cedar",
  "cherry",
  "cursed mahogany",
  "driftwood",
  "ebony",
  "groot",
  "ikea dowel",
  "ironwood",
  "laminate flooring",
  "mahogany",
  "maple",
  "mdf",
  "oak",
  "particleboard",
  "petrified wood",
  "pine",
  "plywood",
  "purpleheart",
  "redwood",
  "rosewood",
  "ship mast",
  "snakewood",
  "spruce",
  "teak",
  "two-by-four",
  "walnut",
  "weirwood",
  "whomping willow",
  "willow",
  "wizard staff",
  "wooden spoon",
  "yggdrasil",
];
const FOREVER_SNOOZE_UNTIL = "9999-12-31T23:59:59.000Z";

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

  if (url.pathname === "/manifest.webmanifest") {
    sendJson(res, 200, appManifest(), {
      "content-type": "application/manifest+json; charset=utf-8",
      "cache-control": "no-store",
    });
    return;
  }

  if (url.pathname === "/apple-touch-icon.svg") {
    const iconPath = config.dev ? "/icon-dev.svg" : "/icon.svg";
    await serveStatic({ ...req, url: iconPath }, res, publicDir);
    return;
  }

  const didServe = await serveStatic(req, res, publicDir);
  if (didServe) return;

  const didServeFallback = await serveStatic({ ...req, url: "/" }, res, publicDir);
  if (!didServeFallback) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

function appManifest() {
  const isDev = config.dev;
  return {
    id: isDev ? "/wood-dev" : "/wood",
    name: isDev ? "Wood Dev" : "Wood",
    short_name: isDev ? "Wood Dev" : "Wood",
    start_url: isDev ? "/?app=dev" : "/",
    display: "standalone",
    background_color: isDev ? "#fff7d1" : "#f4f0e8",
    theme_color: isDev ? "#7a4b00" : "#25382b",
    icons: [
      {
        src: isDev ? "/icon-dev.svg" : "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any maskable",
      },
    ],
  };
}

async function handleApi(req, res, url) {
  const user = currentUser(req);
  const body = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method)
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
      valid: isInviteUsable(invite),
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

  if (req.method === "PATCH" && url.pathname === "/api/profile") {
    await updateProfile(user, res, body);
    return;
  }

  if (req.method === "PATCH" && url.pathname === "/api/settings") {
    await updateSettings(user, res, body);
    return;
  }

  const profileView = url.pathname.match(/^\/api\/profiles\/([^/]+)$/);
  if (req.method === "GET" && profileView) {
    await getProfile(user, res, profileView[1]);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/events") {
    handleRealtimeStream(user, req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/push-subscriptions") {
    await savePushSubscription(user, body);
    sendNoContent(res);
    return;
  }

  if (req.method === "DELETE" && url.pathname === "/api/push-subscriptions") {
    await deletePushSubscriptions(user, body);
    sendNoContent(res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/friend-requests") {
    await requestFriend(user, res, body);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/groups") {
    await createGroup(user, res, body);
    return;
  }

  const groupInviteAction = url.pathname.match(
    /^\/api\/groups\/invites\/([^/]+)\/(accept|decline)$/,
  );
  if (req.method === "POST" && groupInviteAction) {
    await respondToGroupInvite(user, res, groupInviteAction[1], groupInviteAction[2]);
    return;
  }

  const groupWoodAction = url.pathname.match(/^\/api\/groups\/([^/]+)\/wood$/);
  if (req.method === "POST" && groupWoodAction) {
    await sendGroupWood(user, res, groupWoodAction[1], body);
    return;
  }

  const groupHistory = url.pathname.match(/^\/api\/groups\/([^/]+)\/woods$/);
  if (req.method === "GET" && groupHistory) {
    await groupWoodHistory(user, res, groupHistory[1]);
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

  const woodHistory = url.pathname.match(/^\/api\/friends\/([^/]+)\/woods$/);
  if (req.method === "GET" && woodHistory) {
    const friendId = woodHistory[1];
    const db = store.db;
    const friendship = findFriendship(db, user.id, friendId);
    if (!friendship || friendship.status !== "accepted") {
      sendJson(res, 404, { error: "not_found" });
      return;
    }
    const woods = db.woods
      .filter(
        (wood) =>
          (wood.sender_id === user.id && wood.recipient_id === friendId) ||
          (wood.sender_id === friendId && wood.recipient_id === user.id),
      )
      .sort((a, b) => new Date(a.sent_at) - new Date(b.sent_at))
      .slice(-200)
      .map((wood) => ({
        id: wood.id,
        senderId: wood.sender_id,
        sentAt: wood.sent_at,
        label: wood.label || "Wood",
        type: wood.type || "normal",
        streakCountAfter: wood.streak_count_after,
      }));
    const friend = db.users.find((candidate) => candidate.id === friendId);
    sendJson(res, 200, { woods, friend: friend ? publicUser(friend) : null });
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
  return currentUserFromId(session.userId);
}

function currentUserFromId(userId) {
  return store.db.users.find((user) => user.id === userId) || null;
}

async function login(req, res, body) {
  const username = cleanUsername(body.username);
  const user = store.db.users.find((candidate) => sameUsername(candidate.username, username));
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

  if (!isValidUsername(username)) {
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
    if (!isInviteUsable(invite)) {
      return { error: "invalid_invite" };
    }
    if (db.users.some((user) => sameUsername(user.username, username))) {
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
      favourite_wood: "",
      birthday_month: null,
      birthday_day: null,
      birthday_visible: false,
      notification_snoozed_until: null,
      created_at: nowIso(),
      last_active_at: nowIso(),
    };
    db.users.push(user);
    if (!invite.reusable) {
      invite.used_by = user.id;
      invite.used_at = nowIso();
    }
    return { user, invite: { ...invite } };
  });

  if (result.error) {
    sendJson(res, 400, { error: result.error });
    return;
  }
  setCookie(res, SESSION_COOKIE, signSession(result.user.id), {
    maxAge: SESSION_MAX_AGE_SECONDS,
    secure: req.headers["x-forwarded-proto"] === "https",
  });
  if (result.invite?.created_by) {
    const creator = store.db.users.find((candidate) => candidate.id === result.invite.created_by);
    if (creator && creator.id !== result.user.id) {
      await notifyAndPrune(creator.id, inviteUsedNotification(result.user, result.invite, creator), {
        event: "invite.used",
        inviteId: result.invite.id,
        joinedUserId: result.user.id,
      });
      emitUserEvent(creator.id, "app.changed", {
        reason: "invite.used",
        inviteId: result.invite.id,
        joinedUserId: result.user.id,
      });
    }
  }
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
      const woodState = visibleWoodState(db, user.id, friend.id);
      return {
        ...publicUser(friend),
        muted,
        wood: {
          ...woodState,
          birthdayAvailable: woodState.canWood && birthdayWoodAvailable(db, user.id, friend.id),
        },
        streak: visibleStreak(db, user.id, friend.id),
        stats: pairStats(db, user.id, friend.id),
      };
    })
    .sort((a, b) => a.username.localeCompare(b.username));

  return {
    user: publicUser(user),
    profile: editableProfile(user),
    settings: privateSettings(db, user.id),
    stats: userStats(db, user.id),
    achievements: achievementProgress(db, user.id),
    friends,
    groups: visibleGroups(db, user.id).map((group) => publicGroup(group, user.id)),
    groupInvites: pendingGroupInvites(db, user.id)
      .map((member) => {
        const group = db.groups.find((candidate) => candidate.id === member.group_id);
        if (!group || group.dissolved_at) return null;
        return {
          id: member.id,
          group: publicGroup(group, user.id),
          invitedBy: publicUser(db.users.find((candidate) => candidate.id === member.invited_by)),
          created_at: member.created_at,
        };
      })
      .filter(Boolean),
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

async function getProfile(user, res, profileUserId) {
  const profileUser = store.db.users.find((candidate) => candidate.id === profileUserId);
  if (!profileUser || profileUser.suspended || profileUser.deleted_at) {
    sendJson(res, 404, { error: "not_found" });
    return;
  }

  const isSelf = profileUser.id === user.id;
  const friendship = isSelf ? null : findFriendship(store.db, user.id, profileUser.id);
  if (!isSelf && (!friendship || friendship.status !== "accepted")) {
    sendJson(res, 404, { error: "not_found" });
    return;
  }

  const muted = !isSelf && store.db.mutes.some(
    (mute) => mute.muter_id === user.id && mute.muted_id === profileUser.id,
  );

  sendJson(res, 200, {
    profile: publicProfile(profileUser, { includePrivate: isSelf }),
    isSelf,
    favouriteWoodOptions: FAVOURITE_WOODS,
    stats: isSelf ? userStats(store.db, user.id) : pairStats(store.db, user.id, profileUser.id),
    achievements: achievementProgress(store.db, profileUser.id),
    friendship: isSelf
      ? null
      : {
          muted,
          wood: {
            ...visibleWoodState(store.db, user.id, profileUser.id),
            birthdayAvailable:
              visibleWoodState(store.db, user.id, profileUser.id).canWood &&
              birthdayWoodAvailable(store.db, user.id, profileUser.id),
          },
          streak: visibleStreak(store.db, user.id, profileUser.id),
        },
  });
}

async function updateProfile(user, res, body) {
  const username =
    Object.hasOwn(body, "username") ? cleanUsername(body.username) : user.username;
  const favouriteWood =
    Object.hasOwn(body, "favouriteWood")
      ? cleanFavouriteWood(body.favouriteWood)
      : user.favourite_wood || "";
  const birthday = cleanBirthday(body);
  const birthdayVisible = Boolean(body.birthdayVisible);

  if (!isValidUsername(username)) {
    sendJson(res, 400, { error: "invalid_username" });
    return;
  }
  if (favouriteWood === null) {
    sendJson(res, 400, { error: "invalid_favourite_wood" });
    return;
  }
  if (birthday.error) {
    sendJson(res, 400, { error: birthday.error });
    return;
  }

  const result = await store.write((db) => {
    if (
      db.users.some(
        (candidate) => candidate.id !== user.id && sameUsername(candidate.username, username),
      )
    ) {
      return { error: "username_taken" };
    }
    const fresh = db.users.find((candidate) => candidate.id === user.id);
    if (!fresh) return { error: "not_found" };
    fresh.username = username;
    fresh.favourite_wood = favouriteWood;
    fresh.birthday_month = birthday.month;
    fresh.birthday_day = birthday.day;
    fresh.birthday_visible = birthdayVisible && Boolean(birthday.month && birthday.day);
    return { ok: true };
  });

  if (result.error) {
    sendJson(res, result.error === "not_found" ? 404 : 400, { error: result.error });
    return;
  }
  emitUserEvent(user.id, "app.changed", { reason: "profile.updated" });
  sendJson(res, 200, appState(currentUserFromId(user.id)));
}

async function updateSettings(user, res, body) {
  const snoozedUntil = cleanSnooze(body.notificationSnooze);
  if (snoozedUntil === undefined) {
    sendJson(res, 400, { error: "invalid_snooze" });
    return;
  }

  await store.write((db) => {
    const fresh = db.users.find((candidate) => candidate.id === user.id);
    if (fresh) fresh.notification_snoozed_until = snoozedUntil;
  });
  emitUserEvent(user.id, "app.changed", { reason: "settings.updated" });
  sendJson(res, 200, appState(currentUserFromId(user.id)));
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

async function createGroup(user, res, body) {
  const name = cleanGroupName(body.name);
  const memberIds = Array.isArray(body.memberIds) ? body.memberIds.map(String) : [];
  if (!name) {
    sendJson(res, 400, { error: "invalid_group_name" });
    return;
  }
  const memberState = canCreateGroupWith(store.db, user.id, memberIds);
  if (!memberState.ok) {
    sendJson(res, 400, { error: memberState.reason });
    return;
  }

  const group = await store.write((db) => {
    const now = nowIso();
    const entry = {
      id: id("group"),
      name,
      created_by: user.id,
      created_at: now,
      dissolved_at: null,
    };
    db.groups.push(entry);
    db.group_members.push({
      id: id("group_member"),
      group_id: entry.id,
      user_id: user.id,
      invited_by: user.id,
      status: "accepted",
      created_at: now,
      updated_at: now,
    });
    for (const memberId of memberState.memberIds) {
      db.group_members.push({
        id: id("group_member"),
        group_id: entry.id,
        user_id: memberId,
        invited_by: user.id,
        status: "pending",
        created_at: now,
        updated_at: now,
      });
    }
    return entry;
  });

  for (const memberId of memberState.memberIds) {
    await notifyAndPrune(memberId, groupInviteNotification(user, group), {
      event: "group.invite.created",
      groupId: group.id,
      invitedUserId: memberId,
    });
    emitUserEvent(memberId, "group.invite.created", {
      groupId: group.id,
      invitedBy: user.id,
    });
  }
  emitUserEvent(user.id, "app.changed", {
    reason: "group.created",
    groupId: group.id,
  });

  sendJson(res, 201, appState(user));
}

async function respondToGroupInvite(user, res, membershipId, action) {
  const result = await store.write((db) => {
    const membership = db.group_members.find(
      (member) =>
        member.id === membershipId &&
        member.user_id === user.id &&
        member.status === "pending",
    );
    if (!membership) return { error: "not_found" };
    membership.status = action === "accept" ? "accepted" : "declined";
    membership.updated_at = nowIso();
    const group = db.groups.find((candidate) => candidate.id === membership.group_id);
    return { membership, group };
  });
  if (result.error) {
    sendJson(res, 404, { error: result.error });
    return;
  }
  if (action === "accept" && result.membership.invited_by) {
    await notifyAndPrune(
      result.membership.invited_by,
      groupInviteAcceptedNotification(user, result.group),
      {
        event: "group.invite.accepted",
        groupId: result.membership.group_id,
        memberId: user.id,
      },
    );
  }
  emitUsersEvent([user.id, result.membership.invited_by], "app.changed", {
    reason: `group.invite.${action}`,
    groupId: result.membership.group_id,
    memberId: user.id,
  });
  sendJson(res, 200, appState(user));
}

async function requestFriend(user, res, body) {
  const username = cleanUsername(body.username);
  const result = await store.write((db) => {
    const recipient = db.users.find((candidate) => sameUsername(candidate.username, username));
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

  await notifyAndPrune(result.recipient.id, friendRequestNotification(user), {
    event: "friend_request.created",
    friendshipId: result.friendship.id,
    requesterId: user.id,
  });
  emitUsersEvent([user.id, result.recipient.id], "friend_request.created", {
    friendshipId: result.friendship.id,
    requesterId: user.id,
  });
  sendJson(res, 201, appState(user));
}

async function respondToFriendRequest(user, res, friendshipId, action) {
  let achievementUsers = [];
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
    if (action === "accept") {
      achievementUsers = [friendship.requester_id, friendship.addressee_id];
    }
    return { friendship };
  });
  if (result.error) {
    sendJson(res, 404, { error: result.error });
    return;
  }
  if (achievementUsers.length) {
    await evaluateAndNotifyAchievements(achievementUsers);
    await notifyAndPrune(
      result.friendship.requester_id,
      friendRequestAcceptedNotification(user),
      {
        event: "friend_request.accepted",
        friendshipId: result.friendship.id,
        accepterId: user.id,
      },
    );
  }
  emitUsersEvent(
    [result.friendship.requester_id, result.friendship.addressee_id],
    "app.changed",
    {
      reason: `friend_request.${action}`,
      friendshipId: result.friendship.id,
    },
  );
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
  emitUsersEvent([user.id, friendId], "app.changed", {
    reason: `friend.${action}`,
    friendId,
  });
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
  const wantsBirthday = Boolean(body.birthday);
  if (wantsBirthday && !birthdayWoodAvailable(store.db, user.id, recipientId)) {
    sendJson(res, 409, { error: "birthday_wood_unavailable" });
    return;
  }
  const variant = wantsBirthday
    ? {
        type: "birthday",
        label: "Birthday Wood",
        icon: "/notifications/wood-birthday.png",
      }
    : woodVariant({ holdMs, seasonal });
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
      seasonal: variant.type === "birthday" ? null : seasonal,
    });
    if (variant.type === "birthday") {
      notification.title = "Birthday Wood";
      notification.body = `${user.username} sent you a Birthday Wood`;
      notification.icon = variant.icon;
    }
    const result = await notifyAndPrune(recipientId, {
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
    }, {
      event: "wood.created",
      woodId: wood.id,
      recipientId,
    });
    debugLog("wood.push_result", {
      woodId: wood.id,
      recipientId,
      attempted: result.attempted,
      sent: result.sent,
      disabled: Boolean(result.disabled),
      staleCount: result.stale.length,
    });
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

  await evaluateAndNotifyAchievements([user.id], {
    [user.id]: { wood, streakResult, earnedAt: wood.sent_at },
  });
  if (wood.type === "birthday") {
    await evaluateAndNotifyAchievements([recipientId], {
      [recipientId]: { slugs: ["happy-birthday-to-me"], earnedAt: wood.sent_at },
    });
  }
  emitUserEvent(recipientId, "wood.received", {
    woodId: wood.id,
    friendId: user.id,
    type: wood.type,
  });
  emitUserEvent(user.id, "app.changed", {
    reason: "wood.sent",
    woodId: wood.id,
    friendId: recipientId,
  });
  sendJson(res, 201, appState(user));
}

async function sendGroupWood(user, res, groupId, body) {
  const group = store.db.groups.find((candidate) => candidate.id === groupId);
  if (!group || group.dissolved_at) {
    sendJson(res, 404, { error: "not_found" });
    return;
  }

  const state = canSendGroupWood(store.db, user.id, groupId);
  if (!state.ok) {
    sendJson(res, state.reason === "cooldown" ? 409 : 404, {
      error: state.reason,
      expiresAt: state.expiresAt,
    });
    return;
  }

  const seasonal = seasonalTheme(store.db);
  const holdMs = Number(body.holdMs || 0);
  const variant = woodVariant({ holdMs, seasonal });
  const wood = await store.write((db) => {
    const entry = {
      id: id("group_wood"),
      group_id: groupId,
      sender_id: user.id,
      sent_at: nowIso(),
      type: variant.type,
      label: variant.label,
      hold_duration_ms: holdMs,
    };
    db.group_woods.push(entry);
    return entry;
  });

  const notification = woodNotification({
    sender: `${user.username} in ${group.name}`,
    wood: variant.label,
    seasonal,
  });
  const recipients = groupMembers(store.db, groupId)
    .map((member) => member.user_id)
    .filter((memberId) => memberId !== user.id);
  for (const recipientId of recipients) {
    await notifyAndPrune(recipientId, {
      title: notification.title,
      body: notification.body,
      icon: notification.icon,
      badge: notification.badge,
      vibrate: notification.vibrate,
      actions: notification.actions,
      styleId: notification.id,
      url: `/?tab=groups&group=${encodeURIComponent(groupId)}`,
      groupId,
      woodId: wood.id,
    }, {
      event: "group_wood.created",
      woodId: wood.id,
      groupId,
      recipientId,
    });
    emitUserEvent(recipientId, "group_wood.received", {
      woodId: wood.id,
      groupId,
      senderId: user.id,
    });
  }

  debugLog("group_wood.created", {
    woodId: wood.id,
    groupId,
    groupName: group.name,
    senderId: user.id,
    senderUsername: user.username,
    recipients: recipients.length,
    type: variant.type,
  });
  emitUserEvent(user.id, "app.changed", {
    reason: "group_wood.sent",
    woodId: wood.id,
    groupId,
  });
  sendJson(res, 201, appState(user));
}

async function groupWoodHistory(user, res, groupId) {
  const state = canSendGroupWood(store.db, user.id, groupId);
  if (!state.ok && state.reason === "not_found") {
    sendJson(res, 404, { error: "not_found" });
    return;
  }
  if (state.reason === "not_member") {
    sendJson(res, 404, { error: "not_found" });
    return;
  }
  const group = store.db.groups.find((candidate) => candidate.id === groupId);
  const users = new Map(store.db.users.map((candidate) => [candidate.id, publicUser(candidate)]));
  const woods = groupWoods(store.db, groupId)
    .slice(-200)
    .map((wood) => ({
      id: wood.id,
      senderId: wood.sender_id,
      sender: users.get(wood.sender_id),
      sentAt: wood.sent_at,
      label: wood.label || "Wood",
      type: wood.type || "normal",
    }));
  sendJson(res, 200, {
    group: group ? publicGroup(group, user.id) : null,
    woods,
  });
}

async function notifyStreakMilestone(sender, recipient, count) {
  const senderResult = await notifyAndPrune(sender.id, {
    title: "Wood streak",
    body: `You and ${recipient.username} have a ${count}-day Wood streak!`,
    url: `/?friend=${encodeURIComponent(recipient.id)}`,
    friendId: recipient.id,
    streak: count,
  }, {
    event: "streak.milestone",
    friendId: recipient.id,
    count,
  });
  const recipientResult = await notifyAndPrune(recipient.id, {
    title: "Wood streak",
    body: `You and ${sender.username} have a ${count}-day Wood streak!`,
    url: `/?friend=${encodeURIComponent(sender.id)}`,
    friendId: sender.id,
    streak: count,
  }, {
    event: "streak.milestone",
    friendId: sender.id,
    count,
  });
  debugLog("streak.milestone", {
    senderId: sender.id,
    recipientId: recipient.id,
    count,
    senderSent: senderResult.sent,
    recipientSent: recipientResult.sent,
  });
}

async function evaluateAndNotifyAchievements(userIds, contextByUser = {}) {
  const uniqueUserIds = [...new Set(userIds)].filter(Boolean);
  for (const userId of uniqueUserIds) {
    const earned = await store.write((db) => evaluateAchievements(db, userId, contextByUser[userId] || {}));
    await notifyAchievements(userId, earned);
  }
}

async function notifyAchievements(userId, achievements) {
  if (!achievements.length) return;
  const user = store.db.users.find((candidate) => candidate.id === userId);
  if (!user) return;
  for (const achievement of achievements) {
    const result = await notifyAndPrune(userId, {
      title: "Achievement unlocked",
      body: `${achievement.name}: ${achievement.description}`,
      url: "/?tab=stats",
      achievement: achievement.slug,
    }, {
      event: "achievement.unlocked",
      achievement: achievement.slug,
    });
    debugLog("achievement.unlocked", {
      userId,
      username: user.username,
      achievement: achievement.slug,
      sent: result.sent,
      disabled: Boolean(result.disabled),
    });
    emitUserEvent(userId, "achievement.unlocked", {
      achievement: achievement.slug,
    });
  }
}

async function notifyAndPrune(recipientId, payload, context = {}) {
  const recipient = store.db.users.find((candidate) => candidate.id === recipientId);
  if (isSnoozed(recipient)) {
    debugLog("push.skipped_snoozed", {
      ...context,
      recipientId,
      snoozedUntil: recipient.notification_snoozed_until,
    });
    return { attempted: 0, sent: 0, disabled: false, stale: [], snoozed: true };
  }
  const result = await notifyUser(store.db, recipientId, payload);
  if (result.stale.length) {
    await store.write((db) => {
      db.push_subs = db.push_subs.filter((sub) => !result.stale.includes(sub.id));
    });
    debugLog("push.stale_pruned", {
      ...context,
      recipientId,
      staleCount: result.stale.length,
    });
  }
  return result;
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
    const reusable = Boolean(body.reusable);
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
          reusable,
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
    let targetId = null;
    await store.write((db) => {
      const target = db.users.find((candidate) => candidate.id === userAction[1]);
      if (!target || target.id === user.id) return;
      targetId = target.id;
      if (userAction[2] === "suspend") target.suspended = true;
      if (userAction[2] === "unsuspend") target.suspended = false;
      if (userAction[2] === "promote") target.role = "admin";
      if (userAction[2] === "demote") target.role = "user";
      if (userAction[2] === "delete") {
        target.suspended = true;
        target.deleted_at = nowIso();
      }
    });
    emitUsersEvent([user.id, targetId], "app.changed", {
      reason: `admin.user.${userAction[2]}`,
      userId: targetId,
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
    const result = await notifyAndPrune(target.id, {
      title: "Wood test",
      body: `${notification.title}: ${notification.body}`,
      icon: notification.icon,
      badge: notification.badge,
      vibrate: notification.vibrate,
      actions: notification.actions,
      styleId: notification.id,
      url: "/admin",
      test: true,
    }, {
      event: "push.admin_test",
      targetId: target.id,
    });
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

  const awardAchievement = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/achievements$/);
  if (req.method === "POST" && awardAchievement) {
    const target = store.db.users.find((candidate) => candidate.id === awardAchievement[1]);
    if (!target) {
      sendJson(res, 404, { error: "not_found" });
      return;
    }
    const slug = String(body.slug || "");
    const earned = await store.write((db) =>
      awardAchievements(db, target.id, [slug], nowIso()),
    );
    await notifyAchievements(target.id, earned);
    sendJson(res, 200, adminState());
    return;
  }

  const resetUserAchievements = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/achievements\/reset$/);
  if (req.method === "POST" && resetUserAchievements) {
    const target = store.db.users.find((candidate) => candidate.id === resetUserAchievements[1]);
    if (!target) {
      sendJson(res, 404, { error: "not_found" });
      return;
    }
    const resetCount = await store.write((db) => resetAchievements(db, target.id));
    debugLog("achievement.reset", {
      adminId: user.id,
      adminUsername: user.username,
      targetId: target.id,
      targetUsername: target.username,
      resetCount,
    });
    sendJson(res, 200, adminState());
    return;
  }

  const dissolveGroup = url.pathname.match(/^\/api\/admin\/groups\/([^/]+)\/dissolve$/);
  if (req.method === "POST" && dissolveGroup) {
    await store.write((db) => {
      const group = db.groups.find((candidate) => candidate.id === dissolveGroup[1]);
      if (group && !group.dissolved_at) group.dissolved_at = nowIso();
    });
    sendJson(res, 200, adminState());
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
    emitAllUsersEvent("app.changed", {
      reason: "admin.config.updated",
    });
    sendJson(res, 200, adminState());
    return;
  }

  sendJson(res, 404, { error: "not_found" });
}

async function deletePushSubscriptions(user, body = {}) {
  const endpoint = String(body.endpoint || "");
  const deleted = await store.write((db) => {
    const before = db.push_subs.length;
    db.push_subs = db.push_subs.filter((sub) => {
      if (sub.user_id !== user.id) return true;
      if (endpoint) return sub.endpoint !== endpoint;
      return false;
    });
    return before - db.push_subs.length;
  });
  debugLog("push.subscription.deleted_for_user", {
    userId: user.id,
    username: user.username,
    endpointHost: endpoint ? endpointHost(endpoint) : null,
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
      achievements_earned: achievementProgress(db, user.id).filter((achievement) => achievement.earned).length,
    })),
    groups: db.groups.map((group) => publicGroup(group)),
    invites: db.invites.map(publicInvite),
    config: db.config,
    notification_styles: notificationStyles(),
    achievements: achievementDefinitions(),
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
    reusable: Boolean(invite.reusable),
    revoked_at: invite.revoked_at,
    status: invite.revoked_at
      ? "revoked"
      : invite.reusable
        ? isPast(invite.expires_at)
          ? "expired"
          : "reusable"
      : invite.used_at
        ? "used"
        : isPast(invite.expires_at)
          ? "expired"
          : "unused",
  };
}

function isInviteUsable(invite) {
  return Boolean(
    invite &&
      (invite.reusable || !invite.used_at) &&
      !invite.revoked_at &&
      !isPast(invite.expires_at),
  );
}

function publicGroup(group, viewerId = null) {
  if (!group) return null;
  const members = groupMembers(store.db, group.id, null);
  const acceptedMembers = members.filter((member) => member.status === "accepted");
  const pendingMembers = members.filter((member) => member.status === "pending");
  return {
    id: group.id,
    name: group.name,
    created_by: group.created_by,
    created_at: group.created_at,
    dissolved_at: group.dissolved_at || null,
    members: acceptedMembers.map((member) =>
      publicUser(store.db.users.find((user) => user.id === member.user_id)),
    ).filter(Boolean),
    pendingMembers: pendingMembers.map((member) =>
      publicUser(store.db.users.find((user) => user.id === member.user_id)),
    ).filter(Boolean),
    wood: viewerId ? visibleGroupWoodState(store.db, viewerId, group.id) : null,
    stats: groupStats(store.db, group.id),
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

function editableProfile(user) {
  return {
    ...publicProfile(user, { includePrivate: true }),
    favouriteWoodOptions: FAVOURITE_WOODS,
  };
}

function publicProfile(user, { includePrivate = false } = {}) {
  const hasBirthday = Boolean(user.birthday_month && user.birthday_day);
  const showBirthday = includePrivate || Boolean(user.birthday_visible);
  return {
    id: user.id,
    username: user.username,
    memberSince: user.created_at,
    favouriteWood: cleanFavouriteWood(user.favourite_wood) || "",
    birthdayMonth: showBirthday ? user.birthday_month || null : null,
    birthdayDay: showBirthday ? user.birthday_day || null : null,
    birthdayVisible: Boolean(user.birthday_visible),
    hasBirthday: includePrivate ? hasBirthday : showBirthday && hasBirthday,
    isBirthdayToday: showBirthday && isBirthdayToday(user),
  };
}

function privateSettings(db, userId) {
  const user = db.users.find((candidate) => candidate.id === userId);
  return {
    notificationSnoozedUntil: user?.notification_snoozed_until || null,
    mutedFriends: (db.mutes || [])
      .filter((mute) => mute.muter_id === userId)
      .map((mute) => publicUser(db.users.find((candidate) => candidate.id === mute.muted_id)))
      .filter(Boolean)
      .sort((a, b) => a.username.localeCompare(b.username)),
  };
}

function cleanFavouriteWood(value) {
  const clean = String(value || "").trim().toLowerCase();
  if (!clean) return "";
  return FAVOURITE_WOODS.includes(clean) ? clean : null;
}

function sameUsername(left, right) {
  return usernameKey(left) === usernameKey(right);
}

function cleanBirthday(body) {
  const monthRaw = body.birthdayMonth;
  const dayRaw = body.birthdayDay;
  if (
    (monthRaw === null || monthRaw === undefined || monthRaw === "") &&
    (dayRaw === null || dayRaw === undefined || dayRaw === "")
  ) {
    return { month: null, day: null };
  }
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isInteger(month) || !Number.isInteger(day)) return { error: "invalid_birthday" };
  if (month < 1 || month > 12) return { error: "invalid_birthday" };
  const maxDay = new Date(2024, month, 0).getDate();
  if (day < 1 || day > maxDay) return { error: "invalid_birthday" };
  return { month, day };
}

function cleanSnooze(value) {
  const now = Date.now();
  if (value === "off" || value === null || value === false || value === "") return null;
  if (value === "1h") return new Date(now + 60 * 60 * 1000).toISOString();
  if (value === "8h") return new Date(now + 8 * 60 * 60 * 1000).toISOString();
  if (value === "tomorrow") {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    return tomorrow.toISOString();
  }
  if (value === "forever") return FOREVER_SNOOZE_UNTIL;
  return undefined;
}

function isSnoozed(user) {
  if (!user?.notification_snoozed_until) return false;
  return Date.parse(user.notification_snoozed_until) > Date.now();
}

function isBirthdayToday(user, date = new Date()) {
  if (!user?.birthday_month || !user?.birthday_day) return false;
  return date.getMonth() + 1 === Number(user.birthday_month) &&
    date.getDate() === Number(user.birthday_day);
}

function birthdayWoodAvailable(db, senderId, recipientId, date = new Date()) {
  const recipient = db.users.find((candidate) => candidate.id === recipientId);
  if (!recipient || !recipient.birthday_visible || !isBirthdayToday(recipient, date)) {
    return false;
  }
  return !(db.woods || []).some(
    (wood) =>
      wood.sender_id === senderId &&
      wood.recipient_id === recipientId &&
      wood.type === "birthday" &&
      sameLocalDay(wood.sent_at, date),
  );
}

function sameLocalDay(iso, date) {
  const left = new Date(iso);
  return left.getFullYear() === date.getFullYear() &&
    left.getMonth() === date.getMonth() &&
    left.getDate() === date.getDate();
}

function cleanGroupName(value) {
  const name = String(value || "").trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 40) return "";
  return name;
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function handleRealtimeStream(user, req, res) {
  req.socket.setTimeout(0);
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-store, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  res.write("retry: 5000\n\n");
  res.write(`: connected ${new Date().toISOString()}\n\n`);

  const client = {
    id: id("realtime"),
    res,
    heartbeat: setInterval(() => {
      res.write(`: heartbeat ${new Date().toISOString()}\n\n`);
    }, REALTIME_HEARTBEAT_MS),
  };
  let clients = realtimeClients.get(user.id);
  if (!clients) {
    clients = new Set();
    realtimeClients.set(user.id, clients);
  }
  clients.add(client);
  debugLog("realtime.connected", {
    userId: user.id,
    username: user.username,
    clients: clients.size,
  });

  req.on("close", () => {
    clearInterval(client.heartbeat);
    clients.delete(client);
    if (!clients.size) realtimeClients.delete(user.id);
    debugLog("realtime.disconnected", {
      userId: user.id,
      username: user.username,
      clients: clients.size,
    });
  });
}

function emitUsersEvent(userIds, event, payload = {}) {
  for (const userId of new Set(userIds.filter(Boolean))) {
    emitUserEvent(userId, event, payload);
  }
}

function emitAllUsersEvent(event, payload = {}) {
  for (const user of store.db.users) {
    emitUserEvent(user.id, event, payload);
  }
}

function emitUserEvent(userId, event, payload = {}) {
  const clients = realtimeClients.get(userId);
  if (!clients?.size) return;
  const message = formatSseEvent(event, payload);
  for (const client of clients) {
    client.res.write(message);
  }
}

function formatSseEvent(event, payload) {
  realtimeEventId += 1;
  const eventName = String(event || "app.changed").replace(/[^a-z0-9_.-]/gi, "");
  const data = JSON.stringify({
    ...payload,
    at: nowIso(),
  });
  return `id: ${realtimeEventId}\nevent: ${eventName}\ndata: ${data}\n\n`;
}
