export const LONG_WOOD_MAX_MS = 10000;
export const LONG_WOOD_FAIL_MS = 11000;
export const LONG_WOOD_MIN_MS = 2000;
export const LONG_WOOD_MAX_LABEL_MS = 9250;
const STREAK_MILESTONES = [7, 30, 100, 365];

import { id } from "./ids.js";
import { config } from "./config.js";
import {
  WOOD_NOTIFICATION_BODIES,
  WOOD_NOTIFICATION_PRESETS,
  WOOD_NOTIFICATION_STYLES,
  WOOD_NOTIFICATION_TITLES,
} from "./notificationCopy.js";

export function getAcceptedFriendIds(db, userId) {
  return db.friendships
    .filter((friendship) => {
      if (friendship.status !== "accepted") return false;
      return (
        friendship.requester_id === userId || friendship.addressee_id === userId
      );
    })
    .map((friendship) =>
      friendship.requester_id === userId
        ? friendship.addressee_id
        : friendship.requester_id,
    );
}

export function findFriendship(db, a, b) {
  return db.friendships.find(
    (friendship) =>
      (friendship.requester_id === a && friendship.addressee_id === b) ||
      (friendship.requester_id === b && friendship.addressee_id === a),
  );
}

export function isBlockedBetween(db, a, b) {
  const friendship = findFriendship(db, a, b);
  return Boolean(friendship && friendship.status === "blocked");
}

