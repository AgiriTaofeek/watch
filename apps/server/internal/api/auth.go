package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/AgiriTaofeek/watch/apps/server/internal/auth"
	"github.com/AgiriTaofeek/watch/apps/server/internal/store"
)

const sessionDuration = 24 * time.Hour

// handleAuthSetup creates the first owner account. Returns 409 if any user
// already exists, so it is safe to call idempotently during initial setup.
func (a *API) handleAuthSetup(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20) // 1 MiB
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	if req.Email == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, "email and password are required")
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		a.serverError(w, r, err, "could not hash password")
		return
	}

	user, err := a.store.CreateFirstOwner(r.Context(), req.Email, hash)
	if errors.Is(err, store.ErrSetupComplete) {
		writeError(w, http.StatusConflict, "setup already completed")
		return
	}
	if err != nil {
		a.serverError(w, r, err, "could not create user")
		return
	}
	writeJSON(w, http.StatusCreated, user)
}

// handleLogin validates credentials, creates a session, and sets the session
// cookie. The CSRF token is returned in the response body for the dashboard JS.
func (a *API) handleLogin(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	// Use a deliberate vague message to avoid confirming whether an email exists.
	const invalidCredentials = "invalid email or password"

	email := strings.TrimSpace(strings.ToLower(req.Email))

	// Throttle password guessing per account. Keyed by email (not IP) because the
	// BFF forwards every login from one upstream — see loginRateLimiter. The check
	// runs before the password hash so locked accounts don't pay the Argon2id cost.
	if !a.loginLimiter.allowed(email) {
		w.Header().Set("Retry-After", strconv.Itoa(int(loginLockoutWindow.Seconds())))
		writeError(w, http.StatusTooManyRequests, "too many login attempts; try again later")
		return
	}

	user, err := a.store.GetUserByEmail(r.Context(), email)
	if errors.Is(err, store.ErrNotFound) {
		// Count failures for unknown emails too, so lockout behavior can't be used
		// to tell which emails exist.
		a.loginLimiter.recordFailure(email)
		writeError(w, http.StatusUnauthorized, invalidCredentials)
		return
	}
	if err != nil {
		a.serverError(w, r, err, "could not look up user")
		return
	}

	ok, err := auth.VerifyPassword(req.Password, user.PasswordHash)
	if err != nil {
		a.serverError(w, r, err, "could not verify password")
		return
	}
	if !ok {
		a.loginLimiter.recordFailure(email)
		writeError(w, http.StatusUnauthorized, invalidCredentials)
		return
	}

	// Successful login clears the account's failure counter.
	a.loginLimiter.reset(email)

	sessionID, err := auth.NewToken(32)
	if err != nil {
		a.serverError(w, r, err, "could not generate session id")
		return
	}
	csrfToken, err := auth.NewToken(32)
	if err != nil {
		a.serverError(w, r, err, "could not generate csrf token")
		return
	}

	expiresAt := time.Now().Add(sessionDuration)
	if _, err := a.store.CreateSession(r.Context(), sessionID, user.ID, csrfToken, expiresAt); err != nil {
		a.serverError(w, r, err, "could not create session")
		return
	}

	// Both cookies are HttpOnly. The dashboard's TanStack Start (BFF) server reads
	// watch_csrf server-side and echoes it in the X-CSRF-Token header when calling
	// this API, so the browser never needs to read it. The session row remains the
	// CSRF source of truth (see csrfProtected).
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    sessionID,
		Expires:  expiresAt,
		HttpOnly: true,
		Secure:   a.secureCookie(r),
		SameSite: http.SameSiteLaxMode,
		Path:     "/",
	})
	http.SetCookie(w, &http.Cookie{
		Name:     csrfCookieName,
		Value:    csrfToken,
		Expires:  expiresAt,
		HttpOnly: true,
		Secure:   a.secureCookie(r),
		SameSite: http.SameSiteLaxMode,
		Path:     "/",
	})

	writeJSON(w, http.StatusOK, map[string]any{"user": user})
}

// handleLogout deletes the session and clears the cookie.
func (a *API) handleLogout(w http.ResponseWriter, r *http.Request) {
	sess, _ := SessionFromContext(r.Context())
	if err := a.store.DeleteSession(r.Context(), sess.ID); err != nil {
		a.serverError(w, r, err, "could not delete session")
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Expires:  time.Unix(0, 0),
		HttpOnly: true,
		Secure:   a.secureCookie(r),
		SameSite: http.SameSiteLaxMode,
		Path:     "/",
		MaxAge:   -1,
	})
	http.SetCookie(w, &http.Cookie{
		Name:     csrfCookieName,
		Value:    "",
		Expires:  time.Unix(0, 0),
		HttpOnly: true,
		Secure:   a.secureCookie(r),
		SameSite: http.SameSiteLaxMode,
		Path:     "/",
		MaxAge:   -1,
	})
	w.WriteHeader(http.StatusNoContent)
}

// handleMe returns the authenticated user from the session context.
func (a *API) handleMe(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFromContext(r.Context())
	writeJSON(w, http.StatusOK, user)
}

func (a *API) secureCookie(r *http.Request) bool {
	switch a.cookieSecure {
	case CookieSecureTrue:
		return true
	case CookieSecureFalse:
		return false
	default:
		return r.TLS != nil
	}
}
