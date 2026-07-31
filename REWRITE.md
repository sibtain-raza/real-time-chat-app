# Go Rewrite: What We're Doing and Why

## What we're doing

We're replacing the original Python secure chat application with a **Go** implementation that keeps the same product behavior:

- Multi-client real-time **text chat**
- **Voice streaming** (mic / speaker toggles)
- **Shared-key encryption** for message contents
- A **desktop GUI client** plus a **TCP relay server**

The Python sources (`Client.py`, `Server.py`) are removed. The app now lives under a standard Go module layout:

```
cmd/server/          Server entrypoint
cmd/client/          Fyne desktop client
internal/audio/      PortAudio capture / playback
internal/client/     Client networking + media control
internal/crypto/     Key derivation + AES-256-GCM
internal/protocol/   Handshake / packet types + NDJSON framing
internal/server/     Multi-client relay logic
```

## Why we're doing it

### 1. Clearer structure

The Python version was mostly two large scripts. The Go rewrite splits networking, crypto, audio, protocol, and UI into packages so each piece is easier to read, test, and change.

### 2. Better concurrency model

Chat servers need many simultaneous connections and background audio work. Go's goroutines and channels fit that model more naturally than ad-hoc Python threads around sockets and PyAudio.

### 3. Stronger packaging and distribution

A Go binary can be built once and run without a Python interpreter or `pip install cryptography pyaudio`. That makes deployment and local setup simpler (aside from system libs for GUI/audio).

### 4. Safer protocol framing

The Python client/server used fragile buffering that looked for a `"}` suffix to find message boundaries. The Go version uses **newline-delimited JSON (NDJSON)**, which is simpler and less error-prone for streaming JSON over TCP.

### 5. Modern crypto defaults

The original app used Fernet. The rewrite uses **AES-256-GCM** from Go's standard library:

- Same user experience: enter a shared encryption key in the UI
- Same key-shaping idea: pad/truncate the password to 32 bytes
- Authenticated encryption (confidentiality + integrity) without a third-party crypto package

### 6. Keep the product, not the language

This is not a redesign of the chat product. Users still:

1. Start the server
2. Open the client
3. Enter `IP:PORT`, name, and shared key
4. Send text and optionally stream voice

The goal is a maintainable Go codebase with equivalent features.

## What stayed the same

| Feature | Status |
|---------|--------|
| Text messaging with timestamps and sender names | Kept |
| Voice send/receive with mic and speaker toggles | Kept |
| Shared encryption key among peers | Kept |
| Server relays to other clients | Kept |
| Voice only forwarded to clients with speaker enabled | Kept |
| Default listen address `0.0.0.0:9090` | Kept |
| Optional `all.log` server logging | Kept |
| Desktop GUI | Kept (Fyne instead of tkinter) |

## What changed intentionally

| Area | Before | After | Reason |
|------|--------|-------|--------|
| Language | Python 3 | Go 1.22+ | Structure, concurrency, distribution |
| GUI | tkinter | Fyne | Idiomatic cross-platform Go UI |
| Audio | PyAudio | PortAudio (via `gordonklaus/portaudio`) | Common Go audio binding |
| Encryption | Fernet | AES-256-GCM | Stdlib crypto, AEAD |
| Framing | Suffix / buffer heuristics | NDJSON | Reliable message boundaries |
| Layout | Two scripts | `cmd/` + `internal/` packages | Testable modules |

## Why not keep Python?

Python is fine for a prototype. Rewriting in Go is useful when we want:

- A single compiled server/client artifact
- Package boundaries that match networking, crypto, and UI concerns
- Easier concurrent connection handling
- Tests that sit next to each package (`internal/crypto`, `internal/server`)

If the goal were only a quick demo, Python would still work. This rewrite is for a cleaner long-term codebase with the same chat features.

## How to run (quick)

```bash
# System deps (Debian/Ubuntu)
sudo apt-get install -y portaudio19-dev libgl-dev xorg-dev libxxf86vm-dev

go mod tidy
go run ./cmd/server
go run ./cmd/client
```

See `README.md` for full setup, controls, and encryption details.

## Success criteria

This rewrite is “done” when:

1. Server accepts multiple clients on TCP
2. Encrypted text relays correctly between clients that share a key
3. Voice streams when mic/speaker are enabled
4. GUI covers connect/disconnect, chat, and media toggles
5. `go test ./...` and `go build ./cmd/...` succeed
