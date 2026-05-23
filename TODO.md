# TODO

This is the active backlog. `docs/PRD.md` is now mostly a product reference for the core Wood idea, not the source of truth for outstanding work.

## Bugs

- [x] Conversation screen should update when a new Wood arrives while the user is already viewing that conversation.
  - Fixed with the lightweight SSE channel; polling remains as fallback.

- [x] Send notifications when a friend request is received or accepted.

- [x] Admin invite links are truncated in the v2 invite list, making them hard to copy without inspecting the DOM.
  - Added a copy-to-clipboard button for each invite link.

## Product Follow-ups

- [ ] Revamp the streak system.
  - Make it clearer what a streak is and why it changed.
  - Show how long the user has before a streak is lost.
  - Revisit whether the current rolling-window rules are understandable enough.
  - Consider streak-healing items awarded at milestones, similar in spirit to Duolingo streak freezes.

- [ ] Think through forgotten-password handling without committing to SMTP.
  - Could be admin-assisted reset, one-time recovery codes, or another low-infra private-app path.

- [ ] Make seasonal events more ingrained.
  - Keep seasonal behavior code-owned rather than fully dynamic, so events can include app decorations, swapped images, special notifications, and UI flourishes.
  - Hardcoded seasonal themes are preferred over an admin CRUD editor unless a real need appears.

- [ ] Make v2 the only UI.
  - Remove the old `public` UI and the `WOOD_UI` split once v2 is fully settled.

- [ ] Add an achievement for choosing a favourite wood for the first time.

- [ ] Add a Wood Triangle achievement.
  - Unlock when three users form a favourite-friend triangle: A favourites B, B favourites C, and C favourites A.
  - The achievement name should be visible, but the unlock condition should stay secret until earned.
  - This may be rare and a little hard to check, which is part of the appeal.

- [ ] Add pair-specific Wood volume achievements.
  - Award achievements for hitting certain numbers of Woods exchanged with one specific friend, separate from all-time total Woods.
  - Consider milestones like 10, 100, 1,000, and one very silly high number.

- [ ] Add a lopsided friendship achievement.
  - Unlock when you have sent more than double the Woods to a friend than they have sent to you.
  - Require that friend to have sent you at least 5 Woods first, so it does not unlock too early.
  - The copy should make it feel funny rather than accusatory.

- [ ] Add a report-a-bug feature.
  - Let users submit lightweight bug reports from inside the app.
  - Assume this will be abused at least a little.
  - Add an admin control to block specific users from sending bug reports if they submit fake/noisy reports.
  - Add an achievement for reporting a real bug; maybe use a termite pun.

- [ ] Consider app themes.
  - Let users recolor the app without making Wood feel like a generic theming playground.

- [ ] Add more jokes and easter eggs.
  - Consider a Super Wood with a fake in-app purchase flow.
  - Prefer tiny, tactile, Wood-specific rituals over broad social features.

- [x] Support reusable invite links.
  - Current invite links are single-use; reusable links make onboarding easier when sharing with several people.

## Explicitly Dropped

- Admin user detail screen.
- Dynamic seasonal admin editor.
- Block UI.
- Admin delete UI.
- Durable SSE event replay.
- Read receipts or delivery confirmation.
- OAuth or social login.
- Text chat, media, or any generic messaging features.
