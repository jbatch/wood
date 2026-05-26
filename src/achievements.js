import { id } from "./ids.js";
import { config } from "./config.js";
import { groupStats, visibleGroups, WOODPILE_TIERS } from "./groupRules.js";

const SPEEDY_REPLY_MS = 10 * 1000;
const LATE_REPLY_WINDOW_MS = 5 * 60 * 1000;
const LONG_GAP_MS = 30 * 24 * 60 * 60 * 1000;
const ORBIT_WINDOW_MS = 10 * 60 * 1000;
const CHAIN_WINDOW_MS = 60 * 1000;
const MAX_LONG_WOOD_MS = 9250;
const MUTUAL_LUMBER_THRESHOLD = 5;
const INNER_CIRCLE_THRESHOLD = 50;

const GROUP_CONTRIBUTION_ACHIEVEMENTS = [
  {
    slug: "pile-participant",
    name: "Pile Participant",
    description: "Contribute your first Wood to the group pile",
    icon: "pile",
    criteria_type: "group_contribution",
    criteria_value: 1,
    category: "group",
  },
  {
    slug: "regular-contributor",
    name: "Regular Contributor",
    description: "Contribute 25 Wood to the group pile",
    icon: "25",
    criteria_type: "group_contribution",
    criteria_value: 25,
    category: "group",
  },
  {
    slug: "load-bearing",
    name: "Load Bearing",
    description: "Contribute 100 Wood to the group pile",
    icon: "100",
    criteria_type: "group_contribution",
    criteria_value: 100,
    category: "group",
  },
  {
    slug: "pillar-of-the-pile",
    name: "Pillar of the Pile",
    description: "Contribute 250 Wood to the group pile",
    icon: "250",
    criteria_type: "group_contribution",
    criteria_value: 250,
    category: "group",
  },
];

const GROUP_TIER_ACHIEVEMENTS = WOODPILE_TIERS
  .filter((tier) => tier.minWood > 0)
  .map((tier) => ({
    slug: `group-tier-${slugify(tier.name)}`,
    name: tier.name,
    description: `Be in a group when the Woodpile reaches ${tier.name}`,
    icon: "???",
    criteria_type: "group_tier",
    criteria_value: tier.name,
    category: "group",
    secret: true,
    hide_name_until_earned: true,
  }));

