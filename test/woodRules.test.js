import assert from "node:assert/strict";
import test from "node:test";
import { canSendWood, visibleWoodState, woodVariant } from "../src/woodRules.js";

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
  };
}

test("a user can wood an accepted friend with no prior outgoing wood", () => {
  assert.equal(canSendWood(dbWithWoods(), "a", "b").ok, true);
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
