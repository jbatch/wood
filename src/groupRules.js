import { getAcceptedFriendIds } from "./woodRules.js";

export function acceptedGroupMemberships(db, userId) {
  return (db.group_members || []).filter(
    (member) => member.user_id === userId && member.status === "accepted",
  );
}

export function pendingGroupInvites(db, userId) {
  return (db.group_members || []).filter(
    (member) => member.user_id === userId && member.status === "pending",
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
    .filter((group) => group && !group.dissolved_at)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function canCreateGroupWith(db, creatorId, memberIds) {
  const friendIds = new Set(getAcceptedFriendIds(db, creatorId));
  const uniqueMemberIds = [...new Set(memberIds)].filter((memberId) => memberId !== creatorId);
  if (uniqueMemberIds.length < 1) {
    return { ok: false, reason: "group_needs_members" };
  }
  if (uniqueMemberIds.some((memberId) => !friendIds.has(memberId))) {
    return { ok: false, reason: "friends_only" };
  }
  return { ok: true, memberIds: uniqueMemberIds };
}

export function canSendGroupWood(db, senderId, groupId, now = Date.now()) {
  const group = db.groups.find((candidate) => candidate.id === groupId);
  if (!group || group.dissolved_at) return { ok: false, reason: "not_found" };
  const membership = (db.group_members || []).find(
    (member) =>
      member.group_id === groupId &&
      member.user_id === senderId &&
      member.status === "accepted",
  );
  if (!membership) return { ok: false, reason: "not_member" };

  const cooldownMs = Number(db.config.cooldown_hours || 24) * 60 * 60 * 1000;
  const lastSent = latestGroupWood(db, groupId, senderId);
  if (!lastSent) return { ok: true };

  const lastReply = latestGroupReply(db, groupId, senderId);
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

export function visibleGroupWoodState(db, userId, groupId, now = Date.now()) {
  const state = canSendGroupWood(db, userId, groupId, now);
  return {
    canWood: state.ok,
    cooldownExpiresAt: state.ok ? null : state.expiresAt || null,
    needsReply: Boolean(groupNeedsReply(db, userId, groupId)),
  };
}

export function groupStats(db, groupId) {
  const woods = groupWoods(db, groupId);
  const senders = new Set(woods.map((wood) => wood.sender_id));
  return {
    woods_sent: woods.length,
    active_wooders: senders.size,
    last_wood_at: woods.at(-1)?.sent_at || null,
  };
}

export function groupWoods(db, groupId) {
  return (db.group_woods || [])
    .filter((wood) => wood.group_id === groupId)
    .sort((left, right) => Date.parse(left.sent_at) - Date.parse(right.sent_at));
}

function latestGroupWood(db, groupId, senderId) {
  return groupWoods(db, groupId)
    .filter((wood) => wood.sender_id === senderId)
    .sort((a, b) => Date.parse(b.sent_at) - Date.parse(a.sent_at))[0];
}

function latestGroupReply(db, groupId, senderId) {
  return groupWoods(db, groupId)
    .filter((wood) => wood.sender_id !== senderId)
    .sort((a, b) => Date.parse(b.sent_at) - Date.parse(a.sent_at))[0];
}

function groupNeedsReply(db, userId, groupId) {
  const latest = groupWoods(db, groupId).at(-1);
  return latest && latest.sender_id !== userId;
}
