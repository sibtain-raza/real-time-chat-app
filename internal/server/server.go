package server

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"os"
	"sync"
	"time"

	"securechat/internal/crypto"
	"securechat/internal/protocol"
)

// Client holds per-connection state.
type Client struct {
	conn *protocol.Conn
	name string
	key  string
}

// Server is a multi-client encrypted chat relay.
type Server struct {
	addr      string
	mu        sync.RWMutex
	clients   map[*Client]struct{}
	streaming map[*Client]struct{}
	logger    *log.Logger
	debug     bool
}

func New(addr string, debug bool) *Server {
	f, err := os.OpenFile("all.log", os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	var logger *log.Logger
	if err != nil {
		logger = log.New(os.Stdout, "", log.LstdFlags)
	} else {
		logger = log.New(f, "", log.LstdFlags)
	}
	return &Server{
		addr:      addr,
		clients:   make(map[*Client]struct{}),
		streaming: make(map[*Client]struct{}),
		logger:    logger,
		debug:     debug,
	}
}

func (s *Server) logf(format string, args ...any) {
	msg := fmt.Sprintf("[%s] %s", time.Now().Format("03:04:05 PM"), fmt.Sprintf(format, args...))
	fmt.Println(msg)
	if s.debug {
		s.logger.Println(msg)
	}
}

func (s *Server) ClientCount() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.clients)
}

func (s *Server) ListenAndServe() error {
	ln, err := net.Listen("tcp", s.addr)
	if err != nil {
		return err
	}
	s.logf("Server start on %s", s.addr)
	for {
		raw, err := ln.Accept()
		if err != nil {
			s.logf("accept error: %v", err)
			continue
		}
		go s.handleConn(raw)
	}
}

func (s *Server) handleConn(raw net.Conn) {
	c := protocol.NewConn(raw)
	var hs protocol.Handshake
	if err := c.Decoder.Decode(&hs); err != nil {
		_ = c.Close()
		return
	}
	if hs.Name == "" || hs.Key == "" {
		_ = c.Close()
		return
	}

	client := &Client{conn: c, name: hs.Name, key: hs.Key}
	s.mu.Lock()
	s.clients[client] = struct{}{}
	s.mu.Unlock()

	s.logf("Connected %s as %q", c.RemoteAddr(), hs.Name)

	defer func() {
		s.removeClient(client)
		_ = c.Close()
		s.logf("Disconnected %s (%s)", c.RemoteAddr(), hs.Name)
	}()

	for {
		var pkt protocol.Packet
		if err := c.Decoder.Decode(&pkt); err != nil {
			return
		}
		s.handlePacket(client, pkt)
	}
}

func (s *Server) removeClient(client *Client) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.clients, client)
	delete(s.streaming, client)
}

func (s *Server) handlePacket(sender *Client, pkt protocol.Packet) {
	switch pkt.Type {
	case protocol.TypeSetting:
		s.mu.Lock()
		if pkt.Voice == "on" {
			s.streaming[sender] = struct{}{}
		} else {
			delete(s.streaming, sender)
		}
		s.mu.Unlock()

	case protocol.TypeMessage:
		plain, err := crypto.Decrypt(pkt.Message, sender.key)
		if err != nil {
			s.logf("decrypt text from %s failed: %v", sender.name, err)
			return
		}
		s.relayText(sender, plain)

	case protocol.TypeVoice:
		plain, err := crypto.Decrypt(pkt.Message, sender.key)
		if err != nil {
			s.logf("decrypt voice from %s failed: %v", sender.name, err)
			return
		}
		s.relayVoice(sender, plain)

	default:
		s.logf("unknown packet type %q from %s", pkt.Type, sender.name)
	}
}

func (s *Server) relayText(sender *Client, plain []byte) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for c := range s.clients {
		if c == sender {
			continue
		}
		enc, err := crypto.Encrypt(plain, c.key)
		if err != nil {
			continue
		}
		out := protocol.Packet{
			Type:    protocol.TypeMessage,
			Name:    sender.name,
			Message: enc,
		}
		_ = c.conn.Encoder.Encode(out)
	}
}

func (s *Server) relayVoice(sender *Client, plain []byte) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for c := range s.streaming {
		if c == sender {
			continue
		}
		enc, err := crypto.Encrypt(plain, c.key)
		if err != nil {
			continue
		}
		out := protocol.Packet{
			Type:    protocol.TypeVoice,
			Name:    sender.name,
			Message: enc,
		}
		_ = c.conn.Encoder.Encode(out)
	}
}

// MarshalHandshake is a tiny helper used by tests / debugging.
func MarshalHandshake(hs protocol.Handshake) ([]byte, error) {
	return json.Marshal(hs)
}
