# Secure Chat Application

A Go WebSocket chat server with a React web UI. Supports encrypted text and voice messaging.

## Features

* **Text messaging** in real time over WebSocket
* **Voice streaming** via browser microphone / speaker toggles
* **AES-256-GCM encryption** with a shared room key
* **React UI** served by the Go server (or Vite in development)

## Stack

* **Go** — HTTP + WebSocket relay (`gorilla/websocket`)
* **React + TypeScript + Vite** — desktop/mobile web client
* **Web Crypto API** — client-side encrypt/decrypt
* **Web Audio / getUserMedia** — voice capture and playback

## Project layout

```
cmd/server/           Go server entrypoint
internal/crypto/      AES-256-GCM helpers
internal/protocol/    Handshake + packet types
internal/server/      Relay + static UI hosting
web/                  React client (Vite)
REWRITE.md            Why this rewrite exists
```

## Prerequisites

* Go 1.22+
* Node.js 20+ (to build or develop the UI)

## Build the UI

```bash
cd web
npm install
npm run build
```

This writes production assets to `web/dist`.

## Run the server

```bash
go run ./cmd/server
# optional flags:
#   -addr 0.0.0.0:9090
#   -web web/dist
#   -debug=true
```

Open **http://localhost:9090**

## Develop the UI (hot reload)

Terminal 1:

```bash
go run ./cmd/server
```

Terminal 2:

```bash
cd web
npm run dev
```

Vite proxies `/ws` and `/api` to the Go server on port 9090.

## How to use

1. Open the app in a browser
2. Optionally set **Server** (`host:port`); leave blank when UI and API share a host
3. Enter a **name** and shared **encryption key**
4. Click **Enter room**
5. Send text; toggle mic / speaker for voice

Peers need the same encryption key to understand each other. Voice packets are only forwarded to clients that currently have the speaker enabled.

## Tests

```bash
go test ./...
cd web && npm run build
```

## Icons

`icons8-chat-48.png` is from [Icons8](https://icons8.com).
