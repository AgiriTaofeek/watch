package api

import (
	"context"
	"errors"
	"net/http"

	"github.com/AgiriTaofeek/watch/apps/server/internal/store"
)

const (
	sessionCookieName = "watch_session"
	// csrfCookieName holds the session's CSRF token. It is HttpOnly: the dashboard
	// BFF server reads it server-side and echoes it back in csrfHeaderName when
	// proxying browser requests here. The session row stays the source of truth.
	csrfCookieName = "watch_csrf"
	csrfHeaderName = "X-CSRF-Token"
)

// SessionFromContext retrieves the session stored by sessionRequired.
func SessionFromContext(ctx context.Context) (store.Session, bool) {
	s, ok := ctx.Value(sessionKey).(store.Session)
	return s, ok
}

// UserFromContext retrieves the authenticated user stored by sessionRequired.
func UserFromContext(ctx context.Context) (store.User, bool) {
	u, ok := ctx.Value(userKey).(store.User)
	return u, ok
}

// sessionRequired is middleware that validates the watch_session cookie and
// puts the resolved Session and User into the request context. Returns 401
// when the cookie is missing, the session is expired, or the user is gone.
func (a *API) sessionRequired(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie(sessionCookieName)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "authentication required")
			return
		}
		sess, err := a.store.LookupSession(r.Context(), cookie.Value)
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusUnauthorized, "authentication required")
			return
		}
		if err != nil {
			a.serverError(w, r, err, "session lookup failed")
			return
		}
		user, err := a.store.GetUserByID(r.Context(), sess.UserID)
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusUnauthorized, "authentication required")
			return
		}
		if err != nil {
			a.serverError(w, r, err, "user lookup failed")
			return
		}
		ctx := context.WithValue(r.Context(), sessionKey, sess)
		ctx = context.WithValue(ctx, userKey, user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// csrfProtected is middleware that enforces the X-CSRF-Token header on all
// non-safe HTTP methods. Must be chained after sessionRequired so the session
// (and its csrf_token) is already in context. The header is compared against
// the token stored in the session row — the watch_csrf cookie is only the
// transport the client uses to recover the value across page refreshes.
func (a *API) csrfProtected(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
			// Safe methods never mutate state — no CSRF check needed.
			next.ServeHTTP(w, r)
			return
		}
		sess, ok := SessionFromContext(r.Context())
		if !ok {
			writeError(w, http.StatusForbidden, "forbidden")
			return
		}
		if r.Header.Get(csrfHeaderName) != sess.CSRFToken {
			writeError(w, http.StatusForbidden, "invalid CSRF token")
			return
		}
		next.ServeHTTP(w, r)
	})
}
