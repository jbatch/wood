# Wood App — Product Requirements Document

> A private, invite-only PWA where you send friends a single tap notification called a "Wood". Nothing more.

---

## 1. Concept

Wood is a PWA poke app. You tap a button. Your friend gets a push notification. That's it.

The constraint that makes it interesting: you can't send someone another Wood until they Wood you back, or a timeout expires.

---

## 2. Goals

- Extremely minimal UI — one button per friend, that's the whole app
- Works on mobile (added to home screen) and desktop browser
- Private and invite-only — no public sign-up
- Low maintenance infrastructure

### Current UI Direction

- Build new product work in `public-v2` first, following the new dark green mobile-first aesthetic.
- Keep the app simple and thumb-friendly: one primary action per moment, compact text, and no desktop-first tables.
- Use restrained, professional mobile animations: quick press feedback, smooth sheet/tray motion, and no decorative motion that slows the loop down.
- Prefer the bottom icon tab tray pattern for top-level navigation, inspired by old Android/Material bottom menus without pulling in a UI framework.
- Admin UI should follow the same v2 aesthetic instead of feeling like a separate back-office web page.

---

## 3. Users & Roles

| Role | Description |
|---|---|
| `admin` | Full access — user management, invite generation, system config |
| `user` | Standard app access |

Admins are assigned manually (DB flag). There is no self-serve role escalation.

---

## 4. Authentication

### Invite-Only Sign-Up
- New users can only join via a signed invite link
- Each link is single-use and tied to no specific person (first to use it claims it)
- Links have an expiry (e.g. 7 days)
- Admin generates invite links from the admin panel
- Used links are marked consumed and cannot be reused

### Login Options
- **Username + password** (bcrypt hashed, standard)
- **Passwordless / magic link** — enter email, receive a one-time login link (v1 can skip this and just do username/password to keep it simple)

### Sessions
- JWT or server-side sessions (keep it simple)
- "Remember me" on device — long-lived session token

---

## 5. Push Notifications

- On first login (or on PWA install prompt), request push permission
- Each device/browser gets its own push subscription stored against the user account
- A user can have multiple active subscriptions (phone + desktop)
- Wooding a user fans out to all their active subscriptions
- Stale/expired subscriptions are pruned silently on send failure

---

## 6. Friend System

### Adding Friends
- Search by **exact username only** — no autocomplete, no browse
- Sends a friend request to that user
- Recipient gets a push notification: "X wants to be your friend"

### Friend Request States
- **Pending** — request sent, awaiting response
- **Friends** — accepted
- **Rejected** — declined (silent to sender, request disappears)
- **Blocked** — blocks all interaction; blocked user sees the other as non-existent

### Actions on a Friend
- **Wood** — send a Wood (subject to cooldown)
- **Mute** — suppress their incoming Woods (no notification, Wood still registers)
- **Block** — nuclear option, removes friendship, prevents re-adding
- **Remove friend** — ends the friendship without blocking

---

## 7. The Wood

### Sending a Wood
- Each friend appears as a card/row with their name and a single **WOOD** button
- Button is active (green) or on cooldown (greyed out with countdown)
- Tapping sends a Wood push notification to all the friend's devices

### Cooldown Rule
- After sending a Wood, you cannot send another to that same person until:
  - They Wood you back, **or**
  - A configurable timeout passes (default: **24 hours**)
- Cooldown is per-pair and directional — they can still Wood you while you're on cooldown

### Receiving a Wood
- Push notification: **"[Username] wooded you 🪵"**
- Tapping the notification opens the app to that friend's card
- The Wood button is lit up / pulsing to invite a reply

---

## 8. Easter Eggs

### Long Wood (Hold to Send)
- Hold the Wood button for 2+ seconds instead of tapping
- Sends a **Woooooood** — notification text is extended with extra "o"s proportional to hold duration
- Visual feedback on the button as you hold (stretches, grows, vibrates)
- Cap at ~10 seconds ("Wooooooooooood")

### Seasonal Woods
- On certain dates the Wood button changes appearance and the notification flavour text changes
- Examples:
  - Christmas: "🎄 [User] sent you a Christmas Wood"
  - Halloween: "🎃 [User] sent you a Spooky Wood"
  - New Year: "🎆 [User] sent you a New Year Wood"
  - User's birthday (if set): special birthday Wood variant
- Seasonal logic lives server-side so it can be updated without app changes

---

## 9. Admin Panel

Accessible only to `admin` role users. Separate route (e.g. `/admin`).

### User Management
- List all users (username, email, join date, last active, role, status)
- View a user's friend list and Wood history
- Suspend / unsuspend a user
- Delete a user
- Promote to admin / demote from admin

### Invite Management
- Generate invite links (single or bulk)
- Set expiry duration per link
- View all links: status (unused / used / expired), who used it, when
- Revoke unused links

### System Config
- Adjust global Wood cooldown timeout
- Toggle seasonal Wood themes on/off
- Add/edit seasonal dates and notification text

### Stats (nice to have)
- Total users, total Woods sent, most active pairs, Woods sent today

---

## 10. Future: Wood Groups (v2)

- A group has a name and 2+ members
- Sending a Wood to a group notifies all members simultaneously
- Same cooldown rules apply (per sender per group)
- Groups can be created by any user, membership by invite
- Admin can dissolve groups

---

