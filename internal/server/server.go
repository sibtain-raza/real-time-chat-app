package server

import (
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"securechat/internal/crypto"
	"securechat/internal/protocol"

	"github.com/gorilla/websocket"
)

// Client holds per-connection state.
type Client struct {
	transport protocol.Transport
	name      string
	key       string
}

// Server is a multi-client encrypted chat relay with a React web UI.
type Server struct {
	addr      string
	webDir    string
	mu        sync.RWMutex
	clients   map[*Client]struct{}
	streaming map[*Client]struct{}
	logger    *log.Logger
	debug     bool
	upgrader  websocket.Upgrader
}

func New(addr, webDir string, debug bool) *Server {
	f, err := os.OpenFile("all.log", os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	var logger *log.Logger
	if err != nil {
		logger = log.New(os.Stdout, "", log.LstdFlags)
	} else {
		logger = log.New(f, "", log.LstdFlags)
	}
	return &Server{
		addr:      addr,
		webDir:    webDir,
		clients:   make(map[*Client]struct{}),
		streaming: make(map[*Client]struct{}),
		logger:    logger,
		debug:     debug,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
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

// Handler returns the HTTP mux (static UI + /ws + health).
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", s.handleWebSocket)
	mux.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	})

	if s.webDir != "" {
		webDir := s.webDir
		if abs, err := filepath.Abs(webDir); err == nil {
			webDir = abs
		}
		fs := http.FileServer(http.Dir(webDir))
		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			path := filepath.Join(webDir, filepath.Clean(r.URL.Path))
			if info, err := os.Stat(path); err == nil && !info.IsDir() {
				fs.ServeHTTP(w, r)
				return
			}
			http.ServeFile(w, r, filepath.Join(webDir, "index.html"))
		})
	} else {
		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "text/plain")
			_, _ = w.Write([]byte("ChatApp API is running. Build the React UI into web/dist."))
		})
	}
	return mux
}

func (s *Server) ListenAndServe() error {
	ln, err := net.Listen("tcp", s.addr)
	if err != nil {
		return err
	}
	s.logf("Server start on http://%s (ws://%s/ws)", ln.Addr().String(), ln.Addr().String())
	return http.Serve(ln, s.Handler())
}

func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		s.logf("websocket upgrade failed: %v", err)
		return
	}
	t := &wsTransport{conn: conn, remote: r.RemoteAddr}
	s.serveClient(t)
}

func (s *Server) ServeTransport(t protocol.Transport) {
	s.serveClient(t)
}

func (s *Server) serveClient(t protocol.Transport) {
	var hs protocol.Handshake
	if err := t.ReadJSON(&hs); err != nil {
		_ = t.Close()
		return
	}
	if hs.Name == "" || hs.Key == "" {
		_ = t.Close()
		return
	}

	client := &Client{transport: t, name: hs.Name, key: hs.Key}
	s.mu.Lock()
	s.clients[client] = struct{}{}
	s.mu.Unlock()

	s.logf("Connected %s as %q", t.RemoteAddr(), hs.Name)

	defer func() {
		s.removeClient(client)
		_ = t.Close()
		s.logf("Disconnected %s (%s)", t.RemoteAddr(), hs.Name)
	}()

	for {
		var pkt protocol.Packet
		if err := t.ReadJSON(&pkt); err != nil {
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
		_ = c.transport.WriteJSON(out)
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
		_ = c.transport.WriteJSON(out)
	}
}
