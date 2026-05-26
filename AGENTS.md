# Agent Notes

Wood is a tiny private PWA for sending friends one thing: a Wood. The product should feel simple, funny, and oddly polished. The joke works because the app behaves like a real social app while doing almost nothing.

## Product Feel

- Keep the core loop sacred: friends, cooldowns, push notifications, and small delightful gags around sending Wood.
- Prefer playful ideas that still feel professionally executed on a phone.
- Avoid turning Wood into a generic chat app, social feed, or productivity dashboard.
- Copy can be silly. UI should be calm, compact, and confident.

## UI Direction

- Build new UI work in `public`.
- The UI aesthetic is mobile-first, dark green, thumb-friendly, and minimal.
- Use the existing patterns: phone-shaped desktop frame, bottom icon tab tray, swipe action trays, sheets, compact cards, chat bubbles, and restrained touch animations.
- Keep animations subtle and tactile: quick press feedback, smooth tray/sheet motion, no decorative movement that distracts from the Wood loop.
- Desktop should feel like the mobile app framed neatly, not like a separate desktop redesign.
- Admin should use the same aesthetic. Avoid desktop-first tables when compact cards or tabbed views will do.
- When changing JS/CSS in `public`, bump the query string in `public/index.html` so the PWA refetches assets.
- If service-worker behavior changes, bump `self.WOOD_SW_VERSION` in `public/sw.js`.

## Development Workflow

- Let the user run the dev server when they say they are doing that. Do not kill or restart their server unless they ask.
- If you need to verify locally and the user has a server on `3000`, use a temporary different port only when necessary, and stop it when done.
- The usual command is `npm start`; `npm run dev` currently just sets `WOOD_DEV=1` and runs the same server.
- Use `.env` for local settings. Common local settings are:

```sh
WOOD_BASE_URL=https://dev.jbat.ch
```

- Static assets are served with `cache-control: no-store`, but installed PWAs can still keep a running JS bundle alive until the app is closed and reopened.

## Code Guidelines

- Keep changes scoped. This is a small app and should stay easy to reason about.
- Backend code lives in `src`. Persistence is SQLite through `src/store.js`.
- Tests live in `test`; run `npm test` before committing meaningful backend or behavior changes.
- For frontend-only tweaks, at least run `node --check public/app.js`. Run the full test suite when practical.
- Do not commit `.env`, local databases, generated debug junk, or screenshots unless explicitly requested.
- Preserve the user’s uncommitted work. Check `git status --short` before editing and do not revert unrelated changes.

## Commit Style

- Make small, descriptive commits after completed chunks.
- Good examples:
  - `Fix history scrolling`
  - `Add fake Wood keyboard composer`
  - `Anchor bottom tabs in desktop frame`

## Current Product Bets

- `public` is the supported UI.
- Mobile PWA behavior matters more than desktop convenience.
- The best features are tiny, tactile, and funny: fake keyboards, notification copy, swipe trays, Wood-specific rituals.
- Keep progress coming in small slices rather than large rewrites.
