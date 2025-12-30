package idempotency

import (
	"bytes"
	"context"
	"gateway/internal/errors"
	"log/slog"
	"net/http"
	"time"
)

type IdempotencyStore interface {
	Lock(ctx context.Context, key string) (bool, error)
	GetResponse(ctx context.Context, key string) (*IdempotencyResponse, bool, error)
	SaveResponse(ctx context.Context, key string, resp IdempotencyResponse) error
	Delete(ctx context.Context, key string) error
}

type IdempotencyResponse struct {
	StatusCode int                 `json:"status_code"`
	Headers    map[string][]string `json:"headers"`
	Body       []byte              `json:"body"`
}

var ignoredHeaders = map[string]bool{
	"Access-Control-Allow-Origin":      true,
	"Access-Control-Allow-Methods":     true,
	"Access-Control-Allow-Headers":     true,
	"Access-Control-Allow-Credentials": true,
	"Access-Control-Expose-Headers":    true,
	"Date":                             true,
	"Content-Length":                   true,
	"Connection":                       true,
}

func Idempotency(store IdempotencyStore) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := r.Context()

			// A. Check for the Header
			key := r.Header.Get("Idempotency-Key")
			if key == "" {
				next.ServeHTTP(w, r)
				return
			}

			// A. TRY TO LOCK (Atomic SETNX)
			// This prevents the Race Condition. Only one request passes this line.
			acquired, err := store.Lock(ctx, key)
			if err != nil {
				// Fail Closed for safety
				errors.RespondError(w, r, errors.New(errors.ErrInternal, "Idempotency Service Unavailable", err))
				return
			}

			// B. LOCK FAILED? (Key exists)
			if !acquired {
				// Check if we have a finished response or if it's still processing
				cachedResp, found, err := store.GetResponse(ctx, key)
				if err != nil {
					// Redis error
					errors.RespondError(w, r, errors.New(errors.ErrInternal, "Internal Cache Error", err))
					return
				}

				if found && cachedResp != nil {
					// SUCCESS: We have a saved response. Replay it.
					for k, v := range cachedResp.Headers {
						if ignoredHeaders[k] {
							continue
						}
						for _, val := range v {
							w.Header().Add(k, val)
						}
					}
					w.Header().Set("X-Idempotency-Hit", "true")
					w.WriteHeader(cachedResp.StatusCode)
					w.Write(cachedResp.Body)
					return
				}

				// FAILURE: Key exists but no response yet = "Processing"
				// This implies a concurrent request is running right now.
				w.Header().Set("Retry-After", "1")
				errors.RespondError(w, r, errors.New(errors.ErrConflict, "Request is currently being processed", nil))
				return
			}

			// C. LOCK ACQUIRED: We are the chosen one. Execute Logic.
			recorder := &responseRecorder{
				ResponseWriter: w,
				statusCode:     http.StatusOK,
				body:           &bytes.Buffer{},
			}

			// Run the actual handler
			next.ServeHTTP(recorder, r)

			/// 1. Server Error (5xx) -> ROLLBACK
			if recorder.statusCode >= 500 || recorder.statusCode == http.StatusTooManyRequests {
				slog.WarnContext(ctx, "Idempotency: Server error detected, deleting lock", "key", key)
				_ = store.Delete(context.Background(), key)
				return
			}
			// 2. Success/Client Error -> SAVE PERMANENTLY
			// Use detached context for saving
			go func(k string, status int, headers http.Header, body []byte) {
				saveCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer cancel()

				cleanHeaders := make(http.Header)
				for k, v := range headers {
					if !ignoredHeaders[k] {
						cleanHeaders[k] = v
					}
				}

				resp := IdempotencyResponse{
					StatusCode: status,
					Headers:    cleanHeaders,
					Body:       body,
				}

				// This Overwrites the "PROCESSING" lock with the real data
				if err := store.SaveResponse(saveCtx, k, resp); err != nil {
					slog.ErrorContext(saveCtx, "Failed to save idempotency response", "error", err)
				}
			}(key, recorder.statusCode, recorder.Header(), recorder.body.Bytes())
		})
	}
}

// This hooks into the response stream to copy the data as it goes out.
type responseRecorder struct {
	http.ResponseWriter
	statusCode int
	body       *bytes.Buffer
}

// Intercept WriteHeader to capture the status code
func (r *responseRecorder) WriteHeader(code int) {
	r.statusCode = code
	r.ResponseWriter.WriteHeader(code)
}

// Intercept Write to capture the body data
func (r *responseRecorder) Write(b []byte) (int, error) {
	// Write to our buffer
	r.body.Write(b)
	// Write to the actual client
	return r.ResponseWriter.Write(b)
}
