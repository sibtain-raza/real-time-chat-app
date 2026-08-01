# Secure Chat Application

Go WebSocket server + React UI with **signup/login**, **1:1 E2E chat**, **message history**, and **WebRTC video**.

## Features

* **Sign up / log in** — SQLite + bcrypt; rate-limited; sessions expire in 7 days; `/api/logout` invalidates tokens
* **1:1 chat** — pick a person; messages go only to them
* **Encrypted history** — ciphertext stored per participant (including a self-sealed copy) and restored on reopen
* **Automatic ECDH key pairs** — created/restored in the browser per account
* **Safety numbers** — compare peer fingerprints and mark keys as verified; warn on key change
* **Voice + 1:1 video** — WebRTC with configurable STUN/TURN via `/api/config`
* **Optional HTTPS** — `-tls-cert` / `-tls-key` for HTTPS + WSS (needed for camera off localhost)

## Quick start

```bash
cd web && npm install && npm run build && cd ..
go run ./cmd/server
# open http://localhost:9090
```

## Production-ish flags

```bash
go run ./cmd/server \
  -addr 0.0.0.0:9090 \
  -web web/dist \
  -db chatapp.db \
  -tls-cert /path/to/cert.pem \
  -tls-key /path/to/key.pem \
  -stun "stun:stun.l.google.com:19302" \
  -turn "turn:turn.example.com:3478" \
  -turn-user USER \
  -turn-pass PASS
```

## API

| Endpoint | Description |
|----------|-------------|
| `POST /api/signup` | `{username,password}` → `{token,username}` |
| `POST /api/login` | `{username,password}` → `{token,username}` |
| `POST /api/logout` | `Authorization: Bearer <token>` |
| `GET /api/users` | directory + online flags |
| `GET /api/messages?peer=` | encrypted history for that DM |
| `GET /api/config` | ICE/TURN servers for WebRTC |
| `WS /ws` | first frame `{token, publicKey}` |

## Password rules

At least **8 characters**, including a **letter** and a **number**.

## Tests

```bash
go test ./...
cd web && npm run build
```
