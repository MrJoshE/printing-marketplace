package events

import (
	"context"
	"encoding/json"
	"log/slog"
)

type EventReader struct {
	bus    Bus
	config *EventConfig
	logger *slog.Logger
}

func NewEventReader(bus Bus, config *EventConfig, logger *slog.Logger) *EventReader {
	return &EventReader{
		bus:    bus,
		config: config,
		logger: logger,
	}
}

const queue = "listings-worker"

func (r *EventReader) SubscribeToIndexListingEvents(handler func(evt IndexListingEvent) error) error {
	subject := r.config.IndexListing
	r.logger.Info("Subscribing to IndexListing events", "subject", subject)

	_, err := r.bus.Subscribe(subject, queue, func(ctx context.Context, payload []byte) error {
		var evt IndexListingEvent

		if err := json.Unmarshal(payload, &evt); err != nil {
			// Log the error as critical
			r.logger.Error("Discarding malformed JSON event", "subject", subject, "error", err)

			// Return NIL to ACK the message and remove it from the queue.
			// Do NOT return err, or it will loop forever.
			return nil
		}

		// If logic fails (e.g. Typesense down), return error to Retry
		return handler(evt)
	})

	return err
}