export const ACHIEVEMENTS = [
  {
    slug: "first-knock",
    name: "First Knock",
    description: "Send your first Wood",
    icon: "1",
    criteria_type: "woods_sent",
    criteria_value: 1,
  },
  {
    slug: "getting-warmed-up",
    name: "Getting Warmed Up",
    description: "Send 10 Woods",
    icon: "10",
    criteria_type: "woods_sent",
    criteria_value: 10,
  },
  {
    slug: "woodpecker",
    name: "Woodpecker",
    description: "Send 100 Woods",
    icon: "100",
    criteria_type: "woods_sent",
    criteria_value: 100,
  },
  {
    slug: "lumberjack",
    name: "Lumberjack",
    description: "Send 1,000 Woods",
    icon: "1k",
    criteria_type: "woods_sent",
    criteria_value: 1000,
  },
  {
    slug: "forest-cleared",
    name: "Forest Cleared",
    description: "Send 10,000 Woods",
    icon: "10k",
    criteria_type: "woods_sent",
    criteria_value: 10000,
  },
  {
    slug: "kindling",
    name: "Kindling",
    description: "Reach a 7-day streak",
    icon: "7",
    criteria_type: "streak",
    criteria_value: 7,
  },
  {
    slug: "on-fire",
    name: "On Fire",
    description: "Reach a 30-day streak",
    icon: "30",
    criteria_type: "streak",
    criteria_value: 30,
  },
  {
    slug: "wildfire",
    name: "Wildfire",
    description: "Reach a 100-day streak",
    icon: "100",
    criteria_type: "streak",
    criteria_value: 100,
  },
  {
    slug: "eternal-flame",
    name: "Eternal Flame",
    description: "Reach a 365-day streak",
    icon: "365",
    criteria_type: "streak",
    criteria_value: 365,
  },
  {
    slug: "youve-got-a-friend",
    name: "You've Got a Friend",
    description: "Accept your first friend",
    icon: "hi",
    criteria_type: "friends",
    criteria_value: 1,
  },
  {
    slug: "squad-goals",
    name: "Squad Goals",
    description: "Have 5 friends",
    icon: "5",
    criteria_type: "friends",
    criteria_value: 5,
  },
  {
    slug: "popular",
    name: "Popular",
    description: "Have 10 friends",
    icon: "10",
    criteria_type: "friends",
    criteria_value: 10,
  },
  {
    slug: "the-network",
    name: "The Network",
    description: "Have 25 friends",
    icon: "25",
    criteria_type: "friends",
    criteria_value: 25,
  },
  {
    slug: "long-game",
    name: "Long Game",
    description: "Send a max-length Loooong Wood",
    icon: "max",
    criteria_type: "special",
    criteria_value: "long_game",
  },
  {
    slug: "mutual-lumber",
    name: "Mutual Lumber",
    description: "Keep Wood perfectly even with a friend",
    icon: "eq",
    criteria_type: "special",
    criteria_value: "mutual_lumber",
  },
  {
    slug: "perfectly-balanced",
    name: "Perfectly Balanced",
    description: "Keep Wood even with a friend across a full week",
    icon: "bal",
    criteria_type: "special",
    criteria_value: "perfectly_balanced",
  },
  {
    slug: "one-way-street",
    name: "One-Way Street",
    description: "Send 10 Woods to someone before they send one back",
    icon: "10-0",
    criteria_type: "special",
    criteria_value: "one_way_street",
    secret: true,
  },
  {
    slug: "the-long-game",
    name: "The Long Game",
    description: "Wait 30 days between Woods with the same friend, then Wood them again",
    icon: "30d",
    criteria_type: "special",
    criteria_value: "the_long_game",
  },
  {
    slug: "inner-circle",
    name: "Inner Circle",
    description: "Exchange at least 50 Woods with 3 different friends",
    icon: "3x50",
    criteria_type: "special",
    criteria_value: "inner_circle",
  },
  {
    slug: "wood-orbit",
    name: "Wood Orbit",
    description: "Receive Woods from 3 different friends within 10 minutes",
    icon: "orb",
    criteria_type: "special",
    criteria_value: "wood_orbit",
  },
  {
    slug: "chain-reaction",
    name: "Chain Reaction",
    description: "Pass Wood along within 60 seconds",
    icon: "chain",
    criteria_type: "special",
    criteria_value: "chain_reaction",
    secret: true,
  },
  {
    slug: "seasonal-spirit",
    name: "Seasonal Spirit",
    description: "Send a seasonal Wood",
    icon: "date",
    criteria_type: "special",
    criteria_value: "seasonal_spirit",
  },
  {
    slug: "birthday-wood",
    name: "Birthday Wood",
    description: "Send a Birthday Wood",
    icon: "bday",
    criteria_type: "special",
    criteria_value: "birthday_wood",
  },
  {
    slug: "happy-birthday-to-me",
    name: "Happy Birthday to Me",
    description: "Receive a Birthday Wood",
    icon: "cake",
    criteria_type: "special",
    criteria_value: "birthday_received",
  },
  {
    slug: "all-the-seasons",
    name: "All the Seasons",
    description: "Send a Wood in every seasonal event",
    icon: "all",
    criteria_type: "special",
    criteria_value: "all_the_seasons",
  },
  {
    slug: "night-owl",
    name: "Night Owl",
    description: "Send a Wood between 2am and 4am",
    icon: "2a",
    criteria_type: "special",
    criteria_value: "night_owl",
    secret: true,
  },
  {
    slug: "after-hours",
    name: "After Hours",
    description: "Send a Wood after midnight",
    icon: "00",
    criteria_type: "special",
    criteria_value: "after_hours",
  },
  {
    slug: "lunch-break",
    name: "Lunch Break",
    description: "Send Woods on 5 consecutive weekdays at lunch",
    icon: "12",
    criteria_type: "special",
    criteria_value: "lunch_break",
  },
  {
    slug: "bad-timing",
    name: "Bad Timing",
    description: "Try to Wood someone on cooldown 10 times",
    icon: "no",
    criteria_type: "special",
    criteria_value: "bad_timing",
    secret: true,
  },
  {
    slug: "early-bird",
    name: "Morning Wood",
    description: "Send a Wood before 7am",
    icon: "am",
    criteria_type: "special",
    criteria_value: "early_bird",
    secret: true,
  },
  {
    slug: "speedy-reply",
    name: "Speedy Reply",
    description: "Reply to a Wood within 10 seconds",
    icon: "10s",
    criteria_type: "special",
    criteria_value: "speedy_reply",
  },
  {
    slug: "fashionably-late",
    name: "Fashionably Late",
    description: "Complete a streak just before midnight",
    icon: "late",
    criteria_type: "special",
    criteria_value: "fashionably_late",
  },
  {
    slug: "mutual",
    name: "Mutual",
    description: "Exchange your first mutual Wood",
    icon: "2x",
    criteria_type: "special",
    criteria_value: "mutual",
  },
  {
    slug: "self-control",
    name: "Self Control",
    description: "Open a woodable friend and send nothing",
    icon: "zen",
    criteria_type: "special",
    criteria_value: "self_control",
    secret: true,
  },
  {
    slug: "the-watcher",
    name: "The Watcher",
    description: "View a friend's history 5 times without sending a Wood",
    icon: "eye",
    criteria_type: "special",
    criteria_value: "the_watcher",
    secret: true,
  },
  {
    slug: "quiet-wooder",
    name: "Quiet Wooder",
    description: "Mute someone, then still exchange Woods with them",
    icon: "mute",
    criteria_type: "special",
    criteria_value: "quiet_wooder",
    secret: true,
  },
  {
    slug: "commitment-issues",
    name: "Commitment Issues",
    description: "Start powering up a Long Wood, then cancel it",
    icon: "nope",
    criteria_type: "special",
    criteria_value: "commitment_issues",
    secret: true,
  },
  {
    slug: "overcooked",
    name: "Overcooked",
    description: "Hold a Long Wood so long it fails",
    icon: "fail",
    criteria_type: "special",
    criteria_value: "overcooked",
    secret: true,
  },
  {
    slug: "maximum-grain",
    name: "Maximum Grain",
    description: "Send max-length Long Woods to 3 different friends",
    icon: "max3",
    criteria_type: "special",
    criteria_value: "maximum_grain",
    secret: true,
  },
  {
    slug: "many-happy-returns",
    name: "Many Happy Returns",
    description: "Receive Birthday Woods from 3 friends in one day",
    icon: "3hb",
    criteria_type: "special",
    criteria_value: "many_happy_returns",
  },
  {
    slug: "festive-timing",
    name: "Festive Timing",
    description: "Send a seasonal Wood before midday",
    icon: "am",
    criteria_type: "special",
    criteria_value: "festive_timing",
  },
  {
    slug: "popular-unfortunately",
    name: "Popular, Unfortunately",
    description: "Receive Woods from 5 different friends in one day",
    icon: "5in",
    criteria_type: "special",
    criteria_value: "popular_unfortunately",
  },
  {
    slug: "wood-debt",
    name: "Wood Debt",
    description: "Have 3 friends waiting for a reply at once",
    icon: "debt",
    criteria_type: "special",
    criteria_value: "wood_debt",
    secret: true,
  },
  {
    slug: "its-complicated",
    name: "It's Complicated",
    description: "Become someone's favourite Wooder while they are not yours",
    icon: "hmm",
    criteria_type: "special",
    criteria_value: "its_complicated",
    secret: true,
  },
  {
    slug: "wood-triangle",
    name: "Wood Triangle",
    description: "Be part of a favourite-friend triangle",
    icon: "tri",
    criteria_type: "special",
    criteria_value: "wood_triangle",
    secret: true,
  },
  {
    slug: "qa-department",
    name: "QA Department",
    description: "Submit a real bug report",
    icon: "qa",
    criteria_type: "special",
    criteria_value: "qa_department",
    secret: true,
  },
  {
    slug: "termite-inspector",
    name: "Termite Inspector",
    description: "Submit a bug report that gets marked valid",
    icon: "bug",
    criteria_type: "special",
    criteria_value: "termite_inspector",
    secret: true,
  },
  {
    slug: "settings-enjoyer",
    name: "Settings Enjoyer",
    description: "Choose your favourite wood",
    icon: "set",
    criteria_type: "special",
    criteria_value: "settings_enjoyer",
  },
  {
    slug: "structurally-sound",
    name: "Structurally Sound",
    description: "Use Wood for 30 days without changing settings",
    icon: "30ok",
    criteria_type: "special",
    criteria_value: "structurally_sound",
    secret: true,
  },
  {
    slug: "declined-transaction",
    name: "Declined Transaction",
    description: "Attempt to buy Super Wood and fail successfully",
    icon: "$0",
    criteria_type: "special",
    criteria_value: "declined_transaction",
    secret: true,
  },
  ...GROUP_CONTRIBUTION_ACHIEVEMENTS,
  ...GROUP_TIER_ACHIEVEMENTS,
].map((achievement) => ({
  category: "individual",
  secret: false,
  hide_name_until_earned: false,
  legacy: false,
  ...achievement,
}));

