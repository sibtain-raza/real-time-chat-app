package server_test

import (
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"securechat/internal/crypto"
	"securechat/internal/protocol"
	"securechat/internal/server"

	"github.com/gorilla/websocket"
)

func TestServerRelaysEncryptedText(t *testing.T) {
	srv := server.New("127.0.0.1:0", "", false)
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	alice := dialWS(t, ts.URL, "alice", "room-key")
	defer alice.Close()
	bob := dialWS(t, ts.URL, "bob", "room-key")
	defer bob.Close()

	deadline := time.Now().Add(2 * time.Second)
	for srv.ClientCount() < 2 {
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for both clients, have %d", srv.ClientCount())
		}
		time.Sleep(10 * time.Millisecond)
	}

	enc, err := crypto.Encrypt([]byte("ping"), "room-key")
	if err != nil {
		t.Fatal(err)
	}
	if err := alice.WriteJSON(protocol.Packet{Type: protocol.TypeMessage, Message: enc}); err != nil {
		t.Fatal(err)
	}

	_ = bob.SetReadDeadline(time.Now().Add(2 * time.Second))
	var pkt protocol.Packet
	if err := bob.ReadJSON(&pkt); err != nil {
		t.Fatalf("bob did not receive message: %v", err)
	}
	if pkt.Type != protocol.TypeMessage || pkt.Name != "alice" {
		t.Fatalf("unexpected packet: %+v", pkt)
	}
	plain, err := crypto.Decrypt(pkt.Message, "room-key")
	if err != nil {
		t.Fatal(err)
	}
	if string(plain) != "ping" {
		t.Fatalf("got %q", plain)
	}
}

func dialWS(t *testing.T, httpURL, name, key string) *websocket.Conn {
	t.Helper()
	wsURL := "ws" + strings.TrimPrefix(httpURL, "http") + "/ws"
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	if err := conn.WriteJSON(protocol.Handshake{Name: name, Key: key}); err != nil {
		t.Fatalf("handshake: %v", err)
	}
	return conn
}
