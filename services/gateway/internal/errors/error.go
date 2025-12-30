package errors

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"runtime/debug"

	"github.com/go-chi/chi/v5/middleware"
)

// ErrorCode enum for machine-readable errors
type ErrorCode string

const (
	ErrInvalidInput ErrorCode = "INVALID_INPUT"
	ErrConflict     ErrorCode = "CONFLICT" // e.g. Duplicate listing
	ErrInternal     ErrorCode = "INTERNAL" // DB died, NATS down
	ErrNotFound     ErrorCode = "NOT_FOUND"
	ErrUnauthorized ErrorCode = "UNAUTHORIZED"
)

// AppError carries the "User View" and the "System View"
type AppError struct {
	Code     ErrorCode // Machine code (for frontend logic)
	Message  string    // Safe user-facing message
	Internal error     // Original error (DB error, etc) - NEVER show to user
	Stack    string    // Stack trace for audit
}

// Implement the standard error interface
func (e *AppError) Error() string {
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

// New factory to capture stack trace automatically
func New(code ErrorCode, msg string, internal error) *AppError {
	return &AppError{
		Code:     code,
		Message:  msg,
		Internal: internal,
		Stack:    string(debug.Stack()), // Captures the exact line where error occurred
	}
}

func RespondError(w http.ResponseWriter, r *http.Request, err error) {
	reqID := middleware.GetReqID(r.Context())

	// 1. Unwrap the AppError
	var appErr *AppError
	if customErr, ok := err.(*AppError); ok {
		appErr = customErr
	} else {
		// If it's a generic Go error (e.g. from a library), wrap it as Internal
		appErr = New(ErrInternal, "Unexpected system error", err)
	}

	// 2. Map Error Code -> HTTP Status
	status := http.StatusInternalServerError
	switch appErr.Code {
	case ErrInvalidInput:
		status = http.StatusBadRequest
	case ErrConflict:
		status = http.StatusConflict
	case ErrUnauthorized:
		status = http.StatusUnauthorized
	case ErrNotFound:
		status = http.StatusNotFound
	}

	// 3. LOGGING (Audit Strategy)
	// We use the same rigorous logging for every service.
	logFields := []any{
		"req_id", reqID,
		"method", r.Method,
		"path", r.URL.Path,
		"code", appErr.Code,
		"user_msg", appErr.Message,
	}

	if status == http.StatusInternalServerError {
		// For 500s: Log EVERYTHING (Internal error + Stack trace)
		logFields = append(logFields, "internal_err", appErr.Internal, "stack", appErr.Stack)
		slog.Error("Internal Server Error", logFields...)
	} else {
		// For 4xx: Log as INFO/WARN. (No stack trace needed usually)
		if appErr.Internal != nil {
			logFields = append(logFields, "internal_details", appErr.Internal)
		}
		slog.Warn("Request Failed", logFields...)
	}

	// 4. JSON Response
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{
		"error_code": string(appErr.Code),
		"message":    appErr.Message,
		"request_id": reqID, // Helpful for support tickets
	})
}

// RespondJSON is a handy helper for success cases too
func RespondJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(payload)
}
