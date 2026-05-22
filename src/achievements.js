import { id } from "./ids.js";

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
    description: "Send a max-length Woooooood",
    icon: "max",
    criteria_type: "special",
    criteria_value: "long_game",
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
    slug: "early-bird",
    name: "Early Bird",
    description: "Send a Wood between 5am and 6am",
    icon: "5a",
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
    description: "Reply just before the timeout",
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
].map((achievement) => ({
  secret: false,
  ...achievement,
}));

export function achievementDefinitions() {
  return ACHIEVEMENTS.map((achievement) => ({ ...achievement }));
}

export function normalizeAchievementDef(definition) {
  return {
    ...definition,
    secret: Boolean(definition.secret),
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
    return {
      id: definition.id,
      slug: definition.slug,
      name: hidden ? "???" : definition.name,
      description: hidden ? "Secret achievement" : definition.description,
      icon: hidden ? "?" : definition.icon,
      secret: Boolean(definition.secret),
      earned: Boolean(earned),
      earned_at: earned?.earned_at || null,
    };
  });
}

export function evaluateAchievements(db, userId, context = {}) {
  ensureAchievementDefinitions(db);
  const slugs = new Set();
  const sent = (db.woods || []).filter((wood) => wood.sender_id === userId);
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

  if (sent.some((wood) => Number(wood.hold_duration_ms || 0) >= 10000)) {
    slugs.add("long-game");
  }
  if (sent.some((wood) => wood.type === "seasonal")) {
    slugs.add("seasonal-spirit");
  }
  if (hasAllSeasonalWoods(db, sent)) {
    slugs.add("all-the-seasons");
  }
  if (sent.some((wood) => localHour(wood.sent_at) >= 2 && localHour(wood.sent_at) < 4)) {
    slugs.add("night-owl");
  }
  if (sent.some((wood) => localHour(wood.sent_at) >= 5 && localHour(wood.sent_at) < 6)) {
    slugs.add("early-bird");
  }
  if (hasMutualWood(db, userId)) slugs.add("mutual");
  if (hasReplyWithin(db, userId, 0, 10 * 1000)) slugs.add("speedy-reply");
  if (hasReplyWithin(db, userId, 23 * 60 * 60 * 1000 + 55 * 60 * 1000)) {
    slugs.add("fashionably-late");
  }

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
    if (!definition) continue;
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

function addThresholdSlugs(slugs, criteriaType, count) {
  for (const definition of ACHIEVEMENTS) {
    if (definition.criteria_type !== criteriaType) continue;
    if (count >= Number(definition.criteria_value)) slugs.add(definition.slug);
  }
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

function hasMutualWood(db, userId) {
  return (db.woods || []).some((wood) => {
    if (wood.sender_id !== userId) return false;
    return (db.woods || []).some(
      (other) =>
        other.sender_id === wood.recipient_id &&
        other.recipient_id === userId,
    );
  });
}

function hasReplyWithin(db, userId, minMs, maxMs = Infinity) {
  return (db.woods || []).some((wood) => {
    if (wood.sender_id !== userId) return false;
    const sentMs = Date.parse(wood.sent_at);
    return (db.woods || []).some((incoming) => {
      if (incoming.sender_id !== wood.recipient_id || incoming.recipient_id !== userId) {
        return false;
      }
      const delta = sentMs - Date.parse(incoming.sent_at);
      return delta >= minMs && delta <= maxMs;
    });
  });
}

function localHour(iso) {
  return new Date(iso).getHours();
}
