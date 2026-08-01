package protocol

import "encoding/json"

// Handshake authenticates a WebSocket and registers the session public key.
type Handshake struct {
	Token     string `json:"token"`
	PublicKey string `json:"publicKey"`
}

// UserInfo is a directory entry for 1:1 chat.
type UserInfo struct {
	Username  string `json:"username"`
	PublicKey string `json:"publicKey"`
	Online    bool   `json:"online"`
}

// Packet is the common envelope for post-handshake messages.
type Packet struct {
	Type      string          `json:"type"`
	From      string          `json:"from,omitempty"`
	To        string          `json:"to,omitempty"`
	PublicKey string          `json:"publicKey,omitempty"`
	Message   string          `json:"message,omitempty"`
	Voice     string          `json:"voice,omitempty"`
	Users     []UserInfo      `json:"users,omitempty"`
	Error     string          `json:"error,omitempty"`
	Signal    json.RawMessage `json:"signal,omitempty"` // WebRTC SDP / ICE payload
}

const (
	TypeMessage    = "message"
	TypeVoice      = "voice"
	TypeSetting    = "setting"
	TypeUsers      = "users"
	TypeError      = "error"
	TypeCallOffer  = "call-offer"
	TypeCallAnswer = "call-answer"
	TypeCallIce    = "call-ice"
	TypeCallHangup = "call-hangup"
)

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

func IsCallType(t string) bool {
	switch t {
	case TypeCallOffer, TypeCallAnswer, TypeCallIce, TypeCallHangup:
		return true
	default:
		return false
	}
}
