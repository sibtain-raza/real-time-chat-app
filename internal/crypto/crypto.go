package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"io"
)

// DeriveKey turns a user-provided password into a 32-byte AES-256 key.
// Matches the original Python padding approach: left-pad/truncate to 32 bytes.
func DeriveKey(password string) []byte {
	buf := make([]byte, 32)
	copy(buf, []byte(password))
	if len(password) < 32 {
		for i := len(password); i < 32; i++ {
			buf[i] = ' '
		}
	}
	return buf
}

// Encrypt encrypts plaintext with AES-256-GCM and returns a base64 ciphertext.
func Encrypt(plaintext []byte, password string) (string, error) {
	block, err := aes.NewCipher(DeriveKey(password))
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
	ciphertext := gcm.Seal(nonce, nonce, plaintext, nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// Decrypt decrypts a base64 AES-256-GCM ciphertext.
func Decrypt(ciphertextB64 string, password string) ([]byte, error) {
	raw, err := base64.StdEncoding.DecodeString(ciphertextB64)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(DeriveKey(password))
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