export function achievementDefinitions() {
  return ACHIEVEMENTS.map((achievement) => ({ ...achievement }));
}

export function normalizeAchievementDef(definition) {
  return {
    ...definition,
    category: definition.category || "individual",
    secret: Boolean(definition.secret),
    hide_name_until_earned: Boolean(definition.hide_name_until_earned),
    legacy: Boolean(definition.legacy),
  };
}

export function ensureAchievementDefinitions(db) {
  db.achievements_def ||= [];
  for (const definition of ACHIEVEMENTS) {
    const existing = db.achievements_def.find((item) => item.slug === definition.slug);
    if (existing) {
      Object.assign(existing, definition);
    } else {
      db.achievements_def.push({ id: id("achievement"), ...definition });
    }
  }
}

export function achievementProgress(db, userId) {
  ensureAchievementDefinitions(db);
  const earnedByAchievement = new Map(
    (db.achievements_earned || [])
      .filter((earned) => earned.user_id === userId)
      .map((earned) => [earned.achievement_id, earned]),
  );
  return db.achievements_def.map((definition) => {
    const earned = earnedByAchievement.get(definition.id);
    const hidden = definition.secret && !earned;
    const hiddenName = hidden && definition.hide_name_until_earned;
    return {
      id: definition.id,
      slug: definition.slug,
      name: hiddenName ? "Secret achievement" : definition.name,
      description: hidden ? "Secret achievement" : definition.description,
      icon: hiddenName ? "???" : definition.icon,
      category: definition.category || "individual",
      secret: Boolean(definition.secret),
      hide_name_until_earned: Boolean(definition.hide_name_until_earned),
      earned: Boolean(earned),
      earned_at: earned?.earned_at || null,
    };
  });
}

