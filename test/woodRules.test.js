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
  groupInviteCandidates,
  personalStockpile,
  visibleGroupWoodState,
  WOODPILE_TIERS,
} from "../src/groupRules.js";
import {
  canSendWood,
  notificationStyles,
  pairStats,
  rebuildStreaksFromWoods,
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
import { cleanUsername, isValidUsername, usernameKey } from "../src/usernames.js";

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
    achievement_events: [],
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
  assert.equal(cleanUsername(" YNG.RAT.BOI "), "YNG.RAT.BOI");
  assert.equal(isValidUsername("yng.rat.boi"), true);
  assert.equal(isValidUsername("Yng.Rat.Boi"), true);
  assert.equal(isValidUsername("yng-rat_boi"), true);
  assert.equal(usernameKey("Yng.Rat.Boi"), usernameKey("yng.rat.boi"));
  assert.equal(isValidUsername("no"), false);
  assert.equal(isValidUsername("rat boi"), false);
});

test("groups can only invite existing accepted friends", () => {
  const db = dbWithWoods();

  assert.equal(canCreateGroupWith(db, "a", ["b"]).ok, true);
  assert.equal(canCreateGroupWith(db, "a", []).ok, true);
  assert.equal(canCreateGroupWith(db, "a", ["c"]).reason, "friends_only");

  db.groups.push({
    id: "group_1",
    name: "Friday Woods",
    created_by: "a",
    created_at: "2026-05-22T00:00:00.000Z",
    dissolved_at: null,
    legacy_at: null,
  });
  db.group_members.push({
    id: "member_1",
    group_id: "group_1",
    user_id: "a",
    status: "accepted",
  });
  assert.equal(canCreateGroupWith(db, "a", ["b"]).reason, "already_in_group");
});

test("existing groups can invite eligible friends later", () => {
  const db = dbWithWoods();
  db.friendships.push({
    id: "friendship_2",
    requester_id: "a",
    addressee_id: "c",
    status: "accepted",
  });
  db.users.push({ id: "c", username: "caro", created_at: "2026-05-01T00:00:00.000Z" });
  db.groups.push({
    id: "group_1",
    name: "Friday Woods",
    created_by: "a",
    created_at: "2026-05-22T00:00:00.000Z",
    dissolved_at: null,
    legacy_at: null,
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
      status: "pending",
    },
  );

  const state = groupInviteCandidates(db, "a", "group_1");

  assert.equal(state.ok, true);
  assert.deepEqual(state.memberIds, ["c"]);
  assert.equal(groupInviteCandidates(db, "b", "group_1").reason, "not_member");
  assert.equal(groupInviteCandidates(db, "a", "group_1", ["not_friend"]).reason, "friends_only");
});

