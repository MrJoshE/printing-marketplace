package events_test

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"testing"

	"indexer/internal/events"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

// --- 1. THE CAPTURING MOCK BUS ---

type MockBus struct {
	mock.Mock
}

func (m *MockBus) Close() error { return nil }

func (m *MockBus) Subscribe(subject, group string, identifier string, handler events.Handler) (events.Subscription, error) {
	// This allows testify to record the call
	args := m.Called(subject, group, handler)
	return args.Get(0).(events.Subscription), args.Error(1)
}

// --- 2. THE TEST SUITE ---

func TestSubscribe_Wiring_CorrectSubjectAndQueue(t *testing.T) {
	// SCENARIO: Verify the Reader connects to the correct config values.

	// Setup
	mockBus := new(MockBus)
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	config := &events.EventConfig{IndexListing: "listing.index"}

	reader := events.NewEventReader(mockBus, config, logger)

	// Expectation: Must use the specific Subject and Queue Group
	mockBus.On("Subscribe", "listing.index", "listings-worker", mock.Anything).
		Return(events.Subscription{}, nil)

	// Execute
	err := reader.SubscribeToIndexListingEvents(func(e events.IndexListingEvent) error { return nil })

	// Assert
	assert.NoError(t, err)
	mockBus.AssertExpectations(t)
}

func TestSubscribe_PoisonPill_AcksBadJSON(t *testing.T) {
	// SCENARIO: NATS delivers malformed JSON (e.g., "{ bad: json").
	// EXPECT: The handler returns nil (Ack) to discard the message.
	// The Service Logic must NOT be called.

	mockBus := new(MockBus)
	reader := events.NewEventReader(mockBus, &events.EventConfig{IndexListing: "subj"}, slog.Default())

	// 1. Capture the NATS Handler
	// We use .Run() to steal the function that Reader passes to Subscribe
	var natsHandler events.Handler

	mockBus.On("Subscribe", mock.Anything, mock.Anything, mock.Anything).
		Run(func(args mock.Arguments) {
			natsHandler = args.Get(2).(events.Handler) // Capture it!
		}).
		Return(events.Subscription{}, nil)

	// 2. Initialize
	serviceCalled := false
	_ = reader.SubscribeToIndexListingEvents(func(e events.IndexListingEvent) error {
		serviceCalled = true
		return nil
	})

	// 3. Simulate NATS delivery of GARBAGE
	// We manually invoke the captured handler
	err := natsHandler(context.Background(), []byte(`{ NOT VALID JSON`))

	// 4. Assert
	assert.NoError(t, err, "Handler MUST return nil (Ack) for bad JSON")
	assert.False(t, serviceCalled, "Service logic must NOT be called for bad JSON")
}

func TestSubscribe_HappyPath_ParsesAndForward(t *testing.T) {
	// SCENARIO: Valid JSON arrives.
	// EXPECT: JSON is parsed into struct and Service Logic is called.

	mockBus := new(MockBus)
	reader := events.NewEventReader(mockBus, &events.EventConfig{IndexListing: "subj"}, slog.Default())

	var natsHandler events.Handler
	mockBus.On("Subscribe", mock.Anything, mock.Anything, mock.Anything).
		Run(func(args mock.Arguments) {
			natsHandler = args.Get(2).(events.Handler)
		}).
		Return(events.Subscription{}, nil)

	// 2. Define Service Logic
	var capturedID string
	serviceLogic := func(e events.IndexListingEvent) error {
		capturedID = e.ListingID
		return nil
	}

	_ = reader.SubscribeToIndexListingEvents(serviceLogic)

	// 3. Simulate NATS delivery of GOOD JSON
	validJSON := []byte(`{"listing_id": "550e8400-e29b-41d4-a716-446655440000"}`)
	err := natsHandler(context.Background(), validJSON)

	// 4. Assert
	assert.NoError(t, err)
	assert.Equal(t, "550e8400-e29b-41d4-a716-446655440000", capturedID)
}

func TestSubscribe_LogicFailure_Nacks(t *testing.T) {
	// SCENARIO: Service Logic fails (e.g. DB down).
	// EXPECT: Handler returns error (Nack) so NATS retries.

	mockBus := new(MockBus)
	reader := events.NewEventReader(mockBus, &events.EventConfig{IndexListing: "subj"}, slog.Default())

	var natsHandler events.Handler
	mockBus.On("Subscribe", mock.Anything, mock.Anything, mock.Anything).
		Run(func(args mock.Arguments) {
			natsHandler = args.Get(2).(events.Handler)
		}).
		Return(events.Subscription{}, nil)

	// 2. Define Service Logic that FAILS
	serviceLogic := func(e events.IndexListingEvent) error {
		return errors.New("db connection lost")
	}

	_ = reader.SubscribeToIndexListingEvents(serviceLogic)

	// 3. Simulate NATS delivery
	err := natsHandler(context.Background(), []byte(`{"listing_id":"123"}`))

	// 4. Assert
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "db connection lost")
}
