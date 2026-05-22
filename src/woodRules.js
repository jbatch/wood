const LONG_WOOD_MAX_MS = 10000;
const LONG_WOOD_MIN_MS = 2000;

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
    const extra = Math.floor((capped - LONG_WOOD_MIN_MS) / 800) + 5;
    return {
      type: "long",
      label: `W${"o".repeat(extra)}d`,
    };
  }
  return { type: "normal", label: "Wood" };
}

export function seasonalTheme(db, date = new Date()) {
  if (!db.config.seasonal_enabled) return null;
  const mmdd = date.toISOString().slice(5, 10);
  return db.config.seasonal_themes.find((theme) => theme.date === mmdd) || null;
}