test("group deposits spend received wood from a personal stockpile", () => {
  const db = dbWithWoods([
    {
      id: "wood_1",
      sender_id: "b",
      recipient_id: "a",
      sent_at: "2026-05-22T00:00:00.000Z",
      type: "normal",
      label: "Wood",
    },
  ]);
  db.groups.push({
    id: "group_1",
    name: "Friday Woods",
    created_by: "a",
    created_at: "2026-05-22T00:00:00.000Z",
    dissolved_at: null,
    legacy_at: null,
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

  assert.equal(personalStockpile(db, "a"), 1);
  assert.equal(visibleGroupWoodState(db, "a", "group_1").depositCost, 1);
  assert.equal(canSendGroupWood(db, "a", "group_1", Date.parse("2026-05-22T01:00:00.000Z")).ok, true);
  assert.equal(visibleGroupWoodState(db, "a", "group_1").stockpile, 1);

  db.group_woods.push({
    id: "group_wood_1",
    group_id: "group_1",
    sender_id: "a",
    sent_at: "2026-05-22T00:00:00.000Z",
    type: "deposit",
    label: "Deposited Wood",
    amount: 1,
  });

  const blocked = canSendGroupWood(db, "a", "group_1", Date.parse("2026-05-22T01:00:00.000Z"));
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, "insufficient_stockpile");
  assert.equal(personalStockpile(db, "a"), 0);

  db.woods.push({
    id: "wood_2",
    sender_id: "b",
    recipient_id: "a",
    sent_at: "2026-05-22T01:30:00.000Z",
    type: "normal",
    label: "Wood",
  });

  const cooldown = canSendGroupWood(db, "a", "group_1", Date.parse("2026-05-22T00:30:00.000Z"));
  assert.equal(cooldown.ok, false);
  assert.equal(cooldown.reason, "deposit_cooldown");
  assert.equal(canSendGroupWood(db, "a", "group_1", Date.parse("2026-05-22T01:01:00.000Z")).ok, true);
});

test("group deposit cost rises as the pile reaches tiers", () => {
  const db = dbWithWoods(
    Array.from({ length: 5 }, (_, index) => ({
      id: `wood_${index}`,
      sender_id: "b",
      recipient_id: "a",
      sent_at: `2026-05-22T0${index}:00:00.000Z`,
      type: "normal",
      label: "Wood",
    })),
  );
  db.groups.push({
    id: "group_1",
    name: "Friday Woods",
    created_by: "a",
    created_at: "2026-05-22T00:00:00.000Z",
    dissolved_at: null,
    legacy_at: null,
  });
  db.group_members.push({
    id: "member_1",
    group_id: "group_1",
    user_id: "a",
    status: "accepted",
  });
  db.group_woods.push(
    {
      id: "group_wood_1",
      group_id: "group_1",
      sender_id: "a",
      sent_at: "2026-05-22T00:00:00.000Z",
      type: "deposit",
      label: "Deposited Wood",
      amount: 1,
    },
    {
      id: "group_wood_2",
      group_id: "group_1",
      sender_id: "b",
      sent_at: "2026-05-22T00:00:00.000Z",
      type: "deposit",
      label: "Deposited Wood",
      amount: 5,
    },
  );

  const state = canSendGroupWood(db, "a", "group_1", Date.parse("2026-05-22T02:00:00.000Z"));
  assert.equal(state.ok, true);
  assert.equal(state.depositCost, 2);
});

test("group tiers include rounded thresholds for every phase", () => {
  assert.equal(WOODPILE_TIERS.length, 24);
  assert.deepEqual(
    WOODPILE_TIERS.map((tier) => tier.phase),
    [
      "Personal", "Personal", "Personal",
      "Household", "Household", "Household",
      "Neighbourhood", "Neighbourhood", "Neighbourhood",
      "Town", "Town", "Town",
      "City", "City", "City",
      "State", "State", "State",
      "National", "National", "National",
      "Mythic", "Mythic", "Mythic",
    ],
  );
  for (const tier of WOODPILE_TIERS) {
    assert.equal(tier.minWood % tier.depositCost, 0, `${tier.name} threshold should match deposit cost`);
  }
});

test("group stockpiles ignore woods received before the v2 migration", () => {
  const db = dbWithWoods([
    {
      id: "wood_old",
      sender_id: "b",
      recipient_id: "a",
      sent_at: "2026-05-21T23:59:59.000Z",
      type: "normal",
      label: "Wood",
    },
    {
      id: "wood_new",
      sender_id: "b",
      recipient_id: "a",
      sent_at: "2026-05-22T00:00:00.000Z",
      type: "normal",
      label: "Wood",
    },
  ]);
  db.config.groups_v2_migrated_at = "2026-05-22T00:00:00.000Z";

  assert.equal(personalStockpile(db, "a"), 1);
});

test("admin group tools can grant stockpile wood and reset cooldown", () => {
  const db = dbWithWoods();
  db.groups.push({
    id: "group_1",
    name: "Friday Woods",
    created_by: "a",
    created_at: "2026-05-22T00:00:00.000Z",
    dissolved_at: null,
    legacy_at: null,
  });
  db.group_members.push({
    id: "member_1",
    group_id: "group_1",
    user_id: "a",
    status: "accepted",
  });
  db.group_woods.push(
    {
      id: "grant_1",
      group_id: "group_1",
      sender_id: "a",
      sent_at: "2026-05-22T00:00:00.000Z",
      type: "admin_stockpile_grant",
      label: "Admin Test Wood",
      amount: 999,
    },
    {
      id: "deposit_1",
      group_id: "group_1",
      sender_id: "a",
      sent_at: "2026-05-22T01:00:00.000Z",
      type: "deposit",
      label: "Deposited Wood",
      amount: 1,
    },
  );

  assert.equal(personalStockpile(db, "a"), 998);
  assert.equal(
    canSendGroupWood(db, "a", "group_1", Date.parse("2026-05-22T01:30:00.000Z")).reason,
    "deposit_cooldown",
  );

  db.group_woods.push({
    id: "reset_1",
    group_id: "group_1",
    sender_id: "a",
    sent_at: "2026-05-22T01:31:00.000Z",
    type: "admin_cooldown_reset",
    label: "Admin Cooldown Reset",
    amount: 0,
  });

  assert.equal(
    canSendGroupWood(db, "a", "group_1", Date.parse("2026-05-22T01:32:00.000Z")).ok,
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

test("secret achievements show names while hiding unlock methods", () => {
  const db = dbWithWoods();
  ensureAchievementDefinitions(db);

  const hidden = achievementProgress(db, "a")
    .find((achievement) => achievement.slug === "commitment-issues");

  assert.equal(hidden.name, "Commitment Issues");
  assert.equal(hidden.description, "Secret achievement");
  assert.equal(hidden.icon, "nope");
  assert.equal(hidden.earned, false);
});

test("group tier achievements hide names until earned", () => {
  const db = dbWithWoods();
  ensureAchievementDefinitions(db);

  const hidden = achievementProgress(db, "a")
    .find((achievement) => achievement.slug === "group-tier-private-pile");

  assert.equal(hidden.category, "group");
  assert.equal(hidden.name, "Secret achievement");
  assert.equal(hidden.description, "Secret achievement");
  assert.equal(hidden.icon, "???");
});

test("group achievements award personal contributions and shared tiers", () => {
  const db = dbWithWoods();
  db.groups.push({
    id: "group_1",
    name: "Friday Woods",
    created_by: "a",
    created_at: "2026-05-22T00:00:00.000Z",
    dissolved_at: null,
    legacy_at: null,
    woodpile_adjustment: 0,
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
    type: "deposit",
    label: "Deposited Wood",
    amount: 2,
  });

  const aliceSlugs = evaluateAchievements(db, "a").map((achievement) => achievement.slug);
  const bobSlugs = evaluateAchievements(db, "b").map((achievement) => achievement.slug);

  assert(aliceSlugs.includes("pile-participant"));
  assert(aliceSlugs.includes("group-tier-private-pile"));
  assert(!bobSlugs.includes("pile-participant"));
  assert(bobSlugs.includes("group-tier-private-pile"));

  const earnedTier = achievementProgress(db, "b")
    .find((achievement) => achievement.slug === "group-tier-private-pile");
  assert.equal(earnedTier.name, "Private Pile");
  assert.equal(earnedTier.description, "Your group gets to Private Pile");
});

test("joining an existing group awards already reached tier achievements", () => {
  const db = dbWithWoods();
  db.groups.push({
    id: "group_1",
    name: "Friday Woods",
    created_by: "a",
    created_at: "2026-05-22T00:00:00.000Z",
    dissolved_at: null,
    legacy_at: null,
    woodpile_adjustment: 6,
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
      status: "pending",
    },
  );

  assert(!evaluateAchievements(db, "b").some((achievement) => achievement.slug === "group-tier-backyard-stack"));

  db.group_members.find((member) => member.id === "member_2").status = "accepted";
  const slugs = evaluateAchievements(db, "b").map((achievement) => achievement.slug);

  assert(slugs.includes("group-tier-private-pile"));
  assert(slugs.includes("group-tier-backyard-stack"));
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

test("achievement events unlock non-wood UI rituals", () => {
  const db = dbWithWoods();
  db.achievement_events.push(
    {
      id: "event_1",
      user_id: "a",
      type: "long_wood_cancelled",
      subject_id: "b",
      meta_json: "{}",
      created_at: "2026-05-22T00:00:00.000Z",
    },
    {
      id: "event_2",
      user_id: "a",
      type: "long_wood_overcooked",
      subject_id: "b",
      meta_json: "{}",
      created_at: "2026-05-22T00:01:00.000Z",
    },
    {
      id: "event_3",
      user_id: "a",
      type: "super_wood_declined",
      subject_id: null,
      meta_json: "{}",
      created_at: "2026-05-22T00:02:00.000Z",
    },
    {
      id: "event_4",
      user_id: "a",
      type: "history_keyboard_self_control",
      subject_id: "b",
      meta_json: "{}",
      created_at: "2026-05-22T00:03:00.000Z",
    },
    {
      id: "event_5",
      user_id: "a",
      type: "mile_high_wood",
      subject_id: null,
      meta_json: "{}",
      created_at: "2026-05-22T00:04:00.000Z",
    },
    {
      id: "event_6",
      user_id: "a",
      type: "unsolicited_wood",
      subject_id: "not_friend",
      meta_json: "{}",
      created_at: "2026-05-22T00:05:00.000Z",
    },
    {
      id: "event_7",
      user_id: "a",
      type: "bug_report_submitted",
      subject_id: "bug_1",
      meta_json: "{}",
      created_at: "2026-05-22T00:06:00.000Z",
    },
    {
      id: "event_8",
      user_id: "a",
      type: "bug_report_valid",
      subject_id: "bug_1",
      meta_json: "{}",
      created_at: "2026-05-22T00:07:00.000Z",
    },
    ...Array.from({ length: 10 }, (_, index) => ({
      id: `event_cooldown_${index}`,
      user_id: "a",
      type: "cooldown_attempt",
      subject_id: "b",
      meta_json: "{}",
      created_at: `2026-05-22T00:${String(10 + index).padStart(2, "0")}:00.000Z`,
    })),
  );
  ensureAchievementDefinitions(db);

  const slugs = evaluateAchievements(db, "a").map((achievement) => achievement.slug);

  assert.ok(slugs.includes("commitment-issues"));
  assert.ok(slugs.includes("overcooked"));
  assert.ok(slugs.includes("declined-transaction"));
  assert.ok(slugs.includes("self-control"));
  assert.ok(slugs.includes("mile-high-wood"));
  assert.ok(slugs.includes("unsolicited-wood"));
  assert.ok(slugs.includes("bad-timing"));
  assert.ok(slugs.includes("qa-department"));
  assert.ok(slugs.includes("termite-inspector"));
});

test("new relationship achievements avoid duplicating old basic milestones", () => {
  const db = dbWithWoods([
    {
      id: "max_b",
      sender_id: "a",
      recipient_id: "b",
      sent_at: "2026-05-22T00:00:00.000Z",
      type: "long",
      hold_duration_ms: 9600,
    },
    {
      id: "max_c",
      sender_id: "a",
      recipient_id: "c",
      sent_at: "2026-05-22T00:01:00.000Z",
      type: "long",
      hold_duration_ms: 9600,
    },
    {
      id: "max_d",
      sender_id: "a",
      recipient_id: "d",
      sent_at: "2026-05-22T00:02:00.000Z",
      type: "long",
      hold_duration_ms: 9600,
    },
  ]);
  db.users.push(
    { id: "c", username: "cam", created_at: "2026-05-01T00:00:00.000Z" },
    { id: "d", username: "dee", created_at: "2026-05-01T00:00:00.000Z" },
  );
  db.friendships.push(
    { id: "friendship_2", requester_id: "a", addressee_id: "c", status: "accepted" },
    { id: "friendship_3", requester_id: "a", addressee_id: "d", status: "accepted" },
  );
  ensureAchievementDefinitions(db);

  const slugs = evaluateAchievements(db, "a").map((achievement) => achievement.slug);

  assert.ok(slugs.includes("long-game"));
  assert.ok(slugs.includes("maximum-grain"));
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

test("fashionably late requires completing a streak just before midnight", () => {
  const onTime = dbWithWoods([
    {
      id: "previous_outgoing",
      sender_id: "a",
      recipient_id: "b",
      sent_at: "2026-05-22T14:50:00.000Z",
      type: "normal",
    },
    {
      id: "previous_incoming",
      sender_id: "b",
      recipient_id: "a",
      sent_at: "2026-05-22T15:00:00.000Z",
      type: "normal",
    },
    {
      id: "incoming",
      sender_id: "b",
      recipient_id: "a",
      sent_at: "2026-05-23T15:50:00.000Z",
      type: "normal",
    },
    {
      id: "current",
      sender_id: "a",
      recipient_id: "b",
      sent_at: "2026-05-23T15:56:00.000Z",
      type: "normal",
    },
  ]);
  onTime.streaks.push({
    id: "streak_1",
    user_a_id: "a",
    user_b_id: "b",
    current_streak: 1,
    longest_streak: 1,
    last_exchange_at: "2026-05-22T15:00:00.000Z",
    at_risk: true,
    milestones_sent: [],
    updated_at: "2026-05-22T15:00:00.000Z",
  });
  ensureAchievementDefinitions(onTime);
  const onTimeStreakResult = updatePairStreakAfterWood(
    onTime,
    "a",
    "b",
    onTime.woods[3].sent_at,
  );

  const onTimeSlugs = evaluateAchievements(onTime, "a", {
    wood: onTime.woods[3],
    streakResult: onTimeStreakResult,
  })
    .map((achievement) => achievement.slug);

  assert.ok(onTimeSlugs.includes("mutual"));
  assert.ok(onTimeSlugs.includes("fashionably-late"));
  assert.equal(onTimeSlugs.includes("speedy-reply"), false);

  const tooLate = dbWithWoods([
    {
      id: "previous_outgoing",
      sender_id: "a",
      recipient_id: "b",
      sent_at: "2026-05-22T14:50:00.000Z",
      type: "normal",
    },
    {
      id: "previous_incoming",
      sender_id: "b",
      recipient_id: "a",
      sent_at: "2026-05-22T15:00:00.000Z",
      type: "normal",
    },
    {
      id: "incoming",
      sender_id: "b",
      recipient_id: "a",
      sent_at: "2026-05-23T16:00:00.000Z",
      type: "normal",
    },
    {
      id: "current",
      sender_id: "a",
      recipient_id: "b",
      sent_at: "2026-05-23T16:01:00.000Z",
      type: "normal",
    },
  ]);
  tooLate.streaks.push({
    id: "streak_1",
    user_a_id: "a",
    user_b_id: "b",
    current_streak: 1,
    longest_streak: 1,
    last_exchange_at: "2026-05-22T15:00:00.000Z",
    at_risk: true,
    milestones_sent: [],
    updated_at: "2026-05-22T15:00:00.000Z",
  });
  ensureAchievementDefinitions(tooLate);
  const tooLateStreakResult = updatePairStreakAfterWood(
    tooLate,
    "a",
    "b",
    tooLate.woods[3].sent_at,
  );

  const tooLateSlugs = evaluateAchievements(tooLate, "a", {
    wood: tooLate.woods[3],
    streakResult: tooLateStreakResult,
  })
    .map((achievement) => achievement.slug);

  assert.equal(tooLateSlugs.includes("fashionably-late"), false);
});

test("morning wood secret unlocks before seven", () => {
  const db = dbWithWoods([
    {
      sender_id: "a",
      recipient_id: "b",
      sent_at: "2026-05-21T22:30:00.000Z",
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

test("night owl uses the app timezone instead of UTC", () => {
  const midMorningPerth = dbWithWoods([
    {
      sender_id: "a",
      recipient_id: "b",
      sent_at: "2026-05-24T02:34:00.000Z",
      type: "normal",
    },
  ]);
  ensureAchievementDefinitions(midMorningPerth);

  const midMorningSlugs = evaluateAchievements(midMorningPerth, "a")
    .map((achievement) => achievement.slug);

  assert.equal(midMorningSlugs.includes("night-owl"), false);

  const nightPerth = dbWithWoods([
    {
      sender_id: "a",
      recipient_id: "b",
      sent_at: "2026-05-23T18:34:00.000Z",
      type: "normal",
    },
  ]);
  ensureAchievementDefinitions(nightPerth);

  const nightSlugs = evaluateAchievements(nightPerth, "a")
    .map((achievement) => achievement.slug);

  assert.equal(nightSlugs.includes("night-owl"), true);
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

test("long woods use staged labels from hold duration", () => {
  assert.deepEqual(woodVariant({ holdMs: 0 }), {
    type: "normal",
    label: "Wood",
  });
  assert.deepEqual(woodVariant({ holdMs: 2800 }), {
    type: "long",
    label: "Long Wood",
  });
  assert.equal(woodVariant({ holdMs: 5200 }).label, "Loong Wood");
  assert.equal(woodVariant({ holdMs: 7600 }).label, "Looong Wood");
  assert.equal(woodVariant({ holdMs: 9600 }).label, "Max Length Loooong Wood");
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

test("a same-day first mutual exchange counts even before the current wood is stored", () => {
  const db = dbWithWoods([
    {
      sender_id: "a",
      recipient_id: "b",
      sent_at: "2026-05-22T00:00:00.000Z",
    },
  ]);

  const result = updatePairStreakAfterWood(db, "b", "a", "2026-05-22T00:05:00.000Z");

  assert.equal(result.incremented, true);
  assert.equal(result.streak.current_streak, 1);
});

test("mutual exchanges on consecutive local days increment a pair streak", () => {
  const db = dbWithWoods([
    {
      sender_id: "a",
      recipient_id: "b",
      sent_at: "2026-05-22T15:20:00.000Z",
    },
    {
      sender_id: "b",
      recipient_id: "a",
      sent_at: "2026-05-22T15:30:00.000Z",
    },
    {
      sender_id: "a",
      recipient_id: "b",
      sent_at: "2026-05-22T16:05:00.000Z",
    },
    {
      sender_id: "b",
      recipient_id: "a",
      sent_at: "2026-05-22T16:10:00.000Z",
    },
  ]);

  const result = updatePairStreakAfterWood(db, "b", "a", "2026-05-22T16:10:00.000Z");

  assert.equal(result.incremented, true);
  assert.equal(result.streak.current_streak, 2);
});

test("extra mutual woods on the same local day do not increment again", () => {
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
    {
      sender_id: "a",
      recipient_id: "b",
      sent_at: "2026-05-22T00:10:00.000Z",
    },
  ]);

  updatePairStreakAfterWood(db, "b", "a", "2026-05-22T00:05:00.000Z");
  const result = updatePairStreakAfterWood(db, "a", "b", "2026-05-22T00:10:00.000Z");

  assert.equal(result.incremented, false);
  assert.equal(result.streak.current_streak, 1);
});

test("rebuilding streaks backfills mutual local-day counts", () => {
  const db = dbWithWoods([
    {
      id: "wood_1",
      sender_id: "a",
      recipient_id: "b",
      sent_at: "2026-05-22T15:20:00.000Z",
      streak_incremented: false,
      streak_count_after: null,
    },
    {
      id: "wood_2",
      sender_id: "b",
      recipient_id: "a",
      sent_at: "2026-05-22T15:30:00.000Z",
      streak_incremented: false,
      streak_count_after: null,
    },
    {
      id: "wood_3",
      sender_id: "a",
      recipient_id: "b",
      sent_at: "2026-05-22T16:05:00.000Z",
      streak_incremented: false,
      streak_count_after: null,
    },
    {
      id: "wood_4",
      sender_id: "b",
      recipient_id: "a",
      sent_at: "2026-05-22T16:10:00.000Z",
      streak_incremented: false,
      streak_count_after: null,
    },
  ]);
  db.streaks.push({
    id: "streak_1",
    user_a_id: "a",
    user_b_id: "b",
    current_streak: 99,
    longest_streak: 99,
    last_exchange_at: "2026-05-22T00:00:00.000Z",
    at_risk: false,
    milestones_sent: [7],
    updated_at: "2026-05-22T00:00:00.000Z",
  });

  rebuildStreaksFromWoods(db);

  assert.equal(db.streaks[0].current_streak, 2);
  assert.equal(db.streaks[0].longest_streak, 2);
  assert.deepEqual(db.streaks[0].milestones_sent, [7]);
  assert.equal(db.woods[1].streak_incremented, true);
  assert.equal(db.woods[1].streak_count_after, 1);
  assert.equal(db.woods[3].streak_incremented, true);
  assert.equal(db.woods[3].streak_count_after, 2);
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

test("a stale streak breaks after a missed local day without mutual exchange", () => {
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

test("a streak is at risk on the next local day without a mutual exchange", () => {
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
