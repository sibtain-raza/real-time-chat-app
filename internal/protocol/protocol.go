package protocol

import "encoding/json"

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

// Transport is a bidirectional JSON messaging connection (TCP or WebSocket).
type Transport interface {
	ReadJSON(v any) error
	WriteJSON(v any) error
	Close() error
	RemoteAddr() string
}

func Marshal(v any) ([]byte, error) {
	return json.Marshal(v)
}

func Unmarshal(data []byte, v any) error {
	return json.Unmarshal(data, v)
}
