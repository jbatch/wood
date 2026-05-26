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
  hashToken,
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
import { id, inviteCode, resetToken } from "./ids.js";
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
  activeGroupForUser,
  canCreateGroupWith,
  canSendGroupWood,
  groupDepositTotal,
  groupInviteCandidates,
  groupMembers,
  groupStats,
  groupWoods,
  isLegacyGroup,
  legacyGroupMembershipCount,
  pendingGroupInvites,
  visibleGroups,
  visibleGroupWoodState,
  WOODPILE_TIERS,
} from "./groupRules.js";
import { notifyUser, pushPublicConfig } from "./push.js";
import { serveStatic } from "./static.js";
import { debugEntries, debugLog, endpointHost } from "./debugLog.js";
import { cleanUsername, isValidUsername, usernameKey } from "./usernames.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");
const store = await createStore();
const realtimeClients = new Map();
let realtimeEventId = 0;
const REALTIME_HEARTBEAT_MS = 25000;
const NOTIFICATION_HISTORY_LIMIT = 100;
const NOTIFICATION_BACKFILL_DAYS = 30;
const BUG_REPORT_MIN_LENGTH = 1;
const BUG_REPORT_MAX_LENGTH = 1200;
const PWA_DISPLAY_MODES = new Set([
  "browser",
  "standalone",
  "minimal-ui",
  "fullscreen",
  "window-controls-overlay",
]);
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
const MILE_HIGH_WOOD_COOKIE = "wood_mile_high_attempt";
const ACHIEVEMENT_EVENT_TYPES = new Set([
  "history_view",
  "history_keyboard_self_control",
  "profile_self_control",
  "long_wood_cancelled",
  "long_wood_overcooked",
  "super_wood_declined",
]);

