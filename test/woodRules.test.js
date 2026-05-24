import assert from "node:assert/strict";
import test from "node:test";
import {
  achievementProgress,
  ensureAchievementDefinitions,
  evaluateAchievements,
  resetAchievements,
} from "../src/achievements.js";
import {
  canCreateGroupWith,
  canSendGroupWood,
  visibleGroupWoodState,
} from "../src/groupRules.js";
import {
  canSendWood,
  notificationStyles,
  pairStats,
  updatePairStreakAfterWood,
  userStats,
  visibleStreak,
  visibleWoodState,
  woodNotification,
  woodVariant,
} from "../src/woodRules.js";
import {
  WOOD_NOTIFICATION_BODIES,
  WOOD_NOTIFICATION_PRESETS,
  WOOD_NOTIFICATION_TITLES,
} from "../src/notificationCopy.js";
import {
  friendRequestAcceptedNotification,
  friendRequestNotification,
  groupInviteAcceptedNotification,
  groupInviteNotification,
  inviteUsedNotification,
} from "../src/eventNotifications.js";
import { cleanUsername, isValidUsername } from "../src/usernames.js";

function dbWithWoods(woods = []) {
  return {
    config: { cooldown_hours: 24, seasonal_enabled: true, seasonal_themes: [] },
    friendships: [
      {
        id: "friendship_1",
        requester_id: "a",
        addressee_id: "b",
        status: "accepted",
      },
    ],
    woods,
    streaks: [],
    achievements_def: [],
    achievements_earned: [],
    groups: [],
    group_members: [],
    group_woods: [],
    users: [
      { id: "a", username: "alice", created_at: "2026-05-01T00:00:00.000Z" },
      { id: "b", username: "bob", created_at: "2026-05-01T00:00:00.000Z" },
    ],
  };
}

test("a user can wood an accepted friend with no prior outgoing wood", () => {
  assert.equal(canSendWood(dbWithWoods(), "a", "b").ok, true);
});

test("usernames allow dotted friend handles", () => {
  assert.equal(cleanUsername(" YNG.RAT.BOI "), "yng.rat.boi");
  assert.equal(isValidUsername("yng.rat.boi"), true);
  assert.equal(isValidUsername("yng-rat_boi"), true);
  assert.equal(isValidUsername("no"), false);
  assert.equal(isValidUsername("rat boi"), false);
});

test("groups can only invite existing accepted friends", () => {
  const db = dbWithWoods();

  assert.equal(canCreateGroupWith(db, "a", ["b"]).ok, true);
  assert.equal(canCreateGroupWith(db, "a", []).reason, "group_needs_members");
  assert.equal(canCreateGroupWith(db, "a", ["c"]).reason, "friends_only");
});

test("group wood cooldown clears when another member woods back", () => {
  const db = dbWithWoods();
  db.groups.push({
    id: "group_1",
    name: "Friday Woods",
    created_by: "a",
    created_at: "2026-05-22T00:00:00.000Z",
    dissolved_at: null,
  });
  db.group_members.push(
    {
      id: "member_1",
      group_id: "group_1",
      user_id: "a",
      status: "accepted",
    },
    {
      id: "member_2",
      group_id: "group_1",
      user_id: "b",
      status: "accepted",
    },
  );
  db.group_woods.push({
    id: "group_wood_1",
    group_id: "group_1",
    sender_id: "a",
    sent_at: "2026-05-22T00:00:00.000Z",
    type: "normal",
    label: "Wood",
  });

  const blocked = canSendGroupWood(db, "a", "group_1", Date.parse("2026-05-22T01:00:00.000Z"));
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, "cooldown");
  assert.equal(visibleGroupWoodState(db, "b", "group_1").needsReply, true);

  db.group_woods.push({
    id: "group_wood_2",
    group_id: "group_1",
    sender_id: "b",
    sent_at: "2026-05-22T01:01:00.000Z",
    type: "normal",
    label: "Wood",
  });

  assert.equal(
    canSendGroupWood(db, "a", "group_1", Date.parse("2026-05-22T01:02:00.000Z")).ok,
    true,
  );
});

