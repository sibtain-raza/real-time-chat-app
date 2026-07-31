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

func TestServerRoutesEncryptedEnvelopes(t *testing.T) {
	srv := server.New("127.0.0.1:0", "", false)
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	aliceKP, err := crypto.GenerateKeyPair()
	if err != nil {
		t.Fatal(err)
	}
	bobKP, err := crypto.GenerateKeyPair()
	if err != nil {
		t.Fatal(err)
	}

	alice := dialWS(t, ts.URL, "alice", aliceKP.PublicKeyB64())
	defer alice.Close()
	bob := dialWS(t, ts.URL, "bob", bobKP.PublicKeyB64())
	defer bob.Close()

	deadline := time.Now().Add(2 * time.Second)
	for srv.ClientCount() < 2 {
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for both clients, have %d", srv.ClientCount())
		}
		time.Sleep(10 * time.Millisecond)
	}

	enc, err := crypto.EncryptFor(aliceKP.Private, bobKP.PublicKeyB64(), []byte("ping"))
	if err != nil {
		t.Fatal(err)
	}
	if err := alice.WriteJSON(protocol.Packet{
		Type: protocol.TypeMessage,
		Envelopes: []protocol.Envelope{
			{To: bobKP.PublicKeyB64(), Message: enc},
		},
	}); err != nil {
		t.Fatal(err)
	}

	pkt := readUntil(t, bob, protocol.TypeMessage, 2*time.Second)
	if pkt.Name != "alice" {
		t.Fatalf("unexpected packet: %+v", pkt)
	}
	plain, err := crypto.DecryptFrom(bobKP.Private, pkt.PublicKey, pkt.Message)
	if err != nil {
		t.Fatal(err)
	}
	if string(plain) != "ping" {
		t.Fatalf("got %q", plain)
	}
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
	t.Fatalf("timed out waiting for packet type %q", typ)
	return protocol.Packet{}
}

func dialWS(t *testing.T, httpURL, name, publicKey string) *websocket.Conn {
	t.Helper()
	wsURL := "ws" + strings.TrimPrefix(httpURL, "http") + "/ws"
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	if err := conn.WriteJSON(protocol.Handshake{Name: name, PublicKey: publicKey}); err != nil {
		t.Fatalf("handshake: %v", err)
	}
	return conn
}
