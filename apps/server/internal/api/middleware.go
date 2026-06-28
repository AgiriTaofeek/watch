package api

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"net/http"
	"runtime/debug"
	"time"
)

// ctxKey is an unexported context-key type, so keys defined here can't collide
// with keys from other packages.
type ctxKey int

const (
	requestIDKey ctxKey = iota // 0
	sessionKey                 // 1
	userKey                    // 2
	loggerKey                  // 3
)

// responseRecorder wraps http.ResponseWriter to capture the status code and
// byte count for the access log. A handler that never calls WriteHeader
// implicitly sends 200, which we record on first Write.
type responseRecorder struct {
	http.ResponseWriter
	status int
	bytes  int
}

func (r *responseRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

func (r *responseRecorder) Write(b []byte) (int, error) {
	if r.status == 0 {
		r.status = http.StatusOK
	}
	n, err := r.ResponseWriter.Write(b)
	r.bytes += n
	return n, err
}

// Flush forwards to the underlying ResponseWriter so SSE and streaming
// handlers work correctly through the logging middleware wrapper.
func (r *responseRecorder) Flush() {
	http.NewResponseController(r.ResponseWriter).Flush() //nolint:errcheck
}

// requestID assigns each request a short random id, stores it in context,
// echoes it on the response via X-Request-Id, and derives a request-scoped
// slog.Logger that carries the id automatically on every log call.
func requestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := newRequestID()
		w.Header().Set("X-Request-Id", id)
		logger := slog.Default().With("request_id", id)
		ctx := context.WithValue(r.Context(), requestIDKey, id)
		ctx = context.WithValue(ctx, loggerKey, logger)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// requestLogger emits one structured line per request when it completes,
// capturing status, size, and latency.
func requestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &responseRecorder{ResponseWriter: w}
		defer func() {
			LoggerFromContext(r.Context()).LogAttrs(r.Context(), slog.LevelInfo, "http request",
				slog.String("method", r.Method),
				slog.String("path", r.URL.Path),
				slog.Int("status", rec.status),
				slog.Int("bytes", rec.bytes),
				slog.Int64("duration_ms", time.Since(start).Milliseconds()),
			)
		}()
		next.ServeHTTP(rec, r)
	})
}

// recoverer turns a panic in any downstream handler into a logged 500 instead
// of crashing the process or leaking the goroutine.
func recoverer(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				LoggerFromContext(r.Context()).ErrorContext(r.Context(), "panic recovered",
					"error", rec,
					"stack", string(debug.Stack()),
				)
				writeError(w, http.StatusInternalServerError, "internal server error")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

func newRequestID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b) // crypto/rand.Read never returns an error on supported platforms
	return hex.EncodeToString(b)
}

// RequestIDFromContext returns the request id set by the requestID middleware,
// or "" if absent.
func RequestIDFromContext(ctx context.Context) string {
	id, _ := ctx.Value(requestIDKey).(string)
	return id
}

// LoggerFromContext returns the request-scoped logger stored by the requestID
// middleware. Falls back to the default slog logger if none is present.
func LoggerFromContext(ctx context.Context) *slog.Logger {
	if l, ok := ctx.Value(loggerKey).(*slog.Logger); ok {
		return l
	}
	return slog.Default()
}