test("achievement definitions can be earned from wood volume", () => {
  const db = dbWithWoods([
    {
      sender_id: "a",
      recipient_id: "b",
      sent_at: "2026-05-22T00:00:00.000Z",
      type: "normal",
    },
  ]);
  ensureAchievementDefinitions(db);

  const earned = evaluateAchievements(db, "a", {
    earnedAt: "2026-05-22T00:00:01.000Z",
  });
  const progress = achievementProgress(db, "a");

  assert.deepEqual(earned.map((achievement) => achievement.slug), [
    "first-knock",
    "youve-got-a-friend",
  ]);
  assert.equal(progress.find((achievement) => achievement.slug === "first-knock").earned, true);
});

test("achievement definitions refresh renamed copy", () => {
  const db = dbWithWoods();
  db.achievements_def.push({
    id: "achievement_old",
    slug: "early-bird",
    name: "Early Bird",
    description: "Send a Wood between 5am and 6am",
    icon: "sun",
    criteria_type: "special",
    criteria_value: "early_bird",
  });

  ensureAchievementDefinitions(db);

  const definition = db.achievements_def.find((achievement) => achievement.slug === "early-bird");
  assert.equal(definition.name, "Morning Wood");
  assert.equal(definition.description, "Send a Wood before 7am");
  assert.equal(definition.icon, "am");
});

test("admin can reset earned achievements for one user", () => {
  const db = dbWithWoods([
    {
      sender_id: "a",
      recipient_id: "b",
      sent_at: "2026-05-22T00:00:00.000Z",
      type: "normal",
    },
    {
      sender_id: "b",
      recipient_id: "a",
      sent_at: "2026-05-22T00:01:00.000Z",
      type: "normal",
    },
  ]);
  ensureAchievementDefinitions(db);
  evaluateAchievements(db, "a");
  evaluateAchievements(db, "b");

  const resetCount = resetAchievements(db, "a");

  assert.ok(resetCount > 0);
  assert.equal(achievementProgress(db, "a").some((achievement) => achievement.earned), false);
  assert.equal(achievementProgress(db, "b").some((achievement) => achievement.earned), true);
});

test("achievements cover special reply and long wood rituals", () => {
  const db = dbWithWoods([
    {
      sender_id: "b",
      recipient_id: "a",
      sent_at: "2026-05-22T00:00:00.000Z",
      type: "normal",
      hold_duration_ms: 0,
    },
    {
      sender_id: "a",
      recipient_id: "b",
      sent_at: "2026-05-22T00:00:08.000Z",
      type: "long",
      hold_duration_ms: 10000,
    },
  ]);
  ensureAchievementDefinitions(db);

  const earned = evaluateAchievements(db, "a", { wood: db.woods[1] });
  const slugs = earned.map((achievement) => achievement.slug);

  assert.ok(slugs.includes("long-game"));
  assert.ok(slugs.includes("speedy-reply"));
  assert.ok(slugs.includes("mutual"));
});

test("achievements cover sending and receiving Birthday Woods", () => {
  const db = dbWithWoods([
    {
      sender_id: "a",
      recipient_id: "b",
      sent_at: "2026-05-22T00:00:00.000Z",
      type: "birthday",
      label: "Birthday Wood",
    },
  ]);
  ensureAchievementDefinitions(db);

  const senderSlugs = evaluateAchievements(db, "a").map((achievement) => achievement.slug);
  const recipientSlugs = evaluateAchievements(db, "b").map((achievement) => achievement.slug);

  assert.ok(senderSlugs.includes("birthday-wood"));
  assert.ok(recipientSlugs.includes("happy-birthday-to-me"));
});

test("reply achievements are tied to the current Wood", () => {
  const db = dbWithWoods([
    {
      id: "old_incoming",
      sender_id: "b",
      recipient_id: "a",
      sent_at: "2026-05-22T00:00:00.000Z",
      type: "normal",
    },
    {
      id: "old_reply",
      sender_id: "a",
      recipient_id: "b",
      sent_at: "2026-05-22T00:00:08.000Z",
      type: "normal",
    },
    {
      id: "current",
      sender_id: "a",
      recipient_id: "b",
      sent_at: "2026-05-23T00:10:00.000Z",
      type: "normal",
    },
  ]);
  ensureAchievementDefinitions(db);

  const earned = evaluateAchievements(db, "a", { wood: db.woods[2] });
  const slugs = earned.map((achievement) => achievement.slug);

  assert.equal(slugs.includes("mutual"), false);
  assert.equal(slugs.includes("speedy-reply"), false);
  assert.equal(slugs.includes("fashionably-late"), false);
});

