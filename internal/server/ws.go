package server

import (
	"sync"

	"github.com/gorilla/websocket"
)

type wsTransport struct {
	conn   *websocket.Conn
	remote string
	writeMu sync.Mutex
}

func (t *wsTransport) ReadJSON(v any) error {
	return t.conn.ReadJSON(v)
}

func (t *wsTransport) WriteJSON(v any) error {
	t.writeMu.Lock()
	defer t.writeMu.Unlock()
	return t.conn.WriteJSON(v)
}

func (t *wsTransport) Close() error {
	return t.conn.Close()
}

func (t *wsTransport) RemoteAddr() string {
	return t.remote
}
