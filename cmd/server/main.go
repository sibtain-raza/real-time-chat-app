package main

import (
	"flag"
	"log"
	"os"
	"path/filepath"
	"strings"

	"securechat/internal/auth"
	"securechat/internal/server"
)

func main() {
	addr := flag.String("addr", "0.0.0.0:9090", "HTTP listen address")
	webDir := flag.String("web", "", "directory of built React UI (defaults to web/dist)")
	dbPath := flag.String("db", "chatapp.db", "SQLite database path")
	debug := flag.Bool("debug", true, "enable file logging to all.log")
	tlsCert := flag.String("tls-cert", "", "TLS certificate file (enables HTTPS/WSS)")
	tlsKey := flag.String("tls-key", "", "TLS private key file")
	stun := flag.String("stun", "stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302", "comma-separated STUN URLs")
	turnURL := flag.String("turn", "", "optional TURN URL (e.g. turn:turn.example.com:3478)")
	turnUser := flag.String("turn-user", "", "TURN username")
	turnPass := flag.String("turn-pass", "", "TURN credential")
	flag.Parse()

	store, err := auth.Open(*dbPath)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer store.Close()

	dir := *webDir
	if dir == "" {
		for _, c := range []string{"web/dist", "../web/dist"} {
			if st, err := os.Stat(c); err == nil && st.IsDir() {
				dir, _ = filepath.Abs(c)
				break
			}
		}
	}

	var ice []server.ICEServer
	for _, u := range strings.Split(*stun, ",") {
		u = strings.TrimSpace(u)
		if u != "" {
			ice = append(ice, server.ICEServer{URLs: []string{u}})
		}
	}
	if strings.TrimSpace(*turnURL) != "" {
		ice = append(ice, server.ICEServer{
			URLs:       []string{strings.TrimSpace(*turnURL)},
			Username:   *turnUser,
			Credential: *turnPass,
		})
	}

	cfg := server.Config{
		Addr:       *addr,
		WebDir:     dir,
		TLSCert:    *tlsCert,
		TLSKey:     *tlsKey,
		Debug:      *debug,
		ICEServers: ice,
	}
	s := server.New(cfg, store)
	log.Fatal(s.ListenAndServe())
}
