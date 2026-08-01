package server

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"securechat/internal/auth"
	"securechat/internal/protocol"

	"github.com/gorilla/websocket"
)

type Client struct {
	transport protocol.Transport
	username  string
	publicKey string
}

// ICEServer is passed to browsers for WebRTC.
type ICEServer struct {
	URLs       []string `json:"urls"`
	Username   string   `json:"username,omitempty"`
	Credential string   `json:"credential,omitempty"`
}

// Config holds optional TLS and ICE/TURN settings.
type Config struct {
	Addr     string
	WebDir   string
	TLSCert  string
	TLSKey   string
	Debug    bool
	ICEServers []ICEServer
}

type Server struct {
	cfg       Config
	store     *auth.Store
	mu        sync.RWMutex
	clients   map[string]*Client
	streaming map[string]bool
	logger    *log.Logger
	upgrader  websocket.Upgrader
	authLimit *RateLimiter
}

func New(cfg Config, store *auth.Store) *Server {
	f, err := os.OpenFile("all.log", os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	var logger *log.Logger
	if err != nil {
		logger = log.New(os.Stdout, "", log.LstdFlags)
	} else {
		logger = log.New(f, "", log.LstdFlags)
	}
	if len(cfg.ICEServers) == 0 {
		cfg.ICEServers = []ICEServer{
			{URLs: []string{"stun:stun.l.google.com:19302"}},
			{URLs: []string{"stun:stun1.l.google.com:19302"}},
		}
	}
	return &Server{
		cfg:       cfg,
		store:     store,
		clients:   make(map[string]*Client),
		streaming: make(map[string]bool),
		logger:    logger,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
		authLimit: NewRateLimiter(15*time.Minute, 20),
	}
}

func (s *Server) logf(format string, args ...any) {
	msg := fmt.Sprintf("[%s] %s", time.Now().Format("03:04:05 PM"), fmt.Sprintf(format, args...))
	fmt.Println(msg)
	if s.cfg.Debug {
		s.logger.Println(msg)
	}
}

func (s *Server) OnlineCount() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.clients)
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", s.handleWebSocket)
	mux.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "tls": s.cfg.TLSCert != ""})
	})
	mux.HandleFunc("/api/config", s.handleConfig)
	mux.HandleFunc("/api/signup", s.handleSignup)
	mux.HandleFunc("/api/login", s.handleLogin)
	mux.HandleFunc("/api/logout", s.handleLogout)
	mux.HandleFunc("/api/users", s.handleUsers)
	mux.HandleFunc("/api/messages", s.handleMessages)

	if s.cfg.WebDir != "" {
		webDir := s.cfg.WebDir
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
	ln, err := net.Listen("tcp", s.cfg.Addr)
	if err != nil {
		return err
	}
	scheme := "http"
	wsScheme := "ws"
	if s.cfg.TLSCert != "" && s.cfg.TLSKey != "" {
		scheme = "https"
		wsScheme = "wss"
	}
	s.logf("Server start on %s://%s (%s://%s/ws)", scheme, ln.Addr().String(), wsScheme, ln.Addr().String())
	if s.cfg.TLSCert != "" && s.cfg.TLSKey != "" {
		return http.ServeTLS(ln, s.Handler(), s.cfg.TLSCert, s.cfg.TLSKey)
	}
	return http.Serve(ln, s.Handler())
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func readJSON(r *http.Request, v any) error {
	defer r.Body.Close()
	dec := json.NewDecoder(io.LimitReader(r.Body, 1<<20))
	return dec.Decode(v)
}

func (s *Server) handleConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "GET required"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"iceServers": s.cfg.ICEServers,
		"tls":        s.cfg.TLSCert != "",
	})
}

func (s *Server) handleSignup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "POST required"})
		return
	}
	if !s.authLimit.Allow(clientIP(r.RemoteAddr)) {
		writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "too many attempts, try later"})
		return
	}
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := readJSON(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
		return
	}
	if err := s.store.SignUp(body.Username, body.Password); err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, auth.ErrUserExists) {
			status = http.StatusConflict
		}
		writeJSON(w, status, map[string]string{"error": err.Error()})
		return
	}
	token, err := s.store.Login(body.Username, body.Password)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "account created but login failed"})
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{
		"token":    token,
		"username": strings.TrimSpace(body.Username),
	})
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "POST required"})
		return
	}
	if !s.authLimit.Allow(clientIP(r.RemoteAddr)) {
		writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "too many attempts, try later"})
		return
	}
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := readJSON(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
		return
	}
	token, err := s.store.Login(body.Username, body.Password)
	if err != nil {
		status := http.StatusUnauthorized
		if errors.Is(err, auth.ErrBadUsername) || errors.Is(err, auth.ErrBadPassword) {
			status = http.StatusBadRequest
		}
		writeJSON(w, status, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{
		"token":    token,
		"username": strings.TrimSpace(body.Username),
	})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "POST required"})
		return
	}
	h := r.Header.Get("Authorization")
	if !strings.HasPrefix(h, "Bearer ") {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	token := strings.TrimPrefix(h, "Bearer ")
	_ = s.store.DeleteSession(token)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) bearerUser(r *http.Request) (string, error) {
	h := r.Header.Get("Authorization")
	if !strings.HasPrefix(h, "Bearer ") {
		return "", auth.ErrBadToken
	}
	return s.store.UsernameForToken(strings.TrimPrefix(h, "Bearer "))
}

