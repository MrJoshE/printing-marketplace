package events

import "context"

// Handler is the function your worker logic will implement.
// If it returns nil, the message is Acknowledged (removed from queue).
// If it returns error, the message is Nacked (retried).
type Handler func(ctx context.Context, payload []byte) error

type Subscription struct {
	Unsubscribe func() error
}

type Bus interface {
	Subscribe(subject string, group string, name string, handler Handler) (Subscription, error)
	Close() error
}
