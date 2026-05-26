# Wood

Wood is a private, invite-only PWA where each friend gets one button: `WOOD`.

This repo is a small implementation built to match the PRD:

- invite-only signup with single-use expiring invite links
- username/password auth with long-lived signed sessions
- admin panel for users, invites, and global config
- exact-username friend requests, accept/reject/remove/block/mute
- directional Wood cooldowns that clear when the recipient Woods back
- pair streaks plus personal and friend-pair stats
- achievements with unlock notifications and admin awards
- Wood groups with invite-based membership and per-sender group cooldowns
- SQLite persistence with legacy JSON import
- PWA manifest, service worker, push subscription storage
- optional Web Push delivery via `web-push` and VAPID keys

## Run

```sh
npm start
```

Open [http://localhost:3000](http://localhost:3000).

Data is stored in SQLite at `data/wood.sqlite` by default. If that database is empty and an older `data/wood.json` file exists, the server imports it once on startup. The server creates a first admin automatically when no users exist:

- username: `admin`
- password: `wood-admin`

Change that password immediately in any real deployment.

## Environment

| Variable | Default | Notes |
|---|---:|---|
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `WOOD_DB_FILE` | `data/wood.sqlite` | SQLite database path |
| `WOOD_DATA_FILE` | `data/wood.json` | Legacy JSON import path |
| `WOOD_TLS_KEY_FILE` | empty | HTTPS private key path for local HTTPS |
| `WOOD_TLS_CERT_FILE` | empty | HTTPS certificate path for local HTTPS |
| `WOOD_SESSION_SECRET` | dev secret | Set this in production |
| `WOOD_BASE_URL` | `http://localhost:3000` | Used for invite links |
| `WOOD_VAPID_PUBLIC_KEY` | empty | Enables push subscription on clients |
| `WOOD_VAPID_PRIVATE_KEY` | empty | Enables real push sends when `web-push` is installed |
| `WOOD_VAPID_SUBJECT` | `mailto:admin@example.com` | VAPID contact |

## Notes

The app uses SQLite through `better-sqlite3`, which is a good fit for a small private deployment in a single Docker container. Passwords are hashed with Node's `crypto.scrypt`, which is suitable for password storage without adding native auth infrastructure.

## Docker

Build and run locally:

```sh
docker build -t wood .
docker run --rm -p 3000:3000 -v wood-data:/app/data \
  -e WOOD_BASE_URL=http://localhost:3000 \
  -e WOOD_SESSION_SECRET=change-me \
  wood
```

Or use Compose:

```sh
docker compose up -d --build
```

For deployment behind a reverse proxy, set `WOOD_BASE_URL` to the public HTTPS origin, set a long random `WOOD_SESSION_SECRET`, and keep `/app/data` on a persistent volume. `.env.example` has the Compose environment shape.

## Local HTTPS

For mobile push testing without a tunnel, use a trusted local certificate. With `mkcert`:

```sh
mkcert -install
mkdir -p certs
mkcert -key-file certs/wood-key.pem -cert-file certs/wood-cert.pem 192.168.20.16 localhost 127.0.0.1
```

Then set:

```sh
HOST=192.168.20.16
WOOD_BASE_URL=https://192.168.20.16:3000
WOOD_TLS_KEY_FILE=certs/wood-key.pem
WOOD_TLS_CERT_FILE=certs/wood-cert.pem
```

Your phone must trust the same mkcert root CA. On iOS, AirDrop or host the root CA file from `mkcert -CAROOT`, install the profile, then enable full trust in Certificate Trust Settings.