export function canSendWood(db, senderId, recipientId, now = Date.now()) {
  const friendship = findFriendship(db, senderId, recipientId);
  if (!friendship || friendship.status !== "accepted") {
    return { ok: false, reason: "not_friends" };
  }

  const cooldownMs = Number(db.config.cooldown_hours || 24) * 60 * 60 * 1000;
  const lastSent = latestWood(db, senderId, recipientId);
  if (!lastSent) return { ok: true };

  const lastReply = latestWood(db, recipientId, senderId);
  if (lastReply && Date.parse(lastReply.sent_at) > Date.parse(lastSent.sent_at)) {
    return { ok: true };
  }

  const expiresAt = Date.parse(lastSent.sent_at) + cooldownMs;
  if (now >= expiresAt) return { ok: true };

  return {
    ok: false,
    reason: "cooldown",
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

export function latestWood(db, senderId, recipientId) {
  return db.woods
    .filter(
      (wood) =>
        wood.sender_id === senderId && wood.recipient_id === recipientId,
    )
    .sort((a, b) => Date.parse(b.sent_at) - Date.parse(a.sent_at))[0];
}

export function visibleWoodState(db, viewerId, friendId, now = Date.now()) {
  const state = canSendWood(db, viewerId, friendId, now);
  const incoming = latestWood(db, friendId, viewerId);
  const outgoing = latestWood(db, viewerId, friendId);
  const needsReply =
    incoming &&
    (!outgoing || Date.parse(incoming.sent_at) > Date.parse(outgoing.sent_at));

  return {
    canWood: state.ok,
    cooldownExpiresAt: state.ok ? null : state.expiresAt || null,
    needsReply: Boolean(needsReply),
  };
}

export function woodVariant({ holdMs = 0, seasonal = null } = {}) {
  if (seasonal) return { type: "seasonal", label: seasonal.label };
  if (holdMs >= LONG_WOOD_MIN_MS) {
    const capped = Math.min(holdMs, LONG_WOOD_MAX_MS);
    const label = longWoodLabel(capped);
    return {
      type: "long",
      label,
    };
  }
  return { type: "normal", label: "Wood" };
}

function longWoodLabel(holdMs) {
  if (holdMs >= LONG_WOOD_MAX_LABEL_MS) return "Max Length Loooong Wood";
  if (holdMs >= 7000) return "Looong Wood";
  if (holdMs >= 4500) return "Loong Wood";
  return "Long Wood";
}

export function seasonalTheme(db, date = new Date()) {
  if (!db.config.seasonal_enabled) return null;
  const mmdd = date.toISOString().slice(5, 10);
  return db.config.seasonal_themes.find((theme) => theme.date === mmdd) || null;
}

export function woodNotification({
  sender,
  wood = "Wood",
  seasonal = null,
  styleId = null,
} = {}) {
  const style = notificationStyle(styleId || "classic");
  if (seasonal?.notification) {
    return {
      title: wood,
      body: applyWoodTemplate(seasonal.notification, { sender, wood }),
      ...style,
    };
  }

  const preset = randomItem(WOOD_NOTIFICATION_PRESETS);
  if (preset) {
    return {
      title: applyWoodTemplate(preset.title, { sender, wood }),
      body: applyWoodTemplate(preset.body, { sender, wood }),
      ...style,
    };
  }

  return {
    title: applyWoodTemplate(randomItem(WOOD_NOTIFICATION_TITLES), { sender, wood }),
    body: applyWoodTemplate(randomItem(WOOD_NOTIFICATION_BODIES), { sender, wood }),
    ...style,
  };
}

export function notificationStyles() {
  return WOOD_NOTIFICATION_STYLES.map((style) => ({ ...style }));
}

export function updatePairStreakAfterWood(db, senderId, recipientId, sentAt = new Date()) {
  db.streaks ||= [];
  const nowMs = toMs(sentAt);
  const streak = ensurePairStreak(db, senderId, recipientId, sentAt);
  const currentWood = {
    sender_id: senderId,
    recipient_id: recipientId,
    sent_at: new Date(nowMs).toISOString(),
  };
  const previous = pairStreakState(db, senderId, recipientId, nowMs, { exclude: currentWood });
  const next = pairStreakState(db, senderId, recipientId, nowMs);
  const previousCount = previous.current_streak;
  const previousLastExchangeAt = previous.last_exchange_at;

  streak.current_streak = next.current_streak;
  streak.longest_streak = next.longest_streak;
  streak.last_exchange_at = next.last_exchange_at;
  streak.at_risk = next.at_risk;
  streak.updated_at = new Date(nowMs).toISOString();

  const incremented = streak.current_streak > previousCount;
  const milestone = incremented ? nextMilestone(streak) : null;
  return {
    streak,
    incremented,
    milestone,
    previousCount,
    previousLastExchangeAt,
    sentAt: new Date(nowMs).toISOString(),
  };
}

export function rebuildStreaksFromWoods(db) {
  const milestonesByPair = new Map((db.streaks || []).map((streak) => [
    pairKey(streak.user_a_id, streak.user_b_id),
    Array.isArray(streak.milestones_sent) ? streak.milestones_sent : [],
  ]));
  db.streaks = [];
  const woods = [...(db.woods || [])].sort((a, b) => toMs(a.sent_at) - toMs(b.sent_at));
  const replayDb = { ...db, woods: [], streaks: [] };
  for (const wood of woods) {
    wood.streak_incremented = false;
    wood.streak_count_after = null;
    replayDb.woods.push(wood);
    const result = updatePairStreakAfterWood(
      replayDb,
      wood.sender_id,
      wood.recipient_id,
      wood.sent_at,
    );
    if (result.incremented) {
      wood.streak_incremented = true;
      wood.streak_count_after = result.streak.current_streak;
    }
  }
  db.streaks = replayDb.streaks;
  for (const streak of db.streaks) {
    streak.milestones_sent = milestonesByPair.get(pairKey(streak.user_a_id, streak.user_b_id)) || [];
  }
}

export function pairStats(db, viewerId, friendId, now = Date.now()) {
  const woods = woodsBetween(db, viewerId, friendId);
  const streak = visibleStreak(db, viewerId, friendId, now);
  return {
    sent: woods.filter((wood) => wood.sender_id === viewerId).length,
    received: woods.filter((wood) => wood.recipient_id === viewerId).length,
    current_streak: streak.current_streak,
    longest_streak: streak.longest_streak,
    at_risk: streak.at_risk,
    first_wood_at: woods[0]?.sent_at || null,
    last_wood_at: woods.at(-1)?.sent_at || null,
  };
}

export function userStats(db, userId, now = Date.now()) {
  const friendIds = getAcceptedFriendIds(db, userId);
  const sent = db.woods.filter((wood) => wood.sender_id === userId);
  const received = db.woods.filter((wood) => wood.recipient_id === userId);
  const visibleStreaks = friendIds.map((friendId) => visibleStreak(db, userId, friendId, now));
  const favourite = favouriteWooder(db, userId, friendIds);
  const user = db.users.find((candidate) => candidate.id === userId);

  return {
    woods_sent: sent.length,
    woods_received: received.length,
    longest_streak: Math.max(0, ...visibleStreaks.map((streak) => streak.longest_streak)),
    current_longest_streak: Math.max(
      0,
      ...visibleStreaks.map((streak) => streak.current_streak),
    ),
    favourite_wooder: favourite,
    long_woods_sent: sent.filter((wood) => wood.type === "long").length,
    seasonal_woods_sent: sent.filter((wood) => wood.type === "seasonal").length,
    friends: friendIds.length,
    member_since: user?.created_at || null,
  };
}

export function visibleStreak(db, a, b, now = Date.now()) {
  const existing = findPairStreak(db, a, b);
  if (!existing) {
    return {
      current_streak: 0,
      longest_streak: 0,
      last_exchange_at: null,
      at_risk: false,
    };
  }
  const copy = { ...existing };
  refreshStreak(copy, now);
  return {
    current_streak: copy.current_streak,
    longest_streak: copy.longest_streak,
    last_exchange_at: copy.last_exchange_at,
    at_risk: copy.at_risk,
  };
}

export function streakMilestoneValue(count) {
  if (STREAK_MILESTONES.includes(count)) return count;
  if (count > 365 && count % 365 === 0) return count;
  return null;
}

function ensurePairStreak(db, a, b, sentAt) {
  const [userA, userB] = orderedPair(a, b);
  const existing = findPairStreak(db, a, b);
  if (existing) return existing;

  const streak = {
    id: id("streak"),
    user_a_id: userA,
    user_b_id: userB,
    current_streak: 0,
    longest_streak: 0,
    last_exchange_at: null,
    at_risk: false,
    milestones_sent: [],
    updated_at: new Date(toMs(sentAt)).toISOString(),
  };
  db.streaks.push(streak);
  return streak;
}

function findPairStreak(db, a, b) {
  const key = pairKey(a, b);
  return (db.streaks || []).find(
    (streak) => pairKey(streak.user_a_id, streak.user_b_id) === key,
  );
}

function refreshStreak(streak, now) {
  if (!streak.last_exchange_at) {
    streak.current_streak = 0;
    streak.at_risk = false;
    return;
  }
  const today = localDateKey(now);
  const lastExchangeDay = localDateKey(streak.last_exchange_at);
  if (lastExchangeDay === today) {
    streak.at_risk = false;
    return;
  }
  if (lastExchangeDay !== addDateKey(today, -1)) {
    streak.current_streak = 0;
    streak.at_risk = false;
    return;
  }
  streak.at_risk = Boolean(streak.current_streak);
}

function nextMilestone(streak) {
  const value = streakMilestoneValue(streak.current_streak);
  if (!value) return null;
  streak.milestones_sent ||= [];
  if (streak.milestones_sent.includes(value)) return null;
  streak.milestones_sent.push(value);
  return value;
}

function favouriteWooder(db, userId, friendIds) {
  let best = null;
  for (const friendId of friendIds) {
    const count = woodsBetween(db, userId, friendId).length;
    if (!count) continue;
    const user = db.users.find((candidate) => candidate.id === friendId);
    if (!user) continue;
    if (!best || count > best.woods_exchanged) {
      best = { id: user.id, username: user.username, woods_exchanged: count };
    }
  }
  return best;
}

function pairStreakState(db, a, b, now, options = {}) {
  const today = localDateKey(now);
  const yesterday = addDateKey(today, -1);
  const mutualDays = mutualExchangeDays(db, a, b, toMs(now), options.exclude);
  let longest = 0;
  let run = 0;
  let previousKey = null;
  let latest = null;

  for (const day of mutualDays) {
    if (day.key > today) continue;
    run = previousKey && day.key === addDateKey(previousKey, 1) ? run + 1 : 1;
    longest = Math.max(longest, run);
    latest = { ...day, run };
    previousKey = day.key;
  }

  const isCurrent = latest && (latest.key === today || latest.key === yesterday);
  const current_streak = isCurrent ? latest.run : 0;
  return {
    current_streak,
    longest_streak: longest,
    last_exchange_at: latest?.latest_at || null,
    at_risk: Boolean(current_streak && latest.key === yesterday),
  };
}

function mutualExchangeDays(db, a, b, nowMs, exclude) {
  const days = new Map();
  let skippedExcluded = false;

  for (const wood of woodsBetween(db, a, b)) {
    if (toMs(wood.sent_at) > nowMs) continue;
    if (!skippedExcluded && matchesExcludedWood(wood, exclude)) {
      skippedExcluded = true;
      continue;
    }

    const key = localDateKey(wood.sent_at);
    const day = days.get(key) || {
      key,
      a_to_b: false,
      b_to_a: false,
      latest_at: null,
    };
    if (wood.sender_id === a && wood.recipient_id === b) day.a_to_b = true;
    if (wood.sender_id === b && wood.recipient_id === a) day.b_to_a = true;
    if (!day.latest_at || toMs(wood.sent_at) > toMs(day.latest_at)) {
      day.latest_at = new Date(toMs(wood.sent_at)).toISOString();
    }
    days.set(key, day);
  }

  return [...days.values()]
    .filter((day) => day.a_to_b && day.b_to_a)
    .sort((left, right) => left.key.localeCompare(right.key));
}

function matchesExcludedWood(wood, exclude) {
  if (!exclude) return false;
  if (exclude.id && wood.id === exclude.id) return true;
  return wood.sender_id === exclude.sender_id &&
    wood.recipient_id === exclude.recipient_id &&
    toMs(wood.sent_at) === toMs(exclude.sent_at);
}

function localDateKey(value, timeZone = config.timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(toMs(value)));
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function addDateKey(key, days) {
  const date = new Date(`${key}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function woodsBetween(db, a, b) {
  return (db.woods || [])
    .filter(
      (wood) =>
        (wood.sender_id === a && wood.recipient_id === b) ||
        (wood.sender_id === b && wood.recipient_id === a),
    )
    .sort((left, right) => toMs(left.sent_at) - toMs(right.sent_at));
}

function pairKey(a, b) {
  return orderedPair(a, b).join(":");
}

function orderedPair(a, b) {
  return [a, b].sort();
}

function toMs(value) {
  if (typeof value === "number") return value;
  return Date.parse(value);
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function notificationStyle(styleId) {
  const style =
    WOOD_NOTIFICATION_STYLES.find((candidate) => candidate.id === styleId) ||
    WOOD_NOTIFICATION_STYLES[0];
  return {
    ...style,
    badge: "/notifications/wood-badge.png",
    actions: [{ action: "open", title: "Open Wood" }],
  };
}

function applyWoodTemplate(template, values) {
  return String(template)
    .replaceAll("{sender}", values.sender || "Someone")
    .replaceAll("{wood}", values.wood || "Wood");
}
