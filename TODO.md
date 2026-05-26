# TODO

This is the active backlog. `docs/PRD.md` is mostly a product reference for the core Wood idea, not the source of truth for outstanding work.

## Needs Triage

- [ ] Revamp the streak system.
  - Make it clearer what a streak is and why it changed.
  - Show how long the user has before a streak is lost.
  - Revisit whether the current rolling-window rules are understandable enough.
  - Consider streak-healing items awarded at milestones, similar in spirit to Duolingo streak freezes.
  - Good first slice: improve friend-card/history copy before changing the rules.

- [ ] Password recovery polish.
  - Admin-generated one-time reset links exist.
  - Decide whether Wood needs a user-facing "forgot password" path, recovery codes, or just clearer admin flow/copy.
  - Keep it low-infra; do not assume SMTP.

- [ ] Make seasonal events more ingrained.
  - Keep seasonal behavior code-owned rather than fully dynamic, so events can include app decorations, swapped images, special notifications, and UI flourishes.
  - Hardcoded seasonal themes are preferred over an admin CRUD editor unless a real need appears.

- [ ] Add pair-specific Wood volume achievements.
  - Award achievements for hitting certain numbers of Woods exchanged with one specific friend, separate from all-time total Woods.
  - Consider milestones like 10, 100, 1,000, and one very silly high number.

- [ ] Add a lopsided friendship achievement.
  - Unlock when you have sent more than double the Woods to a friend than they have sent to you.
  - Require that friend to have sent you at least 5 Woods first, so it does not unlock too early.
  - The copy should make it feel funny rather than accusatory.

- [ ] Add achievement coverage for recent secret achievements.
  - Add focused tests for the favourite wood achievement.
  - Add focused tests for the Wood Triangle achievement.
  - Confirm the Wood Triangle semantics are meant to use computed favourite Wooder volume, not an explicit favourite-friend setting.

- [ ] Consider app themes.
  - Let users recolor the app without making Wood feel like a generic theming playground.

- [ ] Add more jokes and easter eggs.
  - Consider a Super Wood with a fake in-app purchase flow.
  - Prefer tiny, tactile, Wood-specific rituals over broad social features.

## Recently Cleared From Active Backlog

- [x] Conversation screen updates when a new Wood arrives while the user is already viewing that conversation.
- [x] Send notifications when a friend request is received or accepted.
- [x] Admin invite links are easier to copy in the invite list.
- [x] Support reusable invite links.
- [x] Add an achievement for choosing a favourite wood for the first time.
- [x] Add a Wood Triangle achievement.
- [x] Add a report-a-bug feature with user submission, admin review/blocking, and bug-report achievements.
- [x] Make the current UI the only supported UI and remove UI version naming.

## Explicitly Dropped

- Admin user detail screen.
- Dynamic seasonal admin editor.
- Block UI.
- Admin delete UI.
- Durable SSE event replay.
- Read receipts or delivery confirmation.
- OAuth or social login.
- Text chat, media, or any generic messaging features.
