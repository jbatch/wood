import { getAcceptedFriendIds } from "./woodRules.js";

const GROUP_DEPOSIT_COOLDOWN_MS = 60 * 60 * 1000;

export const WOODPILE_TIERS = [
  {
    phase: "Personal",
    minWood: 0,
    depositCost: 1,
    name: "Bare Patch",
    hint: "Nothing to see here",
  },
  {
    phase: "Personal",
    minWood: 2,
    depositCost: 1,
    name: "Private Pile",
    hint: "A small personal decision",
  },
  {
    phase: "Personal",
    minWood: 6,
    depositCost: 2,
    name: "Backyard Stack",
    hint: "Still plausibly normal",
  },
  {
    phase: "Household",
    minWood: 12,
    depositCost: 3,
    name: "Household Woodpile",
    hint: "Other people in the house have noticed",
  },
  {
    phase: "Household",
    minWood: 24,
    depositCost: 4,
    name: "Domestic Lumber Matter",
    hint: "Mildly formal concern",
  },
  {
    phase: "Household",
    minWood: 42,
    depositCost: 6,
    name: "Family Talking Point",
    hint: "It has entered conversation",
  },
  {
    phase: "Neighbourhood",
    minWood: 64,
    depositCost: 8,
    name: "Neighbourhood Stack",
    hint: "Visible from the footpath",
  },
  {
    phase: "Neighbourhood",
    minWood: 90,
    depositCost: 10,
    name: "Local Curiosity",
    hint: "People slow down near it",
  },
  {
    phase: "Neighbourhood",
    minWood: 132,
    depositCost: 12,
    name: "Suspicious Heap",
    hint: "No longer deniable",
  },
  {
    phase: "Town",
    minWood: 195,
    depositCost: 15,
    name: "Town Pile",
    hint: "Known by reputation",
  },
  {
    phase: "Town",
    minWood: 260,
    depositCost: 20,
    name: "Civic Wood Feature",
    hint: "Weirdly official now",
  },
  {
    phase: "Town",
    minWood: 364,
    depositCost: 26,
    name: "Municipal Lumber Event",
    hint: "Someone has a clipboard",
  },
  {
    phase: "City",
    minWood: 510,
    depositCost: 34,
    name: "City Pile",
    hint: "It appears on maps",
  },
  {
    phase: "City",
    minWood: 660,
    depositCost: 44,
    name: "Urban Timber Mass",
    hint: "Planners are using calm voices",
  },
  {
    phase: "City",
    minWood: 896,
    depositCost: 56,
    name: "Metropolitan Wood Concern",
    hint: "Too large to move, too beloved to remove",
  },
  {
    phase: "State",
    minWood: 1224,
    depositCost: 72,
    name: "State Pile",
    hint: "A regional identity issue",
  },
  {
    phase: "State",
    minWood: 1530,
    depositCost: 90,
    name: "Protected Stack",
    hint: "Removing it would cause unrest",
  },
  {
    phase: "State",
    minWood: 1980,
    depositCost: 110,
    name: "Heritage Lumber Site",
    hint: "Reverence begins",
  },
  {
    phase: "National",
    minWood: 2565,
    depositCost: 135,
    name: "National Pile",
    hint: "Schoolchildren learn about it incorrectly",
  },
  {
    phase: "National",
    minWood: 3300,
    depositCost: 165,
    name: "Monumental Woodform",
    hint: "Pilgrims arrive",
  },
  {
    phase: "National",
    minWood: 4200,
    depositCost: 200,
    name: "The Great Stack",
    hint: "Capital letters become unavoidable",
  },
  {
    phase: "Mythic",
    minWood: 5390,
    depositCost: 245,
    name: "Revered Pile",
    hint: "People lower their voices",
  },
  {
    phase: "Mythic",
    minWood: 6900,
    depositCost: 300,
    name: "Sacred Timber",
    hint: "Ritual behavior observed",
  },
  {
    phase: "Mythic",
    minWood: 8760,
    depositCost: 365,
    name: "The Ascendant Heap",
    hint: "The pile is no longer asking permission",
  },
];

export function isLegacyGroup(group) {
  return Boolean(group?.legacy_at);
}

export function acceptedGroupMemberships(db, userId) {
  return (db.group_members || []).filter(
    (member) => {
      const group = db.groups.find((candidate) => candidate.id === member.group_id);
      return (
        member.user_id === userId &&
        member.status === "accepted" &&
        group &&
        !group.dissolved_at &&
        !isLegacyGroup(group)
      );
    },
  );
}