func (s *Server) handleUsers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "GET required"})
		return
	}
	if _, err := s.bearerUser(r); err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"users": s.directory()})
}

func (s *Server) handleMessages(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "GET required"})
		return
	}
	user, err := s.bearerUser(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	peer := strings.TrimSpace(r.URL.Query().Get("peer"))
	if peer == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "peer query required"})
		return
	}
	msgs, err := s.store.ListMessages(user, peer, 200)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "could not load messages"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"messages": msgs})
}

func (s *Server) directory() []protocol.UserInfo {
	users, err := s.store.ListUsers()
	if err != nil {
		return nil
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]protocol.UserInfo, 0, len(users))
	for _, u := range users {
		pub := u.PublicKey
		online := false
		if c, ok := s.clients[u.Username]; ok {
			online = true
			pub = c.publicKey
		}
		out = append(out, protocol.UserInfo{
			Username:  u.Username,
			PublicKey: pub,
			Online:    online,
		})
	}
	return out
}

func (s *Server) broadcastUsers() {
	pkt := protocol.Packet{Type: protocol.TypeUsers, Users: s.directory()}
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, c := range s.clients {
		_ = c.transport.WriteJSON(pkt)
	}
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

func (s *Server) serveClient(t protocol.Transport) {
	var hs protocol.Handshake
	if err := t.ReadJSON(&hs); err != nil {
		_ = t.Close()
		return
	}
	username, err := s.store.UsernameForToken(hs.Token)
	if err != nil || hs.PublicKey == "" {
		_ = t.WriteJSON(protocol.Packet{Type: protocol.TypeError, Error: "unauthorized"})
		_ = t.Close()
		return
	}
	_ = s.store.SetPublicKey(username, hs.PublicKey)

	client := &Client{transport: t, username: username, publicKey: hs.PublicKey}

	s.mu.Lock()
	if old, ok := s.clients[username]; ok {
		_ = old.transport.Close()
		delete(s.streaming, username)
	}
	s.clients[username] = client
	s.mu.Unlock()

	s.logf("Connected %s as %q", t.RemoteAddr(), username)
	s.broadcastUsers()

	defer func() {
		s.mu.Lock()
		if cur, ok := s.clients[username]; ok && cur == client {
			delete(s.clients, username)
			delete(s.streaming, username)
		}
		s.mu.Unlock()
		_ = t.Close()
		s.logf("Disconnected %s (%s)", t.RemoteAddr(), username)
		s.broadcastUsers()
	}()

	for {
		var pkt protocol.Packet
		if err := t.ReadJSON(&pkt); err != nil {
			return
		}
		s.handlePacket(client, pkt)
	}
}

func (s *Server) handlePacket(sender *Client, pkt protocol.Packet) {
	switch pkt.Type {
	case protocol.TypeSetting:
		s.mu.Lock()
		if pkt.Voice == "on" {
			s.streaming[sender.username] = true
		} else {
			delete(s.streaming, sender.username)
		}
		s.mu.Unlock()

	case protocol.TypeMessage:
		if pkt.To == "" || pkt.Message == "" {
			return
		}
		// Persist recipient copy (and optional sender self-copy for history).
		_, _ = s.store.SaveMessageCopy(pkt.To, sender.username, sender.username, pkt.Message, sender.publicKey)
		if pkt.SelfCopy != "" {
			_, _ = s.store.SaveMessageCopy(sender.username, pkt.To, sender.username, pkt.SelfCopy, sender.publicKey)
		}
		s.mu.RLock()
		target, ok := s.clients[pkt.To]
		s.mu.RUnlock()
		if !ok {
			// Stored for later; notify sender that peer is offline.
			_ = sender.transport.WriteJSON(protocol.Packet{
				Type:  protocol.TypeError,
				Error: pkt.To + " is offline — message saved for when they return",
			})
			return
		}
		out := protocol.Packet{
			Type:      protocol.TypeMessage,
			From:      sender.username,
			To:        pkt.To,
			PublicKey: sender.publicKey,
			Message:   pkt.Message,
		}
		_ = target.transport.WriteJSON(out)

	case protocol.TypeVoice:
		if pkt.To == "" || pkt.Message == "" {
			return
		}
		s.mu.RLock()
		target, ok := s.clients[pkt.To]
		streaming := s.streaming[pkt.To]
		s.mu.RUnlock()
		if !ok || !streaming {
			return
		}
		out := protocol.Packet{
			Type:      protocol.TypeVoice,
			From:      sender.username,
			To:        pkt.To,
			PublicKey: sender.publicKey,
			Message:   pkt.Message,
		}
		_ = target.transport.WriteJSON(out)

	case protocol.TypeCallOffer, protocol.TypeCallAnswer, protocol.TypeCallIce, protocol.TypeCallHangup:
		if pkt.To == "" {
			return
		}
		s.mu.RLock()
		target, ok := s.clients[pkt.To]
		s.mu.RUnlock()
		if !ok {
			_ = sender.transport.WriteJSON(protocol.Packet{
				Type:  protocol.TypeError,
				Error: pkt.To + " is offline",
			})
			return
		}
		out := protocol.Packet{
			Type:   pkt.Type,
			From:   sender.username,
			To:     pkt.To,
			Signal: pkt.Signal,
		}
		_ = target.transport.WriteJSON(out)

	default:
		s.logf("unknown packet type %q from %s", pkt.Type, sender.username)
	}
}
