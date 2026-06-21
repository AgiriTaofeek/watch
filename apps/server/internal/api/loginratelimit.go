package api

import (
	"sync"
	"time"
)

const (
	// maxFailedLogins is how many failed attempts an account tolerates within
	// loginLockoutWindow before further attempts are rejected with 429.
	maxFailedLogins = 5
	// loginLockoutWindow is both the counting window and the lockout duration.
	loginLockoutWindow = 15 * time.Minute
	// loginLimiterMaxEntries bounds memory: above this, expired entries are
	// pruned so an attacker spraying many distinct emails can't grow the map
	// without limit.
	loginLimiterMaxEntries = 10_000
)

// loginRateLimiter throttles password guessing per account.
//
// It is keyed by email, not client IP, on purpose: the dashboard BFF forwards
// every login from a single upstream (the Start server), so Go cannot see the
// real client IP — per-IP limiting here would lump all users together. Per-account
// limiting directly protects the account being attacked. Per-IP throttling, if
// wanted, belongs at the reverse proxy / BFF layer.
//
// Tradeoff: per-account lockout enables a nuisance "lockout DoS" where someone
// spams a victim's email to lock them out. The window is deliberately short
// (15 min) to bound that impact. The limiter is in-memory and bounded — suitable
// for the single-binary v1 deployment; a multi-instance deployment would need a
// shared store.
type loginRateLimiter struct {
	mu       sync.Mutex
	attempts map[string]*loginAttempt
	max      int
	window   time.Duration
	now      func() time.Time // injectable for tests
}

type loginAttempt struct {
	count       int
	windowStart time.Time
}

func newLoginRateLimiter(max int, window time.Duration) *loginRateLimiter {
	return &loginRateLimiter{
		attempts: make(map[string]*loginAttempt),
		max:      max,
		window:   window,
		now:      time.Now,
	}
}

// allowed reports whether another login attempt for key is permitted. An entry
// whose window has expired is treated as cleared.
func (l *loginRateLimiter) allowed(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	a, ok := l.attempts[key]
	if !ok {
		return true
	}
	if l.now().Sub(a.windowStart) >= l.window {
		delete(l.attempts, key)
		return true
	}
	return a.count < l.max
}

// recordFailure counts a failed attempt for key, starting a fresh window if the
// previous one expired.
func (l *loginRateLimiter) recordFailure(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	a, ok := l.attempts[key]
	if !ok || l.now().Sub(a.windowStart) >= l.window {
		if len(l.attempts) >= loginLimiterMaxEntries {
			l.pruneExpiredLocked()
		}
		l.attempts[key] = &loginAttempt{count: 1, windowStart: l.now()}
		return
	}
	a.count++
}

// reset clears the counter for key after a successful login.
func (l *loginRateLimiter) reset(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.attempts, key)
}

// pruneExpiredLocked drops entries whose window has elapsed. Caller holds l.mu.
func (l *loginRateLimiter) pruneExpiredLocked() {
	now := l.now()
	for k, a := range l.attempts {
		if now.Sub(a.windowStart) >= l.window {
			delete(l.attempts, k)
		}
	}
}
