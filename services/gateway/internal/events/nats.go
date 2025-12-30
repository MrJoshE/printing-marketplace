package events

import (
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/nats-io/nats.go"
)

var _ Bus = NATSBus{}

type NATSBus struct {
	nats *nats.Conn
	js   nats.JetStreamContext
	log  *slog.Logger
}

func NewNATSBus(addr string, logger *slog.Logger) (*NATSBus, error) {

	opts := []nats.Option{
		// 1. Identification: Makes debugging on the NATS dashboard easier
		nats.Name("gateway-service"),

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

func (b NATSBus) Publish(subject string, data []byte, msgId string) error {
	b.log.Info("Publishing event", "subject", subject, "data_size", len(data))

	_, err := b.js.Publish(subject, data, nats.MsgId(msgId))
	return err
}

func (b NATSBus) Drain() error {
	b.log.Info("Draining events")
	return b.nats.Drain()
}

func (b NATSBus) Close() {
	b.log.Info("Closing NATS connection")
	b.nats.Close()
}
