package testutil

import (
	"gateway/internal/telemetry"
	"log/slog"
	"os"
	"testing"

	"github.com/pashagolub/pgxmock/v4"
	"github.com/stretchr/testify/require"
)

// NewMockDB creates a pgxmock pool and automatically handles cleanup via t.Cleanup
func NewMockDB(t *testing.T) pgxmock.PgxPoolIface {
	t.Helper() // Marks this function as a helper for stack traces
	mockPool, err := pgxmock.NewPool()
	require.NoError(t, err)

	// t.Cleanup is superior to defer because it works even if you call this from another helper function
	t.Cleanup(func() {
		mockPool.Close()
	})

	return mockPool
}

// NewTestLogger creates a standardized logger for tests
func NewTestLogger() *slog.Logger {
	// You might want io.Discard here if you want silent tests,
	// or os.Stdout if you want to see logs during -v
	baseHandler := slog.NewJSONHandler(os.Stdout, nil)
	return slog.New(telemetry.NewTraceHandler(baseHandler))
}
