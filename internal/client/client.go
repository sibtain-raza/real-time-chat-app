package client

import (
	"fmt"
	"net"
	"sync"
	"sync/atomic"
	"time"

	"securechat/internal/audio"
	"securechat/internal/crypto"
	"securechat/internal/protocol"
)

// Handlers are callbacks invoked by the client networking layer.
type Handlers struct {
	OnText       func(from, text string)
	OnVoice      func(pcm []byte)
	OnDisconnect func(reason string)
	OnStatus     func(msg string)
}

// Client is the network + media side of the chat application.
type Client struct {
	mu       sync.Mutex
	conn     *protocol.Conn
	name     string
	key      string
	handlers Handlers

	connected atomic.Bool
	recording atomic.Bool
	playing   atomic.Bool

	player   *audio.Player
	stopRec  chan struct{}
	recDone  sync.WaitGroup
}

func New(h Handlers) *Client {
	return &Client{handlers: h}
}

func (c *Client) Connected() bool { return c.connected.Load() }
func (c *Client) Playing() bool   { return c.playing.Load() }
func (c *Client) Recording() bool { return c.recording.Load() }

func (c *Client) Connect(addr, name, key string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.connected.Load() {
		return fmt.Errorf("already connected")
	}
	raw, err := net.DialTimeout("tcp", addr, 5*time.Second)
	if err != nil {
		return err
	}
	conn := protocol.NewConn(raw)
	hs := protocol.Handshake{Name: name, Key: key}
	if err := conn.Encoder.Encode(hs); err != nil {
		_ = conn.Close()
		return err
	}
	c.conn = conn
	c.name = name
	c.key = key
	c.connected.Store(true)
	go c.readLoop()
	if c.handlers.OnStatus != nil {
		c.handlers.OnStatus(fmt.Sprintf("Connected to %s", addr))
	}
	return nil
}

func (c *Client) Disconnect() {
	c.StopMic()
	c.StopSpeaker()

	c.mu.Lock()
	defer c.mu.Unlock()
	if !c.connected.Load() {
		return
	}
	c.connected.Store(false)
	if c.conn != nil {
		_ = c.conn.Close()
		c.conn = nil
	}
	if c.handlers.OnStatus != nil {
		c.handlers.OnStatus("Disconnected")
	}
}

func (c *Client) SendText(text string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if !c.connected.Load() || c.conn == nil {
		return fmt.Errorf("not connected")
	}
	enc, err := crypto.Encrypt([]byte(text), c.key)
	if err != nil {
		return err
	}
	return c.conn.Encoder.Encode(protocol.Packet{
		Type:    protocol.TypeMessage,
		Message: enc,
	})
}

func (c *Client) StartSpeaker() error {
	if !c.connected.Load() {
		return fmt.Errorf("not connected")
	}
	if c.playing.Load() {
		return nil
	}
	player, err := audio.NewPlayer()
	if err != nil {
		return err
	}
	c.mu.Lock()
	c.player = player
	c.mu.Unlock()
	c.playing.Store(true)
	return c.sendSetting("on")
}

func (c *Client) StopSpeaker() {
	if !c.playing.Load() {
		return
	}
	c.playing.Store(false)
	_ = c.sendSetting("off")
	c.mu.Lock()
	if c.player != nil {
		c.player.Close()
		c.player = nil
	}
	c.mu.Unlock()
}

func (c *Client) StartMic() error {
	if !c.connected.Load() {
		return fmt.Errorf("not connected")
	}
	if c.recording.Load() {
		return nil
	}
	rec, err := audio.NewRecorder()
	if err != nil {
		return err
	}
	c.stopRec = make(chan struct{})
	c.recording.Store(true)
	c.recDone.Add(1)
	go func() {
		defer c.recDone.Done()
		defer rec.Close()
		for {
			select {
			case <-c.stopRec:
				return
			default:
			}
			pcm, err := rec.ReadPCM()
			if err != nil {
				return
			}
			if err := c.sendVoice(pcm); err != nil {
				c.Disconnect()
				return
			}
		}
	}()
	return nil
}

func (c *Client) StopMic() {
	if !c.recording.Load() {
		return
	}
	c.recording.Store(false)
	if c.stopRec != nil {
		close(c.stopRec)
		c.recDone.Wait()
		c.stopRec = nil
	}
}

func (c *Client) sendSetting(voice string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if !c.connected.Load() || c.conn == nil {
		return fmt.Errorf("not connected")
	}
	return c.conn.Encoder.Encode(protocol.Packet{
		Type:  protocol.TypeSetting,
		Voice: voice,
	})
}

func (c *Client) sendVoice(pcm []byte) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if !c.connected.Load() || c.conn == nil {
		return fmt.Errorf("not connected")
	}
	enc, err := crypto.Encrypt(pcm, c.key)
	if err != nil {
		return err
	}
	return c.conn.Encoder.Encode(protocol.Packet{
		Type:    protocol.TypeVoice,
		Message: enc,
	})
}

func (c *Client) readLoop() {
	for {
		c.mu.Lock()
		conn := c.conn
		key := c.key
		c.mu.Unlock()
		if conn == nil || !c.connected.Load() {
			return
		}
		var pkt protocol.Packet
		if err := conn.Decoder.Decode(&pkt); err != nil {
			c.connected.Store(false)
			c.StopMic()
			c.StopSpeaker()
			c.mu.Lock()
			if c.conn != nil {
				_ = c.conn.Close()
				c.conn = nil
			}
			c.mu.Unlock()
			if c.handlers.OnDisconnect != nil {
				c.handlers.OnDisconnect(err.Error())
			}
			return
		}
		switch pkt.Type {
		case protocol.TypeMessage:
			plain, err := crypto.Decrypt(pkt.Message, key)
			if err != nil {
				continue
			}
			if c.handlers.OnText != nil {
				c.handlers.OnText(pkt.Name, string(plain))
			}
		case protocol.TypeVoice:
			if !c.playing.Load() {
				continue
			}
			plain, err := crypto.Decrypt(pkt.Message, key)
			if err != nil {
				continue
			}
			c.mu.Lock()
			player := c.player
			c.mu.Unlock()
			if player != nil {
				_ = player.WritePCM(plain)
			}
			if c.handlers.OnVoice != nil {
				c.handlers.OnVoice(plain)
			}
		}
	}
}
