# Wood

Wood is a private, invite-only PWA where each friend gets one button: `WOOD`.

This repo is a small v1 implementation built to match the PRD:

- invite-only signup with single-use expiring invite links
- username/password auth with long-lived signed sessions
- admin panel for users, invites, and global config
- exact-username friend requests, accept/reject/remove/block/mute
- directional Wood cooldowns that clear when the recipient Woods back
- PWA manifest, service worker, push subscription storage
- optional Web Push delivery via `web-push` and VAPID keys

## Run

```sh
npm start
```

Open [http://localhost:3000](http://localhost:3000).

Data is stored in `data/wood.json` by default. The server creates a first admin automatically when no users exist:

- username: `admin`
- password: `wood-admin`

Change that password immediately in any real deployment.

## Environment

| Variable | Default | Notes |
|---|---:|---|
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `WOOD_DATA_FILE` | `data/wood.json` | File-backed local data store |
| `WOOD_TLS_KEY_FILE` | empty | HTTPS private key path for local HTTPS |
| `WOOD_TLS_CERT_FILE` | empty | HTTPS certificate path for local HTTPS |
| `WOOD_SESSION_SECRET` | dev secret | Set this in production |
| `WOOD_BASE_URL` | `http://localhost:3000` | Used for invite links |
| `WOOD_VAPID_PUBLIC_KEY` | empty | Enables push subscription on clients |
| `WOOD_VAPID_PRIVATE_KEY` | empty | Enables real push sends when `web-push` is installed |
| `WOOD_VAPID_SUBJECT` | `mailto:admin@example.com` | VAPID contact |

## Notes

The v1 server intentionally uses Node built-ins for the core app so the project is easy to run locally. Passwords are hashed with Node's `crypto.scrypt`, which is suitable for password storage without adding native dependencies. For production, swapping the file store for SQLite or Postgres is the main next step.

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