export function pendingGroupInvites(db, userId) {
  return (db.group_members || []).filter(
    (member) => {
      const group = db.groups.find((candidate) => candidate.id === member.group_id);
      return (
        member.user_id === userId &&
        member.status === "pending" &&
        group &&
        !group.dissolved_at &&
        !isLegacyGroup(group)
      );
    },
  );
}

export function groupMembers(db, groupId, status = "accepted") {
  return (db.group_members || []).filter(
    (member) => member.group_id === groupId && (!status || member.status === status),
  );
}

export function visibleGroups(db, userId) {
  return acceptedGroupMemberships(db, userId)
    .map((membership) => db.groups.find((group) => group.id === membership.group_id))
    .filter((group) => group && !group.dissolved_at && !isLegacyGroup(group))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function canCreateGroupWith(db, creatorId, memberIds) {
  if (activeGroupForUser(db, creatorId)) {
    return { ok: false, reason: "already_in_group" };
  }
  const friendIds = new Set(getAcceptedFriendIds(db, creatorId));
  const uniqueMemberIds = [...new Set(memberIds)].filter((memberId) => memberId !== creatorId);
  if (uniqueMemberIds.some((memberId) => !friendIds.has(memberId))) {
    return { ok: false, reason: "friends_only" };
  }
  const eligibleMemberIds = uniqueMemberIds.filter((memberId) => !activeGroupForUser(db, memberId));
  return { ok: true, memberIds: eligibleMemberIds };
}

export function groupInviteCandidates(db, inviterId, groupId, memberIds = null) {
  const group = db.groups.find((candidate) => candidate.id === groupId);
  if (!group || group.dissolved_at || isLegacyGroup(group)) return { ok: false, reason: "not_found" };
  const inviterMembership = (db.group_members || []).find(
    (member) =>
      member.group_id === groupId &&
      member.user_id === inviterId &&
      member.status === "accepted",
  );
  if (!inviterMembership) return { ok: false, reason: "not_member" };

  const friendIds = new Set(getAcceptedFriendIds(db, inviterId));
  const requestedIds = memberIds
    ? [...new Set(memberIds)].filter((memberId) => memberId !== inviterId)
    : [...friendIds];
  if (requestedIds.some((memberId) => !friendIds.has(memberId))) {
    return { ok: false, reason: "friends_only" };
  }
  const existingIds = new Set(
    (db.group_members || [])
      .filter((member) => member.group_id === groupId && ["accepted", "pending"].includes(member.status))
      .map((member) => member.user_id),
  );
  const eligibleMemberIds = requestedIds.filter(
    (memberId) => !existingIds.has(memberId) && !activeGroupForUser(db, memberId),
  );
  return { ok: true, group, memberIds: eligibleMemberIds };
}

export function canSendGroupWood(db, senderId, groupId, now = Date.now()) {
  const group = db.groups.find((candidate) => candidate.id === groupId);
  if (!group || group.dissolved_at || isLegacyGroup(group)) return { ok: false, reason: "not_found" };
  const membership = (db.group_members || []).find(
    (member) =>
      member.group_id === groupId &&
      member.user_id === senderId &&
      member.status === "accepted",
  );
  if (!membership) return { ok: false, reason: "not_member" };

  const depositCost = woodpileStage(groupWoodTotal(db, groupId)).depositCost;
  const stockpile = personalStockpile(db, senderId);
  if (stockpile < depositCost) {
    return {
      ok: false,
      reason: "insufficient_stockpile",
      stockpile,
      depositCost,
    };
  }

  const lastDeposit = latestGroupDeposit(db, groupId, senderId);
  if (!lastDeposit) return { ok: true, stockpile, depositCost };
  const lastReset = latestGroupCooldownReset(db, groupId, senderId);
  if (lastReset && Date.parse(lastReset.sent_at) >= Date.parse(lastDeposit.sent_at)) {
    return { ok: true, stockpile, depositCost };
  }

  const expiresAt = Date.parse(lastDeposit.sent_at) + GROUP_DEPOSIT_COOLDOWN_MS;
  if (now >= expiresAt) return { ok: true, stockpile, depositCost };

  return {
    ok: false,
    reason: "deposit_cooldown",
    expiresAt: new Date(expiresAt).toISOString(),
    stockpile,
    depositCost,
  };
}

export function visibleGroupWoodState(db, userId, groupId, now = Date.now()) {
  const state = canSendGroupWood(db, userId, groupId, now);
  const rank = groupContributionRank(db, groupId, userId);
  return {
    canWood: state.ok,
    cooldownExpiresAt: state.ok ? null : state.expiresAt || null,
    needsReply: false,
    stockpile: personalStockpile(db, userId),
    depositCost: state.depositCost || woodpileStage(groupWoodTotal(db, groupId)).depositCost,
    depositCooldownHours: GROUP_DEPOSIT_COOLDOWN_MS / (60 * 60 * 1000),
    rank: rank.rank,
    contribution: rank.amount,
    blockedReason: state.ok ? null : state.reason,
  };
}

export function groupStats(db, groupId) {
  const woods = groupWoods(db, groupId);
  const total = groupWoodTotal(db, groupId);
  const senders = new Set(woods.map((wood) => wood.sender_id));
  return {
    woods_sent: total,
    deposits: woods.length,
    active_wooders: senders.size,
    last_wood_at: woods.at(-1)?.sent_at || null,
    stage: woodpileStage(total),
    ranks: groupContributionRanks(db, groupId),
  };
}

export function groupWoods(db, groupId) {
  return (db.group_woods || [])
    .filter((wood) => wood.group_id === groupId && wood.type === "deposit")
    .sort((left, right) => Date.parse(left.sent_at) - Date.parse(right.sent_at));
}

export function groupDepositTotal(db, groupId) {
  return groupWoods(db, groupId)
    .reduce((sum, wood) => sum + Number(wood.amount || 1), 0);
}

export function personalStockpile(db, userId) {
  const migratedAt = Date.parse(db.config?.groups_v2_migrated_at || "");
  const received = (db.woods || []).filter((wood) =>
    wood.recipient_id === userId &&
    (!Number.isFinite(migratedAt) || Date.parse(wood.sent_at) >= migratedAt)
  ).length;
  const grants = (db.group_woods || [])
    .filter((wood) => wood.sender_id === userId && wood.type === "admin_stockpile_grant")
    .reduce((sum, wood) => sum + Number(wood.amount || 0), 0);
  const deposited = (db.group_woods || [])
    .filter((wood) => wood.sender_id === userId && wood.type === "deposit")
    .reduce((sum, wood) => sum + Number(wood.amount || 1), 0);
  return Math.max(0, received + grants - deposited);
}

export function activeGroupForUser(db, userId) {
  const membership = acceptedGroupMemberships(db, userId)[0];
  return membership
    ? db.groups.find((group) => group.id === membership.group_id) || null
    : null;
}

export function legacyGroupMembershipCount(db, userId) {
  return (db.group_members || []).filter((member) => {
    const group = db.groups.find((candidate) => candidate.id === member.group_id);
    return member.user_id === userId && group && isLegacyGroup(group);
  }).length;
}

function latestGroupDeposit(db, groupId, senderId) {
  return groupWoods(db, groupId)
    .filter((wood) => wood.sender_id === senderId)
    .sort((a, b) => Date.parse(b.sent_at) - Date.parse(a.sent_at))[0];
}

function latestGroupCooldownReset(db, groupId, senderId) {
  return (db.group_woods || [])
    .filter((wood) =>
      wood.group_id === groupId &&
      wood.sender_id === senderId &&
      wood.type === "admin_cooldown_reset"
    )
    .sort((a, b) => Date.parse(b.sent_at) - Date.parse(a.sent_at))[0];
}

function groupContributionRank(db, groupId, userId) {
  const ranks = groupContributionRanks(db, groupId);
  return ranks.find((rank) => rank.userId === userId) || { userId, amount: 0, rank: null };
}

function groupContributionRanks(db, groupId) {
  const totals = new Map();
  for (const wood of groupWoods(db, groupId)) {
    totals.set(wood.sender_id, (totals.get(wood.sender_id) || 0) + Number(wood.amount || 1));
  }
  return [...totals.entries()]
    .map(([userId, amount]) => ({ userId, amount }))
    .sort((left, right) => right.amount - left.amount || left.userId.localeCompare(right.userId))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

function groupWoodTotal(db, groupId) {
  const group = db.groups.find((candidate) => candidate.id === groupId);
  return Math.max(0, groupDepositTotal(db, groupId) + Number(group?.woodpile_adjustment || 0));
}

function woodpileStage(total) {
  return [...WOODPILE_TIERS]
    .reverse()
    .find((tier) => total >= tier.minWood) || WOODPILE_TIERS[0];
}