export function evaluateAchievements(db, userId, context = {}) {
  ensureAchievementDefinitions(db);
  const slugs = new Set();
  const sent = (db.woods || []).filter((wood) => wood.sender_id === userId);
  const received = (db.woods || []).filter((wood) => wood.recipient_id === userId);
  const friendCount = acceptedFriendCount(db, userId);
  const bestStreak = Math.max(
    0,
    ...(db.streaks || [])
      .filter((streak) => streak.user_a_id === userId || streak.user_b_id === userId)
      .map((streak) => Number(streak.longest_streak || streak.current_streak || 0)),
  );

  addThresholdSlugs(slugs, "woods_sent", sent.length);
  addThresholdSlugs(slugs, "friends", friendCount);
  addThresholdSlugs(slugs, "streak", bestStreak);
  addGroupAchievementSlugs(db, userId, slugs);

  if (sent.some((wood) => Number(wood.hold_duration_ms || 0) >= 10000)) {
    slugs.add("long-game");
  }
  if (sent.some((wood) => Number(wood.hold_duration_ms || 0) >= MAX_LONG_WOOD_MS)) {
    slugs.add("long-game");
  }
  addRelationshipSlugs(db, userId, sent, received, slugs);
  addEventSlugs(db, userId, sent, slugs, context);
  if (sent.some((wood) => wood.type === "seasonal")) {
    slugs.add("seasonal-spirit");
  }
  if (sent.some((wood) => wood.type === "birthday")) {
    slugs.add("birthday-wood");
  }
  if ((db.woods || []).some((wood) => wood.recipient_id === userId && wood.type === "birthday")) {
    slugs.add("happy-birthday-to-me");
  }
  if (hasAllSeasonalWoods(db, sent)) {
    slugs.add("all-the-seasons");
  }
  if (sent.some((wood) => localHour(wood.sent_at) >= 2 && localHour(wood.sent_at) < 4)) {
    slugs.add("night-owl");
  }
  if (sent.some((wood) => localHour(wood.sent_at) < 2)) {
    slugs.add("after-hours");
  }
  if (sent.some((wood) => localHour(wood.sent_at) >= 5 && localHour(wood.sent_at) < 7)) {
    slugs.add("early-bird");
  }
  if (hasLunchBreak(sent)) {
    slugs.add("lunch-break");
  }
  if (sent.some((wood) => wood.type === "seasonal" && localHour(wood.sent_at) < 12)) {
    slugs.add("festive-timing");
  }
  if (hasManyHappyReturns(received)) {
    slugs.add("many-happy-returns");
  }
  if (hasPopularDay(received)) {
    slugs.add("popular-unfortunately");
  }
  addCurrentReplySlugs(db, userId, context, slugs);

  if (context.slugs) {
    for (const slug of context.slugs) slugs.add(slug);
  }

  return awardAchievements(db, userId, [...slugs], context.earnedAt);
}

