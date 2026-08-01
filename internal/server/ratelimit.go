package server

import (
	"net"
	"sync"
	"time"
)

// RateLimiter is a simple fixed-window limiter keyed by string (usually IP).
type RateLimiter struct {
	mu       sync.Mutex
	window   time.Duration
	maxHits  int
	attempts map[string][]time.Time
}

func NewRateLimiter(window time.Duration, maxHits int) *RateLimiter {
	return &RateLimiter{
		window:   window,
		maxHits:  maxHits,
		attempts: make(map[string][]time.Time),
	}
}

func (r *RateLimiter) Allow(key string) bool {
	now := time.Now()
	r.mu.Lock()
	defer r.mu.Unlock()
	cutoff := now.Add(-r.window)
	arr := r.attempts[key]
	kept := arr[:0]
	for _, t := range arr {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	if len(kept) >= r.maxHits {
		r.attempts[key] = kept
		return false
	}
	r.attempts[key] = append(kept, now)
	return true
}

func clientIP(remote string) string {
	host, _, err := net.SplitHostPort(remote)
	if err != nil {
		return remote
	}
	return host
}
