# TODO

This is the active backlog. `docs/PRD.md` is now mostly a product reference for the core Wood idea, not the source of truth for outstanding work.

## Bugs

- [x] Conversation screen should update when a new Wood arrives while the user is already viewing that conversation.
  - Fixed with the lightweight SSE channel; polling remains as fallback.

- [x] Send notifications when a friend request is received or accepted.

- [x] Admin invite links are truncated in the v2 invite list, making them hard to copy without inspecting the DOM.
  - Added a copy-to-clipboard button for each invite link.

## Product Follow-ups

- [ ] Show `member_since` somewhere useful.
  - Likely in the Account screen and public friend-visible profile.

- [ ] Revamp the streak system.
  - Make it clearer what a streak is and why it changed.
  - Show how long the user has before a streak is lost.
  - Revisit whether the current rolling-window rules are understandable enough.
  - Consider streak-healing items awarded at milestones, similar in spirit to Duolingo streak freezes.

- [ ] Think through forgotten-password handling without committing to SMTP.
  - Could be admin-assisted reset, one-time recovery codes, or another low-infra private-app path.

- [ ] Add optional birthdays and Birthday Woods.
  - Users should be able to add a birthday after account creation, including users who joined before the field existed.
  - On a user's birthday, their friends should see a special Birthday Wood option for the first Wood they send that day.
  - Add an achievement for sending a Birthday Wood.
  - Birthday should be editable from Account and visible on the public profile only if the user opts in.

- [ ] Make seasonal events more ingrained.
  - Keep seasonal behavior code-owned rather than fully dynamic, so events can include app decorations, swapped images, special notifications, and UI flourishes.
  - Hardcoded seasonal themes are preferred over an admin CRUD editor unless a real need appears.

- [ ] Make v2 the only UI.
  - Remove the old `public` UI and the `WOOD_UI` split once v2 is fully settled.

- [ ] Add a private Account screen.
  - Keep private controls separate from public profile identity.
  - Include username, member since, birthday settings, notification/device state, global notification snooze, muted friends, bug report entry point, and logout.
  - Add global notification snooze options such as 1 hour, 8 hours, until tomorrow, and until turned back on.
  - Let users remove the current device's push subscription.

- [ ] Add public friend-visible profile pages.
  - Friends should be able to view public profile details for each other.
  - Include public info such as username, member since, chosen favourite wood, visible birthday/birthday state, shared Wood stats, and achievements.
  - Let users view other people's achievements from their profile.
  - Keep profiles friend-only; no public browse or global directory.

- [ ] Let users choose their favourite wood.
  - Treat this as a small profile joke, not a productivity preference.
  - Show it on their public profile.
  - Consider options like oak, pine, balsa, driftwood, plywood, enchanted plywood, or "whatever this app is made of."

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