## 11. Technical Stack (Suggested)

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Svelte or React PWA | Needs Service Worker for push |
| Backend | Node.js (Hono or Express) | Small, single-process fine for v1 |
| Database | SQLite (via Turso) or PostgreSQL | SQLite is plenty for small user base |
| Push | `web-push` npm package + VAPID | Standard Web Push Protocol |
| Hosting | Fly.io or Railway | Simple deploy, free tier viable |
| Auth | Custom JWT or better-auth library | Don't reach for Auth0 — overkill |

---

## 12. Data Model (Sketch)

```
users           id, username, email, password_hash, role, suspended, created_at
push_subs       id, user_id, endpoint, p256dh, auth, created_at
invites         id, code, created_by, expires_at, used_by, used_at
friendships     id, requester_id, addressee_id, status (pending/accepted/blocked)
woods           id, sender_id, recipient_id, sent_at, type (normal/long/seasonal)
mutes           id, muter_id, muted_id
```

---

## 13. Streaks

A streak tracks how many consecutive days two friends have exchanged at least one Wood each way.

### Rules
- A streak increments when **both** users have Wooded each other within a **24-hour rolling window** (not calendar day — less punishing on timezones)
- The streak breaks if 48 hours pass without a mutual exchange
- A streak of 0 is just "no streak" — not displayed
- Streaks are **per pair**, not global

### Display
- Shown on each friend's card: "🔥 12" next to their name when active
- A streak at risk (no exchange in last 20 of 24 hours) shows a warning state: "⚠️ 12"
- On the Wood button confirmation / notification reply, show the new streak count if it incremented

### Streak Milestones
Hitting certain streak lengths triggers a special notification to both users:
- 7 days, 30 days, 100 days, 365 days (and every 365 thereafter)
- Example: "🔥 You and Josh have a 30-day Wood streak!"

---

## 14. Stats

Per-user stats, visible to the user on their profile page. Admins can see anyone's stats.

### Personal Stats
| Stat | Description |
|---|---|
| Woods Sent | All-time total Woods sent |
| Woods Received | All-time total Woods received |
| Longest Streak | Best ever streak with any single friend |
| Current Longest Streak | Highest active streak right now |
| Favourite Wooder | Friend you've exchanged the most Woods with |
| Long Woods Sent | How many Woooooods you've sent |
| Seasonal Woods | Count of seasonal Woods sent |
| Friends | Current friend count |
| Member Since | Join date |

### Friend-Pair Stats
Tapping a friend's card shows a mini stats panel for that pair:
- Woods you've sent them / they've sent you
- Current streak + longest ever streak
- First Wood ever exchanged (date)
- Last Wood exchanged

### Leaderboard (optional v1 feature)
- Among your friends only (not global)
- Ranked by: most Woods sent this week, longest current streak
- Opt-out available (hide yourself from friends' leaderboards)

---

## 15. Achievements

Achievements are earned by individuals, displayed on their profile. Unlocking one triggers a push notification.

### Wood Volume
| Achievement | Criteria |
|---|---|
| First Knock | Send your first Wood |
| Getting Warmed Up | Send 10 Woods |
| Woodpecker | Send 100 Woods |
| Lumberjack | Send 1,000 Woods |
| Forest Cleared | Send 10,000 Woods |

### Streaks
| Achievement | Criteria |
|---|---|
| Kindling | 7-day streak with anyone |
| On Fire | 30-day streak with anyone |
| Wildfire | 100-day streak with anyone |
| Eternal Flame | 365-day streak with anyone |

### Social
| Achievement | Criteria |
|---|---|
| You've Got a Friend | Accept your first friend |
| Squad Goals | Have 5 friends |
| Popular | Have 10 friends |
| The Network | Have 25 friends |

### Special
| Achievement | Criteria |
|---|---|
| Long Game | Send a max-length Woooooood (10s hold) |
| Seasonal Spirit | Send a seasonal Wood |
| All the Seasons | Send a Wood in every seasonal event |
| Night Owl | Send a Wood between 2am–4am local time |
| Early Bird | Send a Wood between 5am–6am local time |
| Speedy Reply | Reply to a Wood within 10 seconds of receiving it |
| Fashionably Late | Reply to a Wood after 23h 55m (just before timeout) |
| Mutual | Exchange your first mutual Wood (both directions in one session) |

### Admin-Only / Secret
- Achievements can be flagged `secret: true` — they show as "???" until unlocked
- Admins can manually award achievements to users

### Data Model Addition
```
achievements_def    id, slug, name, description, icon, secret, criteria_type, criteria_value
achievements_earned id, user_id, achievement_id, earned_at
```

---

## 16. Updated Data Model

```
users               id, username, email, password_hash, role, suspended, created_at
push_subs           id, user_id, endpoint, p256dh, auth, created_at
invites             id, code, created_by, expires_at, used_by, used_at
friendships         id, requester_id, addressee_id, status (pending/accepted/blocked)
woods               id, sender_id, recipient_id, sent_at, type (normal/long/seasonal), hold_duration_ms
mutes               id, muter_id, muted_id
streaks             id, user_a_id, user_b_id, current_streak, longest_streak, last_exchange_at, at_risk
achievements_def    id, slug, name, description, icon, secret, criteria_type, criteria_value
achievements_earned id, user_id, achievement_id, earned_at
```

---

## 17. Out of Scope (v1)

- Native mobile apps
- Read receipts / delivery confirmation
- Media or text messages
- Public profiles
- Web scraping / spam prevention beyond invite gating
- OAuth / social login

---

## Changelog

- 2026-05-22 — Initial PRD created
- 2026-05-22 — Added streaks (§13), stats (§14), achievements (§15), updated data model (§16)
