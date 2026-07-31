package main

import (
	"flag"
	"log"
	"os"
	"path/filepath"

	"securechat/internal/auth"
	"securechat/internal/server"
)

func main() {
	addr := flag.String("addr", "0.0.0.0:9090", "HTTP listen address")
	webDir := flag.String("web", "", "directory of built React UI (defaults to web/dist)")
	dbPath := flag.String("db", "chatapp.db", "SQLite database path")
	debug := flag.Bool("debug", true, "enable file logging to all.log")
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

	s := server.New(*addr, dir, store, *debug)
	log.Fatal(s.ListenAndServe())
}
