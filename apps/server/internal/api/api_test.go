package api

import (
	"bytes"
	"context"
	"crypto/tls"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/AgiriTaofeek/watch/apps/server/internal/auth"
	"github.com/AgiriTaofeek/watch/apps/server/internal/store"
)

type dropCall struct {
	environmentID *string
	reason        string
}

type fakeStore struct {
	key       store.KeyLookup
	keyErr    error
	inserted  []store.RawEvent
	dropped   []dropCall
	setupUser store.User
	setupErr  error
	user      store.User
	session   store.Session
	projects  []store.ProjectDetail
}

func (f *fakeStore) Ping(context.Context) error { return nil }

func (f *fakeStore) LookupIngestionKey(context.Context, string) (store.KeyLookup, error) {
	if f.keyErr != nil {
		return store.KeyLookup{}, f.keyErr
	}
	return f.key, nil
}

func (f *fakeStore) InsertRawEvent(_ context.Context, e store.RawEvent) error {
	f.inserted = append(f.inserted, e)
	return nil
}

func (f *fakeStore) IncrementDroppedCounter(_ context.Context, environmentID *string, reason string, _ time.Time) error {
	f.dropped = append(f.dropped, dropCall{environmentID: environmentID, reason: reason})
	return nil
}

func (f *fakeStore) CreateFirstOwner(context.Context, string, string) (store.User, error) {
	if f.setupErr != nil {
		return store.User{}, f.setupErr
	}
	return f.setupUser, nil
}

func (f *fakeStore) GetUserByEmail(context.Context, string) (store.User, error) {
	if f.user.ID == "" {
		return store.User{}, store.ErrNotFound
	}
	return f.user, nil
}

func (f *fakeStore) GetUserByID(context.Context, string) (store.User, error) {
	if f.user.ID == "" {
		return store.User{}, store.ErrNotFound
	}
	return f.user, nil
}

func (f *fakeStore) CreateSession(_ context.Context, id, userID, csrfToken string, expiresAt time.Time) (store.Session, error) {
	f.session = store.Session{ID: id, UserID: userID, CSRFToken: csrfToken, ExpiresAt: expiresAt}
	return f.session, nil
}

func (f *fakeStore) LookupSession(context.Context, string) (store.Session, error) {
	if f.session.ID == "" {
		return store.Session{}, store.ErrNotFound
	}
	return f.session, nil
}

func (f *fakeStore) DeleteSession(context.Context, string) error { return nil }

func (f *fakeStore) CreateProject(_ context.Context, name string, allowedOrigins []string) (store.ProjectDetail, error) {
	p := store.ProjectDetail{
		Project: store.Project{
			ID:             "project-1",
			Name:           name,
			AllowedOrigins: allowedOrigins,
		},
		Environments: []store.EnvironmentDetail{},
	}
	f.projects = append(f.projects, p)
	return p, nil
}

func (f *fakeStore) ListProjects(context.Context) ([]store.ProjectDetail, error) {
	return f.projects, nil
}

func (f *fakeStore) CreateEnvironment(context.Context, string, string) (store.Environment, error) {
	return store.Environment{}, nil
}

func (f *fakeStore) CreateIngestionKey(context.Context, string) (store.IngestionKey, error) {
	return store.IngestionKey{}, nil
}

func (f *fakeStore) RevokeKey(context.Context, string) error { return nil }

// Issue stubs — not exercised by existing tests.
func (f *fakeStore) ListIssues(_ context.Context, _, _ string, _ *string, _, _ int) ([]store.Issue, int64, error) {
	return nil, 0, nil
}
func (f *fakeStore) GetIssue(context.Context, string) (store.Issue, error) {
	return store.Issue{}, store.ErrNotFound
}
func (f *fakeStore) UpdateIssueStatus(context.Context, string, string) error { return nil }

// Rollup stubs — not exercised by existing tests.
func (f *fakeStore) QueryErrorRollups(_ context.Context, _, _ string, _, _ time.Time) ([]store.ErrorRollup, error) {
	return nil, nil
}
func (f *fakeStore) QueryVitalRollups(_ context.Context, _, _, _ string, _, _ time.Time) ([]store.VitalRollup, error) {
	return nil, nil
}

func TestAuthSetupMapsSetupCompleteToConflict(t *testing.T) {
	fake := &fakeStore{setupErr: store.ErrSetupComplete}
	req := httptest.NewRequest(http.MethodPost, "/auth/setup", strings.NewReader(`{"email":"a@example.com","password":"password"}`))
	rec := httptest.NewRecorder()

	New(fake).Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusConflict)
	}
}

func TestAuthSetupCreatesFirstOwner(t *testing.T) {
	fake := &fakeStore{setupUser: store.User{ID: "user-1", Email: "a@example.com", Role: "owner"}}
	req := httptest.NewRequest(http.MethodPost, "/auth/setup", strings.NewReader(`{"email":"a@example.com","password":"password"}`))
	rec := httptest.NewRecorder()

	New(fake).Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusCreated)
	}
}

