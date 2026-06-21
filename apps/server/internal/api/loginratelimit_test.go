package api

import (
	"testing"
	"time"
)

func TestLoginRateLimiter(t *testing.T) {
	clock := time.Unix(0, 0)
	l := newLoginRateLimiter(3, 15*time.Minute)
	l.now = func() time.Time { return clock }

	// Fresh key is allowed.
	if !l.allowed("a@example.com") {
		t.Fatal("fresh key should be allowed")
	}

	// Up to max failures still allows; the (max+1)th is blocked.
	for i := 0; i < 3; i++ {
		if !l.allowed("a@example.com") {
			t.Fatalf("attempt %d should be allowed", i+1)
		}
		l.recordFailure("a@example.com")
	}
	if l.allowed("a@example.com") {
		t.Fatal("should be locked out after max failures")
	}

	// A different account is unaffected.
	if !l.allowed("b@example.com") {
		t.Fatal("other account should be unaffected")
	}

	// After the window elapses, the lock clears.
	clock = clock.Add(15 * time.Minute)
	if !l.allowed("a@example.com") {
		t.Fatal("lock should clear after the window")
	}

	// A successful login resets the counter immediately.
	clock = time.Unix(0, 0)
	l.now = func() time.Time { return clock }
	for i := 0; i < 3; i++ {
		l.recordFailure("c@example.com")
	}
	if l.allowed("c@example.com") {
		t.Fatal("should be locked before reset")
	}
	l.reset("c@example.com")
	if !l.allowed("c@example.com") {
		t.Fatal("reset should clear the lock")
	}
}

func TestLoginRateLimiterPrunesExpired(t *testing.T) {
	clock := time.Unix(0, 0)
	l := newLoginRateLimiter(1, time.Minute)
	l.now = func() time.Time { return clock }

	l.recordFailure("old@example.com")
	clock = clock.Add(2 * time.Minute) // expire it
	// Force the prune path by exceeding the cap is impractical here; call directly.
	l.mu.Lock()
	l.pruneExpiredLocked()
	l.mu.Unlock()

	l.mu.Lock()
	_, present := l.attempts["old@example.com"]
	l.mu.Unlock()
	if present {
		t.Fatal("expired entry should have been pruned")
	}
}