test("fashionably late requires saving a streak just before it breaks", () => {
  const onTime = dbWithWoods([
    {
      id: "incoming",
      sender_id: "b",
      recipient_id: "a",
      sent_at: "2026-05-23T23:50:00.000Z",
      type: "normal",
    },
    {
      id: "current",
      sender_id: "a",
      recipient_id: "b",
      sent_at: "2026-05-23T23:56:00.000Z",
      type: "normal",
    },
  ]);
  onTime.streaks.push({
    id: "streak_1",
    user_a_id: "a",
    user_b_id: "b",
    current_streak: 2,
    longest_streak: 2,
    last_exchange_at: "2026-05-22T00:00:00.000Z",
    at_risk: true,
    milestones_sent: [],
    updated_at: "2026-05-22T00:00:00.000Z",
  });
  ensureAchievementDefinitions(onTime);
  const onTimeStreakResult = updatePairStreakAfterWood(
    onTime,
    "a",
    "b",
    onTime.woods[1].sent_at,
  );

  const onTimeSlugs = evaluateAchievements(onTime, "a", {
    wood: onTime.woods[1],
    streakResult: onTimeStreakResult,
  })
    .map((achievement) => achievement.slug);

  assert.ok(onTimeSlugs.includes("mutual"));
  assert.ok(onTimeSlugs.includes("fashionably-late"));
  assert.equal(onTimeSlugs.includes("speedy-reply"), false);

  const tooLate = dbWithWoods([
    {
      id: "incoming",
      sender_id: "b",
      recipient_id: "a",
      sent_at: "2026-05-24T00:00:00.000Z",
      type: "normal",
    },
    {
      id: "current",
      sender_id: "a",
      recipient_id: "b",
      sent_at: "2026-05-24T00:01:00.000Z",
      type: "normal",
    },
  ]);
  tooLate.streaks.push({
    id: "streak_1",
    user_a_id: "a",
    user_b_id: "b",
    current_streak: 2,
    longest_streak: 2,
    last_exchange_at: "2026-05-22T00:00:00.000Z",
    at_risk: true,
    milestones_sent: [],
    updated_at: "2026-05-22T00:00:00.000Z",
  });
  ensureAchievementDefinitions(tooLate);
  const tooLateStreakResult = updatePairStreakAfterWood(
    tooLate,
    "a",
    "b",
    tooLate.woods[1].sent_at,
  );

  const tooLateSlugs = evaluateAchievements(tooLate, "a", {
    wood: tooLate.woods[1],
    streakResult: tooLateStreakResult,
  })
    .map((achievement) => achievement.slug);

  assert.equal(tooLateSlugs.includes("fashionably-late"), false);
});

test("morning wood secret unlocks before seven", () => {
  const localSixThirty = new Date(2026, 4, 22, 6, 30).toISOString();
  const db = dbWithWoods([
    {
      sender_id: "a",
      recipient_id: "b",
      sent_at: localSixThirty,
      type: "normal",
      hold_duration_ms: 0,
    },
  ]);
  ensureAchievementDefinitions(db);

  const earned = evaluateAchievements(db, "a");
  const slugs = earned.map((achievement) => achievement.slug);
  const morningWood = earned.find((achievement) => achievement.slug === "early-bird");

  assert.ok(slugs.includes("early-bird"));
  assert.equal(morningWood.name, "Morning Wood");
});

test("a user is on cooldown after sending until the timeout expires", () => {
  const db = dbWithWoods([
    {
      sender_id: "a",
      recipient_id: "b",
      sent_at: "2026-05-22T00:00:00.000Z",
    },
  ]);

  const result = canSendWood(db, "a", "b", Date.parse("2026-05-22T12:00:00.000Z"));

  assert.equal(result.ok, false);
  assert.equal(result.reason, "cooldown");
  assert.equal(result.expiresAt, "2026-05-23T00:00:00.000Z");
});