func TestLoginCookieSecureModes(t *testing.T) {
	hash, err := auth.HashPassword("password")
	if err != nil {
		t.Fatal(err)
	}

	cases := []struct {
		name       string
		mode       CookieSecureMode
		withTLS    bool
		wantSecure bool
	}{
		{name: "auto without tls", mode: CookieSecureAuto, wantSecure: false},
		{name: "auto with tls", mode: CookieSecureAuto, withTLS: true, wantSecure: true},
		{name: "true", mode: CookieSecureTrue, wantSecure: true},
		{name: "false", mode: CookieSecureFalse, withTLS: true, wantSecure: false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fake := &fakeStore{user: store.User{ID: "user-1", Email: "a@example.com", PasswordHash: hash}}
			req := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(`{"email":"a@example.com","password":"password"}`))
			if tc.withTLS {
				req.TLS = &tls.ConnectionState{}
			}
			rec := httptest.NewRecorder()

			New(fake, Options{CookieSecure: tc.mode}).Handler().ServeHTTP(rec, req)

			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
			}
			cookies := rec.Result().Cookies()
			if len(cookies) == 0 {
				t.Fatal("expected session cookie")
			}
			if cookies[0].Secure != tc.wantSecure {
				t.Fatalf("cookie Secure = %v, want %v", cookies[0].Secure, tc.wantSecure)
			}
		})
	}
}

func TestLoginSetsReadableCSRFCookie(t *testing.T) {
	hash, err := auth.HashPassword("password")
	if err != nil {
		t.Fatal(err)
	}
	fake := &fakeStore{user: store.User{ID: "user-1", Email: "a@example.com", PasswordHash: hash}}
	req := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(`{"email":"a@example.com","password":"password"}`))
	rec := httptest.NewRecorder()

	New(fake).Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	cookies := map[string]*http.Cookie{}
	for _, c := range rec.Result().Cookies() {
		cookies[c.Name] = c
	}

	sess, ok := cookies[sessionCookieName]
	if !ok {
		t.Fatal("expected session cookie")
	}
	if !sess.HttpOnly {
		t.Error("session cookie must be HttpOnly")
	}

	csrf, ok := cookies[csrfCookieName]
	if !ok {
		t.Fatal("expected watch_csrf cookie")
	}
	if !csrf.HttpOnly {
		t.Error("watch_csrf cookie must be HttpOnly (read server-side by the BFF)")
	}
	// The cookie must carry the same token persisted in the session row so the
	// forwarded X-CSRF-Token header validates against it.
	if csrf.Value != fake.session.CSRFToken {
		t.Errorf("watch_csrf value = %q, want session token %q", csrf.Value, fake.session.CSRFToken)
	}

	// The token is delivered via cookie, not the response body.
	if strings.Contains(rec.Body.String(), "csrf_token") {
		t.Errorf("login body should not contain csrf_token: %s", rec.Body.String())
	}
}

func TestLogoutClearsBothCookies(t *testing.T) {
	fake := &fakeStore{
		user:    store.User{ID: "user-1", Email: "a@example.com"},
		session: store.Session{ID: "session-1", UserID: "user-1", CSRFToken: "csrf-1", ExpiresAt: time.Now().Add(time.Hour)},
	}
	req := httptest.NewRequest(http.MethodPost, "/auth/logout", nil)
	req.AddCookie(&http.Cookie{Name: sessionCookieName, Value: "session-1"})
	rec := httptest.NewRecorder()

	New(fake).Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusNoContent)
	}
	for _, name := range []string{sessionCookieName, csrfCookieName} {
		var cleared bool
		for _, c := range rec.Result().Cookies() {
			if c.Name == name && c.MaxAge < 0 {
				cleared = true
			}
		}
		if !cleared {
			t.Errorf("expected %s cookie to be cleared (MaxAge < 0)", name)
		}
	}
}

func TestLoginRateLimitReturns429(t *testing.T) {
	// Empty store → every login is a failed (unknown-email) attempt.
	handler := New(&fakeStore{}).Handler()
	body := `{"email":"victim@example.com","password":"guess"}`

	send := func() int {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(body))
		handler.ServeHTTP(rec, req)
		return rec.Code
	}

	for i := 0; i < maxFailedLogins; i++ {
		if code := send(); code != http.StatusUnauthorized {
			t.Fatalf("attempt %d: status = %d, want %d", i+1, code, http.StatusUnauthorized)
		}
	}

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(body))
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("after lockout: status = %d, want %d", rec.Code, http.StatusTooManyRequests)
	}
	if rec.Header().Get("Retry-After") == "" {
		t.Error("expected Retry-After header on a rate-limited login")
	}
}

