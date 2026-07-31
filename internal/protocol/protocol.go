package protocol

import "encoding/json"

// Handshake is sent by the client immediately after connecting.
// PublicKey is a base64-encoded uncompressed P-256 ECDH public key.
type Handshake struct {
	Name      string `json:"name"`
	PublicKey string `json:"publicKey"`
}

// Peer is a connected user identity announced by the server.
type Peer struct {
	Name      string `json:"name"`
	PublicKey string `json:"publicKey"`
}

// Envelope is ciphertext intended for one recipient public key.
type Envelope struct {
	To      string `json:"to"`      // recipient public key (base64)
	Message string `json:"message"` // AES-GCM ciphertext (base64)
}

// Packet is the common envelope for all post-handshake messages.
type Packet struct {
	Type       string     `json:"type"` // message | voice | setting | peers
	Name       string     `json:"name,omitempty"`
	PublicKey  string     `json:"publicKey,omitempty"` // sender public key
	Message    string     `json:"message,omitempty"`   // single-recipient ciphertext after server routing
	Voice      string     `json:"voice,omitempty"`
	Envelopes  []Envelope `json:"envelopes,omitempty"`
	Peers      []Peer     `json:"peers,omitempty"`
}

const (
	TypeMessage = "message"
	TypeVoice   = "voice"
	TypeSetting = "setting"
	TypePeers   = "peers"
)

// Transport is a bidirectional JSON messaging connection.
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
