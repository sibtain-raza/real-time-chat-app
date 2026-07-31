# Go + React Rewrite: What We're Doing and Why

## What we're doing

We're rebuilding the original Python tkinter chat app as:

1. A **Go** WebSocket relay server
2. A **React** browser UI (not a desktop toolkit UI)

Same product behavior, with stronger crypto UX:

- Multi-client real-time **text chat**
- **Voice streaming** (mic / speaker toggles)
- **Per-user ECDH key pairs** (no shared password to type)
- One place to connect: open the web app, enter a name, chat

```
cmd/server/          HTTP + WebSocket server
internal/            Crypto, protocol, relay
web/                 React + Vite client
```

## Why we're doing it

### 1. A UI people can actually enjoy

The Python GUI was functional but dated. React lets us ship a deliberate visual design: brand-forward connect screen, motion, responsive layout, and a calm chat room — without fighting tkinter layout constraints.

### 2. Browser reach

Anyone with a modern browser can join. No Python runtime, no native GUI toolkit, no PortAudio install on each client machine.

### 3. Clearer backend structure

Go packages separate crypto, protocol, and relay logic. Goroutines fit multi-client WebSocket fan-out cleanly.

### 4. Safer framing

Messages are JSON over WebSocket (one JSON object per frame). That replaces the old Python suffix-buffer heuristics.

### 5. Modern crypto defaults

Each client creates an **ECDH P-256** key pair automatically. Messages use **ECDH + AES-256-GCM** envelopes per recipient. The server never sees plaintext and never holds private keys.

## What stayed the same

| Feature | Status |
|---------|--------|
| Text messaging with timestamps and sender names | Kept |
| Voice send/receive with mic and speaker toggles | Kept |
| Shared encryption password field | Removed — replaced by auto key pairs |
| Server relays to other clients | Kept (opaque envelopes) |
| Voice only forwarded when speaker is enabled | Kept |
| Default port `9090` | Kept |
| Optional `all.log` logging | Kept |

## What changed intentionally

| Area | Before | After | Reason |
|------|--------|-------|--------|
| Language | Python | Go + TypeScript | Structure + web UI |
| UI | tkinter / Fyne | React | Beautiful, portable browser UI |
| Transport | Raw TCP | WebSocket | Browser-compatible |
| Encryption | Shared Fernet/AES password | ECDH P-256 + AES-GCM per peer | Real E2E, no password UX |
| Audio | PyAudio / PortAudio | Web Audio + getUserMedia | No native deps on clients |

## Design intent for the UI

- **Brand first:** “ChatApp” is the hero of the first screen, not a nav label
- **One job per view:** connect gate, then chat room
- **Atmosphere:** full-bleed wave plane + mist gradients (coastal teal ink)
- **Typography:** Bricolage Grotesque + Source Sans 3
- **Motion:** gate rise, ambient wave drift, message enter

## How to run (quick)

```bash
cd web && npm install && npm run build && cd ..
go run ./cmd/server
# open http://localhost:9090
```

See `README.md` for full setup.

## Success criteria

1. Server serves the React UI and accepts WebSocket clients
2. Encrypted text relays between clients that share a key
3. Voice streams when mic/speaker are enabled
4. UI works on desktop and mobile widths
5. `go test ./...` and `npm run build` succeed
