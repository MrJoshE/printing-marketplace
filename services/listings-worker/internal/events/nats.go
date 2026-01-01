package events

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/nats-io/nats.go"
)

type NATSBus struct {
	nats *nats.Conn
	js   nats.JetStreamContext
	log  *slog.Logger
}

func NewNATSBus(addr string, logger *slog.Logger) (Bus, error) {

	opts := []nats.Option{
		// 1. Identification: Makes debugging on the NATS dashboard easier
		nats.Name("listings-worker"),

		// 2. Resilience: NEVER give up trying to reconnect.
		// Default is 60. We set -1 (infinite).
		nats.MaxReconnects(-1),

		// 3. Backoff: Don't spam the server. Wait 3s between attempts.
		nats.ReconnectWait(3 * time.Second),

		// 4. Observability: Log when things go wrong
		nats.DisconnectErrHandler(func(nc *nats.Conn, err error) {
			logger.Warn("NATS disconnected! Buffering messages...", "error", err)
		}),

		nats.ReconnectHandler(func(nc *nats.Conn) {
			logger.Info("NATS reconnected successfully!", "url", nc.ConnectedUrl())
		}),

		// 5. Safety Net: If the connection is permanently dead (e.g. auth failure),
		// kill the app so Docker can restart it with fresh config/state.
		nats.ClosedHandler(func(nc *nats.Conn) {
			logger.Error("NATS connection closed permanently. Exiting process.")
			os.Exit(1)
		}),
	}
	nc, err := nats.Connect(addr, opts...)
	if err != nil {
		return nil, fmt.Errorf("Failed to create nats client: %w", err)
	}

	js, err := nc.JetStream()
	if err != nil {
		return nil, err
	}

	return &NATSBus{
		nats: nc,
		js:   js,
		log:  logger,
	}, nil
}

func (b *NATSBus) Subscribe(subject string, group string, handler Handler) (Subscription, error) {
	b.log.Info("Subscribing to subject", "subject", subject, "queue", group)

	// Configure Subscription Options
	opts := []nats.SubOpt{
		nats.ManualAck(),       // We control the Ack
		nats.AckExplicit(),     // Required for robust systems
		nats.DeliverAll(),      // If we crashed, catch up on what we missed
		nats.MaxAckPending(10), // Flow Control: Don't overwhelm the worker
	}

	sub, err := b.js.QueueSubscribe(subject, group, func(msg *nats.Msg) {
		// Create a fresh context for each message with a timeout
		// This prevents a stuck handler from hanging the connection forever
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		// Execute User Handler
		if err := handler(ctx, msg.Data); err != nil {
			b.log.Error("Handler failed, Nacking message", "subject", subject, "error", err)
			msg.Nak() // Retry the message later
			return
		}

		// Success -> Ack
		if err := msg.Ack(); err != nil {
			b.log.Error("Failed to Ack message", "subject", subject, "error", err)
		}
	}, opts...)

	if err != nil {
		return Subscription{}, fmt.Errorf("Failed to subscribe to subject %s: %w", subject, err)
	}

	return Subscription{
		Unsubscribe: func() error {
			return sub.Unsubscribe()
		},
	}, nil
}

func (b *NATSBus) Close() error {
	b.log.Info("Closing NATS connection")
	return b.nats.Drain()
}
