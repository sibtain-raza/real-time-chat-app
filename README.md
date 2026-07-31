# Secure Chat Application

A Go WebSocket chat server with a React web UI. Each user gets an automatic ECDH key pair; messages are end-to-end encrypted to each peer’s public key.

## Features

* **Automatic key pairs** — on join, the browser creates an ECDH P-256 public/private key pair (no shared password field)
* **End-to-end text & voice** — ciphertext is sealed per recipient; the server only routes envelopes
* **Peer discovery** — server announces connected public keys so clients can encrypt to the right people
* **React UI** served by the Go server (or Vite in development)

## Stack

* **Go** — HTTP + WebSocket relay (`gorilla/websocket`)
* **React + TypeScript + Vite** — web client
* **Web Crypto / Go `crypto/ecdh`** — P-256 ECDH + AES-256-GCM
* **Web Audio / getUserMedia** — voice capture and playback

## Project layout

```
cmd/server/           Go server entrypoint
internal/crypto/      ECDH + AES-GCM helpers
internal/protocol/    Handshake, peers, envelopes
internal/server/      Opaque envelope routing + static UI
web/                  React client (Vite)
REWRITE.md            Why this rewrite exists
```

## How encryption works

1. Client generates an ECDH P-256 key pair in the browser
2. Handshake sends `{ name, publicKey }` (private key never leaves the device)
3. Server broadcasts the peer list (`name` + `publicKey`) to everyone
4. On send, the client encrypts a separate AES-GCM envelope for each other peer using ECDH(shared secret → SHA-256 → AES key)
5. Server routes each envelope to the matching public key **without decrypting**

## Prerequisites

* Go 1.22+
* Node.js 20+ (to build or develop the UI)

## Build & run

```bash
cd web && npm install && npm run build && cd ..
go run ./cmd/server
# open http://localhost:9090
```

## Develop the UI (hot reload)

```bash
go run ./cmd/server          # terminal 1
cd web && npm run dev        # terminal 2 — proxies /ws to :9090
```

## How to use

1. Open the app
2. Optionally set **Server** (`host:port`)
3. Enter a **name** (no encryption password)
4. Click **Enter room** — keys are created automatically
5. Chat when peers are online; toggle mic / speaker for voice

## Tests

```bash
go test ./...
cd web && npm run build
```
