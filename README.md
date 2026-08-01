# Secure Chat Application

Go WebSocket server + React UI with **signup/login** and **1:1 end-to-end encrypted chat**.

## Features

* **Sign up / log in** — accounts stored in SQLite (bcrypt password hashes)
* **1:1 chat** — pick a person from your directory; messages go only to them
* **Automatic ECDH key pairs** — created/restored in the browser per account (no shared room password)
* **End-to-end encryption** — AES-GCM sealed with ECDH; server routes ciphertext only
* **Voice** — mic/speaker toggles for the active conversation
* **1:1 video calls** — WebRTC (camera/mic) with signaling over the existing WebSocket
* **Online presence** — see who is connected

## Quick start

```bash
cd web && npm install && npm run build && cd ..
go run ./cmd/server
# open http://localhost:9090
```

1. **Sign up** as `ada`
2. Open another browser/profile and **sign up** as `bob`
3. Select each other in **People** and chat
4. Click the **video** button in a conversation header to start a 1:1 call (allow camera/mic)

## API

| Endpoint | Description |
|----------|-------------|
| `POST /api/signup` | `{username,password}` → `{token,username}` |
| `POST /api/login` | `{username,password}` → `{token,username}` |
| `GET /api/users` | `Authorization: Bearer <token>` |
| `WS /ws` | first frame `{token, publicKey}` |

## Flags

```bash
go run ./cmd/server -addr 0.0.0.0:9090 -web web/dist -db chatapp.db
```

## Tests

```bash
go test ./...
cd web && npm run build
```

See `REWRITE.md` for project history and design intent.