export function awardAchievements(db, userId, slugs, earnedAt = new Date().toISOString()) {
  ensureAchievementDefinitions(db);
  db.achievements_earned ||= [];
  const created = [];
  for (const slug of slugs) {
    const definition = db.achievements_def.find((item) => item.slug === slug);
    if (!definition || definition.legacy) continue;
    const alreadyEarned = db.achievements_earned.some(
      (earned) => earned.user_id === userId && earned.achievement_id === definition.id,
    );
    if (alreadyEarned) continue;
    const entry = {
      id: id("earned"),
      user_id: userId,
      achievement_id: definition.id,
      earned_at: earnedAt,
    };
    db.achievements_earned.push(entry);
    created.push({ ...definition, earned_at: earnedAt });
  }
  return created;
}

export function resetAchievements(db, userId) {
  db.achievements_earned ||= [];
  const before = db.achievements_earned.length;
  db.achievements_earned = db.achievements_earned.filter((earned) => earned.user_id !== userId);
  return before - db.achievements_earned.length;
}

function addThresholdSlugs(slugs, criteriaType, count) {
  for (const definition of ACHIEVEMENTS) {
    if (definition.criteria_type !== criteriaType) continue;
    if (count >= Number(definition.criteria_value)) slugs.add(definition.slug);
  }
}

function addGroupAchievementSlugs(db, userId, slugs) {
  const groups = visibleGroups(db, userId);
  const contribution = personalGroupContribution(db, userId);
  addThresholdSlugs(slugs, "group_contribution", contribution);

  for (const group of groups) {
    const stats = groupStats(db, group.id);
    for (const tier of WOODPILE_TIERS) {
      if (tier.minWood <= 0 || stats.woods_sent < tier.minWood) continue;
      slugs.add(`group-tier-${slugify(tier.name)}`);
    }
  }
}

