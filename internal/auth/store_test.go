package auth_test

import (
	"path/filepath"
	"testing"

	"securechat/internal/auth"
)

func TestSignUpLoginAndSession(t *testing.T) {
	dir := t.TempDir()
	store, err := auth.Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	if err := store.SignUp("ada", "secret1"); err != nil {
		t.Fatal(err)
	}
	if err := store.SignUp("ada", "secret1"); err != auth.ErrUserExists {
		t.Fatalf("expected ErrUserExists, got %v", err)
	}

	token, err := store.Login("ada", "secret1")
	if err != nil {
		t.Fatal(err)
	}
	user, err := store.UsernameForToken(token)
	if err != nil || user != "ada" {
		t.Fatalf("token lookup: %v %q", err, user)
	}
	if _, err := store.Login("ada", "wrong"); err != auth.ErrBadCreds {
		t.Fatalf("expected bad creds, got %v", err)
	}

	if err := store.SetPublicKey("ada", "pubkey"); err != nil {
		t.Fatal(err)
	}
	users, err := store.ListUsers()
	if err != nil || len(users) != 1 || users[0].PublicKey != "pubkey" {
		t.Fatalf("list users: %+v %v", users, err)
	}
}
