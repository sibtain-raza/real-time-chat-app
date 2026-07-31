package audio

import (
	"fmt"
	"sync"

	"github.com/gordonklaus/portaudio"
)

const (
	SampleRate = 20000
	Channels   = 1
	ChunkSize  = 1024
)

var (
	initOnce sync.Once
	initErr  error
)

func EnsureInit() error {
	initOnce.Do(func() {
		initErr = portaudio.Initialize()
	})
	return initErr
}

func Terminate() {
	_ = portaudio.Terminate()
}

// Recorder captures PCM audio from the default input device.
type Recorder struct {
	stream *portaudio.Stream
	buf    []int16
}

func NewRecorder() (*Recorder, error) {
	if err := EnsureInit(); err != nil {
		return nil, err
	}
	r := &Recorder{buf: make([]int16, ChunkSize)}
	stream, err := portaudio.OpenDefaultStream(Channels, 0, SampleRate, len(r.buf), r.buf)
	if err != nil {
		return nil, fmt.Errorf("open input stream: %w", err)
	}
	r.stream = stream
	if err := stream.Start(); err != nil {
		_ = stream.Close()
		return nil, err
	}
	return r, nil
}

// ReadPCM reads one chunk of int16 little-endian PCM bytes.
func (r *Recorder) ReadPCM() ([]byte, error) {
	if err := r.stream.Read(); err != nil {
		return nil, err
	}
	out := make([]byte, len(r.buf)*2)
	for i, sample := range r.buf {
		out[i*2] = byte(sample)
		out[i*2+1] = byte(sample >> 8)
	}
	return out, nil
}

func (r *Recorder) Close() {
	if r.stream != nil {
		_ = r.stream.Stop()
		_ = r.stream.Close()
		r.stream = nil
	}
}

// Player plays PCM audio to the default output device.
type Player struct {
	stream *portaudio.Stream
	buf    []int16
}

func NewPlayer() (*Player, error) {
	if err := EnsureInit(); err != nil {
		return nil, err
	}
	p := &Player{buf: make([]int16, ChunkSize)}
	stream, err := portaudio.OpenDefaultStream(0, Channels, SampleRate, len(p.buf), p.buf)
	if err != nil {
		return nil, fmt.Errorf("open output stream: %w", err)
	}
	p.stream = stream
	if err := stream.Start(); err != nil {
		_ = stream.Close()
		return nil, err
	}
	return p, nil
}

// WritePCM writes int16 little-endian PCM bytes to the output device.
func (p *Player) WritePCM(data []byte) error {
	n := len(data) / 2
	if n > len(p.buf) {
		n = len(p.buf)
	}
	for i := 0; i < n; i++ {
		p.buf[i] = int16(data[i*2]) | int16(data[i*2+1])<<8
	}
	for i := n; i < len(p.buf); i++ {
		p.buf[i] = 0
	}
	return p.stream.Write()
}

func (p *Player) Close() {
	if p.stream != nil {
		_ = p.stream.Stop()
		_ = p.stream.Close()
		p.stream = nil
	}
}