test("a reply clears the directional cooldown", () => {
  const db = dbWithWoods([
    {
      sender_id: "a",
      recipient_id: "b",
      sent_at: "2026-05-22T00:00:00.000Z",
    },
    {
      sender_id: "b",
      recipient_id: "a",
      sent_at: "2026-05-22T00:05:00.000Z",
    },
  ]);

  assert.equal(
    canSendWood(db, "a", "b", Date.parse("2026-05-22T00:06:00.000Z")).ok,
    true,
  );
});

test("visible state marks a friend as needing a reply", () => {
  const db = dbWithWoods([
    {
      sender_id: "b",
      recipient_id: "a",
      sent_at: "2026-05-22T00:00:00.000Z",
    },
  ]);

  assert.equal(visibleWoodState(db, "a", "b").needsReply, true);
});

test("long woods stretch the label from hold duration", () => {
  assert.deepEqual(woodVariant({ holdMs: 0 }), {
    type: "normal",
    label: "Wood",
  });
  assert.equal(woodVariant({ holdMs: 2800 }).type, "long");
  assert.match(woodVariant({ holdMs: 2800 }).label, /^Wo+d$/);
});

test("a mutual exchange starts a pair streak", () => {
  const db = dbWithWoods([
    {
      sender_id: "a",
      recipient_id: "b",
      sent_at: "2026-05-22T00:00:00.000Z",
    },
    {
      sender_id: "b",
      recipient_id: "a",
      sent_at: "2026-05-22T00:05:00.000Z",
    },
  ]);

  const result = updatePairStreakAfterWood(db, "b", "a", "2026-05-22T00:05:00.000Z");

  assert.equal(result.incremented, true);
  assert.equal(result.streak.current_streak, 1);
  assert.equal(
    visibleStreak(db, "a", "b", Date.parse("2026-05-22T00:05:00.000Z")).current_streak,
    1,
  );
});

test("one-sided woods do not increment a streak", () => {
  const db = dbWithWoods([
    {
      sender_id: "a",
      recipient_id: "b",
      sent_at: "2026-05-22T00:00:00.000Z",
    },
  ]);

  const result = updatePairStreakAfterWood(db, "a", "b", "2026-05-22T00:00:00.000Z");

  assert.equal(result.incremented, false);
  assert.equal(result.streak.current_streak, 0);
});

test("a stale streak breaks after forty eight hours without mutual exchange", () => {
  const db = dbWithWoods();
  db.streaks.push({
    id: "streak_1",
    user_a_id: "a",
    user_b_id: "b",
    current_streak: 4,
    longest_streak: 4,
    last_exchange_at: "2026-05-20T00:00:00.000Z",
    at_risk: false,
    milestones_sent: [],
    updated_at: "2026-05-20T00:00:00.000Z",
  });

  const streak = visibleStreak(db, "a", "b", Date.parse("2026-05-22T00:00:01.000Z"));

  assert.equal(streak.current_streak, 0);
  assert.equal(streak.longest_streak, 4);
  assert.equal(streak.at_risk, false);
});

test("a streak is at risk after twenty hours without a mutual exchange", () => {
  const db = dbWithWoods();
  db.streaks.push({
    id: "streak_1",
    user_a_id: "a",
    user_b_id: "b",
    current_streak: 2,
    longest_streak: 2,
    last_exchange_at: "2026-05-22T00:00:00.000Z",
    at_risk: false,
    milestones_sent: [],
    updated_at: "2026-05-22T00:00:00.000Z",
  });

  const streak = visibleStreak(db, "a", "b", Date.parse("2026-05-22T20:00:00.000Z"));

  assert.equal(streak.current_streak, 2);
  assert.equal(streak.at_risk, true);
});

test("pair stats count sent and received woods", () => {
  const db = dbWithWoods([
    {
      sender_id: "a",
      recipient_id: "b",
      sent_at: "2026-05-22T00:00:00.000Z",
      type: "normal",
    },
    {
      sender_id: "b",
      recipient_id: "a",
      sent_at: "2026-05-22T00:05:00.000Z",
      type: "long",
    },
  ]);

  const stats = pairStats(db, "a", "b");

  assert.equal(stats.sent, 1);
  assert.equal(stats.received, 1);
  assert.equal(stats.first_wood_at, "2026-05-22T00:00:00.000Z");
  assert.equal(stats.last_wood_at, "2026-05-22T00:05:00.000Z");
});

