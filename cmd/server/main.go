package main

import (
	"flag"
	"log"

	"securechat/internal/server"
)

func main() {
	addr := flag.String("addr", "0.0.0.0:9090", "listen address")
	debug := flag.Bool("debug", true, "enable file logging to all.log")
	flag.Parse()

	s := server.New(*addr, *debug)
	log.Fatal(s.ListenAndServe())
}
