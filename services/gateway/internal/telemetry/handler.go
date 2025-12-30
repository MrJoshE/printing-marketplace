package telemetry

import (
	"context"
	"log/slog"

	"go.opentelemetry.io/otel/trace"
)

// TraceHandler wraps a real handler (like JSONHandler) and adds trace info
type TraceHandler struct {
	slog.Handler
}

// NewTraceHandler is a constructor helper
func NewTraceHandler(h slog.Handler) *TraceHandler {
	return &TraceHandler{Handler: h}
}

// Handle overrides the standard Handle method
func (h *TraceHandler) Handle(ctx context.Context, r slog.Record) error {
	// 1. Get the SpanContext from the Go context
	spanContext := trace.SpanContextFromContext(ctx)

	// 2. Check if the span context is valid (i.e., we are actually inside a trace)
	if spanContext.IsValid() {
		// 3. Add trace_id and span_id to the log record
		// We use WithAttrs to create a new record with these attributes
		traceID := slog.String("trace_id", spanContext.TraceID().String())
		spanID := slog.String("span_id", spanContext.SpanID().String())

		r.AddAttrs(traceID, spanID)
	}

	// 4. Pass the modified record to the underlying handler
	return h.Handler.Handle(ctx, r)
}
