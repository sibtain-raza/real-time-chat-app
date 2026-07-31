# Secure Chat Application (Go)

A client-server chat application written in Go with text and voice messaging and AES-256-GCM encryption.

## Features

* **Text Messaging:** Send and receive text messages in real time.
* **Voice Messaging:** Stream voice messages with microphone / speaker toggles.
* **Encryption:** Messages are encrypted with AES-256-GCM using a shared user-provided key. The server decrypts with the sender key and re-encrypts for each recipient.
* **Graphical User Interface:** The client uses [Fyne](https://fyne.io/) for a cross-platform desktop UI.
* **Multi-client relay server:** TCP server on `0.0.0.0:9090` by default, with optional logging to `all.log`.

## Technologies

* **Go 1.22+**
* **Fyne** — client GUI
* **PortAudio** (`gordonklaus/portaudio`) — voice capture / playback
* **AES-256-GCM** — message encryption (`crypto/aes`)
* **Newline-delimited JSON** over TCP for framing

## Project layout

```
cmd/server/     Server entrypoint
cmd/client/     Desktop client entrypoint
internal/
  audio/        PortAudio recorder / player
  client/       Network + media client logic
  crypto/       Key derivation and AES-GCM helpers
  protocol/     Handshake / packet types and NDJSON framing
  server/       Multi-client chat relay
```

## Prerequisites

* Go 1.22 or newer
* System libraries:
  * PortAudio (`portaudio19-dev` on Debian/Ubuntu, `portaudio` on macOS via Homebrew)
  * Fyne graphics deps (`libgl-dev`, `xorg-dev` / X11 headers on Linux)

```bash
# Debian / Ubuntu
sudo apt-get install -y portaudio19-dev libgl-dev xorg-dev libxxf86vm-dev

# macOS
brew install portaudio
```

## Build

```bash
go mod tidy
go build -o bin/server ./cmd/server
go build -o bin/client ./cmd/client
```

## Run

1. Start the server:

```bash
./bin/server
# or: go run ./cmd/server
```

The server listens on `0.0.0.0:9090` by default. Override with `-addr`:

```bash
./bin/server -addr 0.0.0.0:9090 -debug=true
```

2. Start one or more clients:

```bash
./bin/client
# or: go run ./cmd/client
```

3. In the client UI:
   * Enter `IP:PORT` (e.g. `127.0.0.1:9090`)
   * Enter your display name
   * Enter a shared encryption key (must match for peers who should understand each other)
   * Click **Connect**

## Client controls

| Control | Purpose |
|---------|---------|
| Connect / Disconnect | Join or leave the server |
| Mic On/Off | Start or stop streaming microphone audio |
| Speaker On/Off | Enable or disable playback of incoming voice |
| Message + Send | Send encrypted text (Enter also sends) |

Voice packets are only forwarded by the server to clients that currently have speaker mode enabled.

## Encryption details

1. The user-provided key is padded or truncated to 32 bytes (same approach as the original Python app).
2. That key is used as an AES-256-GCM key.
3. Clients encrypt outbound text and voice payloads before sending.
4. The server decrypts with the sender’s key and re-encrypts with each recipient’s key before relay.
5. Anyone without the shared key cannot read message content.

## Tests

```bash
go test ./...
```

## Icons

Client window icons are from [Icons8](https://icons8.com):

* `icons8-chat-48.png` — application window icon
