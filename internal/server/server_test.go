package server_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"securechat/internal/auth"
	"securechat/internal/crypto"
	"securechat/internal/protocol"
	"securechat/internal/server"

	"github.com/gorilla/websocket"
)

func TestSignupLoginAndDirectMessage(t *testing.T) {
	store, err := auth.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	srv := server.New("127.0.0.1:0", "", store, false)
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	adaToken := signup(t, ts.URL, "ada", "secret1")
	bobToken := signup(t, ts.URL, "bob", "secret2")

	adaKP, _ := crypto.GenerateKeyPair()
	bobKP, _ := crypto.GenerateKeyPair()

	ada := dialAuthed(t, ts.URL, adaToken, adaKP.PublicKeyB64())
	defer ada.Close()
	bob := dialAuthed(t, ts.URL, bobToken, bobKP.PublicKeyB64())
	defer bob.Close()

	deadline := time.Now().Add(2 * time.Second)
	for srv.OnlineCount() < 2 {
		if time.Now().After(deadline) {
			t.Fatalf("online=%d", srv.OnlineCount())
		}
		time.Sleep(10 * time.Millisecond)
	}

	enc, err := crypto.EncryptFor(adaKP.Private, bobKP.PublicKeyB64(), []byte("ping"))
	if err != nil {
		t.Fatal(err)
	}
	if err := ada.WriteJSON(protocol.Packet{
		Type:    protocol.TypeMessage,
		To:      "bob",
		Message: enc,
	}); err != nil {
		t.Fatal(err)
	}

	pkt := readUntil(t, bob, protocol.TypeMessage, 2*time.Second)
	if pkt.From != "ada" {
		t.Fatalf("from=%q", pkt.From)
	}
	plain, err := crypto.DecryptFrom(bobKP.Private, pkt.PublicKey, pkt.Message)
	if err != nil {
		t.Fatal(err)
	}
	if string(plain) != "ping" {
		t.Fatalf("got %q", plain)
	}
}

func signup(t *testing.T, base, user, pass string) string {
	t.Helper()
	body, _ := json.Marshal(map[string]string{"username": user, "password": pass})
	res, err := http.Post(base+"/api/signup", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("signup status %d", res.StatusCode)
	}
	var out struct {
		Token string `json:"token"`
	}
	_ = json.NewDecoder(res.Body).Decode(&out)
	if out.Token == "" {
		t.Fatal("empty token")
	}
	return out.Token
}

func dialAuthed(t *testing.T, httpURL, token, publicKey string) *websocket.Conn {
	t.Helper()
	wsURL := "ws" + strings.TrimPrefix(httpURL, "http") + "/ws"
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := conn.WriteJSON(protocol.Handshake{Token: token, PublicKey: publicKey}); err != nil {
		t.Fatal(err)
	}
	return conn
}

func readUntil(t *testing.T, conn *websocket.Conn, typ string, timeout time.Duration) protocol.Packet {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		_ = conn.SetReadDeadline(time.Now().Add(200 * time.Millisecond))
		var pkt protocol.Packet
		if err := conn.ReadJSON(&pkt); err != nil {
			continue
		}
		if pkt.Type == typ {
			return pkt
		}
	}
	t.Fatalf("timed out waiting for %q", typ)
	return protocol.Packet{}
}
