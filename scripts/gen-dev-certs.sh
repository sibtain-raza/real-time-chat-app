#!/usr/bin/env bash
# Generate a local self-signed cert for HTTPS/WSS development.
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)/certs"
mkdir -p "$DIR"
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$DIR/dev-key.pem" \
  -out "$DIR/dev-cert.pem" \
  -days 365 \
  -subj "/CN=localhost"
echo "Wrote $DIR/dev-cert.pem and $DIR/dev-key.pem"
echo "Run: go run ./cmd/server -tls-cert certs/dev-cert.pem -tls-key certs/dev-key.pem"