func TestCSRFMiddleware(t *testing.T) {
	fake := &fakeStore{
		user:    store.User{ID: "user-1", Email: "a@example.com"},
		session: store.Session{ID: "session-1", UserID: "user-1", CSRFToken: "csrf-1", ExpiresAt: time.Now().Add(time.Hour)},
	}
	handler := New(fake).Handler()

	for _, tc := range []struct {
		name       string
		csrfHeader string
		wantStatus int
	}{
		{name: "missing", wantStatus: http.StatusForbidden},
		{name: "wrong", csrfHeader: "nope", wantStatus: http.StatusForbidden},
		{name: "correct", csrfHeader: "csrf-1", wantStatus: http.StatusCreated},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/api/projects", strings.NewReader(`{"name":"Portal"}`))
			req.AddCookie(&http.Cookie{Name: sessionCookieName, Value: "session-1"})
			if tc.csrfHeader != "" {
				req.Header.Set(csrfHeaderName, tc.csrfHeader)
			}
			rec := httptest.NewRecorder()

			handler.ServeHTTP(rec, req)

			if rec.Code != tc.wantStatus {
				t.Fatalf("status = %d, want %d", rec.Code, tc.wantStatus)
			}
		})
	}
}

func TestIngestSanitizesAcceptedPayload(t *testing.T) {
	envID := "env-1"
	fake := &fakeStore{key: store.KeyLookup{KeyID: "key-1", EnvironmentID: envID, ProjectID: "project-1"}}
	body := `{
		"environment":"production",
		"service":"frontend",
		"timestamp":"2026-06-17T12:00:00Z",
		"type":"frontend_error",
		"context":{"route":"/checkout","token":"secret-token"},
		"payload":{"message":"boom","nested":{"password":"secret"},"url":"https://api.example.com/x?token=secret&page=2"}
	}`
	req := httptest.NewRequest(http.MethodPost, "/ingest/pk_test", strings.NewReader(body))
	rec := httptest.NewRecorder()

	New(fake).Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d: %s", rec.Code, http.StatusNoContent, rec.Body.String())
	}
	if len(fake.inserted) != 1 {
		t.Fatalf("inserted events = %d, want 1", len(fake.inserted))
	}
	payload := string(fake.inserted[0].Payload)
	if strings.Contains(payload, "secret-token") || strings.Contains(payload, `"secret"`) {
		t.Fatalf("payload was not redacted: %s", payload)
	}
	if !strings.Contains(payload, "[redacted]") {
		t.Fatalf("payload does not contain redaction marker: %s", payload)
	}
}

func TestIngestRejectsUnknownTopLevelFields(t *testing.T) {
	envID := "env-1"
	fake := &fakeStore{key: store.KeyLookup{KeyID: "key-1", EnvironmentID: envID, ProjectID: "project-1"}}
	body := `{
		"environment":"production",
		"service":"frontend",
		"timestamp":"2026-06-17T12:00:00Z",
		"type":"frontend_error",
		"context":{},
		"payload":{},
		"extra":"nope"
	}`
	req := httptest.NewRequest(http.MethodPost, "/ingest/pk_test", strings.NewReader(body))
	rec := httptest.NewRecorder()

	New(fake).Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
	if len(fake.dropped) != 1 || fake.dropped[0].reason != "invalid_schema" {
		t.Fatalf("dropped = %#v, want invalid_schema", fake.dropped)
	}
}

func TestIngestOriginAllowlist(t *testing.T) {
	envID := "env-1"
	validBody := []byte(`{"environment":"production","service":"frontend","timestamp":"2026-06-17T12:00:00Z","type":"frontend_error","context":{},"payload":{}}`)

	t.Run("blocked origin", func(t *testing.T) {
		fake := &fakeStore{key: store.KeyLookup{
			KeyID: "key-1", EnvironmentID: envID, ProjectID: "project-1",
			AllowedOrigins: []string{"https://app.example.com"},
		}}
		req := httptest.NewRequest(http.MethodPost, "/ingest/pk_test", bytes.NewReader(validBody))
		req.Header.Set("Origin", "https://evil.example.com")
		rec := httptest.NewRecorder()

		New(fake).Handler().ServeHTTP(rec, req)

		if rec.Code != http.StatusForbidden {
			t.Fatalf("status = %d, want %d", rec.Code, http.StatusForbidden)
		}
		if len(fake.dropped) != 1 || fake.dropped[0].reason != "blocked_origin" {
			t.Fatalf("dropped = %#v, want blocked_origin", fake.dropped)
		}
	})

	t.Run("empty allowlist allows origin", func(t *testing.T) {
		fake := &fakeStore{key: store.KeyLookup{KeyID: "key-1", EnvironmentID: envID, ProjectID: "project-1"}}
		req := httptest.NewRequest(http.MethodPost, "/ingest/pk_test", bytes.NewReader(validBody))
		req.Header.Set("Origin", "https://any.example.com")
		rec := httptest.NewRecorder()

		New(fake).Handler().ServeHTTP(rec, req)

		if rec.Code != http.StatusNoContent {
			t.Fatalf("status = %d, want %d", rec.Code, http.StatusNoContent)
		}
	})
}

var _ Store = (*fakeStore)(nil)
