package api

import (
	"encoding/json"
	"errors"
	"net/http"
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

	count, err := a.store.CountUsers(r.Context())
	if err != nil {
		a.serverError(w, r, err, "could not check user count")
		return
	}
	if count > 0 {
		writeError(w, http.StatusConflict, "setup already completed")
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		a.serverError(w, r, err, "could not hash password")
		return
	}

	orgID, err := a.store.DefaultOrganizationID(r.Context())
	if err != nil {
		a.serverError(w, r, err, "could not get organization")
		return
	}

	user, err := a.store.CreateUser(r.Context(), orgID, req.Email, hash, "owner")
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

	user, err := a.store.GetUserByEmail(r.Context(), strings.TrimSpace(strings.ToLower(req.Email)))
	if errors.Is(err, store.ErrNotFound) {
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
		writeError(w, http.StatusUnauthorized, invalidCredentials)
		return
	}

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

	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    sessionID,
		Expires:  expiresAt,
		HttpOnly: true,
		Secure:   r.TLS != nil, // Secure only over HTTPS; plain HTTP works for local dev
		SameSite: http.SameSiteLaxMode,
		Path:     "/",
	})

	writeJSON(w, http.StatusOK, map[string]any{
		"user":       user,
		"csrf_token": csrfToken,
	})
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
		Secure:   r.TLS != nil,
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
