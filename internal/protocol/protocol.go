package protocol

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"sync"
)

// Handshake is sent by the client immediately after connecting.
type Handshake struct {
	Name string `json:"name"`
	Key  string `json:"key"`
}

// Packet is the common envelope for all post-handshake messages.
type Packet struct {
	Type    string `json:"type"`              // "message", "voice", or "setting"
	Name    string `json:"name,omitempty"`    // set by server when relaying
	Message string `json:"message,omitempty"` // encrypted payload (text or voice)
	Voice   string `json:"voice,omitempty"`   // "on" or "off" for setting packets
}

const (
	TypeMessage = "message"
	TypeVoice   = "voice"
	TypeSetting = "setting"
)

// Encoder writes newline-delimited JSON frames.
type Encoder struct {
	mu sync.Mutex
	w  *bufio.Writer
}

func NewEncoder(w io.Writer) *Encoder {
	return &Encoder{w: bufio.NewWriter(w)}
}

func (e *Encoder) Encode(v any) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	data, err := json.Marshal(v)
	if err != nil {
		return err
	}
	if _, err := e.w.Write(data); err != nil {
		return err
	}
	if err := e.w.WriteByte('\n'); err != nil {
		return err
	}
	return e.w.Flush()
}

// Decoder reads newline-delimited JSON frames.
type Decoder struct {
	r *bufio.Reader
}

func NewDecoder(r io.Reader) *Decoder {
	return &Decoder{r: bufio.NewReader(r)}
}

func (d *Decoder) Decode(v any) error {
	line, err := d.r.ReadBytes('\n')
	if err != nil {
		return err
	}
	if len(line) == 0 {
		return fmt.Errorf("empty frame")
	}
	return json.Unmarshal(line, v)
}

// Conn wraps a TCP connection with NDJSON encode/decode helpers.
type Conn struct {
	Net     net.Conn
	Encoder *Encoder
	Decoder *Decoder
}

func NewConn(c net.Conn) *Conn {
	return &Conn{
		Net:     c,
		Encoder: NewEncoder(c),
		Decoder: NewDecoder(c),
	}
}

func (c *Conn) Close() error {
	return c.Net.Close()
}

func (c *Conn) RemoteAddr() net.Addr {
	return c.Net.RemoteAddr()
}