await backfillNotificationsIfNeeded();
await cleanNotificationCopyIfNeeded();

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

  if (req.method === "POST" && url.pathname === "/api/password-resets/verify") {
    verifyPasswordReset(res, body);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/password-resets/complete") {
    await completePasswordReset(req, res, body);
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
    const cookies = parseCookies(req.headers.cookie || "");
    if (cookies[MILE_HIGH_WOOD_COOKIE]) {
      await recordAchievementEvent(user.id, "mile_high_wood", null, {
        source: "offline_send_marker",
      });
    }
    await evaluateAndNotifyAchievements([user.id], {
      [user.id]: { now: nowIso() },
    });
    const headers = cookies[MILE_HIGH_WOOD_COOKIE]
      ? { "Set-Cookie": `${MILE_HIGH_WOOD_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0` }
      : {};
    sendJson(res, 200, appState(user), headers);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/notifications") {
    sendJson(res, 200, notificationState(user.id));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/notifications/read-all") {
    await markNotificationsRead(user.id);
    sendJson(res, 200, notificationState(user.id));
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

  if (req.method === "POST" && url.pathname === "/api/password") {
    await updatePassword(user, res, body);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/client-status") {
    await updateClientStatus(user, body);
    sendNoContent(res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/achievement-events") {
    await createAchievementEvent(user, res, body);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/bug-reports") {
    await createBugReport(user, res, body);
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

  if (req.method === "POST" && url.pathname === "/api/groups/migration-notice/read") {
    await dismissGroupMigrationNotice(user, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/groups/tutorial/read") {
    await dismissGroupTutorial(user, res);
    return;
  }

  const groupInviteMembers = url.pathname.match(/^\/api\/groups\/([^/]+)\/invites$/);
  if (req.method === "POST" && groupInviteMembers) {
    await inviteGroupMembers(user, res, groupInviteMembers[1], body);
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
      pwa_installed_at: null,
      pwa_last_seen_at: null,
      pwa_display_mode: null,
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

function verifyPasswordReset(res, body) {
  const reset = passwordResetFromToken(body.token);
  if (!reset) {
    sendJson(res, 404, { error: "invalid_reset_link" });
    return;
  }
  const user = store.db.users.find((candidate) => candidate.id === reset.user_id);
  sendJson(res, 200, {
    valid: true,
    username: user?.username || "someone",
    expires_at: reset.expires_at,
  });
}

async function completePasswordReset(req, res, body) {
  const token = String(body.token || "");
  const password = String(body.password || "");
  const reset = passwordResetFromToken(token);
  if (!reset) {
    sendJson(res, 404, { error: "invalid_reset_link" });
    return;
  }
  if (password.length < 8) {
    sendJson(res, 400, { error: "weak_password" });
    return;
  }

  const result = await store.write(async (db) => {
    const freshReset = db.password_resets.find(
      (candidate) => candidate.token_hash === hashToken(token),
    );
    const target = freshReset
      ? db.users.find((candidate) => candidate.id === freshReset.user_id)
      : null;
    if (!freshReset || !target || freshReset.used_at || isPast(freshReset.expires_at)) {
      return { error: "invalid_reset_link" };
    }
    if (target.deleted_at) return { error: "invalid_reset_link" };
    if (target.suspended) return { error: "suspended" };
    target.password_hash = await hashPassword(password);
    target.last_active_at = nowIso();
    freshReset.used_at = nowIso();
    return { user: target };
  });

  if (result.error) {
    sendJson(res, result.error === "suspended" ? 403 : 404, { error: result.error });
    return;
  }

  setCookie(res, SESSION_COOKIE, signSession(result.user.id), {
    maxAge: SESSION_MAX_AGE_SECONDS,
    secure: req.headers["x-forwarded-proto"] === "https",
  });
  sendJson(res, 200, { user: publicUser(result.user) });
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
    groupSystem: {
      version: 2,
      legacyGroupCount: legacyGroupMembershipCount(db, user.id),
      migrationNoticeSeen: Boolean(user.groups_v2_notice_seen_at),
      tutorialSeen: Boolean(user.groups_v2_tutorial_seen_at),
      migratedAt: db.config.groups_v2_migrated_at || null,
      tiers: WOODPILE_TIERS,
    },
    groupInvites: pendingGroupInvites(db, user.id)
      .map((member) => {
        const group = db.groups.find((candidate) => candidate.id === member.group_id);
        if (!group || group.dissolved_at || isLegacyGroup(group)) return null;
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
    notifications: {
      unread_count: unreadNotificationCount(db, user.id),
    },
    push: pushPublicConfig(),
  };
}

function notificationState(userId) {
  return {
    unread_count: unreadNotificationCount(store.db, userId),
    notifications: visibleNotifications(store.db, userId),
  };
}

function visibleNotifications(db, userId) {
  return db.notifications
    .filter((notification) => notification.user_id === userId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
    .slice(0, NOTIFICATION_HISTORY_LIMIT)
    .map(publicNotification);
}

function publicNotification(notification) {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    url: notification.url || "",
    actor_id: notification.actor_id || null,
    data: safeJson(notification.data_json, {}),
    read_at: notification.read_at || null,
    created_at: notification.created_at,
  };
}

function unreadNotificationCount(db, userId) {
  return db.notifications.filter(
    (notification) => notification.user_id === userId && !notification.read_at,
  ).length;
}

async function markNotificationsRead(userId) {
  const readAt = nowIso();
  await store.write((db) => {
    for (const notification of db.notifications) {
      if (notification.user_id === userId && !notification.read_at) {
        notification.read_at = readAt;
      }
    }
  });
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
    const favouriteChanged = (fresh.favourite_wood || "") !== favouriteWood;
    const profileChanged =
      fresh.username !== username ||
      favouriteChanged ||
      Number(fresh.birthday_month || 0) !== Number(birthday.month || 0) ||
      Number(fresh.birthday_day || 0) !== Number(birthday.day || 0) ||
      Boolean(fresh.birthday_visible) !== (birthdayVisible && Boolean(birthday.month && birthday.day));
    fresh.username = username;
    fresh.favourite_wood = favouriteWood;
    fresh.birthday_month = birthday.month;
    fresh.birthday_day = birthday.day;
    fresh.birthday_visible = birthdayVisible && Boolean(birthday.month && birthday.day);
    if (profileChanged) {
      db.achievement_events ||= [];
      db.achievement_events.push({
        id: id("ach_event"),
        user_id: user.id,
        type: "profile_changed",
        subject_id: null,
        meta_json: "{}",
        created_at: nowIso(),
      });
    }
    if (favouriteChanged && favouriteWood) {
      db.achievement_events ||= [];
      db.achievement_events.push({
        id: id("ach_event"),
        user_id: user.id,
        type: "favourite_wood_changed",
        subject_id: null,
        meta_json: JSON.stringify({ favouriteWood }),
        created_at: nowIso(),
      });
    }
    return { ok: true };
  });

  if (result.error) {
    sendJson(res, result.error === "not_found" ? 404 : 400, { error: result.error });
    return;
  }
  await evaluateAndNotifyAchievements([user.id]);
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
    if (fresh) {
      const changed = (fresh.notification_snoozed_until || null) !== (snoozedUntil || null);
      fresh.notification_snoozed_until = snoozedUntil;
      if (changed) {
        db.achievement_events ||= [];
        db.achievement_events.push({
          id: id("ach_event"),
          user_id: user.id,
          type: "settings_changed",
          subject_id: null,
          meta_json: "{}",
          created_at: nowIso(),
        });
      }
    }
  });
  await evaluateAndNotifyAchievements([user.id]);
  emitUserEvent(user.id, "app.changed", { reason: "settings.updated" });
  sendJson(res, 200, appState(currentUserFromId(user.id)));
}

async function updatePassword(user, res, body) {
  const currentPassword = String(body.currentPassword || "");
  const nextPassword = String(body.newPassword || "");
  if (nextPassword.length < 8) {
    sendJson(res, 400, { error: "weak_password" });
    return;
  }
  if (!(await verifyPassword(currentPassword, user.password_hash))) {
    sendJson(res, 401, { error: "invalid_current_password" });
    return;
  }

  await store.write(async (db) => {
    const fresh = db.users.find((candidate) => candidate.id === user.id);
    if (!fresh) return;
    fresh.password_hash = await hashPassword(nextPassword);
    fresh.last_active_at = nowIso();
    db.achievement_events ||= [];
    db.achievement_events.push({
      id: id("ach_event"),
      user_id: user.id,
      type: "password_changed",
      subject_id: null,
      meta_json: "{}",
      created_at: nowIso(),
    });
  });
  emitUserEvent(user.id, "app.changed", { reason: "password.updated" });
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

async function updateClientStatus(user, body) {
  const displayMode = cleanDisplayMode(body.displayMode);
  const installed = Boolean(body.installed);
  const pwaSeen = installed || displayMode !== "browser";
  const seenAt = nowIso();

  await store.write((db) => {
    const fresh = db.users.find((candidate) => candidate.id === user.id);
    if (!fresh) return;
    fresh.pwa_display_mode = displayMode;
    if (pwaSeen) {
      fresh.pwa_last_seen_at = seenAt;
      if (!fresh.pwa_installed_at) fresh.pwa_installed_at = seenAt;
    }
  });
}

async function createAchievementEvent(user, res, body) {
  const type = String(body.type || "");
  if (!ACHIEVEMENT_EVENT_TYPES.has(type)) {
    sendJson(res, 400, { error: "invalid_achievement_event" });
    return;
  }

  const subjectId = body.friendId ? String(body.friendId) : null;
  if (subjectId) {
    const friendship = findFriendship(store.db, user.id, subjectId);
    if (!friendship || friendship.status !== "accepted") {
      sendJson(res, 404, { error: "not_found" });
      return;
    }
  }

  await recordAchievementEvent(user.id, type, subjectId, body.meta || {});
  await evaluateAndNotifyAchievements([user.id]);
  sendJson(res, 200, appState(currentUserFromId(user.id)));
}

async function createBugReport(user, res, body) {
  const text = cleanBugReportText(body.text);
  if (!text) {
    sendJson(res, 400, { error: "invalid_bug_report" });
    return;
  }
  const freshUser = currentUserFromId(user.id);
  if (freshUser?.bug_reports_blocked_at) {
    sendJson(res, 403, { error: "bug_reports_blocked" });
    return;
  }

  const report = await store.write((db) => {
    const entry = {
      id: id("bug_report"),
      user_id: user.id,
      text,
      status: "open",
      created_at: nowIso(),
      closed_at: null,
      closed_by: null,
      close_reason: null,
    };
    db.bug_reports ||= [];
    db.bug_reports.push(entry);
    db.achievement_events ||= [];
    db.achievement_events.push({
      id: id("ach_event"),
      user_id: user.id,
      type: "bug_report_submitted",
      subject_id: entry.id,
      meta_json: JSON.stringify({ length: text.length }),
      created_at: entry.created_at,
    });
    return entry;
  });
  debugLog("bug_report.created", {
    reportId: report.id,
    userId: user.id,
    username: user.username,
    length: text.length,
  });
  await evaluateAndNotifyAchievements([user.id]);
  emitAdminAppChanged("bug_report.created", { reportId: report.id, userId: user.id });
  sendJson(res, 201, appState(currentUserFromId(user.id)));
}

async function recordAchievementEvent(userId, type, subjectId = null, meta = {}) {
  await store.write((db) => {
    db.achievement_events ||= [];
    db.achievement_events.push({
      id: id("ach_event"),
      user_id: userId,
      type,
      subject_id: subjectId || null,
      meta_json: JSON.stringify(meta || {}),
      created_at: nowIso(),
    });
  });
}

async function createGroup(user, res, body) {
  const fallbackName = `${user.username}'s Woodpile`;
  const name = cleanGroupName(body.name || fallbackName);
  const memberIds = getAcceptedFriendIds(store.db, user.id)
    .filter((memberId) => !activeGroupForUser(store.db, memberId));
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
      legacy_at: null,
      woodpile_adjustment: 0,
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
    await createNotification({
      user_id: memberId,
      type: "group.invite",
      title: `You were invited to ${group.name}`,
      body: `${user.username} started a pile and left room for you.`,
      url: "/?tab=groups",
      actor_id: user.id,
      data: { groupId: group.id, invitedBy: user.id },
      dedupe_key: `group_invite:${group.id}:${memberId}`,
    });
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

async function inviteGroupMembers(user, res, groupId, body) {
  const requestedIds = Array.isArray(body.memberIds)
    ? body.memberIds.map((memberId) => String(memberId))
    : null;
  const inviteState = groupInviteCandidates(store.db, user.id, groupId, requestedIds);
  if (!inviteState.ok) {
    sendJson(res, inviteState.reason === "not_member" ? 403 : 404, { error: inviteState.reason });
    return;
  }
  if (!inviteState.memberIds.length) {
    sendJson(res, 400, { error: "no_eligible_friends" });
    return;
  }

  const result = await store.write((db) => {
    const freshState = groupInviteCandidates(db, user.id, groupId, inviteState.memberIds);
    if (!freshState.ok) return freshState;
    const now = nowIso();
    const memberships = [];
    for (const memberId of freshState.memberIds) {
      let membership = db.group_members.find(
        (member) => member.group_id === groupId && member.user_id === memberId,
      );
      if (membership && membership.status === "declined") {
        membership.status = "pending";
        membership.invited_by = user.id;
        membership.updated_at = now;
      } else if (!membership) {
        membership = {
          id: id("group_member"),
          group_id: groupId,
          user_id: memberId,
          invited_by: user.id,
          status: "pending",
          created_at: now,
          updated_at: now,
        };
        db.group_members.push(membership);
      }
      if (membership?.status === "pending") memberships.push(membership);
    }
    return { group: freshState.group, memberships };
  });

  if (!result.ok && result.reason) {
    sendJson(res, result.reason === "not_member" ? 403 : 404, { error: result.reason });
    return;
  }
  if (!result.memberships.length) {
    sendJson(res, 400, { error: "no_eligible_friends" });
    return;
  }

  for (const membership of result.memberships) {
    await createNotification({
      user_id: membership.user_id,
      type: "group.invite",
      title: `You were invited to ${result.group.name}`,
      body: `${user.username} found more room in the pile.`,
      url: "/?tab=groups",
      actor_id: user.id,
      data: { groupId: result.group.id, invitedBy: user.id },
      dedupe_key: `group_invite:${result.group.id}:${membership.user_id}:${membership.updated_at}`,
    });
    await notifyAndPrune(membership.user_id, groupInviteNotification(user, result.group), {
      event: "group.invite.created",
      groupId: result.group.id,
      invitedUserId: membership.user_id,
    });
    emitUserEvent(membership.user_id, "group.invite.created", {
      groupId: result.group.id,
      invitedBy: user.id,
    });
  }

  emitUserEvent(user.id, "app.changed", {
    reason: "group.invites.created",
    groupId: result.group.id,
  });
  sendJson(res, 200, appState(currentUserFromId(user.id)));
}

async function dismissGroupMigrationNotice(user, res) {
  await store.write((db) => {
    const fresh = db.users.find((candidate) => candidate.id === user.id);
    if (fresh) fresh.groups_v2_notice_seen_at = nowIso();
  });
  sendJson(res, 200, appState(currentUserFromId(user.id)));
}

async function dismissGroupTutorial(user, res) {
  await store.write((db) => {
    const fresh = db.users.find((candidate) => candidate.id === user.id);
    if (fresh) fresh.groups_v2_tutorial_seen_at = nowIso();
  });
  sendJson(res, 200, appState(currentUserFromId(user.id)));
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
    const group = db.groups.find((candidate) => candidate.id === membership.group_id);
    if (!group || group.dissolved_at || isLegacyGroup(group)) return { error: "not_found" };
    if (
      action === "accept" &&
      activeGroupForUser(db, user.id) &&
      activeGroupForUser(db, user.id)?.id !== membership.group_id
    ) {
      return { error: "already_in_group" };
    }
    membership.status = action === "accept" ? "accepted" : "declined";
    membership.updated_at = nowIso();
    return { membership, group };
  });
  if (result.error) {
    sendJson(res, result.error === "already_in_group" ? 409 : 404, { error: result.error });
    return;
  }
  if (action === "accept") {
    await evaluateAndNotifyAchievements([user.id]);
  }
  if (action === "accept" && result.membership.invited_by) {
    await createNotification({
      user_id: result.membership.invited_by,
      type: "group.invite.accepted",
      title: `${user.username} joined ${result.group?.name || "your group"}`,
      body: "The room has more Wood now.",
      url: `/?tab=groups&group=${encodeURIComponent(result.membership.group_id)}`,
      actor_id: user.id,
      data: { groupId: result.membership.group_id, memberId: user.id },
      dedupe_key: `group_invite_accept:${result.membership.id}`,
    });
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
  await createNotification({
    user_id: result.recipient.id,
    type: "friend.request",
    title: `${user.username} wants to trade Wood`,
    body: "Friend request waiting.",
    url: "/?tab=friends",
    actor_id: user.id,
    data: { friendshipId: result.friendship.id, requesterId: user.id },
    dedupe_key: `friend_request:${result.friendship.id}`,
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
    await createNotification({
      user_id: result.friendship.requester_id,
      type: "friend.accepted",
      title: `${user.username} accepted your Wood request`,
      body: "A new Wood route has opened.",
      url: `/?friend=${encodeURIComponent(user.id)}`,
      actor_id: user.id,
      data: { friendshipId: result.friendship.id, friendId: user.id },
      dedupe_key: `friend_accept:${result.friendship.id}`,
    });
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
        db.achievement_events ||= [];
        db.achievement_events.push({
          id: id("ach_event"),
          user_id: user.id,
          type: "friend_muted",
          subject_id: friendId,
          meta_json: "{}",
          created_at: nowIso(),
        });
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
  if (action === "mute") await evaluateAndNotifyAchievements([user.id]);
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
    if (state.reason === "cooldown") {
      await recordAchievementEvent(user.id, "cooldown_attempt", recipientId, {
        expiresAt: state.expiresAt || null,
      });
      await evaluateAndNotifyAchievements([user.id]);
    } else if (state.reason === "not_friends") {
      await recordAchievementEvent(user.id, "unsolicited_wood", recipientId, {
        source: "non_friend_send_attempt",
      });
      await evaluateAndNotifyAchievements([user.id]);
    }
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

  await createNotification({
    user_id: recipientId,
    type: "wood.dm",
    title: `${user.username} sent you ${variant.label}`,
    body: streakResult.incremented
      ? `Wood streak: ${streakResult.streak.current_streak}`
      : "Direct Wood Received",
    url: `/?friend=${encodeURIComponent(user.id)}`,
    actor_id: user.id,
    data: { friendId: user.id, woodId: wood.id, type: wood.type },
    dedupe_key: `wood:${wood.id}:${recipientId}`,
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

  await evaluateAndNotifyAchievements([user.id, recipientId], {
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
  if (!group || group.dissolved_at || isLegacyGroup(group)) {
    sendJson(res, 404, { error: "not_found" });
    return;
  }

  const state = canSendGroupWood(store.db, user.id, groupId);
  if (!state.ok) {
    const missing = ["not_found", "not_member"].includes(state.reason);
    sendJson(res, missing ? 404 : 409, {
      error: state.reason,
      expiresAt: state.expiresAt,
    });
    return;
  }

  const wood = await store.write((db) => {
    const entry = {
      id: id("group_wood"),
      group_id: groupId,
      sender_id: user.id,
      sent_at: nowIso(),
      type: "deposit",
      label: "Deposited Wood",
      hold_duration_ms: 0,
      amount: state.depositCost || 1,
    };
    db.group_woods.push(entry);
    return entry;
  });

  const updatedGroup = store.db.groups.find((candidate) => candidate.id === groupId);
  const updatedStats = groupStats(store.db, groupId);
  const memberIds = groupMembers(store.db, groupId).map((member) => member.user_id);
  const recipients = memberIds.filter((memberId) => memberId !== user.id);
  for (const recipientId of recipients) {
    await createNotification({
      user_id: recipientId,
      type: "wood.group",
      title: "The Woodpile changed",
      body: `${user.username} deposited ${wood.amount} Wood. ${updatedStats.stage.name}: ${updatedStats.woods_sent}`,
      url: `/?tab=groups&group=${encodeURIComponent(groupId)}`,
      actor_id: user.id,
      data: { groupId, woodId: wood.id },
      dedupe_key: `group_wood:${wood.id}:${recipientId}`,
    });
    await notifyAndPrune(recipientId, {
      title: "The Woodpile changed",
      body: `${user.username} added ${wood.amount}. The pile is now everyone's problem.`,
      icon: "/notifications/wood-alert.png",
      badge: "/notifications/wood-badge.png",
      actions: [{ action: "open", title: "Inspect pile" }],
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
    groupName: updatedGroup?.name || group.name,
    senderId: user.id,
    senderUsername: user.username,
    recipients: recipients.length,
    pileSize: updatedStats.woods_sent,
    pileStage: updatedStats.stage.name,
    amount: wood.amount,
  });
  emitUserEvent(user.id, "app.changed", {
    reason: "group_wood.sent",
    woodId: wood.id,
    groupId,
  });
  await evaluateAndNotifyAchievements(memberIds);
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
      amount: Number(wood.amount || 1),
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
    await createNotification({
      user_id: userId,
      type: "achievement.unlocked",
      title: `Achievement unlocked: ${achievement.name}`,
      body: achievement.description,
      url: "/?tab=stats",
      data: { achievement: achievement.slug },
      dedupe_key: `achievement:${userId}:${achievement.slug}`,
      created_at: achievement.earned_at || nowIso(),
    });
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

function addNotification(db, options) {
  if (!options.user_id || !options.type || !options.title) return null;
  if (options.dedupe_key && db.notifications.some(
    (notification) => notification.dedupe_key === options.dedupe_key,
  )) {
    return null;
  }
  const notification = {
    id: id("notification"),
    user_id: options.user_id,
    type: options.type,
    title: options.title,
    body: options.body || "",
    url: options.url || "",
    actor_id: options.actor_id || null,
    data_json: JSON.stringify(options.data || {}),
    dedupe_key: options.dedupe_key || null,
    read_at: options.read_at || null,
    created_at: options.created_at || nowIso(),
  };
  db.notifications.push(notification);
  pruneNotificationsForUser(db, options.user_id);
  return notification;
}

function pruneNotificationsForUser(db, userId) {
  const userNotifications = db.notifications
    .filter((notification) => notification.user_id === userId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
  const keep = new Set(
    userNotifications.slice(0, NOTIFICATION_HISTORY_LIMIT).map((notification) => notification.id),
  );
  // TODO: Add periodic stale notification cleanup once this grows beyond per-user pruning.
  db.notifications = db.notifications.filter(
    (notification) => notification.user_id !== userId || keep.has(notification.id),
  );
}

async function createNotification(options) {
  const notification = await store.write((db) => addNotification(db, options));
  if (notification && !notification.read_at) {
    emitUserEvent(notification.user_id, "notifications.changed", {
      notificationId: notification.id,
      type: notification.type,
    });
  }
  return notification;
}

async function backfillNotificationsIfNeeded() {
  // TODO: Remove the one-time notification backfill after it has run in production.
  if (store.db.config.notification_backfilled_at) return;
  const backfilledAt = nowIso();
  const cutoffMs = Date.now() - NOTIFICATION_BACKFILL_DAYS * 24 * 60 * 60 * 1000;
  const created = await store.write((db) => {
    let count = 0;
    const users = new Map(db.users.map((user) => [user.id, user]));
    const groups = new Map(db.groups.map((group) => [group.id, group]));
    const achievements = new Map(db.achievements_def.map((achievement) => [achievement.id, achievement]));

    for (const wood of db.woods) {
      if (Date.parse(wood.sent_at) < cutoffMs) continue;
      const sender = users.get(wood.sender_id);
      if (!sender || !users.has(wood.recipient_id)) continue;
      const notification = addNotification(db, {
        user_id: wood.recipient_id,
        type: "wood.dm",
        title: `${sender.username} sent you ${wood.label || "Wood"}`,
        body: "Direct Wood Received",
        url: `/?friend=${encodeURIComponent(sender.id)}`,
        actor_id: sender.id,
        data: { friendId: sender.id, woodId: wood.id },
        dedupe_key: `backfill:wood:${wood.id}:${wood.recipient_id}`,
        read_at: backfilledAt,
        created_at: wood.sent_at,
      });
      if (notification) count += 1;
    }

    for (const wood of db.group_woods) {
      if (Date.parse(wood.sent_at) < cutoffMs) continue;
      const sender = users.get(wood.sender_id);
      const group = groups.get(wood.group_id);
      if (!sender || !group) continue;
      const recipients = db.group_members
        .filter(
          (member) =>
            member.group_id === wood.group_id &&
            member.status === "accepted" &&
            member.user_id !== wood.sender_id,
        )
        .map((member) => member.user_id);
      for (const recipientId of recipients) {
        const notification = addNotification(db, {
          user_id: recipientId,
          type: "wood.group",
          title: `${sender.username} sent ${wood.label || "Wood"} to ${group.name}`,
          body: "Group Wood Received",
          url: `/?tab=groups&group=${encodeURIComponent(group.id)}`,
          actor_id: sender.id,
          data: { groupId: group.id, woodId: wood.id },
          dedupe_key: `backfill:group_wood:${wood.id}:${recipientId}`,
          read_at: backfilledAt,
          created_at: wood.sent_at,
        });
        if (notification) count += 1;
      }
    }

    for (const friendship of db.friendships) {
      if (friendship.status !== "pending") continue;
      const requester = users.get(friendship.requester_id);
      if (!requester || !users.has(friendship.addressee_id)) continue;
      const notification = addNotification(db, {
        user_id: friendship.addressee_id,
        type: "friend.request",
        title: `${requester.username} wants to trade Wood`,
        body: "Friend request waiting.",
        url: "/?tab=friends",
        actor_id: requester.id,
        data: { friendshipId: friendship.id, requesterId: requester.id },
        dedupe_key: `backfill:friend_request:${friendship.id}`,
        read_at: null,
        created_at: friendship.created_at,
      });
      if (notification) count += 1;
    }

    for (const member of db.group_members) {
      if (member.status !== "pending") continue;
      const inviter = users.get(member.invited_by);
      const group = groups.get(member.group_id);
      if (!group || !users.has(member.user_id)) continue;
      const notification = addNotification(db, {
        user_id: member.user_id,
        type: "group.invite",
        title: `You were invited to ${group.name}`,
        body: inviter ? `${inviter.username} is assembling Wood.` : "Group invite waiting.",
        url: "/?tab=groups",
        actor_id: inviter?.id || null,
        data: { groupId: group.id, membershipId: member.id },
        dedupe_key: `backfill:group_invite:${member.id}`,
        read_at: null,
        created_at: member.created_at,
      });
      if (notification) count += 1;
    }

    for (const earned of db.achievements_earned) {
      if (Date.parse(earned.earned_at) < cutoffMs) continue;
      const achievement = achievements.get(earned.achievement_id);
      if (!achievement || !users.has(earned.user_id)) continue;
      const notification = addNotification(db, {
        user_id: earned.user_id,
        type: "achievement.unlocked",
        title: `Achievement unlocked: ${achievement.name}`,
        body: achievement.description,
        url: "/?tab=stats",
        data: { achievement: achievement.slug },
        dedupe_key: `backfill:achievement:${earned.id}`,
        read_at: backfilledAt,
        created_at: earned.earned_at,
      });
      if (notification) count += 1;
    }

    db.config.notification_backfilled_at = backfilledAt;
    return count;
  });
  debugLog("notifications.backfilled", {
    count: created,
    days: NOTIFICATION_BACKFILL_DAYS,
  });
}

async function cleanNotificationCopyIfNeeded() {
  if (store.db.config.notification_copy_cleaned_at) return;
  const cleanedAt = nowIso();
  const changed = await store.write((db) => {
    let count = 0;
    for (const notification of db.notifications) {
      if (
        notification.type === "wood.dm" &&
        ["", "Recent Wood history, now with a mailbox.", "Direct Wood received."].includes(notification.body)
      ) {
        notification.body = "Direct Wood Received";
        count += 1;
      }
      if (
        notification.type === "wood.group" &&
        ["", "Group Wood history, now neatly stacked.", "Group Wood received."].includes(notification.body)
      ) {
        notification.body = "Group Wood Received";
        count += 1;
      }
    }
    db.config.notification_copy_cleaned_at = cleanedAt;
    return count;
  });
  debugLog("notifications.copy_cleaned", {
    count: changed,
  });
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

  const bugReportClose = url.pathname.match(/^\/api\/admin\/bug-reports\/([^/]+)\/close$/);
  if (req.method === "POST" && bugReportClose) {
    const status = body.status === "legitimate" ? "legitimate" : "not_bug";
    const result = await store.write((db) => {
      const report = (db.bug_reports || []).find((candidate) => candidate.id === bugReportClose[1]);
      if (!report) return { error: "not_found" };
      report.status = status;
      report.closed_at = nowIso();
      report.closed_by = user.id;
      report.close_reason = status;
      if (status === "legitimate") {
        db.achievement_events ||= [];
        db.achievement_events.push({
          id: id("ach_event"),
          user_id: report.user_id,
          type: "bug_report_valid",
          subject_id: report.id,
          meta_json: JSON.stringify({ closedBy: user.id }),
          created_at: report.closed_at,
        });
      }
      return { report };
    });
    if (result.error) {
      sendJson(res, 404, { error: result.error });
      return;
    }
    if (status === "legitimate") {
      await evaluateAndNotifyAchievements([result.report.user_id]);
    }
    debugLog("bug_report.closed", {
      adminId: user.id,
      adminUsername: user.username,
      reportId: result.report.id,
      reporterId: result.report.user_id,
      status,
    });
    emitUsersEvent([user.id, result.report.user_id], "app.changed", {
      reason: "bug_report.closed",
      reportId: result.report.id,
      status,
    });
    sendJson(res, 200, adminState());
    return;
  }

  const bugReportBlock = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/bug-reports\/(block|unblock)$/);
  if (req.method === "POST" && bugReportBlock) {
    const result = await store.write((db) => {
      const target = db.users.find((candidate) => candidate.id === bugReportBlock[1]);
      if (!target) return { error: "not_found" };
      target.bug_reports_blocked_at = bugReportBlock[2] === "block" ? nowIso() : null;
      return { target };
    });
    if (result.error) {
      sendJson(res, 404, { error: result.error });
      return;
    }
    debugLog("bug_report.user_block_updated", {
      adminId: user.id,
      adminUsername: user.username,
      targetId: result.target.id,
      targetUsername: result.target.username,
      blocked: Boolean(result.target.bug_reports_blocked_at),
    });
    emitUsersEvent([user.id, result.target.id], "app.changed", {
      reason: "bug_report.user_block_updated",
      userId: result.target.id,
    });
    sendJson(res, 200, adminState());
    return;
  }

  const createPasswordReset = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/password-reset$/);
  if (req.method === "POST" && createPasswordReset) {
    const target = store.db.users.find((candidate) => candidate.id === createPasswordReset[1]);
    if (!target || target.deleted_at) {
      sendJson(res, 404, { error: "not_found" });
      return;
    }
    const token = resetToken();
    const expiresAt = addDaysIso(1);
    await store.write((db) => {
      db.password_resets.push({
        id: id("reset"),
        user_id: target.id,
        token_hash: hashToken(token),
        expires_at: expiresAt,
        used_at: null,
        created_by: user.id,
        created_at: nowIso(),
      });
    });
    debugLog("password_reset.created", {
      adminId: user.id,
      adminUsername: user.username,
      userId: target.id,
      username: target.username,
      expiresAt,
    });
    sendJson(res, 200, {
      link: `${config.baseUrl}/reset-password?token=${encodeURIComponent(token)}`,
      expires_at: expiresAt,
      admin: adminState(),
    });
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

  const setGroupTier = url.pathname.match(/^\/api\/admin\/groups\/([^/]+)\/tier$/);
  if (req.method === "POST" && setGroupTier) {
    const tierIndex = Number(body.tierIndex);
    if (!Number.isInteger(tierIndex) || !WOODPILE_TIERS[tierIndex]) {
      sendJson(res, 400, { error: "invalid_tier" });
      return;
    }
    const result = await store.write((db) => {
      const group = db.groups.find((candidate) => candidate.id === setGroupTier[1]);
      if (!group || group.dissolved_at || isLegacyGroup(group)) return { error: "not_found" };
      const target = WOODPILE_TIERS[tierIndex].minWood;
      group.woodpile_adjustment = target - groupDepositTotal(db, group.id);
      return { group, target, tier: WOODPILE_TIERS[tierIndex] };
    });
    if (result.error) {
      sendJson(res, 404, { error: result.error });
      return;
    }
    debugLog("group.admin_tier_set", {
      adminId: user.id,
      adminUsername: user.username,
      groupId: result.group.id,
      target: result.target,
      tier: result.tier.name,
    });
    await evaluateAndNotifyAchievements(
      groupMembers(store.db, result.group.id).map((member) => member.user_id),
    );
    emitGroupAppChanged(result.group.id, "group.admin_tier_set");
    sendJson(res, 200, { admin: adminState(), app: appState(currentUserFromId(user.id)) });
    return;
  }

  const grantGroupWood = url.pathname.match(/^\/api\/admin\/groups\/([^/]+)\/grant-wood$/);
  if (req.method === "POST" && grantGroupWood) {
    const amount = clamp(Number(body.amount || 999), 1, 10000);
    const result = await store.write((db) => {
      const group = db.groups.find((candidate) => candidate.id === grantGroupWood[1]);
      if (!group || group.dissolved_at || isLegacyGroup(group)) return { error: "not_found" };
      const membership = db.group_members.find((member) =>
        member.group_id === group.id &&
        member.user_id === user.id &&
        member.status === "accepted"
      );
      if (!membership) return { error: "not_member" };
      const entry = {
        id: id("group_wood"),
        group_id: group.id,
        sender_id: user.id,
        sent_at: nowIso(),
        type: "admin_stockpile_grant",
        label: "Admin Test Wood",
        hold_duration_ms: 0,
        amount,
      };
      db.group_woods.push(entry);
      return { group, entry };
    });
    if (result.error) {
      sendJson(res, result.error === "not_member" ? 403 : 404, { error: result.error });
      return;
    }
    debugLog("group.admin_stockpile_granted", {
      adminId: user.id,
      adminUsername: user.username,
      groupId: result.group.id,
      amount: result.entry.amount,
    });
    emitUserEvent(user.id, "app.changed", {
      reason: "group.admin_stockpile_granted",
      groupId: result.group.id,
    });
    sendJson(res, 200, { admin: adminState(), app: appState(currentUserFromId(user.id)) });
    return;
  }

  const resetGroupCooldown = url.pathname.match(/^\/api\/admin\/groups\/([^/]+)\/reset-my-cooldown$/);
  if (req.method === "POST" && resetGroupCooldown) {
    const result = await store.write((db) => {
      const group = db.groups.find((candidate) => candidate.id === resetGroupCooldown[1]);
      if (!group || group.dissolved_at || isLegacyGroup(group)) return { error: "not_found" };
      db.group_woods.push({
        id: id("group_wood"),
        group_id: group.id,
        sender_id: user.id,
        sent_at: nowIso(),
        type: "admin_cooldown_reset",
        label: "Admin Cooldown Reset",
        hold_duration_ms: 0,
        amount: 0,
      });
      return { group };
    });
    if (result.error) {
      sendJson(res, 404, { error: result.error });
      return;
    }
    debugLog("group.admin_cooldown_reset", {
      adminId: user.id,
      adminUsername: user.username,
      groupId: result.group.id,
    });
    emitUserEvent(user.id, "app.changed", {
      reason: "group.admin_cooldown_reset",
      groupId: result.group.id,
    });
    sendJson(res, 200, { admin: adminState(), app: appState(currentUserFromId(user.id)) });
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
      pwa_installed: Boolean(user.pwa_installed_at),
      pwa_installed_at: user.pwa_installed_at,
      pwa_last_seen_at: user.pwa_last_seen_at,
      pwa_display_mode: user.pwa_display_mode || "unknown",
      bug_reports_blocked_at: user.bug_reports_blocked_at || null,
      bug_reports_open: (db.bug_reports || [])
        .filter((report) => report.user_id === user.id && report.status === "open").length,
      push_subscription_count: db.push_subs.filter((sub) => sub.user_id === user.id).length,
      push_setup: db.push_subs.some((sub) => sub.user_id === user.id),
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
    achievement_stats: adminAchievementStats(db),
    bug_reports: adminBugReports(db),
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

function adminAchievementStats(db) {
  return achievementDefinitions().map((definition) => {
    const stored = db.achievements_def.find((candidate) => candidate.slug === definition.slug);
    const earned = stored
      ? (db.achievements_earned || []).filter((entry) => entry.achievement_id === stored.id)
      : [];
    return {
      ...definition,
      earned_count: earned.length,
      users: earned
        .map((entry) => {
          const user = db.users.find((candidate) => candidate.id === entry.user_id);
          if (!user) return null;
          return {
            ...publicUser(user),
            earned_at: entry.earned_at,
          };
        })
        .filter(Boolean)
        .sort((a, b) => Date.parse(b.earned_at) - Date.parse(a.earned_at)),
    };
  });
}

function adminBugReports(db) {
  return [...(db.bug_reports || [])]
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .map((report) => {
      const reporter = db.users.find((candidate) => candidate.id === report.user_id);
      const closer = db.users.find((candidate) => candidate.id === report.closed_by);
      return {
        id: report.id,
        text: report.text,
        status: report.status || "open",
        created_at: report.created_at,
        closed_at: report.closed_at || null,
        close_reason: report.close_reason || null,
        user: publicUser(reporter),
        closed_by: publicUser(closer),
      };
    });
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
  const stats = groupStats(store.db, group.id);
  const inviteableFriends = viewerId
    ? groupInviteCandidates(store.db, viewerId, group.id).memberIds || []
    : [];
  return {
    id: group.id,
    name: group.name,
    created_by: group.created_by,
    owner: publicUser(store.db.users.find((user) => user.id === group.created_by)),
    created_at: group.created_at,
    dissolved_at: group.dissolved_at || null,
    legacy_at: group.legacy_at || null,
    woodpile_adjustment: Number(group.woodpile_adjustment || 0),
    members: acceptedMembers.map((member) =>
      publicUser(store.db.users.find((user) => user.id === member.user_id)),
    ).filter(Boolean),
    pendingMembers: pendingMembers.map((member) =>
      publicUser(store.db.users.find((user) => user.id === member.user_id)),
    ).filter(Boolean),
    inviteableFriends: inviteableFriends.map((userId) =>
      publicUser(store.db.users.find((user) => user.id === userId)),
    ).filter(Boolean).sort((a, b) => a.username.localeCompare(b.username)),
    wood: viewerId ? visibleGroupWoodState(store.db, viewerId, group.id) : null,
    stats: {
      ...stats,
      ranks: stats.ranks.map((rank) => ({
        ...rank,
        user: publicUser(store.db.users.find((user) => user.id === rank.userId)),
      })),
    },
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

function passwordResetFromToken(token) {
  const tokenHash = hashToken(token);
  const reset = store.db.password_resets.find((candidate) => candidate.token_hash === tokenHash);
  if (!reset || reset.used_at || isPast(reset.expires_at)) return null;
  const user = store.db.users.find((candidate) => candidate.id === reset.user_id);
  if (!user || user.deleted_at) return null;
  return reset;
}

function cleanDisplayMode(value) {
  const displayMode = String(value || "browser");
  return PWA_DISPLAY_MODES.has(displayMode) ? displayMode : "browser";
}

function safeJson(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
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
    bugReportsBlockedAt: user?.bug_reports_blocked_at || null,
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

function cleanBugReportText(value) {
  const text = String(value || "").trim().replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n");
  if (text.length < BUG_REPORT_MIN_LENGTH || text.length > BUG_REPORT_MAX_LENGTH) return "";
  return text;
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

function emitGroupAppChanged(groupId, reason) {
  emitUsersEvent(
    groupMembers(store.db, groupId).map((member) => member.user_id),
    "app.changed",
    { reason, groupId },
  );
}

function emitAllUsersEvent(event, payload = {}) {
  for (const user of store.db.users) {
    emitUserEvent(user.id, event, payload);
  }
}

function emitAdminAppChanged(reason, payload = {}) {
  emitUsersEvent(
    store.db.users.filter((user) => user.role === "admin").map((user) => user.id),
    "app.changed",
    { reason, ...payload },
  );
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