function personalGroupContribution(db, userId) {
  return (db.group_woods || [])
    .filter((wood) => wood.sender_id === userId && wood.type === "deposit")
    .reduce((sum, wood) => sum + Number(wood.amount || 1), 0);
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function acceptedFriendCount(db, userId) {
  return (db.friendships || []).filter(
    (friendship) =>
      friendship.status === "accepted" &&
      (friendship.requester_id === userId || friendship.addressee_id === userId),
  ).length;
}

function hasAllSeasonalWoods(db, sent) {
  const labels = new Set(
    (db.config?.seasonal_themes || []).map((theme) => theme.label).filter(Boolean),
  );
  if (!labels.size) return false;
  const sentLabels = new Set(
    sent.filter((wood) => wood.type === "seasonal").map((wood) => wood.label),
  );
  return [...labels].every((label) => sentLabels.has(label));
}

function addRelationshipSlugs(db, userId, sent, received, slugs) {
  const friendIds = acceptedFriendIds(db, userId);
  const pairStats = friendIds.map((friendId) => pairWoodStats(db, userId, friendId));

  if (pairStats.some((stats) =>
    stats.sent === stats.received && stats.sent >= MUTUAL_LUMBER_THRESHOLD
  )) {
    slugs.add("mutual-lumber");
  }
  if (pairStats.some((stats) =>
    stats.sent === stats.received &&
    stats.sent > 0 &&
    stats.lastMs - stats.firstMs >= 7 * 24 * 60 * 60 * 1000
  )) {
    slugs.add("perfectly-balanced");
  }
  if (friendIds.some((friendId) => sentTenBeforeReply(db, userId, friendId))) {
    slugs.add("one-way-street");
  }
  if (hasThirtyDayReturn(db, userId)) {
    slugs.add("the-long-game");
  }
  if (pairStats.filter((stats) => stats.total >= INNER_CIRCLE_THRESHOLD).length >= 3) {
    slugs.add("inner-circle");
  }
  if (hasWoodOrbit(received)) {
    slugs.add("wood-orbit");
  }
  if (hasChainReaction(db, userId)) {
    slugs.add("chain-reaction");
  }
  if (friendsNeedingReply(db, userId) >= 3) {
    slugs.add("wood-debt");
  }
  if (hasItsComplicated(db, userId, friendIds)) {
    slugs.add("its-complicated");
  }
  if (hasWoodTriangle(db, userId, friendIds)) {
    slugs.add("wood-triangle");
  }
  if (new Set(
    sent
      .filter((wood) => wood.type === "long" && Number(wood.hold_duration_ms || 0) >= MAX_LONG_WOOD_MS)
      .map((wood) => wood.recipient_id),
  ).size >= 3) {
    slugs.add("maximum-grain");
  }
}

function addEventSlugs(db, userId, sent, slugs, context) {
  const events = (db.achievement_events || []).filter((event) => event.user_id === userId);
  if (events.some((event) => event.type === "long_wood_cancelled")) {
    slugs.add("commitment-issues");
  }
  if (events.some((event) => event.type === "long_wood_overcooked")) {
    slugs.add("overcooked");
  }
  if (events.filter((event) => event.type === "cooldown_attempt").length >= 10) {
    slugs.add("bad-timing");
  }
  if (events.some((event) =>
    event.type === "history_keyboard_self_control" ||
    event.type === "profile_self_control"
  )) {
    slugs.add("self-control");
  }
  if (hasWatchedWithoutSending(events, sent)) {
    slugs.add("the-watcher");
  }
  if (hasQuietWooder(db, userId, events)) {
    slugs.add("quiet-wooder");
  }
  if (events.some((event) => event.type === "bug_report_submitted")) {
    slugs.add("qa-department");
  }
  if (events.some((event) => event.type === "bug_report_valid")) {
    slugs.add("termite-inspector");
  }
  const user = (db.users || []).find((candidate) => candidate.id === userId);
  if (user?.favourite_wood || events.some((event) => event.type === "favourite_wood_changed")) {
    slugs.add("settings-enjoyer");
  }
  if (isStructurallySound(user, events, context)) {
    slugs.add("structurally-sound");
  }
  if (events.some((event) => event.type === "super_wood_declined")) {
    slugs.add("declined-transaction");
  }
}

function acceptedFriendIds(db, userId) {
  return (db.friendships || [])
    .filter((friendship) =>
      friendship.status === "accepted" &&
      (friendship.requester_id === userId || friendship.addressee_id === userId)
    )
    .map((friendship) =>
      friendship.requester_id === userId ? friendship.addressee_id : friendship.requester_id
    );
}

function pairWoodStats(db, userId, friendId) {
  const woods = (db.woods || [])
    .filter((wood) =>
      (wood.sender_id === userId && wood.recipient_id === friendId) ||
      (wood.sender_id === friendId && wood.recipient_id === userId)
    )
    .sort((a, b) => Date.parse(a.sent_at) - Date.parse(b.sent_at));
  return {
    sent: woods.filter((wood) => wood.sender_id === userId).length,
    received: woods.filter((wood) => wood.recipient_id === userId).length,
    total: woods.length,
    firstMs: woods.length ? Date.parse(woods[0].sent_at) : 0,
    lastMs: woods.length ? Date.parse(woods.at(-1).sent_at) : 0,
  };
}

function sentTenBeforeReply(db, userId, friendId) {
  const firstIncomingMs = Math.min(
    Infinity,
    ...(db.woods || [])
      .filter((wood) => wood.sender_id === friendId && wood.recipient_id === userId)
      .map((wood) => Date.parse(wood.sent_at)),
  );
  return (db.woods || []).filter((wood) =>
    wood.sender_id === userId &&
    wood.recipient_id === friendId &&
    Date.parse(wood.sent_at) < firstIncomingMs
  ).length >= 10;
}

function hasThirtyDayReturn(db, userId) {
  for (const friendId of acceptedFriendIds(db, userId)) {
    const woods = (db.woods || [])
      .filter((wood) =>
        (wood.sender_id === userId && wood.recipient_id === friendId) ||
        (wood.sender_id === friendId && wood.recipient_id === userId)
      )
      .sort((a, b) => Date.parse(a.sent_at) - Date.parse(b.sent_at));
    for (let index = 1; index < woods.length; index += 1) {
      if (woods[index].sender_id !== userId) continue;
      if (Date.parse(woods[index].sent_at) - Date.parse(woods[index - 1].sent_at) >= LONG_GAP_MS) {
        return true;
      }
    }
  }
  return false;
}

function hasWoodOrbit(received) {
  const sorted = [...received].sort((a, b) => Date.parse(a.sent_at) - Date.parse(b.sent_at));
  for (let left = 0; left < sorted.length; left += 1) {
    const startMs = Date.parse(sorted[left].sent_at);
    const senders = new Set();
    for (let right = left; right < sorted.length; right += 1) {
      if (Date.parse(sorted[right].sent_at) - startMs > ORBIT_WINDOW_MS) break;
      senders.add(sorted[right].sender_id);
      if (senders.size >= 3) return true;
    }
  }
  return false;
}

function hasChainReaction(db, userId) {
  const woods = [...(db.woods || [])].sort((a, b) => Date.parse(a.sent_at) - Date.parse(b.sent_at));
  for (const wood of woods) {
    if (wood.sender_id !== userId) continue;
    const sentMs = Date.parse(wood.sent_at);
    const incoming = woods.find((candidate) =>
      candidate.recipient_id === userId &&
      candidate.sender_id !== wood.recipient_id &&
      sentMs - Date.parse(candidate.sent_at) >= 0 &&
      sentMs - Date.parse(candidate.sent_at) <= CHAIN_WINDOW_MS
    );
    if (incoming) return true;
  }
  return false;
}

function friendsNeedingReply(db, userId) {
  return acceptedFriendIds(db, userId).filter((friendId) => {
    const latestIncoming = latestBetween(db, friendId, userId);
    if (!latestIncoming) return false;
    const latestOutgoing = latestBetween(db, userId, friendId);
    return !latestOutgoing || Date.parse(latestIncoming.sent_at) > Date.parse(latestOutgoing.sent_at);
  }).length;
}

function hasItsComplicated(db, userId, friendIds) {
  const mine = favouriteWooderId(db, userId, friendIds);
  return friendIds.some((friendId) =>
    favouriteWooderId(db, friendId, acceptedFriendIds(db, friendId)) === userId &&
    mine !== friendId
  );
}

function hasWoodTriangle(db, userId, friendIds) {
  const first = favouriteWooderId(db, userId, friendIds);
  if (!first || first === userId) return false;
  const second = favouriteWooderId(db, first, acceptedFriendIds(db, first));
  if (!second || second === userId || second === first) return false;
  return favouriteWooderId(db, second, acceptedFriendIds(db, second)) === userId;
}

function favouriteWooderId(db, userId, friendIds) {
  let best = null;
  for (const friendId of friendIds) {
    const total = pairWoodStats(db, userId, friendId).total;
    if (!total) continue;
    if (!best || total > best.total || (total === best.total && friendId < best.friendId)) {
      best = { friendId, total };
    }
  }
  return best?.friendId || null;
}

function latestBetween(db, senderId, recipientId) {
  return (db.woods || [])
    .filter((wood) => wood.sender_id === senderId && wood.recipient_id === recipientId)
    .sort((a, b) => Date.parse(b.sent_at) - Date.parse(a.sent_at))[0] || null;
}

function hasWatchedWithoutSending(events, sent) {
  const sentByFriend = new Map();
  for (const wood of sent) {
    const previous = sentByFriend.get(wood.recipient_id) || 0;
    sentByFriend.set(wood.recipient_id, Math.max(previous, Date.parse(wood.sent_at)));
  }
  const views = new Map();
  for (const event of events.filter((item) => item.type === "history_view" && item.subject_id)) {
    const latestSentMs = sentByFriend.get(event.subject_id) || 0;
    if (Date.parse(event.created_at) <= latestSentMs) continue;
    views.set(event.subject_id, (views.get(event.subject_id) || 0) + 1);
    if (views.get(event.subject_id) >= 5) return true;
  }
  return false;
}

function hasQuietWooder(db, userId, events) {
  for (const event of events.filter((item) => item.type === "friend_muted" && item.subject_id)) {
    const mutedAtMs = Date.parse(event.created_at);
    const exchangedAfterMute = (db.woods || []).some((wood) =>
      ((wood.sender_id === userId && wood.recipient_id === event.subject_id) ||
        (wood.sender_id === event.subject_id && wood.recipient_id === userId)) &&
      Date.parse(wood.sent_at) >= mutedAtMs
    );
    if (exchangedAfterMute) return true;
  }
  return false;
}

function isStructurallySound(user, events, context) {
  if (!user?.created_at || !user.last_active_at) return false;
  const nowMs = context.now ? Date.parse(context.now) : Date.now();
  if (nowMs - Date.parse(user.created_at) < LONG_GAP_MS) return false;
  return !events.some((event) =>
    ["settings_changed", "profile_changed", "password_changed"].includes(event.type)
  );
}

function hasLunchBreak(sent) {
  const days = [...new Set(
    sent
      .filter((wood) => localHour(wood.sent_at) === 12 && localWeekday(wood.sent_at) <= 5)
      .map((wood) => localDateKey(wood.sent_at)),
  )].sort();
  let run = 0;
  let previous = null;
  for (const day of days) {
    run = previous && isNextWeekday(previous, day) ? run + 1 : 1;
    if (run >= 5) return true;
    previous = day;
  }
  return false;
}

function hasManyHappyReturns(received) {
  const byDay = new Map();
  for (const wood of received.filter((item) => item.type === "birthday")) {
    const day = localDateKey(wood.sent_at);
    if (!byDay.has(day)) byDay.set(day, new Set());
    byDay.get(day).add(wood.sender_id);
    if (byDay.get(day).size >= 3) return true;
  }
  return false;
}

function hasPopularDay(received) {
  const byDay = new Map();
  for (const wood of received) {
    const day = localDateKey(wood.sent_at);
    if (!byDay.has(day)) byDay.set(day, new Set());
    byDay.get(day).add(wood.sender_id);
    if (byDay.get(day).size >= 5) return true;
  }
  return false;
}

function localDateKey(iso, timeZone = config.timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const value = (type) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function addDateKey(key, days) {
  const date = new Date(`${key}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function msUntilNextLocalDay(iso, timeZone = config.timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const value = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
  const elapsedMs = ((value("hour") * 60 + value("minute")) * 60 + value("second")) * 1000;
  return 24 * 60 * 60 * 1000 - elapsedMs;
}

function localWeekday(iso, timeZone = config.timeZone) {
  const key = localDateKey(iso, timeZone);
  const day = new Date(`${key}T00:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function isNextWeekday(previousKey, nextKey) {
  const previous = new Date(`${previousKey}T00:00:00.000Z`);
  do {
    previous.setUTCDate(previous.getUTCDate() + 1);
  } while ([0, 6].includes(previous.getUTCDay()));
  return previous.toISOString().slice(0, 10) === nextKey;
}

function localHour(iso, timeZone = config.timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  return Number(parts.find((part) => part.type === "hour")?.value || 0);
}

function addCurrentReplySlugs(db, userId, context, slugs) {
  const { wood } = context;
  const delta = currentReplyDeltaMs(db, userId, wood);
  if (delta === null) return;

  slugs.add("mutual");
  if (delta <= SPEEDY_REPLY_MS) slugs.add("speedy-reply");

  if (savedStreakAtLastMinute(context.streakResult)) {
    slugs.add("fashionably-late");
  }
}

function savedStreakAtLastMinute(streakResult) {
  if (!streakResult?.incremented) return false;
  if (!streakResult.previousCount) return false;
  if (!streakResult.previousLastExchangeAt) return false;

  const sentDay = localDateKey(streakResult.sentAt);
  const previousDay = localDateKey(streakResult.previousLastExchangeAt);
  if (sentDay !== addDateKey(previousDay, 1)) return false;

  return msUntilNextLocalDay(streakResult.sentAt) <= LATE_REPLY_WINDOW_MS;
}

function currentReplyDeltaMs(db, userId, wood) {
  if (!wood || wood.sender_id !== userId || !wood.recipient_id || !wood.sent_at) return null;

  const currentMs = Date.parse(wood.sent_at);
  const latestIncoming = latestWoodBefore(
    db,
    wood.recipient_id,
    userId,
    currentMs,
    wood.id,
  );
  if (!latestIncoming) return null;

  const latestPriorOutgoing = latestWoodBefore(
    db,
    userId,
    wood.recipient_id,
    currentMs,
    wood.id,
  );
  if (
    latestPriorOutgoing &&
    Date.parse(latestPriorOutgoing.sent_at) > Date.parse(latestIncoming.sent_at)
  ) {
    return null;
  }

  const delta = currentMs - Date.parse(latestIncoming.sent_at);
  return delta >= 0 ? delta : null;
}

function latestWoodBefore(db, senderId, recipientId, beforeMs, excludeId) {
  return (db.woods || [])
    .filter((candidate) => {
      if (candidate.id && candidate.id === excludeId) return false;
      if (candidate.sender_id !== senderId || candidate.recipient_id !== recipientId) return false;
      return Date.parse(candidate.sent_at) < beforeMs;
    })
    .sort((a, b) => Date.parse(b.sent_at) - Date.parse(a.sent_at))[0] || null;
}
