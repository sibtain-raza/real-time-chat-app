package crypto_test

import (
	"bytes"
	"testing"

	"securechat/internal/crypto"
)

func TestEncryptDecryptRoundTrip(t *testing.T) {
	password := "shared-secret"
	plain := []byte("hello secure chat")

	enc, err := crypto.Encrypt(plain, password)
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}
	dec, err := crypto.Decrypt(enc, password)
	if err != nil {
		t.Fatalf("decrypt: %v", err)
	}
	if !bytes.Equal(plain, dec) {
		t.Fatalf("got %q want %q", dec, plain)
	}
}

func TestWrongKeyFails(t *testing.T) {
	enc, err := crypto.Encrypt([]byte("secret"), "key-a")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := crypto.Decrypt(enc, "key-b"); err == nil {
		t.Fatal("expected decrypt failure with wrong key")
	}
}

func TestDeriveKeyLength(t *testing.T) {
	k := crypto.DeriveKey("short")
	if len(k) != 32 {
		t.Fatalf("key length %d, want 32", len(k))
	}
	k2 := crypto.DeriveKey(string(bytes.Repeat([]byte("x"), 64)))
	if len(k2) != 32 {
		t.Fatalf("key length %d, want 32", len(k2))
	}
}
