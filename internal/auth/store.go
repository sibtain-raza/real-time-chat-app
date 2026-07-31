package auth

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
	_ "modernc.org/sqlite"
)

var (
	ErrUserExists   = errors.New("username already taken")
	ErrBadCreds     = errors.New("invalid username or password")
	ErrBadToken     = errors.New("invalid or expired session")
	ErrBadUsername  = errors.New("username must be 3–32 letters, numbers, or _")
	ErrBadPassword  = errors.New("password must be at least 6 characters")
)

type User struct {
	Username  string
	PublicKey string
	Online    bool
}

type Store struct {
	db *sql.DB
}

func Open(path string) (*Store, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	s := &Store{db: db}
	if err := s.migrate(); err != nil {
		_ = db.Close()
		return nil, err
	}
	return s, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) migrate() error {
	_, err := s.db.Exec(`
CREATE TABLE IF NOT EXISTS users (
  username TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  public_key TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY(username) REFERENCES users(username)
);
`)
	return err
}

func validUsername(u string) bool {
	if len(u) < 3 || len(u) > 32 {
		return false
	}
	for _, r := range u {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' {
			continue
		}
		return false
	}
	return true
}

func (s *Store) SignUp(username, password string) error {
	username = strings.TrimSpace(username)
	if !validUsername(username) {
		return ErrBadUsername
	}
	if len(password) < 6 {
		return ErrBadPassword
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(
		`INSERT INTO users(username, password_hash, created_at) VALUES(?,?,?)`,
		username, string(hash), time.Now().Unix(),
	)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			return ErrUserExists
		}
		return err
	}
	return nil
}

func (s *Store) Login(username, password string) (token string, err error) {
	username = strings.TrimSpace(username)
	var hash string
	err = s.db.QueryRow(`SELECT password_hash FROM users WHERE username = ?`, username).Scan(&hash)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrBadCreds
	}
	if err != nil {
		return "", err
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) != nil {
		return "", ErrBadCreds
	}
	return s.createSession(username)
}

func (s *Store) createSession(username string) (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	token := hex.EncodeToString(buf)
	expires := time.Now().Add(30 * 24 * time.Hour).Unix()
	_, err := s.db.Exec(`INSERT INTO sessions(token, username, expires_at) VALUES(?,?,?)`, token, username, expires)
	if err != nil {
		return "", err
	}
	return token, nil
}

func (s *Store) UsernameForToken(token string) (string, error) {
	if token == "" {
		return "", ErrBadToken
	}
	var username string
	var expires int64
	err := s.db.QueryRow(`SELECT username, expires_at FROM sessions WHERE token = ?`, token).Scan(&username, &expires)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrBadToken
	}
	if err != nil {
		return "", err
	}
	if time.Now().Unix() > expires {
		_, _ = s.db.Exec(`DELETE FROM sessions WHERE token = ?`, token)
		return "", ErrBadToken
	}
	return username, nil
}

func (s *Store) SetPublicKey(username, publicKey string) error {
	res, err := s.db.Exec(`UPDATE users SET public_key = ? WHERE username = ?`, publicKey, username)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("user not found")
	}
	return nil
}

func (s *Store) ListUsers() ([]User, error) {
	rows, err := s.db.Query(`SELECT username, public_key FROM users ORDER BY username COLLATE NOCASE`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []User
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.Username, &u.PublicKey); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}
