package server_test

import (
	"net"
	"testing"
	"time"

	"securechat/internal/crypto"
	"securechat/internal/protocol"
	"securechat/internal/server"
)

func TestServerRelaysEncryptedText(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	addr := ln.Addr().String()
	_ = ln.Close()

	srv := server.New(addr, false)
	go func() { _ = srv.ListenAndServe() }()
	time.Sleep(100 * time.Millisecond)

	alice, err := dialClient(addr, "alice", "room-key")
	if err != nil {
		t.Fatal(err)
	}
	defer alice.Close()

	bob, err := dialClient(addr, "bob", "room-key")
	if err != nil {
		t.Fatal(err)
	}
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
	if err := alice.Encoder.Encode(protocol.Packet{Type: protocol.TypeMessage, Message: enc}); err != nil {
		t.Fatal(err)
	}

	_ = bob.Net.SetReadDeadline(time.Now().Add(2 * time.Second))
	var pkt protocol.Packet
	if err := bob.Decoder.Decode(&pkt); err != nil {
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

func dialClient(addr, name, key string) (*protocol.Conn, error) {
	raw, err := net.DialTimeout("tcp", addr, time.Second)
	if err != nil {
		return nil, err
	}
	c := protocol.NewConn(raw)
	if err := c.Encoder.Encode(protocol.Handshake{Name: name, Key: key}); err != nil {
		_ = c.Close()
		return nil, err
	}
	return c, nil
}