test("user stats summarize personal activity", () => {
  const db = dbWithWoods([
    {
      sender_id: "a",
      recipient_id: "b",
      sent_at: "2026-05-22T00:00:00.000Z",
      type: "long",
    },
    {
      sender_id: "b",
      recipient_id: "a",
      sent_at: "2026-05-22T00:05:00.000Z",
      type: "seasonal",
    },
  ]);

  const stats = userStats(db, "a");

  assert.equal(stats.woods_sent, 1);
  assert.equal(stats.woods_received, 1);
  assert.equal(stats.long_woods_sent, 1);
  assert.equal(stats.seasonal_woods_sent, 0);
  assert.equal(stats.friends, 1);
  assert.deepEqual(stats.favourite_wooder, {
    id: "b",
    username: "bob",
    woods_exchanged: 2,
  });
});

test("wood notifications substitute sender and wood labels", () => {
  const notification = woodNotification({ sender: "alice", wood: "Wooooood" });

  assert.equal(notification.title.includes("{"), false);
  assert.equal(notification.body.includes("{"), false);
  assert.match(notification.icon, /^\/notifications\/.+\.png$/);
  assert.equal(notification.badge, "/notifications/wood-badge.png");
  assert.deepEqual(notification.actions, [{ action: "open", title: "Open Wood" }]);
});

test("seasonal wood notifications override random templates", () => {
  const notification = woodNotification({
    sender: "alice",
    wood: "Christmas Wood",
    seasonal: {
      notification: "{sender} sent you a {wood}",
    },
  });

  assert.equal(notification.title, "Christmas Wood");
  assert.equal(notification.body, "alice sent you a Christmas Wood");
  assert.equal(notification.badge, "/notifications/wood-badge.png");
});

test("wood notifications can use a requested visual style", () => {
  const notification = woodNotification({
    sender: "alice",
    wood: "Wood",
    styleId: "mail",
  });

  assert.equal(notification.id, "mail");
  assert.equal(notification.icon, "/notifications/wood-mail.png");
  assert.equal("image" in notification, false);
});

test("notification styles expose generated PNG variants", () => {
  assert.deepEqual(
    notificationStyles().map((style) => style.id),
    ["classic", "mail", "alert", "long", "summon"],
  );
});

test("notification copy has a large backend-owned template pool", () => {
  assert.ok(WOOD_NOTIFICATION_TITLES.length >= 80);
  assert.ok(WOOD_NOTIFICATION_BODIES.length >= 200);
  assert.ok(WOOD_NOTIFICATION_PRESETS.length >= 70);
});

test("social notifications point users at open-worthy events", () => {
  const alice = { id: "a", username: "alice", role: "admin" };
  const bob = { id: "b", username: "bob", role: "user" };
  const group = { id: "group_1", name: "Friday Woods" };
  const invite = { id: "invite_1" };

  assert.deepEqual(friendRequestNotification(alice), {
    title: "Wood friend request",
    body: "alice wants to Wood with you",
    url: "/",
    friendId: "a",
  });
  assert.deepEqual(friendRequestAcceptedNotification(bob), {
    title: "Wood friend accepted",
    body: "bob accepted your friend request",
    url: "/?friend=b",
    friendId: "b",
  });
  assert.deepEqual(groupInviteNotification(alice, group), {
    title: "Wood group invite",
    body: "alice invited you to Friday Woods",
    url: "/?tab=groups",
    groupId: "group_1",
  });
  assert.deepEqual(groupInviteAcceptedNotification(bob, group), {
    title: "Wood group",
    body: "bob joined Friday Woods",
    url: "/?tab=groups&group=group_1",
    groupId: "group_1",
    userId: "b",
  });
  assert.deepEqual(inviteUsedNotification(bob, invite, alice), {
    title: "Wood invite used",
    body: "bob joined Wood with your invite",
    url: "/admin",
    inviteId: "invite_1",
    userId: "b",
  });
});
