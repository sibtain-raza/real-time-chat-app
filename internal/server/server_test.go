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

	srv := server.New(server.Config{Addr: "127.0.0.1:0", Debug: false}, store)
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	adaToken := signup(t, ts.URL, "ada", "secret12")
	bobToken := signup(t, ts.URL, "bob", "secret34")

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
	selfEnc, err := crypto.EncryptFor(adaKP.Private, adaKP.PublicKeyB64(), []byte("ping"))
	if err != nil {
		t.Fatal(err)
	}
	if err := ada.WriteJSON(protocol.Packet{
		Type:     protocol.TypeMessage,
		To:       "bob",
		Message:  enc,
		SelfCopy: selfEnc,
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

	// History available for both sides
	adaHist := fetchMessages(t, ts.URL, adaToken, "bob")
	if len(adaHist) != 1 {
		t.Fatalf("ada history len=%d", len(adaHist))
	}
	bobHist := fetchMessages(t, ts.URL, bobToken, "ada")
	if len(bobHist) != 1 {
		t.Fatalf("bob history len=%d", len(bobHist))
	}
}

func TestConfigAndLogout(t *testing.T) {
	store, err := auth.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	srv := server.New(server.Config{
		ICEServers: []server.ICEServer{{URLs: []string{"stun:stun.example"}}},
	}, store)
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	res, err := http.Get(ts.URL + "/api/config")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	var cfg map[string]any
	_ = json.NewDecoder(res.Body).Decode(&cfg)
	if cfg["iceServers"] == nil {
		t.Fatal("missing iceServers")
	}

	token := signup(t, ts.URL, "carol", "secret56")
	req, _ := http.NewRequest(http.MethodPost, ts.URL+"/api/logout", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	res2, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res2.Body.Close()
	if res2.StatusCode != http.StatusOK {
		t.Fatalf("logout %d", res2.StatusCode)
	}
	if _, err := store.UsernameForToken(token); err == nil {
		t.Fatal("expected token invalidated")
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

func fetchMessages(t *testing.T, base, token, peer string) []auth.StoredMessage {
	t.Helper()
	req, _ := http.NewRequest(http.MethodGet, base+"/api/messages?peer="+peer, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	var out struct {
		Messages []auth.StoredMessage `json:"messages"`
	}
	_ = json.NewDecoder(res.Body).Decode(&out)
	return out.Messages
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
