package main

import (
	"flag"
	"log"
	"os"
	"path/filepath"

	"securechat/internal/server"
)

func main() {
	addr := flag.String("addr", "0.0.0.0:9090", "HTTP listen address")
	webDir := flag.String("web", "", "directory of built React UI (defaults to web/dist)")
	debug := flag.Bool("debug", true, "enable file logging to all.log")
	flag.Parse()

	dir := *webDir
	if dir == "" {
		candidates := []string{"web/dist", "../web/dist"}
		for _, c := range candidates {
			if st, err := os.Stat(c); err == nil && st.IsDir() {
				dir, _ = filepath.Abs(c)
				break
			}
		}
	}

	s := server.New(*addr, dir, *debug)
	log.Fatal(s.ListenAndServe())
}
