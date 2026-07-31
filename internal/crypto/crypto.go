package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"io"
)

// KeyPair is an ECDH P-256 key pair.
type KeyPair struct {
	Private *ecdh.PrivateKey
	Public  *ecdh.PublicKey
}

// GenerateKeyPair creates a new P-256 ECDH key pair.
func GenerateKeyPair() (*KeyPair, error) {
	priv, err := ecdh.P256().GenerateKey(rand.Reader)
	if err != nil {
		return nil, err
	}
	return &KeyPair{Private: priv, Public: priv.PublicKey()}, nil
}

// PublicKeyB64 returns the uncompressed public key as standard base64.
func (k *KeyPair) PublicKeyB64() string {
	return base64.StdEncoding.EncodeToString(k.Public.Bytes())
}

// ParsePublicKey decodes a base64 uncompressed P-256 public key.
func ParsePublicKey(b64 string) (*ecdh.PublicKey, error) {
	raw, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return nil, err
	}
	return ecdh.P256().NewPublicKey(raw)
}

func sharedAESKey(priv *ecdh.PrivateKey, peer *ecdh.PublicKey) ([]byte, error) {
	secret, err := priv.ECDH(peer)
	if err != nil {
		return nil, err
	}
	sum := sha256.Sum256(secret)
	return sum[:], nil
}

// EncryptFor encrypts plaintext for a peer using ECDH(P-256) + AES-256-GCM.
func EncryptFor(priv *ecdh.PrivateKey, peerPubB64 string, plaintext []byte) (string, error) {
	peer, err := ParsePublicKey(peerPubB64)
	if err != nil {
		return "", err
	}
	key, err := sharedAESKey(priv, peer)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	out := gcm.Seal(nonce, nonce, plaintext, nil)
	return base64.StdEncoding.EncodeToString(out), nil
}

// DecryptFrom decrypts ciphertext from a peer using ECDH(P-256) + AES-256-GCM.
func DecryptFrom(priv *ecdh.PrivateKey, senderPubB64 string, ciphertextB64 string) ([]byte, error) {
	sender, err := ParsePublicKey(senderPubB64)
	if err != nil {
		return nil, err
	}
	key, err := sharedAESKey(priv, sender)
	if err != nil {
		return nil, err
	}
	raw, err := base64.StdEncoding.DecodeString(ciphertextB64)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonceSize := gcm.NonceSize()
	if len(raw) < nonceSize {
		return nil, errors.New("ciphertext too short")
	}
	nonce, ciphertext := raw[:nonceSize], raw[nonceSize:]
	return gcm.Open(nil, nonce, ciphertext, nil)
}
