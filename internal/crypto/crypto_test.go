package crypto_test

import (
	"bytes"
	"testing"

	"securechat/internal/crypto"
)

func TestECDHEncryptDecryptRoundTrip(t *testing.T) {
	alice, err := crypto.GenerateKeyPair()
	if err != nil {
		t.Fatal(err)
	}
	bob, err := crypto.GenerateKeyPair()
	if err != nil {
		t.Fatal(err)
	}

	plain := []byte("hello secure chat")
	enc, err := crypto.EncryptFor(alice.Private, bob.PublicKeyB64(), plain)
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}
	dec, err := crypto.DecryptFrom(bob.Private, alice.PublicKeyB64(), enc)
	if err != nil {
		t.Fatalf("decrypt: %v", err)
	}
	if !bytes.Equal(plain, dec) {
		t.Fatalf("got %q want %q", dec, plain)
	}
}

func TestWrongRecipientCannotDecrypt(t *testing.T) {
	alice, _ := crypto.GenerateKeyPair()
	bob, _ := crypto.GenerateKeyPair()
	carol, _ := crypto.GenerateKeyPair()

	enc, err := crypto.EncryptFor(alice.Private, bob.PublicKeyB64(), []byte("secret"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := crypto.DecryptFrom(carol.Private, alice.PublicKeyB64(), enc); err == nil {
		t.Fatal("expected decrypt failure for wrong recipient")
	}
}

func TestPublicKeyRoundTrip(t *testing.T) {
	kp, err := crypto.GenerateKeyPair()
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := crypto.ParsePublicKey(kp.PublicKeyB64())
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(parsed.Bytes(), kp.Public.Bytes()) {
		t.Fatal("public key mismatch")
	}
}
